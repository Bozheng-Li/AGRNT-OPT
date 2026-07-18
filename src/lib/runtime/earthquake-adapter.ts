import { access, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

const PACKAGE_NAME = "@cyanheads/earthquake-mcp-server";
const PACKAGE_VERSION = "0.1.16";
const USGS_ORIGIN = "https://earthquake.usgs.gov";
const EMSC_ORIGIN = "https://www.seismicportal.eu";
export const EARTHQUAKE_SEARCH_LIMIT = 100;
export const EARTHQUAKE_RESULT_LIMIT = 1_500_000;

const magnitudeTiers = ["all", "1.0", "2.5", "4.5", "significant"] as const;
const timeWindows = ["hour", "day", "week", "month"] as const;
const publicFeedWindows: Record<(typeof magnitudeTiers)[number], readonly (typeof timeWindows)[number][]> = {
  all: ["hour", "day"],
  "1.0": ["hour", "day"],
  "2.5": ["hour", "day", "week"],
  "4.5": timeWindows,
  significant: timeWindows,
};
export const EARTHQUAKE_PUBLIC_FEED_URIS = magnitudeTiers.flatMap((tier) =>
  publicFeedWindows[tier].map((window) => `earthquake://feed/${tier}/${window}`),
);
const sources = ["usgs", "emsc"] as const;
const orderings = ["time", "time-asc", "magnitude", "magnitude-asc"] as const;
const alertLevels = ["green", "yellow", "orange", "red"] as const;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

type EarthquakeContext = AdapterContext & { earthquakeRoot?: string };
type FilterValues = {
  start_time?: string;
  end_time?: string;
  min_magnitude?: number;
  max_magnitude?: number;
  latitude?: number;
  longitude?: number;
  radius_km?: number;
  min_depth_km?: number;
  max_depth_km?: number;
  alert_level?: (typeof alertLevels)[number];
  min_felt?: number;
  min_significance?: number;
  source: (typeof sources)[number];
};

function validDateOnly(value: string): boolean {
  if (!dateOnlyPattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function timeValue(value: string): number {
  return dateOnlyPattern.test(value) ? Date.parse(`${value}T00:00:00.000Z`) : Date.parse(value);
}

const timeInput = z
  .string()
  .trim()
  .min(10)
  .max(50)
  .refine((value) => validDateOnly(value) || timestampPattern.test(value), "时间必须是有效的 YYYY-MM-DD 或带时区的 ISO 8601 时间。")
  .refine((value) => Number.isFinite(timeValue(value)), "时间无法解析。")
  .refine((value) => timeValue(value) >= Date.UTC(1900, 0, 1), "时间不得早于 1900-01-01。")
  .refine((value) => timeValue(value) <= Date.now() + 86_400_000, "时间不得晚于当前日期。")
  .transform((value) => dateOnlyPattern.test(value) ? value : new Date(value).toISOString());

const filterShape = {
  start_time: timeInput.optional(),
  end_time: timeInput.optional(),
  min_magnitude: z.number().finite().min(-1).max(10).optional(),
  max_magnitude: z.number().finite().min(-1).max(10).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  radius_km: z.number().finite().min(1).max(5_000).optional(),
  min_depth_km: z.number().finite().min(-10).max(1_000).optional(),
  max_depth_km: z.number().finite().min(-10).max(1_000).optional(),
  alert_level: z.enum(alertLevels).optional(),
  min_felt: z.number().int().min(1).max(1_000_000).optional(),
  min_significance: z.number().int().min(0).max(5_000).optional(),
  source: z.enum(sources).default("usgs"),
};

function validateFilterRelationships(value: FilterValues, context: z.RefinementCtx, maximumSpanDays: number): void {
  if (Boolean(value.start_time) !== Boolean(value.end_time)) {
    context.addIssue({ code: "custom", path: value.start_time ? ["end_time"] : ["start_time"], message: "开始和结束时间必须成对提供。" });
  }
  if (value.start_time && value.end_time) {
    const start = timeValue(value.start_time);
    const end = timeValue(value.end_time);
    if (start > end) context.addIssue({ code: "custom", path: ["end_time"], message: "结束时间不得早于开始时间。" });
    if (end - start > maximumSpanDays * 86_400_000) {
      context.addIssue({ code: "custom", path: ["end_time"], message: `时间跨度不得超过 ${maximumSpanDays} 天。` });
    }
  }
  const location = [value.latitude !== undefined, value.longitude !== undefined, value.radius_km !== undefined];
  if (location.some(Boolean) && !location.every(Boolean)) {
    context.addIssue({ code: "custom", path: ["radius_km"], message: "半径搜索必须同时提供 latitude、longitude 和 radius_km。" });
  }
  if (value.min_magnitude !== undefined && value.max_magnitude !== undefined && value.min_magnitude > value.max_magnitude) {
    context.addIssue({ code: "custom", path: ["max_magnitude"], message: "最大震级不得小于最小震级。" });
  }
  if (value.min_depth_km !== undefined && value.max_depth_km !== undefined && value.min_depth_km > value.max_depth_km) {
    context.addIssue({ code: "custom", path: ["max_depth_km"], message: "最大深度不得小于最小深度。" });
  }
  if (value.source === "emsc" && (value.alert_level !== undefined || value.min_felt !== undefined || value.min_significance !== undefined)) {
    context.addIssue({ code: "custom", path: ["source"], message: "EMSC 不支持 PAGER、DYFI 或 significance 过滤器。" });
  }
}

const searchInput = z
  .object({
    ...filterShape,
    limit: z.number().int().min(1).max(EARTHQUAKE_SEARCH_LIMIT).default(25),
    order_by: z.enum(orderings).default("time"),
  })
  .strict()
  .superRefine((value, context) => validateFilterRelationships(value, context, 366));

const countInput = z
  .object(filterShape)
  .strict()
  .superRefine((value, context) => validateFilterRelationships(value, context, 3_660));

const eventId = z
  .string()
  .trim()
  .min(4)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "USGS event ID 只允许字母、数字、下划线和连字符。")
  .refine((value) => !value.includes("..") && !value.includes("//"), "USGS event ID 格式无效。");

const inputSchemas = {
  earthquake_get_feed: z.object({
    magnitude_tier: z.enum(magnitudeTiers).default("2.5"),
    time_window: z.enum(timeWindows).default("day"),
  }).strict().superRefine((value, context) => {
    if (!publicFeedWindows[value.magnitude_tier].includes(value.time_window)) {
      context.addIssue({
        code: "custom",
        path: ["time_window"],
        message: "该低震级长时间窗口可能超过公共 Web 的响应上限，请改用更短窗口或更高震级。",
      });
    }
  }),
  earthquake_search: searchInput,
  earthquake_get_event: z.object({ event_id: eventId }).strict(),
  earthquake_count: countInput,
} satisfies Record<string, z.ZodType>;

const outputTime = z.string().min(10).max(80).refine((value) => Number.isFinite(Date.parse(value)), "上游时间字段无效。");
const fixedUsgsUrl = z.string().url().max(1_000).refine((value) => {
  try { return new URL(value).origin === USGS_ORIGIN; } catch { return false; }
}, "上游 URL 不属于固定 USGS origin。");
const eventOutput = z.object({
  id: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
  title: z.string().max(4_000),
  magnitude: z.number().finite().min(-2).max(12).nullable(),
  magnitude_type: z.string().max(80),
  time: outputTime,
  updated: outputTime,
  place: z.string().max(4_000),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  depth_km: z.number().finite().min(-20).max(1_500).nullable(),
  felt: z.number().finite().nonnegative().nullable(),
  cdi: z.number().finite().min(0).max(20).nullable(),
  mmi: z.number().finite().min(0).max(20).nullable(),
  alert: z.enum(alertLevels).nullable(),
  tsunami: z.number().int().min(0).max(1),
  significance: z.number().finite().nonnegative().nullable(),
  status: z.enum(["automatic", "reviewed", "deleted"]),
  event_url: fixedUsgsUrl.optional(),
  detail_url: fixedUsgsUrl.optional(),
}).strict();

const queryEcho = z.object({
  start_time: z.string().max(80).optional(),
  end_time: z.string().max(80).optional(),
  min_magnitude: z.number().optional(),
  max_magnitude: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  radius_km: z.number().optional(),
  min_depth_km: z.number().optional(),
  max_depth_km: z.number().optional(),
  alert_level: z.enum(alertLevels).optional(),
  min_felt: z.number().optional(),
  min_significance: z.number().optional(),
  source: z.enum(sources),
  limit: z.number().int().min(1).max(EARTHQUAKE_SEARCH_LIMIT),
  order_by: z.enum(orderings),
}).passthrough();

const outputSchemas = {
  earthquake_get_feed: z.object({
    count: z.number().int().nonnegative().max(100_000),
    generated_at: outputTime,
    events: z.array(eventOutput).max(2_000),
    feed_url: fixedUsgsUrl.refine((value) => /^https:\/\/earthquake\.usgs\.gov\/earthquakes\/feed\/v1\.0\/summary\//.test(value)),
    notice: z.string().max(10_000).optional(),
  }).strict(),
  earthquake_search: z.object({
    count: z.number().int().nonnegative().max(EARTHQUAKE_SEARCH_LIMIT),
    source: z.enum(sources),
    events: z.array(eventOutput).max(EARTHQUAKE_SEARCH_LIMIT),
    totalCount: z.number().int().nonnegative().max(10_000_000).optional(),
    truncated: z.boolean().optional(),
    notice: z.string().max(10_000).optional(),
    queryEcho: queryEcho.optional(),
  }).passthrough(),
  earthquake_get_event: z.object({ event: eventOutput }).strict(),
  earthquake_count: z.object({
    count: z.number().int().nonnegative().max(100_000_000),
    max_allowed: z.number().int().positive().max(100_000).nullable(),
    source: z.enum(sources),
    exceeds_limit: z.boolean(),
  }).strict(),
} satisfies Record<string, z.ZodType>;

function parseInput(tool: string, input: unknown): Record<string, unknown> {
  const schema = inputSchemas[tool as keyof typeof inputSchemas];
  if (!schema) throw new InvocationValidationError(`Earthquake Web 适配未开放工具：${tool}`);
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new InvocationValidationError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；"));
  }
  return parsed.data as Record<string, unknown>;
}

function inspectBoundedJson(value: unknown): void {
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 40_000 || depth > 16) throw new InvocationValidationError("Earthquake 结果结构超过安全上限。");
    if (typeof item === "string" && item.length > 250_000) throw new InvocationValidationError("Earthquake 单个文本字段超过安全上限。");
    if (Array.isArray(item)) {
      if (item.length > 2_000) throw new InvocationValidationError("Earthquake 结果数组超过安全上限。");
      item.forEach((entry) => visit(entry, depth + 1));
    } else if (item && typeof item === "object") {
      Object.values(item as Record<string, unknown>).forEach((entry) => visit(entry, depth + 1));
    }
  };
  visit(value, 0);
}

async function requireRealDirectory(target: string, label: string): Promise<void> {
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new InvocationValidationError(`${label}不能是符号链接、目录联接或其他重定向目录。`);
  }
}

function defaultRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "earthquake");
}

function packageRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "@cyanheads", "earthquake-mcp-server");
}

function bootstrap(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "earthquake-mcp-entry.mjs");
}

async function ensureSandbox(root: string): Promise<{ root: string; temporary: string; logs: string }> {
  const resolved = path.resolve(root);
  const temporary = path.join(resolved, "tmp");
  const logs = path.join(resolved, "logs");
  await Promise.all([mkdir(resolved, { recursive: true }), mkdir(temporary, { recursive: true }), mkdir(logs, { recursive: true })]);
  await Promise.all([
    requireRealDirectory(resolved, "Earthquake 运行目录"),
    requireRealDirectory(temporary, "Earthquake 临时目录"),
    requireRealDirectory(logs, "Earthquake 日志目录"),
  ]);
  return { root: resolved, temporary, logs };
}

function successSummary(tool: string, payload: Record<string, unknown>): string {
  if (tool === "earthquake_get_feed") return `USGS 实时源返回 ${String(payload.count ?? 0)} 条地震事件。`;
  if (tool === "earthquake_search") return `${String(payload.source ?? "USGS").toUpperCase()} 检索返回 ${String(payload.count ?? 0)} 条地震事件。`;
  if (tool === "earthquake_count") return `${String(payload.source ?? "USGS").toUpperCase()} 计数为 ${String(payload.count ?? 0)}。`;
  const event = payload.event as Record<string, unknown> | undefined;
  return `USGS 返回事件 ${String(event?.id ?? "unknown")}：${String(event?.title ?? "地震详情")}。`;
}

export const earthquakeAdapter: PluginAdapter = {
  slug: "earthquake-situation-lab",
  allowedTools: Object.keys(inputSchemas),
  allowedResourceTemplates: ["earthquake-feed", "earthquake-event"],
  requestTimeoutMs(tool) {
    if (tool === "earthquake_search") return 45_000;
    return 30_000;
  },
  async validateAndTransform(tool, input) {
    return parseInput(tool, input);
  },
  async validateResourceUri(uri) {
    if (typeof uri !== "string" || uri.length > 120) throw new InvocationValidationError("Earthquake 资源 URI 无效。");
    if (EARTHQUAKE_PUBLIC_FEED_URIS.includes(uri)) return uri;
    const eventMatch = uri.match(/^earthquake:\/\/event\/([A-Za-z0-9_-]{4,64})$/);
    if (eventMatch) return `earthquake://event/${eventMatch[1]}`;
    throw new InvocationValidationError("Earthquake 资源只接受固定 feed 或 USGS event URI。");
  },
  async prepare(context) {
    if (Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) < 24) {
      throw new InvocationValidationError("Earthquake MCP 0.1.16 需要 Node.js 24 或更高版本。");
    }
    const pkg = packageRoot();
    const entry = bootstrap();
    try {
      await Promise.all([access(path.join(pkg, "dist", "index.js")), access(entry)]);
      const metadata = JSON.parse(await readFile(path.join(pkg, "package.json"), "utf8")) as { name?: unknown; version?: unknown };
      if (metadata.name !== PACKAGE_NAME || metadata.version !== PACKAGE_VERSION) throw new Error("version mismatch");
    } catch {
      throw new InvocationValidationError("Earthquake MCP 必须按 lockfile 安装精确版本 @cyanheads/earthquake-mcp-server@0.1.16。");
    }
    const sandbox = await ensureSandbox((context as EarthquakeContext).earthquakeRoot ?? defaultRoot());
    return {
      command: process.execPath,
      args: ["--max-old-space-size=256", entry],
      cwd: sandbox.root,
      env: {
        HOME: sandbox.root,
        USERPROFILE: sandbox.root,
        TEMP: sandbox.temporary,
        TMP: sandbox.temporary,
        TMPDIR: sandbox.temporary,
        LOGS_DIR: sandbox.logs,
        MCP_TRANSPORT_TYPE: "stdio",
        MCP_LOG_LEVEL: "emerg",
        STORAGE_PROVIDER_TYPE: "in-memory",
        IS_SERVERLESS: "true",
        OTEL_ENABLED: "false",
        USGS_BASE_URL: USGS_ORIGIN,
        EMSC_BASE_URL: EMSC_ORIGIN,
        DEFAULT_LIMIT: "25",
        REQUEST_TIMEOUT_MS: "15000",
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        ALL_PROXY: "",
        NO_PROXY: "",
        http_proxy: "",
        https_proxy: "",
        all_proxy: "",
        no_proxy: "",
        NODE_USE_ENV_PROXY: "0",
        NODE_OPTIONS: "",
        NO_COLOR: "1",
        NODE_ENV: "production",
      },
    };
  },
  async normalizeResult(tool, result: AdapterToolResult) {
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > EARTHQUAKE_RESULT_LIMIT) {
      throw new InvocationValidationError("Earthquake MCP 返回结果超过 1.5 MiB 安全上限。");
    }
    if (result.isError) {
      inspectBoundedJson(result.structuredContent);
      const block = result.content.find((item): item is { type: "text"; text: string } =>
        Boolean(item && typeof item === "object" && (item as { type?: unknown }).type === "text" && typeof (item as { text?: unknown }).text === "string"));
      const text = (block?.text.trim() || "Earthquake 上游返回了受控错误。").slice(0, 32_000);
      return {
        content: [{ type: "text", text }],
        ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
        isError: true,
      };
    }
    if (!result.structuredContent || typeof result.structuredContent !== "object" || Array.isArray(result.structuredContent)) {
      throw new InvocationValidationError("Earthquake MCP 返回结果缺少结构化内容。");
    }
    inspectBoundedJson(result.structuredContent);
    const schema = outputSchemas[tool as keyof typeof outputSchemas];
    const parsed = schema?.safeParse(result.structuredContent);
    if (!parsed?.success) {
      throw new InvocationValidationError("Earthquake MCP 返回结果不符合固定 0.1.16 协议结构。");
    }
    const structuredContent = parsed.data as Record<string, unknown>;
    const normalized = {
      content: [{ type: "text", text: successSummary(tool, structuredContent) }],
      structuredContent,
      isError: false,
    };
    if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > EARTHQUAKE_RESULT_LIMIT) {
      throw new InvocationValidationError("Earthquake MCP 规范化结果超过 1.5 MiB 安全上限。");
    }
    return normalized;
  },
};

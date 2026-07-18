import { access, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

type AstronomyContext = AdapterContext & { astronomyRoot?: string };

const RESULT_LIMIT = 2 * 1024 * 1024;
const bodies = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"] as const;
const body = z.enum(bodies);
const latitude = z.number().finite().min(-90).max(90);
const longitude = z.number().finite().min(-180).max(180);
const elevation = z.number().finite().min(-500).max(10_000).default(0);
const instant = z.string().trim().datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value)), "时间必须是有效 ISO 8601 瞬时。");
const timezone = z.string().trim().min(3).max(80).regex(/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/, "时区必须是 IANA 名称。").refine((value) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
}, "未知 IANA 时区。");
const observer = { latitude, longitude, elevation, timezone: timezone.optional() };
const star = z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9 +'.-]*$/, "恒星名称格式无效。");

const eventInput = z.object({
  event: z.enum(["solar_eclipse", "lunar_eclipse", "equinox", "solstice", "moon_quarter", "opposition", "conjunction", "max_elongation", "perigee_apogee"]),
  start: instant.optional(),
  count: z.number().int().min(1).max(5).default(1),
  body: body.optional(),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  elevation,
  timezone: timezone.optional(),
}).strict().superRefine((value, context) => {
  if (["opposition", "conjunction", "max_elongation", "perigee_apogee"].includes(value.event) && !value.body) {
    context.addIssue({ code: "custom", path: ["body"], message: "该事件需要目标天体。" });
  }
  if (["solar_eclipse", "lunar_eclipse"].includes(value.event) && (value.latitude === undefined || value.longitude === undefined)) {
    context.addIssue({ code: "custom", path: ["latitude"], message: "食事件需要观测坐标。" });
  }
  if (value.event === "max_elongation" && value.body && !["mercury", "venus"].includes(value.body)) {
    context.addIssue({ code: "custom", path: ["body"], message: "最大距角只支持 mercury 或 venus。" });
  }
});

const inputSchemas = {
  astronomy_get_sky_position: z.object({
    body: body.optional(),
    star: star.optional(),
    ...observer,
    time: instant.optional(),
  }).strict().refine((value) => Boolean(value.body) !== Boolean(value.star), "body 与 star 必须且只能提供一个。"),
  astronomy_get_rise_set: z.object({
    body,
    ...observer,
    start: instant.optional(),
    count: z.number().int().min(1).max(7).default(1),
  }).strict(),
  astronomy_get_moon_phase: z.object({ time: instant.optional(), timezone: timezone.optional() }).strict(),
  astronomy_find_events: eventInput,
  astronomy_list_visible: z.object({
    ...observer,
    time: instant.optional(),
    min_altitude: z.number().finite().min(-10).max(90).default(0),
    include_stars: z.boolean().default(false),
  }).strict(),
} satisfies Record<string, z.ZodType>;

const resourceUris = new Set(bodies.map((item) => `astronomy://body/${item}`));
const promptSchema = z.object({
  location: z.string().trim().min(1).max(120).refine((value) => !/[<>\u0000-\u001f\u007f]/.test(value), "地点不能包含标签或控制字符。"),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

function parseInput(tool: string, input: unknown): Record<string, unknown> {
  const schema = inputSchemas[tool as keyof typeof inputSchemas];
  if (!schema) throw new InvocationValidationError(`Astronomy Web 适配未开放工具：${tool}`);
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) throw new InvocationValidationError(parsed.error.issues.map((issue) => `${issue.path.join('.') || '参数'}: ${issue.message}`).join('；'));
  return parsed.data as Record<string, unknown>;
}

function inspect(value: unknown): void {
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 30_000 || depth > 16) throw new InvocationValidationError("Astronomy 结果结构超过安全上限。");
    if (typeof item === "string" && item.length > 100_000) throw new InvocationValidationError("Astronomy 文本字段超过安全上限。");
    if (Array.isArray(item)) { if (item.length > 1_000) throw new InvocationValidationError("Astronomy 数组超过安全上限。"); item.forEach((entry) => visit(entry, depth + 1)); }
    else if (item && typeof item === "object") Object.values(item as Record<string, unknown>).forEach((entry) => visit(entry, depth + 1));
  };
  visit(value, 0);
}

async function sandbox(root: string): Promise<string> {
  const resolved = path.resolve(root);
  await mkdir(resolved, { recursive: true });
  const info = await lstat(resolved);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new InvocationValidationError("Astronomy 运行目录不能是符号链接或目录联接。");
  return resolved;
}

function defaultRoot(): string { return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "astronomy"); }
function packageRoot(): string { return path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "@cyanheads", "astronomy-mcp-server"); }
function bootstrap(): string { return path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "astronomy-mcp-entry.mjs"); }

function summary(tool: string, payload: Record<string, unknown>): string {
  if (tool === "astronomy_get_sky_position") return `${String(payload.body)} 高度 ${String((payload.horizontal as Record<string, unknown>)?.altitude_degrees ?? "-")}°。`;
  if (tool === "astronomy_get_rise_set") return `返回 ${String((payload.events as unknown[])?.length ?? 0)} 个升落周期。`;
  if (tool === "astronomy_get_moon_phase") return `月相：${String(payload.phase_name ?? "-")}。`;
  if (tool === "astronomy_find_events") return `返回 ${String((payload.events as unknown[])?.length ?? 0)} 个天象事件。`;
  return `返回 ${String(payload.total_count ?? 0)} 个可见天体。`;
}

export const astronomyAdapter: PluginAdapter = {
  slug: "astronomy-observation-console",
  allowedTools: Object.keys(inputSchemas),
  allowedResourceTemplates: ["astronomy-body-reference"],
  allowedPrompts: ["astronomy_stargazing_plan"],
  requestTimeoutMs() { return 30_000; },
  persistentSession: {
    key(context) { return path.resolve((context as AstronomyContext).astronomyRoot ?? defaultRoot()); },
    idleMs: 20_000,
  },
  async validateAndTransform(tool, input) { return parseInput(tool, input); },
  async validateResourceUri(uri) {
    if (typeof uri !== "string" || !resourceUris.has(uri)) throw new InvocationValidationError("Astronomy 天体资源 URI 不在固定索引中。");
    return uri;
  },
  async validatePromptAndTransform(prompt, input) {
    if (prompt !== "astronomy_stargazing_plan") throw new InvocationValidationError(`Astronomy Web 适配未开放提示：${prompt}`);
    const parsed = promptSchema.safeParse(input ?? {});
    if (!parsed.success) throw new InvocationValidationError(parsed.error.issues.map((issue) => `${issue.path.join('.') || '参数'}: ${issue.message}`).join('；'));
    return parsed.data;
  },
  async prepare(rawContext) {
    if (Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10) < 24) throw new InvocationValidationError("Astronomy MCP 0.1.3 需要 Node.js 24 或更新版本。");
    const context = rawContext as AstronomyContext;
    const root = await sandbox(context.astronomyRoot ?? defaultRoot());
    const pkg = packageRoot();
    const entry = bootstrap();
    try {
      await Promise.all([access(path.join(pkg, "dist", "index.js")), access(entry)]);
      const metadata = JSON.parse(await readFile(path.join(pkg, "package.json"), "utf8")) as { version?: unknown };
      if (metadata.version !== "0.1.3") throw new Error("version mismatch");
    } catch {
      throw new InvocationValidationError("Astronomy MCP 0.1.3 尚未按固定 lockfile 安装。");
    }
    return {
      command: process.execPath,
      args: ["--max-old-space-size=192", entry],
      cwd: root,
      env: { MCP_TRANSPORT_TYPE: "stdio", MCP_LOG_LEVEL: "emerg", ASTRONOMY_ENABLE_HORIZONS: "false", ASTRONOMY_ENABLE_SATELLITES: "false", NO_COLOR: "1", NODE_ENV: "production" },
    };
  },
  async normalizeResult(tool, result: AdapterToolResult) {
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > RESULT_LIMIT) throw new InvocationValidationError("Astronomy 结果超过 2 MiB 安全上限。");
    if (result.isError) {
      const block = result.content.find((item): item is { type: "text"; text: string } => !!item && typeof item === "object" && (item as { type?: unknown }).type === "text" && typeof (item as { text?: unknown }).text === "string");
      return { content: [{ type: "text", text: block?.text.slice(0, 20_000) || "Astronomy 返回了受控错误。" }], isError: true };
    }
    if (!result.structuredContent || typeof result.structuredContent !== "object" || Array.isArray(result.structuredContent)) throw new InvocationValidationError("Astronomy 返回结果缺少结构化内容。");
    inspect(result.structuredContent);
    return { content: [{ type: "text", text: summary(tool, result.structuredContent) }], structuredContent: result.structuredContent, isError: false };
  },
};

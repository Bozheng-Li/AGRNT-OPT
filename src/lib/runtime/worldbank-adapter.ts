import { access, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

const PACKAGE_NAME = "@cyanheads/worldbank-mcp-server";
const PACKAGE_VERSION = "0.1.14";
export const WORLDBANK_RESULT_LIMIT = 2 * 1024 * 1024;
export const WORLDBANK_COUNTRY_LIMIT = 8;
const CURRENT_YEAR = new Date().getUTCFullYear() + 1;

type WorldBankContext = AdapterContext & { worldBankRoot?: string; worldBankPackageRoot?: string };

const cleanText = (maximum: number) => z.string().trim().min(1).max(maximum)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "输入不能包含控制字符。");
const page = z.number().int().min(1).max(100).default(1);
const smallPage = z.number().int().min(1).max(20).default(1);
const perPage = z.number().int().min(1).max(20).default(10);
const countryCode = cleanText(3).regex(/^[A-Za-z0-9]{2,3}$/, "国家或聚合代码必须是 2–3 位字母数字代码。")
  .transform((value) => value.toUpperCase());
const indicatorId = cleanText(100).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "指标 ID 只允许字母、数字、点、下划线和连字符。");
const topicId = cleanText(2).regex(/^\d{1,2}$/).refine((value) => Number(value) >= 1 && Number(value) <= 21, "Topic ID 必须在 1–21 之间。");
const sourceId = cleanText(6).regex(/^\d{1,6}$/, "Source ID 必须是数字。");

const searchIndicatorsInput = z.object({
  query: cleanText(200).optional(),
  topic_id: topicId.optional(),
  source_id: sourceId.optional(),
  page,
  per_page: perPage,
}).strict().superRefine((value, context) => {
  if (!value.query && !value.topic_id && !value.source_id) {
    context.addIssue({ code: "custom", path: ["query"], message: "指标发现必须提供 topic_id、source_id，或与其中之一组合的 query。" });
  }
  if (value.topic_id && value.source_id) {
    context.addIssue({ code: "custom", path: ["source_id"], message: "topic_id 与 source_id 只能选择一个。" });
  }
  if (value.query && !value.topic_id && !value.source_id) {
    context.addIssue({
      code: "custom",
      path: ["query"],
      message: "0.1.14 的 keyword-only 上游路径会忽略 searchterm 并返回无关目录；请同时提供 topic_id 或 source_id。",
    });
  }
});

const dateRange = cleanText(9).regex(/^\d{4}(?::\d{4})?$/, "日期必须是 YYYY 或 YYYY:YYYY。")
  .superRefine((value, context) => {
    const [startText, endText = startText] = value.split(":");
    const start = Number(startText);
    const end = Number(endText);
    if (start < 1900 || end > CURRENT_YEAR || start > end) {
      context.addIssue({ code: "custom", message: `年份必须在 1900–${CURRENT_YEAR} 内且起始年不晚于结束年。` });
    }
    if (end - start > 50) context.addIssue({ code: "custom", message: "一次最多查询 51 个年度。" });
  });

const countryList = z.union([
  countryCode.transform((value) => [value]),
  z.array(countryCode).min(1).max(WORLDBANK_COUNTRY_LIMIT),
]).transform((value) => [...new Set(value)]).refine((value) => !value.includes("ALL"), "公共 Web 不开放 all 全库查询。")
  .refine((value) => value.length <= WORLDBANK_COUNTRY_LIMIT, `一次最多查询 ${WORLDBANK_COUNTRY_LIMIT} 个国家或聚合体。`);

const getDataInput = z.object({
  indicator_id: indicatorId,
  countries: countryList,
  date_range: dateRange.optional(),
  mrv: z.number().int().min(1).max(10).optional(),
  page: z.literal(1).default(1),
  per_page: z.number().int().min(1).max(500).default(500),
}).strict().superRefine((value, context) => {
  if (value.date_range && value.mrv !== undefined) {
    context.addIssue({ code: "custom", path: ["mrv"], message: "date_range 与 mrv 不能同时使用。" });
  }
}).transform((value) => value.date_range || value.mrv !== undefined ? value : { ...value, mrv: 5 });

const inputSchemas = {
  worldbank_list_topics: z.object({}).strict(),
  worldbank_list_sources: z.object({ page: smallPage, per_page: perPage }).strict(),
  worldbank_list_countries: z.object({
    region: z.enum(["EAS", "ECS", "LCN", "MEA", "NAC", "SAS", "SSF"]).optional(),
    income_level: z.enum(["LIC", "LMC", "UMC", "HIC"]).optional(),
    include_aggregates: z.boolean().default(false),
    page,
    per_page: perPage,
  }).strict(),
  worldbank_get_country: z.object({ country_code: countryCode }).strict(),
  worldbank_search_indicators: searchIndicatorsInput,
  worldbank_get_indicator: z.object({ indicator_id: indicatorId }).strict(),
  worldbank_get_data: getDataInput,
} satisfies Record<string, z.ZodType>;

const text = z.string().max(200_000);
const finiteCount = z.number().finite().nonnegative();
const topic = z.object({ id: z.string().max(20), name: text, sourceNote: text }).strict();
const source = z.object({
  id: z.string().max(30), name: text, code: z.string().max(50), lastUpdated: z.string().max(50),
  dataAvailability: z.string().max(50), metadataAvailability: z.string().max(50), concepts: z.string().max(50),
}).strict();
const country = z.object({
  id: z.string().max(20), iso2: z.string().max(10), name: text,
  region: z.object({ id: z.string().max(20), name: text }).strict(),
  incomeLevel: z.object({ id: z.string().max(20), name: text }).strict(),
  lendingType: text, capitalCity: text, longitude: z.string().max(100), latitude: z.string().max(100), isAggregate: z.boolean(),
}).strict();
const indicator = z.object({
  id: z.string().max(150), name: text, sourceId: z.string().max(30), sourceName: text, sourceNote: text,
  topics: z.array(z.object({ id: z.string().max(20), name: text }).strict()).max(30),
}).strict();
const indicatorDetail = indicator.extend({ unit: text, sourceOrganization: text }).strict();
const paging = {
  totalCount: finiteCount,
  currentPage: z.number().int().positive().max(100_000),
  totalPages: z.number().int().nonnegative().max(100_000),
};

const outputSchemas = {
  worldbank_list_topics: z.object({ topics: z.array(topic).max(21) }).strict(),
  worldbank_list_sources: z.object({ sources: z.array(source).max(20), ...paging }).passthrough(),
  worldbank_list_countries: z.object({ countries: z.array(country).max(20), ...paging }).passthrough(),
  worldbank_get_country: country,
  worldbank_search_indicators: z.object({
    indicators: z.array(indicator).max(20), effectiveQuery: z.string().max(1_000).optional(), ...paging,
    notice: z.string().max(10_000).optional(),
  }).passthrough(),
  worldbank_get_indicator: indicatorDetail,
  worldbank_get_data: z.object({
    data: z.array(z.object({
      countryCode: z.string().max(10), countryIso3: z.string().max(10), countryName: text, date: z.string().max(20),
      value: z.number().finite().nullable(), obsStatus: z.string().max(100), isAggregate: z.boolean(),
    }).strict()).max(500),
    indicator: z.object({ id: z.string().max(150), name: text }).strict(),
    nullCount: finiteCount,
    ...paging,
    notice: z.string().max(10_000).optional(),
  }).passthrough(),
} satisfies Record<string, z.ZodType>;

function parseInput(tool: string, input: unknown): Record<string, unknown> {
  const schema = inputSchemas[tool as keyof typeof inputSchemas];
  if (!schema) throw new InvocationValidationError(`World Bank Web 适配未开放工具：${tool}`);
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
    if (nodes > 30_000 || depth > 16) throw new InvocationValidationError("World Bank 结果结构超过安全上限。");
    if (typeof item === "string" && item.length > 250_000) throw new InvocationValidationError("World Bank 单个文本字段超过安全上限。");
    if (Array.isArray(item)) {
      if (item.length > 1_000) throw new InvocationValidationError("World Bank 结果数组超过安全上限。");
      item.forEach((entry) => visit(entry, depth + 1));
    } else if (item && typeof item === "object") {
      Object.values(item as Record<string, unknown>).forEach((entry) => visit(entry, depth + 1));
    }
  };
  visit(value, 0);
}

async function requireDirectory(target: string, label: string): Promise<void> {
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new InvocationValidationError(`${label}不能是符号链接或目录联接。`);
}

function defaultRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "worldbank");
}

function defaultPackageRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "@cyanheads", "worldbank-mcp-server");
}

function bootstrap(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "worldbank-mcp-entry.mjs");
}

async function ensureSandbox(root: string): Promise<{ root: string; temporary: string }> {
  const resolved = path.resolve(root);
  const temporary = path.join(resolved, "tmp");
  await Promise.all([mkdir(resolved, { recursive: true }), mkdir(temporary, { recursive: true })]);
  await Promise.all([requireDirectory(resolved, "World Bank 运行目录"), requireDirectory(temporary, "World Bank 临时目录")]);
  return { root: resolved, temporary };
}

function summary(tool: string, payload: Record<string, unknown>): string {
  if (tool === "worldbank_list_topics") return `World Bank 返回 ${String((payload.topics as unknown[])?.length ?? 0)} 个主题。`;
  if (tool === "worldbank_list_sources") return `World Bank 返回 ${String((payload.sources as unknown[])?.length ?? 0)} 个数据源。`;
  if (tool === "worldbank_list_countries") return `World Bank 返回 ${String((payload.countries as unknown[])?.length ?? 0)} 个国家或聚合体。`;
  if (tool === "worldbank_get_country") return `World Bank 已解析国家或聚合体：${String(payload.name ?? payload.id)}。`;
  if (tool === "worldbank_search_indicators") return `World Bank 返回 ${String((payload.indicators as unknown[])?.length ?? 0)} 个指标。`;
  if (tool === "worldbank_get_indicator") return `World Bank 已解析指标：${String(payload.name ?? payload.id)}。`;
  return `World Bank 返回 ${String((payload.data as unknown[])?.length ?? 0)} 个观测值。`;
}

export const worldBankAdapter: PluginAdapter = {
  slug: "worldbank-development-data-lab",
  allowedTools: Object.keys(inputSchemas),
  allowedResourceTemplates: ["worldbank-indicator", "worldbank-country"],
  requestTimeoutMs(tool) {
    return tool === "worldbank_search_indicators" ? 60_000 : 35_000;
  },
  persistentSession: {
    key(context) { return path.resolve((context as WorldBankContext).worldBankRoot ?? defaultRoot()); },
    idleMs: 20_000,
  },
  async validateAndTransform(tool, input) { return parseInput(tool, input); },
  async validateResourceUri(uri) {
    if (typeof uri !== "string" || uri.length > 180) throw new InvocationValidationError("World Bank 资源 URI 无效。");
    const indicatorMatch = uri.match(/^worldbank:\/\/indicator\/([A-Za-z0-9][A-Za-z0-9._-]{1,99})$/);
    if (indicatorMatch) return `worldbank://indicator/${indicatorMatch[1]}`;
    const countryMatch = uri.match(/^worldbank:\/\/country\/([A-Za-z0-9]{2,3})$/);
    if (countryMatch) return `worldbank://country/${countryMatch[1].toUpperCase()}`;
    throw new InvocationValidationError("World Bank 资源只接受固定 indicator 或 country URI。");
  },
  async prepare(rawContext) {
    if (Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) < 24) {
      throw new InvocationValidationError("World Bank MCP 0.1.14 需要 Node.js 24 或更新版本。");
    }
    const context = rawContext as WorldBankContext;
    const packageRoot = path.resolve(context.worldBankPackageRoot ?? defaultPackageRoot());
    const entry = bootstrap();
    const sandbox = await ensureSandbox(context.worldBankRoot ?? defaultRoot());
    try {
      await Promise.all([access(path.join(packageRoot, "dist", "index.js")), access(path.join(packageRoot, "package.json")), access(entry)]);
      const metadata = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")) as { name?: unknown; version?: unknown };
      if (metadata.name !== PACKAGE_NAME || metadata.version !== PACKAGE_VERSION) throw new Error("version mismatch");
    } catch {
      throw new InvocationValidationError("World Bank MCP 0.1.14 尚未按固定 lockfile 安装。");
    }
    return {
      command: process.execPath,
      args: ["--max-old-space-size=256", entry],
      cwd: sandbox.root,
      env: {
        AGENT_OPT_WORLDBANK_PACKAGE_ROOT: packageRoot,
        AGENT_OPT_WORLDBANK_RUNTIME_ROOT: sandbox.root,
        HOME: sandbox.root,
        USERPROFILE: sandbox.root,
        TEMP: sandbox.temporary,
        TMP: sandbox.temporary,
        TMPDIR: sandbox.temporary,
        MCP_TRANSPORT_TYPE: "stdio",
        MCP_LOG_LEVEL: "emerg",
        STORAGE_PROVIDER_TYPE: "in-memory",
        IS_SERVERLESS: "true",
        OTEL_ENABLED: "false",
        WORLDBANK_API_BASE_URL: "https://api.worldbank.org/v2",
        WORLDBANK_DEFAULT_PER_PAGE: "10",
        NODE_USE_ENV_PROXY: "0",
        NO_COLOR: "1",
        NODE_ENV: "production",
      },
    };
  },
  async normalizeResult(tool, result: AdapterToolResult) {
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > WORLDBANK_RESULT_LIMIT) {
      throw new InvocationValidationError("World Bank 结果超过 2 MiB 安全上限。");
    }
    if (result.isError) {
      inspectBoundedJson(result.structuredContent);
      const block = result.content.find((item): item is { type: "text"; text: string } =>
        Boolean(item && typeof item === "object" && (item as { type?: unknown }).type === "text" && typeof (item as { text?: unknown }).text === "string"));
      return {
        content: [{ type: "text", text: (block?.text || "World Bank 返回了受控错误。").slice(0, 32_000) }],
        ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
        isError: true,
      };
    }
    if (!result.structuredContent || typeof result.structuredContent !== "object" || Array.isArray(result.structuredContent)) {
      throw new InvocationValidationError("World Bank 返回结果缺少结构化内容。");
    }
    inspectBoundedJson(result.structuredContent);
    const schema = outputSchemas[tool as keyof typeof outputSchemas];
    const parsed = schema?.safeParse(result.structuredContent);
    if (!parsed?.success) throw new InvocationValidationError("World Bank 返回结果不符合固定 0.1.14 协议结构。");
    const structuredContent = parsed.data as Record<string, unknown>;
    return { content: [{ type: "text", text: summary(tool, structuredContent) }], structuredContent, isError: false };
  },
};

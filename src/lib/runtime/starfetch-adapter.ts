import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

type StarfetchContext = AdapterContext & { starfetchPackageRoot?: string };

const RESULT_LIMIT = 4 * 1024 * 1024;
const services = ["exoplanetarchive", "gaia", "irsa", "simbad", "vizier"] as const;
const service = z.enum(services);
const format = z.enum(["votable", "csv", "tsv", "json", "jsonl"]);
const tableName = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_.]+$/, "表名必须来自 TAP 元数据且仅包含安全标识字符。");
const jobId = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._~-]+$/, "异步作业必须使用服务返回的裸 job ID。");
const shortText = z.string().trim().min(1).max(240).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "输入不能包含控制字符。");

const metadataInput = z.object({ service }).strict();
const queryInput = z.object({
  service,
  query: z.string().trim().min(1).max(10_000),
  format: format.default("json"),
  maxrec: z.number().int().min(1).max(50).default(20),
  runId: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._~-]+$/).optional(),
}).strict();
const jobInput = z.object({ service, jobIdOrUrl: jobId }).strict();

const inputSchemas = {
  starfetch_list_presets: z.object({}).strict(),
  starfetch_registry_search: z.object({ query: shortText, maxrec: z.number().int().min(1).max(20).default(10) }).strict(),
  starfetch_tap_availability: metadataInput,
  starfetch_tap_capabilities: metadataInput,
  starfetch_tap_tables: metadataInput,
  starfetch_tap_columns: z.object({ service, table: tableName }).strict(),
  starfetch_tap_query: queryInput,
  starfetch_tap_submit_job: queryInput,
  starfetch_tap_job_status: jobInput,
  starfetch_tap_job_wait: jobInput.extend({
    intervalMs: z.number().int().min(500).max(5_000).default(1_000),
    timeoutMs: z.number().int().min(1_000).max(60_000).default(45_000),
    maxIntervalMs: z.number().int().min(500).max(5_000).default(4_000),
    backoff: z.boolean().default(true),
  }).strict(),
  starfetch_tap_job_fetch: jobInput.extend({
    format: format.default("json"),
    sourceFormat: z.enum(["votable", "csv", "tsv"]).default("csv"),
  }).strict(),
  starfetch_tap_job_delete: jobInput,
} satisfies Record<string, z.ZodType>;

const resourceUris = new Set([
  "starfetch://guides/adql",
  "starfetch://guides/tap-metadata",
  "starfetch://services/gaia",
  "starfetch://services/simbad",
  "starfetch://examples/proper-motion",
]);

const promptSchemas = {
  query_astronomy_catalog: z.object({ question: z.string().trim().min(1).max(2_000), service: service.optional() }).strict(),
  explore_service: z.object({ service, topic: z.string().trim().min(1).max(240).optional() }).strict(),
  run_cone_search: z.object({
    service,
    ra: z.number().finite().min(0).max(360),
    dec: z.number().finite().min(-90).max(90),
    radius: z.number().finite().positive().max(10),
  }).strict(),
  troubleshoot_adql: z.object({ service, query: z.string().trim().min(1).max(10_000), error: z.string().trim().min(1).max(4_000) }).strict(),
} satisfies Record<string, z.ZodType>;

function defaultPackageRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "@starfetch-js", "mcp");
}

function bootstrapEntryPoint(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "starfetch-mcp-entry.mjs");
}

export function validatedStarfetchProxy(environment: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  const upper = environment.HTTPS_PROXY?.trim();
  const lower = environment.https_proxy?.trim();
  if (upper && lower && upper !== lower) throw new InvocationValidationError("部署环境中的 HTTPS_PROXY 配置冲突。");
  const value = upper || lower;
  if (!value) return undefined;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new InvocationValidationError("部署代理必须是有效 URL。"); }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new InvocationValidationError("部署代理只允许无凭据、无路径、无查询和无片段的 http/https origin。");
  }
  return parsed.toString();
}

function validateAdql(query: string): string {
  if (/[;\u0000]/.test(query) || /--|\/\*/.test(query)) {
    throw new InvocationValidationError("ADQL 不允许分号、NUL 或注释语法。");
  }
  const match = /^\s*SELECT\s+TOP\s+(\d+)\b/i.exec(query);
  if (!match) throw new InvocationValidationError("ADQL 必须以 SELECT TOP N 开头。");
  const top = Number(match[1]);
  if (!Number.isSafeInteger(top) || top < 1 || top > 50) {
    throw new InvocationValidationError("ADQL TOP 必须在 1 到 50 之间。");
  }
  return query;
}

function parseInput(tool: string, input: unknown): Record<string, unknown> {
  const schema = inputSchemas[tool as keyof typeof inputSchemas];
  if (!schema) throw new InvocationValidationError(`Starfetch Web 适配未开放工具：${tool}`);
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new InvocationValidationError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；"));
  }
  const value = parsed.data as Record<string, unknown>;
  if (tool === "starfetch_tap_query" || tool === "starfetch_tap_submit_job") {
    value.query = validateAdql(String(value.query));
  }
  return value;
}

function inspectBoundedJson(value: unknown): void {
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 50_000 || depth > 18) throw new InvocationValidationError("Starfetch 结果结构超过安全上限。");
    if (typeof item === "string" && item.length > 2_000_000) throw new InvocationValidationError("Starfetch 单个文本字段超过安全上限。");
    if (Array.isArray(item)) {
      if (item.length > 10_000) throw new InvocationValidationError("Starfetch 结果数组超过安全上限。");
      item.forEach((entry) => visit(entry, depth + 1));
    } else if (item && typeof item === "object") {
      Object.values(item as Record<string, unknown>).forEach((entry) => visit(entry, depth + 1));
    }
  };
  visit(value, 0);
}

function summary(tool: string, payload: Record<string, unknown>): string {
  const data = payload.data;
  if (Array.isArray(data)) return `Starfetch 返回 ${data.length} 条 ${tool.replace("starfetch_", "")} 记录。`;
  if (data && typeof data === "object") {
    const item = data as Record<string, unknown>;
    if (typeof item.phase === "string") return `Starfetch 异步作业状态：${item.phase}。`;
    if (item.deleted === true) return `Starfetch 已删除远程作业 ${String(item.id ?? "")}。`;
    if (typeof item.content === "string") return `Starfetch 返回 ${item.format ?? "catalog"} 查询结果。`;
    if (typeof item.available === "boolean") return `Starfetch TAP 服务${item.available ? "可用" : "不可用"}。`;
  }
  return "Starfetch 已返回结构化天文目录结果。";
}

export const starfetchAdapter: PluginAdapter = {
  slug: "starfetch-astronomy-lab",
  allowedTools: Object.keys(inputSchemas),
  allowedResourceTemplates: [
    "Starfetch ADQL guide",
    "Starfetch TAP metadata guide",
    "Starfetch Gaia service guide",
    "Starfetch SIMBAD service guide",
    "Starfetch proper-motion example",
  ],
  allowedPrompts: Object.keys(promptSchemas),
  requestTimeoutMs(tool) {
    if (tool === "starfetch_tap_job_wait") return 70_000;
    if (tool === "starfetch_tap_submit_job" || tool === "starfetch_tap_query") return 60_000;
    if (
      tool === "starfetch_registry_search"
      || tool === "starfetch_tap_availability"
      || tool === "starfetch_tap_capabilities"
      || tool === "starfetch_tap_tables"
      || tool === "starfetch_tap_columns"
    ) return 90_000;
    return 45_000;
  },
  async validateAndTransform(tool, input) {
    return parseInput(tool, input);
  },
  async validateResourceUri(uri) {
    if (typeof uri !== "string" || !resourceUris.has(uri)) throw new InvocationValidationError("Starfetch 资源 URI 不在固定只读索引中。");
    return uri;
  },
  async validatePromptAndTransform(prompt, input) {
    const schema = promptSchemas[prompt as keyof typeof promptSchemas];
    if (!schema) throw new InvocationValidationError(`Starfetch Web 适配未开放提示：${prompt}`);
    const parsed = schema.safeParse(input ?? {});
    if (!parsed.success) {
      throw new InvocationValidationError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；"));
    }
    const stringified = Object.fromEntries(Object.entries(parsed.data as Record<string, unknown>).map(([key, value]) => [key, String(value)]));
    return stringified;
  },
  async prepare(rawContext) {
    if (Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) < 22) {
      throw new InvocationValidationError("Starfetch MCP 0.2.3 需要 Node.js 22 或更新版本。");
    }
    const context = rawContext as StarfetchContext;
    const packageRoot = path.resolve(/* turbopackIgnore: true */ context.starfetchPackageRoot ?? defaultPackageRoot());
    const moduleRoot = path.resolve(packageRoot, "..", "..");
    const bootstrap = bootstrapEntryPoint();
    try {
      await Promise.all([
        access(path.join(packageRoot, "package.json")),
        access(path.join(packageRoot, "dist", "index.js")),
        access(path.join(moduleRoot, "@starfetch-js", "core", "package.json")),
        access(bootstrap),
      ]);
    } catch {
      throw new InvocationValidationError("Starfetch MCP 0.2.3 尚未按固定 lockfile 安装。");
    }
    const proxy = validatedStarfetchProxy();
    return {
      command: process.execPath,
      args: ["--max-old-space-size=256", bootstrap],
      cwd: packageRoot,
      env: {
        AGENT_OPT_STARFETCH_PACKAGE_ROOT: packageRoot,
        AGENT_OPT_STARFETCH_MODULE_ROOT: moduleRoot,
        NODE_USE_ENV_PROXY: "1",
        ...(proxy ? { HTTPS_PROXY: proxy } : {}),
        NO_COLOR: "1",
        NODE_ENV: "production",
      },
    };
  },
  async normalizeResult(tool, result: AdapterToolResult) {
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > RESULT_LIMIT) {
      throw new InvocationValidationError("Starfetch 结果超过 4 MiB 安全上限。");
    }
    if (result.isError) {
      const block = result.content.find(
        (item): item is { type: "text"; text: string } =>
          !!item && typeof item === "object" && (item as { type?: unknown }).type === "text" && typeof (item as { text?: unknown }).text === "string",
      );
      return { content: [{ type: "text", text: block?.text.slice(0, 40_000) || "Starfetch 返回了受控错误。" }], isError: true };
    }
    const parsed = z.object({ data: z.unknown(), diagnostics: z.record(z.string(), z.unknown()) }).passthrough().safeParse(result.structuredContent);
    if (!parsed.success) throw new InvocationValidationError("Starfetch 返回结果不符合固定 0.2.3 协议结构。");
    inspectBoundedJson(parsed.data);
    const structuredContent = parsed.data as Record<string, unknown>;
    return {
      content: [{ type: "text", text: summary(tool, structuredContent) }],
      structuredContent,
      isError: false,
    };
  },
};

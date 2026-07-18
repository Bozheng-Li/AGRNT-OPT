import { access, lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";
import {
  OSV_ADVISORY_BATCH_LIMIT,
  OSV_ADVISORY_RESULT_LIMIT,
  OSV_ECOSYSTEMS,
} from "./osv-advisory-constants";

export { OSV_ADVISORY_BATCH_LIMIT, OSV_ADVISORY_RESULT_LIMIT, OSV_ECOSYSTEMS } from "./osv-advisory-constants";

const packageEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules",
  "@cyanheads",
  "osv-advisory-mcp-server",
  "dist",
  "index.js",
);
const bootstrapEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "scripts",
  "osv-advisory-mcp-entry.mjs",
);

type OsvAdvisoryContext = AdapterContext & { osvAdvisoryRoot?: string };

export function validatedOsvDeploymentProxy(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const upper = environment.HTTPS_PROXY?.trim();
  const lower = environment.https_proxy?.trim();
  if (upper && lower && upper !== lower) {
    throw new InvocationValidationError("部署环境中的 HTTPS_PROXY 与 https_proxy 配置冲突。");
  }
  const value = upper || lower;
  if (!value) return undefined;
  if (value.length > 2_000) throw new InvocationValidationError("部署级 HTTPS 代理 URL 过长。");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new InvocationValidationError("部署级 HTTPS 代理必须是有效 URL。");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new InvocationValidationError(
      "部署级 HTTPS 代理只允许无凭据、无路径、无查询和无片段的 http/https origin。",
    );
  }
  return parsed.toString();
}

const unsafeInputSyntax = /[\\\u0000-\u001f\u007f;&|`$<>"']/;
const packageName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9@][A-Za-z0-9@+._:/-]*$/, "包名包含不允许的字符。")
  .refine((value) => !value.includes("://") && !value.includes("//"), "包名不能是 URL。")
  .refine(
    (value) => !value.split("/").some((segment) => segment === "." || segment === ".."),
    "包名不能包含路径穿越片段。",
  )
  .refine((value) => !unsafeInputSyntax.test(value), "包名包含不安全语法。");
const packageVersion = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._+~:!-]*$/, "版本必须是精确版本，不能使用范围、URL 或命令语法。")
  .refine((value) => !unsafeInputSyntax.test(value), "版本包含不安全语法。");
const ecosystem = z.enum(OSV_ECOSYSTEMS, { message: "生态名称必须与 OSV 清单中的大小写完全一致。" });
const vulnerabilityId = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "公告 ID 只能包含字母、数字、点、下划线、冒号和连字符。");
const packageTuple = z.object({ name: packageName, ecosystem, version: packageVersion }).strict();

const inputSchemas = {
  osv_list_ecosystems: z.object({}).strict(),
  osv_query_package: packageTuple,
  osv_get_vulnerability: z.object({ id: vulnerabilityId }).strict(),
  osv_query_batch: z
    .object({ packages: z.array(packageTuple).min(1).max(OSV_ADVISORY_BATCH_LIMIT) })
    .strict(),
} satisfies Record<string, z.ZodType>;

const vulnerabilitySummary = z
  .object({
    id: z.string().min(1).max(200),
    summary: z.string().max(200_000),
    aliases: z.array(z.string().max(200)).max(200),
    severityLabel: z.string().max(40).nullable(),
    fixedVersions: z.array(z.string().max(200)).max(200),
  })
  .passthrough();
const queryOutput = z
  .object({
    vulns: z.array(vulnerabilitySummary).max(2_000),
    truncated: z.boolean(),
    queryMeta: z
      .object({
        package: z.string().max(200),
        ecosystem: z.string().max(100),
        version: z.string().max(100),
        vulnCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .passthrough();
const batchOutput = z
  .object({
    results: z
      .array(
        z
          .object({
            name: z.string().max(200),
            ecosystem: z.string().max(100),
            version: z.string().max(100),
            vulnerable: z.boolean(),
            truncated: z.boolean(),
            error: z.string().max(5_000).nullable(),
            vulnCount: z.number().int().nonnegative(),
            vulns: z.array(vulnerabilitySummary).max(2_000),
          })
          .strict(),
      )
      .max(OSV_ADVISORY_BATCH_LIMIT),
    summary: z
      .object({
        totalPackages: z.number().int().min(1).max(OSV_ADVISORY_BATCH_LIMIT),
        vulnerableCount: z.number().int().nonnegative(),
        cleanCount: z.number().int().nonnegative(),
        truncatedCount: z.number().int().nonnegative(),
        errorCount: z.number().int().nonnegative(),
        totalVulns: z.number().int().nonnegative(),
        worstSeverity: z.string().max(40).nullable(),
      })
      .strict(),
  })
  .passthrough();
const detailOutput = z
  .object({
    id: z.string().min(1).max(200),
    summary: z.string().max(200_000),
    details: z.string().max(1_200_000),
    aliases: z.array(z.string().max(200)).max(500),
    published: z.string().max(100),
    modified: z.string().max(100),
    severityLabel: z.string().max(40).nullable(),
    affected: z.array(z.unknown()).max(2_000),
    references: z.array(z.unknown()).max(4_000),
    withdrawn: z.string().max(100).optional(),
  })
  .passthrough();
const outputSchemas = {
  osv_list_ecosystems: z
    .object({
      ecosystems: z.array(z.enum(OSV_ECOSYSTEMS)).length(OSV_ECOSYSTEMS.length),
      note: z.string().max(10_000),
    })
    .strict(),
  osv_query_package: queryOutput,
  osv_get_vulnerability: detailOutput,
  osv_query_batch: batchOutput,
} satisfies Record<string, z.ZodType>;

function parseInput(tool: string, input: unknown): Record<string, unknown> {
  const schema = inputSchemas[tool as keyof typeof inputSchemas];
  if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new InvocationValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；"),
    );
  }
  return parsed.data as Record<string, unknown>;
}

async function requireRealDirectory(target: string, label: string): Promise<void> {
  const stats = await lstat(target);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new InvocationValidationError(`${label}不能是符号链接、联接点或其他重定向目录。`);
  }
}

export function defaultOsvAdvisoryRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "osv-advisory-mcp");
}

export async function ensureOsvAdvisorySandbox(
  root: string = defaultOsvAdvisoryRoot(),
): Promise<{ root: string; temporary: string; logs: string }> {
  const resolved = path.resolve(/* turbopackIgnore: true */ root);
  const temporary = path.join(resolved, "tmp");
  const logs = path.join(resolved, "logs");
  await Promise.all([
    mkdir(resolved, { recursive: true }),
    mkdir(temporary, { recursive: true }),
    mkdir(logs, { recursive: true }),
  ]);
  await Promise.all([
    requireRealDirectory(resolved, "OSV 运行目录"),
    requireRealDirectory(temporary, "OSV 临时目录"),
    requireRealDirectory(logs, "OSV 日志目录"),
  ]);
  return { root: resolved, temporary, logs };
}

function successSummary(tool: string, payload: Record<string, unknown>): string {
  if (tool === "osv_list_ecosystems") {
    return `OSV MCP 返回 ${Array.isArray(payload.ecosystems) ? payload.ecosystems.length : 0} 个生态标识。`;
  }
  if (tool === "osv_query_package") {
    const meta = payload.queryMeta as { package?: unknown; version?: unknown; vulnCount?: unknown } | undefined;
    return `OSV MCP 完成 ${String(meta?.package ?? "package")}@${String(meta?.version ?? "version")} 查询：${String(meta?.vulnCount ?? 0)} 条已知漏洞。`;
  }
  if (tool === "osv_query_batch") {
    const summary = payload.summary as { totalPackages?: unknown; vulnerableCount?: unknown } | undefined;
    return `OSV MCP 完成 ${String(summary?.totalPackages ?? 0)} 个包的批量查询：${String(summary?.vulnerableCount ?? 0)} 个包存在已知漏洞。`;
  }
  return `OSV MCP 返回公告 ${String(payload.id ?? "unknown")} 的完整记录。`;
}

export const osvAdvisoryAdapter: PluginAdapter = {
  slug: "osv-advisory-studio",
  allowedTools: Object.keys(inputSchemas),
  requestTimeoutMs(tool) {
    if (tool === "osv_query_batch") return 45_000;
    if (tool === "osv_list_ecosystems") return 15_000;
    return 30_000;
  },
  async prepare(context) {
    if (Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) < 24) {
      throw new InvocationValidationError("OSV Advisory MCP 0.1.12 需要 Node.js 24 或更新版本。");
    }
    try {
      await Promise.all([access(packageEntryPoint), access(bootstrapEntryPoint)]);
    } catch {
      throw new InvocationValidationError("OSV Advisory MCP 0.1.12 尚未安装，请执行固定版本 npm 安装。");
    }
    const extended = context as OsvAdvisoryContext;
    const sandbox = await ensureOsvAdvisorySandbox(extended.osvAdvisoryRoot ?? defaultOsvAdvisoryRoot());
    const deploymentProxy = validatedOsvDeploymentProxy();
    return {
      command: process.execPath,
      args: ["--max-old-space-size=256", bootstrapEntryPoint],
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
        OSV_REQUEST_TIMEOUT_MS: "6000",
        OSV_BATCH_CONCURRENCY: "3",
        OSV_QUERY_MAX_PAGES: "2",
        NODE_USE_ENV_PROXY: "1",
        ...(deploymentProxy ? { HTTPS_PROXY: deploymentProxy } : {}),
        NO_COLOR: "1",
      },
    };
  },
  async validateAndTransform(tool, input) {
    return parseInput(tool, input);
  },
  async normalizeResult(tool, result: AdapterToolResult) {
    const rawBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
    if (rawBytes > OSV_ADVISORY_RESULT_LIMIT) {
      throw new InvocationValidationError("OSV Advisory MCP 返回结果超过 1.5 MiB 安全上限。");
    }
    if (result.isError) {
      const textBlock = result.content.find(
        (item): item is { type: "text"; text: string } =>
          typeof item === "object" && item !== null && (item as { type?: unknown }).type === "text" &&
          typeof (item as { text?: unknown }).text === "string",
      );
      const text = textBlock?.text.trim() || "OSV.dev 返回了未提供详情的受控错误。";
      if (Buffer.byteLength(text, "utf8") > 32_000) {
        throw new InvocationValidationError("OSV Advisory MCP 错误结果超过 32 KiB 安全上限。");
      }
      return { content: [{ type: "text", text }], isError: true };
    }
    const schema = outputSchemas[tool as keyof typeof outputSchemas];
    if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    const parsed = schema.safeParse(result.structuredContent);
    if (!parsed.success) {
      throw new InvocationValidationError("OSV Advisory MCP 返回结果不符合固定 0.1.12 协议结构。");
    }
    const structuredContent = parsed.data as Record<string, unknown>;
    const normalized = {
      content: [{ type: "text", text: successSummary(tool, structuredContent) }],
      structuredContent,
      isError: false,
    };
    if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > OSV_ADVISORY_RESULT_LIMIT) {
      throw new InvocationValidationError("OSV Advisory MCP 规范化结果超过 1.5 MiB 安全上限。");
    }
    return normalized;
  },
};

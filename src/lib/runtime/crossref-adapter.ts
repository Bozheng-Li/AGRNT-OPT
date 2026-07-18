import { access, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

type CrossrefContext = AdapterContext & {
  crossrefRoot?: string;
  crossrefPackageRoot?: string;
};

const RESULT_LIMIT = 4 * 1024 * 1024;
const MAX_ROWS = 10;
const MAX_OFFSET = 10_000;

const boundedText = (maximum: number) => z
  .string()
  .trim()
  .min(1)
  .max(maximum)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "输入不能包含控制字符。");

const doi = boundedText(220).regex(
  /^10\.\d{4,9}\/\S+$/,
  "DOI 必须使用 10.NNNN/suffix 格式，不能包含 doi.org URL 前缀。",
);
const queryText = boundedText(500);
const cursor = boundedText(2_048).regex(/^[\x21-\x7e]+$/, "Crossref cursor 必须是无空白的可打印 ASCII token。");
const rows = z.number().int().min(1).max(MAX_ROWS).default(5);
const offset = z.number().int().min(0).max(MAX_OFFSET - 1);
const issn = boundedText(9).regex(/^\d{4}-?\d{3}[\dX]$/i, "ISSN 必须是 xxxx-xxxx 或 xxxxxxxx 格式。");
const prefix = boundedText(12).regex(/^10\.\d{4,9}$/, "DOI prefix 必须是 10.NNNN 格式。");
const memberId = z.number().int().min(1).max(1_000_000_000);
const funderDoi = boundedText(100)
  .regex(
    /^(?:https:\/\/(?:dx\.)?doi\.org\/|doi:)?10\.13039\/\d{1,18}$/i,
    "基金方 DOI 必须是 10.13039/数字，可带 https://doi.org/ 或 doi: 前缀。",
  )
  .transform((value) => value.replace(/^https:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:/i, ""));

const filterKey = z.string().min(1).max(64).regex(/^[a-z][a-z0-9.-]*$/, "Crossref filter key 格式无效。");
const filterValue = boundedText(300).refine((value) => !value.includes(","), "单个 filter value 不能包含逗号。");
const filter = z.record(filterKey, filterValue).refine(
  (value) => Object.keys(value).length <= 12,
  "一次最多提交 12 个 Crossref filter。",
);

const selectableFields = [
  "DOI",
  "title",
  "author",
  "published",
  "type",
  "container-title",
  "publisher",
  "is-referenced-by-count",
  "score",
  "abstract",
] as const;

const fields = z
  .array(z.enum(selectableFields))
  .min(1)
  .max(selectableFields.length)
  .transform((value) => [...new Set(["DOI" as const, ...value])]);

const sort = z.enum([
  "relevance",
  "score",
  "is-referenced-by-count",
  "published",
  "published-print",
  "published-online",
  "deposited",
  "indexed",
  "created",
  "updated",
  "references-count",
]);

const searchWorksInput = z.object({
  query: queryText.optional(),
  queryBibliographic: queryText.optional(),
  queryTitle: queryText.optional(),
  queryAuthor: queryText.optional(),
  queryContainerTitle: queryText.optional(),
  filter: filter.optional(),
  fields: fields.optional(),
  rows,
  offset: offset.optional(),
  cursor: cursor.optional(),
  sort: sort.optional(),
  order: z.enum(["asc", "desc"]).optional(),
}).strict().superRefine((value, context) => {
  if (!value.query && !value.queryBibliographic && !value.queryTitle && !value.queryAuthor
    && !value.queryContainerTitle && !value.filter) {
    context.addIssue({ code: "custom", path: ["query"], message: "作品检索必须提供查询文本或至少一个 filter。" });
  }
  if (value.cursor !== undefined && value.offset !== undefined) {
    context.addIssue({ code: "custom", path: ["cursor"], message: "cursor 和 offset 不能同时使用。" });
  }
  if (value.offset !== undefined && value.offset + value.rows > MAX_OFFSET) {
    context.addIssue({ code: "custom", path: ["offset"], message: "offset + rows 不能超过 10000。" });
  }
  if (value.order !== undefined && value.sort === undefined) {
    context.addIssue({ code: "custom", path: ["order"], message: "设置 order 时必须同时设置 sort。" });
  }
});

const searchJournalsInput = z.object({
  query: queryText.optional(),
  issn: issn.optional(),
  include_works: z.boolean().default(false),
  rows,
}).strict().superRefine((value, context) => {
  if (!value.query && !value.issn) {
    context.addIssue({ code: "custom", path: ["query"], message: "期刊检索必须提供 query 或 issn。" });
  }
  if (value.query && value.issn) {
    context.addIssue({ code: "custom", path: ["issn"], message: "query 和 issn 只能提供一个。" });
  }
  if (value.include_works && !value.issn) {
    context.addIssue({ code: "custom", path: ["include_works"], message: "查询期刊作品前必须先提供唯一 ISSN。" });
  }
});

const searchFundersInput = z.object({
  query: queryText.optional(),
  funder_doi: funderDoi.optional(),
  include_works: z.literal(false).default(false),
  rows,
}).strict().superRefine((value, context) => {
  if (!value.query && !value.funder_doi) {
    context.addIssue({ code: "custom", path: ["query"], message: "基金方检索必须提供 query 或 funder_doi。" });
  }
  if (value.query && value.funder_doi) {
    context.addIssue({ code: "custom", path: ["funder_doi"], message: "query 和 funder_doi 只能提供一个。" });
  }
});

const inputSchemas = {
  crossref_get_work: z.object({ doi }).strict(),
  crossref_get_references: z.object({ doi }).strict(),
  crossref_search_works: searchWorksInput,
  crossref_search_journals: searchJournalsInput,
  crossref_search_funders: searchFundersInput,
  crossref_get_member: z.object({ member_id: memberId }).strict(),
  crossref_get_prefix: z.object({ prefix }).strict(),
} satisfies Record<string, z.ZodType>;

const finiteCount = z.number().finite().nonnegative();
const shortString = z.string().max(100_000);
const workSummary = z.object({
  doi: z.string().min(1).max(220),
  title: shortString.optional(),
  type: z.string().max(100).optional(),
}).passthrough();
const journalRecord = z.object({ title: shortString.optional() }).passthrough();
const funderRecord = z.object({ id: z.string().max(100).optional(), name: shortString.optional() }).passthrough();

const outputSchemas = {
  crossref_get_work: z.object({
    doi: z.string().min(1).max(220),
    title: shortString.optional(),
    authors: z.array(z.unknown()).max(1_000).optional(),
    referencesCount: finiteCount.optional(),
    isReferencedByCount: finiteCount.optional(),
  }).passthrough(),
  crossref_get_references: z.object({
    doi: z.string().min(1).max(220),
    referenceCount: finiteCount,
    references: z.array(z.unknown()).max(10_000),
    notice: z.string().max(10_000).optional(),
  }).passthrough(),
  crossref_search_works: z.object({
    works: z.array(workSummary).max(MAX_ROWS),
    totalResults: finiteCount,
    returned: z.number().int().min(0).max(MAX_ROWS),
    nextCursor: z.string().max(2_048).optional(),
    notice: z.string().max(10_000).optional(),
  }).passthrough(),
  crossref_search_journals: z.object({
    journals: z.array(journalRecord).max(MAX_ROWS),
    journalCount: z.number().int().min(0).max(MAX_ROWS),
    recentWorks: z.array(workSummary).max(MAX_ROWS).optional(),
    worksTotal: finiteCount.optional(),
    notice: z.string().max(10_000).optional(),
  }).passthrough(),
  crossref_search_funders: z.object({
    funders: z.array(funderRecord).max(MAX_ROWS),
    funderCount: z.number().int().min(0).max(MAX_ROWS),
    fundedWorks: z.array(workSummary).max(MAX_ROWS).optional(),
    fundedWorksTotal: finiteCount.optional(),
    notice: z.string().max(10_000).optional(),
  }).passthrough(),
  crossref_get_member: z.object({
    id: finiteCount,
    primaryName: shortString.optional(),
    prefixes: z.array(z.string().max(50)).max(1_000).optional(),
    worksByType: z.array(z.unknown()).max(100).optional(),
    coverage: z.array(z.unknown()).max(100).optional(),
  }).passthrough(),
  crossref_get_prefix: z.object({
    prefix: z.string().min(1).max(20),
    ownerName: shortString.optional(),
    memberId: finiteCount.optional(),
  }).passthrough(),
} satisfies Record<string, z.ZodType>;

function parseInput(tool: string, input: unknown): Record<string, unknown> {
  const schema = inputSchemas[tool as keyof typeof inputSchemas];
  if (!schema) throw new InvocationValidationError(`Crossref Web 适配未开放工具：${tool}`);
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new InvocationValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；"),
    );
  }
  return parsed.data as Record<string, unknown>;
}

function inspectBoundedJson(value: unknown): void {
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 60_000 || depth > 18) throw new InvocationValidationError("Crossref 结果结构超过安全上限。");
    if (typeof item === "string" && item.length > 1_000_000) {
      throw new InvocationValidationError("Crossref 单个文本字段超过安全上限。");
    }
    if (Array.isArray(item)) {
      if (item.length > 10_000) throw new InvocationValidationError("Crossref 结果数组超过安全上限。");
      item.forEach((entry) => visit(entry, depth + 1));
    } else if (item && typeof item === "object") {
      Object.values(item as Record<string, unknown>).forEach((entry) => visit(entry, depth + 1));
    }
  };
  visit(value, 0);
}

async function requireDirectory(target: string, label: string): Promise<void> {
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new InvocationValidationError(`${label}不能是符号链接或目录联接。`);
  }
}

async function ensureSandbox(root: string): Promise<{ root: string; temporary: string }> {
  const resolved = path.resolve(root);
  const temporary = path.join(resolved, "tmp");
  await Promise.all([mkdir(resolved, { recursive: true }), mkdir(temporary, { recursive: true })]);
  await Promise.all([
    requireDirectory(resolved, "Crossref 运行目录"),
    requireDirectory(temporary, "Crossref 临时目录"),
  ]);
  return { root: resolved, temporary };
}

function defaultRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "crossref");
}

function defaultPackageRoot(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "node_modules",
    "@cyanheads",
    "crossref-mcp-server",
  );
}

function bootstrap(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "crossref-mcp-entry.mjs");
}

function summary(tool: string, payload: Record<string, unknown>): string {
  if (tool === "crossref_get_work") return `Crossref 已解析 DOI：${String(payload.title ?? payload.doi)}。`;
  if (tool === "crossref_get_references") return `Crossref 返回 ${String(payload.referenceCount ?? 0)} 条参考文献。`;
  if (tool === "crossref_search_works") return `Crossref 返回 ${String(payload.returned ?? 0)} 条作品记录。`;
  if (tool === "crossref_search_journals") return `Crossref 返回 ${String(payload.journalCount ?? 0)} 条期刊记录。`;
  if (tool === "crossref_search_funders") return `Crossref 返回 ${String(payload.funderCount ?? 0)} 条基金方记录。`;
  if (tool === "crossref_get_member") return `Crossref 已返回出版机构：${String(payload.primaryName ?? payload.id)}。`;
  return `Crossref 已解析 DOI prefix：${String(payload.prefix)}。`;
}

export const crossrefAdapter: PluginAdapter = {
  slug: "crossref-scholarly-metadata-lab",
  allowedTools: Object.keys(inputSchemas),
  requestTimeoutMs() {
    return 45_000;
  },
  persistentSession: {
    key(context) {
      return path.resolve((context as CrossrefContext).crossrefRoot ?? defaultRoot());
    },
    idleMs: 20_000,
  },
  async validateAndTransform(tool, input) {
    return parseInput(tool, input);
  },
  async prepare(rawContext) {
    if (Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) < 24) {
      throw new InvocationValidationError("Crossref MCP 0.2.0 需要 Node.js 24 或更新版本。");
    }
    const context = rawContext as CrossrefContext;
    const packageRoot = path.resolve(context.crossrefPackageRoot ?? defaultPackageRoot());
    const entry = bootstrap();
    const sandbox = await ensureSandbox(context.crossrefRoot ?? defaultRoot());
    try {
      await Promise.all([
        access(path.join(packageRoot, "dist", "index.js")),
        access(path.join(packageRoot, "package.json")),
        access(entry),
      ]);
      const metadata = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")) as {
        name?: unknown;
        version?: unknown;
      };
      if (metadata.name !== "@cyanheads/crossref-mcp-server" || metadata.version !== "0.2.0") {
        throw new Error("version mismatch");
      }
    } catch {
      throw new InvocationValidationError("Crossref MCP 0.2.0 尚未按固定 lockfile 安装。");
    }
    return {
      command: process.execPath,
      args: ["--max-old-space-size=256", entry],
      cwd: sandbox.root,
      env: {
        AGENT_OPT_CROSSREF_PACKAGE_ROOT: packageRoot,
        AGENT_OPT_CROSSREF_RUNTIME_ROOT: sandbox.root,
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
        CROSSREF_BASE_URL: "https://api.crossref.org",
        CROSSREF_TIMEOUT_MS: "15000",
        NODE_USE_ENV_PROXY: "0",
        NO_COLOR: "1",
        NODE_ENV: "production",
      },
    };
  },
  async normalizeResult(tool, result: AdapterToolResult) {
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > RESULT_LIMIT) {
      throw new InvocationValidationError("Crossref 结果超过 4 MiB 安全上限。");
    }
    if (result.isError) {
      const block = result.content.find(
        (item): item is { type: "text"; text: string } =>
          !!item
          && typeof item === "object"
          && (item as { type?: unknown }).type === "text"
          && typeof (item as { text?: unknown }).text === "string",
      );
      const structuredContent = result.structuredContent
        && typeof result.structuredContent === "object"
        && !Array.isArray(result.structuredContent)
        ? result.structuredContent
        : undefined;
      if (structuredContent) inspectBoundedJson(structuredContent);
      return {
        content: [{ type: "text", text: block?.text.slice(0, 32_000) || "Crossref 返回了受控错误。" }],
        ...(structuredContent ? { structuredContent } : {}),
        isError: true,
      };
    }
    if (!result.structuredContent || typeof result.structuredContent !== "object" || Array.isArray(result.structuredContent)) {
      throw new InvocationValidationError("Crossref 返回结果缺少结构化内容。");
    }
    inspectBoundedJson(result.structuredContent);
    const schema = outputSchemas[tool as keyof typeof outputSchemas];
    const parsed = schema?.safeParse(result.structuredContent);
    if (!parsed?.success) {
      throw new InvocationValidationError("Crossref 返回结果不符合固定 0.2.0 协议结构。");
    }
    const structuredContent = parsed.data as Record<string, unknown>;
    return {
      content: [{ type: "text", text: summary(tool, structuredContent) }],
      structuredContent,
      isError: false,
    };
  },
};

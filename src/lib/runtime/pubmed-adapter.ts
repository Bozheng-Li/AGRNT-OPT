import { access, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

type PubmedContext = AdapterContext & { pubmedRoot?: string };

const RESULT_LIMIT = 4 * 1024 * 1024;
const text = (maximum: number) => z.string().trim().min(1).max(maximum).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "输入不能包含控制字符。");
const shortText = text(200);
const queryText = text(500);
const pmid = z.string().trim().regex(/^\d{1,12}$/, "PMID 必须是 1 到 12 位数字。");
const pmcid = z.string().trim().regex(/^(?:PMC)?\d{1,12}$/i, "PMCID 必须是 PMC 加数字或纯数字。").transform((value) => value.toUpperCase());
const doi = z.string().trim().min(3).max(200).regex(/^10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+$/i, "DOI 格式无效。");
const boundedStringArray = (schema: z.ZodType<string>, maximum: number) => z.array(schema).min(1).max(maximum);

const searchInput = z.object({
  query: queryText,
  maxResults: z.number().int().min(1).max(10).default(5),
  offset: z.number().int().min(0).max(1_000).default(0),
  sort: z.enum(["relevance", "pub_date", "author", "journal"]).default("relevance"),
  dateRange: z.object({
    minDate: z.string().trim().regex(/^\d{4}(?:[/. -]\d{1,2}(?:[/. -]\d{1,2})?)?$/),
    maxDate: z.string().trim().regex(/^\d{4}(?:[/. -]\d{1,2}(?:[/. -]\d{1,2})?)?$/),
    dateType: z.enum(["pdat", "mdat", "edat"]).default("pdat"),
  }).strict().optional(),
  publicationTypes: z.array(shortText).max(5).optional(),
  author: shortText.optional(),
  journal: shortText.optional(),
  meshTerms: z.array(shortText).max(5).optional(),
  language: z.string().trim().min(2).max(30).regex(/^[A-Za-z -]+$/).optional(),
  hasAbstract: z.boolean().optional(),
  freeFullText: z.boolean().optional(),
  species: z.enum(["humans", "animals"]).optional(),
  summaryCount: z.number().int().min(0).max(10).default(5),
}).strict();

const fulltextInput = z.object({
  pmcids: boundedStringArray(pmcid, 2).optional(),
  pmids: boundedStringArray(pmid, 2).optional(),
  dois: boundedStringArray(doi, 2).optional(),
  includeReferences: z.boolean().default(false),
  maxSections: z.number().int().min(1).max(10).default(5),
  sections: z.array(shortText).max(5).optional(),
}).strict().superRefine((value, context) => {
  if ([value.pmcids, value.pmids, value.dois].filter(Boolean).length !== 1) {
    context.addIssue({ code: "custom", message: "pmcids、pmids、dois 必须且只能提供一种。" });
  }
});

const citationRow = z.object({
  journal: shortText.optional(),
  year: z.string().trim().regex(/^\d{4}$/).optional(),
  volume: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9 .-]+$/).optional(),
  firstPage: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9 .-]+$/).optional(),
  authorName: shortText.optional(),
  key: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._~-]+$/).optional(),
}).strict().refine((value) => value.journal || value.year, "每条引用至少需要 journal 或 year。");

const inputSchemas = {
  pubmed_search_articles: searchInput,
  pubmed_fetch_articles: z.object({
    pmids: boundedStringArray(pmid, 5),
    includeMesh: z.boolean().default(true),
    includeGrants: z.boolean().default(false),
  }).strict(),
  pubmed_fetch_fulltext: fulltextInput,
  pubmed_format_citations: z.object({
    pmids: boundedStringArray(pmid, 5),
    format: z.union([
      z.enum(["apa", "mla", "bibtex", "ris", "vancouver"]),
      z.array(z.enum(["apa", "mla", "bibtex", "ris", "vancouver"])).min(1).max(3),
    ]).default("apa"),
  }).strict(),
  pubmed_find_related: z.object({
    pmid,
    relationship: z.enum(["similar", "cited_by", "references"]).default("similar"),
    maxResults: z.number().int().min(1).max(10).default(5),
    offset: z.number().int().min(0).max(100).default(0),
  }).strict(),
  pubmed_spell_check: z.object({ query: z.string().trim().min(2).max(200) }).strict(),
  pubmed_lookup_mesh: z.object({
    query: queryText,
    maxResults: z.number().int().min(1).max(10).default(5),
    includeDetails: z.boolean().default(true),
  }).strict(),
  pubmed_lookup_citation: z.object({ citations: z.array(citationRow).min(1).max(5) }).strict(),
  pubmed_convert_ids: z.discriminatedUnion("idType", [
    z.object({ ids: boundedStringArray(pmid, 10), idType: z.literal("pmid") }).strict(),
    z.object({ ids: boundedStringArray(pmcid, 10), idType: z.literal("pmcid") }).strict(),
    z.object({ ids: boundedStringArray(doi, 10), idType: z.literal("doi") }).strict(),
  ]),
  pubmed_europepmc_search: z.object({
    query: queryText,
    pageSize: z.number().int().min(1).max(10).default(5),
    cursorMark: z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9+/=_:.*~-]+$/).default("*"),
    sources: z.array(z.enum(["MED", "PMC", "PPR", "PAT", "AGR"])).min(1).max(5).optional(),
    resultType: z.enum(["core", "lite"]).default("core"),
    sort: z.enum(["P_PDATE_D asc", "P_PDATE_D desc", "CITED asc", "CITED desc", "AUTH_FIRST asc", "AUTH_FIRST desc", "PUB_YEAR asc", "PUB_YEAR desc"]).optional(),
  }).strict(),
} satisfies Record<string, z.ZodType>;

const promptSchema = z.object({
  title: text(300),
  goal: text(1_000),
  keywords: text(500),
  organism: text(120).optional(),
  includeAgentPrompts: z.enum(["true", "false"]).default("true"),
}).strict();

export function validatedPubmedProxy(environment: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  const upper = environment.HTTPS_PROXY?.trim();
  const lower = environment.https_proxy?.trim();
  if (upper && lower && upper !== lower) throw new InvocationValidationError("部署环境中的 HTTPS_PROXY 配置冲突。");
  const value = upper || lower;
  if (!value) return undefined;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new InvocationValidationError("部署代理必须是有效 URL。"); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new InvocationValidationError("部署代理只允许无凭据、无路径、无查询和无片段的 http/https origin。");
  }
  return parsed.toString();
}

function parseInput(tool: string, input: unknown): Record<string, unknown> {
  const schema = inputSchemas[tool as keyof typeof inputSchemas];
  if (!schema) throw new InvocationValidationError(`PubMed Web 适配未开放工具：${tool}`);
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) throw new InvocationValidationError(parsed.error.issues.map((issue) => `${issue.path.join('.') || '参数'}: ${issue.message}`).join('；'));
  return parsed.data as Record<string, unknown>;
}

function inspectBoundedJson(value: unknown): void {
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 80_000 || depth > 20) throw new InvocationValidationError("PubMed 结果结构超过安全上限。");
    if (typeof item === 'string' && item.length > 2_000_000) throw new InvocationValidationError("PubMed 单个文本字段超过安全上限。");
    if (Array.isArray(item)) {
      if (item.length > 10_000) throw new InvocationValidationError("PubMed 结果数组超过安全上限。");
      item.forEach((entry) => visit(entry, depth + 1));
    } else if (item && typeof item === 'object') {
      Object.values(item as Record<string, unknown>).forEach((entry) => visit(entry, depth + 1));
    }
  };
  visit(value, 0);
}

async function requireDirectory(target: string, label: string): Promise<void> {
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new InvocationValidationError(`${label}不能是符号链接或目录联接。`);
}

async function ensureSandbox(root: string): Promise<string> {
  const resolved = path.resolve(root);
  await mkdir(resolved, { recursive: true });
  await requireDirectory(resolved, "PubMed 运行目录");
  return resolved;
}

function defaultRoot(): string { return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "pubmed"); }
function packageRoot(): string { return path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "@cyanheads", "pubmed-mcp-server"); }
function bootstrap(): string { return path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "pubmed-mcp-entry.mjs"); }

function summary(tool: string, payload: Record<string, unknown>): string {
  const length = (key: string) => Array.isArray(payload[key]) ? payload[key].length : 0;
  if (tool === "pubmed_search_articles") return `PubMed 返回 ${length("pmids")} 个 PMID。`;
  if (tool === "pubmed_europepmc_search") return `Europe PMC 返回 ${length("hits")} 条记录。`;
  if (tool === "pubmed_fetch_articles" || tool === "pubmed_fetch_fulltext") return `PubMed 返回 ${length("articles")} 篇文章。`;
  if (tool === "pubmed_format_citations") return `PubMed 格式化 ${length("citations")} 条引用。`;
  if (tool === "pubmed_find_related") return `PubMed 返回 ${length("articles")} 篇关联文章。`;
  if (tool === "pubmed_lookup_mesh") return `MeSH 返回 ${length("results")} 个主题词。`;
  if (tool === "pubmed_lookup_citation") return `PubMed 反查 ${length("results")} 条引用。`;
  if (tool === "pubmed_convert_ids") return `PMC 转换器返回 ${length("records")} 条标识符记录。`;
  if (tool === "pubmed_spell_check") return `PubMed 拼写建议：${String(payload.corrected ?? payload.original ?? "无")}`;
  return "PubMed 已返回结构化结果。";
}

export const pubmedAdapter: PluginAdapter = {
  slug: "pubmed-evidence-lab",
  allowedTools: Object.keys(inputSchemas),
  allowedResourceTemplates: ["database-info"],
  allowedPrompts: ["research_plan"],
  requestTimeoutMs(tool) {
    if (tool === "pubmed_fetch_fulltext" || tool === "pubmed_find_related") return 90_000;
    return 60_000;
  },
  persistentSession: {
    key(context) { return path.resolve((context as PubmedContext).pubmedRoot ?? defaultRoot()); },
    idleMs: 20_000,
  },
  async validateAndTransform(tool, input) {
    return parseInput(tool, input);
  },
  async validateResourceUri(uri) {
    if (uri !== "pubmed://database/info") throw new InvocationValidationError("PubMed 资源 URI 必须是 pubmed://database/info。");
    return uri;
  },
  async validatePromptAndTransform(prompt, input) {
    if (prompt !== "research_plan") throw new InvocationValidationError(`PubMed Web 适配未开放提示：${prompt}`);
    const parsed = promptSchema.safeParse(input ?? {});
    if (!parsed.success) throw new InvocationValidationError(parsed.error.issues.map((issue) => `${issue.path.join('.') || '参数'}: ${issue.message}`).join('；'));
    return parsed.data;
  },
  async prepare(rawContext) {
    if (Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10) < 24) throw new InvocationValidationError("PubMed MCP 2.9.8 需要 Node.js 24 或更新版本。");
    const context = rawContext as PubmedContext;
    const root = await ensureSandbox(context.pubmedRoot ?? defaultRoot());
    const pkg = packageRoot();
    const entry = bootstrap();
    try {
      await Promise.all([access(path.join(pkg, "dist", "index.js")), access(entry)]);
      const metadata = JSON.parse(await readFile(path.join(pkg, "package.json"), "utf8")) as { version?: unknown };
      if (metadata.version !== "2.9.8") throw new Error("version mismatch");
    } catch {
      throw new InvocationValidationError("PubMed MCP 2.9.8 尚未按固定 lockfile 安装。");
    }
    const proxy = validatedPubmedProxy();
    return {
      command: process.execPath,
      args: ["--max-old-space-size=256", entry],
      cwd: root,
      env: {
        NODE_USE_ENV_PROXY: "1",
        ...(proxy ? { HTTPS_PROXY: proxy } : {}),
        MCP_TRANSPORT_TYPE: "stdio",
        MCP_LOG_LEVEL: "emerg",
        NO_COLOR: "1",
        NODE_ENV: "production",
      },
    };
  },
  async normalizeResult(tool, result: AdapterToolResult) {
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > RESULT_LIMIT) throw new InvocationValidationError("PubMed 结果超过 4 MiB 安全上限。");
    if (result.isError) {
      const block = result.content.find((item): item is { type: "text"; text: string } => (
        !!item && typeof item === "object" && (item as { type?: unknown }).type === "text" && typeof (item as { text?: unknown }).text === "string"
      ));
      return { content: [{ type: "text", text: block?.text.slice(0, 40_000) || "PubMed 返回了受控错误。" }], isError: true };
    }
    if (!result.structuredContent || typeof result.structuredContent !== "object" || Array.isArray(result.structuredContent)) {
      throw new InvocationValidationError("PubMed 返回结果缺少结构化内容。");
    }
    inspectBoundedJson(result.structuredContent);
    return {
      content: [{ type: "text", text: summary(tool, result.structuredContent) }],
      structuredContent: result.structuredContent,
      isError: false,
    };
  },
};

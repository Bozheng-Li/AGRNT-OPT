import { access, lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

const RESULT_LIMIT = 1_500_000;
const workId = z.string().trim().regex(/^OL\d{1,12}W$/i, "Work ID 必须是 OL...W。 ").transform((value) => value.toUpperCase());
const authorId = z.string().trim().regex(/^OL\d{1,12}A$/i, "Author ID 必须是 OL...A。 ").transform((value) => value.toUpperCase());
const editionId = z.string().trim().regex(/^OL\d{1,12}M$/i, "Edition ID 必须是 OL...M。 ").transform((value) => value.toUpperCase());
const queryText = z.string().trim().min(1).max(200).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "输入不能包含控制字符。");
const limit = z.number().int().min(1).max(12).default(10);
const offset = z.number().int().min(0).max(2_000).default(0);
const isbn = z.string().trim().max(24).regex(/^(?:\d[ -]?){9}[\dXx]$|^(?:\d[ -]?){13}$/, "ISBN 必须是 10 或 13 位。");

const searchBooks = z
  .object({
    query: queryText.optional(),
    title: queryText.optional(),
    author: queryText.optional(),
    subject: queryText.optional(),
    publisher: queryText.optional(),
    isbn: isbn.optional(),
    language: z.string().trim().regex(/^[a-z]{2}$/i, "语言必须是两位 ISO 639-1 代码。").transform((value) => value.toLowerCase()).optional(),
    sort: z.enum(["relevance", "new", "old", "rating", "editions"]).default("relevance"),
    limit,
    offset,
    include_availability: z.boolean().default(false),
  })
  .strict()
  .refine((value) => [value.query, value.title, value.author, value.subject, value.publisher, value.isbn].some(Boolean), {
    message: "至少提供一个搜索词或字段筛选。",
  });
const identifier = z.discriminatedUnion("id_type", [
  z.object({ identifier: isbn, id_type: z.literal("isbn") }).strict(),
  z.object({ identifier: z.string().trim().regex(/^\d{1,20}$/), id_type: z.literal("oclc") }).strict(),
  z.object({ identifier: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9 -]+$/), id_type: z.literal("lccn") }).strict(),
  z.object({ identifier: editionId, id_type: z.literal("olid") }).strict(),
]);
const coverInput = z
  .object({
    identifier: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9-]+$/, "封面标识只允许字母、数字和连字符。"),
    id_type: z.enum(["id", "isbn", "olid"]),
    target: z.enum(["book", "author"]).default("book"),
    size: z.enum(["S", "M", "L"]).default("M"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.id_type === "id" && !/^\d{1,20}$/.test(value.identifier)) context.addIssue({ code: "custom", path: ["identifier"], message: "数字封面 ID 格式无效。" });
    if (value.id_type === "isbn" && !/^(?:\d[ -]?){9}[\dXx]$|^(?:\d[ -]?){13}$/.test(value.identifier)) context.addIssue({ code: "custom", path: ["identifier"], message: "ISBN 格式无效。" });
    if (value.id_type === "olid") {
      const pattern = value.target === "author" ? /^OL\d{1,12}A$/i : /^OL\d{1,12}M$/i;
      if (!pattern.test(value.identifier)) context.addIssue({ code: "custom", path: ["identifier"], message: "OLID 与目标类型不匹配。" });
    }
    if (value.target === "author" && value.id_type === "isbn") context.addIssue({ code: "custom", path: ["id_type"], message: "作者照片不能通过 ISBN 解析。" });
  });

const inputSchemas = {
  openlibrary_search_books: searchBooks,
  openlibrary_get_work: z.object({ work_id: workId }).strict(),
  openlibrary_get_editions: z.object({ work_id: workId, limit, offset }).strict(),
  openlibrary_get_edition: identifier,
  openlibrary_search_authors: z.object({ query: queryText, limit, offset }).strict(),
  openlibrary_get_author: z.object({ author_id: authorId }).strict(),
  openlibrary_get_author_works: z.object({ author_id: authorId, limit, offset }).strict(),
  openlibrary_get_subject: z.object({ subject: queryText, limit, offset }).strict(),
  openlibrary_get_cover_url: coverInput,
} satisfies Record<string, z.ZodType>;

const shortString = z.string().max(20_000);
const boundedArray = z.array(z.unknown()).max(2_000);
const outputSchemas = {
  openlibrary_search_books: z.object({ total: z.number().nonnegative(), offset: z.number().nonnegative(), works: z.array(z.object({ work_id: shortString, title: shortString }).passthrough()).max(12) }).passthrough(),
  openlibrary_get_work: z.object({ work_id: shortString, title: shortString, subjects: boundedArray, author_ids: boundedArray }).passthrough(),
  openlibrary_get_editions: z.object({ total: z.number().nonnegative(), work_id: shortString, editions: z.array(z.object({ edition_id: shortString, title: shortString }).passthrough()).max(12) }).passthrough(),
  openlibrary_get_edition: z.object({ edition_id: shortString, title: shortString, authors: boundedArray, isbn_10: boundedArray, isbn_13: boundedArray }).passthrough(),
  openlibrary_search_authors: z.object({ total: z.number().nonnegative(), authors: z.array(z.object({ author_id: shortString, name: shortString }).passthrough()).max(12) }).passthrough(),
  openlibrary_get_author: z.object({ author_id: shortString, name: shortString, photo_ids: boundedArray, remote_ids: z.record(z.string(), z.unknown()) }).passthrough(),
  openlibrary_get_author_works: z.object({ total: z.number().nonnegative(), author_id: shortString, works: z.array(z.object({ work_id: shortString, title: shortString }).passthrough()).max(12) }).passthrough(),
  openlibrary_get_subject: z.object({ subject_name: shortString, subject_key: shortString, work_count: z.number().nonnegative(), works: z.array(z.object({ work_id: shortString, title: shortString }).passthrough()).max(12) }).passthrough(),
  openlibrary_get_cover_url: z.object({
    url: z.string().url().max(500).regex(/^https:\/\/covers\.openlibrary\.org\/(?:a|b)\/(?:id|isbn|olid)\/[A-Za-z0-9-]+-[SML]\.jpg$/),
    note: z.string().max(2_000),
  }).strict(),
} satisfies Record<string, z.ZodType>;

type OpenLibraryContext = AdapterContext & { openLibraryRoot?: string };

export function validatedOpenLibraryProxy(environment: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
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
  if (!schema) throw new InvocationValidationError(`OpenLibrary Web 适配未开放工具：${tool}`);
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) throw new InvocationValidationError(parsed.error.issues.map((issue) => `${issue.path.join('.') || '参数'}: ${issue.message}`).join('；'));
  return parsed.data as Record<string, unknown>;
}

function inspectBoundedJson(value: unknown): void {
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 20_000 || depth > 16) throw new InvocationValidationError("OpenLibrary 结果结构超过安全上限。");
    if (typeof item === 'string' && item.length > 250_000) throw new InvocationValidationError("OpenLibrary 单个文本字段超过安全上限。");
    if (Array.isArray(item)) { if (item.length > 4_000) throw new InvocationValidationError("OpenLibrary 结果数组超过安全上限。"); item.forEach((entry) => visit(entry, depth + 1)); }
    else if (item && typeof item === 'object') Object.values(item as Record<string, unknown>).forEach((entry) => visit(entry, depth + 1));
  };
  visit(value, 0);
}

async function requireDirectory(target: string, label: string): Promise<void> {
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new InvocationValidationError(`${label}不能是符号链接或目录联接。`);
}

async function ensureSandbox(root: string): Promise<{ root: string; tmp: string; logs: string }> {
  const resolved = path.resolve(root);
  const tmp = path.join(resolved, 'tmp');
  const logs = path.join(resolved, 'logs');
  await Promise.all([mkdir(resolved, { recursive: true }), mkdir(tmp, { recursive: true }), mkdir(logs, { recursive: true })]);
  await Promise.all([requireDirectory(resolved, 'OpenLibrary 运行目录'), requireDirectory(tmp, 'OpenLibrary 临时目录'), requireDirectory(logs, 'OpenLibrary 日志目录')]);
  return { root: resolved, tmp, logs };
}

function defaultRoot(): string { return path.join(/* turbopackIgnore: true */ process.cwd(), 'var', 'runtime', 'openlibrary'); }
function entryPoint(): string { return path.join(/* turbopackIgnore: true */ process.cwd(), 'node_modules', '@cyanheads', 'openlibrary-mcp-server', 'dist', 'index.js'); }
function bootstrap(): string { return path.join(/* turbopackIgnore: true */ process.cwd(), 'scripts', 'openlibrary-mcp-entry.mjs'); }

function summary(tool: string, payload: Record<string, unknown>): string {
  if (tool === 'openlibrary_search_books') return `Open Library 返回 ${String((payload.works as unknown[])?.length ?? 0)} 部作品。`;
  if (tool === 'openlibrary_search_authors') return `Open Library 返回 ${String((payload.authors as unknown[])?.length ?? 0)} 位作者。`;
  if (tool === 'openlibrary_get_editions') return `Open Library 返回 ${String((payload.editions as unknown[])?.length ?? 0)} 个版本。`;
  if (tool === 'openlibrary_get_author_works' || tool === 'openlibrary_get_subject') return `Open Library 返回 ${String((payload.works as unknown[])?.length ?? 0)} 部作品。`;
  return `Open Library 已返回 ${String(payload.title ?? payload.name ?? payload.url ?? '记录')}。`;
}

export const openLibraryAdapter: PluginAdapter = {
  slug: 'openlibrary-research-desk',
  allowedTools: Object.keys(inputSchemas),
  allowedResourceTemplates: ['openlibrary-work', 'openlibrary-author'],
  requestTimeoutMs() { return 30_000; },
  async validateAndTransform(tool, input) { return parseInput(tool, input); },
  async validateResourceUri(uri) {
    if (typeof uri !== 'string' || uri.length > 100) throw new InvocationValidationError('OpenLibrary 资源 URI 无效。');
    const match = uri.match(/^openlibrary:\/\/(?:works\/(OL\d{1,12}W)|authors\/(OL\d{1,12}A))$/i);
    if (!match) throw new InvocationValidationError('OpenLibrary 资源只接受固定 Work 或 Author URI。');
    const kind = match[1] ? 'works' : 'authors';
    const id = (match[1] ?? match[2]!).toUpperCase();
    return `openlibrary://${kind}/${id}`;
  },
  async prepare(context) {
    if (Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10) < 24) throw new InvocationValidationError('OpenLibrary MCP 0.1.18 需要 Node.js 24 或更新版本。');
    try { await Promise.all([access(entryPoint()), access(bootstrap())]); } catch { throw new InvocationValidationError('OpenLibrary MCP 0.1.18 尚未安装。'); }
    const root = await ensureSandbox((context as OpenLibraryContext).openLibraryRoot ?? defaultRoot());
    const proxy = validatedOpenLibraryProxy();
    return {
      command: process.execPath,
      args: ['--max-old-space-size=256', bootstrap()],
      cwd: root.root,
      env: {
        HOME: root.root, USERPROFILE: root.root, TEMP: root.tmp, TMP: root.tmp, TMPDIR: root.tmp, LOGS_DIR: root.logs,
        MCP_TRANSPORT_TYPE: 'stdio', MCP_LOG_LEVEL: 'emerg', STORAGE_PROVIDER_TYPE: 'in-memory', IS_SERVERLESS: 'true', OTEL_ENABLED: 'false',
        NODE_USE_ENV_PROXY: '1', ...(proxy ? { HTTPS_PROXY: proxy } : {}), NO_COLOR: '1',
      },
    };
  },
  async normalizeResult(tool, result: AdapterToolResult) {
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > RESULT_LIMIT) throw new InvocationValidationError('OpenLibrary 结果超过 1.5 MiB 安全上限。');
    if (result.isError) {
      const block = result.content.find((item): item is { type: 'text'; text: string } => Boolean(item && typeof item === 'object' && (item as { type?: unknown }).type === 'text' && typeof (item as { text?: unknown }).text === 'string'));
      return { content: [{ type: 'text', text: block?.text.slice(0, 32_000) || 'Open Library 返回了受控错误。' }], isError: true };
    }
    inspectBoundedJson(result.structuredContent);
    const schema = outputSchemas[tool as keyof typeof outputSchemas];
    const parsed = schema?.safeParse(result.structuredContent);
    if (!parsed?.success) throw new InvocationValidationError('OpenLibrary 返回结果不符合固定 0.1.18 协议结构。');
    const structuredContent = parsed.data as Record<string, unknown>;
    return { content: [{ type: 'text', text: summary(tool, structuredContent) }], structuredContent, isError: false };
  },
};

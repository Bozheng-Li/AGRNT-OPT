import { createHash, randomUUID } from "node:crypto";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { InvocationValidationError } from "./errors";
import type { AdapterToolResult } from "./adapters";

export type LocalMcpToolDef = {
  name: string;
  description: string;
  schema: z.ZodType;
  run(input: Record<string, unknown>): AdapterToolResult | Promise<AdapterToolResult>;
};

function ok(text: string, structured?: Record<string, unknown>): AdapterToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: structured ?? { text },
    isError: false,
  };
}

function fail(message: string): never {
  throw new InvocationValidationError(message);
}

export const localMcpCatalog: Record<
  string,
  {
    id: string;
    name: { original: string; zhCN: string };
    summary: { original: string; zhCN: string };
    categories: string[];
    tags: string[];
    score: number;
    tools: LocalMcpToolDef[];
  }
> = {
  "local-json-lab": {
    id: "agent-opt.local/json-lab",
    name: { original: "JSON Lab", zhCN: "JSON 实验室" },
    summary: {
      original: "Format, minify, and validate JSON text locally.",
      zhCN: "本地格式化、压缩与校验 JSON 文本。",
    },
    categories: ["developer-tools", "data"],
    tags: ["MCP", "JSON", "local"],
    score: 86,
    tools: [
      {
        name: "format_json",
        description: "Pretty-print JSON",
        schema: z.object({ text: z.string().min(1).max(200_000), indent: z.number().int().min(0).max(8).default(2) }).strict(),
        run(input) {
          try {
            const value = JSON.parse(String(input.text));
            const text = JSON.stringify(value, null, Number(input.indent ?? 2));
            return ok(text, { valid: true, text, type: Array.isArray(value) ? "array" : typeof value });
          } catch (error) {
            fail(`JSON 无效：${error instanceof Error ? error.message : "parse error"}`);
          }
        },
      },
      {
        name: "minify_json",
        description: "Minify JSON",
        schema: z.object({ text: z.string().min(1).max(200_000) }).strict(),
        run(input) {
          try {
            const text = JSON.stringify(JSON.parse(String(input.text)));
            return ok(text, { valid: true, text, bytes: Buffer.byteLength(text) });
          } catch (error) {
            fail(`JSON 无效：${error instanceof Error ? error.message : "parse error"}`);
          }
        },
      },
      {
        name: "validate_json",
        description: "Validate JSON",
        schema: z.object({ text: z.string().min(1).max(200_000) }).strict(),
        run(input) {
          try {
            JSON.parse(String(input.text));
            return ok("valid", { valid: true });
          } catch (error) {
            return ok("invalid", {
              valid: false,
              error: error instanceof Error ? error.message : "parse error",
            });
          }
        },
      },
    ],
  },
  "local-base64-codec": {
    id: "agent-opt.local/base64-codec",
    name: { original: "Base64 Codec", zhCN: "Base64 编解码" },
    summary: { original: "Encode and decode Base64 strings.", zhCN: "对文本做 Base64 编码与解码。" },
    categories: ["developer-tools"],
    tags: ["MCP", "base64", "local"],
    score: 84,
    tools: [
      {
        name: "encode_base64",
        description: "Encode UTF-8 text to Base64",
        schema: z.object({ text: z.string().max(200_000) }).strict(),
        run(input) {
          const text = Buffer.from(String(input.text ?? ""), "utf8").toString("base64");
          return ok(text, { text });
        },
      },
      {
        name: "decode_base64",
        description: "Decode Base64 to UTF-8 text",
        schema: z.object({ text: z.string().min(1).max(300_000) }).strict(),
        run(input) {
          try {
            const text = Buffer.from(String(input.text), "base64").toString("utf8");
            return ok(text, { text });
          } catch {
            fail("Base64 解码失败。");
          }
        },
      },
    ],
  },
  "local-uuid-factory": {
    id: "agent-opt.local/uuid-factory",
    name: { original: "UUID Factory", zhCN: "UUID 工厂" },
    summary: { original: "Generate UUID v4 identifiers.", zhCN: "生成 UUID v4 标识符。" },
    categories: ["developer-tools"],
    tags: ["MCP", "uuid", "local"],
    score: 83,
    tools: [
      {
        name: "generate_uuid",
        description: "Generate one or more UUID v4 values",
        schema: z.object({ count: z.number().int().min(1).max(50).default(1) }).strict(),
        run(input) {
          const count = Number(input.count ?? 1);
          const values = Array.from({ length: count }, () => randomUUID());
          return ok(values.join("\n"), { values, count });
        },
      },
    ],
  },
  "local-hash-lab": {
    id: "agent-opt.local/hash-lab",
    name: { original: "Hash Lab", zhCN: "哈希实验室" },
    summary: { original: "Compute SHA-256 / SHA-1 / MD5 digests.", zhCN: "计算 SHA-256 / SHA-1 / MD5 摘要。" },
    categories: ["security", "developer-tools"],
    tags: ["MCP", "hash", "local"],
    score: 85,
    tools: [
      {
        name: "digest",
        description: "Hash text with a selected algorithm",
        schema: z
          .object({
            text: z.string().max(200_000),
            algorithm: z.enum(["sha256", "sha1", "md5"]).default("sha256"),
          })
          .strict(),
        run(input) {
          const algorithm = String(input.algorithm ?? "sha256");
          const digest = createHash(algorithm).update(String(input.text ?? ""), "utf8").digest("hex");
          return ok(digest, { algorithm, digest, bytes: Buffer.byteLength(String(input.text ?? "")) });
        },
      },
    ],
  },
  "local-url-lab": {
    id: "agent-opt.local/url-lab",
    name: { original: "URL Lab", zhCN: "URL 实验室" },
    summary: { original: "Parse and inspect absolute URLs.", zhCN: "解析并检查绝对 URL。" },
    categories: ["developer-tools", "web"],
    tags: ["MCP", "url", "local"],
    score: 84,
    tools: [
      {
        name: "parse_url",
        description: "Parse a URL into components",
        schema: z.object({ url: z.string().min(1).max(4_000) }).strict(),
        run(input) {
          try {
            const u = new URL(String(input.url));
            const payload = {
              href: u.href,
              protocol: u.protocol,
              host: u.host,
              hostname: u.hostname,
              port: u.port,
              pathname: u.pathname,
              search: u.search,
              hash: u.hash,
              origin: u.origin,
            };
            return ok(JSON.stringify(payload, null, 2), payload);
          } catch {
            fail("URL 无效，请提供绝对 URL。");
          }
        },
      },
    ],
  },
  "local-regex-lab": {
    id: "agent-opt.local/regex-lab",
    name: { original: "Regex Lab", zhCN: "正则实验室" },
    summary: { original: "Test regular expressions against sample text.", zhCN: "用样本文本测试正则表达式。" },
    categories: ["developer-tools"],
    tags: ["MCP", "regex", "local"],
    score: 85,
    tools: [
      {
        name: "test_regex",
        description: "Find matches for a pattern",
        schema: z
          .object({
            pattern: z.string().min(1).max(500),
            flags: z.string().max(10).default("g"),
            text: z.string().max(100_000),
          })
          .strict(),
        run(input) {
          try {
            const flags = String(input.flags ?? "g");
            if (!/^[gimsuy]*$/.test(flags)) fail("正则 flags 非法。");
            const re = new RegExp(String(input.pattern), flags.includes("g") ? flags : `${flags}g`);
            const matches = [...String(input.text ?? "").matchAll(re)].slice(0, 100).map((m) => ({
              match: m[0],
              index: m.index ?? 0,
              groups: m.slice(1),
            }));
            return ok(JSON.stringify(matches, null, 2), { matchCount: matches.length, matches });
          } catch (error) {
            fail(`正则无效：${error instanceof Error ? error.message : "error"}`);
          }
        },
      },
    ],
  },
  "local-cron-lab": {
    id: "agent-opt.local/cron-lab",
    name: { original: "Cron Lab", zhCN: "Cron 实验室" },
    summary: { original: "Validate 5-field cron expressions.", zhCN: "校验 5 段 cron 表达式。" },
    categories: ["developer-tools", "ops"],
    tags: ["MCP", "cron", "local"],
    score: 80,
    tools: [
      {
        name: "validate_cron",
        description: "Validate a classic 5-field cron string",
        schema: z.object({ expression: z.string().min(1).max(120) }).strict(),
        run(input) {
          const expression = String(input.expression).trim();
          const parts = expression.split(/\s+/);
          if (parts.length !== 5) fail("需要 5 段 cron：分 时 日 月 周。");
          const labels = ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"];
          const ranges = [
            [0, 59],
            [0, 23],
            [1, 31],
            [1, 12],
            [0, 7],
          ] as const;
          const fields: Record<string, string> = {};
          parts.forEach((part, i) => {
            if (!/^(\*|([0-9]|[1-5][0-9])|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+(,[0-9]+)*)$/.test(part) && part !== "*") {
              // allow common tokens
              if (!/^(\*(\/[1-9][0-9]*)?|[0-9]{1,2}(-[0-9]{1,2})?(,[0-9]{1,2}(-[0-9]{1,2})?)*)$/.test(part)) {
                fail(`字段 ${labels[i]} 格式无效：${part}`);
              }
            }
            fields[labels[i]!] = part;
          });
          return ok("valid", { valid: true, expression, fields, ranges });
        },
      },
    ],
  },
  "local-markdown-stats": {
    id: "agent-opt.local/markdown-stats",
    name: { original: "Markdown Stats", zhCN: "Markdown 统计" },
    summary: { original: "Count words, headings, and links in Markdown.", zhCN: "统计 Markdown 字数、标题与链接。" },
    categories: ["writing", "developer-tools"],
    tags: ["MCP", "markdown", "local"],
    score: 82,
    tools: [
      {
        name: "analyze_markdown",
        description: "Analyze markdown text",
        schema: z.object({ text: z.string().max(200_000) }).strict(),
        run(input) {
          const text = String(input.text ?? "");
          const lines = text.split(/\r?\n/);
          const headings = lines.filter((l) => /^#{1,6}\s+/.test(l)).length;
          const links = [...text.matchAll(/\[[^\]]*\]\([^)]+\)/g)].length;
          const codeFences = [...text.matchAll(/^```/gm)].length;
          const words = text.trim() ? text.trim().split(/\s+/).length : 0;
          const payload = {
            characters: text.length,
            lines: lines.length,
            words,
            headings,
            links,
            codeFenceMarkers: codeFences,
          };
          return ok(JSON.stringify(payload, null, 2), payload);
        },
      },
    ],
  },
  "local-csv-json": {
    id: "agent-opt.local/csv-json",
    name: { original: "CSV ↔ JSON", zhCN: "CSV 与 JSON 转换" },
    summary: { original: "Convert simple CSV tables to JSON arrays.", zhCN: "把简单 CSV 表转换为 JSON 数组。" },
    categories: ["data", "developer-tools"],
    tags: ["MCP", "csv", "json", "local"],
    score: 83,
    tools: [
      {
        name: "csv_to_json",
        description: "Convert CSV with header row to JSON",
        schema: z.object({ text: z.string().min(1).max(200_000), delimiter: z.string().min(1).max(1).default(",") }).strict(),
        run(input) {
          const delimiter = String(input.delimiter ?? ",");
          const rows = String(input.text)
            .replace(/\r\n/g, "\n")
            .split("\n")
            .filter((line) => line.length > 0)
            .map((line) => line.split(delimiter).map((cell) => cell.trim()));
          if (rows.length < 2) fail("至少需要表头行与一行数据。");
          const header = rows[0]!;
          if (new Set(header).size !== header.length) fail("表头列名必须唯一。");
          const data = rows.slice(1, 501).map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ""])));
          return ok(JSON.stringify(data, null, 2), { rowCount: data.length, columns: header, data });
        },
      },
    ],
  },
  "local-yaml-lab": {
    id: "agent-opt.local/yaml-lab",
    name: { original: "YAML Lab", zhCN: "YAML 实验室" },
    summary: { original: "Parse YAML and emit JSON.", zhCN: "解析 YAML 并输出 JSON。" },
    categories: ["developer-tools", "data"],
    tags: ["MCP", "yaml", "local"],
    score: 84,
    tools: [
      {
        name: "yaml_to_json",
        description: "Parse YAML document to JSON",
        schema: z.object({ text: z.string().min(1).max(200_000) }).strict(),
        run(input) {
          try {
            const value = parseYaml(String(input.text));
            const text = JSON.stringify(value, null, 2);
            return ok(text, { valid: true, value });
          } catch (error) {
            fail(`YAML 无效：${error instanceof Error ? error.message : "parse error"}`);
          }
        },
      },
    ],
  },
  "local-text-case": {
    id: "agent-opt.local/text-case",
    name: { original: "Text Case Tools", zhCN: "文本大小写工具" },
    summary: { original: "Convert text between common case styles.", zhCN: "在常见大小写风格之间转换文本。" },
    categories: ["writing", "developer-tools"],
    tags: ["MCP", "text", "local"],
    score: 80,
    tools: [
      {
        name: "convert_case",
        description: "Convert case style",
        schema: z
          .object({
            text: z.string().max(50_000),
            style: z.enum(["upper", "lower", "title", "snake", "kebab", "camel"]).default("lower"),
          })
          .strict(),
        run(input) {
          const text = String(input.text ?? "");
          const style = String(input.style ?? "lower");
          const words = text
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[_\-]+/g, " ")
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          let result = text;
          if (style === "upper") result = text.toUpperCase();
          else if (style === "lower") result = text.toLowerCase();
          else if (style === "title") result = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
          else if (style === "snake") result = words.map((w) => w.toLowerCase()).join("_");
          else if (style === "kebab") result = words.map((w) => w.toLowerCase()).join("-");
          else if (style === "camel")
            result = words
              .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
              .join("");
          return ok(result, { style, text: result });
        },
      },
    ],
  },
  "local-slugify": {
    id: "agent-opt.local/slugify",
    name: { original: "Slugify", zhCN: "Slug 生成器" },
    summary: { original: "Turn titles into URL-safe slugs.", zhCN: "把标题转成 URL 安全的 slug。" },
    categories: ["web", "developer-tools"],
    tags: ["MCP", "slug", "local"],
    score: 81,
    tools: [
      {
        name: "slugify",
        description: "Slugify a string",
        schema: z.object({ text: z.string().min(1).max(2_000) }).strict(),
        run(input) {
          const text = String(input.text)
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 120);
          if (!text) fail("无法生成 slug。");
          return ok(text, { slug: text });
        },
      },
    ],
  },
  "local-word-count": {
    id: "agent-opt.local/word-count",
    name: { original: "Word Count", zhCN: "字数统计" },
    summary: { original: "Count characters, words, and lines.", zhCN: "统计字符、词与行数。" },
    categories: ["writing"],
    tags: ["MCP", "text", "local"],
    score: 79,
    tools: [
      {
        name: "count_text",
        description: "Count text metrics",
        schema: z.object({ text: z.string().max(200_000) }).strict(),
        run(input) {
          const text = String(input.text ?? "");
          const payload = {
            characters: text.length,
            charactersNoSpaces: text.replace(/\s/g, "").length,
            words: text.trim() ? text.trim().split(/\s+/).length : 0,
            lines: text.length ? text.split(/\r?\n/).length : 0,
          };
          return ok(JSON.stringify(payload, null, 2), payload);
        },
      },
    ],
  },
  "local-timestamp-lab": {
    id: "agent-opt.local/timestamp-lab",
    name: { original: "Timestamp Lab", zhCN: "时间戳实验室" },
    summary: { original: "Convert between epoch seconds/ms and ISO strings.", zhCN: "在 epoch 秒/毫秒与 ISO 时间之间转换。" },
    categories: ["developer-tools"],
    tags: ["MCP", "time", "local"],
    score: 83,
    tools: [
      {
        name: "now",
        description: "Current timestamps",
        schema: z.object({}).strict(),
        run() {
          const date = new Date();
          const payload = {
            iso: date.toISOString(),
            epochMs: date.getTime(),
            epochSeconds: Math.floor(date.getTime() / 1000),
          };
          return ok(JSON.stringify(payload, null, 2), payload);
        },
      },
      {
        name: "from_epoch",
        description: "Convert epoch to ISO",
        schema: z.object({ value: z.number(), unit: z.enum(["s", "ms"]).default("s") }).strict(),
        run(input) {
          const value = Number(input.value);
          const ms = String(input.unit ?? "s") === "ms" ? value : value * 1000;
          if (!Number.isFinite(ms)) fail("epoch 无效。");
          const iso = new Date(ms).toISOString();
          return ok(iso, { iso, epochMs: ms });
        },
      },
      {
        name: "to_epoch",
        description: "Convert ISO/date string to epoch",
        schema: z.object({ value: z.string().min(1).max(100) }).strict(),
        run(input) {
          const ms = Date.parse(String(input.value));
          if (!Number.isFinite(ms)) fail("日期字符串无法解析。");
          return ok(String(ms), { epochMs: ms, epochSeconds: Math.floor(ms / 1000), iso: new Date(ms).toISOString() });
        },
      },
    ],
  },
  "local-color-lab": {
    id: "agent-opt.local/color-lab",
    name: { original: "Color Lab", zhCN: "颜色实验室" },
    summary: { original: "Convert hex colors to RGB.", zhCN: "把十六进制颜色转换为 RGB。" },
    categories: ["design", "developer-tools"],
    tags: ["MCP", "color", "local"],
    score: 80,
    tools: [
      {
        name: "hex_to_rgb",
        description: "Convert #RGB or #RRGGBB to RGB",
        schema: z.object({ hex: z.string().min(4).max(9) }).strict(),
        run(input) {
          let hex = String(input.hex).trim().replace(/^#/, "");
          if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
          if (!/^[0-9a-fA-F]{6}$/.test(hex)) fail("需要 #RGB 或 #RRGGBB。");
          const r = Number.parseInt(hex.slice(0, 2), 16);
          const g = Number.parseInt(hex.slice(2, 4), 16);
          const b = Number.parseInt(hex.slice(4, 6), 16);
          const payload = { hex: `#${hex.toLowerCase()}`, r, g, b, css: `rgb(${r}, ${g}, ${b})` };
          return ok(JSON.stringify(payload), payload);
        },
      },
    ],
  },
  "local-jwt-inspect": {
    id: "agent-opt.local/jwt-inspect",
    name: { original: "JWT Inspect", zhCN: "JWT 检查器" },
    summary: {
      original: "Decode JWT header/payload without signature verification.",
      zhCN: "仅解码 JWT 头与载荷，不验证签名。",
    },
    categories: ["security", "developer-tools"],
    tags: ["MCP", "jwt", "local"],
    score: 82,
    tools: [
      {
        name: "decode_jwt",
        description: "Decode JWT parts (no verification)",
        schema: z.object({ token: z.string().min(10).max(20_000) }).strict(),
        run(input) {
          const parts = String(input.token).split(".");
          if (parts.length < 2) fail("JWT 至少需要 header.payload 两段。");
          const decode = (segment: string) => {
            const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
            const pad = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
            return JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
          };
          try {
            const header = decode(parts[0]!);
            const payload = decode(parts[1]!);
            return ok(JSON.stringify({ header, payload }, null, 2), {
              header,
              payload,
              verified: false,
              note: "签名未验证",
            });
          } catch {
            fail("JWT 段无法 Base64URL 解码为 JSON。");
          }
        },
      },
    ],
  },
  "local-html-escape": {
    id: "agent-opt.local/html-escape",
    name: { original: "HTML Escape", zhCN: "HTML 转义" },
    summary: { original: "Escape and unescape HTML entities.", zhCN: "转义与反转义 HTML 实体。" },
    categories: ["web", "security"],
    tags: ["MCP", "html", "local"],
    score: 81,
    tools: [
      {
        name: "escape_html",
        description: "Escape HTML special characters",
        schema: z.object({ text: z.string().max(100_000) }).strict(),
        run(input) {
          const text = String(input.text ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
          return ok(text, { text });
        },
      },
      {
        name: "unescape_html",
        description: "Unescape common HTML entities",
        schema: z.object({ text: z.string().max(100_000) }).strict(),
        run(input) {
          const text = String(input.text ?? "")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, "&");
          return ok(text, { text });
        },
      },
    ],
  },
  "local-percent-codec": {
    id: "agent-opt.local/percent-codec",
    name: { original: "Percent Codec", zhCN: "URL 百分号编解码" },
    summary: { original: "encodeURIComponent / decodeURIComponent helpers.", zhCN: "encodeURIComponent / decodeURIComponent 助手。" },
    categories: ["web", "developer-tools"],
    tags: ["MCP", "url", "local"],
    score: 80,
    tools: [
      {
        name: "encode",
        description: "Percent-encode a string",
        schema: z.object({ text: z.string().max(50_000) }).strict(),
        run(input) {
          const text = encodeURIComponent(String(input.text ?? ""));
          return ok(text, { text });
        },
      },
      {
        name: "decode",
        description: "Percent-decode a string",
        schema: z.object({ text: z.string().max(80_000) }).strict(),
        run(input) {
          try {
            const text = decodeURIComponent(String(input.text ?? ""));
            return ok(text, { text });
          } catch {
            fail("百分号解码失败。");
          }
        },
      },
    ],
  },
  "local-number-base": {
    id: "agent-opt.local/number-base",
    name: { original: "Number Base Converter", zhCN: "进制转换器" },
    summary: { original: "Convert integers between bases 2–36.", zhCN: "在 2–36 进制之间转换整数。" },
    categories: ["developer-tools", "math"],
    tags: ["MCP", "number", "local"],
    score: 82,
    tools: [
      {
        name: "convert_base",
        description: "Convert integer bases",
        schema: z
          .object({
            value: z.string().min(1).max(100),
            fromBase: z.number().int().min(2).max(36).default(10),
            toBase: z.number().int().min(2).max(36).default(16),
          })
          .strict(),
        run(input) {
          const fromBase = Number(input.fromBase ?? 10);
          const toBase = Number(input.toBase ?? 16);
          const n = Number.parseInt(String(input.value), fromBase);
          if (!Number.isFinite(n)) fail("无法按源进制解析。");
          const text = n.toString(toBase);
          return ok(text, { value: text, decimal: n, fromBase, toBase });
        },
      },
    ],
  },
  "local-line-tools": {
    id: "agent-opt.local/line-tools",
    name: { original: "Line Tools", zhCN: "行处理工具" },
    summary: { original: "Sort, unique, and reverse text lines.", zhCN: "对文本行排序、去重与反转。" },
    categories: ["developer-tools", "text"],
    tags: ["MCP", "text", "local"],
    score: 81,
    tools: [
      {
        name: "process_lines",
        description: "Sort/unique/reverse lines",
        schema: z
          .object({
            text: z.string().max(200_000),
            mode: z.enum(["sort", "unique", "reverse", "sort-unique"]).default("sort"),
          })
          .strict(),
        run(input) {
          let lines = String(input.text ?? "").replace(/\r\n/g, "\n").split("\n");
          const mode = String(input.mode ?? "sort");
          if (mode === "reverse") lines = [...lines].reverse();
          if (mode === "sort" || mode === "sort-unique") lines = [...lines].sort((a, b) => a.localeCompare(b));
          if (mode === "unique" || mode === "sort-unique") lines = [...new Set(lines)];
          const text = lines.join("\n");
          return ok(text, { mode, lineCount: lines.length, text });
        },
      },
    ],
  },
  "local-semver-lab": {
    id: "agent-opt.local/semver-lab",
    name: { original: "SemVer Lab", zhCN: "SemVer 实验室" },
    summary: { original: "Compare semantic versions.", zhCN: "比较语义化版本号。" },
    categories: ["developer-tools"],
    tags: ["MCP", "semver", "local"],
    score: 82,
    tools: [
      {
        name: "compare_semver",
        description: "Compare two semver strings",
        schema: z.object({ a: z.string().min(1).max(40), b: z.string().min(1).max(40) }).strict(),
        run(input) {
          const parse = (v: string) => {
            const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim());
            if (!m) fail(`不是有效 semver：${v}`);
            return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ?? "" };
          };
          const a = parse(String(input.a));
          const b = parse(String(input.b));
          const tuple = (x: typeof a) => [x.major, x.minor, x.patch] as const;
          let cmp = 0;
          const ta = tuple(a);
          const tb = tuple(b);
          for (let i = 0; i < 3; i += 1) {
            if (ta[i]! > tb[i]!) {
              cmp = 1;
              break;
            }
            if (ta[i]! < tb[i]!) {
              cmp = -1;
              break;
            }
          }
          if (cmp === 0) {
            if (a.pre && !b.pre) cmp = -1;
            else if (!a.pre && b.pre) cmp = 1;
            else if (a.pre !== b.pre) cmp = a.pre < b.pre ? -1 : 1;
          }
          const relation = cmp === 0 ? "eq" : cmp > 0 ? "gt" : "lt";
          return ok(relation, { relation, a, b });
        },
      },
    ],
  },
  "local-ipv4-check": {
    id: "agent-opt.local/ipv4-check",
    name: { original: "IPv4 Check", zhCN: "IPv4 检查" },
    summary: { original: "Validate IPv4 addresses and classify ranges.", zhCN: "校验 IPv4 并粗分地址类型。" },
    categories: ["networking", "developer-tools"],
    tags: ["MCP", "ip", "local"],
    score: 81,
    tools: [
      {
        name: "check_ipv4",
        description: "Validate and classify an IPv4 address",
        schema: z.object({ address: z.string().min(7).max(15) }).strict(),
        run(input) {
          const address = String(input.address).trim();
          const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
          if (!m) fail("IPv4 格式无效。");
          const parts = m.slice(1).map(Number);
          if (parts.some((n) => n > 255)) fail("IPv4 段必须 0-255。");
          const [a, b] = parts;
          let kind = "public";
          if (a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168)) kind = "private";
          else if (a === 127) kind = "loopback";
          else if (a === 169 && b === 254) kind = "link-local";
          else if (a! >= 224) kind = "multicast-or-reserved";
          return ok(kind, { address, parts, kind });
        },
      },
    ],
  },
  "local-unit-convert": {
    id: "agent-opt.local/unit-convert",
    name: { original: "Unit Convert", zhCN: "单位换算" },
    summary: { original: "Convert length and temperature units.", zhCN: "换算长度与温度单位。" },
    categories: ["utilities", "math"],
    tags: ["MCP", "units", "local"],
    score: 80,
    tools: [
      {
        name: "convert_unit",
        description: "Convert a numeric unit",
        schema: z
          .object({
            value: z.number(),
            from: z.enum(["m", "km", "cm", "mm", "mi", "ft", "c", "f", "k"]),
            to: z.enum(["m", "km", "cm", "mm", "mi", "ft", "c", "f", "k"]),
          })
          .strict(),
        run(input) {
          const value = Number(input.value);
          const from = String(input.from);
          const to = String(input.to);
          const lengthToM: Record<string, number> = { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, ft: 0.3048 };
          const isTemp = ["c", "f", "k"].includes(from) || ["c", "f", "k"].includes(to);
          let result: number;
          if (isTemp) {
            if (!["c", "f", "k"].includes(from) || !["c", "f", "k"].includes(to)) fail("温度单位不能与长度混用。");
            let c = value;
            if (from === "f") c = ((value - 32) * 5) / 9;
            if (from === "k") c = value - 273.15;
            if (to === "c") result = c;
            else if (to === "f") result = (c * 9) / 5 + 32;
            else result = c + 273.15;
          } else {
            if (!(from in lengthToM) || !(to in lengthToM)) fail("不支持的长度单位。");
            result = (value * lengthToM[from]!) / lengthToM[to]!;
          }
          return ok(String(result), { value: result, from, to });
        },
      },
    ],
  },
  "local-password-strength": {
    id: "agent-opt.local/password-strength",
    name: { original: "Password Strength", zhCN: "密码强度估计" },
    summary: { original: "Estimate password strength heuristics locally.", zhCN: "本地启发式估计密码强度。" },
    categories: ["security"],
    tags: ["MCP", "password", "local"],
    score: 79,
    tools: [
      {
        name: "score_password",
        description: "Score a password heuristically",
        schema: z.object({ password: z.string().min(1).max(200) }).strict(),
        run(input) {
          const password = String(input.password);
          let score = 0;
          if (password.length >= 8) score += 1;
          if (password.length >= 12) score += 1;
          if (password.length >= 16) score += 1;
          if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
          if (/\d/.test(password)) score += 1;
          if (/[^A-Za-z0-9]/.test(password)) score += 1;
          const label = score <= 2 ? "weak" : score <= 4 ? "medium" : "strong";
          return ok(label, {
            score,
            label,
            length: password.length,
            hasLower: /[a-z]/.test(password),
            hasUpper: /[A-Z]/.test(password),
            hasDigit: /\d/.test(password),
            hasSymbol: /[^A-Za-z0-9]/.test(password),
          });
        },
      },
    ],
  },
  "local-diff-lab": {
    id: "agent-opt.local/diff-lab",
    name: { original: "Diff Lab", zhCN: "文本 Diff" },
    summary: { original: "Line-oriented diff between two texts.", zhCN: "两段文本的按行 diff。" },
    categories: ["developer-tools"],
    tags: ["MCP", "diff", "local"],
    score: 83,
    tools: [
      {
        name: "diff_lines",
        description: "Compute a simple line diff",
        schema: z.object({ a: z.string().max(50_000), b: z.string().max(50_000) }).strict(),
        run(input) {
          const a = String(input.a ?? "").replace(/\r\n/g, "\n").split("\n");
          const b = String(input.b ?? "").replace(/\r\n/g, "\n").split("\n");
          const setA = new Set(a);
          const setB = new Set(b);
          const removed = a.filter((line) => !setB.has(line)).slice(0, 200);
          const added = b.filter((line) => !setA.has(line)).slice(0, 200);
          const payload = { removedCount: removed.length, addedCount: added.length, removed, added };
          return ok(JSON.stringify(payload, null, 2), payload);
        },
      },
    ],
  },
  "local-lorem": {
    id: "agent-opt.local/lorem",
    name: { original: "Lorem Ipsum", zhCN: "占位文本" },
    summary: { original: "Generate deterministic lorem paragraphs.", zhCN: "生成确定性的占位段落文本。" },
    categories: ["writing", "design"],
    tags: ["MCP", "lorem", "local"],
    score: 76,
    tools: [
      {
        name: "generate_lorem",
        description: "Generate lorem paragraphs",
        schema: z.object({ paragraphs: z.number().int().min(1).max(10).default(1), seed: z.number().int().default(1) }).strict(),
        run(input) {
          const words = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");
          const paragraphs = Number(input.paragraphs ?? 1);
          let seed = Number(input.seed ?? 1);
          const rnd = () => {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
          };
          const blocks = Array.from({ length: paragraphs }, () => {
            const count = 20 + Math.floor(rnd() * 20);
            return Array.from({ length: count }, () => words[Math.floor(rnd() * words.length)]).join(" ") + ".";
          });
          const text = blocks.join("\n\n");
          return ok(text, { paragraphs, text });
        },
      },
    ],
  },
  "local-bytes-format": {
    id: "agent-opt.local/bytes-format",
    name: { original: "Bytes Format", zhCN: "字节格式化" },
    summary: { original: "Format byte counts into KiB/MiB/GiB.", zhCN: "把字节数格式化为 KiB/MiB/GiB。" },
    categories: ["developer-tools"],
    tags: ["MCP", "bytes", "local"],
    score: 78,
    tools: [
      {
        name: "format_bytes",
        description: "Humanize a byte count",
        schema: z.object({ bytes: z.number().min(0).max(Number.MAX_SAFE_INTEGER) }).strict(),
        run(input) {
          let n = Number(input.bytes);
          const units = ["B", "KiB", "MiB", "GiB", "TiB"];
          let i = 0;
          while (n >= 1024 && i < units.length - 1) {
            n /= 1024;
            i += 1;
          }
          const text = `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
          return ok(text, { text, unit: units[i], value: n });
        },
      },
    ],
  },
  "local-querystring": {
    id: "agent-opt.local/querystring",
    name: { original: "Query String Lab", zhCN: "查询串实验室" },
    summary: { original: "Parse and stringify URL query strings.", zhCN: "解析与序列化 URL 查询串。" },
    categories: ["web", "developer-tools"],
    tags: ["MCP", "querystring", "local"],
    score: 80,
    tools: [
      {
        name: "parse_query",
        description: "Parse a query string",
        schema: z.object({ text: z.string().max(20_000) }).strict(),
        run(input) {
          const raw = String(input.text ?? "").replace(/^\?/, "");
          const params = new URLSearchParams(raw);
          const object = Object.fromEntries(params.entries());
          return ok(JSON.stringify(object, null, 2), { object, entries: [...params.entries()] });
        },
      },
      {
        name: "stringify_query",
        description: "Stringify an object to query string",
        schema: z.object({ json: z.string().min(2).max(20_000) }).strict(),
        run(input) {
          let obj: Record<string, unknown>;
          try {
            obj = JSON.parse(String(input.json));
          } catch {
            fail("json 必须是对象 JSON。");
          }
          if (!obj || typeof obj !== "object" || Array.isArray(obj)) fail("json 必须是对象。");
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(obj)) params.set(key, String(value));
          const text = params.toString();
          return ok(text, { text });
        },
      },
    ],
  },
  "local-markdown-toc": {
    id: "agent-opt.local/markdown-toc",
    name: { original: "Markdown TOC", zhCN: "Markdown 目录" },
    summary: { original: "Build a table of contents from Markdown headings.", zhCN: "从 Markdown 标题生成目录。" },
    categories: ["writing", "developer-tools"],
    tags: ["MCP", "markdown", "toc", "local"],
    score: 81,
    tools: [
      {
        name: "build_toc",
        description: "Extract heading TOC",
        schema: z.object({ text: z.string().max(200_000) }).strict(),
        run(input) {
          const lines = String(input.text ?? "").split(/\r?\n/);
          const items = lines
            .map((line) => {
              const m = /^(#{1,6})\s+(.+)$/.exec(line);
              if (!m) return null;
              return { level: m[1]!.length, title: m[2]!.trim() };
            })
            .filter(Boolean) as Array<{ level: number; title: string }>;
          const toc = items.map((item) => `${"  ".repeat(item.level - 1)}- ${item.title}`).join("\n");
          return ok(toc || "(no headings)", { count: items.length, items, toc });
        },
      },
    ],
  },
  "local-json-path": {
    id: "agent-opt.local/json-path",
    name: { original: "JSON Path Lite", zhCN: "JSON 路径轻量查询" },
    summary: { original: "Read dotted paths from a JSON object.", zhCN: "用点路径读取 JSON 对象字段。" },
    categories: ["data", "developer-tools"],
    tags: ["MCP", "json", "local"],
    score: 82,
    tools: [
      {
        name: "get_path",
        description: "Get a dotted path from JSON text",
        schema: z.object({ text: z.string().min(2).max(200_000), path: z.string().min(1).max(200) }).strict(),
        run(input) {
          let root: unknown;
          try {
            root = JSON.parse(String(input.text));
          } catch (error) {
            fail(`JSON 无效：${error instanceof Error ? error.message : "parse error"}`);
          }
          const segments = String(input.path).split(".").filter(Boolean);
          let current: unknown = root;
          for (const segment of segments) {
            if (current == null || typeof current !== "object") fail(`路径中断于 ${segment}`);
            current = (current as Record<string, unknown>)[segment];
          }
          const text = JSON.stringify(current, null, 2);
          return ok(text ?? "null", { path: String(input.path), value: current });
        },
      },
    ],
  },
  "local-roman": {
    id: "agent-opt.local/roman",
    name: { original: "Roman Numerals", zhCN: "罗马数字" },
    summary: { original: "Convert integers 1–3999 to Roman numerals.", zhCN: "把 1–3999 的整数转为罗马数字。" },
    categories: ["utilities", "math"],
    tags: ["MCP", "roman", "local"],
    score: 75,
    tools: [
      {
        name: "to_roman",
        description: "Integer to Roman numeral",
        schema: z.object({ value: z.number().int().min(1).max(3999) }).strict(),
        run(input) {
          let n = Number(input.value);
          const map: Array<[number, string]> = [
            [1000, "M"],
            [900, "CM"],
            [500, "D"],
            [400, "CD"],
            [100, "C"],
            [90, "XC"],
            [50, "L"],
            [40, "XL"],
            [10, "X"],
            [9, "IX"],
            [5, "V"],
            [4, "IV"],
            [1, "I"],
          ];
          let out = "";
          for (const [value, symbol] of map) {
            while (n >= value) {
              out += symbol;
              n -= value;
            }
          }
          return ok(out, { roman: out, value: Number(input.value) });
        },
      },
    ],
  },
  "local-whitespace": {
    id: "agent-opt.local/whitespace",
    name: { original: "Whitespace Normalizer", zhCN: "空白规范化" },
    summary: { original: "Normalize spaces and blank lines in text.", zhCN: "规范化文本中的空格与空行。" },
    categories: ["writing", "developer-tools"],
    tags: ["MCP", "text", "local"],
    score: 77,
    tools: [
      {
        name: "normalize_whitespace",
        description: "Collapse whitespace",
        schema: z
          .object({
            text: z.string().max(200_000),
            mode: z.enum(["spaces", "lines", "both"]).default("both"),
          })
          .strict(),
        run(input) {
          let text = String(input.text ?? "");
          const mode = String(input.mode ?? "both");
          if (mode === "spaces" || mode === "both") text = text.replace(/[ \t]+/g, " ");
          if (mode === "lines" || mode === "both") text = text.replace(/\n{3,}/g, "\n\n").trim();
          return ok(text, { text, mode });
        },
      },
    ],
  },
  "local-emoji-strip": {
    id: "agent-opt.local/emoji-strip",
    name: { original: "Emoji Strip", zhCN: "Emoji 清理" },
    summary: { original: "Remove emoji glyphs from text.", zhCN: "从文本中移除 emoji 字形。" },
    categories: ["writing", "text"],
    tags: ["MCP", "emoji", "local"],
    score: 76,
    tools: [
      {
        name: "strip_emoji",
        description: "Strip emoji characters",
        schema: z.object({ text: z.string().max(100_000) }).strict(),
        run(input) {
          const text = String(input.text ?? "").replace(/\p{Extended_Pictographic}/gu, "");
          return ok(text, { text });
        },
      },
    ],
  },
  "local-caesar": {
    id: "agent-opt.local/caesar",
    name: { original: "Caesar Cipher", zhCN: "凯撒密码" },
    summary: { original: "Apply a teaching Caesar cipher (not for security).", zhCN: "教学用凯撒密码（不用于安全场景）。" },
    categories: ["education", "security"],
    tags: ["MCP", "cipher", "local"],
    score: 74,
    tools: [
      {
        name: "shift_text",
        description: "Shift A-Z letters by n",
        schema: z.object({ text: z.string().max(50_000), shift: z.number().int().min(-25).max(25).default(3) }).strict(),
        run(input) {
          const shift = ((Number(input.shift ?? 3) % 26) + 26) % 26;
          const text = String(input.text ?? "").replace(/[A-Za-z]/g, (ch) => {
            const base = ch <= "Z" ? 65 : 97;
            return String.fromCharCode(((ch.charCodeAt(0) - base + shift) % 26) + base);
          });
          return ok(text, { text, shift });
        },
      },
    ],
  },
  "local-math-eval": {
    id: "agent-opt.local/math-eval",
    name: { original: "Safe Math Eval", zhCN: "安全数学计算" },
    summary: { original: "Evaluate restricted arithmetic expressions.", zhCN: "计算受限算术表达式。" },
    categories: ["math", "utilities"],
    tags: ["MCP", "math", "local"],
    score: 84,
    tools: [
      {
        name: "evaluate",
        description: "Evaluate + - * / % and parentheses",
        schema: z.object({ expression: z.string().min(1).max(200) }).strict(),
        run(input) {
          const expression = String(input.expression).replace(/\s+/g, "");
          if (!/^[0-9+\-*/%().]+$/.test(expression)) fail("仅允许数字与 + - * / % ( )。");
          if (/[+\-*/%]{2,}/.test(expression.replace(/^\-/, ""))) fail("运算符使用不合法。");
          const value = Function(`"use strict"; return (${expression});`)();
          if (typeof value !== "number" || !Number.isFinite(value)) fail("计算结果不是有限数字。");
          return ok(String(value), { value, expression });
        },
      },
    ],
  },
  "local-random-lab": {
    id: "agent-opt.local/random-lab",
    name: { original: "Random Lab", zhCN: "随机数实验室" },
    summary: { original: "Generate random integers and picks.", zhCN: "生成随机整数与抽样。" },
    categories: ["utilities"],
    tags: ["MCP", "random", "local"],
    score: 78,
    tools: [
      {
        name: "random_int",
        description: "Random integer in inclusive range",
        schema: z.object({ min: z.number().int().default(1), max: z.number().int().default(100) }).strict(),
        run(input) {
          const min = Number(input.min ?? 1);
          const max = Number(input.max ?? 100);
          if (max < min) fail("max 必须 >= min。");
          if (max - min > 1_000_000_000) fail("范围过大。");
          const value = min + Math.floor(Math.random() * (max - min + 1));
          return ok(String(value), { value, min, max });
        },
      },
      {
        name: "pick_one",
        description: "Pick one item from a list",
        schema: z.object({ items: z.array(z.string().min(1).max(200)).min(1).max(200) }).strict(),
        run(input) {
          const items = input.items as string[];
          const value = items[Math.floor(Math.random() * items.length)]!;
          return ok(value, { value, count: items.length });
        },
      },
    ],
  },
  "local-template-fill": {
    id: "agent-opt.local/template-fill",
    name: { original: "Template Fill", zhCN: "模板填充" },
    summary: { original: "Fill {{placeholders}} from a JSON object.", zhCN: "用 JSON 对象填充 {{占位符}}。" },
    categories: ["writing", "developer-tools"],
    tags: ["MCP", "template", "local"],
    score: 81,
    tools: [
      {
        name: "fill_template",
        description: "Replace {{key}} placeholders",
        schema: z.object({ template: z.string().max(50_000), json: z.string().min(2).max(50_000) }).strict(),
        run(input) {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(String(input.json));
          } catch {
            fail("json 无效。");
          }
          if (!data || typeof data !== "object" || Array.isArray(data)) fail("json 必须是对象。");
          const text = String(input.template).replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
            const value = data[key];
            return value == null ? "" : String(value);
          });
          return ok(text, { text });
        },
      },
    ],
  },
  "local-checksum": {
    id: "agent-opt.local/checksum",
    name: { original: "Checksum Lab", zhCN: "校验和实验室" },
    summary: { original: "Compute CRC32-like simple checksums and SHA digests.", zhCN: "计算简单校验和与 SHA 摘要。" },
    categories: ["developer-tools"],
    tags: ["MCP", "checksum", "local"],
    score: 80,
    tools: [
      {
        name: "sha256",
        description: "SHA-256 hex digest",
        schema: z.object({ text: z.string().max(200_000) }).strict(),
        run(input) {
          const digest = createHash("sha256").update(String(input.text ?? ""), "utf8").digest("hex");
          return ok(digest, { digest });
        },
      },
    ],
  },
  "local-path-posix": {
    id: "agent-opt.local/path-posix",
    name: { original: "POSIX Path Tools", zhCN: "POSIX 路径工具" },
    summary: { original: "Join and normalize POSIX-style paths safely.", zhCN: "安全地拼接与规范化 POSIX 风格路径。" },
    categories: ["developer-tools"],
    tags: ["MCP", "path", "local"],
    score: 79,
    tools: [
      {
        name: "join_posix",
        description: "Join path segments",
        schema: z.object({ parts: z.array(z.string().min(1).max(300)).min(1).max(20) }).strict(),
        run(input) {
          const parts = input.parts as string[];
          if (parts.some((p) => p.includes("\0"))) fail("路径不能包含空字符。");
          const joined = parts
            .join("/")
            .replace(/\/+/g, "/")
            .replace(/\/\.\//g, "/")
            .replace(/[^/]+\/\.\.\//g, "");
          if (joined.includes("..")) fail("不允许保留的 .. 穿越。");
          return ok(joined, { path: joined });
        },
      },
    ],
  },
  "local-mime-guess": {
    id: "agent-opt.local/mime-guess",
    name: { original: "MIME Guess", zhCN: "MIME 猜测" },
    summary: { original: "Guess MIME type from a file extension.", zhCN: "根据扩展名猜测 MIME 类型。" },
    categories: ["web", "developer-tools"],
    tags: ["MCP", "mime", "local"],
    score: 78,
    tools: [
      {
        name: "guess_mime",
        description: "Guess MIME from filename/extension",
        schema: z.object({ name: z.string().min(1).max(300) }).strict(),
        run(input) {
          const name = String(input.name).toLowerCase();
          const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name;
          const map: Record<string, string> = {
            html: "text/html",
            htm: "text/html",
            css: "text/css",
            js: "text/javascript",
            mjs: "text/javascript",
            json: "application/json",
            md: "text/markdown",
            txt: "text/plain",
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            gif: "image/gif",
            svg: "image/svg+xml",
            pdf: "application/pdf",
            zip: "application/zip",
            wasm: "application/wasm",
            xml: "application/xml",
            yaml: "application/yaml",
            yml: "application/yaml",
            csv: "text/csv",
          };
          const mime = map[ext] ?? "application/octet-stream";
          return ok(mime, { extension: ext, mime });
        },
      },
    ],
  },
  "local-relative-time": {
    id: "agent-opt.local/relative-time",
    name: { original: "Relative Time", zhCN: "相对时间" },
    summary: { original: "Describe how far a timestamp is from now.", zhCN: "描述时间戳相对现在的距离。" },
    categories: ["utilities"],
    tags: ["MCP", "time", "local"],
    score: 78,
    tools: [
      {
        name: "from_now",
        description: "Relative description from ISO/epoch",
        schema: z.object({ value: z.string().min(1).max(100) }).strict(),
        run(input) {
          const raw = String(input.value);
          const ms = /^\d+$/.test(raw) ? Number(raw) * (raw.length <= 10 ? 1000 : 1) : Date.parse(raw);
          if (!Number.isFinite(ms)) fail("无法解析时间。");
          const delta = ms - Date.now();
          const abs = Math.abs(delta);
          const units: Array<[number, string]> = [
            [60_000, "minute"],
            [3_600_000, "hour"],
            [86_400_000, "day"],
            [604_800_000, "week"],
          ];
          let text = "just now";
          for (const [size, label] of units) {
            if (abs >= size) {
              const n = Math.round(abs / size);
              text = delta < 0 ? `${n} ${label}${n === 1 ? "" : "s"} ago` : `in ${n} ${label}${n === 1 ? "" : "s"}`;
            }
          }
          if (abs < 60_000) text = delta < 0 ? "moments ago" : "in moments";
          return ok(text, { text, epochMs: ms, deltaMs: delta });
        },
      },
    ],
  },
  "local-table-md": {
    id: "agent-opt.local/table-md",
    name: { original: "Markdown Table Builder", zhCN: "Markdown 表格生成" },
    summary: { original: "Build a Markdown table from JSON rows.", zhCN: "从 JSON 行数据生成 Markdown 表格。" },
    categories: ["writing", "data"],
    tags: ["MCP", "markdown", "table", "local"],
    score: 81,
    tools: [
      {
        name: "rows_to_table",
        description: "Convert JSON array of objects to Markdown table",
        schema: z.object({ json: z.string().min(2).max(100_000) }).strict(),
        run(input) {
          let rows: Array<Record<string, unknown>>;
          try {
            rows = JSON.parse(String(input.json));
          } catch {
            fail("json 必须是对象数组。");
          }
          if (!Array.isArray(rows) || rows.length === 0) fail("需要非空对象数组。");
          if (rows.length > 200) fail("最多 200 行。");
          const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
          const header = `| ${columns.join(" | ")} |`;
          const sep = `| ${columns.map(() => "---").join(" | ")} |`;
          const body = rows
            .map((row) => `| ${columns.map((col) => String(row[col] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`)
            .join("\n");
          const text = `${header}\n${sep}\n${body}`;
          return ok(text, { text, columns, rowCount: rows.length });
        },
      },
    ],
  },
};

export function listLocalMcpSlugs(): string[] {
  return Object.keys(localMcpCatalog).sort();
}

import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";
import {
  defaultSafeDocxRoot,
  ensureSafeDocxSandbox,
  resolveSafeDocxAbsolutePath,
  toSandboxRelativePath,
} from "./safe-docx-files";

type SafeDocxContext = AdapterContext & {
  safeDocxRoot?: string;
};

const bootstrapEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "scripts",
  "safe-docx-mcp-entry.mjs",
);

const packageJsonPath = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules",
  "@usejunior",
  "safe-docx",
  "package.json",
);

const packageEntry = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules",
  "@usejunior",
  "safe-docx",
  "bin",
  "safe-docx.js",
);

function effectiveRoot(context: AdapterContext): string {
  return (context as SafeDocxContext).safeDocxRoot ?? defaultSafeDocxRoot();
}

function parseWithFriendlyError<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new InvocationValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；"),
    );
  }
  return parsed.data;
}

const relativeDocPath = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .regex(/^[A-Za-z0-9._/-]+$/, "文档路径只能包含安全字符。")
  .refine((value) => !value.includes("..") && !path.isAbsolute(value), "文档路径不能包含上级目录或绝对路径。")
  .refine((value) => /\.(docx|odt)$/i.test(value), "文档路径必须以 .docx 或 .odt 结尾。");

const relativeAnyPath = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .regex(/^[A-Za-z0-9._/-]+$/, "路径只能包含安全字符。")
  .refine((value) => !value.includes("..") && !path.isAbsolute(value), "路径不能包含上级目录或绝对路径。");

const paragraphId = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_.:-]+$/, "段落 ID 包含不支持的字符。");

const textLimit = z.string().min(1).max(8_000);
const patternLimit = z.string().min(1).max(200);

const webTools = [
  "read_file",
  "grep",
  "replace_text",
  "insert_paragraph",
  "export",
  "get_file_status",
  "close_file",
  "save",
] as const;

type WebTool = (typeof webTools)[number];

const schemas: Record<WebTool, z.ZodType> = {
  read_file: z
    .object({
      file: relativeDocPath,
      offset: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      format: z.enum(["toon", "json", "simple"]).default("json"),
      include_fingerprint: z.boolean().default(false),
      show_formatting: z.boolean().default(true),
    })
    .strict(),
  grep: z
    .object({
      file: relativeDocPath,
      pattern: patternLimit,
      case_sensitive: z.boolean().default(false),
      max_results: z.number().int().min(1).max(50).default(10),
      context_chars: z.number().int().min(0).max(200).default(40),
    })
    .strict(),
  replace_text: z
    .object({
      file: relativeDocPath,
      target_paragraph_id: paragraphId,
      old_string: textLimit,
      new_string: z.string().max(8_000),
    })
    .strict(),
  insert_paragraph: z
    .object({
      file: relativeDocPath,
      positional_anchor_node_id: paragraphId,
      new_string: textLimit,
      position: z.enum(["before", "after"]).default("after"),
    })
    .strict(),
  export: z
    .object({
      file: relativeDocPath,
      format: z.enum(["markdown", "html", "text"]).default("markdown"),
      output: relativeAnyPath.optional(),
    })
    .strict(),
  get_file_status: z.object({ file: relativeDocPath }).strict(),
  close_file: z.object({ file: relativeDocPath }).strict(),
  save: z
    .object({
      file: relativeDocPath,
      output: relativeDocPath.optional(),
      allow_overwrite: z.boolean().default(true),
    })
    .strict(),
};

async function mapFilePath(relative: string, root: string): Promise<string> {
  return resolveSafeDocxAbsolutePath(relative, root, { mustExist: true });
}

async function mapOutputPath(relative: string, root: string): Promise<string> {
  return resolveSafeDocxAbsolutePath(relative, root, { mustExist: false, forWrite: true });
}

function rewritePathFields(payload: unknown, root: string): unknown {
  if (Array.isArray(payload)) return payload.map((item) => rewritePathFields(item, root));
  if (!payload || typeof payload !== "object") return payload;
  const record = payload as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && /path|file/i.test(key) && path.isAbsolute(value)) {
      try {
        next[key] = toSandboxRelativePath(value, root);
        continue;
      } catch {
        next[key] = path.basename(value);
        continue;
      }
    }
    next[key] = rewritePathFields(value, root);
  }
  return next;
}

function extractJsonPayload(result: AdapterToolResult): Record<string, unknown> | null {
  if (result.structuredContent && typeof result.structuredContent === "object" && !Array.isArray(result.structuredContent)) {
    return result.structuredContent as Record<string, unknown>;
  }
  const text = result.content.find(
    (item): item is { type: "text"; text: string } =>
      typeof item === "object" &&
      item !== null &&
      (item as { type?: unknown }).type === "text" &&
      typeof (item as { text?: unknown }).text === "string",
  )?.text;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

export const safeDocxAdapter: PluginAdapter = {
  slug: "safe-docx-studio",
  allowedTools: [...webTools],
  requestTimeoutMs(tool) {
    if (tool === "export" || tool === "save" || tool === "replace_text") return 90_000;
    return 60_000;
  },
  persistentSession: {
    key(context) {
      return path.resolve(/* turbopackIgnore: true */ effectiveRoot(context));
    },
    idleMs: 120_000,
  },
  async prepare(context) {
    try {
      await Promise.all([access(bootstrapEntryPoint), access(packageJsonPath), access(packageEntry)]);
    } catch {
      throw new InvocationValidationError("Safe DOCX 0.15.0 尚未安装，请从固定 lockfile 安装依赖。");
    }
    const sandbox = await ensureSafeDocxSandbox(effectiveRoot(context));
    return {
      command: process.execPath,
      args: ["--max-old-space-size=384", bootstrapEntryPoint],
      cwd: sandbox.root,
      env: {
        AGENT_OPT_SAFE_DOCX_ROOT: sandbox.root,
        HOME: sandbox.home,
        USERPROFILE: sandbox.home,
        TEMP: sandbox.temporary,
        TMP: sandbox.temporary,
        TMPDIR: sandbox.temporary,
        SAFE_DOCX_ALLOWED_ROOTS: sandbox.root,
        NODE_ENV: "production",
        NO_COLOR: "1",
      },
    };
  },
  async validateAndTransform(tool, input, context) {
    if (!(webTools as readonly string[]).includes(tool)) {
      throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    }
    const root = effectiveRoot(context);
    const schema = schemas[tool as WebTool];
    const parsed = parseWithFriendlyError(schema, input) as Record<string, unknown>;

    // Reject Google Docs and multi-file / host-path surfaces entirely.
    for (const forbidden of ["google_doc_id", "file_paths", "file_path", "plan_file_path", "save_to_local_path"]) {
      if (forbidden in (input as Record<string, unknown>)) {
        throw new InvocationValidationError(`不允许参数：${forbidden}`);
      }
    }

    if (tool === "read_file") {
      return {
        file_path: await mapFilePath(String(parsed.file), root),
        format: parsed.format,
        include_fingerprint: parsed.include_fingerprint,
        show_formatting: parsed.show_formatting,
        ...(parsed.offset !== undefined ? { offset: parsed.offset } : {}),
        ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
      };
    }
    if (tool === "grep") {
      return {
        file_path: await mapFilePath(String(parsed.file), root),
        pattern: parsed.pattern,
        case_sensitive: parsed.case_sensitive,
        max_results: parsed.max_results,
        context_chars: parsed.context_chars,
      };
    }
    if (tool === "replace_text") {
      return {
        file_path: await mapFilePath(String(parsed.file), root),
        target_paragraph_id: parsed.target_paragraph_id,
        old_string: parsed.old_string,
        new_string: parsed.new_string,
      };
    }
    if (tool === "insert_paragraph") {
      return {
        file_path: await mapFilePath(String(parsed.file), root),
        positional_anchor_node_id: parsed.positional_anchor_node_id,
        new_string: parsed.new_string,
        position: parsed.position,
      };
    }
    if (tool === "export") {
      const outputRelative =
        typeof parsed.output === "string" && parsed.output.length > 0
          ? String(parsed.output)
          : `outputs/${path.basename(String(parsed.file), path.extname(String(parsed.file)))}.${parsed.format === "html" ? "html" : parsed.format === "text" ? "txt" : "md"}`;
      return {
        file_path: await mapFilePath(String(parsed.file), root),
        format: parsed.format,
        output_path: await mapOutputPath(outputRelative, root),
        allow_overwrite: true,
      };
    }
    if (tool === "get_file_status" || tool === "close_file") {
      return { file_path: await mapFilePath(String(parsed.file), root) };
    }
    if (tool === "save") {
      const absolute = await mapFilePath(String(parsed.file), root);
      if (typeof parsed.output === "string" && parsed.output.length > 0) {
        return {
          file_path: absolute,
          save_to_local_path: await mapOutputPath(String(parsed.output), root),
          allow_overwrite: parsed.allow_overwrite ?? true,
        };
      }
      return {
        file_path: absolute,
        allow_overwrite: parsed.allow_overwrite ?? true,
      };
    }
    throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
  },
  async normalizeResult(tool, result, context) {
    if (!(webTools as readonly string[]).includes(tool)) {
      throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    }
    const root = effectiveRoot(context);
    const payload = extractJsonPayload(result);
    if (!payload) {
      const serialized = JSON.stringify(result.content);
      if (Buffer.byteLength(serialized, "utf8") > 2 * 1024 * 1024) {
        throw new InvocationValidationError("Safe DOCX 返回结果超过 2 MiB 安全上限。");
      }
      return result;
    }

    const rewritten = rewritePathFields(payload, root) as Record<string, unknown>;
    const serialized = JSON.stringify(rewritten);
    if (Buffer.byteLength(serialized, "utf8") > 2 * 1024 * 1024) {
      throw new InvocationValidationError("Safe DOCX 返回结果超过 2 MiB 安全上限。");
    }

    return {
      content: [{ type: "text", text: JSON.stringify(rewritten, null, 2) }],
      structuredContent: rewritten,
      isError: result.isError || rewritten.success === false || typeof rewritten.error === "string",
    };
  },
};

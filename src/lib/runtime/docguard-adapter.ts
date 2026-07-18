import { access, lstat, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

type DocGuardContext = AdapterContext & {
  docguardRoot?: string;
  docguardPackageRoot?: string;
  docguardProjectRoot?: string;
};

const PROJECT_LIMIT = 512 * 1024;
const OUTPUT_LIMIT = 3 * 1024 * 1024;
const MAX_FILES = 32;
const STALE_RUN_MS = 20 * 60 * 1000;

const projectTools = [
  "docguard_guard",
  "docguard_score",
  "docguard_verify_claims",
  "docguard_report",
  "docguard_diagnose",
] as const;
const webTools = [...projectTools, "docguard_explain"] as const;
type WebTool = (typeof webTools)[number];

const safeFilePath = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[A-Za-z0-9._/-]+$/, "文件路径只能包含字母、数字、点、下划线、短横线和正斜杠。")
  .refine((value) => !path.posix.isAbsolute(value), "文件路径必须是相对路径。")
  .refine(
    (value) => value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
    "文件路径不能包含空目录、当前目录或上级目录。",
  )
  .refine((value) => value.split("/").length <= 6, "文件路径最多允许 6 层目录。")
  .refine((value) => !value.startsWith(".git/"), "虚拟项目不能提供 .git 元数据。")
  .refine((value) => !value.toLowerCase().startsWith("node_modules/"), "虚拟项目不能提供 node_modules。")
  .refine((value) => !value.includes(":"), "文件路径不能包含驱动器或 URI 语义。");

const projectFile = z.object({
  path: safeFilePath,
  content: z.string().max(96_000).refine((value) => !value.includes("\0"), "文件内容不能包含 NUL 字节。"),
}).strict();

const projectInput = z.object({
  files: z.array(projectFile).min(1).max(MAX_FILES),
}).strict();

const explainInput = z.object({
  code: z.string().trim().min(3).max(16).regex(/^[A-Za-z]{2,8}\d{3}$/i, "请输入类似 STR001 的 finding code。"),
}).strict();

const resultSchemas: Record<WebTool, z.ZodType> = {
  docguard_guard: z.object({
    status: z.enum(["PASS", "WARN", "FAIL"]),
    passed: z.number(),
    total: z.number(),
    errors: z.number(),
    warnings: z.number(),
    findings: z.array(z.unknown()),
    validators: z.array(z.unknown()),
  }).passthrough(),
  docguard_score: z.object({
    score: z.number().min(0).max(100),
    grade: z.string().min(1).max(4),
    categories: z.record(z.string(), z.number()),
  }).passthrough(),
  docguard_verify_claims: z.object({
    claimCount: z.number().int().nonnegative(),
    note: z.string(),
    tasks: z.array(z.unknown()),
  }).passthrough(),
  docguard_report: z.object({
    tool: z.object({ name: z.string(), version: z.string() }).passthrough(),
    project: z.record(z.string(), z.unknown()),
    guard: z.record(z.string(), z.unknown()),
    score: z.record(z.string(), z.unknown()),
  }).passthrough(),
  docguard_diagnose: z.object({
    status: z.enum(["PASS", "WARN", "FAIL"]),
    errors: z.number(),
    warnings: z.number(),
    problems: z.array(z.unknown()),
    hint: z.string(),
  }).passthrough(),
  docguard_explain: z.object({
    code: z.string(),
    title: z.string(),
    help: z.string(),
    suppress: z.string().nullable(),
    validator: z.string(),
  }).passthrough(),
};

function defaultRuntimeRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "docguard");
}

function defaultPackageRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "docguard-cli");
}

function bootstrapEntryPoint(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "docguard-mcp-entry.mjs");
}

async function requirePlainDirectory(target: string, label: string): Promise<void> {
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new InvocationValidationError(`${label}必须是普通目录，不能是符号链接或目录联接。`);
  }
}

async function cleanupStaleRuns(runsRoot: string): Promise<void> {
  const now = Date.now();
  for (const entry of await readdir(runsRoot, { withFileTypes: true })) {
    const target = path.join(runsRoot, entry.name);
    if (entry.isSymbolicLink()) continue;
    try {
      const info = await stat(target);
      if (entry.isDirectory() && now - info.mtimeMs > STALE_RUN_MS) {
        await rm(target, { recursive: true, force: true });
      }
    } catch {
      // Another request may have completed cleanup first.
    }
  }
}

function parseInput(tool: string, input: unknown): { files?: Array<{ path: string; content: string }>; code?: string } {
  const schema = tool === "docguard_explain" ? explainInput : projectInput;
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new InvocationValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；"),
    );
  }
  if (tool === "docguard_explain") return { code: (parsed.data as z.infer<typeof explainInput>).code.toUpperCase() };

  const files = (parsed.data as z.infer<typeof projectInput>).files;
  const names = new Set<string>();
  let bytes = 0;
  for (const file of files) {
    const normalized = file.path.toLowerCase();
    if (names.has(normalized)) {
      throw new InvocationValidationError(`文件路径重复：${file.path}`);
    }
    names.add(normalized);
    bytes += Buffer.byteLength(file.path, "utf8") + Buffer.byteLength(file.content, "utf8");
  }
  if (bytes > PROJECT_LIMIT) {
    throw new InvocationValidationError("虚拟项目总大小不能超过 512 KiB。");
  }
  return { files };
}

async function materializeProject(context: DocGuardContext, files?: Array<{ path: string; content: string }>): Promise<void> {
  const root = path.resolve(context.docguardRoot ?? defaultRuntimeRoot());
  await mkdir(root, { recursive: true });
  await requirePlainDirectory(root, "DocGuard 运行根目录");
  const runs = path.join(root, "runs");
  await mkdir(runs, { recursive: true });
  await requirePlainDirectory(runs, "DocGuard 调用目录");
  await cleanupStaleRuns(runs);

  const runRoot = path.join(runs, randomUUID());
  const projectRoot = path.join(runRoot, "project");
  await mkdir(projectRoot, { recursive: true });
  await requirePlainDirectory(projectRoot, "DocGuard 虚拟项目目录");

  const materialized = files ?? [{ path: "README.md", content: "# Finding explanation workspace\n" }];
  for (const file of materialized) {
    const target = path.join(projectRoot, ...file.path.split("/"));
    const relative = path.relative(projectRoot, target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new InvocationValidationError(`文件路径越过了虚拟项目：${file.path}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, { encoding: "utf8", flag: "wx" });
  }
  context.docguardProjectRoot = projectRoot;
}

function sanitizeText(text: string, context: DocGuardContext): string {
  let output = text;
  if (context.docguardProjectRoot) {
    output = output.split(context.docguardProjectRoot).join("project://virtual");
    output = output.split(context.docguardProjectRoot.replaceAll("\\", "/")).join("project://virtual");
  }
  output = output.split(os.homedir()).join("host://redacted");
  return output;
}

function sanitizePayload(value: unknown, context: DocGuardContext): unknown {
  if (typeof value === "string") return sanitizeText(value, context);
  if (Array.isArray(value)) return value.map((item) => sanitizePayload(item, context));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizePayload(item, context)]),
  );
}

async function cleanupProject(context: DocGuardContext): Promise<void> {
  if (!context.docguardProjectRoot) return;
  const runRoot = path.dirname(context.docguardProjectRoot);
  await rm(runRoot, { recursive: true, force: true }).catch(() => undefined);
  context.docguardProjectRoot = undefined;
}

function textBlock(result: AdapterToolResult): string {
  const blocks = result.content.filter(
    (item): item is { type: "text"; text: string } =>
      !!item && typeof item === "object" && (item as { type?: unknown }).type === "text" &&
      typeof (item as { text?: unknown }).text === "string",
  );
  if (blocks.length !== 1) throw new InvocationValidationError("DocGuard 返回了无法安全呈现的内容块。");
  return blocks[0].text;
}

export const docguardAdapter: PluginAdapter = {
  slug: "docguard-drift-lab",
  allowedTools: [...webTools],
  requestTimeoutMs() {
    return 60_000;
  },
  async validateAndTransform(tool, input, rawContext) {
    if (!(webTools as readonly string[]).includes(tool)) {
      throw new InvocationValidationError(`DocGuard Web 适配未开放工具：${tool}`);
    }
    const context = rawContext as DocGuardContext;
    const parsed = parseInput(tool, input);
    await materializeProject(context, parsed.files);
    return tool === "docguard_explain"
      ? { code: parsed.code }
      : { projectDir: context.docguardProjectRoot };
  },
  async prepare(rawContext) {
    const context = rawContext as DocGuardContext;
    if (!context.docguardProjectRoot) throw new InvocationValidationError("DocGuard 虚拟项目尚未准备完成。");
    const packageRoot = path.resolve(context.docguardPackageRoot ?? defaultPackageRoot());
    const moduleRoot = path.dirname(packageRoot);
    const bootstrap = bootstrapEntryPoint();
    try {
      await Promise.all([
        access(path.join(packageRoot, "package.json")),
        access(path.join(packageRoot, "cli", "docguard.mjs")),
        access(path.join(packageRoot, "cli", "commands", "mcp.mjs")),
        access(path.join(moduleRoot, "@babel", "parser", "package.json")),
        access(bootstrap),
      ]);
    } catch {
      throw new InvocationValidationError("DocGuard MCP 0.33.1 尚未按固定 lockfile 安装。");
    }
    await requirePlainDirectory(context.docguardProjectRoot, "DocGuard 虚拟项目目录");
    return {
      command: process.execPath,
      args: ["--max-old-space-size=256", bootstrap],
      cwd: context.docguardProjectRoot,
      env: {
        AGENT_OPT_DOCGUARD_PROJECT_ROOT: context.docguardProjectRoot,
        AGENT_OPT_DOCGUARD_PACKAGE_ROOT: packageRoot,
        AGENT_OPT_DOCGUARD_MODULE_ROOT: moduleRoot,
        HOME: context.docguardProjectRoot,
        USERPROFILE: context.docguardProjectRoot,
        TEMP: context.docguardProjectRoot,
        TMP: context.docguardProjectRoot,
        TMPDIR: context.docguardProjectRoot,
        NO_COLOR: "1",
        NODE_ENV: "production",
      },
    };
  },
  async normalizeResult(tool, result, rawContext) {
    const context = rawContext as DocGuardContext;
    try {
      const raw = textBlock(result);
      if (Buffer.byteLength(raw, "utf8") > OUTPUT_LIMIT) {
        throw new InvocationValidationError("DocGuard 结果超过 3 MiB 安全上限。");
      }
      if (result.isError) {
        return { content: [{ type: "text", text: sanitizeText(raw, context) }], isError: true };
      }
      let candidate: unknown;
      try {
        candidate = JSON.parse(raw);
      } catch {
        throw new InvocationValidationError("DocGuard 返回结果不是有效 JSON。");
      }
      const parsed = resultSchemas[tool as WebTool].safeParse(candidate);
      if (!parsed.success) {
        const fields = parsed.error.issues.slice(0, 3).map((issue) => issue.path.join(".") || "result").join("、");
        throw new InvocationValidationError(`DocGuard 返回结果不符合固定 0.33.1 协议结构：${fields}。`);
      }
      const structured = sanitizePayload(parsed.data, context) as Record<string, unknown>;
      return {
        content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
        structuredContent: structured,
        isError: false,
      };
    } finally {
      await cleanupProject(context);
    }
  },
};

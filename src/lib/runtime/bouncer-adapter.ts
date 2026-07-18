import { access, lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

export const BOUNCER_OUTPUT_LIMIT = 1_500_000;
const INPUT_LIMIT = 180_000;
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".md", ".mdx", ".json", ".yml", ".yaml"]);

type BouncerContext = AdapterContext & {
  bouncerRoot?: string;
  bouncerPackageRoot?: string;
  bouncerInvocationRoot?: string;
  bouncerConfigPath?: string;
};

const virtualPath = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "文件名只能包含字母、数字、点、下划线、斜杠和连字符。")
  .refine((value) => !path.posix.isAbsolute(value) && !path.win32.isAbsolute(value), "只接受内联项目的相对文件名。")
  .refine(
    (value) => value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    "文件名不能包含空目录、当前目录或上级目录片段。",
  )
  .refine((value) => allowedExtensions.has(path.posix.extname(value).toLowerCase()), "文件扩展名不在静态检查白名单中。");

const sourceText = z
  .string()
  .max(32_000)
  .refine((value) => !value.includes("\0"), "文件内容不能包含 NUL 字符。")
  .refine((value) => value.split(/\r?\n/).length <= 3_000, "单个文件不能超过 3,000 行。")
  .refine((value) => value.split(/\r?\n/).every((line) => line.length <= 4_000), "单行不能超过 4,000 个字符。");

const virtualFiles = z
  .array(z.object({ path: virtualPath, content: sourceText }).strict())
  .min(1, "至少提供一个内联文件。")
  .max(48, "一次最多检查 48 个内联文件。")
  .superRefine((files, context) => {
    const seen = new Set<string>();
    for (let index = 0; index < files.length; index += 1) {
      const normalized = files[index].path.toLowerCase();
      if (seen.has(normalized)) {
        context.addIssue({ code: "custom", path: [index, "path"], message: "文件名不能重复。" });
      }
      seen.add(normalized);
    }
    if (Buffer.byteLength(JSON.stringify(files), "utf8") > INPUT_LIMIT) {
      context.addIssue({ code: "custom", message: "内联项目不能超过 180 KiB。" });
    }
  });

const targetAdapter = z.enum(["next", "react-native"]).default("next");
const packId = z.enum(["uk-osa", "uk-aadc"]);
const selectedPacks = z
  .array(packId)
  .min(1, "至少选择一个 UK 规则包。")
  .max(2)
  .refine((packs) => new Set(packs).size === packs.length, "规则包不能重复。")
  .default(["uk-osa", "uk-aadc"]);

const complianceCheckSchema = z
  .object({
    adapter: targetAdapter,
    packs: selectedPacks,
    status: z.enum(["all", "fail", "unknown"]).default("all"),
    files: virtualFiles,
  })
  .strict();
const listRulesSchema = z.object({ adapter: targetAdapter, packs: selectedPacks }).strict();
const explainRuleSchema = z
  .object({
    adapter: targetAdapter,
    packs: selectedPacks,
    ruleId: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^(?:osa|aadc)\.[a-z0-9][a-z0-9-]*$/, "Web 仅解释 UK OSA 或 AADC 的固定规则 ID。"),
  })
  .strict();
const listPacksSchema = z.object({}).strict();

const schemas = {
  compliance_check: complianceCheckSchema,
  list_rules: listRulesSchema,
  explain_rule: explainRuleSchema,
  list_packs: listPacksSchema,
} satisfies Record<string, z.ZodType>;

const hitSchema = z
  .object({
    file: z.string().max(240),
    line: z.number().int().positive().max(100_000),
    excerpt: z.string().max(200),
  })
  .strict();
const findingSchema = z
  .object({
    packId,
    packTitle: z.string().max(300),
    authority: z.string().max(300),
    ruleId: z.string().max(160),
    standard: z.string().max(1_000),
    severity: z.enum(["low", "medium", "high"]),
    surface: z.string().max(100).optional(),
    intent: z.string().max(4_000),
    fix: z.string().max(4_000),
    status: z.enum(["pass", "fail", "unknown"]),
    scanned: z.number().int().nonnegative().max(48),
    hits: z.array(hitSchema).max(8),
  })
  .strict();
const packSummarySchema = z
  .object({ id: packId, title: z.string().max(300), authority: z.string().max(300) })
  .strict();
const complianceResultSchema = z
  .object({
    findings: z.array(findingSchema).max(20),
    totals: z.object({ pass: z.number().int().nonnegative(), fail: z.number().int().nonnegative(), unknown: z.number().int().nonnegative() }).strict(),
    score: z.number().int().min(0).max(100),
    meta: z
      .object({
        adapter: z.enum(["next", "react-native"]),
        repo: z.string().max(1_000),
        filesScanned: z.number().int().nonnegative().max(48),
        packs: z.array(packSummarySchema).min(1).max(2),
      })
      .strict(),
  })
  .strict();
const ruleSummarySchema = z
  .object({
    packId,
    ruleId: z.string().max(160),
    standard: z.string().max(1_000),
    severity: z.enum(["low", "medium", "high"]),
    surface: z.string().max(100).optional(),
    intent: z.string().max(4_000),
  })
  .strict();
const listRulesResultSchema = z.object({ rules: z.array(ruleSummarySchema).max(20) }).strict();
const explainResultSchema = z
  .object({
    packId,
    packTitle: z.string().max(300),
    authority: z.string().max(300),
    url: z.string().url().max(1_000),
    id: z.string().max(160),
    standard: z.string().max(1_000),
    severity: z.enum(["low", "medium", "high"]),
    surface: z.string().max(100).optional(),
    intent: z.string().max(4_000),
    fix: z.string().max(4_000),
    assert: z.record(z.string(), z.unknown()),
    checks: z.array(z.string().max(4_000)).max(40),
  })
  .strict();
const upstreamPackSchema = z
  .object({
    id: z.enum(["uk-osa", "uk-aadc", "ng-ndpc", "ng-fccpc", "ng-firs"]),
    title: z.string().max(300),
    authority: z.string().max(300),
    url: z.string().url().max(1_000),
    rules: z.number().int().positive().max(100),
    builtin: z.boolean(),
  })
  .strict();
const listPacksResultSchema = z.object({ packs: z.array(upstreamPackSchema).max(10) }).strict();

const resultSchemas = {
  compliance_check: complianceResultSchema,
  list_rules: listRulesResultSchema,
  explain_rule: explainResultSchema,
  list_packs: listPacksResultSchema,
} satisfies Record<string, z.ZodType>;

export function defaultBouncerRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "bouncer");
}

function defaultPackageRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "@nugehs", "bouncer");
}

function bootstrapEntryPoint(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "bouncer-mcp-entry.mjs");
}

async function ensureDirectoryNotLink(target: string, label: string): Promise<void> {
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new InvocationValidationError(`${label}必须是普通目录，不能是符号链接或目录联接。`);
  }
}

async function ensureBase(root: string): Promise<{ root: string; runs: string }> {
  const resolved = path.resolve(/* turbopackIgnore: true */ root);
  await mkdir(resolved, { recursive: true });
  await ensureDirectoryNotLink(resolved, "Bouncer 运行根目录");
  const runs = path.join(resolved, "runs");
  await mkdir(runs, { recursive: true });
  await ensureDirectoryNotLink(runs, "Bouncer 调用目录");
  return { root: resolved, runs };
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function createInvocation(
  context: BouncerContext,
  adapter: "next" | "react-native",
  packs: Array<"uk-osa" | "uk-aadc">,
  files: Array<{ path: string; content: string }>,
): Promise<string> {
  const base = await ensureBase(context.bouncerRoot ?? defaultBouncerRoot());
  const invocationRoot = await mkdtemp(path.join(base.runs, "invoke-"));
  await ensureDirectoryNotLink(invocationRoot, "Bouncer 单次调用目录");
  const repoRoot = path.join(invocationRoot, "repo");
  const home = path.join(invocationRoot, "home");
  const temporary = path.join(invocationRoot, "tmp");
  await Promise.all([mkdir(repoRoot), mkdir(home), mkdir(temporary)]);

  for (const file of files) {
    const target = path.resolve(repoRoot, ...file.path.split("/"));
    if (!isWithin(repoRoot, target)) {
      throw new InvocationValidationError("内联文件解析后越过了项目沙箱。");
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new InvocationValidationError("内联项目只能包含普通文本文件。");
    }
  }

  const configPath = path.join(invocationRoot, "bouncer.config.json");
  await writeFile(
    configPath,
    `${JSON.stringify({
      target: { adapter, repo: "./repo", roots: ["."] },
      packs,
      packDirs: [],
      ignore: [],
      failOn: ["fail"],
    }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  context.bouncerInvocationRoot = invocationRoot;
  context.bouncerConfigPath = configPath;
  return configPath;
}

async function cleanInvocation(context: BouncerContext): Promise<void> {
  const invocationRoot = context.bouncerInvocationRoot;
  context.bouncerInvocationRoot = undefined;
  context.bouncerConfigPath = undefined;
  if (!invocationRoot || !path.basename(invocationRoot).startsWith("invoke-")) return;
  const base = path.resolve(context.bouncerRoot ?? defaultBouncerRoot());
  const runs = path.join(base, "runs");
  if (!isWithin(runs, path.resolve(invocationRoot))) return;
  await rm(invocationRoot, { recursive: true, force: true });
}

function parseInput(tool: string, input: unknown): z.output<(typeof schemas)[keyof typeof schemas]> {
  const schema = schemas[tool as keyof typeof schemas];
  if (!schema) throw new InvocationValidationError(`Bouncer Web 适配未开放工具：${tool}`);
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new InvocationValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；"),
    );
  }
  return parsed.data;
}

function sanitizeErrorText(text: string, context: BouncerContext): string {
  const invocationRoot = context.bouncerInvocationRoot;
  if (!invocationRoot) return text;
  return text.split(invocationRoot).join("inline://project");
}

export const bouncerAdapter: PluginAdapter = {
  slug: "bouncer-compliance-studio",
  allowedTools: Object.keys(schemas),
  requestTimeoutMs() {
    return 30_000;
  },
  async validateAndTransform(tool, input, rawContext) {
    const context = rawContext as BouncerContext;
    const parsed = parseInput(tool, input) as Record<string, unknown>;
    if (tool === "list_packs") {
      await createInvocation(context, "next", ["uk-osa", "uk-aadc"], []);
      return {};
    }
    const adapter = parsed.adapter as "next" | "react-native";
    const packs = parsed.packs as Array<"uk-osa" | "uk-aadc">;
    const files = tool === "compliance_check"
      ? parsed.files as Array<{ path: string; content: string }>
      : [];
    const config = await createInvocation(context, adapter, packs, files);
    if (tool === "compliance_check") return { config, status: parsed.status };
    if (tool === "explain_rule") return { config, ruleId: parsed.ruleId };
    return { config };
  },
  async prepare(rawContext) {
    const context = rawContext as BouncerContext;
    const packageRoot = path.resolve(context.bouncerPackageRoot ?? defaultPackageRoot());
    const bootstrap = bootstrapEntryPoint();
    try {
      await Promise.all([
        access(path.join(packageRoot, "package.json")),
        access(path.join(packageRoot, "src", "lib", "mcp.js")),
        access(bootstrap),
      ]);
    } catch {
      throw new InvocationValidationError("Bouncer MCP 0.2.0 尚未安装，无法启动固定版本运行时。");
    }
    if (!context.bouncerInvocationRoot || !context.bouncerConfigPath) {
      throw new InvocationValidationError("Bouncer 内联项目尚未准备完成。");
    }
    await ensureDirectoryNotLink(context.bouncerInvocationRoot, "Bouncer 单次调用目录");
    return {
      command: process.execPath,
      args: ["--max-old-space-size=192", bootstrap],
      cwd: path.dirname(context.bouncerInvocationRoot),
      env: {
        HOME: path.join(context.bouncerInvocationRoot, "home"),
        USERPROFILE: path.join(context.bouncerInvocationRoot, "home"),
        TMPDIR: path.join(context.bouncerInvocationRoot, "tmp"),
        TEMP: path.join(context.bouncerInvocationRoot, "tmp"),
        TMP: path.join(context.bouncerInvocationRoot, "tmp"),
        NO_UPDATE_NOTIFIER: "1",
        AGENT_OPT_BOUNCER_SANDBOX_ROOT: context.bouncerInvocationRoot,
        AGENT_OPT_BOUNCER_PACKAGE_ROOT: packageRoot,
      },
    };
  },
  async normalizeResult(tool, result: AdapterToolResult, rawContext) {
    const context = rawContext as BouncerContext;
    try {
      const textBlocks = result.content.filter((block) => {
        if (!block || typeof block !== "object") return false;
        const candidate = block as { type?: unknown; text?: unknown };
        return candidate.type === "text" && typeof candidate.text === "string";
      }) as Array<{ type: "text"; text: string }>;
      if (result.isError) {
        if (textBlocks.length !== 1 || textBlocks[0].text.length > 10_000) {
          throw new InvocationValidationError("Bouncer 返回了无法安全呈现的错误结果。");
        }
        return {
          content: [{ type: "text", text: sanitizeErrorText(textBlocks[0].text, context) }],
          isError: true,
        };
      }
      const schema = resultSchemas[tool as keyof typeof resultSchemas];
      if (!schema) throw new InvocationValidationError(`Bouncer 结果工具未知：${tool}`);
      const parsed = schema.safeParse(result.structuredContent);
      if (!parsed.success) {
        throw new InvocationValidationError("Bouncer 返回结果不符合固定 0.2.0 协议结构。");
      }
      const structured = parsed.data as Record<string, unknown>;
      if (tool === "compliance_check") {
        const meta = structured.meta as Record<string, unknown>;
        structured.meta = { ...meta, repo: "inline://project" };
      }
      const normalized = {
        content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
        structuredContent: structured,
        isError: false,
      };
      if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > BOUNCER_OUTPUT_LIMIT) {
        throw new InvocationValidationError("Bouncer 结果超过 1.5 MiB 安全上限。");
      }
      return normalized;
    } finally {
      await cleanInvocation(context);
    }
  },
};

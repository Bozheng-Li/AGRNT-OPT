import { access, lstat, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

const OUTPUT_LIMIT = 1_500_000;
const PROJECT_LIMIT = 512_000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const STATE_ID = /^[A-Za-z][\w-]*(\.[\w-]+)*$/;
const TARGET_REF = /^[A-Za-z][\w-]*(#[A-Za-z][\w-]*(\.[\w-]+)*)?$/;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

type UxloomContext = AdapterContext & {
  uxloomRoot?: string;
  uxloomPackageRoot?: string;
  uxloomSessionRoot?: string;
  uxloomProjectPath?: string;
};

const sessionId = z.string().trim().regex(SESSION_ID, "sessionId 必须是规范 UUID。 ");
const platform = z.enum(["web", "mweb", "ios", "android"]);
const platforms = z
  .array(platform)
  .min(1)
  .max(4)
  .refine((items) => new Set(items).size === items.length, "平台不能重复。");
const safeId = z.string().trim().min(1).max(80).regex(SAFE_ID, "标识必须以字母开头，且只能包含字母、数字、下划线和连字符。");
const stateId = z.string().trim().min(1).max(80).regex(STATE_ID, "状态标识格式无效。");
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

const journeyState = z
  .object({
    screen: safeId,
    final: z.boolean().optional(),
    on: z.record(z.string().trim().min(1).max(80), z.string().trim().max(170).regex(TARGET_REF)).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.on && Object.keys(value.on).length > 20) {
      context.addIssue({ code: "custom", path: ["on"], message: "单个状态最多包含 20 个事件。" });
    }
  });

const journey = z
  .object({
    id: safeId,
    goal: boundedText(500).optional(),
    entry: safeId,
    states: z.record(safeId, journeyState),
  })
  .strict()
  .superRefine((value, context) => {
    const entries = Object.entries(value.states);
    if (entries.length < 1 || entries.length > 30) {
      context.addIssue({ code: "custom", path: ["states"], message: "旅程必须包含 1 到 30 个状态。" });
    }
    if (!Object.hasOwn(value.states, value.entry)) {
      context.addIssue({ code: "custom", path: ["entry"], message: "入口必须引用当前旅程中的状态。" });
    }
  });

const label = z
  .object({
    key: z.string().trim().min(1).max(120),
    en: z.string().trim().min(1).max(300),
    maxChars: z.number().int().positive().max(1_000).optional(),
  })
  .strict();
const component = z
  .object({
    id: safeId.optional(),
    semantic: boundedText(100),
    label: label.optional(),
    fg: z.string().regex(HEX).optional(),
    bg: z.string().regex(HEX).optional(),
    minTargetPx: z.number().finite().positive().max(512).optional(),
    interactive: z.boolean().optional(),
  })
  .strict();
const exemption = z
  .object({ state: z.string().trim().min(1).max(80).regex(STATE_ID), reason: boundedText(500).min(15) })
  .strict();
const screen = z
  .object({
    id: safeId,
    intent: boundedText(500).optional(),
    requiredStates: z.array(stateId).min(1).max(20),
    designedStates: z.array(stateId).max(20),
    components: z.array(component).max(30).optional(),
    platforms: platforms.optional(),
    exemptions: z.array(exemption).max(12).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [key, values] of [["requiredStates", value.requiredStates], ["designedStates", value.designedStates]] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", path: [key], message: "状态不能重复。" });
      }
    }
    const required = new Set(value.requiredStates);
    value.designedStates.forEach((item, index) => {
      if (!required.has(item)) {
        context.addIssue({ code: "custom", path: ["designedStates", index], message: "已设计状态必须属于 requiredStates。" });
      }
    });
  });

const briefJourney = z.union([
  boundedText(200),
  z.object({ name: boundedText(80), goal: boundedText(300) }).strict(),
]);
const briefAnswers = z
  .object({
    platforms: platforms.optional(),
    journeys: z.array(briefJourney).max(16).nullable().optional(),
    audience: boundedText(500).nullable().optional(),
    offline: z.boolean().optional(),
    brand: z
      .object({
        primaryColor: z.string().regex(HEX).optional(),
        tone: boundedText(200).optional(),
        typeface: boundedText(120).optional(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

const schemas = {
  project_init: z.object({ sessionId, name: boundedText(120), platforms }).strict(),
  brief_start: z.object({ sessionId, prompt: boundedText(6_000) }).strict(),
  brief_answer: z.object({ sessionId, prompt: boundedText(6_000), answers: briefAnswers }).strict(),
  journey_define: z.object({ sessionId, journey }).strict(),
  screen_register: z.object({ sessionId, screen }).strict(),
  project_validate: z.object({ sessionId }).strict(),
  screen_critique: z.object({ sessionId, screenId: safeId }).strict(),
  coverage_report: z.object({ sessionId }).strict(),
} satisfies Record<string, z.ZodType>;

const finding = z
  .object({
    critic: z.string().min(1).max(120),
    code: z.string().max(120).optional(),
    severity: z.enum(["error", "warning"]),
    journey: z.string().max(80).optional(),
    state: z.string().max(80).optional(),
    screen: z.string().max(80).optional(),
    component: z.string().max(80).optional(),
    message: z.string().min(1).max(4_000),
    fix: z.string().max(4_000).optional(),
  })
  .strict();
const summary = z
  .object({
    errors: z.number().int().nonnegative().max(10_000),
    warnings: z.number().int().nonnegative().max(10_000),
    journeys: z.number().int().nonnegative().max(16),
    screens: z.number().int().nonnegative().max(40),
    stateCoverage: z.object({ designed: z.number().int().nonnegative(), required: z.number().int().nonnegative() }).strict(),
  })
  .strict();
const report = z.object({ findings: z.array(finding).max(2_000), summary }).strict();
const project = z
  .object({
    name: z.string().min(1).max(120),
    formatVersion: z.literal("0.1"),
    platforms,
    journeys: z.array(journey).max(16),
    screens: z.array(screen).max(40),
  })
  .strict();

const resultSchemas = {
  project_init: z.object({ ok: z.literal(true), path: z.string().min(1).max(1_000), project }).strict(),
  brief_start: z
    .object({
      resultType: z.literal("inputRequired"),
      instructions: z.string().min(1).max(2_000),
      inputRequests: z
        .array(z.object({
          id: z.enum(["platforms", "journeys", "audience", "offline", "brand"]),
          question: z.string().min(1).max(500),
          expects: z.string().min(1).max(500),
          default: z.unknown(),
          rationale: z.string().min(1).max(1_000),
          askHuman: z.boolean(),
        }).strict())
        .length(5),
    })
    .strict(),
  brief_answer: z
    .object({
      ok: z.literal(true),
      brief: z.object({
        prompt: z.string().max(6_000),
        answers: z.record(z.string(), z.unknown()),
        assumptionLedger: z.array(z.object({ question: z.string().max(500), assumed: z.unknown(), rationale: z.string().max(1_000) }).strict()).max(5),
      }).strict(),
      next: z.string().min(1).max(1_000),
    })
    .strict(),
  journey_define: z.object({ ok: z.literal(true), journeys: z.array(z.string().max(80)).max(16) }).strict(),
  screen_register: z.object({ ok: z.literal(true), screens: z.array(z.string().max(80)).max(40) }).strict(),
  project_validate: report,
  screen_critique: z.object({ screenId: z.string().max(80), findings: z.array(finding).max(2_000) }).strict(),
  coverage_report: z
    .object({
      headline: z.string().min(1).max(2_000),
      perScreen: z.array(z.object({
        screen: z.string().max(80),
        required: z.number().int().nonnegative().max(20),
        designed: z.number().int().nonnegative().max(20),
        missing: z.array(z.string().max(80)).max(20),
      }).strict()).max(40),
      happyPathScreens: z.number().int().nonnegative().max(40),
      errors: z.number().int().nonnegative().max(10_000),
      warnings: z.number().int().nonnegative().max(10_000),
    })
    .strict(),
} satisfies Record<string, z.ZodType>;

function defaultRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "uxloom");
}

function defaultPackageRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "uxloom");
}

function bootstrapEntryPoint(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "uxloom-mcp-entry.mjs");
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function requirePlainDirectory(target: string, label: string): Promise<void> {
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new InvocationValidationError(`${label}必须是普通目录，不能是符号链接或目录联接。`);
  }
}

async function cleanupStaleSessions(sessionsRoot: string, current: string): Promise<void> {
  const now = Date.now();
  for (const entry of await readdir(sessionsRoot, { withFileTypes: true })) {
    if (entry.name === current || !SESSION_ID.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    const target = path.join(sessionsRoot, entry.name);
    const info = await lstat(target);
    if (info.isSymbolicLink() || now - info.mtimeMs < SESSION_TTL_MS) continue;
    await rm(target, { recursive: true, force: true });
  }
}

async function prepareSession(context: UxloomContext, id: string): Promise<void> {
  const root = path.resolve(context.uxloomRoot ?? defaultRoot());
  await mkdir(root, { recursive: true });
  await requirePlainDirectory(root, "UXLoom 运行根目录");
  const sessions = path.join(root, "sessions");
  await mkdir(sessions, { recursive: true });
  await requirePlainDirectory(sessions, "UXLoom 会话目录");
  await cleanupStaleSessions(sessions, id);
  const sessionRoot = path.join(sessions, id);
  if (!isWithin(sessions, sessionRoot)) throw new InvocationValidationError("UXLoom 会话越过了运行沙箱。");
  await mkdir(sessionRoot, { recursive: true });
  await requirePlainDirectory(sessionRoot, "UXLoom 当前会话目录");
  const projectPath = path.join(sessionRoot, "uxloom.project.json");
  try {
    const info = await lstat(projectPath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > PROJECT_LIMIT) {
      throw new InvocationValidationError("UXLoom 会话项目必须是 512 KiB 以内的普通 JSON 文件。");
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  context.uxloomSessionRoot = sessionRoot;
  context.uxloomProjectPath = projectPath;
}

async function enforceCollectionLimit(tool: string, input: Record<string, unknown>, context: UxloomContext): Promise<void> {
  if (tool !== "journey_define" && tool !== "screen_register") return;
  const projectPath = context.uxloomProjectPath;
  if (!projectPath) return;
  try {
    const info = await stat(projectPath);
    if (info.size > PROJECT_LIMIT) throw new InvocationValidationError("UXLoom 会话项目超过 512 KiB 安全上限。");
    const current = JSON.parse(await readFile(projectPath, "utf8")) as { journeys?: Array<{ id?: unknown }>; screens?: Array<{ id?: unknown }> };
    const collection = tool === "journey_define" ? current.journeys : current.screens;
    const item = input[tool === "journey_define" ? "journey" : "screen"] as { id: string };
    const maximum = tool === "journey_define" ? 16 : 40;
    if (Array.isArray(collection) && collection.length >= maximum && !collection.some((entry) => entry?.id === item.id)) {
      throw new InvocationValidationError(`UXLoom 单个会话最多保存 ${maximum} 个${tool === "journey_define" ? "旅程" : "屏幕"}。`);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    if (error instanceof SyntaxError) throw new InvocationValidationError("UXLoom 会话项目 JSON 已损坏，请重置会话。");
    throw error;
  }
}

function parseInput(tool: string, input: unknown): Record<string, unknown> {
  const schema = schemas[tool as keyof typeof schemas];
  if (!schema) throw new InvocationValidationError(`UXLoom Web 适配未开放工具：${tool}`);
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new InvocationValidationError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；"));
  }
  if (Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > 96_000) {
    throw new InvocationValidationError("UXLoom 单次输入不能超过 96 KiB。");
  }
  return parsed.data as Record<string, unknown>;
}

function sanitize(text: string, context: UxloomContext): string {
  let output = text;
  for (const target of [context.uxloomProjectPath, context.uxloomSessionRoot]) {
    if (target) output = output.split(target).join("session://project");
  }
  return output;
}

export const uxloomAdapter: PluginAdapter = {
  slug: "uxloom-journey-studio",
  allowedTools: Object.keys(schemas),
  requestTimeoutMs() {
    return 30_000;
  },
  async validateAndTransform(tool, input, rawContext) {
    const context = rawContext as UxloomContext;
    const parsed = parseInput(tool, input);
    await prepareSession(context, String(parsed.sessionId));
    await enforceCollectionLimit(tool, parsed, context);
    const upstream = { ...parsed };
    delete upstream.sessionId;
    return upstream;
  },
  async prepare(rawContext) {
    const context = rawContext as UxloomContext;
    const packageRoot = path.resolve(context.uxloomPackageRoot ?? defaultPackageRoot());
    const moduleRoot = path.dirname(packageRoot);
    const bootstrap = bootstrapEntryPoint();
    if (!context.uxloomSessionRoot || !context.uxloomProjectPath) {
      throw new InvocationValidationError("UXLoom 会话尚未准备完成。");
    }
    try {
      await Promise.all([
        access(path.join(packageRoot, "package.json")),
        access(path.join(packageRoot, "dist", "index.js")),
        access(path.join(moduleRoot, "@modelcontextprotocol", "sdk", "package.json")),
        access(bootstrap),
      ]);
    } catch {
      throw new InvocationValidationError("UXLoom MCP 0.1.3 尚未安装，无法启动固定版本运行时。");
    }
    await requirePlainDirectory(context.uxloomSessionRoot, "UXLoom 当前会话目录");
    return {
      command: process.execPath,
      args: ["--max-old-space-size=192", bootstrap],
      cwd: context.uxloomSessionRoot,
      env: {
        HOME: context.uxloomSessionRoot,
        USERPROFILE: context.uxloomSessionRoot,
        TMPDIR: context.uxloomSessionRoot,
        TEMP: context.uxloomSessionRoot,
        TMP: context.uxloomSessionRoot,
        NO_UPDATE_NOTIFIER: "1",
        AGENT_OPT_UXLOOM_SESSION_ROOT: context.uxloomSessionRoot,
        AGENT_OPT_UXLOOM_PROJECT_PATH: context.uxloomProjectPath,
        AGENT_OPT_UXLOOM_PACKAGE_ROOT: packageRoot,
        AGENT_OPT_UXLOOM_MODULE_ROOT: moduleRoot,
      },
    };
  },
  async normalizeResult(tool, result: AdapterToolResult, rawContext) {
    const context = rawContext as UxloomContext;
    const blocks = result.content.filter((block) => {
      if (!block || typeof block !== "object") return false;
      const candidate = block as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string";
    }) as Array<{ type: "text"; text: string }>;
    if (blocks.length !== 1 || blocks[0].text.length > OUTPUT_LIMIT) {
      throw new InvocationValidationError("UXLoom 返回了无法安全呈现的结果。");
    }
    const safeText = sanitize(blocks[0].text, context);
    if (result.isError) return { content: [{ type: "text", text: safeText }], isError: true };
    let candidate: unknown;
    try {
      candidate = JSON.parse(blocks[0].text);
    } catch {
      throw new InvocationValidationError("UXLoom 返回结果不是有效 JSON。");
    }
    const schema = resultSchemas[tool as keyof typeof resultSchemas];
    const parsed = schema?.safeParse(candidate);
    if (!parsed?.success) {
      throw new InvocationValidationError("UXLoom 返回结果不符合固定 0.1.3 协议结构。");
    }
    const structured = parsed.data as Record<string, unknown>;
    if (tool === "project_init") structured.path = "session://project";
    const normalized = {
      content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
      structuredContent: structured,
      isError: false,
    };
    if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > OUTPUT_LIMIT) {
      throw new InvocationValidationError("UXLoom 结果超过 1.5 MiB 安全上限。");
    }
    return normalized;
  },
};

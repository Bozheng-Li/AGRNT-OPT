import { access, lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

const packageEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules",
  "design-constraint-validator",
  "mcp",
  "index.js",
);
const bootstrapEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "scripts",
  "design-constraint-mcp-entry.mjs",
);

type DesignContext = AdapterContext & { designConstraintRoot?: string };

function inspectJson(value: unknown, context: z.RefinementCtx): void {
  let nodes = 0;
  let keys = 0;
  const visit = (candidate: unknown, depth: number, location: Array<string | number>): void => {
    nodes += 1;
    if (nodes > 4_000) {
      context.addIssue({ code: "custom", path: location, message: "JSON 节点数量不能超过 4,000。" });
      return;
    }
    if (depth > 14) {
      context.addIssue({ code: "custom", path: location, message: "JSON 嵌套深度不能超过 14 层。" });
      return;
    }
    if (typeof candidate === "string" && candidate.length > 4_000) {
      context.addIssue({ code: "custom", path: location, message: "单个字符串不能超过 4,000 个字符。" });
      return;
    }
    if (Array.isArray(candidate)) {
      if (candidate.length > 1_000) {
        context.addIssue({ code: "custom", path: location, message: "单个数组不能超过 1,000 项。" });
        return;
      }
      candidate.forEach((item, index) => visit(item, depth + 1, [...location, index]));
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate as Record<string, unknown>)) {
        keys += 1;
        if (keys > 4_000) {
          context.addIssue({ code: "custom", path: location, message: "JSON 键数量不能超过 4,000。" });
          return;
        }
        if (["__proto__", "prototype", "constructor"].includes(key)) {
          context.addIssue({ code: "custom", path: [...location, key], message: "JSON 不能包含原型相关键。" });
          continue;
        }
        if (key.length > 240) {
          context.addIssue({ code: "custom", path: [...location, key], message: "JSON 键名不能超过 240 个字符。" });
          continue;
        }
        visit(item, depth + 1, [...location, key]);
      }
    }
  };
  visit(value, 0, []);
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 180_000) {
    context.addIssue({ code: "custom", path: [], message: "JSON 输入不能超过 180 KiB。" });
  }
}

const boundedObject = z
  .custom<Record<string, unknown>>(
    (value) => value !== null && typeof value === "object" && !Array.isArray(value),
    "必须是 JSON 对象。",
  )
  .superRefine(inspectJson);
const safeId = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "标识只能包含字母、数字、点、下划线、斜杠和连字符。");
const wcagRule = z
  .object({
    foreground: safeId,
    background: safeId,
    ratio: z.number().finite().gt(1).max(21).optional(),
    description: z.string().trim().max(500).optional(),
    backdrop: z.string().trim().max(100).optional(),
  })
  .strict();
const thresholdRule = z
  .object({
    id: safeId,
    op: z.enum(["<=", ">="]),
    valuePx: z.number().finite().nonnegative().max(1_000_000),
    where: z.string().trim().max(500).optional(),
    level: z.enum(["error", "warn"]).optional(),
  })
  .strict();
const constraints = z
  .object({
    enableBuiltInWcagDefaults: z.boolean().optional(),
    enableBuiltInThreshold: z.boolean().optional(),
    wcag: z.array(wcagRule).max(100).optional(),
    thresholds: z.array(thresholdRule).max(100).optional(),
  })
  .strict();
const breakpoint = z.enum(["sm", "md", "lg"]).optional();

const validateSchema = z.object({ tokens: boundedObject, constraints, breakpoint }).strict();
const whySchema = z.object({ tokens: boundedObject, tokenId: safeId }).strict();
const graphSchema = z.object({ tokens: boundedObject, format: z.literal("json").optional() }).strict();
const listConstraintsSchema = z.object({ tokens: boundedObject, constraints, breakpoint }).strict();
const violationSchema = z
  .object({
    ruleId: safeId,
    level: z.enum(["error", "warn"]).optional(),
    message: z.string().trim().max(2_000).optional(),
    nodes: z.array(safeId).max(20).optional(),
    edges: z.array(z.tuple([safeId, safeId])).max(100).optional(),
    context: boundedObject.optional(),
  })
  .strict();

const insightShape = {
  tokens: boundedObject,
  constraints,
  breakpoint,
  violation: violationSchema.optional(),
  ruleId: safeId.optional(),
  nodes: z.array(safeId).max(20).optional(),
  context: boundedObject.optional(),
};
const explainSchema = z.object(insightShape).strict().superRefine((value, context) => {
  if (!value.violation && !value.ruleId) {
    context.addIssue({ code: "custom", path: ["ruleId"], message: "请提供 violation 或 ruleId。" });
  }
});
const suggestFixSchema = z
  .object({ ...insightShape, target: z.enum(["foreground", "background"]).optional() })
  .strict()
  .superRefine((value, context) => {
    if (!value.violation && !value.ruleId) {
      context.addIssue({ code: "custom", path: ["ruleId"], message: "请提供 violation 或 ruleId。" });
    }
  });

const schemas = {
  validate: validateSchema,
  why: whySchema,
  graph: graphSchema,
  "list-constraints": listConstraintsSchema,
  explain: explainSchema,
  "suggest-fix": suggestFixSchema,
} satisfies Record<string, z.ZodType>;

function parse(tool: string, input: unknown): Record<string, unknown> {
  const schema = schemas[tool as keyof typeof schemas];
  if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new InvocationValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；"),
    );
  }
  return result.data as Record<string, unknown>;
}

function defaultRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "design-constraint-validator");
}

async function ensureSandbox(root: string): Promise<{ root: string; home: string; temporary: string }> {
  const resolved = path.resolve(/* turbopackIgnore: true */ root);
  const home = path.join(resolved, "home");
  const temporary = path.join(resolved, "tmp");
  await Promise.all([mkdir(resolved, { recursive: true }), mkdir(home, { recursive: true }), mkdir(temporary, { recursive: true })]);
  for (const target of [resolved, home, temporary]) {
    if ((await lstat(target)).isSymbolicLink()) {
      throw new InvocationValidationError("设计约束运行目录不能是符号链接。");
    }
  }
  return { root: resolved, home, temporary };
}

export const designConstraintAdapter: PluginAdapter = {
  slug: "design-constraint-studio",
  allowedTools: Object.keys(schemas),
  requestTimeoutMs() {
    return 45_000;
  },
  async prepare(context) {
    try {
      await Promise.all([access(packageEntryPoint), access(bootstrapEntryPoint)]);
    } catch {
      throw new InvocationValidationError("Design Constraint Validator MCP 尚未安装，请执行 npm install。");
    }
    const extended = context as DesignContext;
    const sandbox = await ensureSandbox(extended.designConstraintRoot ?? defaultRoot());
    return {
      command: process.execPath,
      args: ["--max-old-space-size=192", bootstrapEntryPoint],
      cwd: sandbox.root,
      env: {
        HOME: sandbox.home,
        USERPROFILE: sandbox.home,
        TMPDIR: sandbox.temporary,
        TEMP: sandbox.temporary,
        TMP: sandbox.temporary,
        NO_UPDATE_NOTIFIER: "1",
      },
    };
  },
  async validateAndTransform(tool, input) {
    return parse(tool, input);
  },
  async normalizeResult(tool, result: AdapterToolResult) {
    const content = result.content.filter((block) => {
      if (!block || typeof block !== "object") return false;
      const candidate = block as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string";
    });
    if (content.length !== 1) {
      throw new InvocationValidationError("Design Constraint Validator 未返回唯一文本结果。");
    }
    const structured = z
      .object({ tool: z.literal(tool), ok: z.boolean() })
      .passthrough()
      .safeParse(result.structuredContent);
    if (!structured.success) {
      throw new InvocationValidationError("Design Constraint Validator 返回结果不符合固定 2.3.0 协议结构。");
    }
    const normalized = { content, structuredContent: structured.data, isError: result.isError };
    if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 1_500_000) {
      throw new InvocationValidationError("设计约束结果超过 1.5 MiB 安全上限。");
    }
    return normalized;
  },
};

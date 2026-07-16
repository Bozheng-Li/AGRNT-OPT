import { access, lstat, mkdir } from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { InvocationValidationError } from "./errors";
import { resolveSandboxPath } from "./sandbox";
import {
  loadSkillIndex,
  readSkillDocument,
  searchSkillText,
} from "./skill-runtime";
import { validatePublicHttpUrl } from "./url-safety";

export type AdapterContext = {
  filesystemRoot?: string;
  memoryFile?: string;
  gitRoot?: string;
  sqliteDatabase?: string;
  defluffRoot?: string;
  mermaidRoot?: string;
  blueprintRoot?: string;
  oxidizeRoot?: string;
  bumpguardRoot?: string;
  svelteRoot?: string;
};

export type AdapterLaunch = {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
};

export type PluginAdapter = {
  slug: string;
  allowedTools: readonly string[];
  /** stdio MCP child process (default) or in-process skill/document runtime. */
  mode?: "stdio" | "in-process";
  requestTimeoutMs?(tool: string): number;
  persistentSession?: {
    key(context: AdapterContext): string;
    idleMs: number;
  };
  prepare(context: AdapterContext): Promise<AdapterLaunch>;
  validateAndTransform(tool: string, input: unknown, context: AdapterContext): Promise<Record<string, unknown>>;
  invokeInProcess?(
    tool: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterToolResult>;
  normalizeResult?(
    tool: string,
    result: AdapterToolResult,
    context: AdapterContext,
  ): Promise<AdapterToolResult>;
};

export type AdapterToolResult = {
  content: unknown[];
  structuredContent?: Record<string, unknown>;
  isError: boolean;
};

const relativePath = z.string().trim().min(1).max(500);

const filesystemSchemas = {
  list_directory: z.object({ path: relativePath.default(".") }),
  read_text_file: z.object({
    path: relativePath,
    head: z.number().int().positive().max(5_000).optional(),
    tail: z.number().int().positive().max(5_000).optional(),
  }),
  write_file: z.object({ path: relativePath, content: z.string().max(200_000) }),
  create_directory: z.object({ path: relativePath }),
  search_files: z.object({
    path: relativePath.default("."),
    pattern: z.string().trim().min(1).max(200),
    excludePatterns: z.array(z.string().max(200)).max(30).default([]),
  }),
  directory_tree: z.object({
    path: relativePath.default("."),
    excludePatterns: z.array(z.string().max(200)).max(30).default([]),
  }),
  get_file_info: z.object({ path: relativePath }),
  list_allowed_directories: z.object({}),
} satisfies Record<string, z.ZodType>;

const memorySchemas = {
  create_entities: z.object({
    entities: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          entityType: z.string().trim().min(1).max(100),
          observations: z.array(z.string().trim().min(1).max(2_000)).max(50),
        }),
      )
      .min(1)
      .max(50),
  }),
  create_relations: z.object({
    relations: z
      .array(
        z.object({
          from: z.string().trim().min(1).max(200),
          to: z.string().trim().min(1).max(200),
          relationType: z.string().trim().min(1).max(100),
        }),
      )
      .min(1)
      .max(100),
  }),
  add_observations: z.object({
    observations: z
      .array(
        z.object({
          entityName: z.string().trim().min(1).max(200),
          contents: z.array(z.string().trim().min(1).max(2_000)).min(1).max(50),
        }),
      )
      .min(1)
      .max(50),
  }),
  delete_entities: z.object({ entityNames: z.array(z.string().trim().min(1).max(200)).min(1).max(50) }),
  delete_observations: z.object({
    deletions: z
      .array(
        z.object({
          entityName: z.string().trim().min(1).max(200),
          observations: z.array(z.string().trim().min(1).max(2_000)).min(1).max(50),
        }),
      )
      .min(1)
      .max(50),
  }),
  delete_relations: z.object({
    relations: z
      .array(
        z.object({
          from: z.string().trim().min(1).max(200),
          to: z.string().trim().min(1).max(200),
          relationType: z.string().trim().min(1).max(100),
        }),
      )
      .min(1)
      .max(100),
  }),
  read_graph: z.object({}),
  search_nodes: z.object({ query: z.string().trim().min(1).max(500) }),
  open_nodes: z.object({ names: z.array(z.string().trim().min(1).max(200)).min(1).max(50) }),
} satisfies Record<string, z.ZodType>;

const sequentialThinkingSchema = z.object({
  thought: z.string().trim().min(1).max(20_000),
  nextThoughtNeeded: z.boolean(),
  thoughtNumber: z.number().int().positive().max(1_000),
  totalThoughts: z.number().int().positive().max(1_000),
  isRevision: z.boolean().optional(),
  revisesThought: z.number().int().positive().max(1_000).optional(),
  branchFromThought: z.number().int().positive().max(1_000).optional(),
  branchId: z.string().trim().min(1).max(100).optional(),
  needsMoreThoughts: z.boolean().optional(),
});

const timezoneName = z.string().trim().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "请输入有效的 IANA 时区名称，例如 Asia/Shanghai。");

const timeSchemas = {
  get_current_time: z.object({ timezone: timezoneName }),
  convert_time: z.object({
    source_timezone: timezoneName,
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "时间必须使用 24 小时 HH:MM 格式。"),
    target_timezone: timezoneName,
  }),
} satisfies Record<string, z.ZodType>;

const fetchSchema = z.object({
  url: z.string().trim().min(1).max(2_000),
  max_length: z.number().int().positive().max(100_000).default(12_000),
  start_index: z.number().int().min(0).max(10_000_000).default(0),
  raw: z.boolean().default(false),
});

const sandboxRelativePath = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !path.isAbsolute(value) && !/^[a-zA-Z]:/.test(value) && !value.includes("\0"), {
    message: "只允许使用 Git 沙箱内的相对路径。",
  });

type SqlInspection = {
  tokens: string[];
};

function inspectSingleSqlStatement(value: string): SqlInspection {
  let normalized = "";
  let state: "normal" | "single" | "double" | "backtick" | "bracket" | "line-comment" | "block-comment" =
    "normal";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];

    if (state === "normal") {
      if (character === "'") {
        state = "single";
        normalized += " ";
      } else if (character === '"') {
        state = "double";
        normalized += " ";
      } else if (character === "`") {
        state = "backtick";
        normalized += " ";
      } else if (character === "[") {
        state = "bracket";
        normalized += " ";
      } else if (character === "-" && next === "-") {
        state = "line-comment";
        normalized += "  ";
        index += 1;
      } else if (character === "/" && next === "*") {
        state = "block-comment";
        normalized += "  ";
        index += 1;
      } else {
        normalized += character;
      }
      continue;
    }

    if (state === "single") {
      normalized += " ";
      if (character === "'" && next === "'") {
        normalized += " ";
        index += 1;
      } else if (character === "'") {
        state = "normal";
      }
      continue;
    }

    if (state === "line-comment") {
      if (character === "\n" || character === "\r") {
        state = "normal";
        normalized += character;
      } else {
        normalized += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      normalized += " ";
      if (character === "*" && next === "/") {
        normalized += " ";
        index += 1;
        state = "normal";
      }
      continue;
    }

    const closingCharacter = state === "double" ? '"' : state === "backtick" ? "`" : "]";
    if (character === closingCharacter && next === closingCharacter && state !== "bracket") {
      normalized += "  ";
      index += 1;
    } else if (character === closingCharacter) {
      normalized += " ";
      state = "normal";
    } else {
      normalized += /[A-Za-z0-9_]/.test(character) ? character : " ";
    }
  }

  if (state !== "normal" && state !== "line-comment") {
    throw new Error("SQL 包含未闭合的字符串、标识符或注释。");
  }

  const executable = normalized.trim();
  const delimiter = executable.indexOf(";");
  if (delimiter >= 0 && executable.slice(delimiter + 1).trim()) {
    throw new Error("一次只能执行一条 SQL 语句。");
  }

  const statement = delimiter >= 0 ? executable.slice(0, delimiter).trim() : executable;
  if (!statement) throw new Error("SQL 语句不能为空。");

  return {
    tokens: (statement.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map((token) => token.toUpperCase()),
  };
}

const forbiddenSqlTokens = new Set(["ATTACH", "DETACH", "PRAGMA", "VACUUM", "REINDEX", "LOAD_EXTENSION"]);

function sqlStatement(
  expected: (tokens: string[]) => boolean,
  expectedMessage: string,
): z.ZodType<string> {
  return z
    .string()
    .trim()
    .min(1)
    .max(20_000)
    .superRefine((value, context) => {
      let inspection: SqlInspection;
      try {
        inspection = inspectSingleSqlStatement(value);
      } catch (error) {
        context.addIssue({
          code: "custom",
          message: error instanceof Error ? error.message : "SQL 语句无法解析。",
        });
        return;
      }

      if (!expected(inspection.tokens)) {
        context.addIssue({ code: "custom", message: expectedMessage });
      }

      const forbidden = inspection.tokens.find((token) => forbiddenSqlTokens.has(token));
      if (forbidden) {
        context.addIssue({ code: "custom", message: `禁止使用 ${forbidden} 等越界 SQL 能力。` });
      }
    });
}

const sqlSelect = sqlStatement((tokens) => tokens[0] === "SELECT", "read_query 只允许 SELECT 语句。");
const sqlWrite = sqlStatement(
  (tokens) => ["INSERT", "UPDATE", "DELETE", "REPLACE"].includes(tokens[0]),
  "write_query 只允许 INSERT、UPDATE、DELETE 或 REPLACE 语句。",
);
const sqlCreateTable = sqlStatement(
  (tokens) => tokens[0] === "CREATE" && tokens[1] === "TABLE",
  "create_table 只允许 CREATE TABLE 语句。",
);

const gitRevision = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !value.startsWith("-"), "Git 修订或目标不能以连字符开头。")
  .refine((value) => !/[\x00-\x20\x7f]/.test(value), "Git 修订或目标不能包含空白或控制字符。")
  .refine(
    (value) => /^[A-Za-z0-9][A-Za-z0-9._/@{}^~+-]*$/.test(value),
    "Git 修订或目标包含不受支持的特殊字符。",
  );

function isSafeGitBranchName(value: string): boolean {
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) return false;
  if (/^(?:-|\.|\/)|(?:\.|\/)$/.test(value)) return false;
  if (value === "@" || /^HEAD$/i.test(value) || value.includes("..") || value.includes("@{") || value.includes("//")) {
    return false;
  }
  return value.split("/").every((segment) => segment && !segment.startsWith(".") && !segment.endsWith(".lock"));
}

const gitBranchName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isSafeGitBranchName, "请输入安全且符合 Git ref 规则的分支名。");

const gitDateFilter = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !value.startsWith("-") && !/[\x00\r\n\x7f]/.test(value), "Git 日期过滤值包含非法字符。");

const sqliteSchemas = {
  read_query: z.object({ query: sqlSelect }),
  write_query: z.object({ query: sqlWrite }),
  create_table: z.object({ query: sqlCreateTable }),
  list_tables: z.object({}),
  describe_table: z.object({
    table_name: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "表名只能包含字母、数字和下划线。"),
  }),
  append_insight: z.object({
    insight: z.string().trim().min(1).max(4_000),
  }),
} satisfies Record<string, z.ZodType>;

const defluffPattern = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[\r\n]/.test(value), "词条必须是单行短语。");

const defluffSchemas = {
  slop_detect: z.object({
    text: z.string().trim().min(1).max(100_000),
  }),
  slop_add: z.object({
    pattern: defluffPattern,
    category: z.enum(["cliche", "hedge", "ai-vocab", "corporate", "transition"]),
    scope: z.literal("project").default("project"),
  }),
  slop_ignore: z.object({
    pattern: defluffPattern,
    scope: z.literal("project").default("project"),
  }),
} satisfies Record<string, z.ZodType>;

const mermaidSource = z.string().trim().min(1).max(200_000);
const mermaidBackground = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .refine(
    (value) => /^(?:transparent|white|black|gray|grey|red|green|blue|navy|cream|#[0-9a-f]{3,8})$/i.test(value),
    "背景色只允许常用颜色名或 3/4/6/8 位十六进制颜色。",
  );
const mermaidStyle = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "样式名只能包含字母、数字和连字符。");

const mermaidSchemas = {
  execute: z.object({
    code: z.string().trim().min(1).max(50_000),
    timeoutMs: z.number().int().min(50).max(5_000).default(2_000),
  }),
  render_png: z.object({
    source: mermaidSource,
    scale: z.number().min(0.25).max(4).default(2),
    background: mermaidBackground.default("white"),
    style: mermaidStyle.optional().nullable(),
    seed: z.number().int().min(0).max(2_147_483_647).default(0),
    output: z.enum(["base64", "file"]).default("base64"),
  }),
  describe: z.object({
    source: mermaidSource,
    format: z.enum(["text", "json", "facts"]).default("text"),
  }),
} satisfies Record<string, z.ZodType>;

const blueprintSource = z
  .string()
  .min(1)
  .max(200_000)
  .refine((value) => value.trim().length > 0, "图表源码不能为空。");
const blueprintChartType = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "图表类型只能包含字母、数字和连字符。");
const blueprintSampleName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "示例名称只能包含字母、数字和连字符。");
const blueprintSavePath = z.string().trim().min(1).max(500);

const blueprintSchemas = {
  validate_dsl: z.object({ source: blueprintSource }),
  inspect_dsl: z.object({ source: blueprintSource }),
  recommend_chart_type: z.object({
    columnTypes: z.array(z.enum(["string", "number", "date"])).min(1).max(64),
    rowCount: z.number().int().min(0).max(100_000_000),
    goal: z.string().trim().min(1).max(2_000).optional(),
  }),
  render: z.object({
    source: blueprintSource,
    format: z.enum(["svg", "png", "html"]).default("svg"),
    scene: z.number().int().min(0).max(1_000).optional(),
    width: z.number().int().min(1).max(1_600).default(800),
    height: z.number().int().min(1).max(1_600).default(500),
    modelVisible: z.boolean().default(true),
    save: blueprintSavePath.optional(),
  }),
  list_chart_types: z.object({}),
  describe_chart_type: z.object({ chartType: blueprintChartType }),
  get_example: z
    .object({
      chartType: blueprintChartType.optional(),
      name: blueprintSampleName.optional(),
    })
    .refine((value) => !(value.chartType && value.name), "chartType 与 name 只能选择一个。"),
  search_examples: z
    .object({
      query: z.string().trim().min(1).max(500).optional(),
      chartType: blueprintChartType.optional(),
      limit: z.number().int().min(1).max(20).default(10),
    })
    .refine((value) => Boolean(value.query || value.chartType), "请提供 query 或 chartType。"),
  list_palettes: z.object({}),
  get_grammar: z.object({
    section: z.enum(["all", "chart", "properties", "scenes", "annotations"]).default("all"),
  }),
  export_chart: z.object({
    source: blueprintSource,
    modelVisible: z.boolean().default(true),
  }),
} satisfies Record<string, z.ZodType>;

const oxidizePath = z.string().trim().min(1).max(500);
const oxidizePdfPath = oxidizePath.refine((value) => path.extname(value).toLowerCase() === ".pdf", {
  message: "PDF 文件路径必须以 .pdf 结尾。",
});
const oxidizePassword = z.string().min(1).max(256);
const oxidizeSessionId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "会话 ID 格式无效。");
const oxidizeScalar = z.union([z.string().max(10_000), z.number().finite(), z.boolean()]);
const oxidizeValues = z
  .record(z.string().trim().min(1).max(100), oxidizeScalar)
  .refine((value) => Object.keys(value).length <= 100, "表单值最多包含 100 个字段。");

const oxidizeConvertSchema = z
  .object({
    path: oxidizePdfPath,
    format: z.enum(["markdown", "chunks", "rag"]),
    password: oxidizePassword.optional().nullable(),
    max_tokens: z.number().int().min(16).max(4_096).default(256),
    overlap: z.number().int().min(0).max(1_024).default(50),
  })
  .refine((value) => value.format !== "chunks" || value.overlap < value.max_tokens, {
    message: "chunks 模式下 overlap 必须小于 max_tokens。",
    path: ["overlap"],
  });

const oxidizeAnalyzeSchema = z
  .object({
    path: oxidizePdfPath,
    check: z.enum(["validate", "corruption", "compliance", "compare"]).default("validate"),
    compare_path: oxidizePdfPath.optional().nullable(),
    compliance_level: z.enum(["a1a", "a1b", "a2a", "a2b", "a2u", "a3a", "a3b", "a3u"]).default("a1b"),
  })
  .refine((value) => value.check !== "compare" || Boolean(value.compare_path), {
    message: "compare 检查必须提供 compare_path。",
    path: ["compare_path"],
  });

const oxidizeManipulateSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("split"), input_path: oxidizePdfPath, output_path: oxidizePath }),
  z.object({ operation: z.literal("merge"), input_paths: z.array(oxidizePdfPath).min(2).max(20), output_path: oxidizePdfPath }),
  z.object({ operation: z.literal("rotate"), input_path: oxidizePdfPath, output_path: oxidizePdfPath, degrees: z.union([z.literal(90), z.literal(180), z.literal(270)]) }),
  z.object({ operation: z.literal("extract_pages"), input_path: oxidizePdfPath, output_path: oxidizePdfPath, page_indices: z.array(z.number().int().min(0).max(499)).min(1).max(500) }),
  z.object({ operation: z.literal("reverse"), input_path: oxidizePdfPath, output_path: oxidizePdfPath }),
  z.object({ operation: z.literal("overlay"), input_path: oxidizePdfPath, overlay_path: oxidizePdfPath, output_path: oxidizePdfPath }),
]);

const oxidizeAnnotateSchema = z.discriminatedUnion("annotation_type", [
  z.object({
    input_path: oxidizePdfPath,
    output_path: oxidizePdfPath,
    annotation_type: z.literal("text"),
    page: z.number().int().min(0).max(499),
    x: z.number().min(0).max(2_000),
    y: z.number().min(0).max(2_000),
    contents: z.string().min(1).max(10_000),
  }),
  z.object({
    input_path: oxidizePdfPath,
    output_path: oxidizePdfPath,
    annotation_type: z.literal("highlight"),
    page: z.number().int().min(0).max(499),
    x: z.number().min(0).max(2_000),
    y: z.number().min(0).max(2_000),
    width: z.number().positive().max(2_000).default(100),
    height: z.number().positive().max(2_000).default(20),
  }),
]);

const oxidizeFormField = z.object({
  name: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/, "表单字段名包含不支持的字符。"),
  type: z.literal("text"),
  x: z.number().min(0).max(2_000),
  y: z.number().min(0).max(2_000),
  width: z.number().positive().max(2_000),
  height: z.number().positive().max(2_000),
  default_value: z.string().max(10_000).optional(),
});

const oxidizeFormsSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), output_path: oxidizePdfPath, fields: z.array(oxidizeFormField).min(1).max(50) }),
  z.object({ operation: z.literal("fill"), input_path: oxidizePdfPath, output_path: oxidizePdfPath, values: oxidizeValues }),
  z.object({ operation: z.literal("read"), input_path: oxidizePdfPath }),
  z.object({ operation: z.literal("validate"), input_path: oxidizePdfPath, values: oxidizeValues }),
]);

const oxidizeSecureSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("encrypt"),
    input_path: oxidizePdfPath,
    output_path: oxidizePdfPath,
    user_password: oxidizePassword,
    owner_password: oxidizePassword,
  }),
  z.object({ operation: z.literal("permissions"), input_path: oxidizePdfPath, password: oxidizePassword.optional().nullable() }),
  z.object({ operation: z.literal("verify_signatures"), input_path: oxidizePdfPath }),
]);

const oxidizeAddContentSchema = z.discriminatedUnion("content_type", [
  z.object({
    session_id: oxidizeSessionId,
    content_type: z.literal("text"),
    content: z.string().min(1).max(50_000),
    x: z.number().min(0).max(2_000),
    y: z.number().min(0).max(2_000),
    font: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9 -]+$/, "字体名包含不支持的字符。").optional().nullable(),
    font_size: z.number().min(4).max(144).default(12),
  }),
  z.object({ session_id: oxidizeSessionId, content_type: z.literal("new_page") }),
]);

const oxidizeSaveSchema = z
  .object({
    session_id: oxidizeSessionId,
    output_path: oxidizePdfPath,
    user_password: oxidizePassword.optional().nullable(),
    owner_password: oxidizePassword.optional().nullable(),
  })
  .refine((value) => Boolean(value.user_password) === Boolean(value.owner_password), {
    message: "加密保存必须同时提供 user_password 与 owner_password。",
  });

const oxidizeSchemas = {
  read_pdf: z.object({
    path: oxidizePdfPath,
    password: oxidizePassword.optional().nullable(),
    include_page_details: z.boolean().default(false),
  }),
  extract_text: z.object({
    path: oxidizePdfPath,
    page: z.number().int().min(0).max(499).optional().nullable(),
    password: oxidizePassword.optional().nullable(),
  }),
  convert_pdf: oxidizeConvertSchema,
  analyze_pdf: oxidizeAnalyzeSchema,
  extract_entities: z.object({ path: oxidizePdfPath }),
  manipulate_pdf: oxidizeManipulateSchema,
  annotate_pdf: oxidizeAnnotateSchema,
  manage_forms: oxidizeFormsSchema,
  secure_pdf: oxidizeSecureSchema,
  create_pdf: z.object({
    title: z.string().trim().min(1).max(200),
    author: z.string().trim().min(1).max(200).optional().nullable(),
    page_size: z.enum(["a4", "a4_landscape", "letter", "letter_landscape", "legal", "legal_landscape"]).default("a4"),
  }),
  add_pdf_content: oxidizeAddContentSchema,
  save_pdf: oxidizeSaveSchema,
} satisfies Record<string, z.ZodType>;

const bumpguardLanguage = z.enum(["python", "java", "dotnet"]);
const bumpguardPackage = z.string().trim().min(1).max(128);
const bumpguardVersion = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._+!-]*$/, "版本只能包含字母、数字及 . _ + ! -。")
  .refine((value) => !value.includes(".."), "版本不能包含连续点号。");
const bumpguardCode = z.string().min(1).max(100_000);

function validateBumpguardPackage(
  value: { language: z.infer<typeof bumpguardLanguage>; package: string },
  context: z.RefinementCtx,
): void {
  const patterns = {
    python: /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/,
    java: /^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/,
    dotnet: /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/,
  } as const;
  if (value.package.includes("..") || !patterns[value.language].test(value.package)) {
    context.addIssue({
      code: "custom",
      path: ["package"],
      message:
        value.language === "java"
          ? "Java 包必须是安全的 group:artifact 坐标。"
          : `${value.language === "python" ? "PyPI" : "NuGet"} 包名格式无效。`,
    });
  }
}

function bumpguardCoordinateSchema<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({ language: bumpguardLanguage.default("python"), package: bumpguardPackage, ...shape })
    .strict()
    .superRefine((value, context) =>
      validateBumpguardPackage(
        value as { language: z.infer<typeof bumpguardLanguage>; package: string },
        context,
      ),
    );
}

const bumpguardSchemas = {
  check_upgrade: bumpguardCoordinateSchema({
    to_version: bumpguardVersion,
    code: bumpguardCode,
    from_version: bumpguardVersion.optional(),
  }),
  diff_versions: bumpguardCoordinateSchema({
    to_version: bumpguardVersion,
    from_version: bumpguardVersion.optional(),
  }),
  verify_snippet: z.object({ code: bumpguardCode, language: bumpguardLanguage.default("python") }).strict(),
  check_import: bumpguardCoordinateSchema({}),
  list_symbols: bumpguardCoordinateSchema({
    version: bumpguardVersion.optional(),
    name_filter: z.string().trim().min(1).max(200).optional(),
  }),
  list_languages: z.object({}).strict(),
} satisfies Record<string, z.ZodType>;

const svelteSection = z
  .string()
  .trim()
  .min(1)
  .max(150)
  .regex(/^[A-Za-z0-9$@_./() -]+$/, "文档章节只能使用标题或官方 section path。")
  .refine((value) => !value.includes("..") && !value.includes("://"), "文档章节不能包含 URL 或路径穿越。");
const svelteSource = z.string().min(1).max(200_000).refine((value) => !value.includes("\0"), "源码不能包含 NUL 字符。");
const svelteFilename = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.svelte(?:\.(?:ts|js))?$/, "文件名必须是无路径的 .svelte、.svelte.ts 或 .svelte.js 名称。");
const sveltePlaygroundFilename = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:svelte|[cm]?[jt]s|css|json|html)$/, "Playground 文件必须是安全的根目录源码文件名。");
const sveltePlaygroundFiles = z
  .record(sveltePlaygroundFilename, z.string().max(75_000))
  .superRefine((files, context) => {
    const entries = Object.entries(files);
    if (entries.length === 0 || entries.length > 12) {
      context.addIssue({ code: "custom", message: "Playground 必须包含 1 到 12 个文件。" });
    }
    if (!("App.svelte" in files)) {
      context.addIssue({ code: "custom", message: "Playground 必须包含 App.svelte 入口文件。" });
    }
    const bytes = entries.reduce((total, [name, content]) => total + Buffer.byteLength(name) + Buffer.byteLength(content), 0);
    if (bytes > 100_000) {
      context.addIssue({ code: "custom", message: "Playground 文件总量不能超过 100,000 字节。" });
    }
  });

const svelteSchemas = {
  "list-sections": z.object({}).strict(),
  "get-documentation": z.object({ section: z.array(svelteSection).min(1).max(8) }).strict(),
  "svelte-autofixer": z
    .object({
      code: svelteSource,
      desired_svelte_version: z.union([z.literal(4), z.literal(5)]),
      async: z.boolean().default(false),
      filename: svelteFilename.default("Component.svelte"),
    })
    .strict()
    .refine((value) => value.desired_svelte_version === 5 || !value.async, "Svelte 4 不支持 async component 模式。"),
  "playground-link": z
    .object({
      name: z.string().trim().min(1).max(120).refine((value) => !/[\x00-\x1f\x7f]/.test(value), "Playground 名称不能包含控制字符。"),
      tailwind: z.boolean().default(false),
      files: sveltePlaygroundFiles,
    })
    .strict(),
} satisfies Record<string, z.ZodType>;

const gitSchemas = {
  git_status: z.object({}),
  git_diff_unstaged: z.object({
    context_lines: z.number().int().min(0).max(50).default(3),
  }),
  git_diff_staged: z.object({
    context_lines: z.number().int().min(0).max(50).default(3),
  }),
  git_diff: z.object({
    target: gitRevision,
    context_lines: z.number().int().min(0).max(50).default(3),
  }),
  git_log: z.object({
    max_count: z.number().int().positive().max(100).default(10),
    start_timestamp: gitDateFilter.optional().nullable(),
    end_timestamp: gitDateFilter.optional().nullable(),
  }),
  git_show: z.object({
    revision: gitRevision,
  }),
  git_branch: z.object({
    branch_type: z.enum(["local", "remote", "all"]).default("local"),
    contains: gitRevision.optional().nullable(),
    not_contains: gitRevision.optional().nullable(),
  }),
  git_add: z.object({
    files: z.array(sandboxRelativePath).min(1).max(50),
  }),
  git_commit: z.object({
    message: z.string().trim().min(1).max(2_000),
  }),
  git_create_branch: z.object({
    branch_name: gitBranchName,
    base_branch: gitBranchName.optional().nullable(),
  }),
  git_checkout: z.object({
    branch_name: gitBranchName,
  }),
  git_reset: z.object({}),
} satisfies Record<string, z.ZodType>;

const filesystemEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules",
  "@modelcontextprotocol",
  "server-filesystem",
  "dist",
  "index.js",
);
const memoryEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules",
  "@modelcontextprotocol",
  "server-memory",
  "dist",
  "index.js",
);
const sequentialThinkingEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules",
  "@modelcontextprotocol",
  "server-sequential-thinking",
  "dist",
  "index.js",
);
const pythonEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  ".venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python",
);

function parseWithFriendlyError(schema: z.ZodType, input: unknown): Record<string, unknown> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`)
      .join("；");
    throw new InvocationValidationError(message);
  }
  return result.data as Record<string, unknown>;
}

const filesystemAdapter: PluginAdapter = {
  slug: "filesystem-workbench",
  allowedTools: Object.keys(filesystemSchemas),
  async prepare(context) {
    const root = path.resolve(
      /* turbopackIgnore: true */ context.filesystemRoot ??
        path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "filesystem"),
    );
    await mkdir(root, { recursive: true });
    return {
      command: process.execPath,
      args: [filesystemEntryPoint, root],
      cwd: process.cwd(),
    };
  },
  async validateAndTransform(tool, input, context) {
    const schema = filesystemSchemas[tool as keyof typeof filesystemSchemas];
    if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    const parsed = parseWithFriendlyError(schema, input);
    const root = path.resolve(
      /* turbopackIgnore: true */ context.filesystemRoot ??
        path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "filesystem"),
    );

    for (const key of ["path", "source", "destination"] as const) {
      if (typeof parsed[key] === "string") parsed[key] = resolveSandboxPath(root, parsed[key]);
    }
    if (Array.isArray(parsed.paths)) {
      parsed.paths = parsed.paths.map((item) => resolveSandboxPath(root, String(item)));
    }
    return parsed;
  },
};

const memoryAdapter: PluginAdapter = {
  slug: "knowledge-memory",
  allowedTools: Object.keys(memorySchemas),
  async prepare(context) {
    const memoryFile = path.resolve(
      /* turbopackIgnore: true */ context.memoryFile ??
        path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "memory", "memory.jsonl"),
    );
    await mkdir(path.dirname(memoryFile), { recursive: true });
    return {
      command: process.execPath,
      args: [memoryEntryPoint],
      env: { MEMORY_FILE_PATH: memoryFile },
      cwd: process.cwd(),
    };
  },
  async validateAndTransform(tool, input) {
    const schema = memorySchemas[tool as keyof typeof memorySchemas];
    if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    return parseWithFriendlyError(schema, input);
  },
};

const sequentialThinkingAdapter: PluginAdapter = {
  slug: "sequential-thinking-studio",
  allowedTools: ["sequentialthinking"],
  async prepare() {
    return {
      command: process.execPath,
      args: [sequentialThinkingEntryPoint],
      env: { DISABLE_THOUGHT_LOGGING: "true" },
      cwd: process.cwd(),
    };
  },
  async validateAndTransform(tool, input) {
    if (tool !== "sequentialthinking") {
      throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    }
    return parseWithFriendlyError(sequentialThinkingSchema, input);
  },
};

const timeAdapter: PluginAdapter = {
  slug: "timezone-converter",
  allowedTools: Object.keys(timeSchemas),
  async prepare() {
    try {
      await access(pythonEntryPoint);
    } catch {
      throw new InvocationValidationError("Python MCP 运行环境尚未安装，请执行 pip install -r requirements-mcp.txt。");
    }
    return {
      command: pythonEntryPoint,
      args: ["-m", "mcp_server_time"],
      cwd: process.cwd(),
    };
  },
  async validateAndTransform(tool, input) {
    const schema = timeSchemas[tool as keyof typeof timeSchemas];
    if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    return parseWithFriendlyError(schema, input);
  },
};

const fetchAdapter: PluginAdapter = {
  slug: "web-content-reader",
  allowedTools: ["fetch"],
  async prepare() {
    try {
      await access(pythonEntryPoint);
    } catch {
      throw new InvocationValidationError("Python MCP 运行环境尚未安装，请执行 pip install -r requirements-mcp.txt。");
    }
    return {
      command: pythonEntryPoint,
      args: ["-m", "mcp_server_fetch"],
      cwd: process.cwd(),
    };
  },
  async validateAndTransform(tool, input) {
    if (tool !== "fetch") throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    const parsed = parseWithFriendlyError(fetchSchema, input);
    parsed.url = await validatePublicHttpUrl(String(parsed.url));
    return parsed;
  },
};

function defaultGitRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "git-sandbox");
}

async function ensureGitSandbox(root: string): Promise<string> {
  const resolved = path.resolve(root);
  await mkdir(resolved, { recursive: true });
  try {
    await access(path.join(resolved, ".git"));
  } catch {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("git", ["init"], { cwd: resolved, windowsHide: true });
    await execFileAsync("git", ["config", "user.email", "agent-opt@local"], { cwd: resolved, windowsHide: true });
    await execFileAsync("git", ["config", "user.name", "Agent-OPT Sandbox"], { cwd: resolved, windowsHide: true });
  }
  return resolved;
}

const gitAdapter: PluginAdapter = {
  slug: "git-sandbox-studio",
  allowedTools: Object.keys(gitSchemas),
  async prepare(context) {
    try {
      await access(pythonEntryPoint);
    } catch {
      throw new InvocationValidationError("Python MCP 运行环境尚未安装，请执行 pip install -r requirements-mcp.txt。");
    }
    const root = await ensureGitSandbox(context.gitRoot ?? defaultGitRoot());
    return {
      command: pythonEntryPoint,
      args: ["-m", "mcp_server_git", "--repository", root],
      cwd: process.cwd(),
    };
  },
  async validateAndTransform(tool, input, context) {
    const schema = gitSchemas[tool as keyof typeof gitSchemas];
    if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    const parsed = parseWithFriendlyError(schema, input);
    const root = await ensureGitSandbox(context.gitRoot ?? defaultGitRoot());

    // Upstream tools still require repo_path; the Web surface never accepts a host path.
    parsed.repo_path = root;

    if (Array.isArray(parsed.files)) {
      parsed.files = (parsed.files as string[]).map((file) => {
        const resolved = resolveSandboxPath(root, file);
        const relative = path.relative(root, resolved).split(path.sep).join("/");
        if (!relative || relative.startsWith("..")) {
          throw new InvocationValidationError("文件路径超出了 Git 沙箱范围。");
        }
        return relative;
      });
    }

    return parsed;
  },
};

function defaultSqliteDatabase(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "sqlite", "sandbox.db");
}

async function ensureSqliteDatabase(databasePath: string): Promise<string> {
  const resolved = path.resolve(databasePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  return resolved;
}

function sqliteCliEntryPoint(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    ".venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "mcp-server-sqlite.exe" : "mcp-server-sqlite",
  );
}

const sqliteAdapter: PluginAdapter = {
  slug: "sqlite-workbench",
  allowedTools: Object.keys(sqliteSchemas),
  async prepare(context) {
    const cli = sqliteCliEntryPoint();
    try {
      await access(cli);
    } catch {
      throw new InvocationValidationError("SQLite MCP 运行环境尚未安装，请执行 pip install -r requirements-mcp.txt。");
    }
    const database = await ensureSqliteDatabase(context.sqliteDatabase ?? defaultSqliteDatabase());
    return {
      command: cli,
      args: ["--db-path", database],
      cwd: process.cwd(),
    };
  },
  async validateAndTransform(tool, input, context) {
    const schema = sqliteSchemas[tool as keyof typeof sqliteSchemas];
    if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    const parsed = parseWithFriendlyError(schema, input);
    // Ensure the sandbox database directory exists before launching.
    await ensureSqliteDatabase(context.sqliteDatabase ?? defaultSqliteDatabase());
    return parsed;
  },
};

function defaultDefluffRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "defluff");
}

async function ensureDefluffSandbox(root: string): Promise<string> {
  const resolved = path.resolve(root);
  await mkdir(path.join(resolved, ".defluff"), { recursive: true });
  return resolved;
}

function defluffCliEntryPoint(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    ".venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "defluff-mcp.exe" : "defluff-mcp",
  );
}

const defluffAdapter: PluginAdapter = {
  slug: "prose-defluffer",
  allowedTools: Object.keys(defluffSchemas),
  async prepare(context) {
    const cli = defluffCliEntryPoint();
    try {
      await access(cli);
    } catch {
      throw new InvocationValidationError("defluff MCP 运行环境尚未安装，请执行 pip install -r requirements-mcp.txt。");
    }
    const root = await ensureDefluffSandbox(context.defluffRoot ?? defaultDefluffRoot());
    return {
      command: cli,
      args: [],
      cwd: root,
      env: {
        HOME: root,
        USERPROFILE: root,
        XDG_CONFIG_HOME: path.join(root, ".config"),
      },
    };
  },
  async validateAndTransform(tool, input, context) {
    const schema = defluffSchemas[tool as keyof typeof defluffSchemas];
    if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    const parsed = parseWithFriendlyError(schema, input);
    await ensureDefluffSandbox(context.defluffRoot ?? defaultDefluffRoot());
    return parsed;
  },
};

function defaultMermaidRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "agentic-mermaid");
}

async function ensureMermaidSandbox(root: string): Promise<{ root: string; artifacts: string; temporary: string }> {
  const resolved = path.resolve(root);
  const artifacts = path.join(resolved, "artifacts");
  const temporary = path.join(resolved, "tmp");
  await Promise.all([mkdir(artifacts, { recursive: true }), mkdir(temporary, { recursive: true })]);
  return { root: resolved, artifacts, temporary };
}

const agenticMermaidEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules",
  "agentic-mermaid",
  "dist",
  "agentic-mermaid-mcp.js",
);

const mermaidAdapter: PluginAdapter = {
  slug: "mermaid-diagram-studio",
  allowedTools: Object.keys(mermaidSchemas),
  async prepare(context) {
    try {
      await access(agenticMermaidEntryPoint);
    } catch {
      throw new InvocationValidationError("agentic-mermaid 运行环境尚未安装，请执行 npm install。");
    }
    const sandbox = await ensureMermaidSandbox(context.mermaidRoot ?? defaultMermaidRoot());
    return {
      command: process.execPath,
      args: [
        "--max-old-space-size=192",
        agenticMermaidEntryPoint,
        "--artifact-dir",
        sandbox.artifacts,
        "--max-artifact-bytes",
        String(8 * 1024 * 1024),
        "--artifact-ttl-ms",
        String(60 * 60 * 1_000),
        "--max-sandbox-timeout-ms",
        "5000",
      ],
      cwd: sandbox.root,
      env: {
        AM_TRACE_LOG: "",
        TEMP: sandbox.temporary,
        TMP: sandbox.temporary,
        TMPDIR: sandbox.temporary,
      },
    };
  },
  async validateAndTransform(tool, input, context) {
    const schema = mermaidSchemas[tool as keyof typeof mermaidSchemas];
    if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    const parsed = parseWithFriendlyError(schema, input);
    await ensureMermaidSandbox(context.mermaidRoot ?? defaultMermaidRoot());
    if (tool === "render_png" && parsed.style === null) delete parsed.style;
    return parsed;
  },
};

function defaultBlueprintRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "blueprint-chart");
}

async function ensureNotSymbolicLink(target: string, label: string): Promise<void> {
  const stat = await lstat(target);
  if (stat.isSymbolicLink()) {
    throw new InvocationValidationError(`${label} 不能是符号链接。`);
  }
}

async function ensureBlueprintSandbox(
  root: string,
): Promise<{ root: string; artifacts: string; temporary: string }> {
  const resolved = path.resolve(root);
  const artifacts = path.join(resolved, "artifacts");
  const temporary = path.join(resolved, "tmp");
  await Promise.all([mkdir(artifacts, { recursive: true }), mkdir(temporary, { recursive: true })]);
  await Promise.all([
    ensureNotSymbolicLink(resolved, "Blueprint 运行目录"),
    ensureNotSymbolicLink(artifacts, "Blueprint 产物目录"),
    ensureNotSymbolicLink(temporary, "Blueprint 临时目录"),
  ]);
  return { root: resolved, artifacts, temporary };
}

async function rejectExistingSymbolicLinks(root: string, target: string): Promise<void> {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new InvocationValidationError("保存路径必须指向 Blueprint 产物目录内的文件。");
  }

  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        throw new InvocationValidationError("保存路径不能经过符号链接。");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

const blueprintEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules",
  "@blueprint-chart",
  "mcp",
  "bin",
  "blueprint-chart-mcp.js",
);

const blueprintAdapter: PluginAdapter = {
  slug: "blueprint-chart-studio",
  allowedTools: Object.keys(blueprintSchemas),
  async prepare(context) {
    try {
      await access(blueprintEntryPoint);
    } catch {
      throw new InvocationValidationError("Blueprint Chart MCP 运行环境尚未安装，请执行 npm install。");
    }
    const sandbox = await ensureBlueprintSandbox(context.blueprintRoot ?? defaultBlueprintRoot());
    return {
      command: process.execPath,
      args: ["--max-old-space-size=256", blueprintEntryPoint],
      cwd: sandbox.root,
      env: {
        MCP_FS_WRITE_DIR: sandbox.artifacts,
        MCP_PUBLIC_URL: "",
        BLUEPRINT_CHART_EDITOR_URL: "https://blueprintchart.com",
        BLUEPRINT_CHART_DOCS_URL: "https://docs.blueprintchart.com",
        HOME: sandbox.root,
        USERPROFILE: sandbox.root,
        TEMP: sandbox.temporary,
        TMP: sandbox.temporary,
        TMPDIR: sandbox.temporary,
      },
    };
  },
  async validateAndTransform(tool, input, context) {
    const schema = blueprintSchemas[tool as keyof typeof blueprintSchemas];
    if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    const parsed = parseWithFriendlyError(schema, input);
    const sandbox = await ensureBlueprintSandbox(context.blueprintRoot ?? defaultBlueprintRoot());

    if (tool === "render" && typeof parsed.save === "string") {
      const target = resolveSandboxPath(sandbox.artifacts, parsed.save);
      const expectedExtension = `.${String(parsed.format).toLowerCase()}`;
      if (path.extname(target).toLowerCase() !== expectedExtension) {
        throw new InvocationValidationError(`保存文件扩展名必须为 ${expectedExtension}。`);
      }
      await rejectExistingSymbolicLinks(sandbox.artifacts, target);
      parsed.save = path.relative(sandbox.artifacts, target);
    }

    return parsed;
  },
};

export function defaultOxidizeRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "oxidize-pdf");
}

export async function ensureOxidizeSandbox(
  root: string = defaultOxidizeRoot(),
): Promise<{ root: string; workspace: string; temporary: string }> {
  const resolved = path.resolve(/* turbopackIgnore: true */ root);
  const workspace = path.join(resolved, "workspace");
  const temporary = path.join(resolved, "tmp");
  await Promise.all([mkdir(workspace, { recursive: true }), mkdir(temporary, { recursive: true })]);
  await Promise.all([
    ensureNotSymbolicLink(resolved, "oxidize-pdf 运行目录"),
    ensureNotSymbolicLink(workspace, "oxidize-pdf 工作区"),
    ensureNotSymbolicLink(temporary, "oxidize-pdf 临时目录"),
  ]);
  return { root: resolved, workspace, temporary };
}

function normalizeOxidizeRelativePath(workspace: string, requested: string): string {
  const resolved = resolveSandboxPath(workspace, requested);
  const relative = path.relative(workspace, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new InvocationValidationError("PDF 路径必须指向工作区内的文件或子目录。");
  }
  return relative;
}

const oxidizeEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  ".venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "oxidize-mcp.exe" : "oxidize-mcp",
);

const oxidizeAdapter: PluginAdapter = {
  slug: "oxidize-pdf-workbench",
  allowedTools: Object.keys(oxidizeSchemas),
  persistentSession: {
    key(context) {
      return path.resolve(/* turbopackIgnore: true */ context.oxidizeRoot ?? defaultOxidizeRoot());
    },
    idleMs: 120_000,
  },
  async prepare(context) {
    try {
      await access(oxidizeEntryPoint);
    } catch {
      throw new InvocationValidationError("oxidize-pdf MCP 运行环境尚未安装，请执行 pip install -r requirements-mcp.txt。");
    }
    const sandbox = await ensureOxidizeSandbox(context.oxidizeRoot ?? defaultOxidizeRoot());
    return {
      command: oxidizeEntryPoint,
      args: [],
      cwd: sandbox.workspace,
      env: {
        OXIDIZE_WORKSPACE: sandbox.workspace,
        OXIDIZE_ALLOWED_PATHS: "",
        OXIDIZE_MAX_FILE_SIZE_MB: "16",
        OXIDIZE_MAX_PAGES: "500",
        OXIDIZE_MAX_OUTPUT_BYTES: String(2 * 1024 * 1024),
        OXIDIZE_MAX_SESSIONS: "4",
        OXIDIZE_MAX_SESSION_BYTES: String(2 * 1024 * 1024),
        OXIDIZE_SESSION_TIMEOUT: "300",
        FASTMCP_TELEMETRY_ENABLED: "false",
        PYTHONNOUSERSITE: "1",
        PYTHONUNBUFFERED: "1",
        HOME: sandbox.root,
        USERPROFILE: sandbox.root,
        TEMP: sandbox.temporary,
        TMP: sandbox.temporary,
        TMPDIR: sandbox.temporary,
      },
    };
  },
  async validateAndTransform(tool, input, context) {
    const schema = oxidizeSchemas[tool as keyof typeof oxidizeSchemas];
    if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    const parsed = parseWithFriendlyError(schema, input);
    const sandbox = await ensureOxidizeSandbox(context.oxidizeRoot ?? defaultOxidizeRoot());

    for (const key of ["path", "input_path", "output_path", "compare_path", "overlay_path"] as const) {
      if (typeof parsed[key] === "string") {
        parsed[key] = normalizeOxidizeRelativePath(sandbox.workspace, parsed[key]);
      }
    }
    if (Array.isArray(parsed.input_paths)) {
      parsed.input_paths = parsed.input_paths.map((item) => normalizeOxidizeRelativePath(sandbox.workspace, String(item)));
    }
    if (tool === "manipulate_pdf" && parsed.operation === "split" && typeof parsed.output_path === "string") {
      await mkdir(resolveSandboxPath(sandbox.workspace, parsed.output_path), { recursive: true });
    } else if (typeof parsed.output_path === "string") {
      await mkdir(path.dirname(resolveSandboxPath(sandbox.workspace, parsed.output_path)), { recursive: true });
    }
    return parsed;
  },
  async normalizeResult(_tool, result) {
    const nested = result.structuredContent?.result;
    if (typeof nested !== "string") return result;
    try {
      const parsed = JSON.parse(nested) as Record<string, unknown>;
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed,
        isError: result.isError || typeof parsed.error === "string",
      };
    } catch {
      return result;
    }
  },
};

export function defaultBumpguardRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "bumpguard");
}

type BumpguardSandbox = {
  root: string;
  temporary: string;
  pipCache: string;
  mavenRepository: string;
  nugetPackages: string;
  dotnetHome: string;
  localAppData: string;
  appData: string;
};

export async function ensureBumpguardSandbox(root: string = defaultBumpguardRoot()): Promise<BumpguardSandbox> {
  const resolved = path.resolve(/* turbopackIgnore: true */ root);
  const sandbox: BumpguardSandbox = {
    root: resolved,
    temporary: path.join(resolved, "tmp"),
    pipCache: path.join(resolved, "pip", "cache"),
    mavenRepository: path.join(resolved, ".m2", "repository"),
    nugetPackages: path.join(resolved, ".nuget", "packages"),
    dotnetHome: path.join(resolved, "dotnet-home"),
    localAppData: path.join(resolved, "local-appdata"),
    appData: path.join(resolved, "appdata"),
  };
  await Promise.all(Object.values(sandbox).map((directory) => mkdir(directory, { recursive: true })));
  await Promise.all([
    ensureNotSymbolicLink(sandbox.root, "BumpGuard 运行目录"),
    ensureNotSymbolicLink(sandbox.temporary, "BumpGuard 临时目录"),
    ensureNotSymbolicLink(sandbox.pipCache, "BumpGuard pip 缓存"),
    ensureNotSymbolicLink(sandbox.mavenRepository, "BumpGuard Maven 缓存"),
    ensureNotSymbolicLink(sandbox.nugetPackages, "BumpGuard NuGet 缓存"),
    ensureNotSymbolicLink(sandbox.localAppData, "BumpGuard .NET 构建缓存"),
  ]);
  return sandbox;
}

const bumpguardBootstrap = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "bumpguard-mcp-entry.py");
const localDotnetRoot = path.resolve(
  /* turbopackIgnore: true */ process.env.DOTNET_ROOT?.trim() ||
    path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "dotnet-sdk"),
);
const localDotnetEntryPoint = path.join(localDotnetRoot, process.platform === "win32" ? "dotnet.exe" : "dotnet");

function inheritedBumpguardNetworkEnvironment(): Record<string, string> {
  const names = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",
  ];
  return Object.fromEntries(
    names.flatMap((name) => (typeof process.env[name] === "string" ? [[name, process.env[name]]] : [])),
  );
}

const bumpguardAdapter: PluginAdapter = {
  slug: "bumpguard-dependency-lab",
  allowedTools: Object.keys(bumpguardSchemas),
  requestTimeoutMs(tool) {
    if (tool === "check_upgrade") return 600_000;
    if (tool === "diff_versions" || tool === "list_symbols") return 480_000;
    if (tool === "verify_snippet") return 240_000;
    return 60_000;
  },
  async prepare(context) {
    try {
      await Promise.all([access(pythonEntryPoint), access(bumpguardBootstrap), access(localDotnetEntryPoint)]);
    } catch {
      throw new InvocationValidationError(
        "BumpGuard 运行环境不完整，请安装 requirements-mcp.txt 并在 var/runtime/dotnet-sdk 安装 .NET 8 SDK。",
      );
    }
    const sandbox = await ensureBumpguardSandbox(context.bumpguardRoot ?? defaultBumpguardRoot());
    return {
      command: pythonEntryPoint,
      args: [bumpguardBootstrap],
      cwd: sandbox.root,
      env: {
        ...inheritedBumpguardNetworkEnvironment(),
        PATH: `${localDotnetRoot}${path.delimiter}${process.env.PATH ?? ""}`,
        HOME: sandbox.root,
        USERPROFILE: sandbox.root,
        APPDATA: sandbox.appData,
        LOCALAPPDATA: sandbox.localAppData,
        TEMP: sandbox.temporary,
        TMP: sandbox.temporary,
        TMPDIR: sandbox.temporary,
        PIP_INDEX_URL: "https://pypi.org/simple",
        PIP_CONFIG_FILE: process.platform === "win32" ? "NUL" : "/dev/null",
        PIP_CACHE_DIR: sandbox.pipCache,
        PIP_NO_INPUT: "1",
        PIP_DISABLE_PIP_VERSION_CHECK: "1",
        PYTHONNOUSERSITE: "1",
        PYTHONUNBUFFERED: "1",
        DOTNET_ROOT: localDotnetRoot,
        DOTNET_CLI_HOME: sandbox.dotnetHome,
        DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
        DOTNET_CLI_TELEMETRY_OPTOUT: "1",
        DOTNET_NOLOGO: "1",
        DOTNET_MULTILEVEL_LOOKUP: "0",
        DOTNET_CLI_USE_MSBUILD_SERVER: "0",
        MSBUILDDISABLENODEREUSE: "1",
        UseSharedCompilation: "false",
        NUGET_PACKAGES: sandbox.nugetPackages,
        NUGET_XMLDOC_MODE: "skip",
        FASTMCP_TELEMETRY_ENABLED: "false",
      },
    };
  },
  async validateAndTransform(tool, input) {
    const schema = bumpguardSchemas[tool as keyof typeof bumpguardSchemas];
    if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    return parseWithFriendlyError(schema, input);
  },
  async normalizeResult(tool, result) {
    let payload = result.structuredContent;
    if (!payload) {
      const textContent = result.content.find(
        (item): item is { type: "text"; text: string } =>
          typeof item === "object" && item !== null && (item as { type?: unknown }).type === "text" &&
          typeof (item as { text?: unknown }).text === "string",
      );
      if (textContent) {
        try {
          const parsed = JSON.parse(textContent.text) as unknown;
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            payload = parsed as Record<string, unknown>;
          }
        } catch {
          // Keep a non-JSON upstream error as MCP text.
        }
      }
    }
    if (!payload) return result;

    if (tool === "check_import" && "location" in payload) {
      payload = { ...payload, location: "project virtual environment" };
    }
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, "utf8") > 2 * 1024 * 1024) {
      throw new InvocationValidationError("BumpGuard 返回结果超过 2 MiB 安全上限，请缩小符号过滤范围。");
    }
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
      isError: result.isError || typeof payload.error === "string",
    };
  },
};

export function defaultSvelteRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "svelte-mcp");
}

export async function ensureSvelteSandbox(
  root: string = defaultSvelteRoot(),
): Promise<{ root: string; temporary: string }> {
  const resolved = path.resolve(/* turbopackIgnore: true */ root);
  const temporary = path.join(resolved, "tmp");
  await Promise.all([mkdir(resolved, { recursive: true }), mkdir(temporary, { recursive: true })]);
  await Promise.all([
    ensureNotSymbolicLink(resolved, "Svelte MCP 运行目录"),
    ensureNotSymbolicLink(temporary, "Svelte MCP 临时目录"),
  ]);
  return { root: resolved, temporary };
}

const svelteBootstrap = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "svelte-mcp-entry.mjs");
const sveltePackageEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules",
  "@sveltejs",
  "mcp",
  "dist",
  "index.mjs",
);

async function rejectSvelteSourcePath(code: string, root: string): Promise<void> {
  if (path.isAbsolute(code) || /^[A-Za-z]:[\\/]/.test(code)) {
    throw new InvocationValidationError("Svelte autofixer 只接受源码文本，不接受宿主文件路径。");
  }
  if (code.length > 1_024) return;
  const possiblePath = path.resolve(root, code);
  try {
    await lstat(possiblePath);
    throw new InvocationValidationError("Svelte autofixer 只接受源码文本，不能读取运行目录中的文件路径。");
  } catch (error) {
    if (error instanceof InvocationValidationError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "EINVAL") {
      throw error;
    }
  }
}

function parseSvelteSections(text: string): Array<{ title: string; useCases: string; path: string }> {
  const sections: Array<{ title: string; useCases: string; path: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("- title: ")) continue;
    const useCasesMarker = ", use_cases: ";
    const pathMarker = ", path: ";
    const useCasesIndex = line.indexOf(useCasesMarker);
    const pathIndex = line.lastIndexOf(pathMarker);
    if (useCasesIndex < 0 || pathIndex <= useCasesIndex) continue;
    sections.push({
      title: line.slice(9, useCasesIndex),
      useCases: line.slice(useCasesIndex + useCasesMarker.length, pathIndex),
      path: line.slice(pathIndex + pathMarker.length),
    });
  }
  return sections;
}

const svelteAdapter: PluginAdapter = {
  slug: "svelte-development-studio",
  allowedTools: Object.keys(svelteSchemas),
  requestTimeoutMs(tool) {
    return tool === "svelte-autofixer" ? 120_000 : 45_000;
  },
  async prepare(context) {
    try {
      await Promise.all([access(svelteBootstrap), access(sveltePackageEntryPoint)]);
    } catch {
      throw new InvocationValidationError("Svelte MCP 运行环境尚未安装，请执行 npm install。");
    }
    const sandbox = await ensureSvelteSandbox(context.svelteRoot ?? defaultSvelteRoot());
    return {
      command: process.execPath,
      args: ["--max-old-space-size=512", svelteBootstrap],
      cwd: sandbox.root,
      env: {
        HOME: sandbox.root,
        USERPROFILE: sandbox.root,
        TEMP: sandbox.temporary,
        TMP: sandbox.temporary,
        TMPDIR: sandbox.temporary,
        NODE_ENV: "production",
        NO_COLOR: "1",
      },
    };
  },
  async validateAndTransform(tool, input, context) {
    const schema = svelteSchemas[tool as keyof typeof svelteSchemas];
    if (!schema) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    const parsed = parseWithFriendlyError(schema, input);
    if (tool === "svelte-autofixer") {
      const sandbox = await ensureSvelteSandbox(context.svelteRoot ?? defaultSvelteRoot());
      await rejectSvelteSourcePath(String(parsed.code), sandbox.root);
    }
    return parsed;
  },
  async normalizeResult(tool, result) {
    const textBlock = result.content.find(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" && item !== null && (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    );
    let payload = result.structuredContent;
    if (tool === "list-sections" && textBlock) {
      payload = { sections: parseSvelteSections(textBlock.text), raw: textBlock.text };
    } else if (tool === "get-documentation" && textBlock) {
      payload = { markdown: textBlock.text };
    } else if (tool === "playground-link" && payload) {
      const url = payload.url;
      if (typeof url !== "string" || !url.startsWith("https://svelte.dev/playground#")) {
        throw new InvocationValidationError("Svelte Playground 返回了非官方 URL。");
      }
    }

    const normalizedContent = payload
      ? [{ type: "text", text: JSON.stringify(payload, null, 2) }]
      : textBlock ? [textBlock] : result.content;
    const bytes = Buffer.byteLength(JSON.stringify({ content: normalizedContent, structuredContent: payload }), "utf8");
    if (bytes > 1_500_000) {
      throw new InvocationValidationError("Svelte MCP 返回结果超过 1.5 MiB 安全上限，请减少文档章节或源码规模。");
    }
    return {
      content: normalizedContent,
      structuredContent: payload,
      isError: result.isError,
    };
  },
};

const skillTools = ["skill_outline", "skill_open", "skill_search", "skill_meta"] as const;

const skillOutlineSchema = z.object({}).strict();
const skillOpenSchema = z
  .object({
    sectionId: z.string().trim().min(1).max(120).optional(),
    includeFull: z.boolean().optional(),
  })
  .strict();
const skillSearchSchema = z
  .object({
    query: z.string().trim().min(1).max(120),
    limit: z.number().int().min(1).max(30).default(12),
  })
  .strict();
const skillMetaSchema = z.object({}).strict();

function createSkillAdapter(slug: string): PluginAdapter {
  return {
    slug,
    mode: "in-process",
    allowedTools: skillTools,
    async prepare() {
      throw new InvocationValidationError(`Skill 适配器 ${slug} 为进程内文档运行时，不启动 MCP 子进程。`);
    },
    async validateAndTransform(tool, input) {
      if (tool === "skill_outline") return parseWithFriendlyError(skillOutlineSchema, input);
      if (tool === "skill_open") return parseWithFriendlyError(skillOpenSchema, input);
      if (tool === "skill_search") return parseWithFriendlyError(skillSearchSchema, input);
      if (tool === "skill_meta") return parseWithFriendlyError(skillMetaSchema, input);
      throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    },
    async invokeInProcess(tool, input) {
      if (tool === "skill_meta") {
        const index = await loadSkillIndex(slug);
        const doc = await readSkillDocument(slug);
        const payload = {
          slug,
          name: doc.parsed.name ?? slug,
          description: doc.parsed.description ?? "",
          sectionCount: doc.sections.length,
          supportingFiles: index.supportingPaths,
          characterCount: doc.raw.length,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
          isError: false,
        };
      }

      const doc = await readSkillDocument(slug);
      if (tool === "skill_outline") {
        const outline = doc.sections.map((section) => ({
          id: section.id,
          level: section.level,
          title: section.title,
          preview: section.content.replace(/^#+\s+.+\n?/, "").trim().slice(0, 160),
        }));
        const payload = { slug, sectionCount: outline.length, sections: outline };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
          isError: false,
        };
      }

      if (tool === "skill_open") {
        const sectionId = typeof input.sectionId === "string" ? input.sectionId : undefined;
        const includeFull = input.includeFull === true;
        if (includeFull || !sectionId) {
          const payload = {
            slug,
            mode: includeFull || !sectionId ? "full" : "section",
            title: doc.parsed.name ?? slug,
            content: doc.raw,
            characterCount: doc.raw.length,
          };
          if (sectionId) {
            const section = doc.sections.find((item) => item.id === sectionId);
            if (!section) throw new InvocationValidationError(`未知章节：${sectionId}`);
            const sectionPayload = {
              slug,
              mode: "section",
              sectionId: section.id,
              title: section.title,
              level: section.level,
              content: section.content,
              characterCount: section.content.length,
            };
            return {
              content: [{ type: "text", text: section.content }],
              structuredContent: sectionPayload,
              isError: false,
            };
          }
          return {
            content: [{ type: "text", text: doc.raw }],
            structuredContent: payload,
            isError: false,
          };
        }
        const section = doc.sections.find((item) => item.id === sectionId);
        if (!section) throw new InvocationValidationError(`未知章节：${sectionId}`);
        const payload = {
          slug,
          mode: "section",
          sectionId: section.id,
          title: section.title,
          level: section.level,
          content: section.content,
          characterCount: section.content.length,
        };
        return {
          content: [{ type: "text", text: section.content }],
          structuredContent: payload,
          isError: false,
        };
      }

      if (tool === "skill_search") {
        const query = String(input.query ?? "");
        const limit = typeof input.limit === "number" ? input.limit : 12;
        const hits = searchSkillText(doc.raw, query, limit);
        const payload = { slug, query, hitCount: hits.length, hits };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
          isError: false,
        };
      }

      throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    },
  };
}

function loadSkillAdapters(): PluginAdapter[] {
  const root = path.join(/* turbopackIgnore: true */ process.cwd(), "catalog", "skill-bodies");
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => createSkillAdapter(entry.name));
  } catch {
    return [];
  }
}

const adapters = new Map(
  [
    filesystemAdapter,
    memoryAdapter,
    sequentialThinkingAdapter,
    timeAdapter,
    fetchAdapter,
    gitAdapter,
    sqliteAdapter,
    defluffAdapter,
    mermaidAdapter,
    blueprintAdapter,
    oxidizeAdapter,
    bumpguardAdapter,
    svelteAdapter,
    ...loadSkillAdapters(),
  ].map((adapter) => [adapter.slug, adapter]),
);

export function getPluginAdapter(slug: string): PluginAdapter | undefined {
  const existing = adapters.get(slug);
  if (existing) return existing;
  // Lazy register skill adapters added after process start (tests / hot paths).
  if (slug.startsWith("skill-")) {
    try {
      const adapter = createSkillAdapter(slug);
      adapters.set(slug, adapter);
      return adapter;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function listRegisteredAdapterSlugs(): string[] {
  return [...adapters.keys()].sort();
}

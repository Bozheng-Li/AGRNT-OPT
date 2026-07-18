import { access, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

const PACKAGE_NAME = "@cyanheads/nhtsa-vehicle-safety-mcp-server";
const PACKAGE_VERSION = "0.8.4";
export const NHTSA_RESULT_LIMIT = 2 * 1024 * 1024;
export const NHTSA_VIN_BATCH_LIMIT = 10;
export const NHTSA_COMPLAINT_LIMIT = 20;
export const NHTSA_LOOKUP_LIMIT = 50;
const CURRENT_YEAR = new Date().getUTCFullYear() + 1;

type NhtsaContext = AdapterContext & { nhtsaRoot?: string; nhtsaPackageRoot?: string };

const cleanText = (maximum: number) => z.string().trim().min(1).max(maximum)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "输入不能包含控制字符。");
const vehicleText = (maximum: number) => cleanText(maximum)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} .,'&()+\/_-]*$/u, "车辆名称包含不支持的字符。")
  .refine((value) => !value.includes(".."), "车辆名称不能包含路径穿越片段。");
const make = vehicleText(80);
const model = vehicleText(120);
const modelYear = z.number().int().min(1900).max(CURRENT_YEAR);
const ratingModelYear = z.number().int().min(1990).max(CURRENT_YEAR);
const vehicleInput = z.object({ make, model, modelYear }).strict();
const safetyVehicleInput = z.object({ make, model, modelYear: ratingModelYear }).strict();

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= CURRENT_YEAR && parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

const isoDate = z.string().refine(isIsoDate, "日期必须是有效的 YYYY-MM-DD。");
const dateRange = z.object({ after: isoDate.optional(), before: isoDate.optional() }).strict()
  .superRefine((value, context) => {
    if (!value.after && !value.before) context.addIssue({ code: "custom", message: "日期范围至少需要 after 或 before。" });
    if (value.after && value.before && value.after > value.before) {
      context.addIssue({ code: "custom", path: ["before"], message: "before 不能早于 after。" });
    }
  });

const recallInput = z.object({
  campaignNumber: cleanText(9).regex(/^\d{2}[A-Za-z]\d{6}$/, "召回编号格式应类似 24V064000。")
    .transform((value) => value.toUpperCase()).optional(),
  make: make.optional(),
  model: model.optional(),
  modelYear: modelYear.optional(),
  dateRange: dateRange.optional(),
}).strict().superRefine((value, context) => {
  if (value.campaignNumber) {
    if (value.make || value.model || value.modelYear !== undefined || value.dateRange) {
      context.addIssue({ code: "custom", path: ["campaignNumber"], message: "召回编号模式不能同时提供车辆或日期参数。" });
    }
    return;
  }
  if (!value.make || !value.model || value.modelYear === undefined) {
    context.addIssue({ code: "custom", message: "车辆召回查询必须同时提供 make、model 和 modelYear。" });
  }
});

const complaintInput = vehicleInput.extend({
  limit: z.number().int().min(1).max(NHTSA_COMPLAINT_LIMIT).default(NHTSA_COMPLAINT_LIMIT),
  offset: z.number().int().min(0).max(10_000).default(0),
}).strict();

const ratingInput = z.object({
  make: make.optional(),
  model: model.optional(),
  modelYear: ratingModelYear.optional(),
  vehicleId: z.number().int().positive().max(100_000_000).optional(),
}).strict().superRefine((value, context) => {
  if (value.vehicleId !== undefined) {
    if (value.make || value.model || value.modelYear !== undefined) {
      context.addIssue({ code: "custom", path: ["vehicleId"], message: "vehicleId 模式不能同时提供车辆组合。" });
    }
    return;
  }
  if (!value.make || !value.model || value.modelYear === undefined) {
    context.addIssue({ code: "custom", message: "评级查询必须提供 vehicleId，或完整的 make、model、modelYear。" });
  }
});

const vin = cleanText(17).regex(/^[A-HJ-NPR-Z0-9*]{1,17}$/i, "VIN 只能包含 1–17 位 VIN 字符或 *。")
  .transform((value) => value.toUpperCase());
const vinList = z.array(vin).min(1).max(NHTSA_VIN_BATCH_LIMIT)
  .superRefine((value, context) => {
    if (new Set(value).size !== value.length) context.addIssue({ code: "custom", message: "批量 VIN 不能重复。" });
  });
const decodeInput = z.object({
  vin: z.union([vin, vinList]),
  modelYear: modelYear.optional(),
}).strict();

const lookupInput = z.object({
  operation: z.enum(["makes", "models", "manufacturer"]),
  make: make.optional(),
  modelYear: modelYear.optional(),
  manufacturer: vehicleText(120).optional(),
  limit: z.number().int().min(1).max(NHTSA_LOOKUP_LIMIT).default(25),
  offset: z.number().int().min(0).max(10_000).default(0),
}).strict().superRefine((value, context) => {
  if (value.operation === "makes") {
    if (value.make || value.modelYear !== undefined || value.manufacturer) {
      context.addIssue({ code: "custom", message: "makes 操作不接受 make、modelYear 或 manufacturer。" });
    }
  } else if (value.operation === "models") {
    if (!value.make) context.addIssue({ code: "custom", path: ["make"], message: "models 操作需要 make。" });
    if (value.manufacturer) context.addIssue({ code: "custom", path: ["manufacturer"], message: "models 操作不接受 manufacturer。" });
  } else {
    if (!value.manufacturer) context.addIssue({ code: "custom", path: ["manufacturer"], message: "manufacturer 操作需要 manufacturer。" });
    if (value.make || value.modelYear !== undefined) {
      context.addIssue({ code: "custom", message: "manufacturer 操作不接受 make 或 modelYear。" });
    }
  }
});

const inputSchemas = {
  nhtsa_get_vehicle_safety: safetyVehicleInput,
  nhtsa_search_recalls: recallInput,
  nhtsa_search_complaints: complaintInput,
  nhtsa_get_safety_ratings: ratingInput,
  nhtsa_decode_vin: decodeInput,
  nhtsa_lookup_vehicles: lookupInput,
} satisfies Record<string, z.ZodType>;

const expectedVinQueues = new WeakMap<object, string[][]>();

function queueExpectedVins(context: AdapterContext, input: Record<string, unknown>): void {
  const raw = input.vin;
  const expected = (Array.isArray(raw) ? raw : [raw]).map((value) => String(value));
  const queue = expectedVinQueues.get(context) ?? [];
  queue.push(expected);
  expectedVinQueues.set(context, queue);
}

function takeExpectedVins(context: AdapterContext): string[] | undefined {
  const queue = expectedVinQueues.get(context);
  const expected = queue?.shift();
  if (queue && queue.length === 0) expectedVinQueues.delete(context);
  return expected;
}

const boundedText = z.string().max(300_000);
const count = z.number().int().nonnegative().max(10_000_000);
const optionalRatingFields = {
  overall: boundedText.optional(), driverSide: boundedText.optional(), passengerSide: boundedText.optional(),
};
const rating = z.object({
  vehicleId: z.number().int().positive().max(100_000_000),
  vehicleDescription: boundedText.optional(),
  overallRating: boundedText.optional(),
  frontalCrash: z.object(optionalRatingFields).strict(),
  sideCrash: z.object({
    ...optionalRatingFields,
    combinedBarrierPoleFront: boundedText.optional(), combinedBarrierPoleRear: boundedText.optional(),
    barrierOverall: boundedText.optional(), pole: boundedText.optional(),
  }).strict(),
  rollover: z.object({ rating: boundedText.optional(), probability: z.number().finite().optional(), dynamicTipResult: boundedText.optional() }).strict(),
  adasFeatures: z.object({
    electronicStabilityControl: boundedText.optional(), forwardCollisionWarning: boundedText.optional(), laneDepartureWarning: boundedText.optional(),
  }).strict(),
  complaintsCount: count.optional(), recallsCount: count.optional(), investigationCount: count.optional(),
}).strict();
const recall = z.object({
  campaignNumber: boundedText, manufacturer: boundedText, component: boundedText.optional(), subject: boundedText.optional(),
  summary: boundedText, consequence: boundedText, remedy: boundedText, reportReceivedDate: boundedText,
  potentialUnitsAffected: z.number().finite().optional(), parkIt: z.boolean().optional(), parkOutSide: z.boolean().optional(),
  overTheAirUpdate: z.boolean().optional(),
}).strict();
const componentBreakdown = z.object({
  component: boundedText, count, crashCount: count, fireCount: count, injuryCount: count, deathCount: count,
}).strict();
const complaint = z.object({
  odiNumber: z.number().finite().optional(), dateOfIncident: boundedText.optional(), dateComplaintFiled: boundedText.optional(),
  components: boundedText.optional(), summary: boundedText.optional(), crash: z.boolean().optional(), fire: z.boolean().optional(),
  numberOfInjuries: z.number().finite().optional(), numberOfDeaths: z.number().finite().optional(), vin: boundedText.optional(),
}).strict();
const decodedVehicle = z.object({
  vin: z.string().max(17), make: boundedText.optional(), model: boundedText.optional(), modelYear: boundedText.optional(),
  bodyClass: boundedText.optional(), vehicleType: boundedText.optional(), driveType: boundedText.optional(), engineCylinders: boundedText.optional(),
  engineDisplacementL: boundedText.optional(), engineHP: boundedText.optional(), fuelType: boundedText.optional(), trim: boundedText.optional(),
  manufacturer: boundedText.optional(), plantCity: boundedText.optional(), plantState: boundedText.optional(), plantCountry: boundedText.optional(),
  airBagLocFront: boundedText.optional(), airBagLocSide: boundedText.optional(), airBagLocCurtain: boundedText.optional(), airBagLocKnee: boundedText.optional(),
  electronicStabilityControl: boundedText.optional(), abs: boundedText.optional(), tractionControl: boundedText.optional(),
  errorCode: boundedText.optional(), errorText: boundedText.optional(),
}).strict();
const paging = { totalCount: count, returned: count, offset: count, limit: count };

const outputSchemas = {
  nhtsa_get_vehicle_safety: z.object({
    safetyRatings: z.array(rating.omit({ complaintsCount: true, recallsCount: true, investigationCount: true })).max(32).optional(),
    recalls: z.array(recall.pick({ campaignNumber: true, component: true, summary: true, remedy: true, reportReceivedDate: true, parkIt: true })).max(500).optional(),
    complaintSummary: z.object({
      totalCount: count, componentBreakdown: z.array(componentBreakdown).max(500), crashCount: count, fireCount: count, injuryCount: count, deathCount: count,
    }).strict().optional(),
    sectionStatus: z.object({
      safetyRatings: z.enum(["available", "partial", "unavailable"]),
      recalls: z.enum(["available", "partial", "unavailable"]),
      complaints: z.enum(["available", "partial", "unavailable"]),
    }).strict(),
    warnings: z.array(z.string().max(10_000)).max(20),
  }).strict(),
  nhtsa_search_recalls: z.object({
    recalls: z.array(recall).max(500), totalCount: count, effectiveQuery: z.string().max(500), notice: z.string().max(10_000).optional(),
  }).strict(),
  nhtsa_search_complaints: z.object({
    ...paging, componentBreakdown: z.array(componentBreakdown).max(500), complaints: z.array(complaint).max(NHTSA_COMPLAINT_LIMIT),
    effectiveQuery: z.string().max(500), notice: z.string().max(10_000).optional(),
  }).strict(),
  nhtsa_get_safety_ratings: z.object({ ratings: z.array(rating).max(32), notice: z.string().max(10_000).optional() }).strict(),
  nhtsa_decode_vin: z.object({
    vehicles: z.array(decodedVehicle).max(NHTSA_VIN_BATCH_LIMIT), effectiveQuery: z.string().max(500), notice: z.string().max(10_000).optional(),
  }).strict(),
  nhtsa_lookup_vehicles: z.object({
    operation: z.enum(["makes", "models", "manufacturer"]), ...paging,
    makes: z.array(z.object({ makeId: z.number().finite(), makeName: boundedText }).strict()).max(NHTSA_LOOKUP_LIMIT).optional(),
    models: z.array(z.object({ modelId: z.number().finite(), modelName: boundedText, makeId: z.number().finite(), makeName: boundedText }).strict()).max(NHTSA_LOOKUP_LIMIT).optional(),
    manufacturers: z.array(z.object({
      manufacturerId: z.number().finite(), manufacturerName: boundedText, country: boundedText.optional(),
      vehicleTypes: z.array(z.object({ id: z.number().finite().optional(), name: boundedText }).strict()).max(100),
    }).strict()).max(NHTSA_LOOKUP_LIMIT).optional(),
    effectiveQuery: z.string().max(500), notice: z.string().max(10_000).optional(),
  }).strict(),
} satisfies Record<string, z.ZodType>;

function parseInput(tool: string, input: unknown): Record<string, unknown> {
  const schema = inputSchemas[tool as keyof typeof inputSchemas];
  if (!schema) throw new InvocationValidationError(`NHTSA Web 适配未开放工具：${tool}`);
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new InvocationValidationError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；"));
  }
  return parsed.data as Record<string, unknown>;
}

function inspectBoundedJson(value: unknown): void {
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 40_000 || depth > 18) throw new InvocationValidationError("NHTSA 结果结构超过安全上限。");
    if (typeof item === "string" && item.length > 300_000) throw new InvocationValidationError("NHTSA 单个文本字段超过安全上限。");
    if (Array.isArray(item)) {
      if (item.length > 1_000) throw new InvocationValidationError("NHTSA 结果数组超过安全上限。");
      item.forEach((entry) => visit(entry, depth + 1));
    } else if (item && typeof item === "object") {
      Object.values(item as Record<string, unknown>).forEach((entry) => visit(entry, depth + 1));
    }
  };
  visit(value, 0);
}

async function requireDirectory(target: string, label: string): Promise<void> {
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new InvocationValidationError(`${label}不能是符号链接或目录联接。`);
}

async function requireRegularFile(target: string, label: string): Promise<void> {
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) throw new InvocationValidationError(`${label}必须是普通文件且不能是符号链接。`);
}

function defaultRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "nhtsa");
}

function defaultPackageRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "@cyanheads", "nhtsa-vehicle-safety-mcp-server");
}

function bootstrap(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "nhtsa-mcp-entry.mjs");
}

async function ensureSandbox(root: string): Promise<{ root: string; temporary: string }> {
  const resolved = path.resolve(root);
  const temporary = path.join(resolved, "tmp");
  await Promise.all([mkdir(resolved, { recursive: true }), mkdir(temporary, { recursive: true })]);
  await Promise.all([requireDirectory(resolved, "NHTSA 运行目录"), requireDirectory(temporary, "NHTSA 临时目录")]);
  return { root: resolved, temporary };
}

function summary(tool: string, payload: Record<string, unknown>): string {
  if (tool === "nhtsa_get_vehicle_safety") {
    return `NHTSA 安全画像已汇总 ${String((payload.safetyRatings as unknown[])?.length ?? 0)} 个评级版本、${String((payload.recalls as unknown[])?.length ?? 0)} 项召回。`;
  }
  if (tool === "nhtsa_search_recalls") return `NHTSA 返回 ${String(payload.totalCount ?? 0)} 项召回。`;
  if (tool === "nhtsa_search_complaints") return `NHTSA 共匹配 ${String(payload.totalCount ?? 0)} 条投诉，本页返回 ${String(payload.returned ?? 0)} 条。`;
  if (tool === "nhtsa_get_safety_ratings") return `NHTSA 返回 ${String((payload.ratings as unknown[])?.length ?? 0)} 个 NCAP 评级版本。`;
  if (tool === "nhtsa_decode_vin") return `VPIC 已解析 ${String((payload.vehicles as unknown[])?.length ?? 0)} 个 VIN。`;
  return `VPIC 共匹配 ${String(payload.totalCount ?? 0)} 项，本页返回 ${String(payload.returned ?? 0)} 项。`;
}

export const nhtsaAdapter: PluginAdapter = {
  slug: "nhtsa-vehicle-safety-lab",
  allowedTools: Object.keys(inputSchemas),
  requestTimeoutMs(tool) {
    if (tool === "nhtsa_get_vehicle_safety") return 90_000;
    if (tool === "nhtsa_lookup_vehicles") return 100_000;
    if (tool === "nhtsa_get_safety_ratings" || tool === "nhtsa_search_complaints") return 60_000;
    return 45_000;
  },
  persistentSession: {
    key(context) { return path.resolve((context as NhtsaContext).nhtsaRoot ?? defaultRoot()); },
    idleMs: 20_000,
  },
  async validateAndTransform(tool, input, context) {
    const parsed = parseInput(tool, input);
    if (tool === "nhtsa_decode_vin") queueExpectedVins(context, parsed);
    return parsed;
  },
  async prepare(rawContext) {
    if (Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) !== 24) {
      throw new InvocationValidationError("NHTSA MCP 0.8.4 的固定运行边界要求 Node.js 24。");
    }
    const context = rawContext as NhtsaContext;
    const packageRoot = path.resolve(context.nhtsaPackageRoot ?? defaultPackageRoot());
    const packageEntry = path.join(packageRoot, "dist", "index.js");
    const packageMetadata = path.join(packageRoot, "package.json");
    const bootstrapEntry = bootstrap();
    const sandbox = await ensureSandbox(context.nhtsaRoot ?? defaultRoot());
    try {
      await Promise.all([access(packageEntry), access(packageMetadata), access(bootstrapEntry)]);
      await Promise.all([
        requireDirectory(packageRoot, "NHTSA 包目录"), requireRegularFile(packageEntry, "NHTSA 包入口"),
        requireRegularFile(packageMetadata, "NHTSA 包元数据"), requireRegularFile(bootstrapEntry, "NHTSA 安全启动器"),
      ]);
      const metadata = JSON.parse(await readFile(packageMetadata, "utf8")) as { name?: unknown; version?: unknown };
      if (metadata.name !== PACKAGE_NAME || metadata.version !== PACKAGE_VERSION) throw new Error("version mismatch");
    } catch (error) {
      if (error instanceof InvocationValidationError) throw error;
      throw new InvocationValidationError("NHTSA MCP 0.8.4 尚未按固定 lockfile 安装。");
    }
    return {
      command: process.execPath,
      args: ["--max-old-space-size=256", bootstrapEntry],
      cwd: sandbox.root,
      env: {
        AGENT_OPT_NHTSA_PACKAGE_ROOT: packageRoot,
        AGENT_OPT_NHTSA_RUNTIME_ROOT: sandbox.root,
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
        NODE_USE_ENV_PROXY: "0",
        NO_COLOR: "1",
        NODE_ENV: "production",
      },
    };
  },
  async normalizeResult(tool, result: AdapterToolResult, context) {
    const expectedVins = tool === "nhtsa_decode_vin" ? takeExpectedVins(context) : undefined;
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > NHTSA_RESULT_LIMIT) {
      throw new InvocationValidationError("NHTSA 结果超过 2 MiB 安全上限。");
    }
    if (result.isError) {
      inspectBoundedJson(result.structuredContent);
      const block = result.content.find((item): item is { type: "text"; text: string } =>
        Boolean(item && typeof item === "object" && (item as { type?: unknown }).type === "text" && typeof (item as { text?: unknown }).text === "string"));
      return {
        content: [{ type: "text", text: (block?.text || "NHTSA 返回了受控错误。").slice(0, 32_000) }],
        ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
        isError: true,
      };
    }
    if (!result.structuredContent || typeof result.structuredContent !== "object" || Array.isArray(result.structuredContent)) {
      throw new InvocationValidationError("NHTSA 返回结果缺少结构化内容。");
    }
    inspectBoundedJson(result.structuredContent);
    const schema = outputSchemas[tool as keyof typeof outputSchemas];
    const parsed = schema?.safeParse(result.structuredContent);
    if (!parsed?.success) throw new InvocationValidationError("NHTSA 返回结果不符合固定 0.8.4 协议结构。");
    let structuredContent = parsed.data as Record<string, unknown>;
    if (tool === "nhtsa_decode_vin") {
      const vehicles = structuredContent.vehicles as Array<{ vin: string }>;
      if (!expectedVins || vehicles.length !== expectedVins.length
        || vehicles.some((vehicle, index) => vehicle.vin.toUpperCase() !== expectedVins[index])) {
        throw new InvocationValidationError("VPIC VIN 返回数量或顺序与受控请求不一致。");
      }
    } else if (tool === "nhtsa_search_complaints") {
      const complaints = (structuredContent.complaints as Array<Record<string, unknown>>).map((item) => {
        const safe = { ...item };
        delete safe.dateOfIncident;
        return safe;
      });
      structuredContent = { ...structuredContent, componentBreakdown: [], complaints };
    } else if (tool === "nhtsa_get_vehicle_safety") {
      const ratings = structuredContent.safetyRatings as unknown[] | undefined;
      const recalls = structuredContent.recalls as unknown[] | undefined;
      const complaintSummary = structuredContent.complaintSummary as Record<string, unknown> | undefined;
      if ((ratings?.length ?? 0) === 0 && (recalls?.length ?? 0) === 0 && Number(complaintSummary?.totalCount ?? 0) === 0) {
        throw new InvocationValidationError("NHTSA 没有返回可确认车型身份的评级、召回或投诉证据；请先使用车辆查找确认 make、model 与 modelYear。");
      }
      if (complaintSummary) {
        structuredContent = {
          ...structuredContent,
          complaintSummary: { ...complaintSummary, componentBreakdown: [] },
        };
      }
    }
    return { content: [{ type: "text", text: summary(tool, structuredContent) }], structuredContent, isError: false };
  },
};

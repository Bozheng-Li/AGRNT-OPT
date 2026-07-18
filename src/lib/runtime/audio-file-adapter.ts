import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AdapterContext, AdapterToolResult, PluginAdapter } from "./adapters";
import {
  AUDIO_FILE_DURATION_LIMIT_SECONDS,
  AUDIO_FILE_UPLOAD_LIMIT,
  defaultAudioFileRoot,
  ensureAudioFileSandbox,
  readAudioFile,
  resolveAudioFilePath,
} from "./audio-file-files";
import { InvocationValidationError } from "./errors";

type AudioFileContext = AdapterContext & {
  audioFileRoot?: string;
  /** Qualification-only override; production uses the package pinned in the root lockfile. */
  audioFilePackageRoot?: string;
};

const bootstrapEntryPoint = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "scripts",
  "audio-file-mcp-entry.mjs",
);

const token = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,64}\.(?:wav|mp3|flac|ogg|opus)$/i,
    "必须使用音频上传接口返回的 token。",
  );
const seconds = z.number().finite().min(0).max(AUDIO_FILE_DURATION_LIMIT_SECONDS);
const region = z
  .object({ startSeconds: seconds, endSeconds: seconds })
  .strict()
  .refine((value) => value.endSeconds > value.startSeconds, "选区结束时间必须晚于开始时间。");
const span = z
  .object({ start: seconds, end: seconds })
  .strict()
  .refine((value) => value.end > value.start, "标注结束时间必须晚于开始时间。");
const envelopePoint = z.object({ time: seconds, value: z.number().finite().min(0).max(1) }).strict();
const annotationLane = z
  .object({
    label: z.string().trim().min(1).max(120).regex(/^[^\u0000-\u001f\u007f]+$/, "标注标签不能包含控制字符。").optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i, "标注颜色必须是 #RRGGBB。").optional(),
    spans: z.array(span).min(1).max(64),
    envelope: z.array(envelopePoint).max(128).optional(),
  })
  .strict()
  .superRefine((lane, context) => {
    for (let index = 1; index < lane.spans.length; index += 1) {
      if (lane.spans[index].start < lane.spans[index - 1].end) {
        context.addIssue({ code: "custom", path: ["spans", index], message: "同一轨道的标注区间不能重叠或倒序。" });
      }
    }
    if (lane.envelope) {
      for (let index = 1; index < lane.envelope.length; index += 1) {
        if (lane.envelope[index].time < lane.envelope[index - 1].time) {
          context.addIssue({ code: "custom", path: ["envelope", index], message: "包络时间必须按升序排列。" });
        }
      }
    }
  });
const annotations = z.object({ lanes: z.array(annotationLane).min(1).max(12) }).strict();
const displayInput = z
  .object({
    token,
    playheadSeconds: seconds.optional(),
    region: region.optional(),
    annotations: annotations.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 64 * 1024) {
      context.addIssue({ code: "custom", path: [], message: "音频展示参数不能超过 64 KiB。" });
    }
  });

function parseInput(input: unknown): z.infer<typeof displayInput> {
  const parsed = displayInput.safeParse(input ?? {});
  if (!parsed.success) {
    throw new InvocationValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；"),
    );
  }
  return parsed.data;
}

function packageEntry(context: AudioFileContext): string {
  const packageRoot = context.audioFilePackageRoot ?? path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "node_modules",
    "@counterpoint-studio",
    "audio-file-mcp-app",
  );
  return path.join(packageRoot, "dist", "server", "app.js");
}

function packageUi(context: AudioFileContext): string {
  const packageRoot = context.audioFilePackageRoot ?? path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "node_modules",
    "@counterpoint-studio",
    "audio-file-mcp-app",
  );
  return path.join(packageRoot, "dist", "mcp-app.html");
}

function effectiveRoot(context: AdapterContext): string {
  return (context as AudioFileContext).audioFileRoot ?? defaultAudioFileRoot();
}

function checkTimes(input: z.infer<typeof displayInput>, duration: number): void {
  if (input.playheadSeconds !== undefined && input.playheadSeconds > duration) {
    throw new InvocationValidationError("初始播放位置不能超过音频时长。");
  }
  if (input.region && input.region.endSeconds > duration) {
    throw new InvocationValidationError("选区不能超过音频时长。");
  }
  for (const lane of input.annotations?.lanes ?? []) {
    if (lane.spans.some((item) => item.end > duration) || lane.envelope?.some((item) => item.time > duration)) {
      throw new InvocationValidationError("标注或包络时间不能超过音频时长。");
    }
  }
}

const upstreamOutput = z
  .object({
    path: z.string().min(1),
    createdAt: z.number().finite(),
    seq: z.number().int().positive(),
    sizeBytes: z.number().int().positive().max(AUDIO_FILE_UPLOAD_LIMIT),
    mtimeMs: z.number().finite(),
    playheadSeconds: seconds.optional(),
    region: region.optional(),
    annotations: annotations.optional(),
  })
  .strict();

export const audioFileAdapter: PluginAdapter = {
  slug: "audio-file-inspector",
  allowedTools: ["display_audio_file"],
  requestTimeoutMs() {
    return 30_000;
  },
  async prepare(context) {
    const extended = context as AudioFileContext;
    const entry = packageEntry(extended);
    const ui = packageUi(extended);
    try {
      await Promise.all([access(entry), access(ui), access(bootstrapEntryPoint)]);
    } catch {
      throw new InvocationValidationError("Audio File MCP App 1.1.0 尚未安装，请从固定 lockfile 安装依赖。");
    }
    const sandbox = await ensureAudioFileSandbox(extended.audioFileRoot ?? defaultAudioFileRoot());
    return {
      command: process.execPath,
      args: ["--max-old-space-size=256", bootstrapEntryPoint],
      cwd: sandbox.root,
      env: {
        AGENT_OPT_AUDIO_ENTRY: entry,
        AGENT_OPT_AUDIO_ROOT: sandbox.uploads,
        AGENT_OPT_AUDIO_UI: ui,
        HOME: sandbox.home,
        USERPROFILE: sandbox.home,
        TEMP: sandbox.temporary,
        TMP: sandbox.temporary,
        TMPDIR: sandbox.temporary,
        NODE_ENV: "production",
        NO_COLOR: "1",
      },
    };
  },
  async validateAndTransform(tool, input, context) {
    if (tool !== "display_audio_file") throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    const parsed = parseInput(input);
    const file = await resolveAudioFilePath(parsed.token, effectiveRoot(context));
    checkTimes(parsed, file.durationSeconds);
    return {
      path: file.absolutePath,
      ...(parsed.playheadSeconds !== undefined ? { playheadSeconds: parsed.playheadSeconds } : {}),
      ...(parsed.region ? { region: parsed.region } : {}),
      ...(parsed.annotations ? { annotations: parsed.annotations } : {}),
    };
  },
  async normalizeResult(tool, result: AdapterToolResult, context) {
    if (tool !== "display_audio_file") throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);
    const parsed = upstreamOutput.safeParse(result.structuredContent);
    if (!parsed.success) throw new InvocationValidationError("Audio File MCP App 返回结果不符合固定 1.1.0 协议结构。");
    const safeToken = path.basename(parsed.data.path);
    const file = await readAudioFile(safeToken, effectiveRoot(context));
    if (path.resolve(file.absolutePath) !== path.resolve(parsed.data.path) || file.bytes !== parsed.data.sizeBytes) {
      throw new InvocationValidationError("Audio File MCP App 返回了工作区外路径或不一致的文件大小。");
    }
    const structuredContent = {
      file: {
        token: file.token,
        name: file.name,
        bytes: file.bytes,
        mimeType: file.mimeType,
        codec: file.codec,
        durationSeconds: file.durationSeconds,
        sampleRate: file.sampleRate,
        channels: file.channels,
      },
      createdAt: parsed.data.createdAt,
      seq: parsed.data.seq,
      ...(parsed.data.playheadSeconds !== undefined ? { playheadSeconds: parsed.data.playheadSeconds } : {}),
      ...(parsed.data.region ? { region: parsed.data.region } : {}),
      ...(parsed.data.annotations ? { annotations: parsed.data.annotations } : {}),
    };
    const serialized = JSON.stringify(structuredContent);
    if (Buffer.byteLength(serialized, "utf8") > 256 * 1024) {
      throw new InvocationValidationError("音频检查结果超过 256 KiB 安全上限。");
    }
    return {
      content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
      isError: result.isError,
    };
  },
};

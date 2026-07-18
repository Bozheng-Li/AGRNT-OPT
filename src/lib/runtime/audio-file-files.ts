import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { InvocationValidationError } from "./errors";

export const AUDIO_FILE_UPLOAD_LIMIT = 8 * 1024 * 1024;
export const AUDIO_FILE_DURATION_LIMIT_SECONDS = 300;
export const AUDIO_FILE_DECODED_SAMPLE_LIMIT = 24_000_000;

const supportedExtensions = new Set([".wav", ".mp3", ".flac", ".ogg", ".opus"]);
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,64}\.(?:wav|mp3|flac|ogg|opus)$/i;

export type AudioFileInfo = {
  token: string;
  name: string;
  bytes: number;
  extension: string;
  mimeType: string;
  codec: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  modifiedAt: string;
};

type AudioProbe = Pick<AudioFileInfo, "mimeType" | "codec" | "durationSeconds" | "sampleRate" | "channels">;

function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function defaultAudioFileRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "audio-file-mcp");
}

async function ensurePlainDirectory(target: string, label: string): Promise<void> {
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new InvocationValidationError(`${label}必须是普通目录，不能是符号链接。`);
    }
    return;
  } catch (error) {
    if (error instanceof InvocationValidationError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(target, { recursive: true });
  const created = await lstat(target);
  if (created.isSymbolicLink() || !created.isDirectory()) {
    throw new InvocationValidationError(`${label}必须是普通目录，不能是符号链接。`);
  }
}

export async function ensureAudioFileSandbox(
  root: string = defaultAudioFileRoot(),
): Promise<{ root: string; uploads: string; temporary: string; home: string }> {
  const resolved = path.resolve(/* turbopackIgnore: true */ root);
  const uploads = path.join(resolved, "uploads");
  const temporary = path.join(resolved, "tmp");
  const home = path.join(resolved, "home");
  await ensurePlainDirectory(resolved, "音频工作区");
  await Promise.all([
    ensurePlainDirectory(uploads, "音频上传目录"),
    ensurePlainDirectory(temporary, "音频临时目录"),
    ensurePlainDirectory(home, "音频运行主目录"),
  ]);
  return { root: resolved, uploads, temporary, home };
}

function decodeBase64(encoded: string): Buffer {
  let payload = encoded;
  if (encoded.startsWith("data:")) {
    const match = /^data:audio\/(?:wav|x-wav|mpeg|flac|ogg|opus);base64,([A-Za-z0-9+/=]+)$/i.exec(encoded);
    if (!match) throw new InvocationValidationError("音频 data URL 必须使用受支持的 audio/* MIME 与 base64 编码。");
    payload = match[1];
  }
  if (!payload || payload.length > Math.ceil((AUDIO_FILE_UPLOAD_LIMIT * 4) / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    throw new InvocationValidationError("音频 base64 数据格式无效或超过上传边界。");
  }
  const body = Buffer.from(payload, "base64");
  const canonical = body.toString("base64").replace(/=+$/, "");
  if (canonical !== payload.replace(/=+$/, "")) {
    throw new InvocationValidationError("音频 base64 数据不是规范编码。");
  }
  if (body.length === 0 || body.length > AUDIO_FILE_UPLOAD_LIMIT) {
    throw new InvocationValidationError("音频文件必须大于 0 字节且不超过 8 MiB。");
  }
  return body;
}

function readChunkId(body: Buffer, offset: number): string {
  return body.subarray(offset, offset + 4).toString("ascii");
}

function probeWav(body: Buffer): AudioProbe {
  if (body.length < 44 || readChunkId(body, 0) !== "RIFF" || readChunkId(body, 8) !== "WAVE") {
    throw new InvocationValidationError("WAV 文件缺少有效的 RIFF/WAVE 签名。");
  }
  if (body.readUInt32LE(4) + 8 !== body.length) throw new InvocationValidationError("WAV 容器声明的长度与文件边界不一致。");
  let cursor = 12;
  let format: { channels: number; sampleRate: number; byteRate: number; bits: number } | undefined;
  let dataBytes: number | undefined;
  while (cursor + 8 <= body.length) {
    const id = readChunkId(body, cursor);
    const length = body.readUInt32LE(cursor + 4);
    const start = cursor + 8;
    const end = start + length;
    if (end > body.length) throw new InvocationValidationError("WAV 数据块超出容器边界。");
    if (id === "fmt " && length >= 16) {
      const encoding = body.readUInt16LE(start);
      const channels = body.readUInt16LE(start + 2);
      const sampleRate = body.readUInt32LE(start + 4);
      const byteRate = body.readUInt32LE(start + 8);
      const bits = body.readUInt16LE(start + 14);
      if (![1, 3].includes(encoding) || channels < 1 || channels > 8 || sampleRate < 8_000 || sampleRate > 192_000 ||
          byteRate === 0 || ![8, 16, 24, 32].includes(bits)) {
        throw new InvocationValidationError("WAV 编码、通道数、采样率或位深不在安全支持范围内。");
      }
      format = { channels, sampleRate, byteRate, bits };
    } else if (id === "data") {
      dataBytes = length;
    }
    cursor = end + (length % 2);
  }
  if (!format || dataBytes === undefined || dataBytes === 0) throw new InvocationValidationError("WAV 文件缺少有效的 fmt 或 data 数据块。");
  const durationSeconds = dataBytes / format.byteRate;
  return {
    mimeType: "audio/wav",
    codec: `PCM ${format.bits}-bit`,
    durationSeconds,
    sampleRate: format.sampleRate,
    channels: format.channels,
  };
}

const mpeg1Layer3Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const mpeg2Layer3Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

function synchsafe(body: Buffer, offset: number): number {
  const values = [body[offset], body[offset + 1], body[offset + 2], body[offset + 3]];
  if (values.some((value) => value > 0x7f)) throw new InvocationValidationError("MP3 ID3 长度字段无效。");
  return (values[0] << 21) | (values[1] << 14) | (values[2] << 7) | values[3];
}

function parseMp3Frame(body: Buffer, offset: number) {
  if (offset + 4 > body.length || body[offset] !== 0xff || (body[offset + 1] & 0xe0) !== 0xe0) return null;
  const versionBits = (body[offset + 1] >> 3) & 0x03;
  const layerBits = (body[offset + 1] >> 1) & 0x03;
  if (versionBits === 1 || layerBits !== 1) return null;
  const bitrateIndex = (body[offset + 2] >> 4) & 0x0f;
  const sampleRateIndex = (body[offset + 2] >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;
  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const bitrate = (version === 1 ? mpeg1Layer3Bitrates : mpeg2Layer3Bitrates)[bitrateIndex];
  const sampleRates = version === 1 ? [44_100, 48_000, 32_000] : version === 2 ? [22_050, 24_000, 16_000] : [11_025, 12_000, 8_000];
  const sampleRate = sampleRates[sampleRateIndex];
  const padding = (body[offset + 2] >> 1) & 1;
  const frameLength = Math.floor(((version === 1 ? 144_000 : 72_000) * bitrate) / sampleRate) + padding;
  if (frameLength < 24 || offset + frameLength > body.length) return null;
  const mode = (body[offset + 3] >> 6) & 0x03;
  return { frameLength, sampleRate, samples: version === 1 ? 1_152 : 576, channels: mode === 3 ? 1 : 2 };
}

function probeMp3(body: Buffer): AudioProbe {
  let cursor = 0;
  if (body.length >= 10 && body.subarray(0, 3).toString("ascii") === "ID3") {
    const tagLength = synchsafe(body, 6);
    cursor = 10 + tagLength + ((body[5] & 0x10) !== 0 ? 10 : 0);
    if (cursor >= body.length) throw new InvocationValidationError("MP3 只包含 ID3 标签，没有音频帧。");
  }
  const paddingStart = cursor;
  while (cursor < body.length && body[cursor] === 0 && cursor - paddingStart <= 1_024) cursor += 1;
  if (cursor - paddingStart > 1_024) throw new InvocationValidationError("MP3 音频帧前的填充超过 1 KiB。 ");
  const first = parseMp3Frame(body, cursor);
  if (!first) throw new InvocationValidationError("MP3 文件缺少有效的 MPEG Layer III 帧。");
  let totalSeconds = 0;
  let frames = 0;
  const channels = first.channels;
  const sampleRate = first.sampleRate;
  while (cursor + 4 <= body.length) {
    if (body.length - cursor === 128 && body.subarray(cursor, cursor + 3).toString("ascii") === "TAG") {
      cursor = body.length;
      break;
    }
    const frame = parseMp3Frame(body, cursor);
    if (!frame) {
      if (body.subarray(cursor).every((value) => value === 0)) {
        cursor = body.length;
        break;
      }
      throw new InvocationValidationError("MP3 帧序列包含损坏或不受支持的数据。");
    }
    if (frame.sampleRate !== sampleRate || frame.channels !== channels) {
      throw new InvocationValidationError("MP3 中途改变采样率或通道布局，Web 适配暂不接受该文件。");
    }
    totalSeconds += frame.samples / frame.sampleRate;
    frames += 1;
    cursor += frame.frameLength;
  }
  if (frames === 0 || cursor !== body.length) throw new InvocationValidationError("MP3 文件没有形成完整的音频帧序列。");
  return { mimeType: "audio/mpeg", codec: "MPEG Layer III", durationSeconds: totalSeconds, sampleRate, channels };
}

function probeFlac(body: Buffer): AudioProbe {
  if (body.length < 42 || body.subarray(0, 4).toString("ascii") !== "fLaC") {
    throw new InvocationValidationError("FLAC 文件缺少有效的 fLaC 签名。");
  }
  let cursor = 4;
  let packed: bigint | undefined;
  let metadataBlocks = 0;
  while (cursor + 4 <= body.length) {
    const last = (body[cursor] & 0x80) !== 0;
    const blockType = body[cursor] & 0x7f;
    const blockLength = body.readUIntBE(cursor + 1, 3);
    const start = cursor + 4;
    const end = start + blockLength;
    if (end > body.length || metadataBlocks > 64) throw new InvocationValidationError("FLAC 元数据块超出安全边界。");
    if (metadataBlocks === 0) {
      if (blockType !== 0 || blockLength !== 34) throw new InvocationValidationError("FLAC 首个元数据块必须是 34 字节 STREAMINFO。");
      packed = body.readBigUInt64BE(start + 10);
    }
    metadataBlocks += 1;
    cursor = end;
    if (last) break;
  }
  if (packed === undefined || cursor + 2 > body.length || body[cursor] !== 0xff || (body[cursor + 1] & 0xfc) !== 0xf8) {
    throw new InvocationValidationError("FLAC 文件缺少完整 STREAMINFO 或音频帧同步码。");
  }
  const sampleRate = Number((packed >> 44n) & 0xfffffn);
  const channels = Number((packed >> 41n) & 0x7n) + 1;
  const totalSamples = Number(packed & 0xfffffffffn);
  if (sampleRate < 8_000 || sampleRate > 384_000 || channels < 1 || channels > 8 || totalSamples <= 0) {
    throw new InvocationValidationError("FLAC STREAMINFO 中的采样率、通道数或样本数无效。");
  }
  return {
    mimeType: "audio/flac",
    codec: "FLAC",
    durationSeconds: totalSamples / sampleRate,
    sampleRate,
    channels,
  };
}

function probeOgg(body: Buffer, extension: string): AudioProbe {
  if (body.length < 27 || readChunkId(body, 0) !== "OggS") throw new InvocationValidationError("Ogg 文件缺少有效的 OggS 页面。");
  let cursor = 0;
  let serial: number | undefined;
  let codec: "Opus" | "Vorbis" | undefined;
  let sampleRate = 0;
  let channels = 0;
  let preSkip = 0;
  let finalGranule = 0n;
  while (cursor + 27 <= body.length) {
    if (readChunkId(body, cursor) !== "OggS" || body[cursor + 4] !== 0) throw new InvocationValidationError("Ogg 页面头损坏或版本不受支持。");
    const segments = body[cursor + 26];
    const tableEnd = cursor + 27 + segments;
    if (tableEnd > body.length) throw new InvocationValidationError("Ogg 分段表超出文件边界。");
    let payloadLength = 0;
    for (let index = cursor + 27; index < tableEnd; index += 1) payloadLength += body[index];
    const pageEnd = tableEnd + payloadLength;
    if (pageEnd > body.length) throw new InvocationValidationError("Ogg 页面载荷超出文件边界。");
    const pageSerial = body.readUInt32LE(cursor + 14);
    if (serial === undefined) serial = pageSerial;
    if (pageSerial === serial) {
      const payload = body.subarray(tableEnd, pageEnd);
      if (!codec) {
        if (payload.subarray(0, 8).toString("ascii") === "OpusHead" && payload.length >= 19) {
          codec = "Opus";
          channels = payload[9];
          preSkip = payload.readUInt16LE(10);
          sampleRate = 48_000;
        } else if (payload.length >= 30 && payload[0] === 1 && payload.subarray(1, 7).toString("ascii") === "vorbis") {
          codec = "Vorbis";
          channels = payload[11];
          sampleRate = payload.readUInt32LE(12);
        } else {
          throw new InvocationValidationError("Ogg Web 适配只接受 Opus 或 Vorbis 音频流。");
        }
      }
      const granule = body.readBigUInt64LE(cursor + 6);
      if (granule !== 0xffffffffffffffffn && granule > finalGranule) finalGranule = granule;
    }
    cursor = pageEnd;
  }
  if (cursor !== body.length || !codec || sampleRate < 8_000 || sampleRate > 192_000 || channels < 1 || channels > 8) {
    throw new InvocationValidationError("Ogg 页面、编解码信息或音频参数无效。");
  }
  if (extension === ".opus" && codec !== "Opus") throw new InvocationValidationError(".opus 扩展名必须对应 Opus 流。");
  const effectiveSamples = finalGranule - BigInt(codec === "Opus" ? preSkip : 0);
  if (effectiveSamples <= 0n) throw new InvocationValidationError("Ogg 文件缺少可计算时长的最终 granule position。");
  return { mimeType: "audio/ogg", codec, durationSeconds: Number(effectiveSamples) / sampleRate, sampleRate, channels };
}

export function inspectAudioFile(name: string, body: Buffer): AudioProbe {
  const extension = path.extname(name).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw new InvocationValidationError("仅接受 WAV、MP3、FLAC、Ogg Vorbis 与 Opus 音频。");
  }
  const probe = extension === ".wav" ? probeWav(body)
    : extension === ".mp3" ? probeMp3(body)
      : extension === ".flac" ? probeFlac(body)
        : probeOgg(body, extension);
  if (!Number.isFinite(probe.durationSeconds) || probe.durationSeconds <= 0 || probe.durationSeconds > AUDIO_FILE_DURATION_LIMIT_SECONDS) {
    throw new InvocationValidationError("音频时长必须大于 0 秒且不超过 5 分钟。");
  }
  if (probe.durationSeconds * probe.sampleRate * probe.channels > AUDIO_FILE_DECODED_SAMPLE_LIMIT) {
    throw new InvocationValidationError("音频解码后的总样本量不能超过 2,400 万，建议降低时长、采样率或通道数。");
  }
  return { ...probe, durationSeconds: Math.round(probe.durationSeconds * 1_000) / 1_000 };
}

function safeStem(name: string): string {
  return path.basename(name, path.extname(name)).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 64) || "audio";
}

async function resolveToken(token: string, root: string): Promise<{ sandbox: Awaited<ReturnType<typeof ensureAudioFileSandbox>>; target: string }> {
  if (!tokenPattern.test(token) || path.basename(token) !== token) throw new InvocationValidationError("音频上传 token 格式无效。");
  const sandbox = await ensureAudioFileSandbox(root);
  const lexical = path.join(sandbox.uploads, token);
  let actual: string;
  try {
    actual = await realpath(lexical);
  } catch {
    throw new InvocationValidationError("音频上传 token 不存在或已失效。");
  }
  const actualRoot = await realpath(sandbox.uploads);
  if (!within(actualRoot, actual)) throw new InvocationValidationError("音频上传 token 超出隔离工作区。");
  const info = await lstat(lexical);
  if (info.isSymbolicLink() || !info.isFile() || info.size <= 0 || info.size > AUDIO_FILE_UPLOAD_LIMIT) {
    throw new InvocationValidationError("音频上传 token 未指向受支持大小的普通文件。");
  }
  return { sandbox, target: actual };
}

function record(token: string, body: Buffer, info: Awaited<ReturnType<typeof stat>>, probe: AudioProbe): AudioFileInfo {
  const extension = path.extname(token).toLowerCase();
  const stem = token.slice(37, -extension.length);
  return {
    token,
    name: `${stem}${extension}`,
    bytes: body.length,
    extension,
    ...probe,
    modifiedAt: info.mtime.toISOString(),
  };
}

export async function uploadAudioFile(
  name: string,
  encoded: string,
  root: string = defaultAudioFileRoot(),
): Promise<AudioFileInfo> {
  const body = decodeBase64(encoded);
  const probe = inspectAudioFile(name, body);
  const extension = path.extname(name).toLowerCase();
  const sandbox = await ensureAudioFileSandbox(root);
  const token = `${randomUUID()}-${safeStem(name)}${extension}`;
  const target = path.join(await realpath(sandbox.uploads), token);
  await writeFile(target, body, { flag: "wx", mode: 0o600 });
  return record(token, body, await stat(target), probe);
}

export async function readAudioFile(
  token: string,
  root: string = defaultAudioFileRoot(),
): Promise<AudioFileInfo & { body: Buffer; absolutePath: string }> {
  const { target } = await resolveToken(token, root);
  const body = await readFile(target);
  const probe = inspectAudioFile(token, body);
  return { ...record(token, body, await stat(target), probe), body, absolutePath: target };
}

export async function resolveAudioFilePath(token: string, root: string = defaultAudioFileRoot()): Promise<AudioFileInfo & { absolutePath: string }> {
  const { body, ...resolved } = await readAudioFile(token, root);
  void body;
  return resolved;
}

export async function listAudioFiles(root: string = defaultAudioFileRoot()): Promise<AudioFileInfo[]> {
  const sandbox = await ensureAudioFileSandbox(root);
  const tokens = (await readdir(sandbox.uploads, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && tokenPattern.test(entry.name))
    .map((entry) => entry.name)
    .slice(0, 50);
  const results: AudioFileInfo[] = [];
  for (const token of tokens) {
    try {
      const { body, absolutePath, ...file } = await readAudioFile(token, root);
      void body;
      void absolutePath;
      results.push(file);
    } catch {
      // Ignore stale or malformed files rather than exposing them through the catalog API.
    }
  }
  return results.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

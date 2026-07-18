import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, test } from "vitest";
import type { AdapterContext, AdapterToolResult } from "@/lib/runtime/adapters";
import { audioFileAdapter } from "@/lib/runtime/audio-file-adapter";
import {
  AUDIO_FILE_UPLOAD_LIMIT,
  ensureAudioFileSandbox,
  inspectAudioFile,
  readAudioFile,
  resolveAudioFilePath,
  uploadAudioFile,
} from "@/lib/runtime/audio-file-files";

const roots: string[] = [];
const execFileAsync = promisify(execFile);

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-audio-"));
  roots.push(root);
  return root;
}

function context(root: string): AdapterContext {
  return { audioFileRoot: root } as AdapterContext;
}

function wav(seconds = 1, sampleRate = 8_000, frequency = 440): Buffer {
  const samples = Math.floor(seconds * sampleRate);
  const body = Buffer.alloc(44 + samples * 2);
  body.write("RIFF", 0, "ascii");
  body.writeUInt32LE(body.length - 8, 4);
  body.write("WAVE", 8, "ascii");
  body.write("fmt ", 12, "ascii");
  body.writeUInt32LE(16, 16);
  body.writeUInt16LE(1, 20);
  body.writeUInt16LE(1, 22);
  body.writeUInt32LE(sampleRate, 24);
  body.writeUInt32LE(sampleRate * 2, 28);
  body.writeUInt16LE(2, 32);
  body.writeUInt16LE(16, 34);
  body.write("data", 36, "ascii");
  body.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    body.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 8_000), 44 + index * 2);
  }
  return body;
}

function longLowRateWav(seconds: number): Buffer {
  const sampleRate = 8_000;
  const samples = seconds * sampleRate;
  const body = Buffer.alloc(44 + samples);
  body.write("RIFF", 0, "ascii");
  body.writeUInt32LE(body.length - 8, 4);
  body.write("WAVE", 8, "ascii");
  body.write("fmt ", 12, "ascii");
  body.writeUInt32LE(16, 16);
  body.writeUInt16LE(1, 20);
  body.writeUInt16LE(1, 22);
  body.writeUInt32LE(sampleRate, 24);
  body.writeUInt32LE(sampleRate, 28);
  body.writeUInt16LE(1, 32);
  body.writeUInt16LE(8, 34);
  body.write("data", 36, "ascii");
  body.writeUInt32LE(samples, 40);
  body.fill(128, 44);
  return body;
}

function highDecodeBudgetFlac(): Buffer {
  const body = Buffer.alloc(44);
  body.write("fLaC", 0, "ascii");
  body[4] = 0x80;
  body.writeUIntBE(34, 5, 3);
  const sampleRate = 192_000n;
  const channelsMinusOne = 7n;
  const bitsMinusOne = 15n;
  const totalSamples = 19_200_000n;
  body.writeBigUInt64BE((sampleRate << 44n) | (channelsMinusOne << 41n) | (bitsMinusOne << 36n) | totalSamples, 18);
  body[42] = 0xff;
  body[43] = 0xf8;
  return body;
}

async function invoke(
  root: string,
  input: Record<string, unknown>,
): Promise<{ tools: string[]; result: AdapterToolResult }> {
  const runtimeContext = context(root);
  const transformed = await audioFileAdapter.validateAndTransform("display_audio_file", input, runtimeContext);
  const launch = await audioFileAdapter.prepare(runtimeContext);
  const transport = new StdioClientTransport({
    ...launch,
    env: { ...getDefaultEnvironment(), ...launch.env },
    stderr: "pipe",
  });
  const client = new Client({ name: "agent-opt-audio-test", version: "0.1.0" }, { capabilities: {} });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const raw = await client.callTool({ name: "display_audio_file", arguments: transformed });
    const result = await audioFileAdapter.normalizeResult!(
      "display_audio_file",
      {
        content: Array.isArray(raw.content) ? raw.content : [],
        structuredContent: raw.structuredContent as Record<string, unknown> | undefined,
        isError: raw.isError === true,
      },
      runtimeContext,
    );
    return { tools: listed.tools.map((tool) => tool.name), result };
  } finally {
    await client.close().catch(() => undefined);
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Audio File MCP App integration", () => {
  test("invokes the exact upstream tool with a small local WAV and strips the sandbox path", async () => {
    const root = await temporaryRoot();
    const uploaded = await uploadAudioFile("tone.wav", wav().toString("base64"), root);
    expect(uploaded).toMatchObject({ codec: "PCM 16-bit", durationSeconds: 1, sampleRate: 8_000, channels: 1 });

    const { tools, result } = await invoke(root, {
      token: uploaded.token,
      playheadSeconds: 0.2,
      region: { startSeconds: 0.1, endSeconds: 0.4 },
      annotations: {
        lanes: [{ label: "Tone", color: "#7c5cff", spans: [{ start: 0.1, end: 0.3 }] }],
      },
    });
    expect(tools).toEqual(["display_audio_file"]);
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      file: { token: uploaded.token, bytes: wav().length, durationSeconds: 1 },
      playheadSeconds: 0.2,
      region: { startSeconds: 0.1, endSeconds: 0.4 },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("Tone");
    expect(serialized).not.toContain(path.resolve(root));
  }, 60_000);

  test("enforces format, signature, size and duration boundaries before launch", async () => {
    const root = await temporaryRoot();
    await expect(uploadAudioFile("payload.exe", Buffer.from("MZ").toString("base64"), root)).rejects.toThrow(/WAV、MP3/);
    await expect(uploadAudioFile("fake.wav", Buffer.from("not audio").toString("base64"), root)).rejects.toThrow(/RIFF\/WAVE/);
    await expect(uploadAudioFile("fake.mp3", wav().toString("base64"), root)).rejects.toThrow(/MPEG Layer III/);
    await expect(uploadAudioFile("long.wav", longLowRateWav(301).toString("base64"), root)).rejects.toThrow(/5 分钟/);
    await expect(uploadAudioFile("wide.flac", highDecodeBudgetFlac().toString("base64"), root)).rejects.toThrow(/2,400 万/);
    await expect(uploadAudioFile("large.wav", Buffer.alloc(AUDIO_FILE_UPLOAD_LIMIT + 1).toString("base64"), root)).rejects.toThrow(/8 MiB|上传边界/);
    expect(() => inspectAudioFile("tone.wav", wav(0.25))).not.toThrow();
  });

  test("rejects paths, URLs, annotationsPath, unknown fields and out-of-range timeline state", async () => {
    const root = await temporaryRoot();
    const uploaded = await uploadAudioFile("tone.wav", wav().toString("base64"), root);
    for (const input of [
      { path: "C:/Windows/win.ini" },
      { token: "https://example.com/audio.wav" },
      { token: "file:///etc/passwd" },
      { token: "../outside.wav" },
      { token: uploaded.token, annotationsPath: "C:/host/annotations.json" },
      { token: uploaded.token, unknown: true },
    ]) {
      await expect(audioFileAdapter.validateAndTransform("display_audio_file", input, context(root))).rejects.toThrow(/token|参数|Unrecognized|unrecognized/i);
    }
    await expect(
      audioFileAdapter.validateAndTransform("display_audio_file", { token: uploaded.token, playheadSeconds: 2 }, context(root)),
    ).rejects.toThrow(/不能超过音频时长/);
    await expect(
      audioFileAdapter.validateAndTransform(
        "display_audio_file",
        { token: uploaded.token, annotations: { lanes: [{ spans: [{ start: 0.8, end: 1.2 }] }] } },
        context(root),
      ),
    ).rejects.toThrow(/不能超过音频时长/);
  });

  test("rejects symlinked roots, token escapes and normalized results outside the upload sandbox", async () => {
    const target = await temporaryRoot();
    const parent = await temporaryRoot();
    const linkedRoot = path.join(parent, "linked-root");
    await symlink(target, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    await expect(ensureAudioFileSandbox(linkedRoot)).rejects.toThrow(/符号链接/);

    const root = await temporaryRoot();
    const sandbox = await ensureAudioFileSandbox(root);
    const outside = await temporaryRoot();
    await writeFile(path.join(outside, "secret.wav"), wav());
    const escapeToken = "123e4567-e89b-42d3-a456-426614174000-escape.wav";
    await symlink(outside, path.join(sandbox.uploads, escapeToken), process.platform === "win32" ? "junction" : "dir");
    await expect(resolveAudioFilePath(escapeToken, root)).rejects.toThrow(/超出隔离工作区|普通文件/);

    const uploaded = await uploadAudioFile("safe.wav", wav().toString("base64"), root);
    await expect(
      audioFileAdapter.normalizeResult!(
        "display_audio_file",
        {
          content: [{ type: "text", text: "outside" }],
          structuredContent: {
            path: path.join(outside, uploaded.token),
            createdAt: Date.now(),
            seq: 1,
            sizeBytes: uploaded.bytes,
            mtimeMs: Date.now(),
          },
          isError: false,
        },
        context(root),
      ),
    ).rejects.toThrow(/不存在|工作区外|不一致/);
  });

  test("the fixed bootstrap denies network, subprocesses, writes, host reads, proxies and credentials", async () => {
    const root = await temporaryRoot();
    const sandbox = await ensureAudioFileSandbox(root);
    const outside = path.join(await temporaryRoot(), "outside.txt");
    await writeFile(outside, "host secret", "utf8");
    const packageRoot = path.join(process.cwd(), "node_modules", "@counterpoint-studio", "audio-file-mcp-app");
    const bootstrap = path.join(process.cwd(), "scripts", "audio-file-mcp-entry.mjs");
    const { stdout, stderr } = await execFileAsync(process.execPath, [bootstrap], {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        AGENT_OPT_AUDIO_ENTRY: path.join(packageRoot, "dist", "server", "app.js"),
        AGENT_OPT_AUDIO_ROOT: sandbox.uploads,
        AGENT_OPT_AUDIO_UI: path.join(packageRoot, "dist", "mcp-app.html"),
        AGENT_OPT_AUDIO_SECURITY_PROBE: "1",
        AGENT_OPT_AUDIO_PROBE_OUTSIDE: outside,
        HTTPS_PROXY: "http://proxy.invalid:8080",
        NPM_TOKEN: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      fetchDenied: true,
      subprocessDenied: true,
      outsideReadDenied: true,
      writeDenied: true,
      proxyRemoved: true,
      credentialRemoved: true,
    });
    await expect(readAudioFile("not-a-token", root)).rejects.toThrow(/token/);
  }, 30_000);
});

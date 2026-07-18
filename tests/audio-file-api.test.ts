import { describe, expect, test } from "vitest";
import { findPublicPlugin } from "@/lib/catalog";
import { POST as uploadFile } from "../src/app/api/plugins/[slug]/files/route";
import { POST as invokeTool } from "../src/app/api/plugins/[slug]/invoke/route";

const integrated = Boolean(findPublicPlugin("audio-file-inspector"));

function wav(): Buffer {
  const sampleRate = 8_000;
  const samples = sampleRate;
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
    body.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 8_000), 44 + index * 2);
  }
  return body;
}

async function upload(name: string, body: Buffer) {
  return uploadFile(
    new Request("http://localhost/api/plugins/audio-file-inspector/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data: body.toString("base64") }),
    }),
    { params: Promise.resolve({ slug: "audio-file-inspector" }) },
  );
}

async function invoke(args: Record<string, unknown>) {
  return invokeTool(
    new Request("http://localhost/api/plugins/audio-file-inspector/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "display_audio_file", arguments: args }),
    }),
    { params: Promise.resolve({ slug: "audio-file-inspector" }) },
  );
}

describe.runIf(integrated)("Audio File public API", () => {
  test("uploads one bounded WAV, invokes the real upstream tool, and never returns an absolute path", async () => {
    const uploadResponse = await upload("api-tone.wav", wav());
    expect(uploadResponse.status).toBe(200);
    const uploaded = (await uploadResponse.json()).file as { token: string; durationSeconds: number };
    expect(uploaded.token).toMatch(/\.wav$/);
    expect(uploaded.durationSeconds).toBe(1);

    const response = await invoke({
      token: uploaded.token,
      playheadSeconds: 0.2,
      region: { startSeconds: 0.1, endSeconds: 0.4 },
      annotations: { lanes: [{ label: "API", spans: [{ start: 0.1, end: 0.3 }] }] },
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plugin).toBe("io.github.counterpoint-studio/audio-file-mcp-app");
    expect(payload.result.isError).toBe(false);
    expect(payload.result.structuredContent.file.token).toBe(uploaded.token);
    expect(payload.result.structuredContent.region).toEqual({ startSeconds: 0.1, endSeconds: 0.4 });
    expect(JSON.stringify(payload)).not.toMatch(/[A-Za-z]:\\|\/var\/runtime\/audio-file-mcp/);
  }, 60_000);

  test("returns controlled 400 errors for malformed audio and host-path-shaped tool input", async () => {
    const malformed = await upload("fake.wav", Buffer.from("not audio"));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toMatch(/RIFF|WAV/);

    const unsafe = await invoke({ path: "C:/Windows/win.ini", annotationsPath: "file:///etc/passwd" });
    expect(unsafe.status).toBe(400);
    expect((await unsafe.json()).error).toMatch(/token|参数|格式/i);
  });
});

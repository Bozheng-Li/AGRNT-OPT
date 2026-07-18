import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const manifest = JSON.parse(
  readFileSync(path.join(process.cwd(), "catalog", "plugins", "audio-file-inspector.json"), "utf8"),
) as { lifecycle: { status: string } };
const publicLifecycle = manifest.lifecycle.status === "web-ready" || manifest.lifecycle.status === "verified";

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

test.skip(!publicLifecycle, "Audio File remains adapted and non-public until central registration and full verification.");

test("@web-e2e [audio-file-inspector] Audio File Web uploads, plays, visualizes, annotates and fails safely", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/plugins/audio-file-inspector");
  await expect(page.getByRole("heading", { name: "音频文件检查台" })).toBeVisible();

  await page.getByTestId("audio-file-input").setInputFiles({
    name: "chromium-tone.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await page.getByTestId("audio-run").click();
  await expect(page.getByTestId("audio-inspection")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("audio-player")).toBeVisible();
  await expect(page.getByTestId("audio-metrics")).toContainText("dBFS");
  await expect(page.getByTestId("audio-metrics")).toContainText("LUFS 近似值");
  await expect(page.getByTestId("audio-waveform")).toBeVisible();
  await expect(page.getByTestId("audio-spectrogram")).toBeVisible();
  await expect(page.getByTestId("audio-upstream-confirmation")).toContainText("上游 MCP 已确认");

  await page.getByTestId("audio-annotations").fill(JSON.stringify({
    lanes: [{ label: "越界", spans: [{ start: 0.8, end: 1.2 }] }],
  }));
  await page.getByTestId("audio-run").click();
  await expect(page.getByTestId("invoke-error")).toContainText(/不能超过音频时长|标注/, { timeout: 30_000 });

  await page.getByTestId("audio-file-input").setInputFiles({
    name: "fake.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("not audio"),
  });
  await page.getByTestId("audio-run").click();
  await expect(page.getByTestId("invoke-error")).toContainText(/无法解码|文件内容|RIFF|WAV/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("audio-file-dropzone")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

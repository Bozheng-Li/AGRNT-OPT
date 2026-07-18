import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { POST as invokePost } from "../src/app/api/plugins/[slug]/invoke/route";
import { POST as filesPost } from "../src/app/api/plugins/[slug]/files/route";

async function fixtureBase64(): Promise<string> {
  const body = await readFile(path.join(process.cwd(), "fixtures", "safe-docx", "service-agreement.docx"));
  return body.toString("base64");
}

async function upload() {
  return filesPost(
    new Request("http://localhost/api/plugins/safe-docx-studio/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "service-agreement.docx", data: await fixtureBase64() }),
    }),
    { params: Promise.resolve({ slug: "safe-docx-studio" }) },
  );
}

async function invoke(tool: string, args: Record<string, unknown>) {
  return invokePost(
    new Request("http://localhost/api/plugins/safe-docx-studio/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "tool", tool, arguments: args }),
    }),
    { params: Promise.resolve({ slug: "safe-docx-studio" }) },
  );
}

describe("Safe DOCX public API", () => {
  test("uploads a DOCX, reads and greps it, and rejects host paths", async () => {
    const uploaded = await upload();
    expect(uploaded.status).toBe(200);
    const filePayload = await uploaded.json();
    expect(filePayload.file.path).toMatch(/^uploads\//);
    expect(filePayload.file.extension).toBe(".docx");

    const read = await invoke("read_file", {
      file: filePayload.file.path,
      format: "json",
      limit: 10,
    });
    expect(read.status).toBe(200);
    const readPayload = await read.json();
    expect(readPayload.plugin).toBe("io.github.usejunior/safe-docx");
    expect(readPayload.result.isError).toBe(false);
    expect(JSON.stringify(readPayload.result)).toMatch(/Service Agreement|Payment/i);

    const grep = await invoke("grep", {
      file: filePayload.file.path,
      pattern: "Payment",
      max_results: 5,
    });
    expect(grep.status).toBe(200);
    expect(JSON.stringify(await grep.json())).toMatch(/Payment/i);

    const unsafe = await invoke("read_file", {
      file: "C:/Windows/win.ini.docx",
      format: "json",
    });
    expect(unsafe.status).toBe(400);
  }, 180_000);
});

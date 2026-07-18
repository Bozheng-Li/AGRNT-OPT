import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import type { AdapterContext } from "@/lib/runtime/adapters";
import { closePluginSessions, invokePluginTool, listPluginTools } from "@/lib/runtime/invoke";
import { uploadSafeDocxFile } from "@/lib/runtime/safe-docx-files";

const roots: string[] = [];
const execFileAsync = promisify(execFile);

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-safe-docx-"));
  roots.push(root);
  return root;
}

function context(root: string): AdapterContext {
  return { safeDocxRoot: root } as AdapterContext;
}

async function fixtureBase64(): Promise<string> {
  const body = await readFile(path.join(process.cwd(), "fixtures", "safe-docx", "service-agreement.docx"));
  return body.toString("base64");
}

afterEach(async () => {
  await closePluginSessions("safe-docx-studio");
  await Promise.all(
    roots.splice(0).map(async (root) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await rm(root, { recursive: true, force: true });
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        }
      }
      await rm(root, { recursive: true, force: true }).catch(() => undefined);
    }),
  );
});

describe("Safe DOCX MCP integration", () => {
  test("exposes the curated eight-tool surface and reads the Service Agreement fixture", async () => {
    const root = await temporaryRoot();
    const file = await uploadSafeDocxFile("service-agreement.docx", await fixtureBase64(), root);
    const tools = await listPluginTools("safe-docx-studio", context(root));
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "close_file",
      "export",
      "get_file_status",
      "grep",
      "insert_paragraph",
      "read_file",
      "replace_text",
      "save",
    ]);

    const read = await invokePluginTool(
      "safe-docx-studio",
      "read_file",
      { file: file.path, format: "json", include_fingerprint: true, limit: 20 },
      context(root),
    );
    expect(read.isError).toBe(false);
    const payload = JSON.stringify(read.structuredContent ?? read.content);
    expect(payload).toMatch(/Service Agreement/i);
    expect(payload).toMatch(/Payment due in thirty days/i);
  }, 180_000);

  test("greps, replaces a paragraph, and exports markdown inside the sandbox", async () => {
    const root = await temporaryRoot();
    const file = await uploadSafeDocxFile("service-agreement.docx", await fixtureBase64(), root);

    const grep = await invokePluginTool(
      "safe-docx-studio",
      "grep",
      { file: file.path, pattern: "Payment", max_results: 5 },
      context(root),
    );
    expect(grep.isError).toBe(false);
    expect(JSON.stringify(grep.structuredContent ?? grep.content)).toMatch(/Payment/i);

    const matches = (grep.structuredContent?.matches as Array<Record<string, unknown>> | undefined) ?? [];
    const paragraphId = String(matches[0]?.para_id ?? "");
    expect(paragraphId).toMatch(/^[A-Za-z0-9_.:-]+$/);

    const replaced = await invokePluginTool(
      "safe-docx-studio",
      "replace_text",
      {
        file: file.path,
        target_paragraph_id: paragraphId,
        old_string: "thirty days",
        new_string: "fifteen days",
      },
      context(root),
    );
    expect(replaced.isError).toBe(false);

    const exported = await invokePluginTool(
      "safe-docx-studio",
      "export",
      { file: file.path, format: "markdown" },
      context(root),
    );
    expect(exported.isError).toBe(false);
    const exportText = JSON.stringify(exported.structuredContent ?? exported.content);
    expect(exportText).toMatch(/fifteen days|Service Agreement|markdown|output/i);
  }, 180_000);

  test("rejects unsafe inputs and probes the bootstrap sandbox", async () => {
    const root = await temporaryRoot();
    const file = await uploadSafeDocxFile("service-agreement.docx", await fixtureBase64(), root);

    await expect(
      invokePluginTool(
        "safe-docx-studio",
        "read_file",
        { file: "../etc/passwd.docx", format: "json" },
        context(root),
      ),
    ).rejects.toThrow();

    await expect(
      invokePluginTool(
        "safe-docx-studio",
        "read_file",
        { file: file.path, google_doc_id: "abc", format: "json" },
        context(root),
      ),
    ).rejects.toThrow();

    await expect(
      invokePluginTool(
        "safe-docx-studio",
        "accept_changes",
        { file: file.path },
        context(root),
      ),
    ).rejects.toThrow();

    const probe = await execFileAsync(
      process.execPath,
      [path.join(process.cwd(), "scripts", "safe-docx-mcp-entry.mjs")],
      {
        env: {
          ...process.env,
          AGENT_OPT_SAFE_DOCX_ROOT: root,
          AGENT_OPT_SAFE_DOCX_SECURITY_PROBE: "1",
          NPM_TOKEN: "should-be-removed",
          OPENAI_API_KEY: "should-be-removed",
        },
        timeout: 20_000,
      },
    );
    const report = JSON.parse(probe.stdout) as Record<string, boolean>;
    expect(report).toMatchObject({
      packagePinned: true,
      allowedRootsPinned: true,
      credentialRemoved: true,
      networkDenied: true,
      httpDenied: true,
      subprocessDenied: true,
      workerDenied: true,
    });

    const linkedRoot = await temporaryRoot();
    const link = path.join(linkedRoot, "link");
    await symlink(linkedRoot, link, process.platform === "win32" ? "junction" : "dir").catch(() => undefined);
    if (process.platform !== "win32") {
      await expect(uploadSafeDocxFile("x.docx", await fixtureBase64(), link)).rejects.toThrow();
    }
  }, 60_000);
});

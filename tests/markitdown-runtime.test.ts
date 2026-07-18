import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import {
  listMarkitdownFiles,
  resolveMarkitdownFileUri,
  uploadMarkitdownFile,
} from "@/lib/runtime/markitdown-files";
import { invokePluginTool, listPluginTools } from "@/lib/runtime/invoke";

const temporaryRoots: string[] = [];
const execFileAsync = promisify(execFile);

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-markitdown-"));
  temporaryRoots.push(root);
  return root;
}

function encoded(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Microsoft MarkItDown MCP integration", () => {
  test("exposes the exact upstream tool and converts bounded HTML", async () => {
    const root = await temporaryRoot();
    const file = await uploadMarkitdownFile(
      "release-notes.html",
      encoded("<!doctype html><html><head><title>Release 2.0</title></head><body><h1>Release 2.0</h1><p>Security boundaries passed.</p></body></html>"),
      root,
    );

    const tools = await listPluginTools("markitdown-document-studio", { markitdownRoot: root });
    expect(tools.map((tool) => tool.name)).toEqual(["convert_to_markdown"]);

    const result = await invokePluginTool(
      "markitdown-document-studio",
      "convert_to_markdown",
      { file: file.path },
      { markitdownRoot: root },
    );
    expect(result.isError).toBe(false);
    expect(JSON.stringify(result.content)).toContain("Release 2.0");
    expect(JSON.stringify(result.content)).toContain("Security boundaries passed");
  }, 120_000);

  test("preserves a representative CSV table as Markdown", async () => {
    const root = await temporaryRoot();
    const file = await uploadMarkitdownFile(
      "quality.csv",
      encoded("capability,status,evidence\ncore,passed,vitest\nweb,passed,playwright\n"),
      root,
    );
    const result = await invokePluginTool(
      "markitdown-document-studio",
      "convert_to_markdown",
      { file: file.path },
      { markitdownRoot: root },
    );
    const text = JSON.stringify(result.content);
    expect(text).toContain("capability");
    expect(text).toContain("playwright");
    expect(text).toMatch(/\|/);
    expect(await listMarkitdownFiles(root)).toHaveLength(1);
  }, 120_000);

  test("converts every advertised binary and text document family with real fixtures", async () => {
    const root = await temporaryRoot();
    const fixtureRoot = await temporaryRoot();
    const python = path.join(
      process.cwd(),
      ".venv-markitdown",
      process.platform === "win32" ? "Scripts" : "bin",
      process.platform === "win32" ? "python.exe" : "python",
    );
    await execFileAsync(python, [path.join(process.cwd(), "scripts", "create-markitdown-fixtures.py"), fixtureRoot], {
      windowsHide: true,
    });

    const fixtures = [
      ["evidence.pdf", "PDF fixture evidence"],
      ["evidence.docx", "DOCX fixture evidence"],
      ["evidence.pptx", "PPTX fixture evidence"],
      ["evidence.xlsx", "XLSX fixture evidence"],
      ["evidence.json", "JSON fixture evidence"],
      ["evidence.htm", "HTM fixture evidence"],
      ["evidence.md", "Markdown fixture evidence"],
      ["evidence.txt", "Plain text fixture evidence"],
    ] as const;

    for (const [name, marker] of fixtures) {
      const body = await readFile(path.join(fixtureRoot, name));
      const uploaded = await uploadMarkitdownFile(name, body.toString("base64"), root);
      const result = await invokePluginTool(
        "markitdown-document-studio",
        "convert_to_markdown",
        { file: uploaded.path },
        { markitdownRoot: root },
      );
      expect(result.isError, name).toBe(false);
      expect(JSON.stringify(result.content), name).toContain(marker);
    }
  }, 240_000);

  test("rejects unsupported, malformed, and URI-shaped uploads", async () => {
    const root = await temporaryRoot();
    await expect(uploadMarkitdownFile("payload.exe", encoded("MZ"), root)).rejects.toThrow(/支持 PDF/);
    await expect(uploadMarkitdownFile("fake.pdf", encoded("not a pdf"), root)).rejects.toThrow(/PDF 签名/);
    await expect(uploadMarkitdownFile("bad.txt", Buffer.from([0xff, 0xfe]).toString("base64"), root)).rejects.toThrow(/UTF-8/);
    await expect(resolveMarkitdownFileUri("../outside.txt", root)).rejects.toThrow(/工作区|沙箱/);
    for (const candidate of [
      { uri: "file:///etc/passwd" },
      { file: "C:/Windows/win.ini" },
      { file: "//server/share/secret.docx" },
      { file: "uploads/../secret.docx" },
      { file: "https://example.com/document.pdf" },
    ]) {
      await expect(
        invokePluginTool(
          "markitdown-document-studio",
          "convert_to_markdown",
          candidate,
          { markitdownRoot: root },
        ),
      ).rejects.toThrow(/参数|file|标识|工作区|字符/);
    }
    await expect(
      invokePluginTool(
        "markitdown-document-studio",
        "convert_to_markdown",
        { file: "uploads/missing.pdf" },
        { markitdownRoot: root },
      ),
    ).rejects.toThrow(/不存在/);
    await expect(uploadMarkitdownFile("large.txt", Buffer.alloc(8 * 1024 * 1024 + 1, 0x61).toString("base64"), root)).rejects.toThrow(/8 MiB/);
  });

  test("rejects Office traversal, expansion bombs, and extension confusion before conversion", async () => {
    const root = await temporaryRoot();
    const fixtureRoot = await temporaryRoot();
    const python = path.join(
      process.cwd(),
      ".venv-markitdown",
      process.platform === "win32" ? "Scripts" : "bin",
      process.platform === "win32" ? "python.exe" : "python",
    );
    await execFileAsync(python, [path.join(process.cwd(), "scripts", "create-markitdown-fixtures.py"), fixtureRoot], {
      windowsHide: true,
    });
    const cases = [
      ["traversal.docx", /不安全的内部路径/],
      ["bomb.docx", /压缩炸弹|解压后/],
      ["wrong-type.docx", /扩展名不匹配/],
    ] as const;
    for (const [name, expected] of cases) {
      const body = await readFile(path.join(fixtureRoot, name));
      await expect(uploadMarkitdownFile(name, body.toString("base64"), root)).rejects.toThrow(expected);
    }
  }, 120_000);

  test("rejects symlink escapes and bounds converted output", async () => {
    const root = await temporaryRoot();
    const outsideRoot = await temporaryRoot();
    const outside = path.join(outsideRoot, "outside.html");
    await writeFile(outside, "<h1>host secret</h1>", "utf8");
    const safe = await uploadMarkitdownFile("safe.html", encoded("<h1>safe</h1>"), root);
    const link = path.join(root, "uploads", "outside-dir");
    await symlink(outsideRoot, link, process.platform === "win32" ? "junction" : "dir");
    await expect(resolveMarkitdownFileUri("uploads/outside-dir/outside.html", root)).rejects.toThrow(/超出 MarkItDown 工作区/);

    const large = await uploadMarkitdownFile("large.txt", encoded("x".repeat(2_200_000)), root);
    await expect(
      invokePluginTool(
        "markitdown-document-studio",
        "convert_to_markdown",
        { file: large.path },
        { markitdownRoot: root },
      ),
    ).rejects.toThrow(/输出超过 2 MiB/);
    expect(safe.path).toMatch(/^uploads\//);
  }, 120_000);

  test("the shipped bootstrap disables HTTP, subprocess, proxy, plugin, and cloud credential paths", async () => {
    const python = path.join(
      process.cwd(),
      ".venv-markitdown",
      process.platform === "win32" ? "Scripts" : "bin",
      process.platform === "win32" ? "python.exe" : "python",
    );
    const bootstrap = path.join(process.cwd(), "scripts", "markitdown-mcp-entry.py");
    const result = await execFileAsync(python, [bootstrap, "--security-probe"], {
      env: {
        ...process.env,
        AZURE_TEST_SECRET: "must-be-cleared",
        HTTP_PROXY: "http://127.0.0.1:9",
        EXIFTOOL_PATH: "host-command",
        MARKITDOWN_ENABLE_PLUGINS: "true",
      },
      windowsHide: true,
    });
    expect(result.stdout.trim()).toBe("network-and-subprocess-disabled");
  }, 120_000);
});

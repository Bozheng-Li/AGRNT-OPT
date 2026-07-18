import { execFile } from "node:child_process";
import { access, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, test } from "vitest";
import type { AdapterContext, AdapterToolResult } from "@/lib/runtime/adapters";
import { docguardAdapter } from "@/lib/runtime/docguard-adapter";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

type DocGuardTestContext = AdapterContext & {
  docguardRoot: string;
  docguardPackageRoot: string;
  docguardProjectRoot?: string;
};

const projectFiles = [
  {
    path: ".docguard.json",
    content: JSON.stringify({
      projectName: "ledger-api",
      version: "1.0",
      profile: "standard",
      sourcePatterns: { routes: "src/**/*.js" },
    }, null, 2),
  },
  {
    path: "package.json",
    content: JSON.stringify({
      name: "ledger-api",
      version: "2.0.0",
      private: true,
      scripts: { test: "node --test" },
    }, null, 2),
  },
  {
    path: "README.md",
    content: "# Ledger API\n\nThe service supports 3 retries and 40 connections.\n\nSee `src/server.js`.\n",
  },
  {
    path: "docs-canonical/API-REFERENCE.md",
    content: [
      "# API Reference",
      "",
      "## Transfers",
      "",
      "The API permits 100 requests/min. See `src/server.js`.",
      "",
      "### POST /transfer",
      "Creates a transfer.",
      "",
      "Status values are PENDING, SETTLED, or FAILED.",
      "",
    ].join("\n"),
  },
  {
    path: "docs-canonical/ENVIRONMENT.md",
    content: "# Environment\n\n| Variable | Required | Description |\n| --- | --- | --- |\n| `DATABASE_URL` | Yes | Database |\n",
  },
  {
    path: ".env.example",
    content: "DATABASE_URL=postgres://localhost/ledger\nJWT_SECRET=change-me\n",
  },
  {
    path: "src/server.js",
    content: [
      "const MAX_RETRIES = 5;",
      "const MAX_CONNECTIONS = 80;",
      "const RATE_LIMIT = 250;",
      "const DATABASE_URL = process.env.DATABASE_URL;",
      "const JWT_SECRET = process.env.JWT_SECRET;",
      "const routes = ['POST /transfer', 'POST /reverse'];",
      "export { MAX_RETRIES, MAX_CONNECTIONS, RATE_LIMIT, DATABASE_URL, JWT_SECRET, routes };",
      "",
    ].join("\n"),
  },
];

async function packageRoot(): Promise<string> {
  const installed = path.join(process.cwd(), "node_modules", "docguard-cli");
  try {
    await access(path.join(installed, "package.json"));
    return installed;
  } catch {
    return path.join(process.cwd(), "var", "qualification", "docguard", "node_modules", "docguard-cli");
  }
}

async function temporaryContext(): Promise<DocGuardTestContext> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-docguard-"));
  roots.push(root);
  return { docguardRoot: root, docguardPackageRoot: await packageRoot() } as DocGuardTestContext;
}

async function invoke(
  tool: string,
  input: Record<string, unknown>,
  context: DocGuardTestContext,
) {
  const transformed = await docguardAdapter.validateAndTransform(tool, input, context);
  const launch = await docguardAdapter.prepare(context);
  const transport = new StdioClientTransport({
    ...launch,
    env: { ...getDefaultEnvironment(), ...launch.env },
    stderr: "pipe",
  });
  const client = new Client({ name: "agent-opt-docguard-test", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    let resourcesError = "";
    let promptsError = "";
    try { await client.listResources(); } catch (error) { resourcesError = String(error); }
    try { await client.listPrompts(); } catch (error) { promptsError = String(error); }
    const upstream = await client.callTool({ name: tool, arguments: transformed });
    const result = await docguardAdapter.normalizeResult!(
      tool,
      {
        content: Array.isArray(upstream.content) ? upstream.content : [],
        structuredContent: upstream.structuredContent as Record<string, unknown> | undefined,
        isError: upstream.isError === true,
      } as AdapterToolResult,
      context,
    );
    return { result, tools: listed.tools, resourcesError, promptsError, launch };
  } finally {
    await client.close().catch(() => undefined);
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("DocGuard 0.33.1 MCP integration", () => {
  test("discovers the exact read-only protocol and invokes all six tools", async () => {
    const calls = [
      ["docguard_guard", { files: projectFiles }],
      ["docguard_score", { files: projectFiles }],
      ["docguard_verify_claims", { files: projectFiles }],
      ["docguard_report", { files: projectFiles }],
      ["docguard_diagnose", { files: projectFiles }],
      ["docguard_explain", { code: "STR001" }],
    ] as const;
    const results: Record<string, Record<string, unknown>> = {};
    for (const [tool, input] of calls) {
      const invocation = await invoke(tool, input, await temporaryContext());
      expect(invocation.tools.map((item) => item.name).sort()).toEqual([
        "docguard_diagnose",
        "docguard_explain",
        "docguard_guard",
        "docguard_report",
        "docguard_score",
        "docguard_verify_claims",
      ]);
      expect(invocation.tools.every((item) => item.annotations?.readOnlyHint === true)).toBe(true);
      expect(invocation.resourcesError).toMatch(/-32601|method not found/i);
      expect(invocation.promptsError).toMatch(/-32601|method not found/i);
      expect(invocation.result.isError).toBe(false);
      results[tool] = invocation.result.structuredContent!;
    }

    expect(results.docguard_guard.status).toMatch(/WARN|FAIL/);
    expect(Number(results.docguard_guard.warnings) + Number(results.docguard_guard.errors)).toBeGreaterThan(0);
    expect(results.docguard_score.score).toEqual(expect.any(Number));
    expect(Number(results.docguard_verify_claims.claimCount)).toBeGreaterThanOrEqual(3);
    expect(results.docguard_report).toMatchObject({ tool: { name: "docguard", version: "0.33.1" } });
    expect(String(results.docguard_report.integrity)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect((results.docguard_diagnose.problems as unknown[]).length).toBeGreaterThan(0);
    expect(results.docguard_explain).toMatchObject({ code: "STR001", validator: "structure" });
    expect(JSON.stringify(results)).not.toMatch(/[A-Za-z]:\\|\/tmp\/agent-opt-docguard/);
  }, 180_000);

  test("preserves an upstream finding-code error and keeps the session usable", async () => {
    const context = await temporaryContext();
    const bad = await invoke("docguard_explain", { code: "BAD999" }, context);
    expect(bad.result.isError).toBe(true);
    expect(JSON.stringify(bad.result.content)).toMatch(/Unknown finding code|BAD999/);
    expect(JSON.stringify(bad.result.content)).not.toMatch(/[A-Za-z]:\\|\/tmp\/agent-opt-docguard/);

    const good = await invoke("docguard_explain", { code: "ENV003" }, await temporaryContext());
    expect(good.result.structuredContent).toMatchObject({ code: "ENV003", validator: "environment" });
  }, 60_000);

  test("rejects traversal, host paths, reserved trees, duplicates, extras, and oversized projects", async () => {
    const invalid: Array<Record<string, unknown>> = [
      { files: [{ path: "../host.txt", content: "x" }] },
      { files: [{ path: "C:/host.txt", content: "x" }] },
      { files: [{ path: ".git/config", content: "x" }] },
      { files: [{ path: "node_modules/pkg/index.js", content: "x" }] },
      { files: [{ path: "README.md", content: "x" }, { path: "readme.md", content: "y" }] },
      { files: [{ path: "README.md", content: "x" }], projectDir: "C:/host" },
      { files: [{ path: "README.md", content: "x".repeat(96_001) }] },
    ];
    for (const input of invalid) {
      await expect(docguardAdapter.validateAndTransform("docguard_guard", input, await temporaryContext())).rejects.toThrow();
    }
    await expect(docguardAdapter.validateAndTransform("docguard_explain", { code: "STR001", files: [] }, await temporaryContext())).rejects.toThrow();
    await expect(docguardAdapter.validateAndTransform("docguard_explain", { code: "../STR001" }, await temporaryContext())).rejects.toThrow();
  }, 60_000);

  test("rejects linked roots and proves read, write, network, process, and credential boundaries", async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), "agent-opt-docguard-target-"));
    const parent = await mkdtemp(path.join(os.tmpdir(), "agent-opt-docguard-parent-"));
    roots.push(target, parent);
    const link = path.join(parent, "runtime-link");
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    const linked = { docguardRoot: link, docguardPackageRoot: await packageRoot() } as DocGuardTestContext;
    await expect(docguardAdapter.validateAndTransform("docguard_guard", { files: projectFiles }, linked)).rejects.toThrow(/符号链接|目录联接/);

    const context = await temporaryContext();
    await docguardAdapter.validateAndTransform("docguard_guard", { files: projectFiles }, context);
    const launch = await docguardAdapter.prepare(context);
    const { stdout, stderr } = await execFileAsync(launch.command, launch.args, {
      cwd: launch.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        ...launch.env,
        AGENT_OPT_DOCGUARD_SECURITY_PROBE: "1",
        HTTPS_PROXY: "http://proxy.invalid:8080",
        NPM_TOKEN: "must-not-survive",
        OPENAI_API_KEY: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      projectReadAllowed: true,
      moduleReadAllowed: true,
      hostReadDenied: true,
      projectWriteDenied: true,
      fetchDenied: true,
      httpDenied: true,
      dnsDenied: true,
      subprocessDenied: true,
      workerDenied: true,
      proxyRemoved: true,
      credentialRemoved: true,
    });
  }, 60_000);
});

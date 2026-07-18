import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPluginAdapter } from "../src/lib/runtime/adapters";
import { InvocationValidationError } from "../src/lib/runtime/errors";
import {
  getPluginPrompt,
  invokePluginTool,
  listPluginProtocolAssets,
  listPluginTools,
  readPluginResource,
} from "../src/lib/runtime/invoke";

const execFileAsync = promisify(execFile);
const slug = "e18e-dependency-advisor";

function suggestions(result: Awaited<ReturnType<typeof invokePluginTool>>): string[] {
  const value = result.structuredContent?.suggestions;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function results(result: Awaited<ReturnType<typeof invokePluginTool>>): Array<Record<string, unknown>> {
  const value = result.structuredContent?.results;
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
}

describe("@e18e/mcp 0.0.9 bounded STDIO integration", () => {
  let temporaryRoot: string;
  let e18eRoot: string;

  beforeAll(async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-opt-e18e-"));
    e18eRoot = path.join(temporaryRoot, "runtime");
  });

  afterAll(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("discovers the three executable tools and their fixed input/output schemas", async () => {
    const tools = await listPluginTools(slug, { e18eRoot }) as Array<{
      name: string;
      inputSchema?: unknown;
      outputSchema?: unknown;
    }>;
    expect(tools.map((tool) => tool.name)).toEqual(["code-checker", "lookup-replacement", "npm-i-checker"]);

    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect(byName.get("code-checker")?.inputSchema).toMatchObject({
      type: "object",
      required: ["code"],
      properties: { code: { type: "string" } },
    });
    expect(byName.get("npm-i-checker")?.outputSchema).toMatchObject({
      type: "object",
      required: ["suggestions"],
      properties: { suggestions: { type: "array" } },
    });
    expect(byName.get("lookup-replacement")?.outputSchema).toMatchObject({
      type: "object",
      required: ["results"],
      properties: { results: { type: "array" } },
    });
  });

  it("calls every upstream tool with representative install, source, and search scenarios", async () => {
    const install = await invokePluginTool(
      slug,
      "npm-i-checker",
      { command: "pnpm add lodash moment chalk" },
      { e18eRoot },
    );
    expect(install.isError).toBe(false);
    expect(suggestions(install)).toHaveLength(3);
    expect(suggestions(install).join("\n")).toMatch(/lodash|moment|chalk/i);

    const source = await invokePluginTool(
      slug,
      "code-checker",
      {
        code: "import _ from 'lodash';\nimport moment from 'moment';\nimport chalk from 'chalk';\nexport { _, moment, chalk };\n",
      },
      { e18eRoot },
    );
    expect(source.isError).toBe(false);
    expect(suggestions(source)).toHaveLength(3);
    expect(suggestions(source).join("\n")).toContain("moment");

    const lookup = await invokePluginTool(slug, "lookup-replacement", { query: "filter" }, { e18eRoot });
    expect(lookup.isError).toBe(false);
    const lookupResults = results(lookup);
    expect(new Set(lookupResults.map((item) => item.source))).toEqual(
      new Set(["native", "micro-utility", "preferred"]),
    );
    expect(lookupResults.some((item) => item.replacement === "Array.prototype.filter")).toBe(true);
  });

  it("returns clean no-match results without inventing replacement advice", async () => {
    const install = await invokePluginTool(slug, "npm-i-checker", { command: "npm i agent-opt-no-match" }, { e18eRoot });
    const lookup = await invokePluginTool(slug, "lookup-replacement", { query: "agent-opt-no-match" }, { e18eRoot });
    expect(suggestions(install)).toEqual([]);
    expect(results(lookup)).toEqual([]);
  });

  it("discovers 117 resources, the replacement template, and the task prompt", async () => {
    const assets = await listPluginProtocolAssets(slug, { e18eRoot });
    expect(assets.resources).toHaveLength(117);
    expect(assets.resources).toContainEqual(expect.objectContaining({
      name: "moment.md",
      uri: "e18e://docs/moment.md",
      mimeType: "text/plain",
    }));
    expect(assets.resourceTemplates).toEqual([
      expect.objectContaining({ name: "replacement-docs", uriTemplate: "e18e://docs/{slug}" }),
    ]);
    expect(assets.prompts).toEqual([
      expect.objectContaining({
        name: "task",
        title: "e18e-task",
        arguments: [expect.objectContaining({ name: "task", required: true })],
      }),
    ]);
  });

  it("reads a fixed migration document and obtains the real task prompt", async () => {
    const document = await readPluginResource(slug, "e18e://docs/moment.md", { e18eRoot });
    expect(document.contents).toEqual([
      expect.objectContaining({ uri: "e18e://docs/moment.md", mimeType: "text/plain" }),
    ]);
    expect(document.contents[0]!.text).toContain("# Replacements for `Moment.js`");
    expect(document.contents[0]!.text).toContain("date-fns");

    const prompt = await getPluginPrompt(
      slug,
      "task",
      { task: "Review dependency choices before proposing code" },
      { e18eRoot },
    );
    expect(prompt.messages).toHaveLength(1);
    expect(prompt.messages[0]).toMatchObject({ role: "user", content: { type: "text" } });
    expect(prompt.messages[0]!.content.text).toContain("`npm-i-checker`");
    expect(prompt.messages[0]!.content.text).toContain("`code-checker`");
    expect(prompt.messages[0]!.content.text).toContain("Review dependency choices before proposing code");
  });

  it("executes resource-template completion through the shipped upstream process", async () => {
    const adapter = getPluginAdapter(slug)!;
    const launch = await adapter.prepare({ e18eRoot });
    const transport = new StdioClientTransport({
      ...launch,
      env: { ...getDefaultEnvironment(), ...launch.env },
      stderr: "pipe",
    });
    const client = new Client({ name: "agent-opt-e18e-test", version: "0.1.0" }, { capabilities: {} });
    try {
      await client.connect(transport);
      const completion = await client.complete({
        ref: { type: "ref/resource", uri: "e18e://docs/{slug}" },
        argument: { name: "slug", value: "mom" },
      });
      expect(completion.completion.values).toEqual(["moment.md"]);
    } finally {
      await client.close().catch(() => undefined);
    }
  });

  it("surfaces an actual upstream parser failure for malformed source", async () => {
    await expect(
      invokePluginTool(slug, "code-checker", { code: "import {" }, { e18eRoot }),
    ).rejects.toThrow(/parse error/i);
  });

  it.each([
    "npm i lodash@latest",
    "npm i ../local-package",
    "npm i https://registry.example/pkg.tgz",
    "npm i lodash --ignore-scripts",
    "npm i lodash && calc.exe",
    "powershell install lodash",
    "npm i lodash;whoami",
  ])("rejects install text with execution, version, path, flag, or network semantics: %s", async (command) => {
    await expect(invokePluginTool(slug, "npm-i-checker", { command }, { e18eRoot })).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
  });

  it.each([
    "C:\\Users\\person\\project\\index.ts",
    "../project/index.ts",
    "\\\\server\\share\\index.js",
    "/tmp/index.mjs",
    "index.ts",
  ])("rejects path-shaped source input before upstream launch: %s", async (code) => {
    await expect(invokePluginTool(slug, "code-checker", { code }, { e18eRoot })).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
  });

  it.each([
    "https://example.com/chalk",
    "../chalk",
    "chalk\\docs",
    "chalk && calc",
    "chalk\u0000",
  ])("rejects replacement queries with URL, path, control, or shell semantics: %s", async (query) => {
    await expect(invokePluginTool(slug, "lookup-replacement", { query }, { e18eRoot })).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
  });

  it("rejects unknown protocol capabilities, absent documents, and oversized bounded text", async () => {
    await expect(invokePluginTool(slug, "not-a-tool", {}, { e18eRoot })).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
    await expect(readPluginResource(slug, "file:///etc/passwd", { e18eRoot })).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
    await expect(readPluginResource(slug, "e18e://docs/not-present.md", { e18eRoot })).rejects.toThrow(
      /not in the current upstream resource index|不在上游当前资源索引/,
    );
    await expect(getPluginPrompt(slug, "other", { task: "review" }, { e18eRoot })).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
    await expect(getPluginPrompt(slug, "task", { task: "x".repeat(2_001) }, { e18eRoot })).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
    await expect(
      invokePluginTool(slug, "code-checker", { code: "x".repeat(100_001) }, { e18eRoot }),
    ).rejects.toBeInstanceOf(InvocationValidationError);
  });

  it("uses only the fixed bootstrap, bounded environment, and dedicated runtime directory", async () => {
    const adapter = getPluginAdapter(slug)!;
    const launch = await adapter.prepare({ e18eRoot });
    expect(launch.command).toBe(process.execPath);
    expect(launch.args).toEqual([
      "--max-old-space-size=256",
      expect.stringMatching(/scripts[\\/]e18e-mcp-entry\.mjs$/),
    ]);
    expect(launch.cwd).toBe(path.resolve(e18eRoot));
    expect(launch.env).toMatchObject({
      HOME: path.resolve(e18eRoot),
      USERPROFILE: path.resolve(e18eRoot),
      NODE_ENV: "production",
      NO_COLOR: "1",
    });
    expect(Object.keys(launch.env ?? {})).not.toEqual(expect.arrayContaining(["NPM_TOKEN", "NODE_AUTH_TOKEN", "GITHUB_TOKEN"]));

    const bootstrap = await readFile(path.join(process.cwd(), "scripts", "e18e-mcp-entry.mjs"), "utf8");
    expect(bootstrap).toContain("@e18e/mcp/dist/run.js");
    expect(bootstrap).toContain("network access");
    expect(bootstrap).toContain("subprocess access");
  });

  it("proves the executable bootstrap denies network, subprocess, proxy, and registry credentials", async () => {
    const bootstrap = path.join(process.cwd(), "scripts", "e18e-mcp-entry.mjs");
    const { stdout, stderr } = await execFileAsync(process.execPath, [bootstrap], {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        AGENT_OPT_E18E_SECURITY_PROBE: "1",
        HTTPS_PROXY: "http://proxy.invalid:8080",
        https_proxy: "http://proxy.invalid:8080",
        NPM_TOKEN: "must-not-survive",
        NODE_AUTH_TOKEN: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      fetchDenied: true,
      httpDenied: true,
      subprocessDenied: true,
      proxyRemoved: true,
      registryTokenRemoved: true,
    });
  });

  it("rejects a junction or symlink runtime root", async () => {
    const outside = path.join(temporaryRoot, "outside");
    const linkedRoot = path.join(temporaryRoot, "linked-runtime");
    await mkdir(outside, { recursive: true });
    await symlink(outside, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    await expect(getPluginAdapter(slug)!.prepare({ e18eRoot: linkedRoot })).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
  });
});

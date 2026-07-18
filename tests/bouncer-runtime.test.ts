import { execFile } from "node:child_process";
import { access, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, test } from "vitest";
import type { AdapterContext, AdapterToolResult } from "@/lib/runtime/adapters";
import { bouncerAdapter } from "@/lib/runtime/bouncer-adapter";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const passFiles = [
  {
    path: "app/signup/page.tsx",
    content: `export function Signup() {
  const dateOfBirth = "2000-01-01";
  const ageAssurance = "persona-id-verification";
  const parentalConsent = "guardian-consent-under-13";
  return <form>{dateOfBirth}{ageAssurance}{parentalConsent}</form>;
}`,
  },
  {
    path: "components/chat/Chat.tsx",
    content: `export function ChatControls() {
  const reportContent = () => "report message abuse";
  const blockUser = () => "mute user";
  const moderationQueue = "profanity content filter";
  return <button onClick={reportContent}>{blockUser.name}{moderationQueue}</button>;
}`,
  },
  {
    path: "app/profile/settings/ProfileSettings.tsx",
    content: `export const privacyDefaults = {
  profileVisibility: "private",
  defaultValue: true,
};
export const locationDefaults = {
  locationSharing: false,
  initialState: "off",
};`,
  },
  {
    path: "governance/dpia.md",
    content: `# Data Protection Impact Assessment (DPIA)
Our illegal content risk assessment and children's access risk assessment are reviewed quarterly.
The CSAM and CSEA escalation route sends eligible reports to NCMEC and IWF.
Community guidelines prohibit illegal content and describe enforcement under the acceptable use policy.`,
  },
];
const failFiles = [
  {
    path: "app/signup/page.tsx",
    content: `export function Signup() {
  return <label><input type="checkbox" aria-label="I am over 18" />I am over 18</label>;
}`,
  },
];

type TestContext = AdapterContext & { bouncerRoot: string; bouncerPackageRoot: string; bouncerInvocationRoot?: string };

async function packageRoot(): Promise<string> {
  const installed = path.join(process.cwd(), "node_modules", "@nugehs", "bouncer");
  try {
    await access(path.join(installed, "package.json"));
    return installed;
  } catch {
    return path.join(process.cwd(), "var", "qualification", "bouncer-runtime", "node_modules", "@nugehs", "bouncer");
  }
}

async function temporaryContext(): Promise<TestContext> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-bouncer-"));
  roots.push(root);
  return { bouncerRoot: root, bouncerPackageRoot: await packageRoot() } as TestContext;
}

async function invoke(
  tool: string,
  input: Record<string, unknown>,
  context: TestContext,
): Promise<{ result: AdapterToolResult; tools: string[]; resourcesError: string; promptsError: string }> {
  const transformed = await bouncerAdapter.validateAndTransform(tool, input, context);
  const launch = await bouncerAdapter.prepare(context);
  const transport = new StdioClientTransport({ ...launch, env: { ...getDefaultEnvironment(), ...launch.env }, stderr: "pipe" });
  const client = new Client({ name: "agent-opt-bouncer-test", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    let resourcesError = "";
    let promptsError = "";
    try {
      await client.listResources();
    } catch (error) {
      resourcesError = String(error);
    }
    try {
      await client.listPrompts();
    } catch (error) {
      promptsError = String(error);
    }
    const upstream = await client.callTool({ name: tool, arguments: transformed });
    const result = await bouncerAdapter.normalizeResult!(
      tool,
      {
        content: Array.isArray(upstream.content) ? upstream.content : [],
        structuredContent: upstream.structuredContent as Record<string, unknown> | undefined,
        isError: upstream.isError === true,
      },
      context,
    );
    return { result, tools: listed.tools.map((item) => item.name), resourcesError, promptsError };
  } finally {
    await client.close().catch(() => undefined);
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Bouncer 0.2.0 MCP integration", () => {
  test("discovers the exact protocol surface and invokes all four real tools", async () => {
    const context = await temporaryContext();
    const packs = await invoke("list_packs", {}, context);
    expect(packs.tools.sort()).toEqual(["compliance_check", "explain_rule", "list_packs", "list_rules"]);
    expect(packs.resourcesError).toMatch(/-32601|method not found/i);
    expect(packs.promptsError).toMatch(/-32601|method not found/i);
    expect((packs.result.structuredContent as { packs: unknown[] }).packs).toHaveLength(5);
    expect(packs.result.structuredContent).toMatchObject({
      packs: expect.arrayContaining([
        expect.objectContaining({ id: "uk-osa", rules: 7, builtin: true }),
        expect.objectContaining({ id: "uk-aadc", rules: 7, builtin: true }),
      ]),
    });

    const rules = await invoke("list_rules", { adapter: "next", packs: ["uk-osa", "uk-aadc"] }, context);
    expect((rules.result.structuredContent as { rules: unknown[] }).rules).toHaveLength(14);
    expect(JSON.stringify(rules.result.structuredContent)).toContain("osa.age-assurance-highly-effective");

    const explanation = await invoke(
      "explain_rule",
      { adapter: "next", packs: ["uk-aadc"], ruleId: "aadc.geolocation-default-off" },
      context,
    );
    expect(explanation.result.structuredContent).toMatchObject({
      packId: "uk-aadc",
      id: "aadc.geolocation-default-off",
      authority: "ICO — UK GDPR / Data Protection Act 2018",
    });
    expect(JSON.stringify(explanation.result.structuredContent)).toMatch(/locationSharing|must all co-occur/);

    const check = await invoke(
      "compliance_check",
      { adapter: "next", packs: ["uk-osa", "uk-aadc"], status: "all", files: passFiles },
      context,
    );
    expect(check.result.isError).toBe(false);
    expect(check.result.structuredContent).toMatchObject({
      totals: { pass: 14, fail: 0, unknown: 0 },
      score: 100,
      meta: { adapter: "next", repo: "inline://project", filesScanned: 4 },
    });
    expect(context.bouncerInvocationRoot).toBeUndefined();
  }, 120_000);

  test("distinguishes a complete control set from failures and unknown surfaces", async () => {
    const context = await temporaryContext();
    const passing = await invoke(
      "compliance_check",
      { adapter: "next", packs: ["uk-aadc"], status: "all", files: passFiles },
      context,
    );
    expect(passing.result.structuredContent).toMatchObject({ totals: { pass: 7, fail: 0, unknown: 0 }, score: 100 });

    const failing = await invoke(
      "compliance_check",
      { adapter: "next", packs: ["uk-aadc"], status: "all", files: failFiles },
      context,
    );
    const payload = failing.result.structuredContent as {
      totals: { pass: number; fail: number; unknown: number };
      findings: Array<{ ruleId: string; status: string }>;
    };
    expect(payload.totals.fail).toBeGreaterThan(0);
    expect(payload.totals.unknown).toBeGreaterThan(0);
    expect(payload.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "aadc.self-declared-age-insufficient", status: "fail" }),
        expect.objectContaining({ ruleId: "aadc.high-privacy-default", status: "unknown" }),
      ]),
    );
  }, 90_000);

  test("preserves controlled upstream errors for unknown fixed rule ids", async () => {
    const context = await temporaryContext();
    const error = await invoke(
      "explain_rule",
      { adapter: "next", packs: ["uk-aadc"], ruleId: "aadc.not-a-real-rule" },
      context,
    );
    expect(error.result.isError).toBe(true);
    expect(JSON.stringify(error.result.content)).toContain("Rule not found");
    expect(JSON.stringify(error.result.content)).not.toMatch(/[A-Z]:\\|\/tmp\//);
  });

  test("rejects host paths, URLs, commands, custom config, unsafe files and oversized projects before launch", async () => {
    const context = await temporaryContext();
    for (const input of [
      { config: "C:/host/bouncer.config.json", files: passFiles },
      { path: "/etc/passwd", files: passFiles },
      { url: "https://example.com/repo", files: passFiles },
      { command: "git clone https://example.com/repo", files: passFiles },
      { adapter: "next", packs: ["uk-osa"], status: "all", files: [{ path: "../escape.ts", content: "x" }] },
      { adapter: "next", packs: ["uk-osa"], status: "all", files: [{ path: "https://example.com/a.ts", content: "x" }] },
      { adapter: "next", packs: ["uk-osa"], status: "all", files: [{ path: "app/a.ts", content: "x" }, { path: "APP/A.ts", content: "y" }] },
      { adapter: "next", packs: ["uk-osa"], status: "bogus", files: passFiles },
      { adapter: "next", packs: ["ng-ndpc"], status: "all", files: passFiles },
    ]) {
      await expect(bouncerAdapter.validateAndTransform("compliance_check", input, context)).rejects.toThrow();
    }
    await expect(
      bouncerAdapter.validateAndTransform(
        "compliance_check",
        {
          adapter: "next",
          packs: ["uk-osa"],
          status: "all",
          files: Array.from({ length: 49 }, (_, index) => ({ path: `app/${index}.ts`, content: "x" })),
        },
        context,
      ),
    ).rejects.toThrow(/48/);
    await expect(
      bouncerAdapter.validateAndTransform(
        "compliance_check",
        {
          adapter: "next",
          packs: ["uk-osa"],
          status: "all",
          files: Array.from({ length: 6 }, (_, index) => ({ path: `app/${index}.ts`, content: "x".repeat(31_000) })),
        },
        context,
      ),
    ).rejects.toThrow(/180 KiB/);
    await expect(
      bouncerAdapter.validateAndTransform(
        "explain_rule",
        { adapter: "next", packs: ["uk-aadc"], ruleId: "ng.rule" },
        context,
      ),
    ).rejects.toThrow(/UK OSA|AADC/);
  });

  test("rejects a linked runtime root and proves the executable process sandbox", async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), "agent-opt-bouncer-target-"));
    const parent = await mkdtemp(path.join(os.tmpdir(), "agent-opt-bouncer-parent-"));
    roots.push(target, parent);
    const link = path.join(parent, "runtime-link");
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    const linkedContext = { bouncerRoot: link, bouncerPackageRoot: await packageRoot() } as TestContext;
    await expect(bouncerAdapter.validateAndTransform("list_packs", {}, linkedContext)).rejects.toThrow(/符号链接|目录联接/);

    const sandbox = await mkdtemp(path.join(os.tmpdir(), "agent-opt-bouncer-probe-"));
    roots.push(sandbox);
    await writeProbeConfig(sandbox);
    const bootstrap = path.join(process.cwd(), "scripts", "bouncer-mcp-entry.mjs");
    const { stdout, stderr } = await execFileAsync(process.execPath, [bootstrap], {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        AGENT_OPT_BOUNCER_SECURITY_PROBE: "1",
        AGENT_OPT_BOUNCER_SANDBOX_ROOT: sandbox,
        AGENT_OPT_BOUNCER_PACKAGE_ROOT: await packageRoot(),
        HTTPS_PROXY: "http://proxy.invalid:8080",
        https_proxy: "http://proxy.invalid:8080",
        NPM_TOKEN: "must-not-survive",
        AWS_ACCESS_KEY_ID: "must-not-survive",
        OPENAI_API_KEY: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      sandboxReadAllowed: true,
      packageReadAllowed: true,
      hostReadDenied: true,
      filesystemWriteDenied: true,
      fetchDenied: true,
      httpDenied: true,
      dnsDenied: true,
      subprocessDenied: true,
      workerDenied: true,
      oversizedResponseDenied: true,
      proxyRemoved: true,
      credentialRemoved: true,
    });
  }, 60_000);
});

async function writeProbeConfig(root: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(root, "bouncer.config.json"), "{}\n", "utf8");
}

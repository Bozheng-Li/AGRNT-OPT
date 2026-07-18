import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import type { AdapterContext } from "@/lib/runtime/adapters";
import { invokePluginTool, listPluginTools } from "@/lib/runtime/invoke";

const roots: string[] = [];
const execFileAsync = promisify(execFile);

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-dcv-"));
  roots.push(root);
  return root;
}

function context(root: string): AdapterContext {
  return { designConstraintRoot: root } as AdapterContext;
}

const failingTokens = {
  color: {
    text: { $value: "#777777" },
    surface: { $value: "#ffffff" },
    action: { $value: "{color.text}" },
  },
  spacing: {
    sm: { $value: 8 },
    md: { $value: "{spacing.sm}" },
  },
};

const passingTokens = {
  color: {
    text: { $value: "#222222" },
    surface: { $value: "#ffffff" },
    action: { $value: "{color.text}" },
  },
  spacing: {
    sm: { $value: 16 },
    md: { $value: 24 },
  },
};

const constraints = {
  enableBuiltInWcagDefaults: false,
  enableBuiltInThreshold: false,
  wcag: [{ foreground: "color.text", background: "color.surface", ratio: 4.5, description: "Body text" }],
  thresholds: [{ id: "spacing.sm", op: ">=", valuePx: 12, where: "Interactive spacing", level: "error" }],
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Design Constraint Validator MCP integration", () => {
  test("discovers and invokes all six upstream tools in a complete design-token review loop", async () => {
    const root = await temporaryRoot();
    const runtimeContext = context(root);
    const tools = await listPluginTools("design-constraint-studio", runtimeContext);
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      ["validate", "why", "graph", "list-constraints", "explain", "suggest-fix"].sort(),
    );

    const validation = await invokePluginTool(
      "design-constraint-studio",
      "validate",
      { tokens: failingTokens, constraints },
      runtimeContext,
    );
    expect(validation.isError).toBe(false);
    const validationJson = validation.structuredContent as Record<string, unknown>;
    expect(validationJson.ok).toBe(false);
    const violations = validationJson.violations as Array<Record<string, unknown>>;
    expect(violations.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(violations)).toMatch(/wcag|contrast/i);
    expect(JSON.stringify(violations)).toMatch(/threshold|spacing\.sm/i);

    const why = await invokePluginTool(
      "design-constraint-studio",
      "why",
      { tokens: failingTokens, tokenId: "color.action" },
      runtimeContext,
    );
    expect(why.isError).toBe(false);
    expect(JSON.stringify(why.structuredContent)).toContain("color.text");

    const graph = await invokePluginTool(
      "design-constraint-studio",
      "graph",
      { tokens: failingTokens, format: "json" },
      runtimeContext,
    );
    expect(graph.isError).toBe(false);
    expect(graph.structuredContent).toMatchObject({ ok: true });
    expect(JSON.stringify(graph.structuredContent)).toContain("color.action");

    const listed = await invokePluginTool(
      "design-constraint-studio",
      "list-constraints",
      { tokens: failingTokens, constraints },
      runtimeContext,
    );
    expect(listed.isError).toBe(false);
    expect(Number((listed.structuredContent as { meta?: { count?: number } }).meta?.count)).toBeGreaterThanOrEqual(2);

    const wcagViolation = violations.find((item) => /wcag|contrast/i.test(String(item.ruleId))) ?? violations[0];
    const explained = await invokePluginTool(
      "design-constraint-studio",
      "explain",
      { tokens: failingTokens, constraints, violation: wcagViolation },
      runtimeContext,
    );
    expect(explained.isError).toBe(false);
    expect(explained.structuredContent).toMatchObject({ ok: true });
    expect(JSON.stringify(explained.structuredContent)).toMatch(/contrast|foreground|background/i);

    const suggested = await invokePluginTool(
      "design-constraint-studio",
      "suggest-fix",
      { tokens: failingTokens, constraints, violation: wcagViolation, target: "foreground" },
      runtimeContext,
    );
    expect(suggested.isError).toBe(false);
    expect(suggested.structuredContent).toMatchObject({ ok: true });
    expect(JSON.stringify(suggested.structuredContent)).toMatch(/candidate|value|foreground|verified/i);
  }, 180_000);

  test("distinguishes failing and passing representative WCAG and threshold scenarios", async () => {
    const root = await temporaryRoot();
    const runtimeContext = context(root);
    const failing = await invokePluginTool(
      "design-constraint-studio",
      "validate",
      { tokens: failingTokens, constraints },
      runtimeContext,
    );
    const passing = await invokePluginTool(
      "design-constraint-studio",
      "validate",
      { tokens: passingTokens, constraints },
      runtimeContext,
    );
    expect((failing.structuredContent as { ok?: boolean }).ok).toBe(false);
    expect((passing.structuredContent as { ok?: boolean }).ok).toBe(true);
  }, 90_000);

  test("rejects every upstream filesystem entry point and bounded-JSON abuse before launch", async () => {
    const root = await temporaryRoot();
    const runtimeContext = context(root);
    for (const input of [
      { tokensPath: "C:/host/tokens.json", constraints },
      { tokens: failingTokens, constraints, configPath: "../dcv.config.json" },
      { tokens: failingTokens, constraints, constraintsDir: "//server/share" },
      { tokens: failingTokens, constraints, unknown: true },
    ]) {
      await expect(invokePluginTool("design-constraint-studio", "validate", input, runtimeContext)).rejects.toThrow(/参数|Unrecognized|unrecognized/i);
    }

    let deep: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < 16; index += 1) deep = { nested: deep };
    await expect(
      invokePluginTool("design-constraint-studio", "graph", { tokens: deep }, runtimeContext),
    ).rejects.toThrow(/嵌套深度/);

    const polluted = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    await expect(
      invokePluginTool("design-constraint-studio", "graph", { tokens: polluted }, runtimeContext),
    ).rejects.toThrow(/原型相关键/);
  });

  test("rejects a symlinked runtime root", async () => {
    const target = await temporaryRoot();
    const parent = await temporaryRoot();
    const link = path.join(parent, "runtime-link");
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    await expect(listPluginTools("design-constraint-studio", context(link))).rejects.toThrow(/符号链接/);
  });

  test("uses a fixed bootstrap that denies network, subprocess, proxy and credential access", async () => {
    const bootstrap = path.join(process.cwd(), "scripts", "design-constraint-mcp-entry.mjs");
    const { stdout, stderr } = await execFileAsync(process.execPath, [bootstrap], {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        AGENT_OPT_DCV_SECURITY_PROBE: "1",
        HTTPS_PROXY: "http://proxy.invalid:8080",
        https_proxy: "http://proxy.invalid:8080",
        NPM_TOKEN: "must-not-survive",
        AWS_ACCESS_KEY_ID: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      fetchDenied: true,
      httpDenied: true,
      subprocessDenied: true,
      proxyRemoved: true,
      credentialRemoved: true,
    });
  });
});

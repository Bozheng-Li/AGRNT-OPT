import { execFile } from "node:child_process";
import { access, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, test } from "vitest";
import type { AdapterContext, AdapterToolResult } from "@/lib/runtime/adapters";
import { uxloomAdapter } from "@/lib/runtime/uxloom-adapter";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

type UxloomTestContext = AdapterContext & {
  uxloomRoot: string;
  uxloomPackageRoot: string;
  uxloomSessionRoot?: string;
  uxloomProjectPath?: string;
};

const incompleteScreen = {
  id: "payment",
  intent: "Collect payment with minimum anxiety",
  requiredStates: ["default", "loading", "error", "success"],
  designedStates: ["default"],
  platforms: ["web", "mweb"],
  components: [{
    id: "pay",
    semantic: "Button.Primary",
    interactive: true,
    minTargetPx: 32,
    label: { key: "checkout.pay", en: "Pay now", maxChars: 12 },
    fg: "#777777",
    bg: "#ffffff",
  }],
};

const completeScreen = {
  ...incompleteScreen,
  designedStates: ["default", "loading", "error", "success"],
  exemptions: [{ state: "empty", reason: "Payment fields are always rendered and cannot be empty." }],
  components: [{
    id: "pay",
    semantic: "Button.Primary",
    interactive: true,
    minTargetPx: 48,
    label: { key: "checkout.pay", en: "Pay now", maxChars: 18 },
    fg: "#ffffff",
    bg: "#1d4ed8",
  }],
};

const checkoutJourney = {
  id: "checkout",
  goal: "Place an order",
  entry: "cart",
  states: {
    cart: { screen: "cart", on: { CONTINUE: "payment" } },
    payment: { screen: "payment", on: { SUCCESS: "done", FAILURE: "payment#error" } },
    done: { screen: "confirmation", final: true },
  },
};

async function packageRoot(): Promise<string> {
  const installed = path.join(process.cwd(), "node_modules", "uxloom");
  try {
    await access(path.join(installed, "package.json"));
    return installed;
  } catch {
    return path.join(process.cwd(), "var", "qualification", "uxloom", "node_modules", "uxloom");
  }
}

async function temporaryContext(): Promise<UxloomTestContext> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-uxloom-"));
  roots.push(root);
  return { uxloomRoot: root, uxloomPackageRoot: await packageRoot() } as UxloomTestContext;
}

async function invoke(tool: string, input: Record<string, unknown>, context: UxloomTestContext) {
  const transformed = await uxloomAdapter.validateAndTransform(tool, input, context);
  const launch = await uxloomAdapter.prepare(context);
  const transport = new StdioClientTransport({ ...launch, env: { ...getDefaultEnvironment(), ...launch.env }, stderr: "pipe" });
  const client = new Client({ name: "agent-opt-uxloom-test", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    let resourcesError = "";
    let promptsError = "";
    try { await client.listResources(); } catch (error) { resourcesError = String(error); }
    try { await client.listPrompts(); } catch (error) { promptsError = String(error); }
    const upstream = await client.callTool({ name: tool, arguments: transformed });
    const result = await uxloomAdapter.normalizeResult!(
      tool,
      {
        content: Array.isArray(upstream.content) ? upstream.content : [],
        structuredContent: upstream.structuredContent as Record<string, unknown> | undefined,
        isError: upstream.isError === true,
      } as AdapterToolResult,
      context,
    );
    return { result, tools: listed.tools.map((item) => item.name), resourcesError, promptsError, launch };
  } finally {
    await client.close().catch(() => undefined);
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("UXLoom 0.1.3 MCP integration", () => {
  test("discovers the exact protocol and invokes all eight tools across ephemeral processes", async () => {
    const context = await temporaryContext();
    const sessionId = randomUUID();
    const initialized = await invoke("project_init", { sessionId, name: "Checkout Studio", platforms: ["web", "mweb"] }, context);
    expect(initialized.tools.sort()).toEqual([
      "brief_answer", "brief_start", "coverage_report", "journey_define", "project_init", "project_validate", "screen_critique", "screen_register",
    ]);
    expect(initialized.resourcesError).toMatch(/-32601|method not found/i);
    expect(initialized.promptsError).toMatch(/-32601|method not found/i);
    expect(initialized.result.structuredContent).toMatchObject({
      ok: true,
      path: "session://project",
      project: { name: "Checkout Studio", formatVersion: "0.1", platforms: ["web", "mweb"], journeys: [], screens: [] },
    });

    const questions = await invoke("brief_start", { sessionId, prompt: "Design a resilient checkout." }, context);
    expect((questions.result.structuredContent as { inputRequests: unknown[] }).inputRequests).toHaveLength(5);
    expect(questions.result.structuredContent).toMatchObject({ resultType: "inputRequired" });

    const brief = await invoke("brief_answer", {
      sessionId,
      prompt: "Design a resilient checkout.",
      answers: { platforms: ["web", "mweb"], offline: true, brand: null },
    }, context);
    expect((brief.result.structuredContent as { brief: { assumptionLedger: unknown[] } }).brief.assumptionLedger).toHaveLength(3);

    const journey = await invoke("journey_define", { sessionId, journey: checkoutJourney }, context);
    expect(journey.result.structuredContent).toEqual({ ok: true, journeys: ["checkout"] });

    const screen = await invoke("screen_register", { sessionId, screen: incompleteScreen }, context);
    expect(screen.result.structuredContent).toEqual({ ok: true, screens: ["payment"] });

    const report = await invoke("project_validate", { sessionId }, context);
    expect(report.result.isError).toBe(false);
    expect((report.result.structuredContent as { summary: { errors: number } }).summary.errors).toBeGreaterThan(0);

    const scoped = await invoke("screen_critique", { sessionId, screenId: "payment" }, context);
    expect((scoped.result.structuredContent as { findings: unknown[] }).findings.length).toBeGreaterThan(0);

    const coverage = await invoke("coverage_report", { sessionId }, context);
    expect(coverage.result.structuredContent).toMatchObject({
      perScreen: [{ screen: "payment", required: 4, designed: 1, missing: ["loading", "error", "success"] }],
    });
    expect(String(coverage.result.structuredContent?.headline)).toContain("3 required states not yet designed");
  }, 120_000);

  test("reports missing states, contrast and target failures, then clears the repaired screen", async () => {
    const context = await temporaryContext();
    const sessionId = randomUUID();
    await invoke("project_init", { sessionId, name: "Checkout Studio", platforms: ["web", "mweb"] }, context);
    await invoke("journey_define", { sessionId, journey: checkoutJourney }, context);
    await invoke("screen_register", { sessionId, screen: incompleteScreen }, context);

    const failing = await invoke("screen_critique", { sessionId, screenId: "payment" }, context);
    const failingJson = JSON.stringify(failing.result.structuredContent);
    expect(failingJson).toMatch(/state-undesigned/);
    expect(failingJson).toMatch(/contrast/);
    expect(failingJson).toMatch(/touch-target/);
    expect(failingJson).toContain("4.48");
    expect(failingJson).toContain("32px");

    await invoke("screen_register", { sessionId, screen: completeScreen }, context);
    const repaired = await invoke("screen_critique", { sessionId, screenId: "payment" }, context);
    expect(repaired.result.structuredContent).toEqual({ screenId: "payment", findings: [] });
    const coverage = await invoke("coverage_report", { sessionId }, context);
    expect(coverage.result.structuredContent).toMatchObject({
      perScreen: [{ screen: "payment", required: 4, designed: 4, missing: [] }],
    });
  }, 120_000);

  test("preserves a real missing-project error and rejects unsafe or oversized public inputs", async () => {
    const context = await temporaryContext();
    const sessionId = randomUUID();
    const missing = await invoke("project_validate", { sessionId }, context);
    expect(missing.result.isError).toBe(true);
    expect(JSON.stringify(missing.result.content)).toMatch(/No project|project_init/);
    expect(JSON.stringify(missing.result.content)).not.toMatch(/[A-Za-z]:\\|\/tmp\/agent-opt-uxloom/);

    const invalidInputs: Array<[string, Record<string, unknown>]> = [
      ["project_init", { sessionId: "../escape", name: "x", platforms: ["web"] }],
      ["project_init", { sessionId, name: "x", platforms: ["web"], path: "C:/host/project.json" }],
      ["brief_start", { sessionId, prompt: "x", UXLOOM_PROJECT: "/etc/passwd" }],
      ["brief_answer", { sessionId, prompt: "x", answers: { constructor: "pollute" } }],
      ["journey_define", { sessionId, journey: { ...checkoutJourney, states: {} } }],
      ["screen_register", { sessionId, screen: { ...incompleteScreen, designedStates: ["not-required"] } }],
      ["screen_register", { sessionId, screen: { ...incompleteScreen, components: [{ semantic: "Button", fg: "url(https://example.com)" }] } }],
      ["screen_critique", { sessionId, screenId: "../host" }],
    ];
    for (const [tool, input] of invalidInputs) {
      await expect(uxloomAdapter.validateAndTransform(tool, input, context)).rejects.toThrow();
    }
    await expect(uxloomAdapter.validateAndTransform("brief_start", { sessionId, prompt: "x".repeat(6_001) }, context)).rejects.toThrow();
  }, 60_000);

  test("rejects linked roots and proves exact-file write, read, process and network boundaries", async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), "agent-opt-uxloom-target-"));
    const parent = await mkdtemp(path.join(os.tmpdir(), "agent-opt-uxloom-parent-"));
    roots.push(target, parent);
    const link = path.join(parent, "runtime-link");
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    const linkedContext = { uxloomRoot: link, uxloomPackageRoot: await packageRoot() } as UxloomTestContext;
    await expect(uxloomAdapter.validateAndTransform("project_init", {
      sessionId: randomUUID(), name: "Linked", platforms: ["web"],
    }, linkedContext)).rejects.toThrow(/符号链接|目录联接/);

    const context = await temporaryContext();
    const sessionId = randomUUID();
    await invoke("project_init", { sessionId, name: "Probe", platforms: ["web"] }, context);
    await uxloomAdapter.validateAndTransform("project_validate", { sessionId }, context);
    const launch = await uxloomAdapter.prepare(context);
    const { stdout, stderr } = await execFileAsync(launch.command, launch.args, {
      cwd: launch.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        ...launch.env,
        AGENT_OPT_UXLOOM_SECURITY_PROBE: "1",
        HTTPS_PROXY: "http://proxy.invalid:8080",
        NPM_TOKEN: "must-not-survive",
        OPENAI_API_KEY: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      projectReadAllowed: true,
      projectWriteAllowed: true,
      moduleReadAllowed: true,
      hostReadDenied: true,
      otherWriteDenied: true,
      oversizedProjectWriteDenied: true,
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

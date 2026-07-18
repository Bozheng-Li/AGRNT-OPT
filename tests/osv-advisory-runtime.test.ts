import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import type { AdapterContext } from "@/lib/runtime/adapters";
import {
  OSV_ADVISORY_BATCH_LIMIT,
  OSV_ADVISORY_RESULT_LIMIT,
  osvAdvisoryAdapter,
  validatedOsvDeploymentProxy,
} from "@/lib/runtime/osv-advisory-adapter";
import { invokePluginTool, listPluginTools } from "@/lib/runtime/invoke";

const roots: string[] = [];
const execFileAsync = promisify(execFile);

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-osv-"));
  roots.push(root);
  return root;
}

function context(root: string): AdapterContext {
  return { osvAdvisoryRoot: root } as AdapterContext;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OSV Advisory MCP integration", () => {
  test("discovers the exact four-tool protocol and retrieves a known advisory through the real STDIO server", async () => {
    const runtimeContext = context(await temporaryRoot());
    const tools = await listPluginTools("osv-advisory-studio", runtimeContext);
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "osv_get_vulnerability",
      "osv_list_ecosystems",
      "osv_query_batch",
      "osv_query_package",
    ]);

    const ecosystems = await invokePluginTool("osv-advisory-studio", "osv_list_ecosystems", {}, runtimeContext);
    expect(ecosystems.isError).toBe(false);
    const ecosystemList = ecosystems.structuredContent?.ecosystems as string[];
    expect(ecosystemList).toHaveLength(50);
    expect(ecosystemList).toEqual(expect.arrayContaining(["npm", "PyPI", "crates.io", "GIT", "Ubuntu"]));

    const query = await invokePluginTool(
      "osv-advisory-studio",
      "osv_query_package",
      { name: "lodash", ecosystem: "npm", version: "4.17.20" },
      runtimeContext,
    );
    expect(query.isError).toBe(false);
    expect(query.structuredContent?.truncated).toBe(false);
    expect(query.structuredContent?.queryMeta).toMatchObject({
      package: "lodash",
      ecosystem: "npm",
      version: "4.17.20",
    });
    const findings = query.structuredContent?.vulns as Array<Record<string, unknown>>;
    expect(findings.some((finding) => finding.id === "GHSA-29mw-wpgm-hmr9")).toBe(true);
    expect(JSON.stringify(findings)).toContain("4.17.21");

    const detail = await invokePluginTool(
      "osv-advisory-studio",
      "osv_get_vulnerability",
      { id: "GHSA-29mw-wpgm-hmr9" },
      runtimeContext,
    );
    expect(detail.isError).toBe(false);
    expect(detail.structuredContent).toMatchObject({
      id: "GHSA-29mw-wpgm-hmr9",
      severityLabel: "MODERATE",
    });
    expect(detail.structuredContent?.aliases).toContain("CVE-2020-28500");
    expect((detail.structuredContent?.affected as unknown[]).length).toBeGreaterThan(0);
    expect((detail.structuredContent?.references as unknown[]).length).toBeGreaterThan(0);
  }, 120_000);

  test("distinguishes a no-known-match result and a mixed representative batch", async () => {
    const runtimeContext = context(await temporaryRoot());
    const clean = await invokePluginTool(
      "osv-advisory-studio",
      "osv_query_package",
      { name: "is-number", ecosystem: "npm", version: "7.0.0" },
      runtimeContext,
    );
    expect(clean.isError).toBe(false);
    expect(clean.structuredContent).toMatchObject({ truncated: false });
    expect(clean.structuredContent?.vulns).toEqual([]);
    expect(String(clean.structuredContent?.notice)).toMatch(/No known vulnerabilities/);

    const batch = await invokePluginTool(
      "osv-advisory-studio",
      "osv_query_batch",
      {
        packages: [
          { name: "lodash", ecosystem: "npm", version: "4.17.20" },
          { name: "is-number", ecosystem: "npm", version: "7.0.0" },
        ],
      },
      runtimeContext,
    );
    expect(batch.isError).toBe(false);
    expect(batch.structuredContent?.summary).toMatchObject({
      totalPackages: 2,
      vulnerableCount: 1,
      cleanCount: 1,
      truncatedCount: 0,
      errorCount: 0,
    });
    const rows = batch.structuredContent?.results as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ name: "lodash", vulnerable: true, error: null });
    expect(rows[1]).toMatchObject({ name: "is-number", vulnerable: false, truncated: false, error: null });
  }, 120_000);

  test("surfaces the upstream unknown-advisory protocol failure and rejects unsafe or expansive input before launch", async () => {
    const runtimeContext = context(await temporaryRoot());
    await expect(
      invokePluginTool(
        "osv-advisory-studio",
        "osv_get_vulnerability",
        { id: "AGENT-OPT-NOT-A-REAL-OSV-ID" },
        runtimeContext,
      ),
    ).rejects.toThrow(/Structured content does not match|output schema|required property/i);

    for (const [tool, input] of [
      ["osv_query_package", { name: "https://example.com/pkg", ecosystem: "npm", version: "1.0.0" }],
      ["osv_query_package", { name: "lodash;whoami", ecosystem: "npm", version: "4.17.20" }],
      ["osv_query_package", { name: "lodash", ecosystem: "pypi", version: "4.17.20" }],
      ["osv_query_package", { name: "lodash", ecosystem: "npm", version: "^4.17.20" }],
      ["osv_query_package", { name: "lodash", ecosystem: "npm", version: "4.17.20", baseUrl: "https://example.com" }],
      ["osv_get_vulnerability", { id: "../../etc/passwd" }],
      ["osv_list_ecosystems", { host: "api.osv.dev" }],
    ] as const) {
      await expect(invokePluginTool("osv-advisory-studio", tool, input, runtimeContext)).rejects.toThrow();
    }

    await expect(
      invokePluginTool(
        "osv-advisory-studio",
        "osv_query_batch",
        {
          packages: Array.from({ length: OSV_ADVISORY_BATCH_LIMIT + 1 }, (_, index) => ({
            name: `package-${index}`,
            ecosystem: "npm",
            version: "1.0.0",
          })),
        },
        runtimeContext,
      ),
    ).rejects.toThrow(/12|Too big|最多/i);
  }, 60_000);

  test("rejects oversized upstream output and a linked runtime root", async () => {
    await expect(
      osvAdvisoryAdapter.normalizeResult?.(
        "osv_get_vulnerability",
        {
          content: [{ type: "text", text: "x".repeat(OSV_ADVISORY_RESULT_LIMIT) }],
          structuredContent: {},
          isError: false,
        },
        {},
      ),
    ).rejects.toThrow(/1.5 MiB/);

    const target = await temporaryRoot();
    const parent = await temporaryRoot();
    const link = path.join(parent, "runtime-link");
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    await expect(listPluginTools("osv-advisory-studio", context(link))).rejects.toThrow(/符号链接|联接点|重定向目录/);
  });

  test("uses a fixed-origin bootstrap that denies redirect, credential, network, and process bypasses", async () => {
    expect(validatedOsvDeploymentProxy({ HTTPS_PROXY: "http://proxy.example:8080" })).toBe(
      "http://proxy.example:8080/",
    );
    expect(validatedOsvDeploymentProxy({})).toBeUndefined();
    for (const environment of [
      { HTTPS_PROXY: "socks5://proxy.example:1080" },
      { HTTPS_PROXY: "https://user:secret@proxy.example" },
      { HTTPS_PROXY: "https://proxy.example/tunnel" },
      { HTTPS_PROXY: "https://proxy.example?target=other" },
      { HTTPS_PROXY: "https://first.example", https_proxy: "https://second.example" },
    ]) {
      expect(() => validatedOsvDeploymentProxy(environment)).toThrow(/代理|proxy/i);
    }

    const bootstrap = path.join(process.cwd(), "scripts", "osv-advisory-mcp-entry.mjs");
    const { stdout, stderr } = await execFileAsync(process.execPath, [bootstrap], {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        AGENT_OPT_OSV_SECURITY_PROBE: "1",
        HTTPS_PROXY: "http://proxy.invalid:8080",
        https_proxy: "http://proxy.invalid:8080",
        NPM_TOKEN: "must-not-survive",
        AWS_ACCESS_KEY_ID: "must-not-survive",
        OPENAI_API_KEY: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      fixedOriginAccepted: true,
      redirectForced: true,
      customHostDenied: true,
      customPathDenied: true,
      credentialHeaderDenied: true,
      httpDenied: true,
      subprocessDenied: true,
      proxyRemoved: true,
      credentialRemoved: true,
    });
  });
});

import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, test } from "vitest";
import type { AdapterContext, AdapterToolResult } from "@/lib/runtime/adapters";
import { starfetchAdapter, validatedStarfetchProxy } from "@/lib/runtime/starfetch-adapter";

const execFileAsync = promisify(execFile);

type StarfetchTestContext = AdapterContext & { starfetchPackageRoot: string };

async function packageRoot(): Promise<string> {
  const installed = path.join(process.cwd(), "node_modules", "@starfetch-js", "mcp");
  try {
    await access(path.join(installed, "package.json"));
    return installed;
  } catch {
    return path.join(process.cwd(), "var", "qualification", "starfetch", "node_modules", "@starfetch-js", "mcp");
  }
}

async function context(): Promise<StarfetchTestContext> {
  return { starfetchPackageRoot: await packageRoot() } as StarfetchTestContext;
}

async function connected(rawContext: StarfetchTestContext) {
  const launch = await starfetchAdapter.prepare(rawContext);
  const transport = new StdioClientTransport({
    ...launch,
    env: { ...getDefaultEnvironment(), ...launch.env },
    stderr: "pipe",
  });
  const client = new Client({ name: "agent-opt-starfetch-test", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, launch };
}

async function invoke(tool: string, input: Record<string, unknown>, suppliedContext?: StarfetchTestContext) {
  const rawContext = suppliedContext ?? await context();
  const transformed = await starfetchAdapter.validateAndTransform(tool, input, rawContext);
  const { client, launch } = await connected(rawContext);
  try {
    const upstream = await client.callTool(
      { name: tool, arguments: transformed },
      undefined,
      { timeout: 120_000, maxTotalTimeout: 120_000 },
    );
    const result = await starfetchAdapter.normalizeResult!(
      tool,
      {
        content: Array.isArray(upstream.content) ? upstream.content : [],
        structuredContent: upstream.structuredContent as Record<string, unknown> | undefined,
        isError: upstream.isError === true,
      } as AdapterToolResult,
      rawContext,
    );
    return { result, launch };
  } finally {
    await client.close().catch(() => undefined);
  }
}

describe("Starfetch 0.2.3 MCP integration", () => {
  test("discovers and invokes all twelve tools across metadata, sync query, and Gaia async lifecycle", async () => {
    const protocol = await connected(await context());
    let jobId = "";
    try {
      const tools = await protocol.client.listTools();
      expect(tools.tools.map((item) => item.name)).toEqual([
        "starfetch_list_presets",
        "starfetch_registry_search",
        "starfetch_tap_availability",
        "starfetch_tap_capabilities",
        "starfetch_tap_tables",
        "starfetch_tap_columns",
        "starfetch_tap_query",
        "starfetch_tap_submit_job",
        "starfetch_tap_job_status",
        "starfetch_tap_job_wait",
        "starfetch_tap_job_fetch",
        "starfetch_tap_job_delete",
      ]);
      expect(tools.tools.slice(0, 7).every((item) => item.annotations?.readOnlyHint === true)).toBe(true);
      expect(tools.tools.find((item) => item.name === "starfetch_tap_job_delete")?.annotations?.destructiveHint).toBe(true);

      const resources = await protocol.client.listResources();
      expect(resources.resources.map((item) => item.uri)).toEqual([
        "starfetch://guides/adql",
        "starfetch://guides/tap-metadata",
        "starfetch://services/gaia",
        "starfetch://services/simbad",
        "starfetch://examples/proper-motion",
      ]);
      const prompts = await protocol.client.listPrompts();
      expect(prompts.prompts.map((item) => item.name)).toEqual([
        "query_astronomy_catalog",
        "explore_service",
        "run_cone_search",
        "troubleshoot_adql",
      ]);
    } finally {
      await protocol.client.close().catch(() => undefined);
    }

    const presets = await invoke("starfetch_list_presets", {});
    expect((presets.result.structuredContent?.data as unknown[])).toHaveLength(5);
    expect(JSON.stringify(presets.result.structuredContent)).toContain("NASA Exoplanet Archive");

    const registry = await invoke("starfetch_registry_search", { query: "Gaia", maxrec: 2 });
    expect((registry.result.structuredContent?.data as unknown[]).length).toBeGreaterThan(0);

    const availability = await invoke("starfetch_tap_availability", { service: "exoplanetarchive" });
    expect(availability.result.structuredContent?.data).toMatchObject({ available: true });

    const capabilities = await invoke("starfetch_tap_capabilities", { service: "exoplanetarchive" });
    expect(capabilities.result.structuredContent?.data).toMatchObject({ auth: "anonymous", languages: ["ADQL"] });

    const tables = await invoke("starfetch_tap_tables", { service: "exoplanetarchive" });
    expect((tables.result.structuredContent?.data as Array<{ name: string }>).some((item) => item.name === "ps")).toBe(true);

    const columns = await invoke("starfetch_tap_columns", { service: "exoplanetarchive", table: "ps" });
    expect((columns.result.structuredContent?.data as Array<{ name: string }>).some((item) => item.name === "pl_name")).toBe(true);

    const sync = await invoke("starfetch_tap_query", {
      service: "exoplanetarchive",
      format: "json",
      maxrec: 3,
      query: "SELECT TOP 3 pl_name, hostname, disc_year FROM ps ORDER BY disc_year DESC",
    });
    const syncData = sync.result.structuredContent?.data as { content: string; format: string };
    expect(syncData.format).toBe("json");
    expect(JSON.parse(syncData.content)).toHaveLength(3);
    expect(syncData.content).toContain("pl_name");

    try {
      const submitted = await invoke("starfetch_tap_submit_job", {
        service: "gaia",
        format: "csv",
        maxrec: 1,
        query: "SELECT TOP 1 source_id, ra, dec FROM gaiadr3.gaia_source",
      });
      const submittedData = submitted.result.structuredContent?.data as { id: string; url: string };
      jobId = submittedData.id;
      expect(jobId).toMatch(/^[A-Za-z0-9._~-]+$/);
      expect(submittedData.url).toMatch(/^https:\/\/gea\.esac\.esa\.int\/tap-server\/tap\/async\//);

      const status = await invoke("starfetch_tap_job_status", { service: "gaia", jobIdOrUrl: jobId });
      expect((status.result.structuredContent?.data as { phase: string }).phase).toMatch(/PENDING|QUEUED|EXECUTING|COMPLETED/);

      const waited = await invoke("starfetch_tap_job_wait", {
        service: "gaia",
        jobIdOrUrl: jobId,
        intervalMs: 1_000,
        timeoutMs: 60_000,
        maxIntervalMs: 4_000,
        backoff: true,
      });
      expect(waited.result.structuredContent?.data).toMatchObject({ phase: "COMPLETED" });

      const fetched = await invoke("starfetch_tap_job_fetch", {
        service: "gaia",
        jobIdOrUrl: jobId,
        format: "json",
        sourceFormat: "csv",
      });
      const fetchedData = fetched.result.structuredContent?.data as { content: string };
      expect(JSON.parse(fetchedData.content)).toHaveLength(1);
      expect(fetchedData.content).toContain("source_id");

      const deleted = await invoke("starfetch_tap_job_delete", { service: "gaia", jobIdOrUrl: jobId });
      expect(deleted.result.structuredContent?.data).toMatchObject({ deleted: true, id: jobId });
      jobId = "";
    } finally {
      if (jobId) await invoke("starfetch_tap_job_delete", { service: "gaia", jobIdOrUrl: jobId }).catch(() => undefined);
    }
  }, 300_000);

  test("reads all five resources and materializes all four prompts", async () => {
    const { client } = await connected(await context());
    try {
      const resources = await client.listResources();
      for (const item of resources.resources) {
        expect(await starfetchAdapter.validateResourceUri!(item.uri, await context())).toBe(item.uri);
        const response = await client.readResource({ uri: item.uri });
        expect(JSON.stringify(response).length).toBeGreaterThan(400);
      }

      const promptInputs: Record<string, Record<string, unknown>> = {
        query_astronomy_catalog: { question: "Find high proper-motion stars near the Pleiades", service: "gaia" },
        explore_service: { service: "gaia", topic: "proper motion" },
        run_cone_search: { service: "gaia", ra: 56.75, dec: 24.12, radius: 0.5 },
        troubleshoot_adql: { service: "gaia", query: "SELECT TOP 3 source_id FROM gaiadr3.gaia_source", error: "unknown column" },
      };
      for (const [name, input] of Object.entries(promptInputs)) {
        const transformed = await starfetchAdapter.validatePromptAndTransform!(name, input, await context());
        const response = await client.getPrompt({ name, arguments: transformed as Record<string, string> });
        expect(response.messages).toHaveLength(1);
        expect(JSON.stringify(response)).toContain("Starfetch");
      }
    } finally {
      await client.close().catch(() => undefined);
    }
  }, 60_000);

  test("preserves a real TAP error and rejects arbitrary network, upload, unbounded ADQL, and job semantics", async () => {
    const failure = await invoke("starfetch_tap_query", {
      service: "exoplanetarchive",
      format: "json",
      maxrec: 1,
      query: "SELECT TOP 1 definitely_missing FROM definitely_missing_table",
    });
    expect(failure.result.isError).toBe(true);
    expect(JSON.stringify(failure.result.content)).toMatch(/TAP|table|missing|error/i);

    const invalid: Array<[string, Record<string, unknown>]> = [
      ["starfetch_tap_availability", { url: "https://example.com/tap" }],
      ["starfetch_registry_search", { query: "Gaia", registryUrl: "https://example.com/tap" }],
      ["starfetch_tap_query", { service: "gaia", format: "json", maxrec: 1, query: "SELECT source_id FROM gaiadr3.gaia_source" }],
      ["starfetch_tap_query", { service: "gaia", format: "json", maxrec: 1, query: "SELECT TOP 51 source_id FROM gaiadr3.gaia_source" }],
      ["starfetch_tap_query", { service: "gaia", format: "json", maxrec: 1, query: "SELECT TOP 1 source_id FROM gaiadr3.gaia_source; DROP TABLE x" }],
      ["starfetch_tap_query", { service: "gaia", format: "json", maxrec: 1, query: "SELECT TOP 1 source_id FROM gaiadr3.gaia_source", uploads: [{ uri: "https://example.com/x" }] }],
      ["starfetch_tap_job_status", { service: "gaia", jobIdOrUrl: "https://gea.esac.esa.int/tap-server/tap/async/x" }],
      ["starfetch_tap_job_wait", { service: "gaia", jobIdOrUrl: "x", intervalMs: 1, timeoutMs: 100_000 }],
      ["starfetch_tap_columns", { service: "gaia", table: "../host" }],
    ];
    for (const [tool, input] of invalid) {
      await expect(starfetchAdapter.validateAndTransform(tool, input, await context())).rejects.toThrow();
    }
  }, 90_000);

  test("validates proxy configuration and proves fixed-origin network and process boundaries", async () => {
    expect(validatedStarfetchProxy({})).toBeUndefined();
    expect(validatedStarfetchProxy({ HTTPS_PROXY: "http://proxy.example:8080" })).toBe("http://proxy.example:8080/");
    expect(() => validatedStarfetchProxy({ HTTPS_PROXY: "http://user:pass@proxy.example" })).toThrow();
    expect(() => validatedStarfetchProxy({ HTTPS_PROXY: "http://a.example", https_proxy: "http://b.example" })).toThrow();

    const launch = await starfetchAdapter.prepare(await context());
    const { stdout, stderr } = await execFileAsync(launch.command, launch.args, {
      cwd: launch.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        ...launch.env,
        AGENT_OPT_STARFETCH_SECURITY_PROBE: "1",
        HTTPS_PROXY: "http://proxy.invalid:8080",
        NPM_TOKEN: "must-not-survive",
        OPENAI_API_KEY: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      fixedTapAccepted: true,
      customHostDenied: true,
      customPathDenied: true,
      httpDenied: true,
      credentialHeaderDenied: true,
      hostReadDenied: true,
      writeDenied: true,
      subprocessDenied: true,
      workerDenied: true,
      proxyRemoved: true,
      credentialRemoved: true,
    });
  }, 60_000);
});

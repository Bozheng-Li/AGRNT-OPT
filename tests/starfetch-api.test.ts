import { describe, expect, test } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";

type InvokeBody =
  | { operation: "tool"; tool: string; arguments: Record<string, unknown> }
  | { operation: "resource"; uri: string }
  | { operation: "prompt"; prompt: string; arguments: Record<string, unknown> };

async function request(body: InvokeBody) {
  return POST(
    new Request("http://localhost/api/plugins/starfetch-astronomy-lab/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug: "starfetch-astronomy-lab" }) },
  );
}

async function invoke(tool: string, args: Record<string, unknown>) {
  return request({ operation: "tool", tool, arguments: args });
}

describe("Starfetch public API", () => {
  test("runs all twelve real tools through bounded public TAP routes", async () => {
    let jobId = "";
    try {
      const presets = await invoke("starfetch_list_presets", {});
      expect(presets.status).toBe(200);
      const presetsJson = await presets.json();
      expect(presetsJson.plugin).toBe("io.github.starfetch-js/starfetch");
      expect(presetsJson.result.structuredContent.data).toHaveLength(5);

      const registry = await invoke("starfetch_registry_search", { query: "Gaia", maxrec: 2 });
      expect(registry.status).toBe(200);
      expect((await registry.json()).result.structuredContent.data.length).toBeGreaterThan(0);

      const availability = await invoke("starfetch_tap_availability", { service: "exoplanetarchive" });
      expect(availability.status).toBe(200);
      expect((await availability.json()).result.structuredContent.data.available).toBe(true);

      const capabilities = await invoke("starfetch_tap_capabilities", { service: "exoplanetarchive" });
      expect(capabilities.status).toBe(200);
      expect((await capabilities.json()).result.structuredContent.data).toMatchObject({
        auth: "anonymous",
        languages: ["ADQL"],
      });

      const tables = await invoke("starfetch_tap_tables", { service: "exoplanetarchive" });
      expect(tables.status).toBe(200);
      expect((await tables.json()).result.structuredContent.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "ps" })]),
      );

      const columns = await invoke("starfetch_tap_columns", { service: "exoplanetarchive", table: "ps" });
      expect(columns.status).toBe(200);
      expect((await columns.json()).result.structuredContent.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "pl_name" })]),
      );

      const sync = await invoke("starfetch_tap_query", {
        service: "exoplanetarchive",
        format: "json",
        maxrec: 3,
        query: "SELECT TOP 3 pl_name, hostname, disc_year FROM ps ORDER BY disc_year DESC",
      });
      expect(sync.status).toBe(200);
      const syncJson = await sync.json();
      expect(JSON.parse(syncJson.result.structuredContent.data.content)).toHaveLength(3);
      expect(syncJson.result.structuredContent.diagnostics).toMatchObject({
        query: expect.stringContaining("SELECT TOP 3"),
        effectiveMaxrec: 3,
      });

      const submitted = await invoke("starfetch_tap_submit_job", {
        service: "gaia",
        format: "csv",
        maxrec: 1,
        query: "SELECT TOP 1 source_id, ra, dec FROM gaiadr3.gaia_source",
      });
      expect(submitted.status).toBe(200);
      const submittedJson = await submitted.json();
      jobId = submittedJson.result.structuredContent.data.id;
      expect(jobId).toMatch(/^[A-Za-z0-9._~-]+$/);

      const status = await invoke("starfetch_tap_job_status", { service: "gaia", jobIdOrUrl: jobId });
      expect(status.status).toBe(200);
      expect((await status.json()).result.structuredContent.data.phase).toMatch(/PENDING|QUEUED|EXECUTING|COMPLETED/);

      const waited = await invoke("starfetch_tap_job_wait", {
        service: "gaia",
        jobIdOrUrl: jobId,
        intervalMs: 1_000,
        timeoutMs: 60_000,
        maxIntervalMs: 4_000,
        backoff: true,
      });
      expect(waited.status).toBe(200);
      expect((await waited.json()).result.structuredContent.data.phase).toBe("COMPLETED");

      const fetched = await invoke("starfetch_tap_job_fetch", {
        service: "gaia",
        jobIdOrUrl: jobId,
        format: "json",
        sourceFormat: "csv",
      });
      expect(fetched.status).toBe(200);
      const fetchedJson = await fetched.json();
      expect(JSON.parse(fetchedJson.result.structuredContent.data.content)).toHaveLength(1);
      expect(fetchedJson.result.structuredContent.data.content).toContain("source_id");

      const deleted = await invoke("starfetch_tap_job_delete", { service: "gaia", jobIdOrUrl: jobId });
      expect(deleted.status).toBe(200);
      expect((await deleted.json()).result.structuredContent.data).toMatchObject({ deleted: true, id: jobId });
      jobId = "";
    } finally {
      if (jobId) await invoke("starfetch_tap_job_delete", { service: "gaia", jobIdOrUrl: jobId }).catch(() => undefined);
    }
  }, 360_000);

  test("reads all five resources and materializes all four prompts", async () => {
    const resourceUris = [
      "starfetch://guides/adql",
      "starfetch://guides/tap-metadata",
      "starfetch://services/gaia",
      "starfetch://services/simbad",
      "starfetch://examples/proper-motion",
    ];
    for (const uri of resourceUris) {
      const response = await request({ operation: "resource", uri });
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.result.contents[0].uri).toBe(uri);
      expect(payload.result.contents[0].text.length).toBeGreaterThan(300);
    }

    const prompts: Record<string, Record<string, unknown>> = {
      query_astronomy_catalog: { question: "Find high proper-motion stars near the Pleiades", service: "gaia" },
      explore_service: { service: "gaia", topic: "proper motion" },
      run_cone_search: { service: "gaia", ra: 56.75, dec: 24.12, radius: 0.5 },
      troubleshoot_adql: {
        service: "gaia",
        query: "SELECT TOP 3 source_id FROM gaiadr3.gaia_source",
        error: "unknown column",
      },
    };
    for (const [prompt, args] of Object.entries(prompts)) {
      const response = await request({ operation: "prompt", prompt, arguments: args });
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.result.messages).toHaveLength(1);
      expect(JSON.stringify(payload.result)).toContain("Starfetch");
    }
  }, 90_000);

  test("preserves a controlled TAP failure and rejects caller-selected network or unbounded query semantics", async () => {
    const failure = await invoke("starfetch_tap_query", {
      service: "exoplanetarchive",
      format: "json",
      maxrec: 1,
      query: "SELECT TOP 1 definitely_missing FROM definitely_missing_table",
    });
    expect(failure.status).toBe(200);
    const failureJson = await failure.json();
    expect(failureJson.result.isError).toBe(true);
    expect(JSON.stringify(failureJson.result)).toMatch(/TAP|table|missing|error/i);

    const invalid: Array<[string, Record<string, unknown>]> = [
      ["starfetch_tap_availability", { url: "https://example.com/tap" }],
      ["starfetch_registry_search", { query: "Gaia", registryUrl: "https://example.com/tap" }],
      ["starfetch_tap_query", { service: "gaia", format: "json", maxrec: 1, query: "SELECT source_id FROM gaiadr3.gaia_source" }],
      ["starfetch_tap_query", { service: "gaia", format: "json", maxrec: 1, query: "SELECT TOP 51 source_id FROM gaiadr3.gaia_source" }],
      ["starfetch_tap_query", { service: "gaia", format: "json", maxrec: 1, query: "SELECT TOP 1 source_id FROM gaiadr3.gaia_source; DROP TABLE x" }],
      ["starfetch_tap_query", { service: "gaia", format: "json", maxrec: 1, query: "SELECT TOP 1 source_id FROM gaiadr3.gaia_source", uploads: [{ uri: "https://example.com/x" }] }],
      ["starfetch_tap_job_status", { service: "gaia", jobIdOrUrl: "https://gea.esac.esa.int/tap-server/tap/async/x" }],
      ["starfetch_tap_columns", { service: "gaia", table: "../host" }],
    ];
    for (const [tool, args] of invalid) {
      const response = await invoke(tool, args);
      expect(response.status).toBe(400);
    }

    const unsafeResource = await request({ operation: "resource", uri: "https://example.com/guide" });
    expect(unsafeResource.status).toBe(400);
    const unsafePrompt = await request({
      operation: "prompt",
      prompt: "run_cone_search",
      arguments: { service: "gaia", ra: 56.75, dec: 24.12, radius: 0.5, url: "https://example.com" },
    });
    expect(unsafePrompt.status).toBe(400);
  }, 120_000);
});

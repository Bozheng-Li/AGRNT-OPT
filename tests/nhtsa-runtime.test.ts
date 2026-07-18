import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, test } from "vitest";
import type { AdapterContext } from "@/lib/runtime/adapters";
import {
  NHTSA_COMPLAINT_LIMIT,
  NHTSA_LOOKUP_LIMIT,
  NHTSA_RESULT_LIMIT,
  NHTSA_VIN_BATCH_LIMIT,
  nhtsaAdapter,
} from "@/lib/runtime/nhtsa-adapter";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
type NhtsaTestContext = AdapterContext & { nhtsaRoot: string; nhtsaPackageRoot?: string };

async function context(): Promise<NhtsaTestContext> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-nhtsa-"));
  roots.push(root);
  return { nhtsaRoot: root };
}

async function connected(runtimeContext: NhtsaTestContext) {
  const launch = await nhtsaAdapter.prepare(runtimeContext);
  const transport = new StdioClientTransport({
    ...launch,
    env: { ...getDefaultEnvironment(), ...launch.env },
    stderr: "pipe",
  });
  const client = new Client({ name: "agent-opt-nhtsa-test", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, launch };
}

async function invoke(client: Client, tool: string, input: Record<string, unknown>, runtimeContext: NhtsaTestContext) {
  const transformed = await nhtsaAdapter.validateAndTransform(tool, input, runtimeContext);
  const upstream = await client.callTool(
    { name: tool, arguments: transformed },
    undefined,
    { timeout: 90_000, maxTotalTimeout: 90_000 },
  );
  return nhtsaAdapter.normalizeResult!(tool, {
    content: Array.isArray(upstream.content) ? upstream.content : [],
    structuredContent: upstream.structuredContent as Record<string, unknown> | undefined,
    isError: upstream.isError === true,
  }, runtimeContext);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("NHTSA vehicle safety MCP 0.8.4 integration", () => {
  test("discovers the pinned server and runs all six public vehicle-safety workflows against NHTSA", async () => {
    const runtimeContext = await context();
    const protocol = await connected(runtimeContext);
    try {
      const tools = await protocol.client.listTools();
      expect(tools.tools.map((item) => item.name)).toEqual([
        "nhtsa_get_vehicle_safety",
        "nhtsa_search_recalls",
        "nhtsa_search_complaints",
        "nhtsa_get_safety_ratings",
        "nhtsa_decode_vin",
        "nhtsa_search_investigations",
        "nhtsa_lookup_vehicles",
      ]);
      expect(tools.tools.every((item) => item.annotations?.readOnlyHint === true)).toBe(true);
      expect(nhtsaAdapter.allowedTools).toEqual([
        "nhtsa_get_vehicle_safety",
        "nhtsa_search_recalls",
        "nhtsa_search_complaints",
        "nhtsa_get_safety_ratings",
        "nhtsa_decode_vin",
        "nhtsa_lookup_vehicles",
      ]);
      expect(nhtsaAdapter.allowedTools).not.toContain("nhtsa_search_investigations");
      expect(nhtsaAdapter.requestTimeoutMs?.("nhtsa_lookup_vehicles")).toBe(100_000);
      expect((await protocol.client.listResources()).resources).toEqual([]);
      expect((await protocol.client.listResourceTemplates()).resourceTemplates).toEqual([]);
      expect((await protocol.client.listPrompts()).prompts).toEqual([]);

      const vehicles = await invoke(protocol.client, "nhtsa_lookup_vehicles", {
        operation: "models", make: "HONDA", modelYear: 2020, limit: 10, offset: 0,
      }, runtimeContext);
      expect(vehicles.structuredContent).toMatchObject({ operation: "models", returned: 10, limit: 10 });
      expect(vehicles.structuredContent?.models).toEqual(expect.arrayContaining([
        expect.objectContaining({ modelName: "Civic", makeName: "HONDA" }),
      ]));

      const decoded = await invoke(protocol.client, "nhtsa_decode_vin", { vin: "1HGCM82633A004352" }, runtimeContext);
      expect(decoded.structuredContent?.vehicles).toEqual([
        expect.objectContaining({ vin: "1HGCM82633A004352", make: "HONDA", model: "Accord", modelYear: "2003", errorCode: "0" }),
      ]);

      const batchVins = ["1HGCM82633A004352", "1M8GDM9AXKP042788"];
      const decodedBatch = await invoke(protocol.client, "nhtsa_decode_vin", { vin: batchVins }, runtimeContext);
      expect((decodedBatch.structuredContent?.vehicles as Array<{ vin: string }>).map((item) => item.vin)).toEqual(batchVins);

      const recall = await invoke(protocol.client, "nhtsa_search_recalls", { campaignNumber: "24v064000" }, runtimeContext);
      expect(recall.structuredContent).toMatchObject({ totalCount: 1, effectiveQuery: "24V064000" });
      expect(recall.structuredContent?.recalls).toEqual([
        expect.objectContaining({ campaignNumber: "24V064000", manufacturer: expect.stringContaining("Honda") }),
      ]);

      const complaints = await invoke(protocol.client, "nhtsa_search_complaints", {
        make: "HONDA", model: "CIVIC", modelYear: 2020, limit: 2, offset: 0,
      }, runtimeContext);
      expect(Number(complaints.structuredContent?.totalCount)).toBeGreaterThan(0);
      expect(complaints.structuredContent).toMatchObject({ returned: 2, limit: 2, offset: 0 });
      expect(complaints.structuredContent?.componentBreakdown).toEqual([]);
      expect((complaints.structuredContent?.complaints as Array<Record<string, unknown>>).every((item) => !("dateOfIncident" in item))).toBe(true);

      const ratings = await invoke(protocol.client, "nhtsa_get_safety_ratings", {
        make: "HONDA", model: "CIVIC", modelYear: 2020,
      }, runtimeContext);
      expect(ratings.structuredContent?.ratings).toEqual(expect.arrayContaining([
        expect.objectContaining({ vehicleId: 14819, overallRating: "5" }),
        expect.objectContaining({ vehicleId: 14483, overallRating: "5" }),
      ]));

      const profile = await invoke(protocol.client, "nhtsa_get_vehicle_safety", {
        make: "HONDA", model: "CIVIC", modelYear: 2020,
      }, runtimeContext);
      expect(profile.structuredContent?.sectionStatus).toEqual({ safetyRatings: "available", recalls: "available", complaints: "available" });
      expect(profile.structuredContent?.recalls).toEqual(expect.arrayContaining([
        expect.objectContaining({ campaignNumber: "24V064000" }),
      ]));
      expect(profile.structuredContent?.complaintSummary).toEqual(expect.objectContaining({
        totalCount: expect.any(Number), componentBreakdown: [],
      }));
    } finally {
      await protocol.client.close().catch(() => undefined);
    }
  }, 180_000);

  test("preserves real empty and not-found states while rejecting misleading or oversized public inputs", async () => {
    const runtimeContext = await context();
    const protocol = await connected(runtimeContext);
    try {
      const empty = await invoke(protocol.client, "nhtsa_lookup_vehicles", {
        operation: "models", make: "ZZZNONEXISTENT", modelYear: 2020, limit: 5, offset: 0,
      }, runtimeContext);
      expect(empty.structuredContent).toMatchObject({ operation: "models", totalCount: 0, returned: 0, notice: expect.any(String) });

      const missingRating = await invoke(protocol.client, "nhtsa_get_safety_ratings", { vehicleId: 100_000_000 }, runtimeContext);
      expect(missingRating.structuredContent).toMatchObject({ ratings: [], notice: expect.any(String) });

      const missingCampaign = await invoke(protocol.client, "nhtsa_search_recalls", { campaignNumber: "99V999999" }, runtimeContext);
      expect(missingCampaign.isError).toBe(true);
      expect(String((missingCampaign.content[0] as { text?: unknown }).text)).toMatch(/No recall|campaign/i);
    } finally {
      await protocol.client.close().catch(() => undefined);
    }

    const tooManyVins = Array.from({ length: NHTSA_VIN_BATCH_LIMIT + 1 }, (_, index) => `1HGCM82633A0043${String(index).padStart(2, "0")}`);
    const invalid: Array<[string, Record<string, unknown>]> = [
      ["nhtsa_get_vehicle_safety", { make: "HONDA", model: "CIVIC", modelYear: 2020, baseUrl: "https://example.com" }],
      ["nhtsa_get_vehicle_safety", { make: "../HONDA", model: "CIVIC", modelYear: 2020 }],
      ["nhtsa_get_vehicle_safety", { make: "HONDA", model: "CIVIC", modelYear: 1980 }],
      ["nhtsa_search_recalls", { campaignNumber: "24V064000", make: "HONDA", model: "CIVIC", modelYear: 2020 }],
      ["nhtsa_search_recalls", { make: "HONDA", model: "CIVIC" }],
      ["nhtsa_search_recalls", { campaignNumber: "24V64" }],
      ["nhtsa_search_recalls", { make: "HONDA", model: "CIVIC", modelYear: 2020, dateRange: {} }],
      ["nhtsa_search_recalls", { make: "HONDA", model: "CIVIC", modelYear: 2020, dateRange: { after: "2025-02-30" } }],
      ["nhtsa_search_recalls", { make: "HONDA", model: "CIVIC", modelYear: 2020, dateRange: { after: "2025-03-01", before: "2025-02-01" } }],
      ["nhtsa_search_complaints", { make: "HONDA", model: "CIVIC", modelYear: 2020, limit: NHTSA_COMPLAINT_LIMIT + 1 }],
      ["nhtsa_search_complaints", { make: "HONDA", model: "CIVIC", modelYear: 2020, offset: 10_001 }],
      ["nhtsa_search_complaints", { make: "HONDA", model: "CIVIC", modelYear: 2020, component: "AIR BAGS" }],
      ["nhtsa_get_safety_ratings", { vehicleId: 14819, make: "HONDA", model: "CIVIC", modelYear: 2020 }],
      ["nhtsa_get_safety_ratings", { make: "HONDA", model: "CIVIC", modelYear: 1989 }],
      ["nhtsa_decode_vin", { vin: "1HGCM82633A00435I" }],
      ["nhtsa_decode_vin", { vin: tooManyVins }],
      ["nhtsa_decode_vin", { vin: ["1HGCM82633A004352", "1HGCM82633A004352"] }],
      ["nhtsa_lookup_vehicles", { operation: "models", limit: 10 }],
      ["nhtsa_lookup_vehicles", { operation: "makes", make: "HONDA", limit: 10 }],
      ["nhtsa_lookup_vehicles", { operation: "vehicle_types", make: "HONDA" }],
      ["nhtsa_lookup_vehicles", { operation: "manufacturer", manufacturer: "HONDA", make: "HONDA" }],
      ["nhtsa_lookup_vehicles", { operation: "makes", limit: NHTSA_LOOKUP_LIMIT + 1 }],
      ["nhtsa_search_investigations", { make: "HONDA" }],
      ["unknown_tool", {}],
    ];
    for (const [tool, input] of invalid) await expect(nhtsaAdapter.validateAndTransform(tool, input, runtimeContext)).rejects.toThrow();

    await expect(nhtsaAdapter.normalizeResult!("nhtsa_decode_vin", {
      content: [], structuredContent: { vehicles: [{ vin: "x" }] }, isError: false,
    }, runtimeContext)).rejects.toThrow(/0\.8\.4/);
    await expect(nhtsaAdapter.normalizeResult!("nhtsa_get_vehicle_safety", {
      content: [],
      structuredContent: {
        safetyRatings: [],
        recalls: [],
        complaintSummary: {
          totalCount: 0, componentBreakdown: [{ component: "FUEL SYSTEM", count: 0, crashCount: 0, fireCount: 0, injuryCount: 0, deathCount: 0 }],
          crashCount: 0, fireCount: 0, injuryCount: 0, deathCount: 0,
        },
        sectionStatus: { safetyRatings: "unavailable", recalls: "available", complaints: "available" },
        warnings: [],
      },
      isError: false,
    }, runtimeContext)).rejects.toThrow(/车辆查找|确认车型/);
    await expect(nhtsaAdapter.normalizeResult!("nhtsa_decode_vin", {
      content: [{ type: "text", text: "x".repeat(NHTSA_RESULT_LIMIT) }], structuredContent: {}, isError: false,
    }, runtimeContext)).rejects.toThrow(/2 MiB/);
  }, 120_000);

  test("enforces exact package, Node 24, linked-root, fixed-origin, and no-credential process boundaries", async () => {
    expect(Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10)).toBe(24);

    const target = await mkdtemp(path.join(os.tmpdir(), "agent-opt-nhtsa-target-"));
    const parent = await mkdtemp(path.join(os.tmpdir(), "agent-opt-nhtsa-parent-"));
    roots.push(target, parent);
    const link = path.join(parent, "runtime-link");
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    await expect(nhtsaAdapter.prepare({ nhtsaRoot: link } as NhtsaTestContext)).rejects.toThrow(/符号链接|目录联接|实体目录/);

    const fakePackage = await mkdtemp(path.join(os.tmpdir(), "agent-opt-nhtsa-package-"));
    roots.push(fakePackage);
    await mkdir(path.join(fakePackage, "dist"));
    await Promise.all([
      writeFile(path.join(fakePackage, "package.json"), JSON.stringify({ name: "@cyanheads/nhtsa-vehicle-safety-mcp-server", version: "0.8.3" })),
      writeFile(path.join(fakePackage, "dist", "index.js"), "export {};\n"),
    ]);
    const fakeContext = await context();
    fakeContext.nhtsaPackageRoot = fakePackage;
    await expect(nhtsaAdapter.prepare(fakeContext)).rejects.toThrow(/0\.8\.4|lockfile/);

    const runtimeContext = await context();
    const launch = await nhtsaAdapter.prepare(runtimeContext);
    expect(launch.args).toEqual(["--max-old-space-size=256", expect.stringMatching(/nhtsa-mcp-entry\.mjs$/)]);
    expect(launch.env).toMatchObject({
      MCP_TRANSPORT_TYPE: "stdio", STORAGE_PROVIDER_TYPE: "in-memory", IS_SERVERLESS: "true", OTEL_ENABLED: "false", NODE_USE_ENV_PROXY: "0",
    });
    const { stdout, stderr } = await execFileAsync(launch.command, launch.args, {
      cwd: launch.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        ...launch.env,
        AGENT_OPT_NHTSA_SECURITY_PROBE: "1",
        NHTSA_BASE_URL: "http://127.0.0.1:9",
        VPIC_BASE_URL: "https://example.com",
        HTTPS_PROXY: "http://proxy.invalid:8080",
        NODE_USE_ENV_PROXY: "1",
        NPM_TOKEN: "must-not-survive",
        OPENAI_API_KEY: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      packagePinned: true,
      node24: true,
      apiOriginAccepted: true,
      vpicOriginAccepted: true,
      batchPostAccepted: true,
      redirectForced: true,
      investigationDownloadDenied: true,
      customHostDenied: true,
      customPathDenied: true,
      vehicleTypesPathDenied: true,
      customQueryDenied: true,
      methodDenied: true,
      oversizedBatchDenied: true,
      requestObjectDenied: true,
      credentialHeaderDenied: true,
      hostReadDenied: true,
      hostOpenDenied: true,
      hostDirectoryDenied: true,
      writeDenied: true,
      subprocessDenied: true,
      workerDenied: true,
      proxyRemoved: true,
      credentialRemoved: true,
      customEndpointEnvRemoved: true,
    });
  }, 60_000);
});

import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, test } from "vitest";
import type { AdapterContext } from "@/lib/runtime/adapters";
import {
  EARTHQUAKE_RESULT_LIMIT,
  EARTHQUAKE_SEARCH_LIMIT,
  EARTHQUAKE_PUBLIC_FEED_URIS,
  earthquakeAdapter,
} from "@/lib/runtime/earthquake-adapter";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const tiers = ["all", "1.0", "2.5", "4.5", "significant"];
const windows = ["hour", "day", "week", "month"];
const feedUris = tiers.flatMap((tier) => windows.map((window) => `earthquake://feed/${tier}/${window}`));

type EarthquakeTestContext = AdapterContext & { earthquakeRoot: string };

async function context(): Promise<EarthquakeTestContext> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-earthquake-"));
  roots.push(root);
  return { earthquakeRoot: root };
}

async function connected(runtimeContext: EarthquakeTestContext) {
  const launch = await earthquakeAdapter.prepare(runtimeContext);
  const transport = new StdioClientTransport({
    ...launch,
    env: { ...getDefaultEnvironment(), ...launch.env },
    stderr: "pipe",
  });
  const client = new Client({ name: "agent-opt-earthquake-test", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, launch };
}

async function invoke(
  client: Client,
  tool: string,
  input: Record<string, unknown>,
  runtimeContext: EarthquakeTestContext,
) {
  const transformed = await earthquakeAdapter.validateAndTransform(tool, input, runtimeContext);
  const upstream = await client.callTool(
    { name: tool, arguments: transformed },
    undefined,
    { timeout: 60_000, maxTotalTimeout: 60_000 },
  );
  return earthquakeAdapter.normalizeResult!(
    tool,
    {
      content: Array.isArray(upstream.content) ? upstream.content : [],
      structuredContent: upstream.structuredContent as Record<string, unknown> | undefined,
      isError: upstream.isError === true,
    },
    runtimeContext,
  );
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Earthquake MCP 0.1.16 integration", () => {
  test("discovers four tools, all twenty resources and both templates, then runs USGS and EMSC historical scenarios", async () => {
    expect(earthquakeAdapter.slug).toBe("earthquake-situation-lab");
    const runtimeContext = await context();
    const protocol = await connected(runtimeContext);
    try {
      const tools = await protocol.client.listTools();
      expect(tools.tools.map((item) => item.name)).toEqual([
        "earthquake_get_feed",
        "earthquake_search",
        "earthquake_get_event",
        "earthquake_count",
      ]);
      expect(tools.tools.every((item) => item.annotations?.readOnlyHint === true && item.annotations?.idempotentHint === true)).toBe(true);

      const resources = await protocol.client.listResources();
      expect(resources.resources.map((item) => item.uri)).toEqual(feedUris);
      expect(EARTHQUAKE_PUBLIC_FEED_URIS).toHaveLength(15);
      for (const uri of EARTHQUAKE_PUBLIC_FEED_URIS) {
        await expect(earthquakeAdapter.validateResourceUri!(uri, runtimeContext)).resolves.toBe(uri);
      }
      for (const uri of feedUris.filter((item) => !EARTHQUAKE_PUBLIC_FEED_URIS.includes(item))) {
        await expect(earthquakeAdapter.validateResourceUri!(uri, runtimeContext)).rejects.toThrow();
      }

      const templates = await protocol.client.listResourceTemplates();
      expect(templates.resourceTemplates.map((item) => ({ name: item.name, uriTemplate: item.uriTemplate }))).toEqual([
        { name: "earthquake-feed", uriTemplate: "earthquake://feed/{magnitude_tier}/{time_window}" },
        { name: "earthquake-event", uriTemplate: "earthquake://event/{event_id}" },
      ]);
      expect((await protocol.client.listPrompts()).prompts).toEqual([]);

      const feed = await invoke(protocol.client, "earthquake_get_feed", {
        magnitude_tier: "4.5",
        time_window: "week",
      }, runtimeContext);
      expect(feed.isError).toBe(false);
      expect(Number(feed.structuredContent?.count)).toBeGreaterThan(0);
      const feedEvents = feed.structuredContent?.events as Array<Record<string, unknown>>;
      expect(feedEvents.length).toBeGreaterThan(0);
      expect(feedEvents[0]).toMatchObject({ id: expect.any(String), magnitude: expect.any(Number) });
      expect(String(feed.structuredContent?.feed_url)).toMatch(/^https:\/\/earthquake\.usgs\.gov\/earthquakes\/feed\/v1\.0\/summary\/4\.5_week\.geojson$/);

      const usgsSearch = await invoke(protocol.client, "earthquake_search", {
        start_time: "2024-01-01",
        end_time: "2024-01-08",
        min_magnitude: 6,
        source: "usgs",
        limit: 3,
        order_by: "magnitude",
      }, runtimeContext);
      expect(usgsSearch.isError).toBe(false);
      expect(usgsSearch.structuredContent).toMatchObject({ source: "usgs", count: 2 });
      expect(usgsSearch.structuredContent?.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "us6000m0xl",
          magnitude: 7.5,
          alert: "red",
          tsunami: 1,
        }),
      ]));

      const detail = await invoke(protocol.client, "earthquake_get_event", { event_id: "us6000m0xl" }, runtimeContext);
      expect(detail.isError).toBe(false);
      expect(detail.structuredContent).toMatchObject({
        event: {
          id: "us6000m0xl",
          magnitude: 7.5,
          alert: "red",
          tsunami: 1,
          status: "reviewed",
        },
      });

      const usgsCount = await invoke(protocol.client, "earthquake_count", {
        start_time: "2024-01-01",
        end_time: "2024-01-08",
        min_magnitude: 6,
        source: "usgs",
      }, runtimeContext);
      expect(usgsCount.structuredContent).toEqual({ count: 2, max_allowed: 20_000, source: "usgs", exceeds_limit: false });

      const emscSearch = await invoke(protocol.client, "earthquake_search", {
        start_time: "2024-01-01",
        end_time: "2024-01-08",
        min_magnitude: 6,
        source: "emsc",
        limit: 2,
        order_by: "magnitude",
      }, runtimeContext);
      expect(emscSearch.isError).toBe(false);
      expect(emscSearch.structuredContent).toMatchObject({ source: "emsc", count: 2, truncated: true });
      expect(emscSearch.structuredContent?.events).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "20240101_0000088", magnitude: 7.5, alert: null }),
      ]));
      expect(JSON.stringify(emscSearch.structuredContent)).toContain("totalCount");

      const emscCount = await invoke(protocol.client, "earthquake_count", {
        start_time: "2024-01-01",
        end_time: "2024-01-08",
        min_magnitude: 6,
        source: "emsc",
      }, runtimeContext);
      expect(emscCount.structuredContent).toMatchObject({ count: 3, max_allowed: null, source: "emsc", exceeds_limit: false });

      const feedResource = await protocol.client.readResource({ uri: "earthquake://feed/4.5/week" });
      expect(feedResource.contents[0]).toMatchObject({ uri: "earthquake://feed/4.5/week", mimeType: "application/json" });
      expect(JSON.parse("text" in feedResource.contents[0] ? feedResource.contents[0].text : "{}")).toMatchObject({ count: expect.any(Number) });

      await expect(earthquakeAdapter.validateResourceUri!("earthquake://event/us6000m0xl", runtimeContext)).resolves.toBe("earthquake://event/us6000m0xl");
      const eventResource = await protocol.client.readResource({ uri: "earthquake://event/us6000m0xl" });
      expect(eventResource.contents[0]).toMatchObject({ uri: "earthquake://event/us6000m0xl", mimeType: "application/json" });
      expect(JSON.parse("text" in eventResource.contents[0] ? eventResource.contents[0].text : "{}")).toMatchObject({ event: { id: "us6000m0xl" } });
    } finally {
      await protocol.client.close().catch(() => undefined);
    }
  }, 240_000);

  test("surfaces a real not-found error and rejects unsafe time, space, source, limit, URL and output inputs", async () => {
    const runtimeContext = await context();
    const protocol = await connected(runtimeContext);
    try {
      const missing = await invoke(protocol.client, "earthquake_get_event", { event_id: "us000000000000" }, runtimeContext);
      expect(missing.isError).toBe(true);
      expect(JSON.stringify(missing.structuredContent)).toMatch(/not_found|-32001/);
      expect(JSON.stringify(missing.content)).toMatch(/No earthquake event found/i);
    } finally {
      await protocol.client.close().catch(() => undefined);
    }

    const invalid: Array<[string, Record<string, unknown>]> = [
      ["earthquake_get_feed", { magnitude_tier: "all", time_window: "year" }],
      ["earthquake_get_feed", { magnitude_tier: "all", time_window: "month" }],
      ["earthquake_get_feed", { magnitude_tier: "1.0", time_window: "week" }],
      ["earthquake_get_feed", { magnitude_tier: "2.5", time_window: "month" }],
      ["earthquake_get_feed", { magnitude_tier: "4.5", time_window: "week", baseUrl: "https://example.com" }],
      ["earthquake_search", { start_time: "2024-01-01", min_magnitude: 6 }],
      ["earthquake_search", { start_time: "2024-01-08", end_time: "2024-01-01", min_magnitude: 6 }],
      ["earthquake_search", { start_time: "2020-01-01", end_time: "2024-01-01", min_magnitude: 6 }],
      ["earthquake_search", { start_time: "2024-02-31", end_time: "2024-03-02", min_magnitude: 6 }],
      ["earthquake_search", { latitude: 37.5, longitude: 137.2, min_magnitude: 6 }],
      ["earthquake_search", { latitude: 37.5, longitude: 137.2, radius_km: 5_001, min_magnitude: 6 }],
      ["earthquake_search", { min_magnitude: 7, max_magnitude: 6 }],
      ["earthquake_search", { min_depth_km: 500, max_depth_km: 100 }],
      ["earthquake_search", { source: "emsc", alert_level: "red", min_magnitude: 6 }],
      ["earthquake_search", { min_magnitude: 6, limit: EARTHQUAKE_SEARCH_LIMIT + 1 }],
      ["earthquake_search", { min_magnitude: 6, proxy: "http://127.0.0.1:7897" }],
      ["earthquake_search", { min_magnitude: 6, headers: { Authorization: "Bearer x" } }],
      ["earthquake_get_event", { event_id: "../../etc/passwd" }],
      ["earthquake_get_event", { event_id: "https://earthquake.usgs.gov/event/1" }],
      ["earthquake_count", { start_time: "1900-01-01", end_time: "2024-01-01", source: "usgs" }],
    ];
    for (const [tool, input] of invalid) {
      await expect(earthquakeAdapter.validateAndTransform(tool, input, runtimeContext)).rejects.toThrow();
    }

    for (const uri of [
      "https://earthquake.usgs.gov/fdsnws/event/1/query",
      "earthquake://feed/all/year",
      "earthquake://event/../../etc/passwd",
      "earthquake://event/https://example.com",
    ]) {
      await expect(earthquakeAdapter.validateResourceUri!(uri, runtimeContext)).rejects.toThrow();
    }

    await expect(earthquakeAdapter.normalizeResult!(
      "earthquake_search",
      {
        content: [],
        structuredContent: { count: 101, source: "usgs", events: [] },
        isError: false,
      },
      runtimeContext,
    )).rejects.toThrow(/协议结构/);

    await expect(earthquakeAdapter.normalizeResult!(
      "earthquake_get_event",
      {
        content: [{ type: "text", text: "x".repeat(EARTHQUAKE_RESULT_LIMIT) }],
        structuredContent: {},
        isError: false,
      },
      runtimeContext,
    )).rejects.toThrow(/1.5 MiB/);
  }, 120_000);

  test("rejects linked runtime roots and proves fixed-origin, no-proxy, no-credential process boundaries", async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), "agent-opt-earthquake-target-"));
    const parent = await mkdtemp(path.join(os.tmpdir(), "agent-opt-earthquake-parent-"));
    roots.push(target, parent);
    const link = path.join(parent, "runtime-link");
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    await expect(earthquakeAdapter.prepare({ earthquakeRoot: link } as EarthquakeTestContext)).rejects.toThrow(/符号链接|目录联接|重定向目录/);

    const runtimeContext = await context();
    const launch = await earthquakeAdapter.prepare(runtimeContext);
    expect(launch.env).toMatchObject({
      USGS_BASE_URL: "https://earthquake.usgs.gov",
      EMSC_BASE_URL: "https://www.seismicportal.eu",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      NODE_USE_ENV_PROXY: "0",
      NODE_OPTIONS: "",
    });

    const { stdout, stderr } = await execFileAsync(launch.command, launch.args, {
      cwd: launch.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        ...launch.env,
        AGENT_OPT_EARTHQUAKE_SECURITY_PROBE: "1",
        HTTP_PROXY: "http://127.0.0.1:7897",
        HTTPS_PROXY: "http://127.0.0.1:7897",
        ALL_PROXY: "socks5://127.0.0.1:7897",
        NODE_USE_ENV_PROXY: "1",
        USGS_BASE_URL: "https://example.com/usgs",
        EMSC_BASE_URL: "https://example.com/emsc",
        NPM_TOKEN: "must-not-survive",
        AWS_ACCESS_KEY_ID: "must-not-survive",
        OPENAI_API_KEY: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      usgsOriginAccepted: true,
      emscOriginAccepted: true,
      redirectForced: true,
      customHostDenied: true,
      customPathDenied: true,
      arbitraryQueryDenied: true,
      credentialHeaderDenied: true,
      requestObjectDenied: true,
      httpDenied: true,
      dnsDenied: true,
      hostReadDenied: true,
      writeDenied: true,
      subprocessDenied: true,
      workerDenied: true,
      proxyRemoved: true,
      credentialRemoved: true,
      baseUrlsPinned: true,
    });
  }, 60_000);
});

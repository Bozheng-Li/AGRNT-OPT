import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, test } from "vitest";
import type { AdapterContext } from "@/lib/runtime/adapters";
import { WORLDBANK_COUNTRY_LIMIT, WORLDBANK_RESULT_LIMIT, worldBankAdapter } from "@/lib/runtime/worldbank-adapter";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
type WorldBankTestContext = AdapterContext & { worldBankRoot: string };

async function context(): Promise<WorldBankTestContext> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-worldbank-"));
  roots.push(root);
  return { worldBankRoot: root };
}

async function connected(runtimeContext: WorldBankTestContext) {
  const launch = await worldBankAdapter.prepare(runtimeContext);
  const transport = new StdioClientTransport({ ...launch, env: { ...getDefaultEnvironment(), ...launch.env }, stderr: "pipe" });
  const client = new Client({ name: "agent-opt-worldbank-test", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, launch };
}

async function invoke(client: Client, tool: string, input: Record<string, unknown>, runtimeContext: WorldBankTestContext) {
  const transformed = await worldBankAdapter.validateAndTransform(tool, input, runtimeContext);
  const upstream = await client.callTool({ name: tool, arguments: transformed }, undefined, { timeout: 60_000, maxTotalTimeout: 60_000 });
  return worldBankAdapter.normalizeResult!(tool, {
    content: Array.isArray(upstream.content) ? upstream.content : [],
    structuredContent: upstream.structuredContent as Record<string, unknown> | undefined,
    isError: upstream.isError === true,
  }, runtimeContext);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("World Bank MCP 0.1.14 integration", () => {
  test("discovers seven tools and two resources, then runs the full development-data chain", async () => {
    const runtimeContext = await context();
    const protocol = await connected(runtimeContext);
    try {
      const tools = await protocol.client.listTools();
      expect(tools.tools.map((item) => item.name)).toEqual([
        "worldbank_list_topics", "worldbank_list_sources", "worldbank_list_countries", "worldbank_get_country",
        "worldbank_search_indicators", "worldbank_get_indicator", "worldbank_get_data",
      ]);
      expect(tools.tools.every((item) => item.annotations?.readOnlyHint === true)).toBe(true);
      expect((await protocol.client.listResources()).resources).toEqual([]);
      expect((await protocol.client.listResourceTemplates()).resourceTemplates.map((item) => ({ name: item.name, uriTemplate: item.uriTemplate }))).toEqual([
        { name: "worldbank-indicator", uriTemplate: "worldbank://indicator/{indicatorId}" },
        { name: "worldbank-country", uriTemplate: "worldbank://country/{countryCode}" },
      ]);
      expect((await protocol.client.listPrompts()).prompts).toEqual([]);

      const topics = await invoke(protocol.client, "worldbank_list_topics", {}, runtimeContext);
      expect((topics.structuredContent?.topics as unknown[])).toHaveLength(21);
      expect(JSON.stringify(topics.structuredContent)).toContain("Economy & Growth");

      const sources = await invoke(protocol.client, "worldbank_list_sources", { page: 1, per_page: 5 }, runtimeContext);
      expect((sources.structuredContent?.sources as unknown[])).toHaveLength(5);
      expect(Number(sources.structuredContent?.totalCount)).toBeGreaterThan(60);

      const countries = await invoke(protocol.client, "worldbank_list_countries", {
        region: "EAS", include_aggregates: false, page: 1, per_page: 5,
      }, runtimeContext);
      expect(countries.structuredContent?.countries).toEqual(expect.arrayContaining([expect.objectContaining({ id: "CHN", name: "China" })]));

      const country = await invoke(protocol.client, "worldbank_get_country", { country_code: "chn" }, runtimeContext);
      expect(country.structuredContent).toMatchObject({ id: "CHN", iso2: "CN", name: "China", capitalCity: "Beijing", isAggregate: false });

      const searched = await invoke(protocol.client, "worldbank_search_indicators", {
        query: "GDP per capita", topic_id: "3", page: 1, per_page: 10,
      }, runtimeContext);
      expect(searched.structuredContent?.indicators).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "NY.GDP.PCAP.CD", name: "GDP per capita (current US$)" }),
      ]));
      expect(String(searched.structuredContent?.effectiveQuery)).toContain("topic_id=3");

      const indicator = await invoke(protocol.client, "worldbank_get_indicator", { indicator_id: "NY.GDP.PCAP.CD" }, runtimeContext);
      expect(indicator.structuredContent).toMatchObject({ id: "NY.GDP.PCAP.CD", sourceId: "2", sourceName: "World Development Indicators" });

      const data = await invoke(protocol.client, "worldbank_get_data", {
        indicator_id: "NY.GDP.PCAP.CD", countries: ["USA", "CHN"], date_range: "2020:2023", page: 1, per_page: 20,
      }, runtimeContext);
      expect(data.structuredContent).toMatchObject({ indicator: { id: "NY.GDP.PCAP.CD", name: "GDP per capita (current US$)" }, nullCount: 0, totalCount: 8 });
      const points = data.structuredContent?.data as Array<Record<string, unknown>>;
      expect(points).toEqual(expect.arrayContaining([
        expect.objectContaining({ countryIso3: "USA", date: "2023", value: expect.any(Number) }),
        expect.objectContaining({ countryIso3: "CHN", date: "2023", value: expect.any(Number) }),
      ]));
      expect(Number(points.find((item) => item.countryIso3 === "USA" && item.date === "2023")?.value)).toBeGreaterThan(80_000);
      expect(Number(points.find((item) => item.countryIso3 === "CHN" && item.date === "2023")?.value)).toBeGreaterThan(12_000);

      for (const uri of ["worldbank://indicator/NY.GDP.PCAP.CD", "worldbank://country/CHN"]) {
        await expect(worldBankAdapter.validateResourceUri!(uri, runtimeContext)).resolves.toBe(uri);
        const resource = await protocol.client.readResource({ uri });
        expect(resource.contents[0]).toMatchObject({ uri, mimeType: "application/json" });
        expect(JSON.parse("text" in resource.contents[0] ? resource.contents[0].text : "{}")).toMatchObject(
          uri.includes("indicator") ? { id: "NY.GDP.PCAP.CD" } : { id: "CHN" },
        );
      }
    } finally {
      await protocol.client.close().catch(() => undefined);
    }
  }, 180_000);

  test("preserves real not-found and empty-result states and rejects misleading or unbounded inputs", async () => {
    const runtimeContext = await context();
    const protocol = await connected(runtimeContext);
    try {
      const missing = await invoke(protocol.client, "worldbank_get_country", { country_code: "ZZZ" }, runtimeContext);
      expect(missing.isError).toBe(true);
      expect(JSON.stringify(missing.structuredContent)).toMatch(/country_not_found|-32001/);

      const noMatch = await invoke(protocol.client, "worldbank_search_indicators", {
        query: "definitelynomatch", topic_id: "3", page: 1, per_page: 5,
      }, runtimeContext);
      expect(noMatch.isError).toBe(false);
      expect(noMatch.structuredContent).toMatchObject({ indicators: [], totalCount: 0, notice: expect.any(String) });
    } finally {
      await protocol.client.close().catch(() => undefined);
    }

    const tooManyCountries = Array.from({ length: WORLDBANK_COUNTRY_LIMIT + 1 }, (_, index) => `A${index}`);
    const invalid: Array<[string, Record<string, unknown>]> = [
      ["worldbank_list_topics", { baseUrl: "https://example.com" }],
      ["worldbank_list_sources", { page: 0, per_page: 10 }],
      ["worldbank_list_countries", { region: "EU", page: 1, per_page: 10 }],
      ["worldbank_get_country", { country_code: "../../etc/passwd" }],
      ["worldbank_search_indicators", { query: "GDP per capita", page: 1, per_page: 10 }],
      ["worldbank_search_indicators", { query: "GDP", topic_id: "3", source_id: "2", page: 1, per_page: 10 }],
      ["worldbank_search_indicators", { topic_id: "22", page: 1, per_page: 10 }],
      ["worldbank_get_indicator", { indicator_id: "https://example.com/x" }],
      ["worldbank_get_data", { indicator_id: "SP.POP.TOTL", countries: "all", mrv: 1 }],
      ["worldbank_get_data", { indicator_id: "SP.POP.TOTL", countries: tooManyCountries, mrv: 1 }],
      ["worldbank_get_data", { indicator_id: "SP.POP.TOTL", countries: ["USA"], date_range: "1960:2020" }],
      ["worldbank_get_data", { indicator_id: "SP.POP.TOTL", countries: ["USA"], date_range: "2020:2023", mrv: 2 }],
      ["worldbank_get_data", { indicator_id: "SP.POP.TOTL", countries: ["USA"], mrv: 11 }],
      ["unknown_tool", {}],
    ];
    for (const [tool, input] of invalid) await expect(worldBankAdapter.validateAndTransform(tool, input, runtimeContext)).rejects.toThrow();

    const defaulted = await worldBankAdapter.validateAndTransform("worldbank_get_data", {
      indicator_id: "SP.POP.TOTL", countries: "USA",
    }, runtimeContext);
    expect(defaulted).toMatchObject({ countries: ["USA"], mrv: 5, page: 1, per_page: 500 });

    for (const uri of ["worldbank://country/../../etc/passwd", "worldbank://indicator/https://example.com", "https://api.worldbank.org/v2/topic"]) {
      await expect(worldBankAdapter.validateResourceUri!(uri, runtimeContext)).rejects.toThrow();
    }
    await expect(worldBankAdapter.normalizeResult!("worldbank_get_country", {
      content: [], structuredContent: { id: "CHN" }, isError: false,
    }, runtimeContext)).rejects.toThrow(/协议结构/);
    await expect(worldBankAdapter.normalizeResult!("worldbank_get_country", {
      content: [{ type: "text", text: "x".repeat(WORLDBANK_RESULT_LIMIT) }], structuredContent: {}, isError: false,
    }, runtimeContext)).rejects.toThrow(/2 MiB/);
  }, 90_000);

  test("rejects linked roots and proves fixed-origin, no-credential process boundaries", async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), "agent-opt-worldbank-target-"));
    const parent = await mkdtemp(path.join(os.tmpdir(), "agent-opt-worldbank-parent-"));
    roots.push(target, parent);
    const link = path.join(parent, "runtime-link");
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    await expect(worldBankAdapter.prepare({ worldBankRoot: link } as WorldBankTestContext)).rejects.toThrow(/符号链接|目录联接/);

    const runtimeContext = await context();
    const launch = await worldBankAdapter.prepare(runtimeContext);
    expect(launch.env).toMatchObject({ WORLDBANK_API_BASE_URL: "https://api.worldbank.org/v2", WORLDBANK_DEFAULT_PER_PAGE: "10", NODE_USE_ENV_PROXY: "0" });
    const { stdout, stderr } = await execFileAsync(launch.command, launch.args, {
      cwd: launch.cwd, windowsHide: true,
      env: {
        ...process.env, ...launch.env, AGENT_OPT_WORLDBANK_SECURITY_PROBE: "1",
        WORLDBANK_API_BASE_URL: "http://127.0.0.1:9", HTTPS_PROXY: "http://proxy.invalid:8080", NODE_USE_ENV_PROXY: "1",
        NPM_TOKEN: "must-not-survive", OPENAI_API_KEY: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      packagePinned: true, fixedOriginAccepted: true, redirectForced: true, customHostDenied: true, customPathDenied: true,
      keywordOnlyDenied: true, allCountriesDenied: true, methodDenied: true, requestObjectDenied: true,
      credentialHeaderDenied: true, hostReadDenied: true, writeDenied: true, subprocessDenied: true, workerDenied: true,
      baseUrlForced: true, proxyRemoved: true, credentialRemoved: true,
    });
  }, 60_000);
});

import { afterAll, describe, expect, test } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";
import { closePluginSessions } from "../src/lib/runtime/invoke";

const slug = "worldbank-development-data-lab";

async function request(body: Record<string, unknown>) {
  return POST(
    new Request(`http://localhost/api/plugins/${slug}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

async function invoke(tool: string, args: Record<string, unknown>) {
  return request({ operation: "tool", tool, arguments: args });
}

async function structured(tool: string, args: Record<string, unknown>) {
  const response = await invoke(tool, args);
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.plugin).toBe("io.github.cyanheads/worldbank-mcp-server");
  expect(payload.result.isError).toBe(false);
  return payload.result.structuredContent as Record<string, unknown>;
}

async function resource(uri: string) {
  return request({ operation: "resource", uri });
}

afterAll(async () => {
  await closePluginSessions(slug);
});

describe("World Bank public API", () => {
  test("runs all seven tools and both real resource templates through the public route", async () => {
    const capabilities = await request({ operation: "capabilities" });
    expect(capabilities.status).toBe(200);
    const capabilityPayload = await capabilities.json();
    expect(capabilityPayload.result).toMatchObject({ resources: [], prompts: [] });
    expect(capabilityPayload.result.resourceTemplates).toEqual([
      expect.objectContaining({ name: "worldbank-indicator", uriTemplate: "worldbank://indicator/{indicatorId}" }),
      expect.objectContaining({ name: "worldbank-country", uriTemplate: "worldbank://country/{countryCode}" }),
    ]);

    const topics = await structured("worldbank_list_topics", {});
    expect(topics.topics).toHaveLength(21);
    expect(JSON.stringify(topics.topics)).toContain("Economy & Growth");

    const sources = await structured("worldbank_list_sources", { page: 1, per_page: 10 });
    expect(Number(sources.totalCount)).toBeGreaterThan(60);
    expect(sources.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "1", name: "Doing Business" }),
    ]));

    const countries = await structured("worldbank_list_countries", {
      region: "EAS",
      include_aggregates: false,
      page: 1,
      per_page: 10,
    });
    expect(countries.countries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "CHN", iso2: "CN", name: "China", isAggregate: false }),
    ]));

    const country = await structured("worldbank_get_country", { country_code: "chn" });
    expect(country).toMatchObject({
      id: "CHN",
      iso2: "CN",
      name: "China",
      capitalCity: "Beijing",
      isAggregate: false,
    });

    const topicSearch = await structured("worldbank_search_indicators", {
      query: "GDP per capita",
      topic_id: "3",
      page: 1,
      per_page: 10,
    });
    expect(topicSearch.indicators).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "NY.GDP.PCAP.CD", name: "GDP per capita (current US$)" }),
    ]));
    expect(String(topicSearch.effectiveQuery)).toContain("topic_id=3");

    const sourceSearch = await structured("worldbank_search_indicators", {
      query: "GDP per capita",
      source_id: "2",
      page: 1,
      per_page: 10,
    });
    expect(sourceSearch.indicators).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "NY.GDP.PCAP.CD", sourceId: "2" }),
    ]));
    expect(String(sourceSearch.effectiveQuery)).toContain("source_id=2");

    const indicator = await structured("worldbank_get_indicator", { indicator_id: "NY.GDP.PCAP.CD" });
    expect(indicator).toMatchObject({
      id: "NY.GDP.PCAP.CD",
      name: "GDP per capita (current US$)",
      sourceId: "2",
      sourceName: "World Development Indicators",
    });
    expect(String(indicator.sourceNote)).toMatch(/gross domestic product|GDP/i);

    const series = await structured("worldbank_get_data", {
      indicator_id: "NY.GDP.PCAP.CD",
      countries: ["USA", "CHN"],
      date_range: "2020:2023",
      page: 1,
      per_page: 20,
    });
    expect(series).toMatchObject({
      indicator: { id: "NY.GDP.PCAP.CD", name: "GDP per capita (current US$)" },
      nullCount: 0,
      totalCount: 8,
    });
    const observations = series.data as Array<Record<string, unknown>>;
    expect(observations).toHaveLength(8);
    expect(observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ countryIso3: "USA", date: "2020", value: expect.any(Number) }),
      expect.objectContaining({ countryIso3: "USA", date: "2023", value: expect.any(Number) }),
      expect.objectContaining({ countryIso3: "CHN", date: "2020", value: expect.any(Number) }),
      expect.objectContaining({ countryIso3: "CHN", date: "2023", value: expect.any(Number) }),
    ]));

    const indicatorResource = await resource("worldbank://indicator/NY.GDP.PCAP.CD");
    expect(indicatorResource.status).toBe(200);
    const indicatorPayload = await indicatorResource.json();
    expect(indicatorPayload.plugin).toBe("io.github.cyanheads/worldbank-mcp-server");
    expect(JSON.parse(indicatorPayload.result.contents[0].text)).toMatchObject({
      id: "NY.GDP.PCAP.CD",
      sourceId: "2",
    });

    const countryResource = await resource("worldbank://country/CHN");
    expect(countryResource.status).toBe(200);
    const countryPayload = await countryResource.json();
    expect(JSON.parse(countryPayload.result.contents[0].text)).toMatchObject({
      id: "CHN",
      iso2: "CN",
      capitalCity: "Beijing",
    });
  }, 300_000);

  test("rejects keyword-only discovery, all-country downloads, and malformed identifiers or resource URIs", async () => {
    const invalidTools: Array<[string, Record<string, unknown>]> = [
      ["worldbank_search_indicators", { query: "GDP per capita", page: 1, per_page: 10 }],
      ["worldbank_get_data", { indicator_id: "NY.GDP.PCAP.CD", countries: "all", date_range: "2020:2023" }],
      ["worldbank_get_indicator", { indicator_id: "https://example.com/indicator" }],
      ["worldbank_get_country", { country_code: "../../etc/passwd" }],
      ["worldbank_search_indicators", { query: "GDP", topic_id: "3", source_id: "2", page: 1, per_page: 10 }],
    ];
    for (const [tool, args] of invalidTools) {
      expect((await invoke(tool, args)).status).toBe(400);
    }

    for (const uri of [
      "worldbank://country/../../etc/passwd",
      "worldbank://indicator/https://example.com/x",
      "https://api.worldbank.org/v2/country/CHN",
    ]) {
      expect((await resource(uri)).status).toBe(400);
    }
  }, 60_000);
});

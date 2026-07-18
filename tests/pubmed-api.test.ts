import { afterAll, describe, expect, test } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";
import { closePluginSessions } from "../src/lib/runtime/invoke";

type Body =
  | { operation: "tool"; tool: string; arguments: Record<string, unknown> }
  | { operation: "resource"; uri: string }
  | { operation: "prompt"; prompt: string; arguments: Record<string, unknown> };

async function request(body: Body) {
  return POST(
    new Request("http://localhost/api/plugins/pubmed-evidence-lab/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug: "pubmed-evidence-lab" }) },
  );
}

async function invoke(tool: string, args: Record<string, unknown>) {
  return request({ operation: "tool", tool, arguments: args });
}

afterAll(async () => {
  await closePluginSessions("pubmed-evidence-lab");
});

describe("PubMed public API", () => {
  test("runs all ten real tools through the public route", async () => {
    const search = await invoke("pubmed_search_articles", {
      query: "10.1093/nar/gks1195[doi]", maxResults: 3, offset: 0, sort: "relevance", summaryCount: 1,
    });
    expect(search.status).toBe(200);
    const searchJson = await search.json();
    expect(searchJson.plugin).toBe("io.github.cyanheads/pubmed-mcp-server");
    expect(searchJson.result.structuredContent).toMatchObject({ pmids: ["23193287"], totalCount: 1 });

    const article = await invoke("pubmed_fetch_articles", { pmids: ["23193287"], includeMesh: true, includeGrants: false });
    expect(article.status).toBe(200);
    expect((await article.json()).result.structuredContent.articles[0]).toMatchObject({ pmid: "23193287", pmcId: "PMC3531190" });

    const fulltext = await invoke("pubmed_fetch_fulltext", { pmcids: ["PMC3531190"], includeReferences: false, maxSections: 2 });
    expect(fulltext.status).toBe(200);
    const fulltextJson = await fulltext.json();
    expect(fulltextJson.result.structuredContent.articles[0]).toMatchObject({ pmcId: "PMC3531190", source: "pmc" });
    expect(JSON.stringify(fulltextJson.result.structuredContent)).toContain("INTRODUCTION");

    const citations = await invoke("pubmed_format_citations", { pmids: ["23193287"], format: ["apa", "bibtex"] });
    expect(citations.status).toBe(200);
    expect((await citations.json()).result.structuredContent).toMatchObject({ totalFormatted: 1 });

    const related = await invoke("pubmed_find_related", { pmid: "23193287", relationship: "similar", maxResults: 2, offset: 0 });
    expect(related.status).toBe(200);
    expect((await related.json()).result.structuredContent.articles).toHaveLength(2);

    const spelling = await invoke("pubmed_spell_check", { query: "diabetis melitus" });
    expect(spelling.status).toBe(200);
    expect((await spelling.json()).result.structuredContent).toMatchObject({ corrected: "diabetes mellitus", hasSuggestion: true });

    const mesh = await invoke("pubmed_lookup_mesh", { query: "Diabetes Mellitus", maxResults: 2, includeDetails: true });
    expect(mesh.status).toBe(200);
    expect((await mesh.json()).result.structuredContent.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ meshId: "D003920", name: "Diabetes Mellitus" })]),
    );

    const lookup = await invoke("pubmed_lookup_citation", {
      citations: [{ journal: "Nucleic Acids Res", year: "2013", volume: "41", firstPage: "D36", authorName: "Benson DA", key: "genbank" }],
    });
    expect(lookup.status).toBe(200);
    expect((await lookup.json()).result.structuredContent.results[0]).toMatchObject({ key: "genbank", pmid: "23193287", matched: true });

    const converted = await invoke("pubmed_convert_ids", { ids: ["10.1093/nar/gks1195"], idType: "doi" });
    expect(converted.status).toBe(200);
    expect((await converted.json()).result.structuredContent.records[0]).toMatchObject({ pmid: "23193287", pmcid: "PMC3531190" });

    const europe = await invoke("pubmed_europepmc_search", {
      query: "EXT_ID:23193287 AND SRC:MED", pageSize: 2, cursorMark: "*", sources: ["MED"], resultType: "core",
    });
    expect(europe.status).toBe(200);
    expect((await europe.json()).result.structuredContent.hits[0]).toMatchObject({ pmid: "23193287", pmcId: "PMC3531190", isOpenAccess: true });
  }, 180_000);

  test("reads the live database resource and materializes the research-plan prompt", async () => {
    const resource = await request({ operation: "resource", uri: "pubmed://database/info" });
    expect(resource.status).toBe(200);
    const resourceJson = await resource.json();
    const database = JSON.parse(resourceJson.result.contents[0].text);
    expect(database).toMatchObject({ dbName: "pubmed", description: "PubMed bibliographic record" });
    expect(database.fields.length).toBeGreaterThan(20);

    const prompt = await request({
      operation: "prompt",
      prompt: "research_plan",
      arguments: {
        title: "Metformin and healthy aging",
        goal: "Evaluate human evidence for metformin in healthy aging",
        keywords: "metformin, healthy aging, longevity",
        organism: "human",
        includeAgentPrompts: "true",
      },
    });
    expect(prompt.status).toBe(200);
    const promptJson = await prompt.json();
    expect(promptJson.result.messages).toHaveLength(2);
    expect(JSON.stringify(promptJson.result)).toContain("Research Plan: Metformin and healthy aging");
  }, 90_000);

  test("returns a real empty result and rejects network, volume, identifier, resource, and prompt escapes", async () => {
    const empty = await invoke("pubmed_search_articles", {
      query: "10.9999/agent-opt-definitely-missing[doi]", maxResults: 2, offset: 0, sort: "relevance", summaryCount: 2,
    });
    expect(empty.status).toBe(200);
    expect((await empty.json()).result.structuredContent).toMatchObject({ pmids: [], summaries: [], totalCount: 0 });

    const invalid: Array<[string, Record<string, unknown>]> = [
      ["pubmed_search_articles", { query: "GenBank", maxResults: 1_000, summaryCount: 1 }],
      ["pubmed_search_articles", { query: "GenBank", maxResults: 2, baseUrl: "https://example.com" }],
      ["pubmed_fetch_articles", { pmids: ["PMID:23193287"] }],
      ["pubmed_fetch_fulltext", { pmcids: ["PMC3531190"], pmids: ["23193287"] }],
      ["pubmed_convert_ids", { ids: ["https://doi.org/10.1093/nar/gks1195"], idType: "doi" }],
      ["pubmed_europepmc_search", { query: "cancer", pageSize: 100, cursorMark: "*", registryUrl: "https://example.com" }],
    ];
    for (const [tool, args] of invalid) {
      const response = await invoke(tool, args);
      expect(response.status).toBe(400);
    }

    const unsafeResource = await request({ operation: "resource", uri: "https://eutils.ncbi.nlm.nih.gov" });
    expect(unsafeResource.status).toBe(400);
    const unsafePrompt = await request({
      operation: "prompt",
      prompt: "research_plan",
      arguments: { title: "x", goal: "y", keywords: "z", includeAgentPrompts: "true", url: "https://example.com" },
    });
    expect(unsafePrompt.status).toBe(400);
  }, 90_000);
});

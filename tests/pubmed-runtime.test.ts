import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import type { AdapterContext } from "@/lib/runtime/adapters";
import { pubmedAdapter, validatedPubmedProxy } from "@/lib/runtime/pubmed-adapter";
import {
  closePluginSessions,
  getPluginPrompt,
  invokePluginTool,
  listPluginProtocolAssets,
  listPluginTools,
  readPluginResource,
} from "@/lib/runtime/invoke";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function context(): Promise<AdapterContext> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-pubmed-"));
  roots.push(root);
  return { pubmedRoot: root };
}

afterEach(async () => {
  await closePluginSessions("pubmed-evidence-lab");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("PubMed MCP 2.9.8 integration", () => {
  test("discovers ten tools, one resource, one prompt, and runs the complete evidence chain", async () => {
    const ctx = await context();
    const tools = await listPluginTools("pubmed-evidence-lab", ctx);
    expect(tools.map((tool) => tool.name)).toEqual([
      "pubmed_search_articles",
      "pubmed_fetch_articles",
      "pubmed_fetch_fulltext",
      "pubmed_format_citations",
      "pubmed_find_related",
      "pubmed_spell_check",
      "pubmed_lookup_mesh",
      "pubmed_lookup_citation",
      "pubmed_convert_ids",
      "pubmed_europepmc_search",
    ]);

    const assets = await listPluginProtocolAssets("pubmed-evidence-lab", ctx);
    expect(assets.resources.map((item) => item.uri)).toEqual(["pubmed://database/info"]);
    expect(assets.resourceTemplates).toEqual([]);
    expect(assets.prompts.map((item) => item.name)).toEqual(["research_plan"]);

    const searched = await invokePluginTool("pubmed-evidence-lab", "pubmed_search_articles", {
      query: "10.1093/nar/gks1195[doi]",
      maxResults: 3,
      offset: 0,
      sort: "relevance",
      summaryCount: 1,
    }, ctx);
    expect(searched.structuredContent).toMatchObject({
      pmids: ["23193287"],
      summaries: [expect.objectContaining({ title: "GenBank.", doi: "10.1093/nar/gks1195", pmcId: "PMC3531190" })],
      totalCount: 1,
    });

    const fetched = await invokePluginTool("pubmed-evidence-lab", "pubmed_fetch_articles", {
      pmids: ["23193287"], includeMesh: true, includeGrants: false,
    }, ctx);
    expect(fetched.structuredContent).toMatchObject({
      articles: [expect.objectContaining({ pmid: "23193287", title: "GenBank.", pmcId: "PMC3531190" })],
    });
    expect(JSON.stringify(fetched.structuredContent)).toContain("Databases, Nucleic Acid");

    const fulltext = await invokePluginTool("pubmed-evidence-lab", "pubmed_fetch_fulltext", {
      pmcids: ["PMC3531190"], includeReferences: false, maxSections: 2,
    }, ctx);
    expect(fulltext.structuredContent).toMatchObject({
      articles: [expect.objectContaining({ pmcId: "PMC3531190", title: "GenBank", source: "pmc" })],
    });
    expect(JSON.stringify(fulltext.structuredContent)).toContain("INTRODUCTION");

    const citations = await invokePluginTool("pubmed-evidence-lab", "pubmed_format_citations", {
      pmids: ["23193287"], format: ["apa", "bibtex"],
    }, ctx);
    expect(citations.structuredContent).toMatchObject({
      totalFormatted: 1,
      citations: [expect.objectContaining({ pmid: "23193287", citations: expect.objectContaining({ apa: expect.stringContaining("GenBank") }) })],
    });

    const related = await invokePluginTool("pubmed-evidence-lab", "pubmed_find_related", {
      pmid: "23193287", relationship: "similar", maxResults: 2, offset: 0,
    }, ctx);
    expect(related.structuredContent).toMatchObject({ sourcePmid: "23193287", relationship: "similar", source: "ncbi" });
    expect((related.structuredContent?.articles as unknown[])).toHaveLength(2);

    const spelling = await invokePluginTool("pubmed-evidence-lab", "pubmed_spell_check", { query: "diabetis melitus" }, ctx);
    expect(spelling.structuredContent).toMatchObject({ original: "diabetis melitus", corrected: "diabetes mellitus", hasSuggestion: true });

    const mesh = await invokePluginTool("pubmed-evidence-lab", "pubmed_lookup_mesh", {
      query: "Diabetes Mellitus", maxResults: 2, includeDetails: true,
    }, ctx);
    expect(mesh.structuredContent).toMatchObject({
      results: expect.arrayContaining([expect.objectContaining({ meshId: "D003920", name: "Diabetes Mellitus" })]),
    });

    const lookup = await invokePluginTool("pubmed-evidence-lab", "pubmed_lookup_citation", {
      citations: [{ journal: "Nucleic Acids Res", year: "2013", volume: "41", firstPage: "D36", authorName: "Benson DA", key: "genbank" }],
    }, ctx);
    expect(lookup.structuredContent).toMatchObject({
      totalMatched: 1,
      results: [expect.objectContaining({ key: "genbank", pmid: "23193287", matched: true })],
    });

    const converted = await invokePluginTool("pubmed-evidence-lab", "pubmed_convert_ids", {
      ids: ["10.1093/nar/gks1195"], idType: "doi",
    }, ctx);
    expect(converted.structuredContent).toMatchObject({
      totalConverted: 1,
      records: [expect.objectContaining({ pmid: "23193287", pmcid: "PMC3531190", doi: "10.1093/nar/gks1195" })],
    });

    const europe = await invokePluginTool("pubmed-evidence-lab", "pubmed_europepmc_search", {
      query: "EXT_ID:23193287 AND SRC:MED", pageSize: 2, cursorMark: "*", sources: ["MED"], resultType: "core",
    }, ctx);
    expect(europe.structuredContent).toMatchObject({
      hits: [expect.objectContaining({ pmid: "23193287", pmcId: "PMC3531190", isOpenAccess: true })],
      totalCount: 1,
    });

    const resource = await readPluginResource("pubmed-evidence-lab", "pubmed://database/info", ctx);
    expect(resource.contents[0]).toMatchObject({ uri: "pubmed://database/info", mimeType: "application/json" });
    expect(JSON.parse(resource.contents[0].text)).toMatchObject({ dbName: "pubmed", description: "PubMed bibliographic record" });
    expect(JSON.parse(resource.contents[0].text).fields.length).toBeGreaterThan(20);

    const prompt = await getPluginPrompt("pubmed-evidence-lab", "research_plan", {
      title: "Metformin and healthy aging",
      goal: "Evaluate human evidence for metformin in healthy aging",
      keywords: "metformin, healthy aging, longevity",
      organism: "human",
      includeAgentPrompts: "true",
    }, ctx);
    expect(prompt.messages).toHaveLength(2);
    expect(JSON.stringify(prompt)).toContain("Research Plan: Metformin and healthy aging");
    expect(JSON.stringify(prompt)).toContain("pubmed_search_articles");
  }, 240_000);

  test("preserves a real no-result response and rejects unsafe public semantics", async () => {
    const ctx = await context();
    const failure = await invokePluginTool("pubmed-evidence-lab", "pubmed_search_articles", {
      query: "10.9999/agent-opt-definitely-missing[doi]", maxResults: 2, offset: 0, sort: "relevance", summaryCount: 2,
    }, ctx);
    expect(failure.isError).toBe(false);
    expect(failure.structuredContent).toMatchObject({ pmids: [], summaries: [], totalCount: 0 });

    const invalid: Array<[string, Record<string, unknown>]> = [
      ["pubmed_search_articles", { query: "GenBank", maxResults: 1_000, summaryCount: 1 }],
      ["pubmed_search_articles", { query: "GenBank", maxResults: 2, baseUrl: "https://example.com" }],
      ["pubmed_fetch_articles", { pmids: ["PMID:23193287"] }],
      ["pubmed_fetch_fulltext", { pmcids: ["PMC3531190"], pmids: ["23193287"] }],
      ["pubmed_fetch_fulltext", { dois: ["https://doi.org/10.1093/nar/gks1195"] }],
      ["pubmed_find_related", { pmid: "../23193287", relationship: "similar", maxResults: 2, offset: 0 }],
      ["pubmed_lookup_mesh", { query: "x\u0000y", maxResults: 2 }],
      ["pubmed_lookup_citation", { citations: [{ authorName: "Benson" }] }],
      ["pubmed_convert_ids", { ids: ["../secret"], idType: "doi" }],
      ["pubmed_europepmc_search", { query: "cancer", pageSize: 100, cursorMark: "*", registryUrl: "https://example.com" }],
    ];
    for (const [tool, input] of invalid) {
      await expect(pubmedAdapter.validateAndTransform(tool, input, ctx)).rejects.toThrow();
    }
    await expect(pubmedAdapter.validateResourceUri!("https://eutils.ncbi.nlm.nih.gov", ctx)).rejects.toThrow();
    await expect(pubmedAdapter.validatePromptAndTransform!("research_plan", {
      title: "x", goal: "y", keywords: "z", includeAgentPrompts: "true", url: "https://example.com",
    }, ctx)).rejects.toThrow();
  }, 90_000);

  test("validates proxy and sandbox roots and proves fixed-origin process boundaries", async () => {
    expect(validatedPubmedProxy({})).toBeUndefined();
    expect(validatedPubmedProxy({ HTTPS_PROXY: "http://127.0.0.1:7897" })).toBe("http://127.0.0.1:7897/");
    expect(() => validatedPubmedProxy({ HTTPS_PROXY: "http://user:pass@proxy.example" })).toThrow();
    expect(() => validatedPubmedProxy({ HTTPS_PROXY: "http://a.example", https_proxy: "http://b.example" })).toThrow();

    const target = await mkdtemp(path.join(os.tmpdir(), "agent-opt-pubmed-target-"));
    const parent = await mkdtemp(path.join(os.tmpdir(), "agent-opt-pubmed-parent-"));
    roots.push(target, parent);
    const link = path.join(parent, "runtime-link");
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    await expect(pubmedAdapter.prepare({ pubmedRoot: link })).rejects.toThrow(/符号链接|目录联接/);

    const ctx = await context();
    const launch = await pubmedAdapter.prepare(ctx);
    const { stdout, stderr } = await execFileAsync(launch.command, launch.args, {
      cwd: launch.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        ...launch.env,
        AGENT_OPT_PUBMED_SECURITY_PROBE: "1",
        NCBI_API_KEY: "must-not-survive",
        UNPAYWALL_EMAIL: "must-not-survive@example.com",
        OPENAI_API_KEY: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      fixedOriginAccepted: true,
      redirectForced: true,
      customHostDenied: true,
      customPathDenied: true,
      unpaywallDenied: true,
      credentialParameterDenied: true,
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

import { describe, expect, test } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";

const slug = "crossref-scholarly-metadata-lab";

async function invoke(tool: string, args: Record<string, unknown>) {
  return POST(
    new Request(`http://localhost/api/plugins/${slug}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "tool", tool, arguments: args }),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

async function structured(tool: string, args: Record<string, unknown>) {
  const response = await invoke(tool, args);
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.plugin).toBe("io.github.cyanheads/crossref-mcp-server");
  expect(payload.result.isError).toBe(false);
  return payload.result.structuredContent as Record<string, unknown>;
}

describe("Crossref public API", () => {
  test("runs the real seven-tool scholarly and publisher workflow", async () => {
    const search = await structured("crossref_search_works", {
      queryTitle: "Array programming with NumPy",
      fields: ["DOI", "title", "author", "published", "type", "is-referenced-by-count"],
      rows: 3,
      offset: 0,
      sort: "relevance",
      order: "desc",
    });
    expect(JSON.stringify(search.works)).toContain("10.1038/s41586-020-2649-2");

    const work = await structured("crossref_get_work", { doi: "10.1038/nature12373" });
    expect(work.doi).toBe("10.1038/nature12373");
    expect(String(work.title)).toMatch(/human|stem|cell/i);

    const references = await structured("crossref_get_references", { doi: "10.1038/nature12373" });
    expect(references.doi).toBe("10.1038/nature12373");
    expect(Number(references.referenceCount)).toBeGreaterThan(0);

    const journals = await structured("crossref_search_journals", {
      issn: "1476-4687",
      include_works: true,
      rows: 3,
    });
    expect(JSON.stringify(journals.journals)).toMatch(/Nature/i);
    expect(Array.isArray(journals.recentWorks)).toBe(true);

    const funders = await structured("crossref_search_funders", {
      funder_doi: "10.13039/100000001",
      include_works: false,
      rows: 3,
    });
    expect(JSON.stringify(funders.funders)).toMatch(/National Science Foundation/i);

    const prefix = await structured("crossref_get_prefix", { prefix: "10.1038" });
    expect(prefix.prefix).toBe("10.1038");
    expect(Number(prefix.memberId)).toBeGreaterThan(0);

    const member = await structured("crossref_get_member", { member_id: Number(prefix.memberId) });
    expect(member.id).toBe(Number(prefix.memberId));
    expect(String(member.primaryName)).toMatch(/Springer|Nature/i);
    expect(Array.isArray(member.coverage)).toBe(true);
  }, 240_000);

  test("rejects enumeration, excessive paging, custom origins, and malformed identifiers", async () => {
    const empty = await invoke("crossref_search_works", { rows: 3, offset: 0 });
    expect(empty.status).toBe(400);

    const excessive = await invoke("crossref_search_works", { queryTitle: "NumPy", rows: 100 });
    expect(excessive.status).toBe(400);

    const unsafe = await invoke("crossref_get_work", {
      doi: "10.1038/nature12373",
      baseUrl: "https://example.com",
    });
    expect(unsafe.status).toBe(400);

    const malformed = await invoke("crossref_get_prefix", { prefix: "https://example.com/10.1038" });
    expect(malformed.status).toBe(400);

    const brokenUpstreamMode = await invoke("crossref_search_funders", {
      funder_doi: "10.13039/100000001",
      include_works: true,
      rows: 3,
    });
    expect(brokenUpstreamMode.status).toBe(400);
  });
});

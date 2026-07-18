import { describe, expect, test } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";

async function invoke(tool: string, args: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/plugins/openlibrary-research-desk/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "tool", tool, arguments: args }),
    }),
    { params: Promise.resolve({ slug: "openlibrary-research-desk" }) },
  );
}

async function resource(uri: string) {
  return POST(
    new Request("http://localhost/api/plugins/openlibrary-research-desk/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "resource", uri }),
    }),
    { params: Promise.resolve({ slug: "openlibrary-research-desk" }) },
  );
}

describe("Open Library public API", () => {
  test("runs real search and work tools, reads a work resource, and rejects unsafe options", async () => {
    const search = await invoke("openlibrary_search_books", { query: "The Hobbit", limit: 2, offset: 0 });
    expect(search.status).toBe(200);
    const searchPayload = await search.json();
    expect(searchPayload.plugin).toBe("io.github.cyanheads/openlibrary-mcp-server");
    expect(searchPayload.result.isError).toBe(false);
    expect(JSON.stringify(searchPayload.result.structuredContent.works)).toContain("OL27482W");

    const work = await invoke("openlibrary_get_work", { work_id: "OL27482W" });
    expect(work.status).toBe(200);
    expect((await work.json()).result.structuredContent.work_id).toBe("OL27482W");

    const workResource = await resource("openlibrary://works/OL27482W");
    expect(workResource.status).toBe(200);
    const resourcePayload = await workResource.json();
    expect(resourcePayload.result.contents[0].text).toMatch(/Hobbit|OL27482W/i);

    const unsafe = await invoke("openlibrary_search_books", {
      query: "Hobbit",
      limit: 2,
      baseUrl: "https://example.com",
    });
    expect(unsafe.status).toBe(400);
  }, 180_000);
});

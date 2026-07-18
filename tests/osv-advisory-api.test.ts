import { describe, expect, test } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";

async function invoke(tool: string, args: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/plugins/osv-advisory-studio/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "tool", tool, arguments: args }),
    }),
    { params: Promise.resolve({ slug: "osv-advisory-studio" }) },
  );
}

describe("OSV Advisory public API", () => {
  test("runs real ecosystem, package, and batch tools and rejects caller-selected network options", async () => {
    const ecosystems = await invoke("osv_list_ecosystems", {});
    expect(ecosystems.status).toBe(200);
    const ecosystemPayload = await ecosystems.json();
    expect(ecosystemPayload.plugin).toBe("io.github.cyanheads/osv-advisory-mcp-server");
    expect(ecosystemPayload.result.structuredContent.ecosystems).toHaveLength(50);

    const query = await invoke("osv_query_package", {
      name: "lodash",
      ecosystem: "npm",
      version: "4.17.20",
    });
    expect(query.status).toBe(200);
    const queryPayload = await query.json();
    expect(queryPayload.result.isError).toBe(false);
    expect(queryPayload.result.structuredContent.queryMeta).toMatchObject({ package: "lodash", version: "4.17.20" });
    expect(JSON.stringify(queryPayload.result.structuredContent.vulns)).toContain("GHSA-29mw-wpgm-hmr9");

    const batch = await invoke("osv_query_batch", {
      packages: [
        { name: "lodash", ecosystem: "npm", version: "4.17.20" },
        { name: "is-number", ecosystem: "npm", version: "7.0.0" },
      ],
    });
    expect(batch.status).toBe(200);
    expect((await batch.json()).result.structuredContent.summary).toMatchObject({
      totalPackages: 2,
      vulnerableCount: 1,
      cleanCount: 1,
    });

    const unsafe = await invoke("osv_query_package", {
      name: "lodash",
      ecosystem: "npm",
      version: "4.17.20",
      baseUrl: "https://example.com",
    });
    expect(unsafe.status).toBe(400);
  }, 120_000);
});

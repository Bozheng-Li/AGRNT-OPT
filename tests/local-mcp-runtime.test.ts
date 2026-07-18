import { describe, expect, it } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";
import { loadPublicCatalog } from "../src/lib/catalog";
import { getPluginAdapter } from "../src/lib/runtime/adapters";
import { InvocationValidationError } from "../src/lib/runtime/errors";
import { invokePluginTool } from "../src/lib/runtime/invoke";
import { listLocalMcpSlugs, localMcpCatalog } from "../src/lib/runtime/local-mcp-tools";

async function httpInvoke(slug: string, tool: string, args: unknown) {
  return POST(
    new Request(`http://localhost/api/plugins/${slug}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, arguments: args }),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

describe("local in-process first-party plugin catalog", () => {
  const slugs = listLocalMcpSlugs();

  it("registers every local capability as a public plugin without inflating the upstream MCP count", () => {
    expect(slugs.length).toBeGreaterThanOrEqual(40);
    const publicCatalog = loadPublicCatalog();
    const publicPlugins = publicCatalog.filter((plugin) => plugin.kind === "plugin");
    const publicMcpSlugs = new Set(publicCatalog.filter((plugin) => plugin.kind === "mcp-server").map((plugin) => plugin.slug));
    for (const slug of slugs) {
      const manifest = publicPlugins.find((plugin) => plugin.slug === slug);
      expect(manifest, slug).toBeTruthy();
      expect(publicMcpSlugs.has(slug), `${slug} must not count as an MCP server`).toBe(false);
      expect(["web-ready", "verified"]).toContain(manifest?.lifecycle.status);
      expect(manifest?.web.component).toBe("LocalMcpWorkspace");
      expect(manifest?.runtime.transport).toBe("in-process");
      expect(getPluginAdapter(slug)?.mode).toBe("in-process");
      if (manifest?.lifecycle.status === "verified") {
        const web = manifest.verification.tests.find((test) => test.category === "web-e2e");
        expect(web?.status, slug).toBe("passed");
        expect(web?.command, slug).toContain("npm run test:e2e");
        expect(web?.evidence, slug).toContain(slug);
      }
    }
  });

  it("executes every exposed local plugin tool through invokePluginTool", async () => {
    for (const slug of slugs) {
      const entry = localMcpCatalog[slug]!;
      for (const tool of entry.tools) {
        const sample = sampleInput(slug, tool.name);
        const result = await invokePluginTool(slug, tool.name, sample);
        expect(result.isError, `${slug}:${tool.name}`).toBe(false);
        expect(result.content.length, `${slug}:${tool.name}`).toBeGreaterThan(0);
        expect(result.structuredContent, `${slug}:${tool.name}`).toBeTruthy();
      }
    }
  }, 60_000);

  it("rejects a non-object payload for every exposed local plugin tool", async () => {
    for (const slug of slugs) {
      for (const tool of localMcpCatalog[slug]!.tools) {
        await expect(
          invokePluginTool(slug, tool.name, "not-an-object"),
          `${slug}:${tool.name}`,
        ).rejects.toBeInstanceOf(InvocationValidationError);
      }
    }
  }, 60_000);

  it("rejects representative semantic failures before unsafe work", async () => {
    for (const testCase of semanticFailureCases) {
      await expect(
        invokePluginTool(testCase.slug, testCase.tool, testCase.input),
        `${testCase.slug}:${testCase.tool}`,
      ).rejects.toBeInstanceOf(InvocationValidationError);
    }
  }, 60_000);

  it("rejects unknown tools for every local plugin", async () => {
    for (const slug of slugs) {
      await expect(invokePluginTool(slug, "definitely_not_a_tool", {})).rejects.toBeInstanceOf(InvocationValidationError);
    }
  }, 60_000);

  it("invokes every local plugin tool through the real HTTP API route used by the Web", async () => {
    for (const slug of slugs) {
      const entry = localMcpCatalog[slug]!;
      for (const tool of entry.tools) {
        const sample = sampleInput(slug, tool.name);
        const response = await httpInvoke(slug, tool.name, sample);
        expect(response.status, `${slug}:${tool.name}`).toBe(200);
        const payload = await response.json();
        expect(payload.plugin, `${slug}:${tool.name}`).toBe(entry.id);
        expect(payload.result.isError, `${slug}:${tool.name}`).toBe(false);
        expect(Array.isArray(payload.result.content), `${slug}:${tool.name}`).toBe(true);
        expect(payload.result.content.length, `${slug}:${tool.name}`).toBeGreaterThan(0);
      }
    }
  }, 90_000);

  it("returns HTTP 400 for invalid input on every local plugin API route", async () => {
    for (const slug of slugs) {
      const entry = localMcpCatalog[slug]!;
      const tool = entry.tools[0]!;
      const response = await httpInvoke(slug, tool.name, "not-an-object");
      expect(response.status, slug).toBe(400);
      const payload = await response.json();
      expect(String(payload.error || ""), slug).toMatch(/./);
    }
  }, 90_000);
});

function sampleInput(slug: string, tool: string): Record<string, unknown> {
  if (slug === "local-json-lab" && tool === "format_json") return { text: '{"a":1}' };
  if (slug === "local-json-lab") return { text: '{"a":1}' };
  if (slug === "local-base64-codec" && tool === "encode_base64") return { text: "hi" };
  if (slug === "local-base64-codec") return { text: "aGk=" };
  if (slug === "local-uuid-factory") return { count: 1 };
  if (slug === "local-hash-lab") return { text: "x", algorithm: "sha256" };
  if (slug === "local-url-lab") return { url: "https://example.com/x?y=1" };
  if (slug === "local-regex-lab") return { pattern: "a+", flags: "g", text: "aa ba" };
  if (slug === "local-cron-lab") return { expression: "0 0 * * *" };
  if (slug === "local-markdown-stats") return { text: "# H\n\nword" };
  if (slug === "local-csv-json") return { text: "a,b\n1,2", delimiter: "," };
  if (slug === "local-yaml-lab") return { text: "a: 1" };
  if (slug === "local-text-case") return { text: "Hello World", style: "snake" };
  if (slug === "local-slugify") return { text: "Hello World" };
  if (slug === "local-word-count") return { text: "one two" };
  if (slug === "local-timestamp-lab" && tool === "now") return {};
  if (slug === "local-timestamp-lab" && tool === "from_epoch") return { value: 1_700_000_000, unit: "s" };
  if (slug === "local-timestamp-lab" && tool === "to_epoch") return { value: "2024-01-01T00:00:00.000Z" };
  if (slug === "local-color-lab") return { hex: "#ff00aa" };
  if (slug === "local-jwt-inspect") return { token: "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0." };
  if (slug === "local-html-escape" && tool === "escape_html") return { text: "<a>" };
  if (slug === "local-html-escape") return { text: "&lt;a&gt;" };
  if (slug === "local-percent-codec" && tool === "encode") return { text: "a b" };
  if (slug === "local-percent-codec") return { text: "a%20b" };
  if (slug === "local-number-base") return { value: "10", fromBase: 10, toBase: 2 };
  if (slug === "local-line-tools") return { text: "b\na", mode: "sort" };
  if (slug === "local-semver-lab") return { a: "1.0.0", b: "1.0.1" };
  if (slug === "local-ipv4-check") return { address: "10.0.0.1" };
  if (slug === "local-unit-convert") return { value: 0, from: "c", to: "f" };
  if (slug === "local-password-strength") return { password: "Abcdef1!" };
  if (slug === "local-diff-lab") return { a: "1\n2", b: "1\n3" };
  if (slug === "local-lorem") return { paragraphs: 1, seed: 1 };
  if (slug === "local-bytes-format") return { bytes: 2048 };
  if (slug === "local-querystring" && tool === "parse_query") return { text: "a=1" };
  if (slug === "local-querystring") return { json: '{"a":"1"}' };
  if (slug === "local-markdown-toc") return { text: "# A\n## B" };
  if (slug === "local-json-path") return { text: '{"a":{"b":1}}', path: "a.b" };
  if (slug === "local-roman") return { value: 12 };
  if (slug === "local-whitespace") return { text: "a  b", mode: "spaces" };
  if (slug === "local-emoji-strip") return { text: "hi" };
  if (slug === "local-caesar") return { text: "Ab", shift: 1 };
  if (slug === "local-math-eval") return { expression: "1+2*3" };
  if (slug === "local-random-lab" && tool === "random_int") return { min: 1, max: 3 };
  if (slug === "local-random-lab") return { items: ["red", "green"] };
  if (slug === "local-template-fill") return { template: "Hi {{n}}", json: '{"n":"x"}' };
  if (slug === "local-checksum") return { text: "z" };
  if (slug === "local-path-posix") return { parts: ["a", "b"] };
  if (slug === "local-mime-guess") return { name: "a.json" };
  if (slug === "local-relative-time") return { value: "2020-01-01T00:00:00.000Z" };
  if (slug === "local-table-md") return { json: '[{"a":1}]' };
  return {};
}

const semanticFailureCases: Array<{ slug: string; tool: string; input: Record<string, unknown> }> = [
  { slug: "local-json-lab", tool: "format_json", input: { text: "{not-json" } },
  { slug: "local-url-lab", tool: "parse_url", input: { url: "not-a-url" } },
  { slug: "local-regex-lab", tool: "test_regex", input: { pattern: "(", flags: "g", text: "a" } },
  { slug: "local-jwt-inspect", tool: "decode_jwt", input: { token: "not.jwt" } },
  { slug: "local-unit-convert", tool: "convert_unit", input: { value: 1, from: "c", to: "m" } },
  { slug: "local-math-eval", tool: "evaluate", input: { expression: "process.exit(1)" } },
  { slug: "local-random-lab", tool: "random_int", input: { min: 10, max: 1 } },
  { slug: "local-template-fill", tool: "fill_template", input: { template: "x", json: "[" } },
  { slug: "local-timestamp-lab", tool: "to_epoch", input: { value: "not-a-date" } },
];

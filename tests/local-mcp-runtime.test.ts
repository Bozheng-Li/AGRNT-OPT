import { describe, expect, it } from "vitest";
import { loadPublicCatalog } from "../src/lib/catalog";
import { getPluginAdapter } from "../src/lib/runtime/adapters";
import { InvocationValidationError } from "../src/lib/runtime/errors";
import { invokePluginTool } from "../src/lib/runtime/invoke";
import { listLocalMcpSlugs, localMcpCatalog } from "../src/lib/runtime/local-mcp-tools";

describe("local in-process MCP catalog", () => {
  it("registers every local MCP slug as a public verified mcp-server", () => {
    const slugs = listLocalMcpSlugs();
    expect(slugs.length).toBeGreaterThanOrEqual(40);
    const publicMcp = loadPublicCatalog().filter((plugin) => plugin.kind === "mcp-server");
    for (const slug of slugs) {
      const manifest = publicMcp.find((plugin) => plugin.slug === slug);
      expect(manifest, slug).toBeTruthy();
      expect(manifest?.lifecycle.status).toBe("verified");
      expect(manifest?.web.component).toBe("LocalMcpWorkspace");
      expect(manifest?.runtime.transport).toBe("in-process");
      expect(getPluginAdapter(slug)?.mode).toBe("in-process");
    }
  });

  it("executes a real primary tool for every local MCP through invokePluginTool", async () => {
    for (const slug of listLocalMcpSlugs()) {
      const entry = localMcpCatalog[slug]!;
      const tool = entry.tools[0]!;
      const sample = sampleInput(slug, tool.name);
      const result = await invokePluginTool(slug, tool.name, sample);
      expect(result.isError, slug).toBe(false);
      expect(result.content.length, slug).toBeGreaterThan(0);
    }
  }, 60_000);

  it("rejects invalid input on representative tools", async () => {
    await expect(invokePluginTool("local-json-lab", "format_json", { text: "{bad" })).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
    await expect(invokePluginTool("local-math-eval", "evaluate", { expression: "process.exit(1)" })).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
    await expect(invokePluginTool("local-url-lab", "parse_url", { url: "not-a-url" })).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
  });
});

function sampleInput(slug: string, tool: string): Record<string, unknown> {
  if (slug === "local-json-lab" && tool === "format_json") return { text: '{"a":1}' };
  if (slug === "local-base64-codec" && tool === "encode_base64") return { text: "hi" };
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
  if (slug === "local-color-lab") return { hex: "#ff00aa" };
  if (slug === "local-jwt-inspect")
    return { token: "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0." };
  if (slug === "local-html-escape" && tool === "escape_html") return { text: "<a>" };
  if (slug === "local-percent-codec" && tool === "encode") return { text: "a b" };
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
  if (slug === "local-markdown-toc") return { text: "# A\n## B" };
  if (slug === "local-json-path") return { text: '{"a":{"b":1}}', path: "a.b" };
  if (slug === "local-roman") return { value: 12 };
  if (slug === "local-whitespace") return { text: "a  b", mode: "spaces" };
  if (slug === "local-emoji-strip") return { text: "hi" };
  if (slug === "local-caesar") return { text: "Ab", shift: 1 };
  if (slug === "local-math-eval") return { expression: "1+2*3" };
  if (slug === "local-random-lab" && tool === "random_int") return { min: 1, max: 3 };
  if (slug === "local-template-fill") return { template: "Hi {{n}}", json: '{"n":"x"}' };
  if (slug === "local-checksum") return { text: "z" };
  if (slug === "local-path-posix") return { parts: ["a", "b"] };
  if (slug === "local-mime-guess") return { name: "a.json" };
  if (slug === "local-relative-time") return { value: "2020-01-01T00:00:00.000Z" };
  if (slug === "local-table-md") return { json: '[{"a":1}]' };
  return {};
}

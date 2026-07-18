import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, test } from "vitest";
import type { AdapterContext, AdapterToolResult } from "@/lib/runtime/adapters";
import { crossrefAdapter } from "@/lib/runtime/crossref-adapter";
import {
  closePluginSessions,
  invokePluginTool,
  listPluginTools,
} from "@/lib/runtime/invoke";

const execFileAsync = promisify(execFile);
const slug = "crossref-scholarly-metadata-lab";
const roots: string[] = [];

type CrossrefTestContext = AdapterContext & { crossrefRoot: string };

async function context(): Promise<CrossrefTestContext> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-crossref-"));
  roots.push(root);
  return { crossrefRoot: root };
}

async function connected(ctx: CrossrefTestContext): Promise<Client> {
  const launch = await crossrefAdapter.prepare(ctx);
  const transport = new StdioClientTransport({
    ...launch,
    env: { ...getDefaultEnvironment(), ...launch.env },
    stderr: "pipe",
  });
  const client = new Client({ name: "agent-opt-crossref-test", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

afterEach(async () => {
  await closePluginSessions(slug);
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Crossref MCP 0.2.0 integration", () => {
  test("discovers seven tools, exposes no resources or prompts, and runs the complete anonymous research chain", async () => {
    const ctx = await context();
    const tools = await listPluginTools(slug, ctx);
    expect(tools.map((tool) => tool.name)).toEqual([
      "crossref_get_work",
      "crossref_get_references",
      "crossref_search_works",
      "crossref_search_journals",
      "crossref_search_funders",
      "crossref_get_member",
      "crossref_get_prefix",
    ]);
    expect(tools.every((tool) => (
      tool as { annotations?: { readOnlyHint?: boolean } }
    ).annotations?.readOnlyHint === true)).toBe(true);

    const protocol = await connected(ctx);
    try {
      expect((await protocol.listResources()).resources).toEqual([]);
      expect((await protocol.listResourceTemplates()).resourceTemplates).toEqual([]);
      expect((await protocol.listPrompts()).prompts).toEqual([]);
    } finally {
      await protocol.close().catch(() => undefined);
    }

    const searched = await invokePluginTool(slug, "crossref_search_works", {
      queryTitle: "Array programming with NumPy",
      rows: 2,
      fields: [
        "title",
        "author",
        "published",
        "type",
        "container-title",
        "publisher",
        "is-referenced-by-count",
      ],
    }, ctx);
    const searchPayload = searched.structuredContent as {
      totalResults: number;
      returned: number;
      works: Array<{ doi: string; title?: string }>;
    };
    expect(searchPayload.totalResults).toBeGreaterThan(0);
    expect(searchPayload.returned).toBe(2);
    expect(searchPayload.works).toEqual(expect.arrayContaining([
      expect.objectContaining({ doi: "10.1038/s41586-020-2649-2", title: "Array programming with NumPy" }),
    ]));

    const work = await invokePluginTool(slug, "crossref_get_work", { doi: "10.1038/nature12373" }, ctx);
    expect(work.structuredContent).toMatchObject({
      doi: "10.1038/nature12373",
      title: "Nanometre-scale thermometry in a living cell",
      type: "journal-article",
      publisher: "Springer Science and Business Media LLC",
    });
    expect((work.structuredContent?.authors as unknown[]).length).toBeGreaterThan(5);
    expect(Number(work.structuredContent?.referencesCount)).toBeGreaterThan(20);

    const references = await invokePluginTool(slug, "crossref_get_references", {
      doi: "10.1038/nature12373",
    }, ctx);
    expect(references.structuredContent).toMatchObject({ doi: "10.1038/nature12373" });
    expect(Number(references.structuredContent?.referenceCount)).toBeGreaterThan(20);
    expect(references.structuredContent?.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ doi: "10.3402/nano.v3i0.11586" }),
    ]));

    const prefix = await invokePluginTool(slug, "crossref_get_prefix", { prefix: "10.1038" }, ctx);
    expect(prefix.structuredContent).toEqual({
      prefix: "10.1038",
      ownerName: "Springer Science and Business Media LLC",
      memberId: 297,
    });

    const member = await invokePluginTool(slug, "crossref_get_member", { member_id: 297 }, ctx);
    expect(member.structuredContent).toMatchObject({
      id: 297,
      primaryName: "Springer Science and Business Media LLC",
      deposits: true,
      depositsArticles: true,
    });
    expect((member.structuredContent?.prefixes as unknown[]).length).toBeGreaterThan(20);
    expect(Number((member.structuredContent?.counts as { totalDois?: number }).totalDois)).toBeGreaterThan(1_000_000);

    const journals = await invokePluginTool(slug, "crossref_search_journals", {
      issn: "1476-4687",
      include_works: true,
      rows: 2,
    }, ctx);
    expect(journals.structuredContent).toMatchObject({
      journalCount: 1,
      journals: [expect.objectContaining({
        title: "Nature",
        publisher: "Springer Science and Business Media LLC",
      })],
    });
    expect((journals.structuredContent?.recentWorks as unknown[])).toHaveLength(2);

    const funders = await invokePluginTool(slug, "crossref_search_funders", {
      funder_doi: "https://doi.org/10.13039/100000001",
      include_works: false,
      rows: 2,
    }, ctx);
    expect(funders.structuredContent).toMatchObject({
      funderCount: 1,
      funders: [expect.objectContaining({
        id: "100000001",
        name: "National Science Foundation",
        country: "United States",
      })],
    });
    expect(funders.structuredContent).not.toHaveProperty("fundedWorks");
  }, 180_000);

  test("preserves controlled upstream failures and rejects unsafe or unbounded public inputs", async () => {
    const ctx = await context();
    const missing = await invokePluginTool(slug, "crossref_get_work", {
      doi: "10.9999/agent-opt-definitely-not-a-real-doi-20260718",
    }, ctx);
    expect(missing.isError).toBe(true);
    expect(missing.structuredContent).toBeUndefined();
    expect(JSON.stringify(missing.content)).toContain("No Crossref record");

    const badFilter = await invokePluginTool(slug, "crossref_search_works", {
      query: "test",
      rows: 1,
      filter: { "not-a-real-filter": "true" },
    }, ctx);
    expect(badFilter.isError).toBe(true);
    expect(JSON.stringify(badFilter.content)).toMatch(/Crossref|filter|rejected/i);

    const transformed = await crossrefAdapter.validateAndTransform("crossref_search_works", {
      queryTitle: "NumPy",
      rows: 2,
      fields: ["title"],
    }, ctx);
    expect(transformed.fields).toEqual(["DOI", "title"]);
    expect(await crossrefAdapter.validateAndTransform("crossref_search_funders", {
      funder_doi: "doi:10.13039/100000001",
      rows: 2,
    }, ctx)).toMatchObject({ funder_doi: "10.13039/100000001" });

    const tooManyFilters = Object.fromEntries(
      Array.from({ length: 13 }, (_, index) => [`filter-${index}`, "true"]),
    );
    const invalid: Array<[string, Record<string, unknown>]> = [
      ["crossref_get_work", { doi: "https://doi.org/10.1038/nature12373" }],
      ["crossref_get_work", { doi: "10.1038/nature12373", baseUrl: "https://example.com" }],
      ["crossref_search_works", { query: "x".repeat(501), rows: 1 }],
      ["crossref_search_works", { rows: 1 }],
      ["crossref_search_works", { query: "test", rows: 11 }],
      ["crossref_search_works", { query: "test", rows: 1, fields: ["URL"] }],
      ["crossref_search_works", { query: "test", rows: 1, filter: tooManyFilters }],
      ["crossref_search_works", { query: "test", rows: 1, filter: { type: "journal-article,from-pub-date:2024" } }],
      ["crossref_search_works", { query: "test", rows: 1, cursor: "*", offset: 1 }],
      ["crossref_search_works", { query: "test", rows: 10, offset: 9_995 }],
      ["crossref_search_works", { query: "test", rows: 1, order: "desc" }],
      ["crossref_search_journals", { query: "Nature", issn: "1476-4687", rows: 2 }],
      ["crossref_search_journals", { rows: 2 }],
      ["crossref_search_journals", { query: "Nature", include_works: true, rows: 2 }],
      ["crossref_search_funders", { rows: 2 }],
      ["crossref_search_funders", { query: "National", include_works: true, rows: 2 }],
      ["crossref_search_funders", { funder_doi: "10.13039/100000001", include_works: true, rows: 2 }],
      ["crossref_get_member", { member_id: 1_000_000_001 }],
      ["crossref_get_prefix", { prefix: "10.12" }],
      ["unknown_tool", {}],
    ];
    for (const [tool, input] of invalid) {
      await expect(crossrefAdapter.validateAndTransform(tool, input, ctx)).rejects.toThrow();
    }

    await expect(crossrefAdapter.normalizeResult!(
      "crossref_get_prefix",
      { content: [], structuredContent: { ownerName: "missing prefix" }, isError: false },
      ctx,
    )).rejects.toThrow(/协议结构/);
    await expect(crossrefAdapter.normalizeResult!(
      "crossref_get_prefix",
      {
        content: [],
        structuredContent: { prefix: "10.1038", ownerName: "x".repeat(4 * 1024 * 1024 + 1) },
        isError: false,
      } as AdapterToolResult,
      ctx,
    )).rejects.toThrow(/4 MiB/);
  }, 90_000);

  test("rejects linked runtime roots and proves fixed-origin, credential-free process boundaries", async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), "agent-opt-crossref-target-"));
    const link = path.join(os.tmpdir(), `agent-opt-crossref-link-${Date.now()}`);
    roots.push(target, link);
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    await expect(crossrefAdapter.prepare({ crossrefRoot: link } as CrossrefTestContext)).rejects.toThrow(/符号链接|目录联接/);

    const ctx = await context();
    const launch = await crossrefAdapter.prepare(ctx);
    expect(launch.env).toMatchObject({
      MCP_TRANSPORT_TYPE: "stdio",
      CROSSREF_BASE_URL: "https://api.crossref.org",
      CROSSREF_TIMEOUT_MS: "15000",
      NODE_USE_ENV_PROXY: "0",
    });
    expect(launch.env).not.toHaveProperty("CROSSREF_MAILTO");
    expect(launch.env).not.toHaveProperty("HTTPS_PROXY");

    const { stdout, stderr } = await execFileAsync(launch.command, launch.args, {
      cwd: launch.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        ...launch.env,
        AGENT_OPT_CROSSREF_SECURITY_PROBE: "1",
        CROSSREF_BASE_URL: "http://127.0.0.1:9",
        CROSSREF_MAILTO: "private@example.com",
        HTTPS_PROXY: "http://proxy.invalid:8080",
        NODE_USE_ENV_PROXY: "1",
        NPM_TOKEN: "must-not-survive",
        OPENAI_API_KEY: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      packagePinned: true,
      fixedOriginAccepted: true,
      redirectRejected: true,
      customHostDenied: true,
      customPathDenied: true,
      queryKeyDenied: true,
      methodDenied: true,
      requestObjectDenied: true,
      credentialHeaderDenied: true,
      hostReadDenied: true,
      writeDenied: true,
      subprocessDenied: true,
      workerDenied: true,
      baseUrlForced: true,
      mailtoRemoved: true,
      proxyRemoved: true,
      credentialRemoved: true,
    });
  }, 60_000);
});

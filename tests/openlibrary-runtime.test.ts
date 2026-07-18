import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import {
  invokePluginTool,
  listPluginProtocolAssets,
  listPluginTools,
  readPluginResource,
} from "@/lib/runtime/invoke";
import type { AdapterContext } from "@/lib/runtime/adapters";
import { openLibraryAdapter, validatedOpenLibraryProxy } from "@/lib/runtime/openlibrary-adapter";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function context(): Promise<AdapterContext> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-opt-openlibrary-"));
  roots.push(root);
  return { openLibraryRoot: root };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OpenLibrary MCP 0.1.18 integration", () => {
  test("discovers nine tools, two templates, and runs the complete book research chain", async () => {
    const ctx = await context();
    const tools = await listPluginTools("openlibrary-research-desk", ctx);
    expect(tools.map((tool) => tool.name)).toEqual([
      "openlibrary_search_books",
      "openlibrary_get_work",
      "openlibrary_get_editions",
      "openlibrary_get_edition",
      "openlibrary_search_authors",
      "openlibrary_get_author",
      "openlibrary_get_author_works",
      "openlibrary_get_subject",
      "openlibrary_get_cover_url",
    ]);

    const assets = await listPluginProtocolAssets("openlibrary-research-desk", ctx);
    expect(assets.resources).toEqual([]);
    expect(assets.prompts).toEqual([]);
    expect(assets.resourceTemplates.map((item) => item.uriTemplate)).toEqual([
      "openlibrary://works/{work_id}",
      "openlibrary://authors/{author_id}",
    ]);

    const searched = await invokePluginTool("openlibrary-research-desk", "openlibrary_search_books", {
      query: "The Hobbit",
      sort: "relevance",
      limit: 2,
      offset: 0,
      include_availability: false,
    }, ctx);
    const searchPayload = searched.structuredContent as { total: number; works: Array<Record<string, unknown>> };
    expect(searchPayload.total).toBeGreaterThan(100);
    expect(searchPayload.works).toEqual(expect.arrayContaining([
      expect.objectContaining({ work_id: "OL27482W", title: "The Hobbit" }),
    ]));

    const work = await invokePluginTool("openlibrary-research-desk", "openlibrary_get_work", { work_id: "OL27482W" }, ctx);
    expect(work.structuredContent).toMatchObject({ work_id: "OL27482W", title: "The Hobbit" });
    expect((work.structuredContent?.subjects as unknown[]).length).toBeGreaterThan(20);

    const editions = await invokePluginTool("openlibrary-research-desk", "openlibrary_get_editions", {
      work_id: "OL27482W", limit: 2, offset: 0,
    }, ctx);
    const editionsPayload = editions.structuredContent as { total: number; editions: Array<{ edition_id: string }> };
    expect(editionsPayload.total).toBeGreaterThan(100);
    expect(editionsPayload.editions).toHaveLength(2);

    const edition = await invokePluginTool("openlibrary-research-desk", "openlibrary_get_edition", {
      identifier: editionsPayload.editions[0].edition_id,
      id_type: "olid",
    }, ctx);
    expect(edition.structuredContent).toMatchObject({ edition_id: editionsPayload.editions[0].edition_id });

    const authorSearch = await invokePluginTool("openlibrary-research-desk", "openlibrary_search_authors", {
      query: "J. R. R. Tolkien", limit: 2, offset: 0,
    }, ctx);
    expect(authorSearch.structuredContent).toMatchObject({
      authors: expect.arrayContaining([expect.objectContaining({ author_id: "OL26320A", name: "J.R.R. Tolkien" })]),
    });

    const author = await invokePluginTool("openlibrary-research-desk", "openlibrary_get_author", { author_id: "OL26320A" }, ctx);
    expect(author.structuredContent).toMatchObject({ author_id: "OL26320A", name: "J.R.R. Tolkien" });

    const authorWorks = await invokePluginTool("openlibrary-research-desk", "openlibrary_get_author_works", {
      author_id: "OL26320A", limit: 2, offset: 0,
    }, ctx);
    expect(authorWorks.structuredContent).toMatchObject({ author_id: "OL26320A" });
    expect((authorWorks.structuredContent?.works as unknown[])).toHaveLength(2);

    const subject = await invokePluginTool("openlibrary-research-desk", "openlibrary_get_subject", {
      subject: "science fiction", limit: 2, offset: 0,
    }, ctx);
    expect(subject.structuredContent).toMatchObject({ subject_key: "science_fiction" });
    expect(Number(subject.structuredContent?.work_count)).toBeGreaterThan(1_000);

    const cover = await invokePluginTool("openlibrary-research-desk", "openlibrary_get_cover_url", {
      identifier: "14627509", id_type: "id", target: "book", size: "M",
    }, ctx);
    expect(cover.structuredContent).toMatchObject({ url: "https://covers.openlibrary.org/b/id/14627509-M.jpg" });

    const workResource = await readPluginResource("openlibrary-research-desk", "openlibrary://works/OL27482W", ctx);
    expect(workResource.contents[0]).toMatchObject({ uri: "openlibrary://works/OL27482W", mimeType: "application/json" });
    expect(workResource.contents[0].text).toContain("The Hobbit");
    const authorResource = await readPluginResource("openlibrary-research-desk", "openlibrary://authors/OL26320A", ctx);
    expect(authorResource.contents[0].text).toContain("J.R.R. Tolkien");
  }, 180_000);

  test("preserves the upstream error-schema defect and rejects unsafe public inputs before launch", async () => {
    const ctx = await context();
    await expect(invokePluginTool("openlibrary-research-desk", "openlibrary_get_work", {
      work_id: "OL999999999999W",
    }, ctx)).rejects.toThrow(/Structured content does not match|not found|output schema/i);

    const invalid: Array<[string, Record<string, unknown>]> = [
      ["openlibrary_search_books", { query: "", limit: 10 }],
      ["openlibrary_search_books", { query: "Hobbit", limit: 100 }],
      ["openlibrary_search_books", { query: "Hobbit", baseUrl: "https://example.com" }],
      ["openlibrary_get_work", { work_id: "/works/OL27482W" }],
      ["openlibrary_get_editions", { work_id: "../OL27482W", limit: 2, offset: 0 }],
      ["openlibrary_get_edition", { identifier: "not-an-isbn", id_type: "isbn" }],
      ["openlibrary_get_author", { author_id: "OL26320W" }],
      ["openlibrary_get_subject", { subject: "fiction\u0000admin", limit: 2, offset: 0 }],
      ["openlibrary_get_cover_url", { identifier: "../secret", id_type: "id", target: "book", size: "M" }],
      ["openlibrary_get_cover_url", { identifier: "9780000000000", id_type: "isbn", target: "author", size: "M" }],
    ];
    for (const [tool, input] of invalid) {
      await expect(openLibraryAdapter.validateAndTransform(tool, input, ctx)).rejects.toThrow();
    }
    await expect(openLibraryAdapter.validateResourceUri!("openlibrary://works/../../etc/passwd", ctx)).rejects.toThrow();
    await expect(openLibraryAdapter.validateResourceUri!("https://openlibrary.org/works/OL27482W", ctx)).rejects.toThrow();
  }, 60_000);

  test("validates deployment proxy configuration and proves fixed-origin process boundaries", async () => {
    expect(validatedOpenLibraryProxy({ HTTPS_PROXY: "http://127.0.0.1:7897" })).toBe("http://127.0.0.1:7897/");
    expect(() => validatedOpenLibraryProxy({ HTTPS_PROXY: "http://user:pass@proxy.example" })).toThrow();
    expect(() => validatedOpenLibraryProxy({ HTTPS_PROXY: "http://a.example", https_proxy: "http://b.example" })).toThrow();

    const target = await mkdtemp(path.join(os.tmpdir(), "agent-opt-openlibrary-target-"));
    const parent = await mkdtemp(path.join(os.tmpdir(), "agent-opt-openlibrary-parent-"));
    roots.push(target, parent);
    const link = path.join(parent, "runtime-link");
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    await expect(openLibraryAdapter.prepare({ openLibraryRoot: link })).rejects.toThrow(/符号链接|目录联接/);

    const ctx = await context();
    const launch = await openLibraryAdapter.prepare(ctx);
    const { stdout, stderr } = await execFileAsync(launch.command, launch.args, {
      cwd: launch.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        ...launch.env,
        AGENT_OPT_OPENLIBRARY_SECURITY_PROBE: "1",
        NPM_TOKEN: "must-not-survive",
        OPENAI_API_KEY: "must-not-survive",
      },
    });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      fixedOriginAccepted: true,
      redirectForced: true,
      customHostDenied: true,
      customPathDenied: true,
      credentialHeaderDenied: true,
      httpDenied: true,
      subprocessDenied: true,
      proxyRemoved: true,
      credentialRemoved: true,
    });
  }, 60_000);
});

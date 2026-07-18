import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPluginAdapter } from "../src/lib/runtime/adapters";
import { InvocationValidationError } from "../src/lib/runtime/errors";
import { closePluginSessions, invokePluginTool, listPluginTools } from "../src/lib/runtime/invoke";

function textOf(result: Awaited<ReturnType<typeof invokePluginTool>>) {
  return result.content
    .map((block) => block && typeof block === "object" && "text" in block ? String(block.text) : JSON.stringify(block))
    .join("\n");
}

function structuredOf(result: Awaited<ReturnType<typeof invokePluginTool>>): Record<string, unknown> {
  return result.structuredContent ?? {};
}

type SvelteNetworkPolicyModule = {
  assertSvelteNetworkRequest(input: string | URL | Request, init?: RequestInit): URL;
  createSvelteNetworkFetch(
    fetchImplementation: (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<Response | { redirected?: boolean }>,
  ): (input: string | URL | Request, init?: RequestInit) => Promise<Response | { redirected?: boolean }>;
};

async function loadSvelteNetworkPolicy(): Promise<SvelteNetworkPolicyModule> {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "svelte-network-policy.mjs")).href;
  return await import(/* @vite-ignore */ moduleUrl) as SvelteNetworkPolicyModule;
}

describe("real MCP stdio integrations", () => {
  let temporaryRoot: string;
  let filesystemRoot: string;
  let memoryFile: string;

  beforeAll(async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-opt-runtime-"));
    filesystemRoot = path.join(temporaryRoot, "filesystem");
    memoryFile = path.join(temporaryRoot, "memory", "memory.jsonl");
  });

  afterAll(async () => {
    await closePluginSessions();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("discovers the curated upstream tools", async () => {
    const gitRoot = path.join(temporaryRoot, "git-discover");
    const sqliteDatabase = path.join(temporaryRoot, "sqlite-discover", "probe.db");
    const defluffRoot = path.join(temporaryRoot, "defluff-discover");
    const mermaidRoot = path.join(temporaryRoot, "mermaid-discover");
    const blueprintRoot = path.join(temporaryRoot, "blueprint-discover");
    const oxidizeRoot = path.join(temporaryRoot, "oxidize-discover");
    const bumpguardRoot = path.join(temporaryRoot, "bumpguard-discover");
    const svelteRoot = path.join(temporaryRoot, "svelte-discover-all");
    const [filesystemTools, memoryTools, thinkingTools, timeTools, fetchTools, gitTools, sqliteTools, defluffTools, mermaidTools, blueprintTools, oxidizeTools, bumpguardTools, svelteTools] = await Promise.all([
      listPluginTools("filesystem-workbench", { filesystemRoot }),
      listPluginTools("knowledge-memory", { memoryFile }),
      listPluginTools("sequential-thinking-studio"),
      listPluginTools("timezone-converter"),
      listPluginTools("web-content-reader"),
      listPluginTools("git-sandbox-studio", { gitRoot }),
      listPluginTools("sqlite-workbench", { sqliteDatabase }),
      listPluginTools("prose-defluffer", { defluffRoot }),
      listPluginTools("mermaid-diagram-studio", { mermaidRoot }),
      listPluginTools("blueprint-chart-studio", { blueprintRoot }),
      listPluginTools("oxidize-pdf-workbench", { oxidizeRoot }),
      listPluginTools("bumpguard-dependency-lab", { bumpguardRoot }),
      listPluginTools("svelte-development-studio", { svelteRoot }),
    ]);
    expect(filesystemTools.map((tool) => tool.name)).toContain("read_text_file");
    expect(memoryTools.map((tool) => tool.name)).toContain("create_entities");
    expect(thinkingTools.map((tool) => tool.name)).toEqual(["sequentialthinking"]);
    expect(timeTools.map((tool) => tool.name)).toEqual(["get_current_time", "convert_time"]);
    expect(fetchTools.map((tool) => tool.name)).toEqual(["fetch"]);
    expect(gitTools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["git_status", "git_log", "git_add", "git_commit"]));
    expect(sqliteTools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["read_query", "write_query", "create_table", "list_tables", "describe_table"]),
    );
    expect(defluffTools.map((tool) => tool.name)).toEqual(["slop_detect", "slop_add", "slop_ignore"]);
    expect(mermaidTools.map((tool) => tool.name)).toEqual(["execute", "render_png", "describe"]);
    expect(blueprintTools.map((tool) => tool.name)).toEqual([
      "validate_dsl",
      "inspect_dsl",
      "recommend_chart_type",
      "render",
      "list_chart_types",
      "describe_chart_type",
      "get_example",
      "search_examples",
      "list_palettes",
      "get_grammar",
      "export_chart",
    ]);
    expect(oxidizeTools.map((tool) => tool.name)).toEqual([
      "read_pdf",
      "extract_text",
      "convert_pdf",
      "analyze_pdf",
      "extract_entities",
      "manipulate_pdf",
      "annotate_pdf",
      "manage_forms",
      "secure_pdf",
      "create_pdf",
      "add_pdf_content",
      "save_pdf",
    ]);
    expect(bumpguardTools.map((tool) => tool.name)).toEqual([
      "check_upgrade",
      "diff_versions",
      "verify_snippet",
      "check_import",
      "list_symbols",
      "list_languages",
    ]);
    expect(svelteTools.map((tool) => tool.name).sort()).toEqual([
      "get-documentation",
      "list-sections",
      "playground-link",
      "svelte-autofixer",
    ]);
  });

  it("writes, reads, lists, and searches inside the filesystem sandbox", async () => {
    const context = { filesystemRoot };
    const createDirectory = await invokePluginTool("filesystem-workbench", "create_directory", { path: "notes" }, context);
    expect(createDirectory.isError).toBe(false);
    const write = await invokePluginTool("filesystem-workbench", "write_file", { path: "notes/demo.txt", content: "Agent-OPT verified" }, context);
    expect(write.isError).toBe(false);

    const read = await invokePluginTool("filesystem-workbench", "read_text_file", { path: "notes/demo.txt" }, context);
    expect(textOf(read)).toContain("Agent-OPT verified");

    const list = await invokePluginTool("filesystem-workbench", "list_directory", { path: "notes" }, context);
    expect(textOf(list)).toContain("demo.txt");

    const search = await invokePluginTool("filesystem-workbench", "search_files", { path: ".", pattern: "**/*.txt", excludePatterns: [] }, context);
    expect(textOf(search)).toContain("demo.txt");
  });

  it("returns an upstream error for a missing file and blocks traversal before spawning", async () => {
    const missing = await invokePluginTool("filesystem-workbench", "read_text_file", { path: "missing.txt" }, { filesystemRoot });
    expect(missing.isError).toBe(true);
    await expect(invokePluginTool("filesystem-workbench", "read_text_file", { path: "../outside.txt" }, { filesystemRoot })).rejects.toBeInstanceOf(InvocationValidationError);
  });

  it("persists entities and relations and can search the memory graph", async () => {
    const context = { memoryFile };
    const entities = await invokePluginTool("knowledge-memory", "create_entities", {
      entities: [
        { name: "Agent-OPT", entityType: "project", observations: ["聚合高质量 Agent 插件"] },
        { name: "MCP", entityType: "protocol", observations: ["提供结构化工具协议"] }
      ],
    }, context);
    expect(entities.isError).toBe(false);

    const relation = await invokePluginTool("knowledge-memory", "create_relations", {
      relations: [{ from: "Agent-OPT", to: "MCP", relationType: "integrates" }],
    }, context);
    expect(relation.isError).toBe(false);

    const search = await invokePluginTool("knowledge-memory", "search_nodes", { query: "高质量" }, context);
    expect(textOf(search)).toContain("Agent-OPT");

    const graph = await invokePluginTool("knowledge-memory", "read_graph", {}, context);
    expect(textOf(graph)).toContain("integrates");
    expect(await readFile(memoryFile, "utf8")).toContain("Agent-OPT");
  });

  it("reports a real memory error for an unknown entity", async () => {
    const response = await invokePluginTool("knowledge-memory", "add_observations", {
      observations: [{ entityName: "missing-entity", contents: ["should fail"] }],
    }, { memoryFile });
    expect(response.isError).toBe(true);
  });

  it("records normal, revision, and branch metadata through sequential thinking", async () => {
    const first = await invokePluginTool("sequential-thinking-studio", "sequentialthinking", {
      thought: "明确聚合平台的质量门槛",
      nextThoughtNeeded: true,
      thoughtNumber: 1,
      totalThoughts: 3,
    });
    expect(first.isError).toBe(false);
    expect(textOf(first)).toContain("thoughtNumber");

    const revision = await invokePluginTool("sequential-thinking-studio", "sequentialthinking", {
      thought: "补充每个插件必须有独立 Web 适配",
      nextThoughtNeeded: false,
      thoughtNumber: 2,
      totalThoughts: 2,
      isRevision: true,
      revisesThought: 1,
      branchFromThought: 1,
      branchId: "quality-first",
    });
    expect(revision.isError).toBe(false);
    expect(textOf(revision)).toContain("quality-first");
  });

  it("rejects invalid sequential-thinking metadata locally", async () => {
    await expect(invokePluginTool("sequential-thinking-studio", "sequentialthinking", {
      thought: "invalid",
      nextThoughtNeeded: true,
      thoughtNumber: 0,
      totalThoughts: 1,
    })).rejects.toBeInstanceOf(InvocationValidationError);
  });

  it("keeps sequential-thinking inputs on a fixed, privilege-free launch boundary", async () => {
    const adapter = getPluginAdapter("sequential-thinking-studio");
    expect(adapter).toBeDefined();
    const transformed = await adapter!.validateAndTransform("sequentialthinking", {
      thought: "Inspect the permission boundary",
      nextThoughtNeeded: false,
      thoughtNumber: 1,
      totalThoughts: 1,
      path: "C:/sensitive",
      url: "https://example.com",
    }, {});
    expect(transformed).not.toHaveProperty("path");
    expect(transformed).not.toHaveProperty("url");
    const launch = await adapter!.prepare({});
    expect(launch.args).toHaveLength(1);
    expect(launch.env).toEqual({ DISABLE_THOUGHT_LOGGING: "true" });
  });

  it("queries and converts real IANA timezone data", async () => {
    const current = await invokePluginTool("timezone-converter", "get_current_time", { timezone: "Asia/Shanghai" });
    expect(current.isError).toBe(false);
    expect(textOf(current)).toContain("Asia/Shanghai");

    const converted = await invokePluginTool("timezone-converter", "convert_time", {
      source_timezone: "Asia/Shanghai",
      time: "09:00",
      target_timezone: "America/New_York",
    });
    expect(converted.isError).toBe(false);
    expect(textOf(converted)).toContain("America/New_York");
  });

  it("rejects invalid timezone names and time syntax before spawning", async () => {
    await expect(invokePluginTool("timezone-converter", "get_current_time", { timezone: "Mars/Olympus" })).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("timezone-converter", "convert_time", {
      source_timezone: "Asia/Shanghai",
      time: "25:61",
      target_timezone: "UTC",
    })).rejects.toBeInstanceOf(InvocationValidationError);
  });

  it("keeps the time adapter on a fixed Python module boundary", async () => {
    const adapter = getPluginAdapter("timezone-converter");
    expect(adapter).toBeDefined();
    const launch = await adapter!.prepare({});
    expect(launch.args).toEqual(["-m", "mcp_server_time"]);
    expect(launch.env).toBeUndefined();
  });

  it("fetches and simplifies a real public Web page with bounded output", async () => {
    const fetched = await invokePluginTool("web-content-reader", "fetch", {
      url: "https://example.com/",
      max_length: 2_000,
      start_index: 0,
      raw: false,
    });
    expect(fetched.isError).toBe(false);
    expect(textOf(fetched)).toContain("Example Domain");
    expect(textOf(fetched).length).toBeLessThan(3_000);

    const rawPage = await invokePluginTool("web-content-reader", "fetch", {
      url: "https://example.com/",
      max_length: 180,
      start_index: 40,
      raw: true,
    });
    expect(rawPage.isError).toBe(false);
    expect(textOf(rawPage)).toContain("raw content");
    expect(textOf(rawPage)).toContain("Content truncated");
    expect(textOf(rawPage)).toContain("start_index");
  });

  it.each([
    "file:///etc/passwd",
    "http://localhost/",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://user:password@example.com/",
    "https://does-not-exist.invalid/",
  ])("blocks an unsafe or unresolvable fetch target: %s", async (url) => {
    await expect(invokePluginTool("web-content-reader", "fetch", { url, max_length: 1000, start_index: 0, raw: false })).rejects.toBeInstanceOf(InvocationValidationError);
  });

  it("stages, commits, and inspects history inside a Git sandbox", async () => {
    const gitRoot = path.join(temporaryRoot, "git-repo");
    const context = { gitRoot };
    const { mkdir, writeFile } = await import("node:fs/promises");
    const adapter = getPluginAdapter("git-sandbox-studio");
    expect(adapter).toBeDefined();
    await adapter!.prepare(context);
    await mkdir(gitRoot, { recursive: true });
    await writeFile(path.join(gitRoot, "README.md"), "# Agent-OPT Git sandbox\n", "utf8");

    const statusBefore = await invokePluginTool("git-sandbox-studio", "git_status", {}, context);
    expect(statusBefore.isError).toBe(false);
    expect(textOf(statusBefore).toLowerCase()).toMatch(/untracked|readme|working|nothing|changes|branch/i);

    const add = await invokePluginTool("git-sandbox-studio", "git_add", { files: ["README.md"] }, context);
    expect(add.isError).toBe(false);

    const commit = await invokePluginTool(
      "git-sandbox-studio",
      "git_commit",
      { message: "test: seed sandbox repository" },
      context,
    );
    expect(commit.isError).toBe(false);

    const log = await invokePluginTool("git-sandbox-studio", "git_log", { max_count: 5 }, context);
    expect(log.isError).toBe(false);
    expect(textOf(log)).toContain("seed sandbox repository");

    const createBranch = await invokePluginTool(
      "git-sandbox-studio",
      "git_create_branch",
      { branch_name: "feature/runtime-test", base_branch: null },
      context,
    );
    expect(createBranch.isError).toBe(false);

    const checkout = await invokePluginTool(
      "git-sandbox-studio",
      "git_checkout",
      { branch_name: "feature/runtime-test" },
      context,
    );
    expect(checkout.isError).toBe(false);

    const branches = await invokePluginTool("git-sandbox-studio", "git_branch", { branch_type: "local" }, context);
    expect(branches.isError).toBe(false);
    expect(textOf(branches)).toContain("feature/runtime-test");

    await writeFile(path.join(gitRoot, "notes.txt"), "second change\n", "utf8");
    await invokePluginTool("git-sandbox-studio", "git_add", { files: ["notes.txt"] }, context);
    const diff = await invokePluginTool("git-sandbox-studio", "git_diff_staged", { context_lines: 2 }, context);
    expect(diff.isError).toBe(false);
    expect(textOf(diff)).toMatch(/notes\.txt|second change|\+\+\+|diff/i);

    const reset = await invokePluginTool("git-sandbox-studio", "git_reset", {}, context);
    expect(reset.isError).toBe(false);
    const stagedAfterReset = await invokePluginTool("git-sandbox-studio", "git_diff_staged", { context_lines: 2 }, context);
    expect(stagedAfterReset.isError).toBe(false);
    expect(textOf(stagedAfterReset)).not.toContain("second change");

    await invokePluginTool("git-sandbox-studio", "git_add", { files: ["notes.txt"] }, context);
    const secondCommit = await invokePluginTool(
      "git-sandbox-studio",
      "git_commit",
      { message: "test: add branch note" },
      context,
    );
    expect(secondCommit.isError).toBe(false);

    const show = await invokePluginTool("git-sandbox-studio", "git_show", { revision: "HEAD" }, context);
    expect(show.isError).toBe(false);
    expect(textOf(show)).toMatch(/add branch note|notes\.txt|second change/i);

    const revisionDiff = await invokePluginTool(
      "git-sandbox-studio",
      "git_diff",
      { target: "HEAD~1", context_lines: 2 },
      context,
    );
    expect(revisionDiff.isError).toBe(false);
    expect(textOf(revisionDiff)).toMatch(/notes\.txt|second change/i);

    await writeFile(path.join(gitRoot, "README.md"), "# Agent-OPT Git sandbox\nunstaged\n", "utf8");
    const unstaged = await invokePluginTool("git-sandbox-studio", "git_diff_unstaged", { context_lines: 2 }, context);
    expect(unstaged.isError).toBe(false);
    expect(textOf(unstaged)).toContain("unstaged");
  }, 90_000);

  it("rejects host paths and empty commit messages before Git MCP invocation", async () => {
    const gitRoot = path.join(temporaryRoot, "git-security");
    await expect(
      invokePluginTool("git-sandbox-studio", "git_add", { files: ["../outside.txt"] }, { gitRoot }),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      invokePluginTool("git-sandbox-studio", "git_add", { files: ["C:/Windows/system.ini"] }, { gitRoot }),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      invokePluginTool("git-sandbox-studio", "git_commit", { message: "   " }, { gitRoot }),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      invokePluginTool("git-sandbox-studio", "git_diff", { target: "--output=outside.patch" }, { gitRoot }),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      invokePluginTool("git-sandbox-studio", "git_show", { revision: "HEAD\n--all" }, { gitRoot }),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      invokePluginTool("git-sandbox-studio", "git_log", { max_count: 5, start_timestamp: "--all" }, { gitRoot }),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      invokePluginTool(
        "git-sandbox-studio",
        "git_create_branch",
        { branch_name: "feature/../../escape", base_branch: null },
        { gitRoot },
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    const adapter = getPluginAdapter("git-sandbox-studio");
    const transformed = await adapter!.validateAndTransform("git_status", { repo_path: "C:/evil" }, { gitRoot });
    expect(String(transformed.repo_path)).toContain("git-security");
    expect(String(transformed.repo_path)).not.toContain("evil");
  });

  it("creates tables, inserts rows, and reads them inside a SQLite sandbox", async () => {
    const sqliteDatabase = path.join(temporaryRoot, "sqlite-repo", "sandbox.db");
    const context = { sqliteDatabase };

    const create = await invokePluginTool(
      "sqlite-workbench",
      "create_table",
      {
        query: "CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT NOT NULL);",
      },
      context,
    );
    expect(create.isError).toBe(false);

    const insert = await invokePluginTool(
      "sqlite-workbench",
      "write_query",
      { query: "INSERT INTO items(name) VALUES ('alpha');" },
      context,
    );
    expect(insert.isError).toBe(false);

    const select = await invokePluginTool(
      "sqlite-workbench",
      "read_query",
      { query: "SELECT name FROM items ORDER BY id;" },
      context,
    );
    expect(select.isError).toBe(false);
    expect(textOf(select)).toContain("alpha");

    const literal = await invokePluginTool(
      "sqlite-workbench",
      "read_query",
      { query: "SELECT 'ATTACH; PRAGMA; load_extension' AS harmless_text; -- keywords inside a literal" },
      context,
    );
    expect(literal.isError).toBe(false);
    expect(textOf(literal)).toContain("ATTACH; PRAGMA; load_extension");

    const tables = await invokePluginTool("sqlite-workbench", "list_tables", {}, context);
    expect(tables.isError).toBe(false);
    expect(textOf(tables)).toContain("items");

    const describe = await invokePluginTool("sqlite-workbench", "describe_table", { table_name: "items" }, context);
    expect(describe.isError).toBe(false);
    expect(textOf(describe)).toMatch(/name|TEXT|INTEGER/i);

    const insight = await invokePluginTool(
      "sqlite-workbench",
      "append_insight",
      { insight: "The SQLite sandbox contains a verified alpha item." },
      context,
    );
    expect(insight.isError).toBe(false);
    expect(textOf(insight)).toContain("Insight added");
  });

  it("rejects unsafe SQLite statements before process launch", async () => {
    const sqliteDatabase = path.join(temporaryRoot, "sqlite-security", "sandbox.db");
    const rejectedQueries = [
      ["read_query", "DELETE FROM items;"],
      ["read_query", "SELECT 1; DELETE FROM items;"],
      ["read_query", "SELECT load_extension('evil');"],
      ["read_query", "SELECT 'unterminated"],
      ["write_query", "ATTACH DATABASE 'C:/evil.db' AS evil;"],
      ["write_query", "DETACH DATABASE evil;"],
      ["write_query", "PRAGMA writable_schema = ON;"],
      ["write_query", "VACUUM INTO 'C:/evil.db';"],
      ["write_query", "REINDEX;"],
      ["write_query", "DROP TABLE items;"],
      ["write_query", "INSERT INTO items(name) VALUES ('safe'); DELETE FROM items;"],
      ["create_table", "CREATE TABLE safe (id INTEGER); ATTACH DATABASE 'C:/evil.db' AS evil;"],
      ["create_table", "CREATE TABLE unsafe AS SELECT load_extension('evil');"],
    ] as const;

    for (const [tool, query] of rejectedQueries) {
      await expect(invokePluginTool("sqlite-workbench", tool, { query }, { sqliteDatabase })).rejects.toBeInstanceOf(
        InvocationValidationError,
      );
    }
    await expect(
      invokePluginTool("sqlite-workbench", "describe_table", { table_name: "../escape" }, { sqliteDatabase }),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    const adapter = getPluginAdapter("sqlite-workbench");
    const launch = await adapter!.prepare({ sqliteDatabase });
    expect(launch.args).toEqual(["--db-path", path.resolve(sqliteDatabase)]);
    expect(launch.args.join(" ")).not.toMatch(/C:\\\\Windows|\/etc\//i);
  });

  it("detects filler and applies project-scoped add and ignore overlays with real defluff MCP tools", async () => {
    const defluffRoot = path.join(temporaryRoot, "defluff-scenario");
    const context = { defluffRoot };
    const initial = await invokePluginTool(
      "prose-defluffer",
      "slop_detect",
      { text: "Furthermore, it is worth noting that this robust platform can leverage synergies." },
      context,
    );
    expect(initial.isError).toBe(false);
    const initialReport = JSON.parse(textOf(initial)) as { slop_score: number; spans: Array<{ text: string }> };
    expect(initialReport.slop_score).toBeGreaterThan(0);
    expect(initialReport.spans.map((span) => span.text.toLowerCase())).toContain("furthermore");

    const added = await invokePluginTool(
      "prose-defluffer",
      "slop_add",
      { pattern: "quantum synergy", category: "corporate", scope: "project" },
      context,
    );
    expect(added.isError).toBe(false);
    expect(textOf(added)).toContain("quantum synergy");
    expect(await readFile(path.join(defluffRoot, ".defluff", "lexicon.json"), "utf8")).toContain("quantum synergy");

    const customDetection = await invokePluginTool(
      "prose-defluffer",
      "slop_detect",
      { text: "The plan depends on quantum synergy across teams." },
      context,
    );
    const customReport = JSON.parse(textOf(customDetection)) as { spans: Array<{ text: string }> };
    expect(customReport.spans.map((span) => span.text.toLowerCase())).toContain("quantum synergy");

    const ignored = await invokePluginTool(
      "prose-defluffer",
      "slop_ignore",
      { pattern: "quantum synergy", scope: "project" },
      context,
    );
    expect(ignored.isError).toBe(false);
    expect(await readFile(path.join(defluffRoot, ".defluff", "ignore.json"), "utf8")).toContain("quantum synergy");

    const ignoredDetection = await invokePluginTool(
      "prose-defluffer",
      "slop_detect",
      { text: "The plan depends on quantum synergy across teams." },
      context,
    );
    const ignoredReport = JSON.parse(textOf(ignoredDetection)) as { spans: Array<{ text: string }> };
    expect(ignoredReport.spans.map((span) => span.text.toLowerCase())).not.toContain("quantum synergy");
  });

  it("rejects invalid defluff inputs and confines user-home and overlay writes to the sandbox", async () => {
    const defluffRoot = path.join(temporaryRoot, "defluff-security");
    const context = { defluffRoot };
    await expect(
      invokePluginTool("prose-defluffer", "slop_detect", { text: "   " }, context),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      invokePluginTool(
        "prose-defluffer",
        "slop_add",
        { pattern: "bad category", category: "custom", scope: "project" },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      invokePluginTool(
        "prose-defluffer",
        "slop_add",
        { pattern: "machine-wide", category: "corporate", scope: "user" },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      invokePluginTool(
        "prose-defluffer",
        "slop_ignore",
        { pattern: "two\nlines", scope: "project" },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    const adapter = getPluginAdapter("prose-defluffer");
    const launch = await adapter!.prepare(context);
    expect(launch.args).toEqual([]);
    expect(launch.cwd).toBe(path.resolve(defluffRoot));
    expect(launch.env).toMatchObject({
      HOME: path.resolve(defluffRoot),
      USERPROFILE: path.resolve(defluffRoot),
      XDG_CONFIG_HOME: path.join(path.resolve(defluffRoot), ".config"),
    });
  });

  it("describes, renders, and programmatically builds diagrams through all real agentic-mermaid tools", async () => {
    const mermaidRoot = path.join(temporaryRoot, "mermaid-scenario");
    const context = { mermaidRoot };
    const source = "flowchart LR\n  User[User] --> Web[Agent-OPT Web]\n  Web --> MCP[Mermaid MCP]";

    const facts = await invokePluginTool(
      "mermaid-diagram-studio",
      "describe",
      { source, format: "facts" },
      context,
    );
    expect(facts.isError).toBe(false);
    const factPayload = JSON.parse(textOf(facts)) as { ok: boolean; facts: string[] };
    expect(factPayload.ok).toBe(true);
    expect(factPayload.facts).toEqual(expect.arrayContaining(["family flowchart", "edge User -> Web", "edge Web -> MCP"]));

    const textDescription = await invokePluginTool(
      "mermaid-diagram-studio",
      "describe",
      { source, format: "text" },
      context,
    );
    expect(textDescription.isError).toBe(false);
    expect(textOf(textDescription)).toMatch(/flowchart|User|Web|MCP/i);

    const treeDescription = await invokePluginTool(
      "mermaid-diagram-studio",
      "describe",
      { source, format: "json" },
      context,
    );
    expect(treeDescription.isError).toBe(false);
    expect(textOf(treeDescription)).toMatch(/tree|flowchart|User/i);

    for (const style of ["hand-drawn", "watercolor", "excalidraw"] as const) {
      const base64Render = await invokePluginTool(
        "mermaid-diagram-studio",
        "render_png",
        { source, scale: 1, background: "white", style, seed: 7, output: "base64" },
        context,
      );
      expect(base64Render.isError).toBe(false);
      const base64Payload = JSON.parse(textOf(base64Render)) as { ok: boolean; png_base64: string };
      expect(base64Payload.ok).toBe(true);
      expect(Buffer.from(base64Payload.png_base64, "base64").subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    }

    for (const familySource of [
      "sequenceDiagram\n  actor User\n  participant Web\n  User->>Web: Render",
      "architecture-beta\n  group platform(cloud)[Platform]\n  service web(internet)[Web] in platform\n  service runtime(server)[Runtime] in platform\n  web:R --> L:runtime",
    ]) {
      const familyRender = await invokePluginTool(
        "mermaid-diagram-studio",
        "render_png",
        { source: familySource, scale: 1, background: "white", seed: 3, output: "base64" },
        context,
      );
      expect(familyRender.isError).toBe(false);
      expect(textOf(familyRender)).toContain("png_base64");
    }

    const fileRender = await invokePluginTool(
      "mermaid-diagram-studio",
      "render_png",
      { source, scale: 1, background: "#ffffff", seed: 11, output: "file" },
      context,
    );
    expect(fileRender.isError).toBe(false);
    const filePayload = JSON.parse(textOf(fileRender)) as { ok: boolean; artifact: { path: string; bytes: number } };
    const artifactRoot = path.join(path.resolve(mermaidRoot), "artifacts");
    expect(filePayload.ok).toBe(true);
    expect(path.relative(artifactRoot, filePayload.artifact.path)).not.toMatch(/^\.\.|^[a-zA-Z]:/);
    expect((await readFile(filePayload.artifact.path)).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(filePayload.artifact.bytes).toBeGreaterThan(100);

    const codeMode = await invokePluginTool(
      "mermaid-diagram-studio",
      "execute",
      {
        code: `
          const built = mermaid.buildMermaid('flowchart', [
            { kind: 'add_node', id: 'API', label: 'API' },
            { kind: 'add_node', id: 'DB', label: 'Database' },
            { kind: 'add_edge', from: 'API', to: 'DB', label: 'queries' }
          ], { direction: 'LR' })
          if (!built.ok) return built
          const source = mermaid.serializeMermaid(built.value)
          const verify = mermaid.verifyMermaid(built.value)
          const ascii = mermaid.renderMermaidASCII(built.value, { useAscii: true })
          return {
            source,
            verifyOk: verify.ok,
            warningCount: verify.warnings.length,
            ascii
          }
        `,
        timeoutMs: 2_000,
      },
      context,
    );
    expect(codeMode.isError).toBe(false);
    const codePayload = JSON.parse(textOf(codeMode)) as {
      ok: boolean;
      value: { source: string; verifyOk: boolean; warningCount: number; ascii: string };
    };
    expect(codePayload.ok).toBe(true);
    expect(codePayload.value.source).toMatch(/flowchart LR|API|Database|queries/);
    expect(codePayload.value.verifyOk).toBe(true);
    expect(codePayload.value.warningCount).toBeGreaterThanOrEqual(0);
    expect(codePayload.value.ascii).toMatch(/API|Database/);
  }, 90_000);

  it("rejects invalid Mermaid inputs and confines generated artifacts to fixed launch paths", async () => {
    const mermaidRoot = path.join(temporaryRoot, "mermaid-errors");
    const context = { mermaidRoot };
    const invalid = await invokePluginTool(
      "mermaid-diagram-studio",
      "describe",
      { source: "not a mermaid diagram", format: "facts" },
      context,
    );
    expect(invalid.isError).toBe(true);

    await expect(
      invokePluginTool(
        "mermaid-diagram-studio",
        "render_png",
        { source: "flowchart LR\n A --> B", background: "url(https://evil.invalid/x)", output: "base64" },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      invokePluginTool(
        "mermaid-diagram-studio",
        "render_png",
        { source: "flowchart LR\n A --> B", output: "url" },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      invokePluginTool(
        "mermaid-diagram-studio",
        "execute",
        { code: "return 1", timeoutMs: 30_000 },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    const adapter = getPluginAdapter("mermaid-diagram-studio");
    const transformed = await adapter!.validateAndTransform(
      "render_png",
      { source: "flowchart LR\n A --> B", output: "base64", artifactDir: "C:/evil" },
      context,
    );
    expect(transformed).not.toHaveProperty("artifactDir");
    const launch = await adapter!.prepare(context);
    expect(launch.cwd).toBe(path.resolve(mermaidRoot));
    expect(launch.args).toEqual(expect.arrayContaining([
      "--max-old-space-size=192",
      "--artifact-dir",
      path.join(path.resolve(mermaidRoot), "artifacts"),
      "--max-sandbox-timeout-ms",
      "5000",
    ]));
    expect(launch.args).not.toContain("--public-url");
    expect(launch.env).toMatchObject({
      AM_TRACE_LOG: "",
      TEMP: path.join(path.resolve(mermaidRoot), "tmp"),
      TMP: path.join(path.resolve(mermaidRoot), "tmp"),
    });
  });

  it("contains agentic-mermaid Code Mode process, constructor, network, and CPU escape attempts", async () => {
    const mermaidRoot = path.join(temporaryRoot, "mermaid-security");
    const context = { mermaidRoot };
    const globals = await invokePluginTool(
      "mermaid-diagram-studio",
      "execute",
      { code: "return { process: typeof process, require: typeof require, fetch: typeof fetch }", timeoutMs: 500 },
      context,
    );
    expect(globals.isError).toBe(false);
    const globalsPayload = JSON.parse(textOf(globals)) as {
      ok: boolean;
      value: { process: string; require: string; fetch: string };
    };
    expect(globalsPayload.value).toEqual({ process: "undefined", require: "undefined", fetch: "undefined" });

    const constructorEscape = await invokePluginTool(
      "mermaid-diagram-studio",
      "execute",
      { code: "return ({}).constructor.constructor('return process')()", timeoutMs: 500 },
      context,
    );
    expect(constructorEscape.isError).toBe(true);
    expect(textOf(constructorEscape)).toMatch(/code generation.*disallowed/i);

    const infiniteLoop = await invokePluginTool(
      "mermaid-diagram-studio",
      "execute",
      { code: "while (true) {}", timeoutMs: 50 },
      context,
    );
    expect(infiniteLoop.isError).toBe(true);
    expect(textOf(infiniteLoop)).toMatch(/timed out/i);
  }, 60_000);

  it("runs all eleven Blueprint Chart tools through a recommendation, authoring, render, and export workflow", async () => {
    const blueprintRoot = path.join(temporaryRoot, "blueprint-scenario");
    const context = { blueprintRoot };

    const example = await invokePluginTool("blueprint-chart-studio", "get_example", {}, context);
    expect(example.isError).toBe(false);
    const examplePayload = structuredOf(example);
    const source = String(examplePayload.dsl);
    expect(examplePayload.id).toBe("letter-frequency");
    expect(source).toContain("chart bar-vertical");

    const validation = await invokePluginTool("blueprint-chart-studio", "validate_dsl", { source }, context);
    expect(validation.isError).toBe(false);
    expect(structuredOf(validation)).toMatchObject({ valid: true, errors: [], warnings: [] });

    const inspection = await invokePluginTool("blueprint-chart-studio", "inspect_dsl", { source }, context);
    expect(inspection.isError).toBe(false);
    expect(structuredOf(inspection)).toMatchObject({ chartType: "bar-vertical", hasHighlights: true });
    expect((structuredOf(inspection).data as Record<string, unknown>).rowCount).toBe(10);

    const recommendation = await invokePluginTool(
      "blueprint-chart-studio",
      "recommend_chart_type",
      { columnTypes: ["string", "number"], rowCount: 10, goal: "rank categories by value" },
      context,
    );
    expect(recommendation.isError).toBe(false);
    expect(JSON.stringify(structuredOf(recommendation).recommendations)).toMatch(/bar-horizontal|bar-vertical/);

    const chartTypes = await invokePluginTool("blueprint-chart-studio", "list_chart_types", {}, context);
    expect(chartTypes.isError).toBe(false);
    expect((structuredOf(chartTypes).chartTypes as unknown[]).length).toBe(13);

    const description = await invokePluginTool(
      "blueprint-chart-studio",
      "describe_chart_type",
      { chartType: "bar-vertical" },
      context,
    );
    expect(description.isError).toBe(false);
    expect(structuredOf(description)).toMatchObject({ name: "bar-vertical", exampleSlug: "letter-frequency" });
    expect((structuredOf(description).properties as unknown[]).length).toBeGreaterThan(20);

    const search = await invokePluginTool(
      "blueprint-chart-studio",
      "search_examples",
      { chartType: "bar-vertical", limit: 5 },
      context,
    );
    expect(search.isError).toBe(false);
    expect((structuredOf(search).results as unknown[]).length).toBeGreaterThan(0);

    const palettes = await invokePluginTool("blueprint-chart-studio", "list_palettes", {}, context);
    expect(palettes.isError).toBe(false);
    expect((structuredOf(palettes).palettes as unknown[]).length).toBe(51);
    expect(JSON.stringify(structuredOf(palettes))).toContain("Blueprint");

    const grammar = await invokePluginTool(
      "blueprint-chart-studio",
      "get_grammar",
      { section: "chart" },
      context,
    );
    expect(grammar.isError).toBe(false);
    expect(structuredOf(grammar).section).toBe("chart");
    expect(String(structuredOf(grammar).text).length).toBeGreaterThan(1_000);

    const svg = await invokePluginTool(
      "blueprint-chart-studio",
      "render",
      { source, format: "svg", width: 640, height: 400 },
      context,
    );
    expect(svg.isError).toBe(false);
    expect(textOf(svg)).toContain("<svg");
    expect(structuredOf(svg).mimeType).toBe("image/svg+xml");

    const html = await invokePluginTool(
      "blueprint-chart-studio",
      "render",
      { source, format: "html", width: 640, height: 400 },
      context,
    );
    expect(html.isError).toBe(false);
    expect(textOf(html)).toMatch(/<div class=\\?"bc-frame\\?"/i);
    expect(structuredOf(html).mimeType).toBe("text/html");

    const png = await invokePluginTool(
      "blueprint-chart-studio",
      "render",
      { source, format: "png", width: 640, height: 400, modelVisible: false },
      context,
    );
    expect(png.isError).toBe(false);
    const image = png.content.find((block) => block && typeof block === "object" && "type" in block && block.type === "image") as Record<string, unknown>;
    expect(image.mimeType).toBe("image/png");
    expect((image.annotations as Record<string, unknown>).audience).toEqual(["user"]);
    expect(Buffer.from(String(image.data), "base64").subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

    const saved = await invokePluginTool(
      "blueprint-chart-studio",
      "render",
      { source, format: "png", width: 320, height: 240, save: "charts/scenario.png" },
      context,
    );
    expect(saved.isError).toBe(false);
    const savedTo = String(structuredOf(saved).savedTo);
    expect(path.relative(path.join(path.resolve(blueprintRoot), "artifacts"), savedTo)).toBe(path.join("charts", "scenario.png"));
    expect((await readFile(savedTo)).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

    const exported = await invokePluginTool(
      "blueprint-chart-studio",
      "export_chart",
      { source, modelVisible: false },
      context,
    );
    expect(exported.isError).toBe(false);
    const exportPayload = structuredOf(exported);
    const copyUrl = String(exportPayload.copyUrl);
    const embedUrl = String(exportPayload.embedUrl);
    expect(copyUrl).toMatch(/^https:\/\/blueprintchart\.com\/#\/copy\?bpc64=/);
    expect(embedUrl).toMatch(/^https:\/\/blueprintchart\.com\/#\/render\?bpc64=/);
    const encoded = decodeURIComponent(copyUrl.split("bpc64=")[1]);
    expect(Buffer.from(encoded, "base64url").toString("utf8")).toBe(source);
    const exportImage = exported.content.find((block) => block && typeof block === "object" && "type" in block && block.type === "image") as Record<string, unknown>;
    expect(Buffer.from(String(exportImage.data), "base64").subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  }, 120_000);

  it("rejects invalid Blueprint inputs and confines files, environment, editor links, and symlinks", async () => {
    const blueprintRoot = path.join(temporaryRoot, "blueprint-security");
    const context = { blueprintRoot };
    const source = 'chart bar-vertical {\n  title = "Safe"\n  data { "A" = 1 }\n}';

    const invalidDsl = await invokePluginTool(
      "blueprint-chart-studio",
      "validate_dsl",
      { source: 'chart bar-vertical {\n  title = "unterminated\n}' },
      context,
    );
    expect(invalidDsl.isError).toBe(true);
    expect(textOf(invalidDsl)).toMatch(/E_PARSE|parse|unterminated|Expected/i);

    const invalidRender = await invokePluginTool(
      "blueprint-chart-studio",
      "render",
      { source: "not a chart", format: "png" },
      context,
    );
    expect(invalidRender.isError).toBe(true);

    const unknownType = await invokePluginTool(
      "blueprint-chart-studio",
      "describe_chart_type",
      { chartType: "definitely-not-a-chart" },
      context,
    );
    expect(unknownType.isError).toBe(true);
    expect(textOf(unknownType)).toContain("E_UNKNOWN_CHART_TYPE");

    await expect(invokePluginTool("blueprint-chart-studio", "search_examples", {}, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("blueprint-chart-studio", "search_examples", { query: "bar", limit: 21 }, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("blueprint-chart-studio", "render", { source, format: "png", width: 1_601 }, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("blueprint-chart-studio", "render", { source, format: "png", scene: -1 }, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("blueprint-chart-studio", "get_grammar", { section: "data" }, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("blueprint-chart-studio", "render", { source, format: "png", save: "../escape.png" }, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("blueprint-chart-studio", "render", { source, format: "png", save: path.resolve(temporaryRoot, "escape.png") }, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("blueprint-chart-studio", "render", { source, format: "png", save: "charts/wrong.svg" }, context)).rejects.toBeInstanceOf(InvocationValidationError);

    const adapter = getPluginAdapter("blueprint-chart-studio");
    expect(adapter).toBeDefined();
    const transformed = await adapter!.validateAndTransform(
      "export_chart",
      {
        source,
        modelVisible: false,
        editorUrl: "https://evil.invalid",
        MCP_PUBLIC_URL: "https://evil.invalid",
        env: { BLUEPRINT_CHART_EDITOR_URL: "https://evil.invalid" },
      },
      context,
    );
    expect(transformed).toEqual({ source, modelVisible: false });

    const launch = await adapter!.prepare(context);
    const artifactRoot = path.join(path.resolve(blueprintRoot), "artifacts");
    expect(launch.command).toBe(process.execPath);
    expect(launch.args).toEqual(expect.arrayContaining(["--max-old-space-size=256", expect.stringContaining("blueprint-chart-mcp.js")]));
    expect(launch.cwd).toBe(path.resolve(blueprintRoot));
    expect(launch.env).toMatchObject({
      MCP_FS_WRITE_DIR: artifactRoot,
      MCP_PUBLIC_URL: "",
      BLUEPRINT_CHART_EDITOR_URL: "https://blueprintchart.com",
      BLUEPRINT_CHART_DOCS_URL: "https://docs.blueprintchart.com",
      TEMP: path.join(path.resolve(blueprintRoot), "tmp"),
    });

    const outside = path.join(temporaryRoot, "blueprint-outside");
    const linked = path.join(artifactRoot, "linked");
    await mkdir(outside, { recursive: true });
    await symlink(outside, linked, process.platform === "win32" ? "junction" : "dir");
    await expect(
      adapter!.validateAndTransform(
        "render",
        { source, format: "png", save: "linked/escape.png" },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);
  }, 60_000);

  it("runs all twelve oxidize-pdf tools and their representative PDF workflows through one persistent stdio session", async () => {
    const oxidizeRoot = path.join(temporaryRoot, "oxidize-scenario");
    const context = { oxidizeRoot };
    const workspace = path.join(path.resolve(oxidizeRoot), "workspace");

    const created = await invokePluginTool(
      "oxidize-pdf-workbench",
      "create_pdf",
      { title: "Agent-OPT PDF Verification", author: "Agent-OPT", page_size: "letter" },
      context,
    );
    expect(created.isError).toBe(false);
    const sessionId = String(structuredOf(created).session_id);
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i);

    const firstText = await invokePluginTool(
      "oxidize-pdf-workbench",
      "add_pdf_content",
      { session_id: sessionId, content_type: "text", content: "Hello Agent-OPT PDF", x: 72, y: 700, font: "Helvetica", font_size: 18 },
      context,
    );
    expect(firstText.isError).toBe(false);
    const newPage = await invokePluginTool(
      "oxidize-pdf-workbench",
      "add_pdf_content",
      { session_id: sessionId, content_type: "new_page" },
      context,
    );
    expect(structuredOf(newPage).page_count).toBe(2);
    const secondText = await invokePluginTool(
      "oxidize-pdf-workbench",
      "add_pdf_content",
      { session_id: sessionId, content_type: "text", content: "Second page verification", x: 72, y: 700, font: "Courier", font_size: 14 },
      context,
    );
    expect(secondText.isError).toBe(false);

    const saved = await invokePluginTool(
      "oxidize-pdf-workbench",
      "save_pdf",
      { session_id: sessionId, output_path: "created/document.pdf" },
      context,
    );
    expect(saved.isError).toBe(false);
    expect(structuredOf(saved)).toMatchObject({ status: "ok", page_count: 2 });
    expect((await readFile(path.join(workspace, "created", "document.pdf"))).subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const metadata = await invokePluginTool(
      "oxidize-pdf-workbench",
      "read_pdf",
      { path: "created/document.pdf", include_page_details: true },
      context,
    );
    expect(metadata.isError).toBe(false);
    expect(structuredOf(metadata)).toMatchObject({ page_count: 2, title: "Agent-OPT PDF Verification", author: "Agent-OPT", is_encrypted: false });
    expect((structuredOf(metadata).pages as unknown[]).length).toBe(2);

    const extracted = await invokePluginTool(
      "oxidize-pdf-workbench",
      "extract_text",
      { path: "created/document.pdf" },
      context,
    );
    expect(extracted.isError).toBe(false);
    expect(structuredOf(extracted).text).toContain("Hello Agent-OPT PDF");
    expect(structuredOf(extracted).text).toContain("Second page verification");

    const markdown = await invokePluginTool(
      "oxidize-pdf-workbench",
      "convert_pdf",
      { path: "created/document.pdf", format: "markdown" },
      context,
    );
    expect(markdown.isError).toBe(false);
    expect(structuredOf(markdown).content).toContain("# Agent-OPT PDF Verification");
    const chunks = await invokePluginTool(
      "oxidize-pdf-workbench",
      "convert_pdf",
      { path: "created/document.pdf", format: "chunks", max_tokens: 32, overlap: 5 },
      context,
    );
    expect((structuredOf(chunks).chunks as unknown[]).length).toBeGreaterThan(0);
    const rag = await invokePluginTool(
      "oxidize-pdf-workbench",
      "convert_pdf",
      { path: "created/document.pdf", format: "rag" },
      context,
    );
    expect(rag.isError).toBe(false);

    const analysis = await invokePluginTool(
      "oxidize-pdf-workbench",
      "analyze_pdf",
      { path: "created/document.pdf", check: "validate" },
      context,
    );
    expect(analysis.isError).toBe(false);
    expect(structuredOf(analysis)).toMatchObject({ valid: true, error_count: 0 });
    const comparison = await invokePluginTool(
      "oxidize-pdf-workbench",
      "analyze_pdf",
      { path: "created/document.pdf", check: "compare", compare_path: "created/document.pdf" },
      context,
    );
    expect(structuredOf(comparison).structurally_equivalent).toBe(true);

    const entities = await invokePluginTool(
      "oxidize-pdf-workbench",
      "extract_entities",
      { path: "created/document.pdf" },
      context,
    );
    expect(entities.isError).toBe(false);
    expect(structuredOf(entities)).toMatchObject({ entity_count: 2, page_count: 2 });
    expect(JSON.stringify(structuredOf(entities).entities)).toContain("Helvetica");

    for (const [operation, args, output] of [
      ["rotate", { input_path: "created/document.pdf", output_path: "outputs/rotated.pdf", degrees: 90 }, "outputs/rotated.pdf"],
      ["extract_pages", { input_path: "created/document.pdf", output_path: "outputs/first.pdf", page_indices: [0] }, "outputs/first.pdf"],
      ["reverse", { input_path: "created/document.pdf", output_path: "outputs/reversed.pdf" }, "outputs/reversed.pdf"],
      ["overlay", { input_path: "created/document.pdf", overlay_path: "created/document.pdf", output_path: "outputs/overlay.pdf" }, "outputs/overlay.pdf"],
    ] as const) {
      const result = await invokePluginTool(
        "oxidize-pdf-workbench",
        "manipulate_pdf",
        { operation, ...args },
        context,
      );
      expect(result.isError).toBe(false);
      expect((await readFile(path.join(workspace, output))).subarray(0, 5).toString("ascii")).toBe("%PDF-");
    }
    const merged = await invokePluginTool(
      "oxidize-pdf-workbench",
      "manipulate_pdf",
      { operation: "merge", input_paths: ["outputs/first.pdf", "outputs/first.pdf"], output_path: "outputs/merged.pdf" },
      context,
    );
    expect(merged.isError).toBe(false);
    const split = await invokePluginTool(
      "oxidize-pdf-workbench",
      "manipulate_pdf",
      { operation: "split", input_path: "created/document.pdf", output_path: "outputs/split" },
      context,
    );
    expect(split.isError).toBe(false);
    expect((await readdir(path.join(workspace, "outputs", "split"))).filter((file) => file.endsWith(".pdf"))).toHaveLength(2);

    const highlighted = await invokePluginTool(
      "oxidize-pdf-workbench",
      "annotate_pdf",
      { input_path: "created/document.pdf", output_path: "outputs/highlighted.pdf", annotation_type: "highlight", page: 0, x: 65, y: 680, width: 220, height: 35 },
      context,
    );
    expect(highlighted.isError).toBe(false);
    const noted = await invokePluginTool(
      "oxidize-pdf-workbench",
      "annotate_pdf",
      { input_path: "created/document.pdf", output_path: "outputs/noted.pdf", annotation_type: "text", page: 0, x: 72, y: 650, contents: "Review note" },
      context,
    );
    expect(noted.isError).toBe(false);

    const form = await invokePluginTool(
      "oxidize-pdf-workbench",
      "manage_forms",
      { operation: "create", output_path: "outputs/form.pdf", fields: [{ name: "full_name", type: "text", x: 72, y: 700, width: 220, height: 24, default_value: "Ada" }] },
      context,
    );
    expect(structuredOf(form).fields_created).toBe(1);
    const filled = await invokePluginTool(
      "oxidize-pdf-workbench",
      "manage_forms",
      { operation: "fill", input_path: "outputs/form.pdf", output_path: "outputs/form-filled.pdf", values: { full_name: "Grace" } },
      context,
    );
    expect(filled.isError).toBe(false);
    const formRead = await invokePluginTool(
      "oxidize-pdf-workbench",
      "manage_forms",
      { operation: "read", input_path: "outputs/form-filled.pdf" },
      context,
    );
    expect(formRead.isError).toBe(false);
    const formValidation = await invokePluginTool(
      "oxidize-pdf-workbench",
      "manage_forms",
      { operation: "validate", input_path: "outputs/form.pdf", values: { full_name: "Ada" } },
      context,
    );
    expect(structuredOf(formValidation).valid).toBe(true);

    const permissions = await invokePluginTool(
      "oxidize-pdf-workbench",
      "secure_pdf",
      { operation: "permissions", input_path: "created/document.pdf" },
      context,
    );
    expect(structuredOf(permissions).is_encrypted).toBe(false);
    const signatures = await invokePluginTool(
      "oxidize-pdf-workbench",
      "secure_pdf",
      { operation: "verify_signatures", input_path: "created/document.pdf" },
      context,
    );
    expect(structuredOf(signatures).signature_count).toBe(0);
    const encrypted = await invokePluginTool(
      "oxidize-pdf-workbench",
      "secure_pdf",
      { operation: "encrypt", input_path: "created/document.pdf", output_path: "outputs/encrypted.pdf", user_password: "user-pass", owner_password: "owner-pass" },
      context,
    );
    expect(encrypted.isError).toBe(false);
    expect(textOf(encrypted)).not.toContain("user-pass");
    expect(textOf(encrypted)).not.toContain("owner-pass");
    const locked = await invokePluginTool(
      "oxidize-pdf-workbench",
      "read_pdf",
      { path: "outputs/encrypted.pdf", include_page_details: false },
      context,
    );
    expect(structuredOf(locked)).toMatchObject({ is_encrypted: true, locked: true });
    const unlocked = await invokePluginTool(
      "oxidize-pdf-workbench",
      "read_pdf",
      { path: "outputs/encrypted.pdf", password: "user-pass", include_page_details: true },
      context,
    );
    expect(unlocked.isError).toBe(false);
    expect(structuredOf(unlocked)).toMatchObject({ is_encrypted: true, page_count: 2 });
  }, 120_000);

  it("rejects oxidize-pdf path, schema, session, injection, and symlink escape attempts", async () => {
    const oxidizeRoot = path.join(temporaryRoot, "oxidize-security");
    const context = { oxidizeRoot };
    const workspace = path.join(path.resolve(oxidizeRoot), "workspace");

    await expect(invokePluginTool("oxidize-pdf-workbench", "read_pdf", { path: "../escape.pdf" }, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("oxidize-pdf-workbench", "read_pdf", { path: path.resolve(temporaryRoot, "escape.pdf") }, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("oxidize-pdf-workbench", "read_pdf", { path: "notes.txt" }, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("oxidize-pdf-workbench", "extract_text", { path: "missing.pdf", page: 500 }, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("oxidize-pdf-workbench", "convert_pdf", { path: "missing.pdf", format: "chunks", max_tokens: 32, overlap: 32 }, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("oxidize-pdf-workbench", "manipulate_pdf", { operation: "rotate", input_path: "missing.pdf", output_path: "out.pdf", degrees: 45 }, context)).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool("oxidize-pdf-workbench", "save_pdf", { session_id: "not-a-session", output_path: "out.pdf" }, context)).rejects.toBeInstanceOf(InvocationValidationError);

    const missing = await invokePluginTool("oxidize-pdf-workbench", "read_pdf", { path: "missing.pdf" }, context);
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toMatch(/SECURITY_ERROR|not found/i);

    const adapter = getPluginAdapter("oxidize-pdf-workbench");
    expect(adapter).toBeDefined();
    const transformed = await adapter!.validateAndTransform(
      "read_pdf",
      { path: "safe.pdf", include_page_details: false, OXIDIZE_ALLOWED_PATHS: "C:/", env: { OXIDIZE_WORKSPACE: "C:/" }, command: "powershell" },
      context,
    );
    expect(transformed).toEqual({ path: "safe.pdf", include_page_details: false });
    const launch = await adapter!.prepare(context);
    expect(launch.command).toMatch(/oxidize-mcp(?:\.exe)?$/i);
    expect(launch.args).toEqual([]);
    expect(launch.cwd).toBe(workspace);
    expect(launch.env).toMatchObject({
      OXIDIZE_WORKSPACE: workspace,
      OXIDIZE_ALLOWED_PATHS: "",
      OXIDIZE_MAX_FILE_SIZE_MB: "16",
      OXIDIZE_MAX_PAGES: "500",
      OXIDIZE_MAX_OUTPUT_BYTES: String(2 * 1024 * 1024),
      OXIDIZE_MAX_SESSIONS: "4",
      OXIDIZE_MAX_SESSION_BYTES: String(2 * 1024 * 1024),
      OXIDIZE_SESSION_TIMEOUT: "300",
      PYTHONNOUSERSITE: "1",
    });

    const outside = path.join(temporaryRoot, "oxidize-outside");
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, "outside.pdf"), "%PDF-1.7\n%%EOF\n", "utf8");
    await mkdir(workspace, { recursive: true });
    await symlink(outside, path.join(workspace, "linked"), process.platform === "win32" ? "junction" : "dir");
    const symlinkEscape = await invokePluginTool("oxidize-pdf-workbench", "read_pdf", { path: "linked/outside.pdf" }, context);
    expect(symlinkEscape.isError).toBe(true);
    expect(textOf(symlinkEscape)).toMatch(/outside allowed directories|SECURITY_ERROR/i);

    const created = await invokePluginTool("oxidize-pdf-workbench", "create_pdf", { title: "Close test", page_size: "a4" }, context);
    const sessionId = String(structuredOf(created).session_id);
    await closePluginSessions("oxidize-pdf-workbench");
    const expired = await invokePluginTool(
      "oxidize-pdf-workbench",
      "add_pdf_content",
      { session_id: sessionId, content_type: "new_page" },
      context,
    );
    expect(expired.isError).toBe(true);
    expect(textOf(expired)).toMatch(/SESSION_NOT_FOUND|not found|inactive/i);
  }, 60_000);

  it("runs all six BumpGuard tools against real Python packages", async () => {
    const context = { bumpguardRoot: path.join(temporaryRoot, "bumpguard-python") };

    const languages = await invokePluginTool("bumpguard-dependency-lab", "list_languages", {}, context);
    expect(structuredOf(languages).languages).toEqual([
      { language: "dotnet", ecosystem: "NuGet" },
      { language: "java", ecosystem: "Maven" },
      { language: "python", ecosystem: "PyPI" },
    ]);

    const installed = await invokePluginTool(
      "bumpguard-dependency-lab",
      "check_import",
      { language: "python", package: "pydantic" },
      context,
    );
    expect(structuredOf(installed)).toMatchObject({
      package: "pydantic",
      installed: true,
      location: "project virtual environment",
    });
    expect(String(structuredOf(installed).version)).toMatch(/^2\./);
    expect(textOf(installed)).not.toMatch(/[A-Z]:\\|\/site-packages\//i);

    const typo = await invokePluginTool(
      "bumpguard-dependency-lab",
      "check_import",
      { language: "python", package: "pydntic" },
      context,
    );
    expect(structuredOf(typo)).toMatchObject({ package: "pydntic", installed: false });
    expect(structuredOf(typo).suggestions).toContain("pydantic");

    const validSnippet = await invokePluginTool(
      "bumpguard-dependency-lab",
      "verify_snippet",
      { language: "python", code: "from pydantic import BaseModel\nclass User(BaseModel):\n    name: str\n" },
      context,
    );
    expect(structuredOf(validSnippet)).toMatchObject({ language: "python", verified: true, findings: [] });

    const typoSnippet = await invokePluginTool(
      "bumpguard-dependency-lab",
      "verify_snippet",
      { language: "python", code: "import pydntic\npydntic.BaseModel()\n" },
      context,
    );
    expect(structuredOf(typoSnippet)).toMatchObject({ language: "python", verified: false });
    expect(structuredOf(typoSnippet).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: "high", symbol: "pydntic" })]),
    );

    const syntaxError = await invokePluginTool(
      "bumpguard-dependency-lab",
      "verify_snippet",
      { language: "python", code: "def broken(:\n    pass\n" },
      context,
    );
    expect(structuredOf(syntaxError)).toMatchObject({ verified: false });
    expect(structuredOf(syntaxError).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ line: 0, severity: "high" })]),
    );

    const symbols = await invokePluginTool(
      "bumpguard-dependency-lab",
      "list_symbols",
      { language: "python", package: "pydantic", name_filter: "BaseModel" },
      context,
    );
    expect(Number(structuredOf(symbols).count)).toBeGreaterThan(100);
    expect(structuredOf(symbols).symbols).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbol: expect.stringContaining("BaseModel") })]),
    );

    const diff = await invokePluginTool(
      "bumpguard-dependency-lab",
      "diff_versions",
      { language: "python", package: "sniffio", from_version: "1.3.0", to_version: "1.3.1" },
      context,
    );
    expect(diff.isError).toBe(false);
    expect(structuredOf(diff)).toMatchObject({
      package: "sniffio",
      language: "python",
      from_version: "1.3.0",
      to_version: "1.3.1",
      summary: { total_changes: 0, breaking: 0 },
      surface_partial: true,
    });

    const upgrade = await invokePluginTool(
      "bumpguard-dependency-lab",
      "check_upgrade",
      {
        language: "python",
        package: "sniffio",
        from_version: "1.3.0",
        to_version: "1.3.1",
        code: "import sniffio\nname = sniffio.current_async_library()\n",
      },
      context,
    );
    expect(upgrade.isError).toBe(false);
    expect(structuredOf(upgrade)).toMatchObject({
      package: "sniffio",
      language: "python",
      safe_to_upgrade: true,
      findings: [],
    });
  }, 180_000);

  it("analyzes real Java and .NET package versions, code usages, and symbols", async () => {
    const context = { bumpguardRoot: path.join(temporaryRoot, "bumpguard-multilang") };

    const javaDiff = await invokePluginTool(
      "bumpguard-dependency-lab",
      "diff_versions",
      { language: "java", package: "com.google.code.gson:gson", from_version: "2.8.9", to_version: "2.10.1" },
      context,
    );
    expect(structuredOf(javaDiff)).toMatchObject({
      package: "com.google.code.gson:gson",
      language: "java",
      summary: { total_changes: 76, breaking: 16 },
    });

    const javaUpgrade = await invokePluginTool(
      "bumpguard-dependency-lab",
      "check_upgrade",
      {
        language: "java",
        package: "com.google.code.gson:gson",
        from_version: "2.8.9",
        to_version: "2.10.1",
        code: "import com.google.gson.Gson; class Decoder { Object read(Gson gson, String json) { return gson.fromJson(json, Object.class); } }",
      },
      context,
    );
    expect(javaUpgrade.isError).toBe(false);
    expect(structuredOf(javaUpgrade)).toMatchObject({ package: "com.google.code.gson:gson", language: "java" });
    expect(typeof structuredOf(javaUpgrade).safe_to_upgrade).toBe("boolean");

    const javaSymbols = await invokePluginTool(
      "bumpguard-dependency-lab",
      "list_symbols",
      { language: "java", package: "com.google.code.gson:gson", version: "2.10.1", name_filter: "Gson.fromJson" },
      context,
    );
    expect(structuredOf(javaSymbols)).toMatchObject({ count: 1 });
    expect(structuredOf(javaSymbols).symbols).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbol: "com.google.gson.Gson.fromJson" })]),
    );

    const javaVerify = await invokePluginTool(
      "bumpguard-dependency-lab",
      "verify_snippet",
      { language: "java", code: "import com.google.gson.Gson;" },
      context,
    );
    expect(structuredOf(javaVerify)).toMatchObject({ language: "java", verified: null, findings: [] });

    const dotnetDiff = await invokePluginTool(
      "bumpguard-dependency-lab",
      "diff_versions",
      { language: "dotnet", package: "Newtonsoft.Json", from_version: "12.0.1", to_version: "13.0.1" },
      context,
    );
    expect(dotnetDiff.isError).toBe(false);
    expect(structuredOf(dotnetDiff)).toMatchObject({ package: "Newtonsoft.Json", language: "dotnet" });
    expect(Number((structuredOf(dotnetDiff).summary as Record<string, unknown>).total_changes)).toBeGreaterThan(0);

    const dotnetUpgrade = await invokePluginTool(
      "bumpguard-dependency-lab",
      "check_upgrade",
      {
        language: "dotnet",
        package: "Newtonsoft.Json",
        from_version: "12.0.1",
        to_version: "13.0.1",
        code: "using Newtonsoft.Json; class Demo { string Write(object value) => JsonConvert.SerializeObject(value); }",
      },
      context,
    );
    expect(dotnetUpgrade.isError).toBe(false);
    expect(structuredOf(dotnetUpgrade)).toMatchObject({ package: "Newtonsoft.Json", language: "dotnet" });
    expect(typeof structuredOf(dotnetUpgrade).safe_to_upgrade).toBe("boolean");

    const dotnetSymbols = await invokePluginTool(
      "bumpguard-dependency-lab",
      "list_symbols",
      { language: "dotnet", package: "Newtonsoft.Json", version: "13.0.1", name_filter: "JsonConvert.SerializeObject" },
      context,
    );
    expect(structuredOf(dotnetSymbols)).toMatchObject({ count: 1 });
    expect(structuredOf(dotnetSymbols).symbols).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbol: "Newtonsoft.Json.JsonConvert.SerializeObject" })]),
    );

    const dotnetVerify = await invokePluginTool(
      "bumpguard-dependency-lab",
      "verify_snippet",
      { language: "dotnet", code: "using Newtonsoft.Json;" },
      context,
    );
    expect(structuredOf(dotnetVerify)).toMatchObject({ language: "dotnet", verified: null, findings: [] });
  }, 360_000);

  it("bounds BumpGuard commands, registry coordinates, caches, output, and host-path disclosure", async () => {
    const bumpguardRoot = path.join(temporaryRoot, "bumpguard-security");
    const context = { bumpguardRoot };
    const adapter = getPluginAdapter("bumpguard-dependency-lab");
    expect(adapter).toBeDefined();

    for (const args of [
      { language: "python", package: "-rrequirements.txt" },
      { language: "python", package: "https://evil.example/pkg.whl" },
      { language: "java", package: "../../evil:artifact" },
      { language: "java", package: "missing-coordinate" },
      { language: "dotnet", package: "../Newtonsoft.Json" },
    ]) {
      await expect(invokePluginTool("bumpguard-dependency-lab", "check_import", args, context)).rejects.toBeInstanceOf(
        InvocationValidationError,
      );
    }

    await expect(
      invokePluginTool(
        "bumpguard-dependency-lab",
        "diff_versions",
        { language: "python", package: "sniffio", from_version: "1.3.0", to_version: "../../1.3.1" },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      invokePluginTool(
        "bumpguard-dependency-lab",
        "verify_snippet",
        { language: "python", code: "x".repeat(100_001) },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(
      adapter!.validateAndTransform(
        "check_import",
        { language: "python", package: "pydantic", command: "powershell", env: { PIP_INDEX_URL: "https://evil.example" } },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    const launch = await adapter!.prepare(context);
    expect(launch.command).toMatch(/\.venv[\\/]Scripts[\\/]python\.exe$|\.venv[\\/]bin[\\/]python$/i);
    expect(launch.args).toEqual([expect.stringMatching(/scripts[\\/]bumpguard-mcp-entry\.py$/)]);
    expect(launch.cwd).toBe(path.resolve(bumpguardRoot));
    expect(launch.env).toMatchObject({
      HOME: path.resolve(bumpguardRoot),
      USERPROFILE: path.resolve(bumpguardRoot),
      PIP_INDEX_URL: "https://pypi.org/simple",
      PIP_NO_INPUT: "1",
      PIP_DISABLE_PIP_VERSION_CHECK: "1",
      PYTHONNOUSERSITE: "1",
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
      DOTNET_CLI_TELEMETRY_OPTOUT: "1",
      DOTNET_MULTILEVEL_LOOKUP: "0",
      DOTNET_CLI_USE_MSBUILD_SERVER: "0",
      MSBUILDDISABLENODEREUSE: "1",
      UseSharedCompilation: "false",
      FASTMCP_TELEMETRY_ENABLED: "false",
    });
    for (const key of ["TEMP", "TMP", "TMPDIR", "PIP_CACHE_DIR", "DOTNET_CLI_HOME", "NUGET_PACKAGES", "APPDATA", "LOCALAPPDATA"] as const) {
      expect(path.resolve(String(launch.env?.[key]))).toMatch(new RegExp(`^${path.resolve(bumpguardRoot).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
    expect(launch.env?.PATH?.split(path.delimiter)[0]).toBe(path.join(process.cwd(), "var", "runtime", "dotnet-sdk"));
    expect(adapter!.requestTimeoutMs?.("check_upgrade")).toBe(600_000);
    expect(adapter!.requestTimeoutMs?.("diff_versions")).toBe(480_000);
    expect(adapter!.requestTimeoutMs?.("verify_snippet")).toBe(240_000);
    expect(adapter!.requestTimeoutMs?.("check_import")).toBe(60_000);

    const bootstrap = await readFile(path.join(process.cwd(), "scripts", "bumpguard-mcp-entry.py"), "utf8");
    expect(bootstrap).toContain("subprocess.DEVNULL");
    expect(bootstrap).toContain("from bumpguard.server import main");

    await expect(
      adapter!.normalizeResult!(
        "list_symbols",
        { content: [{ type: "text", text: JSON.stringify({ symbols: ["x".repeat(2 * 1024 * 1024)] }) }], isError: false },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    const unavailable = await invokePluginTool(
      "bumpguard-dependency-lab",
      "diff_versions",
      { language: "python", package: "sniffio", from_version: "1.3.0", to_version: "9999.0.0" },
      context,
    );
    expect(unavailable.isError).toBe(true);
    expect(structuredOf(unavailable).error).toMatch(/Could not fetch/i);

    const outside = path.join(temporaryRoot, "bumpguard-outside");
    const linkedRoot = path.join(temporaryRoot, "bumpguard-linked-root");
    await mkdir(outside, { recursive: true });
    await symlink(outside, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    await expect(adapter!.prepare({ bumpguardRoot: linkedRoot })).rejects.toBeInstanceOf(InvocationValidationError);
  }, 180_000);

  it("discovers the four official Svelte MCP tools through the shipped adapter", async () => {
    const svelteRoot = path.join(temporaryRoot, "svelte-discover");
    const tools = await listPluginTools("svelte-development-studio", { svelteRoot });
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get-documentation",
      "list-sections",
      "playground-link",
      "svelte-autofixer",
    ]);
  }, 60_000);

  it("lists official Svelte sections, retrieves documentation, diagnoses Svelte 5 code, and builds a Playground link", async () => {
    const context = { svelteRoot: path.join(temporaryRoot, "svelte-core") };

    const sectionsResult = await invokePluginTool("svelte-development-studio", "list-sections", {}, context);
    expect(sectionsResult.isError).toBe(false);
    const sections = structuredOf(sectionsResult).sections as Array<{ title: string; path: string; useCases: string }>;
    expect(Array.isArray(sections)).toBe(true);
    expect(sections.length).toBeGreaterThan(50);
    expect(sections.some((section) => section.title === "$state" || section.path.includes("state"))).toBe(true);

    const docs = await invokePluginTool(
      "svelte-development-studio",
      "get-documentation",
      { section: ["$state"] },
      context,
    );
    expect(docs.isError).toBe(false);
    const markdown = String(structuredOf(docs).markdown ?? "");
    expect(markdown.length).toBeGreaterThan(1_000);
    expect(markdown).toMatch(/\$state|reactive/i);

    const diagnostics = await invokePluginTool(
      "svelte-development-studio",
      "svelte-autofixer",
      {
        code: "<script>\n  let count = 0;\n</script>\n\n<button on:click={() => count += 1}>\n  clicks: {count}\n</button>\n",
        desired_svelte_version: 5,
        filename: "Counter.svelte",
      },
      context,
    );
    expect(diagnostics.isError).toBe(false);
    const issues = structuredOf(diagnostics).issues as string[];
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.join("\n")).toMatch(/on:click|event_directive_deprecated/i);
    expect(issues.join("\n")).toMatch(/\$state|non_reactive_update/i);
    expect(structuredOf(diagnostics).require_another_tool_call_after_fixing).toBe(true);

    const playground = await invokePluginTool(
      "svelte-development-studio",
      "playground-link",
      {
        name: "Agent-OPT Svelte core",
        files: {
          "App.svelte": "<script>\n  let count = $state(0);\n</script>\n\n<button onclick={() => count += 1}>{count}</button>\n",
          "styles.css": "button { padding: 0.5rem 1rem; }\n",
        },
      },
      context,
    );
    expect(playground.isError).toBe(false);
    const url = String(structuredOf(playground).url ?? "");
    expect(url.startsWith("https://svelte.dev/playground#")).toBe(true);
    expect(url.length).toBeGreaterThan("https://svelte.dev/playground#".length);
    expect(playground.content).toHaveLength(1);
    expect(playground.content[0]).toMatchObject({ type: "text" });
    expect(JSON.stringify(playground.content)).not.toMatch(/ui:\/\/svelte|resource/i);
  }, 180_000);

  it("retrieves a duplicate-title Svelte document by its unique path and accepts valid Svelte 4 code", async () => {
    const context = { svelteRoot: path.join(temporaryRoot, "svelte-path-and-v4") };

    const sectionsResult = await invokePluginTool("svelte-development-studio", "list-sections", {}, context);
    const sections = structuredOf(sectionsResult).sections as Array<{ title: string; path: string }>;
    const overviewPaths = sections.filter((section) => section.title === "Overview").map((section) => section.path);
    expect(overviewPaths).toContain("ai/overview");
    expect(overviewPaths).toContain("svelte/overview");

    const docs = await invokePluginTool(
      "svelte-development-studio",
      "get-documentation",
      { section: ["svelte/overview"] },
      context,
    );
    const markdown = String(structuredOf(docs).markdown ?? "");
    expect(docs.isError).toBe(false);
    expect(markdown).toContain("Svelte is a framework for building user interfaces");
    expect(markdown).not.toContain("There are four tools, designed to help your agent");

    const diagnostics = await invokePluginTool(
      "svelte-development-studio",
      "svelte-autofixer",
      {
        code: '<script>\n  export let name = "Svelte";\n</script>\n\n<h1>Hello {name}!</h1>\n',
        desired_svelte_version: 4,
        filename: "Greeting.svelte",
      },
      context,
    );
    expect(diagnostics.isError).toBe(false);
    expect(structuredOf(diagnostics).issues).toEqual([]);
    expect(structuredOf(diagnostics).suggestions).toEqual([]);
  }, 180_000);

  it("rejects Svelte autofixer path-like input, Svelte 4 async mode, oversized docs, and invalid Playground files before launch", async () => {
    const svelteRoot = path.join(temporaryRoot, "svelte-security");
    const context = { svelteRoot };
    const adapter = getPluginAdapter("svelte-development-studio");
    expect(adapter).toBeDefined();

    await mkdir(svelteRoot, { recursive: true });
    await writeFile(path.join(svelteRoot, "Component.svelte"), "<script></script>\n", "utf8");

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "svelte-autofixer",
        {
          code: path.join(svelteRoot, "Component.svelte"),
          desired_svelte_version: 5,
          filename: "Component.svelte",
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "svelte-autofixer",
        {
          code: "<h1>Hello</h1>",
          desired_svelte_version: 5,
          filename: "Component.svelte",
          unexpected: true,
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "svelte-autofixer",
        {
          code: "x".repeat(200_001),
          desired_svelte_version: 5,
          filename: "Component.svelte",
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "svelte-autofixer",
        {
          code: "<h1>Hello</h1>",
          desired_svelte_version: 6,
          filename: "Component.svelte",
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "svelte-autofixer",
        {
          code: "Component.svelte",
          desired_svelte_version: 5,
          filename: "Component.svelte",
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "playground-link",
        {
          name: "too-many-files",
          files: Object.fromEntries([
            ["App.svelte", "<h1>app</h1>"],
            ...Array.from({ length: 12 }, (_, index) => [`file-${index}.js`, ""]),
          ]),
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "playground-link",
        {
          name: "oversized-file",
          files: { "App.svelte": "x".repeat(75_001) },
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "playground-link",
        {
          name: "oversized-total",
          files: { "App.svelte": "x".repeat(50_000), "data.js": "y".repeat(50_000) },
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "svelte-autofixer",
        {
          code: "C:\\Windows\\system.ini",
          desired_svelte_version: 5,
          filename: "Component.svelte",
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "svelte-autofixer",
        {
          code: "<script></script>",
          desired_svelte_version: 4,
          async: true,
          filename: "Component.svelte",
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "get-documentation",
        { section: Array.from({ length: 9 }, (_, index) => `$state-${index}`) },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "get-documentation",
        { section: ["https://evil.example/docs"] },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "playground-link",
        {
          name: "missing-entry",
          files: { "Other.svelte": "<h1>no App</h1>" },
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      invokePluginTool(
        "svelte-development-studio",
        "playground-link",
        {
          name: "path-file",
          files: { "../escape.svelte": "<h1>nope</h1>", "App.svelte": "<h1>app</h1>" },
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    const launch = await adapter!.prepare(context);
    expect(launch.command).toBe(process.execPath);
    expect(launch.args).toEqual(["--max-old-space-size=512", expect.stringMatching(/scripts[\\/]svelte-mcp-entry\.mjs$/)]);
    expect(launch.cwd).toBe(path.resolve(svelteRoot));
    expect(launch.env).toMatchObject({
      HOME: path.resolve(svelteRoot),
      USERPROFILE: path.resolve(svelteRoot),
      NODE_ENV: "production",
      NO_COLOR: "1",
    });

    const outside = path.join(temporaryRoot, "svelte-outside");
    const linkedRoot = path.join(temporaryRoot, "svelte-linked-root");
    await mkdir(outside, { recursive: true });
    await symlink(outside, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    await expect(adapter!.prepare({ svelteRoot: linkedRoot })).rejects.toBeInstanceOf(InvocationValidationError);

    const bootstrap = await readFile(path.join(process.cwd(), "scripts", "svelte-mcp-entry.mjs"), "utf8");
    const networkPolicy = await readFile(path.join(process.cwd(), "scripts", "svelte-network-policy.mjs"), "utf8");
    expect(bootstrap).toContain("createSvelteNetworkFetch");
    expect(networkPolicy).toContain("https://svelte.dev");
    expect(networkPolicy).toContain("sections.json");
    expect(networkPolicy).toContain("llms.txt");
    expect(networkPolicy).toContain('redirect: "error"');

    await expect(
      adapter!.normalizeResult!(
        "list-sections",
        {
          content: [{ type: "text", text: "x".repeat(2 * 1024 * 1024) }],
          structuredContent: { sections: [{ title: "x".repeat(2 * 1024 * 1024), path: "x", useCases: "x" }] },
          isError: false,
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);

    await expect(
      adapter!.normalizeResult!(
        "playground-link",
        {
          content: [{ type: "text", text: "ok" }],
          structuredContent: { url: "https://evil.example/playground#payload" },
          isError: false,
        },
        context,
      ),
    ).rejects.toBeInstanceOf(InvocationValidationError);
  }, 60_000);

  it("enforces the executable Svelte fixed-origin network policy and redirect rejection", async () => {
    const { assertSvelteNetworkRequest, createSvelteNetworkFetch } = await loadSvelteNetworkPolicy();
    const sectionsUrl = "https://svelte.dev/docs/experimental/sections.json";
    const documentationUrl = "https://svelte.dev/docs/svelte/overview/llms.txt";

    expect(assertSvelteNetworkRequest(sectionsUrl).href).toBe(sectionsUrl);
    expect(assertSvelteNetworkRequest(documentationUrl).href).toBe(documentationUrl);

    for (const denied of [
      "https://evil.example/docs/svelte/overview/llms.txt",
      "https://svelte.dev:444/docs/svelte/overview/llms.txt",
      "https://user:secret@svelte.dev/docs/svelte/overview/llms.txt",
      "https://svelte.dev/docs/svelte/overview/llms.txt?format=raw",
      "https://svelte.dev/docs/svelte/overview/llms.txt#fragment",
      "https://svelte.dev/playground",
      "https://svelte.dev/docs/svelte/overview",
      "https://svelte.dev/docs/%2e%2e/private/llms.txt",
    ]) {
      expect(() => assertSvelteNetworkRequest(denied)).toThrow(/not allowed/i);
    }
    expect(() => assertSvelteNetworkRequest(documentationUrl, { method: "POST" })).toThrow(/GET-only/i);

    let forwardedInit: RequestInit | undefined;
    const fixedFetch = createSvelteNetworkFetch(async (_input, init) => {
      forwardedInit = init;
      return new Response("ok");
    });
    await fixedFetch(documentationUrl, { redirect: "follow" });
    expect(forwardedInit?.redirect).toBe("error");

    const redirectedFetch = createSvelteNetworkFetch(async () => ({ redirected: true }));
    await expect(redirectedFetch(documentationUrl)).rejects.toThrow(/redirects are not allowed/i);
  });
});

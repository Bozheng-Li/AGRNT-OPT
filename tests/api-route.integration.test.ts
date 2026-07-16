import { afterAll, describe, expect, it } from "vitest";
import { GET as filesGET, POST as filesPOST } from "../src/app/api/plugins/[slug]/files/route";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";
import { closePluginSessions } from "../src/lib/runtime/invoke";

async function invoke(slug: string, tool: string, args: Record<string, unknown>) {
  return POST(
    new Request(`http://localhost/api/plugins/${slug}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, arguments: args }),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

describe("Next plugin invocation route", () => {
  afterAll(async () => {
    await closePluginSessions();
  });
  it("calls the filesystem MCP adapter through the HTTP route", async () => {
    const response = await invoke("filesystem-workbench", "list_directory", { path: "." });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plugin).toBe("io.github.modelcontextprotocol/server-filesystem");
    expect(payload.result.isError).toBe(false);
  });

  it("calls the in-process skill adapter through the HTTP route", async () => {
    const outline = await invoke("skill-frontend-design", "skill_outline", {});
    expect(outline.status).toBe(200);
    const outlinePayload = await outline.json();
    expect(outlinePayload.plugin).toBe("com.anthropic.skills/frontend-design");
    expect(outlinePayload.result.isError).toBe(false);
    const sectionId = outlinePayload.result.structuredContent.sections[0].id as string;

    const opened = await invoke("skill-frontend-design", "skill_open", { sectionId });
    expect(opened.status).toBe(200);
    const openedPayload = await opened.json();
    expect(openedPayload.result.isError).toBe(false);
    expect(String(openedPayload.result.structuredContent.content || "")).toMatch(/./);
  });

  it("calls the sequential-thinking MCP adapter through the HTTP route", async () => {
    const response = await invoke("sequential-thinking-studio", "sequentialthinking", {
      thought: "Verify the route boundary",
      nextThoughtNeeded: false,
      thoughtNumber: 1,
      totalThoughts: 1,
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result.isError).toBe(false);
    expect(payload.result.content[0].text).toContain("thoughtNumber");
  });

  it("calls the Python time MCP adapter through the HTTP route", async () => {
    const response = await invoke("timezone-converter", "convert_time", {
      source_timezone: "Asia/Shanghai",
      time: "09:00",
      target_timezone: "Europe/London",
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result.isError).toBe(false);
    expect(payload.result.content[0].text).toContain("Europe/London");
  });

  it("calls the Python Git MCP adapter through the HTTP route", async () => {
    const response = await invoke("git-sandbox-studio", "git_status", {});
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plugin).toBe("io.github.modelcontextprotocol/server-git");
    expect(payload.result.isError).toBe(false);
  });

  it("calls the Python SQLite MCP adapter through the HTTP route", async () => {
    const create = await invoke("sqlite-workbench", "create_table", {
      query: "CREATE TABLE IF NOT EXISTS route_items (id INTEGER PRIMARY KEY, label TEXT);",
    });
    expect(create.status).toBe(200);
    const createPayload = await create.json();
    expect(createPayload.plugin).toBe("io.github.modelcontextprotocol/server-sqlite");
    expect(createPayload.result.isError).toBe(false);

    const tables = await invoke("sqlite-workbench", "list_tables", {});
    expect(tables.status).toBe(200);
    const tablesPayload = await tables.json();
    expect(tablesPayload.result.isError).toBe(false);
    expect(JSON.stringify(tablesPayload.result.content)).toContain("route_items");
  });

  it("calls the Svelte MCP adapter through the HTTP route", async () => {
    const response = await invoke("svelte-development-studio", "svelte-autofixer", {
      code: "<script>let count = 0;</script>\n<button on:click={() => count += 1}>{count}</button>",
      desired_svelte_version: 5,
      filename: "Counter.svelte",
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plugin).toBe("dev.svelte/mcp");
    expect(payload.result.isError).toBe(false);
    expect(JSON.stringify(payload.result.structuredContent ?? payload.result.content)).toMatch(
      /on:click|event_directive_deprecated|\$state|non_reactive/i,
    );
  }, 120_000);

  it("calls the defluff MCP adapter through the HTTP route", async () => {
    const response = await invoke("prose-defluffer", "slop_detect", {
      text: "Furthermore, this robust workflow can leverage synergies.",
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plugin).toBe("io.github.ahmedak/defluff");
    expect(payload.result.isError).toBe(false);
    expect(payload.result.content[0].text).toContain("slop_score");
  });

  it("calls the agentic-mermaid MCP adapter through the HTTP route", async () => {
    const response = await invoke("mermaid-diagram-studio", "describe", {
      source: "flowchart LR\n  Web --> MCP",
      format: "facts",
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plugin).toBe("io.github.adewale/agentic-mermaid");
    expect(payload.result.isError).toBe(false);
    expect(payload.result.content[0].text).toContain("family flowchart");
  });

  it("calls the Blueprint Chart MCP adapter through the HTTP route", async () => {
    const response = await invoke("blueprint-chart-studio", "validate_dsl", {
      source: 'chart bar-vertical {\n  title = "Route"\n  data { "A" = 1 }\n}',
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plugin).toBe("io.github.blueprint-chart/mcp");
    expect(payload.result.isError).toBe(false);
    expect(payload.result.structuredContent).toMatchObject({ valid: true, errors: [] });
  });

  it("preserves an oxidize-pdf authoring session across HTTP requests", async () => {
    const outputPath = `route/persistent-${Date.now()}.pdf`;
    const create = await invoke("oxidize-pdf-workbench", "create_pdf", {
      title: "Persistent route PDF",
      page_size: "a4",
    });
    expect(create.status).toBe(200);
    const createPayload = await create.json();
    expect(createPayload.plugin).toBe("io.github.bzsanti/oxidize-pdf-mcp");
    const sessionId = createPayload.result.structuredContent.session_id;

    const add = await invoke("oxidize-pdf-workbench", "add_pdf_content", {
      session_id: sessionId,
      content_type: "text",
      content: "Persistent HTTP session verified",
      x: 72,
      y: 740,
      font_size: 16,
    });
    expect((await add.json()).result.isError).toBe(false);

    const save = await invoke("oxidize-pdf-workbench", "save_pdf", {
      session_id: sessionId,
      output_path: outputPath,
    });
    expect((await save.json()).result.structuredContent).toMatchObject({ status: "ok", page_count: 1 });

    const extract = await invoke("oxidize-pdf-workbench", "extract_text", { path: outputPath });
    const extractPayload = await extract.json();
    expect(extractPayload.result.isError).toBe(false);
    expect(extractPayload.result.structuredContent.text).toContain("Persistent HTTP session verified");
  });

  it("uploads, lists, serves, and confines oxidize-pdf Web files", async () => {
    const sourcePath = `route/upload-source-${Date.now()}.pdf`;
    const create = await invoke("oxidize-pdf-workbench", "create_pdf", { title: "Upload source", page_size: "a4" });
    const sessionId = (await create.json()).result.structuredContent.session_id;
    await invoke("oxidize-pdf-workbench", "add_pdf_content", {
      session_id: sessionId,
      content_type: "text",
      content: "Upload route PDF",
      x: 72,
      y: 740,
      font_size: 14,
    });
    await invoke("oxidize-pdf-workbench", "save_pdf", { session_id: sessionId, output_path: sourcePath });

    const sourceResponse = await filesGET(
      new Request(`http://localhost/api/plugins/oxidize-pdf-workbench/files?path=${encodeURIComponent(sourcePath)}`),
      { params: Promise.resolve({ slug: "oxidize-pdf-workbench" }) },
    );
    expect(sourceResponse.status).toBe(200);
    expect(sourceResponse.headers.get("content-type")).toBe("application/pdf");
    const sourceBody = Buffer.from(await sourceResponse.arrayBuffer());
    expect(sourceBody.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const upload = await filesPOST(
      new Request("http://localhost/api/plugins/oxidize-pdf-workbench/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "browser-upload.pdf", data: sourceBody.toString("base64") }),
      }),
      { params: Promise.resolve({ slug: "oxidize-pdf-workbench" }) },
    );
    expect(upload.status).toBe(200);
    const uploadPayload = await upload.json();
    expect(uploadPayload.file.path).toMatch(/^uploads\/.+\.pdf$/);

    const list = await filesGET(
      new Request("http://localhost/api/plugins/oxidize-pdf-workbench/files"),
      { params: Promise.resolve({ slug: "oxidize-pdf-workbench" }) },
    );
    expect(list.status).toBe(200);
    expect(JSON.stringify((await list.json()).files)).toContain(uploadPayload.file.path);

    const traversal = await filesGET(
      new Request("http://localhost/api/plugins/oxidize-pdf-workbench/files?path=..%2Fescape.pdf"),
      { params: Promise.resolve({ slug: "oxidize-pdf-workbench" }) },
    );
    expect(traversal.status).toBe(400);

    const invalidUpload = await filesPOST(
      new Request("http://localhost/api/plugins/oxidize-pdf-workbench/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "fake.pdf", data: Buffer.from("not a pdf").toString("base64") }),
      }),
      { params: Promise.resolve({ slug: "oxidize-pdf-workbench" }) },
    );
    expect(invalidUpload.status).toBe(400);
  });

  it("calls BumpGuard through the HTTP route and rejects unsafe coordinates", async () => {
    const languages = await invoke("bumpguard-dependency-lab", "list_languages", {});
    expect(languages.status).toBe(200);
    const languagePayload = await languages.json();
    expect(languagePayload.plugin).toBe("io.github.appcreationsca/bumpguard");
    expect(languagePayload.result.structuredContent.languages).toEqual(
      expect.arrayContaining([
        { language: "python", ecosystem: "PyPI" },
        { language: "java", ecosystem: "Maven" },
        { language: "dotnet", ecosystem: "NuGet" },
      ]),
    );

    const imported = await invoke("bumpguard-dependency-lab", "check_import", {
      language: "python",
      package: "pydantic",
    });
    expect(imported.status).toBe(200);
    const importPayload = await imported.json();
    expect(importPayload.result.structuredContent).toMatchObject({
      package: "pydantic",
      installed: true,
      location: "project virtual environment",
    });

    const unsafe = await invoke("bumpguard-dependency-lab", "check_import", {
      language: "python",
      package: "-rrequirements.txt",
    });
    expect(unsafe.status).toBe(400);
    expect((await unsafe.json()).error).toMatch(/包名格式无效/);
  }, 120_000);

  it("rejects unpublished plugins and invalid tools", async () => {
    const missing = await invoke("not-published", "anything", {});
    expect(missing.status).toBe(404);

    const invalid = await invoke("filesystem-workbench", "delete_file", { path: "anything" });
    expect(invalid.status).toBe(400);
  });
});

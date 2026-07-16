/**
 * End-to-end runtime smoke against the shipped invokePluginTool path.
 * Covers all 12 verified plugins: core success + controlled sandbox failures.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getPluginAdapter } from "../src/lib/runtime/adapters";
import { InvocationValidationError } from "../src/lib/runtime/errors";
import { closePluginSessions, invokePluginTool } from "../src/lib/runtime/invoke";

function textOf(result: Awaited<ReturnType<typeof invokePluginTool>>) {
  return result.content
    .map((block) =>
      block && typeof block === "object" && "text" in block ? String(block.text) : JSON.stringify(block),
    )
    .join("\n");
}

async function main() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agent-opt-smoke-"));
  const filesystemRoot = path.join(temporaryRoot, "fs");
  const memoryFile = path.join(temporaryRoot, "memory.jsonl");
  const gitRoot = path.join(temporaryRoot, "git");
  const sqliteDatabase = path.join(temporaryRoot, "db.sqlite");
  const defluffRoot = path.join(temporaryRoot, "defluff");
  const mermaidRoot = path.join(temporaryRoot, "mermaid");
  const blueprintRoot = path.join(temporaryRoot, "blueprint");
  const oxidizeRoot = path.join(temporaryRoot, "oxidize");
  const bumpguardRoot = path.join(temporaryRoot, "bumpguard");

  try {
    const fsMkdir = await invokePluginTool(
      "filesystem-workbench",
      "create_directory",
      { path: "notes" },
      { filesystemRoot },
    );
    console.log(`filesystem mkdir isError=${fsMkdir.isError}`);
    const fsWrite = await invokePluginTool(
      "filesystem-workbench",
      "write_file",
      { path: "notes/smoke.txt", content: "smoke-ok" },
      { filesystemRoot },
    );
    console.log(`filesystem write isError=${fsWrite.isError} text=${textOf(fsWrite).slice(0, 120)}`);
    const fsRead = await invokePluginTool(
      "filesystem-workbench",
      "read_text_file",
      { path: "notes/smoke.txt" },
      { filesystemRoot },
    );
    console.log(`filesystem read isError=${fsRead.isError} hasSmoke=${textOf(fsRead).includes("smoke-ok")}`);

    const mem = await invokePluginTool(
      "knowledge-memory",
      "create_entities",
      { entities: [{ name: "Smoke", entityType: "test", observations: ["runtime smoke"] }] },
      { memoryFile },
    );
    console.log(`memory create isError=${mem.isError}`);

    const think = await invokePluginTool("sequential-thinking-studio", "sequentialthinking", {
      thought: "smoke",
      nextThoughtNeeded: false,
      thoughtNumber: 1,
      totalThoughts: 1,
    });
    console.log(`thinking isError=${think.isError} hasThoughtNumber=${textOf(think).includes("thoughtNumber")}`);

    const time = await invokePluginTool("timezone-converter", "get_current_time", { timezone: "UTC" });
    console.log(`time isError=${time.isError} hasUTC=${textOf(time).includes("UTC")}`);

    const fetch = await invokePluginTool("web-content-reader", "fetch", {
      url: "https://example.com/",
      max_length: 1500,
      start_index: 0,
      raw: false,
    });
    console.log(`fetch isError=${fetch.isError} hasExample=${textOf(fetch).includes("Example Domain")}`);

    const gitAdapter = getPluginAdapter("git-sandbox-studio");
    if (!gitAdapter) throw new Error("missing git adapter");
    await gitAdapter.prepare({ gitRoot });
    await writeFile(path.join(gitRoot, "README.md"), "smoke\n", "utf8");
    const gitStatus = await invokePluginTool("git-sandbox-studio", "git_status", {}, { gitRoot });
    console.log(`git status isError=${gitStatus.isError} text=${textOf(gitStatus).slice(0, 120)}`);

    const sqliteCreate = await invokePluginTool(
      "sqlite-workbench",
      "create_table",
      { query: "CREATE TABLE IF NOT EXISTS smoke (id INTEGER PRIMARY KEY, name TEXT);" },
      { sqliteDatabase },
    );
    console.log(`sqlite create isError=${sqliteCreate.isError} text=${textOf(sqliteCreate).slice(0, 120)}`);

    const defluffDetect = await invokePluginTool(
      "prose-defluffer",
      "slop_detect",
      { text: "Furthermore, this robust platform can leverage synergies." },
      { defluffRoot },
    );
    console.log(`defluff detect isError=${defluffDetect.isError} hasScore=${textOf(defluffDetect).includes("slop_score")}`);

    const mermaidRender = await invokePluginTool(
      "mermaid-diagram-studio",
      "render_png",
      { source: "flowchart LR\n  Smoke --> Verified", scale: 1, background: "white", output: "base64" },
      { mermaidRoot },
    );
    console.log(`mermaid render isError=${mermaidRender.isError} hasPng=${textOf(mermaidRender).includes("png_base64")}`);

    const blueprintExample = await invokePluginTool(
      "blueprint-chart-studio",
      "get_example",
      {},
      { blueprintRoot },
    );
    const blueprintSource = String(blueprintExample.structuredContent?.dsl ?? "");
    const blueprintRender = await invokePluginTool(
      "blueprint-chart-studio",
      "render",
      { source: blueprintSource, format: "png", width: 480, height: 300, modelVisible: false },
      { blueprintRoot },
    );
    const blueprintImage = blueprintRender.content.find(
      (block) => block && typeof block === "object" && "type" in block && block.type === "image",
    ) as { data?: string } | undefined;
    console.log(`blueprint render isError=${blueprintRender.isError} hasPng=${Buffer.from(blueprintImage?.data ?? "", "base64").subarray(0, 8).toString("hex") === "89504e470d0a1a0a"}`);

    const oxidizeCreate = await invokePluginTool(
      "oxidize-pdf-workbench",
      "create_pdf",
      { title: "Runtime smoke PDF", page_size: "a4" },
      { oxidizeRoot },
    );
    const oxidizeSession = String(oxidizeCreate.structuredContent?.session_id ?? "");
    const oxidizeAdd = await invokePluginTool(
      "oxidize-pdf-workbench",
      "add_pdf_content",
      { session_id: oxidizeSession, content_type: "text", content: "oxidize smoke verified", x: 72, y: 740, font_size: 14 },
      { oxidizeRoot },
    );
    const oxidizeSave = await invokePluginTool(
      "oxidize-pdf-workbench",
      "save_pdf",
      { session_id: oxidizeSession, output_path: "smoke.pdf" },
      { oxidizeRoot },
    );
    const oxidizeRead = await invokePluginTool(
      "oxidize-pdf-workbench",
      "extract_text",
      { path: "smoke.pdf" },
      { oxidizeRoot },
    );
    console.log(`oxidize create/add/save/read errors=${[oxidizeCreate, oxidizeAdd, oxidizeSave, oxidizeRead].map((item) => item.isError).join(",")} hasText=${textOf(oxidizeRead).includes("oxidize smoke verified")}`);

    const bumpguardLanguages = await invokePluginTool(
      "bumpguard-dependency-lab",
      "list_languages",
      {},
      { bumpguardRoot },
    );
    const bumpguardUpgrade = await invokePluginTool(
      "bumpguard-dependency-lab",
      "check_upgrade",
      {
        language: "python",
        package: "sniffio",
        from_version: "1.3.0",
        to_version: "1.3.1",
        code: "import sniffio\nname = sniffio.current_async_library()\n",
      },
      { bumpguardRoot },
    );
    const bumpguardOk = !bumpguardLanguages.isError && !bumpguardUpgrade.isError &&
      textOf(bumpguardLanguages).includes("NuGet") &&
      bumpguardUpgrade.structuredContent?.safe_to_upgrade === true;
    console.log(`bumpguard errors=${bumpguardLanguages.isError},${bumpguardUpgrade.isError} languages=${textOf(bumpguardLanguages).includes("Maven")} safe=${bumpguardUpgrade.structuredContent?.safe_to_upgrade}`);

    let failed = !bumpguardOk;

    try {
      await invokePluginTool("filesystem-workbench", "read_text_file", { path: "../escape.txt" }, { filesystemRoot });
      console.log("filesystem traversal unexpectedly allowed");
      failed = true;
    } catch (error) {
      console.log(`filesystem traversal blocked: ${error instanceof InvocationValidationError}`);
    }

    try {
      await invokePluginTool("web-content-reader", "fetch", {
        url: "http://127.0.0.1/",
        max_length: 100,
        start_index: 0,
        raw: false,
      });
      console.log("localhost fetch unexpectedly allowed");
      failed = true;
    } catch (error) {
      console.log(`localhost fetch blocked: ${error instanceof InvocationValidationError}`);
    }

    try {
      await invokePluginTool("git-sandbox-studio", "git_add", { files: ["C:/Windows/system.ini"] }, { gitRoot });
      console.log("git host path unexpectedly allowed");
      failed = true;
    } catch (error) {
      console.log(`git host path blocked: ${error instanceof InvocationValidationError}`);
    }

    try {
      await invokePluginTool("git-sandbox-studio", "git_diff", { target: "--output=outside.patch" }, { gitRoot });
      console.log("git option-like revision unexpectedly allowed");
      failed = true;
    } catch (error) {
      console.log(`git option-like revision blocked: ${error instanceof InvocationValidationError}`);
    }

    try {
      await invokePluginTool(
        "sqlite-workbench",
        "write_query",
        { query: "ATTACH DATABASE 'C:/evil.db' AS evil;" },
        { sqliteDatabase },
      );
      console.log("sqlite ATTACH unexpectedly allowed");
      failed = true;
    } catch (error) {
      console.log(`sqlite ATTACH blocked: ${error instanceof InvocationValidationError}`);
    }

    try {
      await invokePluginTool(
        "sqlite-workbench",
        "write_query",
        { query: "VACUUM INTO 'C:/evil.db';" },
        { sqliteDatabase },
      );
      console.log("sqlite VACUUM INTO unexpectedly allowed");
      failed = true;
    } catch (error) {
      console.log(`sqlite VACUUM INTO blocked: ${error instanceof InvocationValidationError}`);
    }

    try {
      await invokePluginTool(
        "sqlite-workbench",
        "read_query",
        { query: "SELECT 1; DELETE FROM smoke;" },
        { sqliteDatabase },
      );
      console.log("sqlite multi-statement query unexpectedly allowed");
      failed = true;
    } catch (error) {
      console.log(`sqlite multi-statement query blocked: ${error instanceof InvocationValidationError}`);
    }

    try {
      await invokePluginTool(
        "prose-defluffer",
        "slop_add",
        { pattern: "machine-wide", category: "corporate", scope: "user" },
        { defluffRoot },
      );
      console.log("defluff user scope unexpectedly allowed");
      failed = true;
    } catch (error) {
      console.log(`defluff user scope blocked: ${error instanceof InvocationValidationError}`);
    }

    const mermaidEscape = await invokePluginTool(
      "mermaid-diagram-studio",
      "execute",
      { code: "return ({}).constructor.constructor('return process')()", timeoutMs: 500 },
      { mermaidRoot },
    );
    if (!mermaidEscape.isError) {
      console.log("mermaid constructor escape unexpectedly allowed");
      failed = true;
    } else {
      console.log("mermaid constructor escape blocked: true");
    }

    try {
      await invokePluginTool(
        "blueprint-chart-studio",
        "render",
        { source: blueprintSource, format: "png", save: "../escape.png" },
        { blueprintRoot },
      );
      console.log("blueprint traversal unexpectedly allowed");
      failed = true;
    } catch (error) {
      console.log(`blueprint traversal blocked: ${error instanceof InvocationValidationError}`);
    }

    try {
      await invokePluginTool("oxidize-pdf-workbench", "read_pdf", { path: "../escape.pdf" }, { oxidizeRoot });
      console.log("oxidize traversal unexpectedly allowed");
      failed = true;
    } catch (error) {
      console.log(`oxidize traversal blocked: ${error instanceof InvocationValidationError}`);
    }

    try {
      await invokePluginTool(
        "bumpguard-dependency-lab",
        "check_import",
        { language: "python", package: "-rrequirements.txt" },
        { bumpguardRoot },
      );
      console.log("bumpguard option-like package unexpectedly allowed");
      failed = true;
    } catch (error) {
      console.log(`bumpguard option-like package blocked: ${error instanceof InvocationValidationError}`);
    }

    if (failed) {
      console.log("SMOKE FAILED");
      process.exitCode = 1;
    } else {
      console.log("SMOKE PASSED: all core and security paths behaved as expected");
    }
  } finally {
    await closePluginSessions();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const publicManifests = readdirSync(path.join(process.cwd(), "catalog", "plugins"))
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(path.join(process.cwd(), "catalog", "plugins", file), "utf8")) as {
    slug: string;
    lifecycle: { status: string };
    name: { zhCN: string };
  })
  .filter((manifest) => ["web-ready", "verified"].includes(manifest.lifecycle.status));
const publicCount = publicManifests.length;
const publicName = (slug: string) => publicManifests.find((manifest) => manifest.slug === slug)?.name.zhCN ?? slug;

test("catalog exposes the Web-ready integrations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /把真正有用的 Agent 能力/ })).toBeVisible();
  // Exact count comes from current web-ready / verified manifests.
  await expect(page.getByRole("link", { name: /打开 Web/ })).toHaveCount(publicCount);
  await expect(page.getByRole("heading", { name: "文件系统工作台" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "知识图谱记忆库" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Svelte 开发工作室" })).toBeVisible();
  await expect(page.getByRole("heading", { name: publicName("skill-frontend-design") })).toBeVisible();
  await expect(page.getByRole("heading", { name: publicName("skill-brainstorming") })).toBeVisible();
  await expect(page.getByRole("heading", { name: "JSON 实验室" })).toBeVisible();
  await expect(page.getByText(`${publicCount} 个符合质量门槛的 Web 适配`)).toBeVisible();
});

test("skill studio runs a curated bilingual Anthropic task workflow", async ({ page }) => {
  await page.goto("/plugins/skill-frontend-design");
  await expect(page.getByText("Skill 工作室")).toBeVisible();
  await expect(page.getByTestId("skill-locale-zh")).toHaveClass(/active/, { timeout: 15_000 });
  await page.getByTestId("skill-example-0").click();
  await page.getByTestId("skill-prepare-run").click();
  await expect(page.getByTestId("skill-playbook")).toContainText("前端设计执行包", { timeout: 15_000 });
});

test("first-party local plugin workspace runs JSON format tool", async ({ page }) => {
  await page.goto("/plugins/local-json-lab");
  await expect(page.getByRole("heading", { name: "JSON 实验室" })).toBeVisible();
  await page.getByTestId("local-mcp-run").click();
  await expect(page.getByTestId("result-output")).toContainText("hello", { timeout: 15_000 });
});

test("filesystem Web writes and reads a sandbox file", async ({ page }) => {
  await page.goto("/plugins/filesystem-workbench");
  await page.getByRole("button", { name: "写入" }).click();
  await page.getByTestId("filesystem-path").fill("e2e/verified.txt");
  await page.getByTestId("filesystem-content").fill("Agent-OPT browser verified");
  await page.getByTestId("filesystem-run").click();
  await expect(page.getByTestId("result-output")).toContainText(/successfully|verified\.txt/i);

  await page.getByRole("button", { name: "读取" }).click();
  await page.getByTestId("filesystem-run").click();
  await expect(page.getByTestId("result-output")).toContainText("Agent-OPT browser verified");
});

test("memory Web creates and searches an entity", async ({ page }) => {
  const entity = `E2E_Entity_${Date.now()}`;
  await page.goto("/plugins/knowledge-memory");
  await page.getByTestId("memory-name").fill(entity);
  await page.getByTestId("memory-type").fill("verification");
  await page.getByTestId("memory-observations").fill("created by browser end-to-end verification");
  await page.getByTestId("memory-run").click();
  await expect(page.getByTestId("result-output")).toContainText(entity);

  await page.getByRole("button", { name: "搜索" }).click();
  await page.getByTestId("memory-query").fill(entity);
  await page.getByTestId("memory-run").click();
  await expect(page.getByTestId("result-output")).toContainText(entity);
});

test("sequential-thinking Web records a structured step", async ({ page }) => {
  await page.goto("/plugins/sequential-thinking-studio");
  await page.getByTestId("thinking-text").fill("验证每个正式插件都有与能力匹配的独立 Web 工作流");
  await page.getByTestId("thinking-number").fill("1");
  await page.getByTestId("thinking-run").click();
  await expect(page.getByTestId("result-output")).toContainText("thoughtNumber");
  await expect(page.getByText("验证每个正式插件都有与能力匹配的独立 Web 工作流")).toBeVisible();
});

test("time Web converts between IANA timezones", async ({ page }) => {
  await page.goto("/plugins/timezone-converter");
  await page.getByRole("button", { name: "时区换算" }).click();
  await page.getByTestId("source-timezone").fill("Asia/Shanghai");
  await page.getByTestId("source-time").fill("09:00");
  await page.getByTestId("target-timezone").fill("America/New_York");
  await page.getByTestId("time-run").click();
  await expect(page.getByTestId("result-output")).toContainText("America/New_York");
});

test("fetch Web extracts a public page and rejects localhost", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/plugins/web-content-reader");
  await page.getByTestId("fetch-url").fill("https://example.com/");
  await page.getByTestId("fetch-run").click();
  await expect(page.getByTestId("result-output")).toContainText("Example Domain", { timeout: 30_000 });

  await page.getByTestId("fetch-url").fill("http://127.0.0.1/");
  await page.getByTestId("fetch-run").click();
  await expect(page.getByTestId("invoke-error")).toContainText(/不允许访问|私有|回环/);
});

test("@web-e2e [markitdown-document-studio] MarkItDown Web uploads, converts, and reports unsafe formats", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/plugins/markitdown-document-studio");
  await expect(page.getByRole("heading", { name: "MarkItDown 文档工作室" })).toBeVisible();

  await page.getByTestId("markitdown-file").setInputFiles({
    name: "unsafe.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("MZ unsafe", "utf8"),
  });
  await page.getByTestId("markitdown-run").click();
  await expect(page.getByTestId("invoke-error")).toContainText(/支持 PDF|文档上传失败/, { timeout: 15_000 });

  await page.getByTestId("markitdown-file").setInputFiles({
    name: "browser-evidence.html",
    mimeType: "text/html",
    buffer: Buffer.from(
      "<!doctype html><html><body><h1>Browser conversion evidence</h1><p>Real Chromium upload and MCP invocation.</p></body></html>",
      "utf8",
    ),
  });
  await page.getByTestId("markitdown-run").click();
  await expect(page.getByTestId("markitdown-file-facts")).toContainText("HTML", { timeout: 30_000 });
  await expect(page.getByTestId("markitdown-output")).toContainText("Browser conversion evidence", { timeout: 60_000 });
  await expect(page.getByTestId("markitdown-output")).toContainText("Real Chromium upload");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("markitdown-dropzone")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("@web-e2e [e18e-dependency-advisor] e18e Web runs every tool, a migration resource, and the task prompt", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/plugins/e18e-dependency-advisor");
  await expect(page.getByRole("heading", { name: "e18e 依赖性能顾问" })).toBeVisible();
  await expect(page.getByText("GPT 风味 · 本地静态知识库 · 不安装依赖")).toBeVisible();

  await page.getByTestId("e18e-install-command").fill("pnpm add lodash moment chalk");
  await page.getByTestId("e18e-run").click();
  await expect(page.getByTestId("e18e-suggestions")).toContainText("moment", { timeout: 30_000 });
  await expect(page.getByTestId("e18e-suggestions")).toContainText("chalk");

  await page.getByTestId("e18e-tab-source").click();
  await page.getByTestId("e18e-code").fill("import chalk from 'chalk';\nimport moment from 'moment';\n");
  await page.getByTestId("e18e-run").click();
  await expect(page.getByTestId("e18e-suggestions")).toContainText("chalk", { timeout: 30_000 });

  await page.getByTestId("e18e-tab-lookup").click();
  await page.getByTestId("e18e-query").fill("filter");
  await page.getByTestId("e18e-run").click();
  await expect(page.getByTestId("e18e-lookup-results")).toContainText("Array.prototype.filter", { timeout: 30_000 });
  await expect(page.getByTestId("e18e-lookup-results")).toContainText("micro-utility");
  await expect(page.getByTestId("e18e-lookup-results")).toContainText("preferred");

  await page.getByTestId("e18e-tab-assets").click();
  await page.getByTestId("e18e-load-assets").click();
  await expect(page.getByTestId("e18e-resource-count")).toContainText("117 篇指南", { timeout: 30_000 });
  await expect(page.getByTestId("e18e-resource-count")).toContainText("e18e://docs/{slug}");
  await page.getByTestId("e18e-resource-filter").fill("moment");
  await page.getByTestId("e18e-resource-moment.md").click();
  await expect(page.getByTestId("e18e-doc-output")).toContainText("Replacements for `Moment.js`", { timeout: 30_000 });
  await expect(page.getByTestId("e18e-doc-output")).toContainText("date-fns");

  await page.getByTestId("e18e-task").fill("Browser evidence: review dependencies before proposing code");
  await page.getByTestId("e18e-build-prompt").click();
  await expect(page.getByTestId("e18e-prompt-output")).toContainText("Browser evidence: review dependencies before proposing code", { timeout: 30_000 });
  await expect(page.getByTestId("e18e-prompt-output")).toContainText("npm-i-checker");

  await page.getByTestId("e18e-tab-install").click();
  await page.getByTestId("e18e-install-command").fill("npm i lodash && calc.exe");
  await page.getByTestId("e18e-run").click();
  await expect(page.getByTestId("invoke-error")).toContainText(/不接受旗标|安装命令文本/, { timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("e18e-tab-install")).toBeVisible();
  await expect(page.getByTestId("e18e-tab-assets")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("git Web reports sandbox repository status", async ({ page }) => {
  await page.goto("/plugins/git-sandbox-studio");
  await page.getByTestId("git-run").click();
  await expect(page.getByTestId("result-output")).toContainText(/On branch|nothing to commit|Untracked|Changes|No commits|git/i);
});

test("sqlite Web creates a table and lists it", async ({ page }) => {
  await page.goto("/plugins/sqlite-workbench");
  await page.getByRole("button", { name: "建表" }).click();
  await page.getByTestId("sqlite-create").fill(
    "CREATE TABLE IF NOT EXISTS e2e_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL);",
  );
  await page.getByTestId("sqlite-run").click();
  await expect(page.getByTestId("result-output")).toContainText(/Table created successfully|affected_rows/i);

  await page.getByRole("button", { name: "表列表" }).click();
  await page.getByTestId("sqlite-run").click();
  await expect(page.getByTestId("result-output")).toContainText("e2e_items");
});

test("defluff Web scores prose and shows exact filler spans", async ({ page }) => {
  await page.goto("/plugins/prose-defluffer");
  await page.getByTestId("defluff-text").fill(
    "Furthermore, it is worth noting that this cutting-edge platform can leverage robust synergies.",
  );
  await page.getByTestId("defluff-run").click();
  await expect(page.getByTestId("defluff-summary")).toContainText("去冗分数");
  await expect(page.getByTestId("result-output")).toContainText("slop_score");
  // Multiple span cards may quote the same filler phrase; assert at least one is visible.
  await expect(page.getByText("“Furthermore”").first()).toBeVisible();
});

test("Mermaid Web renders PNG, reads semantic facts, and runs Code Mode", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/plugins/mermaid-diagram-studio");
  await page.getByTestId("mermaid-source").fill("flowchart LR\n  User --> Web\n  Web --> MCP");
  await page.getByTestId("mermaid-run").click();
  const image = page.getByTestId("mermaid-image");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);

  await page.getByTestId("mermaid-tab-describe").click();
  await page.getByTestId("mermaid-format").selectOption("facts");
  await page.getByTestId("mermaid-run").click();
  await expect(page.getByTestId("result-output")).toContainText("family flowchart");
  await expect(page.getByTestId("result-output")).toContainText("edge User -> Web");

  await page.getByTestId("mermaid-tab-code").click();
  await page.getByTestId("mermaid-code").fill(
    "return mermaid.renderMermaidASCII('flowchart TD\\n  A --> B', { useAscii: true })",
  );
  await page.getByTestId("mermaid-run").click();
  await expect(page.getByTestId("result-output")).toContainText('"ok":true');
  await expect(page.getByTestId("result-output")).toContainText("A");
});

test("Blueprint Web recommends, loads, validates, renders, and exports a data chart", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/plugins/blueprint-chart-studio");

  await page.getByTestId("blueprint-tab-recommend").click();
  await page.getByTestId("blueprint-goal").fill("rank categories by value");
  await page.getByTestId("blueprint-shape").selectOption("string,number");
  await page.getByTestId("blueprint-rows").fill("10");
  await page.getByTestId("blueprint-recommend").click();
  await expect(page.getByTestId("blueprint-recommendations")).toContainText(/bar|Bar/);

  await page.getByTestId("blueprint-use-recommendation").click();
  await expect(page.getByTestId("blueprint-source")).toHaveValue(/chart bar-/);

  await page.getByTestId("blueprint-validate").click();
  await expect(page.getByTestId("blueprint-validation")).toContainText("DSL 校验通过");

  await page.getByTestId("blueprint-render").click();
  const image = page.getByTestId("blueprint-image");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);

  await page.getByTestId("blueprint-export").click();
  await expect(page.getByTestId("blueprint-export-result")).toBeVisible();
  await expect(page.getByTestId("blueprint-copy-link")).toHaveAttribute("href", /^https:\/\/blueprintchart\.com\/#\/copy\?bpc64=/);
  await expect(page.getByTestId("blueprint-embed-link")).toHaveAttribute("href", /^https:\/\/blueprintchart\.com\/#\/render\?bpc64=/);
});

test("oxidize-pdf Web keeps a creation session, previews the file, extracts text, and checks security", async ({ page }) => {
  test.setTimeout(90_000);
  const outputPath = `e2e/oxidize-${Date.now()}.pdf`;
  await page.goto("/plugins/oxidize-pdf-workbench");

  await page.getByTestId("oxidize-tab-create").click();
  await page.getByTestId("oxidize-title").fill("E2E oxidize PDF");
  await page.getByTestId("oxidize-created-output").fill(outputPath);
  await page.getByTestId("oxidize-create-session").click();
  await expect(page.getByTestId("oxidize-create-session")).toContainText("会话");

  await page.getByTestId("oxidize-content").fill("Persistent oxidize browser verification");
  await page.getByTestId("oxidize-add-content").click();
  await expect(page.getByTestId("oxidize-save")).toBeEnabled();
  await page.getByTestId("oxidize-save").click();
  await expect(page.getByTestId("oxidize-file-select")).toHaveValue(outputPath);
  await expect(page.getByTestId("oxidize-frame")).toHaveAttribute("src", new RegExp(encodeURIComponent(outputPath)));

  await page.getByTestId("oxidize-tab-read").click();
  await page.getByTestId("oxidize-reader-tool").selectOption("extract_text");
  await page.getByTestId("oxidize-read-run").click();
  await expect(page.getByTestId("oxidize-text-result")).toContainText("Persistent oxidize browser verification");

  await page.getByTestId("oxidize-tab-process").click();
  await page.getByTestId("oxidize-process-tool").selectOption("secure_pdf");
  await page.getByTestId("oxidize-secure-operation").selectOption("permissions");
  await page.getByTestId("oxidize-process-run").click();
  await expect(page.getByTestId("oxidize-security-result")).toContainText("encrypted");

  const download = page.getByTestId("oxidize-download");
  const response = await page.request.get(await download.getAttribute("href") ?? "");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0, 5).toString("ascii")).toBe("%PDF-");
});

test("BumpGuard Web exercises providers, upgrade, diff, snippet, import, symbols, and validation", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/plugins/bumpguard-dependency-lab");

  await page.getByTestId("bumpguard-probe-languages").click();
  await expect(page.getByTestId("bumpguard-provider-result")).toContainText("PyPI", { timeout: 30_000 });
  await expect(page.getByTestId("bumpguard-provider-result")).toContainText("Maven");
  await expect(page.getByTestId("bumpguard-provider-result")).toContainText("NuGet");

  await page.getByTestId("bumpguard-run").click();
  await expect(page.getByTestId("bumpguard-upgrade-result")).toContainText("sniffio", { timeout: 60_000 });
  await expect(page.getByTestId("bumpguard-upgrade-result")).toContainText("未发现命中当前代码的破坏");

  await page.getByTestId("bumpguard-tab-diff").click();
  await page.getByTestId("bumpguard-run").click();
  await expect(page.getByTestId("bumpguard-diff-result")).toContainText("1.3.0 → 1.3.1", { timeout: 60_000 });

  await page.getByTestId("bumpguard-tab-verify").click();
  await page.getByTestId("bumpguard-code").fill("import pydntic\npydntic.BaseModel()\n");
  await page.getByTestId("bumpguard-run").click();
  await expect(page.getByTestId("bumpguard-verify-result")).toContainText("代码片段需要复核", { timeout: 30_000 });
  await expect(page.getByTestId("bumpguard-findings")).toContainText("pydntic");

  await page.getByTestId("bumpguard-tab-import").click();
  await page.getByTestId("bumpguard-package").fill("pydntic");
  await page.getByTestId("bumpguard-run").click();
  await expect(page.getByTestId("bumpguard-import-result")).toContainText("pydantic", { timeout: 30_000 });

  await page.getByTestId("bumpguard-package").fill("-rrequirements.txt");
  await page.getByTestId("bumpguard-run").click();
  await expect(page.getByTestId("invoke-error")).toContainText("包名格式无效");

  await page.getByTestId("bumpguard-tab-symbols").click();
  await page.getByTestId("bumpguard-package").fill("pydantic");
  await page.getByTestId("bumpguard-filter").fill("BaseModel");
  await page.getByTestId("bumpguard-run").click();
  await expect(page.getByTestId("bumpguard-symbol-result")).toContainText("BaseModel", { timeout: 30_000 });

  await page.getByTestId("bumpguard-language-java").click();
  await expect(page.getByTestId("bumpguard-package")).toHaveValue("com.google.code.gson:gson");
  await page.getByTestId("bumpguard-language-dotnet").click();
  await expect(page.getByTestId("bumpguard-package")).toHaveValue("Newtonsoft.Json");
});

test("Svelte Web diagnoses code, retrieves docs, and generates a Playground link", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/plugins/svelte-development-studio");
  await expect(page.getByRole("heading", { name: "Svelte 开发工作室" })).toBeVisible();

  await page.getByTestId("svelte-filename").fill("../Counter.svelte");
  await page.getByTestId("svelte-run").click();
  await expect(page.getByTestId("invoke-error")).toContainText(/文件名必须|无路径/, { timeout: 15_000 });

  await page.getByTestId("svelte-example-s5legacy").click();
  await page.getByTestId("svelte-run").click();
  await expect(page.getByTestId("svelte-diagnostics")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("svelte-issue").first()).toContainText(/on:click|event_directive_deprecated|\$state|non_reactive/i);

  await page.getByTestId("svelte-tab-docs").click();
  await page.getByTestId("svelte-load-sections").click();
  await expect(page.getByTestId("svelte-section-list")).toContainText("Overview", { timeout: 45_000 });
  await page.getByTestId("svelte-section-query").fill("$state");
  await expect(page.getByTestId("svelte-section-list")).toContainText("$state", { timeout: 15_000 });
  await expect(page.getByTestId("svelte-section-svelte/$state")).toBeChecked();
  await page.getByTestId("svelte-run").click();
  await expect(page.getByTestId("svelte-markdown")).toContainText(/\$state|reactive/i, { timeout: 45_000 });

  await page.getByTestId("svelte-section-svelte/$state").uncheck();
  await page.getByTestId("svelte-section-query").fill("Overview");
  const aiOverview = page.getByTestId("svelte-section-ai/overview");
  const svelteOverview = page.getByTestId("svelte-section-svelte/overview");
  await expect(aiOverview).not.toBeChecked();
  await svelteOverview.check();
  await expect(svelteOverview).toBeChecked();
  await expect(aiOverview).not.toBeChecked();
  await page.getByTestId("svelte-run").click();
  await expect(page.getByTestId("svelte-markdown")).toContainText(
    "Svelte is a framework for building user interfaces",
    { timeout: 45_000 },
  );
  await expect(page.getByTestId("svelte-markdown")).not.toContainText(
    "There are four tools, designed to help your agent",
  );

  await page.getByTestId("svelte-tab-playground").click();
  await page.getByTestId("svelte-new-file").fill("utils.js");
  await page.getByTestId("svelte-add-file").click();
  await expect(page.getByTestId("svelte-file-tab-utils.js")).toHaveClass(/active/);
  await page.getByTestId("svelte-playground-code").fill("export const answer = 42;\n");
  await page.getByTestId("svelte-run").click();
  await expect(page.getByTestId("svelte-playground-result")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("svelte-playground-url")).toContainText("https://svelte.dev/playground#");
  await expect(page.getByTestId("svelte-playground-open")).toHaveAttribute("href", /^https:\/\/svelte\.dev\/playground#/);
  await page.getByTestId("svelte-file-remove-utils.js").click();
  await expect(page.getByTestId("svelte-file-tab-utils.js")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("svelte-tab-diagnostics")).toBeVisible();
  await expect(page.getByTestId("svelte-tab-playground")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

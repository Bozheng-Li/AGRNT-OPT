import { expect, test } from "@playwright/test";

test("catalog exposes the Web-ready integrations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /把真正有用的 Agent 能力/ })).toBeVisible();
  // 13 verified MCP workspaces + curated agent-skill studios.
  await expect(page.getByRole("link", { name: /打开 Web/ })).toHaveCount(41);
  await expect(page.getByText("文件系统工作台")).toBeVisible();
  await expect(page.getByText("知识图谱记忆库")).toBeVisible();
  await expect(page.getByText("结构化思考工作室")).toBeVisible();
  await expect(page.getByText("世界时间与时区换算")).toBeVisible();
  await expect(page.getByText("网页正文读取器")).toBeVisible();
  await expect(page.getByText("Git 沙箱工作室")).toBeVisible();
  await expect(page.getByText("SQLite 数据工作台")).toBeVisible();
  await expect(page.getByText("确定性文本去冗器")).toBeVisible();
  await expect(page.getByText("Mermaid 图表工作室")).toBeVisible();
  await expect(page.getByText("Blueprint 数据图表工作台")).toBeVisible();
  await expect(page.getByText("oxidize-pdf 文档工作台")).toBeVisible();
  await expect(page.getByText("BumpGuard 依赖兼容实验室")).toBeVisible();
  await expect(page.getByText("Svelte 开发工作室")).toBeVisible();
  await expect(page.getByText("前端视觉设计指南")).toBeVisible();
  await expect(page.getByText("结构化头脑风暴")).toBeVisible();
});

test("skill studio opens a curated Anthropic skill section", async ({ page }) => {
  await page.goto("/plugins/skill-frontend-design");
  await expect(page.getByText("Skill 工作室")).toBeVisible();
  await expect(page.getByTestId("skill-outline")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("skill-open-section").click();
  await expect(page.getByTestId("result-output")).not.toHaveText("", { timeout: 15_000 });
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
  test.setTimeout(120_000);
  await page.goto("/plugins/svelte-development-studio");
  await expect(page.getByRole("heading", { name: "Svelte 开发工作室" })).toBeVisible();

  await page.getByTestId("svelte-example-s5legacy").click();
  await page.getByTestId("svelte-run").click();
  await expect(page.getByTestId("svelte-diagnostics")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("svelte-issue").first()).toContainText(/on:click|event_directive_deprecated|\$state|non_reactive/i);

  await page.getByTestId("svelte-tab-docs").click();
  await page.getByTestId("svelte-load-sections").click();
  await expect(page.getByTestId("svelte-section-list")).toContainText("Overview", { timeout: 45_000 });
  await page.getByTestId("svelte-section-query").fill("$state");
  await expect(page.getByTestId("svelte-section-list")).toContainText("$state", { timeout: 15_000 });
  await page.getByTestId("svelte-section-$state").check();
  await page.getByTestId("svelte-run").click();
  await expect(page.getByTestId("svelte-markdown")).toContainText(/\$state|reactive/i, { timeout: 45_000 });

  await page.getByTestId("svelte-tab-playground").click();
  await page.getByTestId("svelte-run").click();
  await expect(page.getByTestId("svelte-playground-result")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("svelte-playground-url")).toContainText("https://svelte.dev/playground#");
  await expect(page.getByTestId("svelte-playground-open")).toHaveAttribute("href", /^https:\/\/svelte\.dev\/playground#/);
});

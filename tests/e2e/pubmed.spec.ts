import { expect, test, type Locator, type Page } from "@playwright/test";

test("@web-e2e [pubmed-evidence-lab] PubMed Web runs ten tools, resource, prompt, errors, and responsive workflow", async ({ page }) => {
  test.setTimeout(300_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/plugins/pubmed-evidence-lab");
  await expect(page.getByText("PubMed 生物医学证据台", { exact: false }).first()).toBeVisible();
  const run = page.getByTestId("pubmed-run");

  await runTool(page, run, "pubmed_search_articles");
  await expect(page.getByTestId("pubmed-search-results")).toContainText("GenBank", { timeout: 60_000 });
  await expect(page.getByTestId("pubmed-search-results")).toContainText("23193287");

  await page.getByTestId("pubmed-search-mode-europe").click();
  await runTool(page, run, "pubmed_europepmc_search");
  await expect(page.getByTestId("pubmed-search-results")).toContainText("OPEN ACCESS", { timeout: 60_000 });
  await expect(page.getByTestId("pubmed-search-results")).toContainText("PMC3531190");

  await page.getByTestId("pubmed-tab-evidence").click();
  await runTool(page, run, "pubmed_fetch_articles");
  await expect(page.getByTestId("pubmed-article-results")).toContainText("GenBank", { timeout: 60_000 });
  await expect(page.getByTestId("pubmed-article-results")).toContainText("23193287");

  await page.getByTestId("pubmed-evidence-mode-fulltext").click();
  await runTool(page, run, "pubmed_fetch_fulltext");
  await expect(page.getByTestId("pubmed-fulltext-result")).toContainText("GenBank", { timeout: 60_000 });
  await expect(page.getByTestId("pubmed-fulltext-result")).toContainText("INTRODUCTION");

  await page.getByTestId("pubmed-evidence-mode-related").click();
  await runTool(page, run, "pubmed_find_related");
  await expect(page.getByTestId("pubmed-related-results")).toContainText("关联文献", { timeout: 60_000 });
  await expect(page.getByTestId("pubmed-related-results")).toContainText(/22144687|24217914/);

  await page.getByTestId("pubmed-tab-citations").click();
  await runTool(page, run, "pubmed_format_citations");
  await expect(page.getByTestId("pubmed-citation-results")).toContainText("GenBank", { timeout: 60_000 });
  await expect(page.getByTestId("pubmed-citation-results")).toContainText("APA");

  await page.getByTestId("pubmed-citation-mode-lookup").click();
  await runTool(page, run, "pubmed_lookup_citation");
  await expect(page.getByTestId("pubmed-lookup-results")).toContainText("MATCHED", { timeout: 60_000 });
  await expect(page.getByTestId("pubmed-lookup-results")).toContainText("23193287");

  await page.getByTestId("pubmed-citation-mode-convert").click();
  await runTool(page, run, "pubmed_convert_ids");
  await expect(page.getByTestId("pubmed-convert-results")).toContainText("PMC3531190", { timeout: 60_000 });
  await expect(page.getByTestId("pubmed-convert-results")).toContainText("10.1093/nar/gks1195");

  await page.getByTestId("pubmed-tab-vocabulary").click();
  await runTool(page, run, "pubmed_spell_check");
  await expect(page.getByTestId("pubmed-spell-result")).toContainText("diabetes mellitus", { timeout: 60_000 });

  await page.getByTestId("pubmed-vocabulary-mode-mesh").click();
  await runTool(page, run, "pubmed_lookup_mesh");
  await expect(page.getByTestId("pubmed-mesh-results")).toContainText("D003920", { timeout: 60_000 });
  await expect(page.getByTestId("pubmed-mesh-results")).toContainText("Diabetes Mellitus");

  await page.getByTestId("pubmed-vocabulary-mode-database").click();
  await runOperation(page, run, '"operation":"resource"');
  await expect(page.getByTestId("pubmed-database-result")).toContainText("PubMed bibliographic record", { timeout: 60_000 });
  await expect(page.getByTestId("pubmed-database-result")).toContainText("All Fields");

  await page.getByTestId("pubmed-tab-plan").click();
  await runOperation(page, run, '"operation":"prompt"');
  await expect(page.getByTestId("pubmed-plan-result")).toContainText("Research Plan: Metformin and healthy aging", { timeout: 30_000 });
  await expect(page.getByTestId("pubmed-plan-result")).toContainText("pubmed_search_articles");

  await page.getByTestId("pubmed-tab-search").click();
  await page.getByTestId("pubmed-search-mode-pubmed").click();
  await page.getByTestId("pubmed-query").fill("10.9999/agent-opt-definitely-missing[doi]");
  await runTool(page, run, "pubmed_search_articles");
  await expect(page.getByTestId("pubmed-search-results")).toContainText("没有匹配记录", { timeout: 60_000 });

  await page.getByTestId("pubmed-tab-evidence").click();
  await page.getByTestId("pubmed-evidence-mode-article").click();
  await page.getByTestId("pubmed-pmid").fill("PMID:23193287");
  await runTool(page, run, "pubmed_fetch_articles");
  await expect(page.getByTestId("invoke-error")).toContainText(/PMID|参数|数字/, { timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("pubmed-tab-search")).toBeVisible();
  await expect(page.getByTestId("pubmed-tab-plan")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(consoleErrors.filter((message) => !message.includes("status of 400"))).toEqual([]);
});

async function runTool(page: Page, run: Locator, tool: string) {
  return runOperation(page, run, `\"tool\":\"${tool}\"`);
}

async function runOperation(page: Page, run: Locator, marker: string) {
  const response = page.waitForResponse((candidate) => (
    candidate.url().endsWith("/api/plugins/pubmed-evidence-lab/invoke")
    && candidate.request().method() === "POST"
    && candidate.request().postData()?.includes(marker) === true
  ));
  await run.click();
  return response;
}

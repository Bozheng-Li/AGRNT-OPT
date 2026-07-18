import { expect, test } from "@playwright/test";

test("@web-e2e [crossref-scholarly-metadata-lab] Crossref Web runs seven tools, pagination, errors, and responsive layout", async ({ page }) => {
  test.setTimeout(360_000);
  await page.goto("/plugins/crossref-scholarly-metadata-lab");
  await expect(page.getByRole("heading", { name: "Crossref 学术元数据台" })).toBeVisible();
  const run = page.getByTestId("crossref-run");

  await run.click();
  await expect(page.getByTestId("crossref-works")).toContainText("10.1038/s41586-020-2649-2", { timeout: 90_000 });
  await page.getByTestId("crossref-next").click();
  await expect(page.getByTestId("crossref-works")).toContainText("偏移 5", { timeout: 90_000 });

  await page.getByTestId("crossref-tab-detail").click();
  await run.click();
  await expect(page.getByTestId("crossref-work")).toContainText("10.1038/nature12373", { timeout: 90_000 });
  await page.getByTestId("crossref-detail-references").click();
  await run.click();
  await expect(page.getByTestId("crossref-references")).toContainText("出站参考文献", { timeout: 90_000 });

  await page.getByTestId("crossref-tab-journals").click();
  await run.click();
  await expect(page.getByTestId("crossref-journals")).toContainText(/Nature/i, { timeout: 90_000 });

  await page.getByTestId("crossref-tab-funders").click();
  await run.click();
  await expect(page.getByTestId("crossref-funders")).toContainText(/National Science Foundation/i, { timeout: 90_000 });

  await page.getByTestId("crossref-tab-publishers").click();
  await run.click();
  await expect(page.getByTestId("crossref-prefix")).toContainText("10.1038", { timeout: 90_000 });
  await page.getByTestId("crossref-load-member").click();
  await expect(page.getByTestId("crossref-member")).toContainText(/Springer|Nature/i, { timeout: 90_000 });
  await expect(page.getByTestId("crossref-member")).toContainText("元数据覆盖率");

  await page.getByTestId("crossref-tab-detail").click();
  await page.getByTestId("crossref-doi").fill("not-a-doi");
  await run.click();
  await expect(page.getByTestId("invoke-error")).toContainText(/DOI|格式|必须|invalid/i, { timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("crossref-tab-search")).toBeVisible();
  await expect(page.getByTestId("crossref-tab-publishers")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

import { expect, test } from "@playwright/test";

test("@web-e2e [osv-advisory-studio] OSV Web exercises all four tools, errors, and responsive layout", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/plugins/osv-advisory-studio");
  await expect(page.getByRole("heading", { name: "OSV 漏洞公告研判台" })).toBeVisible();

  await page.getByTestId("osv-run").click();
  await expect(page.getByTestId("osv-query-result")).toContainText("lodash@4.17.20", { timeout: 45_000 });
  await expect(page.getByTestId("osv-finding-list")).toContainText("GHSA-29mw-wpgm-hmr9");

  await page.getByTestId("osv-example-clean").click();
  await page.getByTestId("osv-run").click();
  await expect(page.getByTestId("osv-query-result")).toContainText("当前没有已知匹配公告", { timeout: 45_000 });

  await page.getByTestId("osv-tab-batch").click();
  await page.getByTestId("osv-run").click();
  await expect(page.getByTestId("osv-batch-result")).toContainText(/命中包|确认未命中/, { timeout: 60_000 });
  await expect(page.getByTestId("osv-batch-result")).toContainText("lodash@4.17.20");

  await page.getByTestId("osv-tab-advisory").click();
  await page.getByTestId("osv-run").click();
  await expect(page.getByTestId("osv-advisory-result")).toContainText("GHSA-29mw-wpgm-hmr9", { timeout: 45_000 });
  await expect(page.getByTestId("osv-advisory-result")).toContainText("CVE-2020-28500");

  await page.getByTestId("osv-tab-ecosystems").click();
  await page.getByTestId("osv-run").click();
  await expect(page.getByTestId("osv-ecosystem-result")).toContainText("50 个大小写精确标识", { timeout: 30_000 });
  await expect(page.getByTestId("osv-ecosystem-result")).toContainText("PyPI");

  await page.getByTestId("osv-tab-package").click();
  await page.getByTestId("osv-name").fill("https://example.com/pkg");
  await page.getByTestId("osv-run").click();
  await expect(page.getByTestId("invoke-error")).toContainText(/URL|字符|不安全/, { timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("osv-tab-package")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

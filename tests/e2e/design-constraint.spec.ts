import { expect, test } from "@playwright/test";

test("@web-e2e [design-constraint-studio] Design Constraint Web exercises all six tools and failures", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/plugins/design-constraint-studio");
  await expect(page.getByRole("heading", { name: "设计约束验证台" })).toBeVisible();

  await page.getByTestId("dcv-run").click();
  await expect(page.getByTestId("dcv-insight")).toContainText(/false|违规/, { timeout: 30_000 });
  await expect(page.getByTestId("result-output")).toContainText(/wcag|contrast/i);

  await page.getByTestId("dcv-tab-why").click();
  await page.getByTestId("dcv-run").click();
  await expect(page.getByTestId("result-output")).toContainText("color.text", { timeout: 30_000 });

  await page.getByTestId("dcv-tab-graph").click();
  await page.getByTestId("dcv-run").click();
  await expect(page.getByTestId("dcv-graph")).toContainText(/节点|边/, { timeout: 30_000 });
  await expect(page.getByTestId("result-output")).toContainText("color.action");

  await page.getByTestId("dcv-tab-list-constraints").click();
  await page.getByTestId("dcv-run").click();
  await expect(page.getByTestId("dcv-constraint-list")).toContainText(/wcag|threshold/i, { timeout: 30_000 });

  await page.getByTestId("dcv-tab-explain").click();
  await page.getByTestId("dcv-run").click();
  await expect(page.getByTestId("result-output")).toContainText(/contrast|foreground|background/i, { timeout: 30_000 });

  await page.getByTestId("dcv-tab-suggest-fix").click();
  await page.getByTestId("dcv-run").click();
  await expect(page.getByTestId("result-output")).toContainText(/candidate|value|verified|foreground/i, { timeout: 30_000 });

  await page.getByTestId("dcv-tab-graph").click();
  await page.getByTestId("dcv-tokens").fill("{ invalid json");
  await page.getByTestId("dcv-run").click();
  await expect(page.getByTestId("invoke-error")).toContainText("不是有效 JSON");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("dcv-tab-validate")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

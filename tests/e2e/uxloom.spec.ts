import { expect, test } from "@playwright/test";

test("@web-e2e [uxloom-journey-studio] UXLoom runs all eight tools, reset error, and responsive workflow", async ({ page }) => {
  await page.goto("/plugins/uxloom-journey-studio");
  await expect(page.getByRole("heading", { name: /UXLoom 旅程与状态设计台/i }).first()).toBeVisible();
  await expect(page.getByText("每个 UUID 只对应一个项目文件", { exact: false })).toBeVisible();
  const run = page.getByTestId("uxloom-run");
  await expect(run).toBeEnabled();

  await run.click();
  await expect(page.getByTestId("uxloom-project-summary")).toContainText("Checkout Studio", { timeout: 30_000 });
  await expect(page.getByTestId("uxloom-project-summary")).toContainText("session://project");

  await page.getByTestId("uxloom-tab-brief").click();
  await run.click();
  await expect(page.getByTestId("uxloom-questions")).toContainText("brand", { timeout: 30_000 });
  await expect(page.getByTestId("uxloom-questions")).toContainText("需用户判断");
  await page.getByTestId("uxloom-submit-brief").click();
  await expect(page.getByTestId("uxloom-brief-result")).toContainText("简报已编译", { timeout: 30_000 });

  await page.getByTestId("uxloom-tab-journey").click();
  await run.click();
  await expect(page.getByTestId("uxloom-journeys")).toContainText("checkout", { timeout: 30_000 });

  await page.getByTestId("uxloom-tab-screen").click();
  await page.getByTestId("uxloom-example-incomplete").click();
  await run.click();
  await expect(page.getByTestId("uxloom-screens")).toContainText("payment", { timeout: 30_000 });

  await page.getByTestId("uxloom-tab-validate").click();
  await run.click();
  await expect(page.getByTestId("uxloom-metrics")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("uxloom-findings")).toContainText("state-undesigned");
  await expect(page.getByTestId("uxloom-findings")).toContainText("contrast-below-aa");
  await expect(page.getByTestId("uxloom-findings")).toContainText("target-too-small");
  await expect(page.getByTestId("uxloom-findings")).toContainText("4.48:1");
  await expect(page.getByTestId("uxloom-findings")).toContainText("32px");

  await page.getByTestId("uxloom-tab-critique").click();
  await run.click();
  await expect(page.getByTestId("uxloom-findings")).toContainText("payment", { timeout: 30_000 });
  await expect(page.getByTestId("uxloom-findings")).toContainText("state-undesigned");

  await page.getByTestId("uxloom-tab-coverage").click();
  await run.click();
  await expect(page.getByTestId("uxloom-coverage")).toContainText("3 required states not yet designed", { timeout: 30_000 });
  await expect(page.getByTestId("uxloom-coverage")).toContainText("loading, error, success");

  await page.getByTestId("uxloom-reset").click();
  await page.getByTestId("uxloom-tab-validate").click();
  await run.click();
  await expect(page.getByTestId("result-output")).toContainText("project_init", { timeout: 30_000 });
  await expect(page.getByTestId("result-output")).not.toContainText(/var\\runtime|[A-Za-z]:\\/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("uxloom-tab-project")).toBeVisible();
  await expect(page.getByTestId("uxloom-tab-coverage")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

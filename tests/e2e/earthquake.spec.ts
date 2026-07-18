import { expect, test } from "@playwright/test";

test("@web-e2e [earthquake-situation-lab] Earthquake Web runs four tools, two resources, both sources, errors, and responsive layout", async ({ page }) => {
  test.setTimeout(360_000);
  await page.goto("/plugins/earthquake-situation-lab");
  await expect(page.getByRole("heading", { name: "全球地震态势实验室" })).toBeVisible();
  const run = page.getByTestId("earthquake-run");

  await run.click();
  await expect(page.getByTestId("earthquake-feed")).toContainText(/M\d/, { timeout: 90_000 });
  await expect(page.getByTestId("earthquake-map")).toBeVisible();

  await page.getByTestId("earthquake-tab-search").click();
  await run.click();
  await expect(page.getByTestId("earthquake-search")).toContainText("us6000m0xl", { timeout: 90_000 });
  await page.getByTestId("earthquake-source-emsc").click();
  await run.click();
  await expect(page.getByTestId("earthquake-search")).toContainText("20240101_0000088", { timeout: 90_000 });

  await page.getByTestId("earthquake-tab-detail").click();
  await run.click();
  await expect(page.getByTestId("earthquake-detail")).toContainText("us6000m0xl", { timeout: 90_000 });
  await expect(page.getByTestId("earthquake-detail")).toContainText(/red/i);

  await page.getByTestId("earthquake-tab-compare").click();
  await run.click();
  await expect(page.getByTestId("earthquake-compare")).toContainText("USGS", { timeout: 90_000 });
  await expect(page.getByTestId("earthquake-compare")).toContainText("EMSC");
  await expect(page.getByTestId("earthquake-compare")).toContainText("2");
  await expect(page.getByTestId("earthquake-compare")).toContainText("3");

  await page.getByTestId("earthquake-tab-resources").click();
  await run.click();
  await expect(page.getByTestId("earthquake-resource-result")).toContainText("earthquake://feed/4.5/week", { timeout: 90_000 });
  await page.getByTestId("earthquake-resource-event").click();
  await run.click();
  await expect(page.getByTestId("earthquake-resource-result")).toContainText("us6000m0xl", { timeout: 90_000 });

  await page.getByTestId("earthquake-tab-detail").click();
  await page.getByTestId("earthquake-event-id").fill("../../etc/passwd");
  await run.click();
  await expect(page.getByTestId("invoke-error")).toContainText(/Event ID|event_id|格式|只允许/i, { timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("earthquake-tab-feed")).toBeVisible();
  await expect(page.getByTestId("earthquake-tab-resources")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

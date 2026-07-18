import { expect, test, type Locator, type Page } from "@playwright/test";

const slug = "nhtsa-vehicle-safety-lab";

test("@web-e2e [nhtsa-vehicle-safety-lab] NHTSA Web runs six guarded vehicle-safety workflows and mobile layout", async ({ page }) => {
  test.setTimeout(480_000);
  await page.goto(`/plugins/${slug}`);
  await expect(page.getByText("NHTSA 车辆安全实验室", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("调查 ZIP 已禁用", { exact: true })).toBeVisible();
  const run = page.getByTestId("nhtsa-run");

  await runOperation(page, run, '"tool":"nhtsa_get_vehicle_safety"');
  await expect(page.getByTestId("nhtsa-overview-result")).toContainText("Vehicle 14819", { timeout: 90_000 });
  await expect(page.getByTestId("nhtsa-overview-result")).toContainText("24V064000");
  await expect(page.getByTestId("nhtsa-complaint-summary")).toContainText("投诉概览");

  await page.getByTestId("nhtsa-tab-recalls").click();
  await page.getByTestId("nhtsa-recall-campaign").click();
  await runOperation(page, run, '"tool":"nhtsa_search_recalls"');
  await expect(page.getByTestId("nhtsa-recalls-result")).toContainText("24V064000", { timeout: 90_000 });
  await expect(page.getByTestId("nhtsa-recalls-result")).toContainText("750,114");

  await page.getByTestId("nhtsa-tab-complaints").click();
  await expect(page.getByText(/不开放组件过滤或组件 breakdown/)).toBeVisible();
  await runOperation(page, run, '"tool":"nhtsa_search_complaints"');
  await expect(page.getByTestId("nhtsa-complaints-result")).toContainText("消费者投诉", { timeout: 90_000 });
  await expect(page.getByTestId("nhtsa-complaints-result")).toContainText("offset 0");
  await expect(page.getByTestId("nhtsa-complaints-result").locator("article").first()).toBeVisible();
  await page.getByTestId("nhtsa-complaints-next").click();
  await expect(page.getByTestId("nhtsa-complaints-result")).toContainText("offset 10", { timeout: 90_000 });

  await page.getByTestId("nhtsa-tab-ratings").click();
  await runOperation(page, run, '"tool":"nhtsa_get_safety_ratings"');
  await expect(page.getByTestId("nhtsa-ratings-result")).toContainText("Vehicle 14819", { timeout: 90_000 });
  await expect(page.getByTestId("nhtsa-ratings-result")).toContainText("★★★★★");

  await page.getByTestId("nhtsa-tab-vin").click();
  await runOperation(page, run, '"tool":"nhtsa_decode_vin"');
  await expect(page.getByTestId("nhtsa-vin-result")).toContainText("2003 HONDA Accord", { timeout: 90_000 });
  await page.getByTestId("nhtsa-vin-input").fill("AAAAAAAAAAAAAAAAA");
  await runOperation(page, run, '"tool":"nhtsa_decode_vin"');
  await expect(page.getByTestId("nhtsa-vin-result")).toContainText(/warning|Warning|警告/, { timeout: 90_000 });

  await page.getByTestId("nhtsa-tab-lookup").click();
  await expect(page.getByText(/vehicle_types 查询会丢失品牌关联，已关闭/)).toBeVisible();
  await runOperation(page, run, '"tool":"nhtsa_lookup_vehicles"');
  await expect(page.getByTestId("nhtsa-lookup-result")).toContainText("models 目录", { timeout: 120_000 });
  await expect(page.getByTestId("nhtsa-lookup-result")).toContainText("HONDA");
  await page.getByTestId("nhtsa-lookup-manufacturer").click();
  await runOperation(page, run, '"tool":"nhtsa_lookup_vehicles"');
  await expect(page.getByTestId("nhtsa-lookup-result")).toContainText(/Honda|HONDA/i, { timeout: 120_000 });

  await page.getByTestId("nhtsa-tab-overview").click();
  await page.getByTestId("nhtsa-year").fill("1980");
  await runOperation(page, run, '"tool":"nhtsa_get_vehicle_safety"');
  await expect(page.getByTestId("invoke-error")).toContainText(/year|年份|1990|输入/, { timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("nhtsa-tab-overview")).toBeVisible();
  await expect(page.getByTestId("nhtsa-tab-lookup")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

async function runOperation(page: Page, run: Locator, marker: string) {
  const response = page.waitForResponse((candidate) =>
    candidate.url().endsWith(`/api/plugins/${slug}/invoke`)
      && candidate.request().method() === "POST"
      && candidate.request().postData()?.includes(marker) === true,
  );
  await run.click();
  return response;
}

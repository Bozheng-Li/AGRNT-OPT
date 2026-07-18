import { expect, test, type Locator, type Page } from "@playwright/test";

const slug = "worldbank-development-data-lab";

test("@web-e2e [worldbank-development-data-lab] World Bank Web runs seven tools, two resources, guarded errors, and mobile layout", async ({ page }) => {
  test.setTimeout(480_000);
  await page.goto(`/plugins/${slug}`);
  await expect(page.getByText("World Bank 发展数据实验室", { exact: false }).first()).toBeVisible();
  const run = page.getByTestId("worldbank-run");

  await runOperation(page, run, '"tool":"worldbank_search_indicators"');
  await expect(page.getByTestId("worldbank-indicators")).toContainText("NY.GDP.PCAP.CD", { timeout: 90_000 });
  await expect(page.getByTestId("worldbank-indicators")).toContainText("topic_id=3");

  await page.getByTestId("worldbank-scope-source").click();
  await runOperation(page, run, '"tool":"worldbank_search_indicators"');
  await expect(page.getByTestId("worldbank-indicators")).toContainText("NY.GDP.PCAP.CD", { timeout: 90_000 });
  await expect(page.getByTestId("worldbank-indicators")).toContainText("source_id=2");

  await page.getByTestId("worldbank-tab-data").click();
  await runOperation(page, run, '"tool":"worldbank_get_data"');
  await expect(page.getByTestId("worldbank-data-result")).toContainText("8 个观测", { timeout: 90_000 });
  await expect(page.getByTestId("worldbank-data-result")).toContainText("USA");
  await expect(page.getByTestId("worldbank-data-result")).toContainText("CHN");
  await expect(page.getByTestId("worldbank-data-result")).toContainText("2020");
  await expect(page.getByTestId("worldbank-data-result")).toContainText("2023");
  await expect(page.getByRole("img", { name: "World Bank 时间序列折线图" })).toBeVisible();

  await page.getByTestId("worldbank-data-metadata").click();
  await runOperation(page, run, '"tool":"worldbank_get_indicator"');
  await expect(page.getByTestId("worldbank-indicator-detail")).toContainText("NY.GDP.PCAP.CD", { timeout: 90_000 });
  await expect(page.getByTestId("worldbank-indicator-detail")).toContainText("World Development Indicators");
  await expect(page.getByTestId("worldbank-indicator-detail")).toContainText("定义与口径");

  await page.getByTestId("worldbank-tab-countries").click();
  await runOperation(page, run, '"tool":"worldbank_list_countries"');
  await expect(page.getByTestId("worldbank-countries-result")).toContainText("China", { timeout: 90_000 });
  await page.getByTestId("worldbank-country-detail").click();
  await runOperation(page, run, '"tool":"worldbank_get_country"');
  const countryDetail = page.locator('div[data-testid="worldbank-country-detail"]');
  await expect(countryDetail).toContainText("China", { timeout: 90_000 });
  await expect(countryDetail).toContainText("Beijing");
  await expect(countryDetail).toContainText("East Asia & Pacific");

  await page.getByTestId("worldbank-tab-catalog").click();
  await runOperation(page, run, '"tool":"worldbank_list_topics"');
  await expect(page.getByTestId("worldbank-topics")).toContainText("Economy & Growth", { timeout: 90_000 });
  await expect(page.getByTestId("worldbank-topics").locator("article")).toHaveCount(21);
  await page.getByTestId("worldbank-catalog-sources").click();
  await runOperation(page, run, '"tool":"worldbank_list_sources"');
  await expect(page.getByTestId("worldbank-sources")).toContainText("Doing Business", { timeout: 90_000 });

  await page.getByTestId("worldbank-tab-resources").click();
  await runOperation(page, run, '"operation":"resource"');
  await expect(page.getByTestId("worldbank-resource-result")).toContainText("worldbank://indicator/NY.GDP.PCAP.CD", { timeout: 90_000 });
  await expect(page.getByTestId("worldbank-resource-result")).toContainText("GDP per capita");
  await page.getByTestId("worldbank-resource-country").click();
  await runOperation(page, run, '"operation":"resource"');
  await expect(page.getByTestId("worldbank-resource-result")).toContainText("worldbank://country/CHN", { timeout: 90_000 });
  await expect(page.getByTestId("worldbank-resource-result")).toContainText("China");

  await page.getByTestId("worldbank-tab-discover").click();
  await expect(page.getByText(/keyword-only.*强制绑定 Topic 或 Source/)).toBeVisible();
  await page.getByTestId("worldbank-scope-id").fill("");
  await runOperation(page, run, '"tool":"worldbank_search_indicators"');
  await expect(page.getByTestId("invoke-error")).toContainText(/topic_id|Topic ID|参数|输入/, { timeout: 15_000 });

  await page.getByTestId("worldbank-tab-data").click();
  await page.getByTestId("worldbank-data-series").click();
  await page.getByTestId("worldbank-countries").fill("all");
  await runOperation(page, run, '"tool":"worldbank_get_data"');
  await expect(page.getByTestId("invoke-error")).toContainText(/all|全库|国家/, { timeout: 15_000 });

  await page.getByTestId("worldbank-data-metadata").click();
  await page.getByTestId("worldbank-indicator").fill("https://example.com/x");
  await runOperation(page, run, '"tool":"worldbank_get_indicator"');
  await expect(page.getByTestId("invoke-error")).toContainText(/Indicator ID|indicator_id|只允许|格式/, { timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("worldbank-tab-discover")).toBeVisible();
  await expect(page.getByTestId("worldbank-tab-resources")).toBeVisible();
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

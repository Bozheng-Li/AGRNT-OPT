import { expect, test, type Locator, type Page } from "@playwright/test";

test("@web-e2e [astronomy-observation-console] Astronomy Web runs offline tools, all resources, prompt, errors, and mobile layout", async ({ page }) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/plugins/astronomy-observation-console");
  await expect(page.getByText("离线天文观测台", { exact: false }).first()).toBeVisible();
  const run = page.getByTestId("astronomy-run");

  await runTool(page, run, "astronomy_get_sky_position");
  await expect(page.getByTestId("astronomy-position-result")).toContainText("Pisces", { timeout: 30_000 });
  await expect(page.getByTestId("astronomy-position-result")).toContainText("40.88°");

  await page.getByTestId("astronomy-tab-rise").click();
  await runTool(page, run, "astronomy_get_rise_set");
  await expect(page.getByTestId("astronomy-rise-result")).toContainText("astronomical", { timeout: 30_000 });
  await expect(page.getByTestId("astronomy-rise-result")).toContainText("日出");

  await page.getByTestId("astronomy-tab-moon").click();
  await runTool(page, run, "astronomy_get_moon_phase");
  await expect(page.getByTestId("astronomy-moon-result")).toContainText("New Moon", { timeout: 30_000 });
  await expect(page.getByTestId("astronomy-moon-result")).toContainText("full");

  await page.getByTestId("astronomy-tab-events").click();
  await runTool(page, run, "astronomy_find_events");
  await expect(page.getByTestId("astronomy-events-result")).toContainText("solar_eclipse", { timeout: 30_000 });
  await expect(page.getByTestId("astronomy-events-result")).toContainText("100.0%");

  await page.getByTestId("astronomy-tab-visible").click();
  await runTool(page, run, "astronomy_list_visible");
  await expect(page.getByTestId("astronomy-visible-result")).toContainText("astronomical_twilight", { timeout: 30_000 });
  await expect(page.getByTestId("astronomy-visible-result")).toContainText("Polaris");

  await page.getByTestId("astronomy-tab-guide").click();
  for (const body of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]) {
    await page.getByTestId("astronomy-body").selectOption(body);
    await runOperation(page, run, '"operation":"resource"');
    await expect(page.getByTestId("astronomy-resource-result")).toContainText(body, { timeout: 15_000 });
  }

  await page.getByTestId("astronomy-guide-prompt").click();
  await runOperation(page, run, '"operation":"prompt"');
  await expect(page.getByTestId("astronomy-prompt-result")).toContainText("astronomy_get_rise_set", { timeout: 15_000 });
  await expect(page.getByTestId("astronomy-prompt-result")).toContainText("cloud cover");

  await page.getByTestId("astronomy-tab-position").click();
  await page.getByTestId("astronomy-latitude").fill("91");
  await runTool(page, run, "astronomy_get_sky_position");
  await expect(page.getByTestId("invoke-error")).toContainText(/latitude|纬度|90/, { timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("astronomy-tab-position")).toBeVisible();
  await expect(page.getByTestId("astronomy-tab-guide")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(consoleErrors.filter((message) => !message.includes("status of 400"))).toEqual([]);
});

async function runTool(page: Page, run: Locator, tool: string) { return runOperation(page, run, `\"tool\":\"${tool}\"`); }
async function runOperation(page: Page, run: Locator, marker: string) {
  const response = page.waitForResponse((candidate) => candidate.url().endsWith("/api/plugins/astronomy-observation-console/invoke") && candidate.request().method() === "POST" && candidate.request().postData()?.includes(marker) === true);
  await run.click();
  return response;
}

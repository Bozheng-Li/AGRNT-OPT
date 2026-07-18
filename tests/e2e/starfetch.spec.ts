import { expect, test, type Locator, type Page } from "@playwright/test";

let jobIdToClean = "";

test.afterEach(async ({ request }) => {
  if (!jobIdToClean) return;
  await request.post("/api/plugins/starfetch-astronomy-lab/invoke", {
    data: {
      operation: "tool",
      tool: "starfetch_tap_job_delete",
      arguments: { service: "gaia", jobIdOrUrl: jobIdToClean },
    },
    timeout: 90_000,
  }).catch(() => undefined);
  jobIdToClean = "";
});

test("@web-e2e [starfetch-astronomy-lab] Starfetch completes discovery, TAP query, job, asset, error, and responsive workflows", async ({ page }) => {
  test.setTimeout(420_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/plugins/starfetch-astronomy-lab");
  await expect(page.getByText("Starfetch 天文目录实验室", { exact: false }).first()).toBeVisible();
  const run = page.getByTestId("starfetch-run");

  await run.click();
  await expect(page.getByTestId("starfetch-services-result")).toContainText("NASA Exoplanet Archive", { timeout: 60_000 });
  await expect(page.getByTestId("starfetch-services-result")).toContainText("ESA Gaia Archive");

  await page.getByTestId("starfetch-mode-registry").click();
  await page.getByTestId("starfetch-registry-query").fill("Gaia");
  await run.click();
  await expect(page.getByTestId("starfetch-services-result")).toContainText(/Gaia/i, { timeout: 60_000 });

  await page.getByTestId("starfetch-tab-metadata").click();
  await run.click();
  await expect(page.getByTestId("starfetch-metadata-result")).toContainText("AVAILABLE", { timeout: 60_000 });

  await page.getByTestId("starfetch-meta-capabilities").click();
  await run.click();
  await expect(page.getByTestId("starfetch-metadata-result")).toContainText("anonymous", { timeout: 60_000 });
  await expect(page.getByTestId("starfetch-metadata-result")).toContainText("ADQL");

  await page.getByTestId("starfetch-meta-tables").click();
  await run.click();
  await expect(page.getByTestId("starfetch-metadata-result")).toContainText("ps", { timeout: 90_000 });

  await page.getByTestId("starfetch-meta-columns").click();
  await page.getByTestId("starfetch-table").fill("ps");
  await run.click();
  await expect(page.getByTestId("starfetch-columns")).toContainText("pl_name", { timeout: 90_000 });
  await expect(page.getByTestId("starfetch-columns")).toContainText("datatype");

  await page.getByTestId("starfetch-tab-query").click();
  await page.getByTestId("starfetch-query").fill("SELECT TOP 3 pl_name, hostname, disc_year FROM ps ORDER BY disc_year DESC");
  await run.click();
  await expect(page.getByTestId("starfetch-query-result")).toContainText("3 rows", { timeout: 90_000 });
  await expect(page.getByTestId("starfetch-data-table")).toContainText("pl_name");

  await page.getByTestId("starfetch-tab-jobs").click();
  await page.getByTestId("starfetch-job-query").fill("SELECT TOP 1 source_id, ra, dec FROM gaiadr3.gaia_source");
  await runJobTool(page, run, "starfetch_tap_submit_job");
  const jobResult = page.getByTestId("starfetch-job-result");
  await expect(jobResult).toContainText(/SUBMITTED|PENDING|QUEUED|EXECUTING|COMPLETED/, { timeout: 90_000 });

  await page.getByTestId("starfetch-job-status").click();
  jobIdToClean = await page.getByTestId("starfetch-job-id").inputValue();
  expect(jobIdToClean).toMatch(/^[A-Za-z0-9._~-]+$/);
  await page.waitForTimeout(1_500);
  let statusResponse = await runJobTool(page, run, "starfetch_tap_job_status");
  if ((await statusResponse.json()).result?.isError === true) {
    await page.waitForTimeout(2_000);
    statusResponse = await runJobTool(page, run, "starfetch_tap_job_status");
    expect((await statusResponse.json()).result?.isError).toBe(false);
  }
  await expect(jobResult).toContainText(/PENDING|QUEUED|EXECUTING|COMPLETED/, { timeout: 60_000 });

  await page.getByTestId("starfetch-job-wait").click();
  await runJobTool(page, run, "starfetch_tap_job_wait");
  await expect(jobResult).toContainText("COMPLETED", { timeout: 90_000 });

  await page.getByTestId("starfetch-job-fetch").click();
  await runJobTool(page, run, "starfetch_tap_job_fetch");
  await expect(jobResult).toContainText("source_id", { timeout: 60_000 });
  await expect(page.getByTestId("starfetch-data-table")).toBeVisible();

  await page.getByTestId("starfetch-job-delete").click();
  await runJobTool(page, run, "starfetch_tap_job_delete");
  await expect(jobResult).toContainText("DELETED", { timeout: 60_000 });
  jobIdToClean = "";

  await page.getByTestId("starfetch-tab-guides").click();
  const resourceUris = [
    "starfetch://guides/adql",
    "starfetch://guides/tap-metadata",
    "starfetch://services/gaia",
    "starfetch://services/simbad",
    "starfetch://examples/proper-motion",
  ];
  for (const uri of resourceUris) {
    await page.getByTestId("starfetch-resource").selectOption(uri);
    await run.click();
    await expect(page.getByTestId("starfetch-asset-result")).toContainText(uri, { timeout: 30_000 });
  }

  await page.getByTestId("starfetch-asset-prompt").click();
  for (const prompt of ["query_astronomy_catalog", "explore_service", "run_cone_search", "troubleshoot_adql"]) {
    await page.getByTestId("starfetch-prompt").selectOption(prompt);
    await run.click();
    await expect(page.getByTestId("starfetch-asset-result")).toContainText(prompt, { timeout: 30_000 });
    await expect(page.getByTestId("starfetch-asset-result")).toContainText(/Starfetch|ADQL|Gaia/i);
  }

  await page.getByTestId("starfetch-tab-query").click();
  await page.getByTestId("starfetch-query").fill("SELECT source_id FROM gaiadr3.gaia_source");
  await run.click();
  await expect(page.getByTestId("invoke-error")).toContainText(/SELECT TOP|ADQL|参数/, { timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("starfetch-tab-services")).toBeVisible();
  await expect(page.getByTestId("starfetch-tab-guides")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(consoleErrors.filter((message) => !message.includes("status of 400"))).toEqual([]);
});

async function runJobTool(page: Page, run: Locator, tool: string) {
  const response = page.waitForResponse((candidate) => (
    candidate.url().endsWith("/api/plugins/starfetch-astronomy-lab/invoke")
    && candidate.request().method() === "POST"
    && candidate.request().postData()?.includes(`\"tool\":\"${tool}\"`) === true
  ));
  await run.click();
  return response;
}

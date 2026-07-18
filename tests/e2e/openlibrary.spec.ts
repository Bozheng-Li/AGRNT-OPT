import { expect, test } from "@playwright/test";

test("@web-e2e [openlibrary-research-desk] OpenLibrary Web runs nine tools, two resources, errors, and responsive layout", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/plugins/openlibrary-research-desk");
  await expect(page.getByText("OpenLibrary 图书研究台", { exact: false })).toBeVisible();
  const run = page.getByTestId("openlibrary-run");

  await run.click();
  await expect(page.getByTestId("openlibrary-books")).toContainText("OL27482W", { timeout: 90_000 });
  await expect(page.getByTestId("openlibrary-books")).toContainText(/Hobbit/i);

  await page.getByTestId("openlibrary-tab-work").click();
  await run.click();
  await expect(page.getByTestId("openlibrary-work-result")).toContainText("OL27482W", { timeout: 60_000 });
  await page.getByTestId("openlibrary-work-resource").click();
  await expect(page.getByTestId("openlibrary-resource")).toContainText(/Hobbit|OL27482W/i, { timeout: 60_000 });
  await page.getByTestId("openlibrary-work-editions").click();
  await run.click();
  await expect(page.getByTestId("openlibrary-editions")).toContainText(/OL\d+M/, { timeout: 60_000 });

  await page.getByTestId("openlibrary-tab-edition").click();
  await run.click();
  await expect(page.getByTestId("openlibrary-edition-result")).toContainText(/OL7353617M|Hobbit/i, { timeout: 60_000 });

  await page.getByTestId("openlibrary-tab-authors").click();
  await run.click();
  await expect(page.getByTestId("openlibrary-authors")).toContainText("OL26320A", { timeout: 60_000 });
  await page.getByTestId("openlibrary-author-detail-mode").click();
  await run.click();
  await expect(page.getByTestId("openlibrary-author-result")).toContainText(/Tolkien/i, { timeout: 60_000 });
  await page.getByTestId("openlibrary-author-resource").click();
  await expect(page.getByTestId("openlibrary-resource")).toContainText(/Tolkien|OL26320A/i, { timeout: 60_000 });
  await page.getByTestId("openlibrary-author-works-mode").click();
  await run.click();
  await expect(page.getByTestId("openlibrary-books")).toContainText(/OL\d+W/, { timeout: 60_000 });

  await page.getByTestId("openlibrary-tab-subject").click();
  await run.click();
  await expect(page.getByTestId("openlibrary-books")).toContainText(/OL\d+W/, { timeout: 60_000 });

  await page.getByTestId("openlibrary-tab-cover").click();
  await run.click();
  await expect(page.getByTestId("openlibrary-cover-result")).toContainText("covers.openlibrary.org", { timeout: 45_000 });

  await page.getByTestId("openlibrary-tab-work").click();
  await page.getByTestId("openlibrary-work-id").fill("not-a-work");
  await run.click();
  await expect(page.getByTestId("invoke-error")).toContainText(/Work ID|无效|必须/, { timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("openlibrary-tab-search")).toBeVisible();
  await expect(page.getByTestId("openlibrary-tab-cover")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

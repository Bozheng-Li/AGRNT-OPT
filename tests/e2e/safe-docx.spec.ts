import { expect, test } from "@playwright/test";

test("@web-e2e [safe-docx-studio] Safe DOCX Web uploads example, reads, greps, and fails safely", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/plugins/safe-docx-studio");
  await expect(page.getByRole("heading", { name: "Safe DOCX 编辑台" })).toBeVisible();

  await page.getByTestId("safe-docx-example").click();
  await expect(page.getByTestId("safe-docx-dropzone")).toContainText("service-agreement.docx");

  await page.getByTestId("safe-docx-run").click();
  await expect(page.getByTestId("safe-docx-read-result")).toContainText(/Service Agreement|Payment/i, {
    timeout: 90_000,
  });
  await expect(page.getByTestId("safe-docx-file-facts")).toContainText("DOCX");

  await page.getByTestId("safe-docx-tab-grep").click();
  await page.getByTestId("safe-docx-pattern").fill("Payment");
  await page.getByTestId("safe-docx-run").click();
  await expect(page.getByTestId("safe-docx-grep-result")).toContainText(/Payment/i, { timeout: 60_000 });

  await page.getByTestId("safe-docx-tab-replace").click();
  await page.getByTestId("safe-docx-paragraph-id").fill("not-a-real-paragraph");
  await page.getByTestId("safe-docx-run").click();
  await expect(page.getByTestId("invoke-error")).toBeVisible({ timeout: 30_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("safe-docx-tab-read")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);
});

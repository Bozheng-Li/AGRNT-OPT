import { expect, test } from "@playwright/test";

test("@web-e2e [bouncer-compliance-studio] Bouncer runs control, rule, explanation, pack, error, and responsive workflows", async ({ page }) => {
  await page.goto("/plugins/bouncer-compliance-studio");
  await expect(page.getByRole("heading", { name: /Bouncer 合规控制体检台/i }).first()).toBeVisible();
  await expect(page.getByText("不是法律意见", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("不接受宿主路径", { exact: false })).toBeVisible();

  await page.getByTestId("bouncer-example-fail").click();
  await page.getByTestId("bouncer-run").click();
  await expect(page.getByTestId("bouncer-score")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("bouncer-score")).not.toHaveText("100");
  await expect(page.getByTestId("bouncer-findings")).toContainText("缺少控制");
  await expect(page.getByTestId("bouncer-findings")).toContainText("无法判断");
  await expect(page.getByTestId("bouncer-findings")).toContainText("aadc.self-declared-age-insufficient");

  await page.getByTestId("bouncer-example-pass").click();
  await page.getByTestId("bouncer-run").click();
  await expect(page.getByTestId("bouncer-score")).toHaveText("100", { timeout: 30_000 });
  await expect(page.getByTestId("bouncer-findings")).toContainText("已找到控制");
  await expect(page.getByText("inline://project", { exact: false })).toBeVisible();

  await page.getByTestId("bouncer-tab-list_rules").click();
  await page.getByTestId("bouncer-run").click();
  await expect(page.getByTestId("bouncer-rules")).toContainText("14 条固定 UK 规则", { timeout: 30_000 });
  await expect(page.getByTestId("bouncer-rules")).toContainText("osa.age-assurance-highly-effective");

  await page.getByTestId("bouncer-tab-explain_rule").click();
  await page.getByTestId("bouncer-rule-id").fill("aadc.geolocation-default-off");
  await page.getByTestId("bouncer-run").click();
  await expect(page.getByTestId("bouncer-explanation")).toContainText("Standard 10", { timeout: 30_000 });
  await expect(page.getByTestId("bouncer-explanation")).toContainText("locationSharing");

  await page.getByTestId("bouncer-tab-list_packs").click();
  await page.getByTestId("bouncer-run").click();
  await expect(page.getByTestId("bouncer-packs")).toContainText("5 个上游内置包", { timeout: 30_000 });
  await expect(page.getByTestId("bouncer-packs")).toContainText("uk-osa");
  await expect(page.getByTestId("bouncer-packs")).toContainText("ng-ndpc");
  await expect(page.getByTestId("bouncer-packs")).toContainText("仅展示上游目录");

  await page.getByTestId("bouncer-tab-compliance_check").click();
  await page.getByTestId("bouncer-file-path").fill("../host.ts");
  await page.getByTestId("bouncer-run").click();
  await expect(page.getByTestId("invoke-error")).toContainText(/文件名|相对|上级目录/, { timeout: 30_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("bouncer-tab-compliance_check")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

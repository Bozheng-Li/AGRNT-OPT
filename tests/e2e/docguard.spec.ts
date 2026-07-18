import { expect, test } from "@playwright/test";

test("@web-e2e [docguard-drift-lab] DocGuard runs all six tools, editor controls, errors, and responsive workflow", async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/plugins/docguard-drift-lab");
  await expect(page.getByRole("heading", { name: /DocGuard 文档漂移实验室/i }).first()).toBeVisible();
  await expect(page.getByText("只读虚拟项目", { exact: false })).toBeVisible();
  await expect(page.getByTestId("docguard-project-meta")).toContainText("7 个文件");

  await page.getByLabel("新文件相对路径").fill("docs-canonical/SECURITY.md");
  await page.getByRole("button", { name: "添加文件" }).click();
  await expect(page.getByRole("button", { name: /docs-canonical\/SECURITY.md/ })).toBeVisible();
  await page.getByTestId("docguard-editor").fill("# Security\n\n## Threat Model\n\nNo public network surface.\n");
  await page.getByRole("button", { name: "删除当前文件" }).click();
  await expect(page.getByRole("button", { name: /docs-canonical\/SECURITY.md/ })).toHaveCount(0);

  const run = page.getByTestId("docguard-run");
  await run.click();
  const guard = page.getByTestId("docguard-guard-result");
  await expect(guard).toContainText(/WARN|FAIL/, { timeout: 30_000 });
  await expect(guard).toContainText(/STR\d{3}|ENV\d{3}|DCV\d{3}/);
  await expect(guard).toContainText("结构化 findings");

  await page.getByTestId("docguard-tab-score").click();
  await run.click();
  const score = page.getByTestId("docguard-score-result");
  await expect(score).toContainText("级", { timeout: 30_000 });
  await expect(score).toContainText("structure");
  await expect(score).toContainText("docQuality");

  await page.getByTestId("docguard-tab-claims").click();
  await run.click();
  const claims = page.getByTestId("docguard-claims-result");
  await expect(claims).toContainText("verify.semantic.1", { timeout: 30_000 });
  await expect(claims).toContainText("requests/min");
  await expect(claims).toContainText("src/server.js");

  await page.getByTestId("docguard-tab-report").click();
  await run.click();
  const report = page.getByTestId("docguard-report-result");
  await expect(report).toContainText(/sha256:[a-f0-9]{64}/, { timeout: 30_000 });
  await expect(report).toContainText("0.33.1");
  await expect(report).toContainText("ALCOA+");

  await page.getByTestId("docguard-tab-diagnose").click();
  await run.click();
  const diagnose = page.getByTestId("docguard-diagnose-result");
  await expect(diagnose).toContainText("修复队列", { timeout: 30_000 });
  await expect(diagnose).toContainText(/STR\d{3}|ENV\d{3}|DCV\d{3}/);

  await page.getByTestId("docguard-tab-explain").click();
  await page.getByTestId("docguard-code").fill("STR001");
  await run.click();
  const explain = page.getByTestId("docguard-explain-result");
  await expect(explain).toContainText("STR001", { timeout: 30_000 });
  await expect(explain).toContainText("Missing required file");
  await expect(explain).toContainText("structure");

  await page.getByTestId("docguard-code").fill("BAD999");
  await run.click();
  await expect(page.getByTestId("invoke-error")).toBeVisible({ timeout: 30_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("docguard-tab-guard")).toBeVisible();
  await expect(page.getByTestId("docguard-tab-explain")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(consoleErrors).toEqual([]);
});

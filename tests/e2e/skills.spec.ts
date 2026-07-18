import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

type SkillProfile = {
  goalLabel: string;
  contextLabel: string;
  defaultObjective: string;
  preferredMode: "agent-prompt" | "checklist" | "reference-pack";
  artifactLabel: string;
  suggestions: string[];
};

type SkillManifest = {
  slug: string;
  kind: string;
  lifecycle: { status: string };
  name: { zhCN: string };
  web: { route?: string };
};

const workspace = process.cwd();
const curation = JSON.parse(readFileSync(path.join(workspace, "catalog", "curation.json"), "utf8")) as {
  prioritySkillSlugs: string[];
};
const profiles = (JSON.parse(
  readFileSync(path.join(workspace, "catalog", "skill-ui-profiles.json"), "utf8"),
) as { profiles: Record<string, SkillProfile> }).profiles;
const manifests = readdirSync(path.join(workspace, "catalog", "plugins"))
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(path.join(workspace, "catalog", "plugins", file), "utf8")) as SkillManifest);
const manifestBySlug = new Map(manifests.map((manifest) => [manifest.slug, manifest]));

function firstHeading(markdown: string): string {
  const heading = markdown.split(/\r?\n/).find((line) => /^#{1,3}\s+\S/.test(line));
  return heading?.replace(/^#{1,3}\s+/, "").trim() ?? "";
}

function safeTextAsset(slug: string): string {
  const bundle = JSON.parse(
    readFileSync(path.join(workspace, "catalog", "skill-bodies", slug, "BUNDLE.json"), "utf8"),
  ) as { supportingFiles: Array<{ path: string }> };
  const asset = bundle.supportingFiles.find((file) =>
    /\.(?:md|mdx|txt|json|ya?ml|toml|csv|ts|tsx|js|jsx|mjs|cjs|py|sh|ps1|css|html|svg)$/i.test(file.path) ||
    /(^|\/)(?:license|notice|readme)$/i.test(file.path),
  );
  if (!asset) throw new Error(`${slug} has no browser-readable supporting file`);
  return asset.path;
}

const cases = curation.prioritySkillSlugs.map((slug, index) => {
  const manifest = manifestBySlug.get(slug);
  const profile = profiles[slug];
  if (!manifest || !profile) throw new Error(`Missing skill E2E fixture data: ${slug}`);
  const root = path.join(workspace, "catalog", "skill-bodies", slug);
  const originalHeading = firstHeading(readFileSync(path.join(root, "SKILL.md"), "utf8"));
  const translatedHeading = firstHeading(readFileSync(path.join(root, "SKILL.zh-CN.md"), "utf8"));
  if (!originalHeading || !translatedHeading) throw new Error(`${slug} has no bilingual heading fixture`);
  return { slug, index, manifest, profile, originalHeading, translatedHeading, assetPath: safeTextAsset(slug) };
});

test.describe("priority Agent Skill browser workflows", () => {
  test("@web-e2e [skill-registry] public skills exactly match the curated priority tranche", async () => {
    const publicSkills = manifests
      .filter(
        (manifest) =>
          manifest.kind === "agent-skill" && ["web-ready", "verified"].includes(manifest.lifecycle.status),
      )
      .map((manifest) => manifest.slug)
      .sort();
    expect(publicSkills).toEqual([...curation.prioritySkillSlugs].sort());
    expect(Object.keys(profiles).sort()).toEqual([...curation.prioritySkillSlugs].sort());
    expect(cases).toHaveLength(50);
  });

  for (const skillCase of cases) {
    test(`@web-e2e [${skillCase.slug}] runs bilingual task, source, asset, and failure workflows`, async ({ page }) => {
      test.setTimeout(60_000);
      if (skillCase.index % 5 === 0) await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(skillCase.manifest.web.route ?? `/plugins/${skillCase.slug}`);
      await expect(page.getByRole("heading", { name: skillCase.manifest.name.zhCN })).toBeVisible();
      await expect(page.getByText("Skill 工作室")).toBeVisible();

      const chineseLocale = page.getByTestId("skill-locale-zh");
      await expect(chineseLocale).toBeEnabled({ timeout: 15_000 });
      await expect(chineseLocale).toHaveClass(/active/);

      await page.getByRole("button", { name: "全文" }).click();
      await expect(page.getByTestId("result-output")).toContainText(skillCase.translatedHeading, { timeout: 15_000 });

      await page.getByTestId("skill-locale-original").click();
      await expect(page.getByTestId("skill-locale-original")).toHaveClass(/active/);
      await page.getByRole("button", { name: "全文" }).click();
      await expect(page.getByTestId("result-output")).toContainText(skillCase.originalHeading, { timeout: 15_000 });
      await chineseLocale.click();

      await page.getByTestId("skill-task-tab").click();
      await page.getByTestId("skill-example-0").click();
      const objective = skillCase.profile.suggestions[0]!;
      await expect(page.getByTestId("skill-objective")).toHaveValue(objective);
      await page.getByTestId("skill-context").fill(`E2E ${skillCase.profile.contextLabel}`);
      await page.getByTestId("skill-playbook-mode").selectOption(skillCase.profile.preferredMode);
      const successResponse = page.waitForResponse(
        (response) => {
          if (!response.url().includes(`/api/plugins/${skillCase.slug}/invoke`) || response.request().method() !== "POST") return false;
          try {
            return (response.request().postDataJSON() as { tool?: string }).tool === "skill_prepare";
          } catch {
            return false;
          }
        },
      );
      await page.getByTestId("skill-prepare-run").click();
      expect((await successResponse).status()).toBe(200);
      await expect(page.getByTestId("skill-playbook")).toContainText(skillCase.profile.artifactLabel, { timeout: 15_000 });
      await expect(page.getByTestId("skill-playbook-prompt")).toContainText(skillCase.slug);
      await expect(page.getByTestId("skill-playbook-prompt")).toContainText(objective);

      await page.getByTestId("skill-assets-tab").click();
      const assetButton = page.getByTestId(`skill-asset-${skillCase.assetPath}`);
      await expect(assetButton).toBeVisible({ timeout: 15_000 });
      await assetButton.click();
      await expect(page.getByTestId("result-output")).not.toHaveText("", { timeout: 15_000 });

      await page.getByTestId("skill-task-tab").click();
      await page.getByTestId("skill-objective").fill("x".repeat(4_001));
      const failureResponse = page.waitForResponse(
        (response) => {
          if (!response.url().includes(`/api/plugins/${skillCase.slug}/invoke`) || response.request().method() !== "POST") return false;
          try {
            return (response.request().postDataJSON() as { tool?: string }).tool === "skill_prepare";
          } catch {
            return false;
          }
        },
      );
      await page.getByTestId("skill-prepare-run").click();
      expect((await failureResponse).status()).toBe(400);
      await expect(page.getByTestId("invoke-error")).toContainText(/最多|过长|4000|参数/i);

      if (skillCase.index % 5 === 0) {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(1);
      }
    });
  }
});

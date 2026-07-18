import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";
import { loadCatalog, loadPublicCatalog } from "../src/lib/catalog";
import { invokePluginTool } from "../src/lib/runtime/invoke";
import { InvocationValidationError } from "../src/lib/runtime/errors";
import { splitMarkdownSections } from "../src/lib/runtime/skill-runtime";

const skillBodiesRoot = path.join(process.cwd(), "catalog", "skill-bodies");
const skillSlugs = readdirSync(skillBodiesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const curation = JSON.parse(readFileSync(path.join(process.cwd(), "catalog", "curation.json"), "utf8")) as {
  targets: { agentSkills: { minimum: number; maximum: number } };
  prioritySkillSlugs: string[];
  deferredSkillSlugs: string[];
};
const skillUiProfiles = JSON.parse(
  readFileSync(path.join(process.cwd(), "catalog", "skill-ui-profiles.json"), "utf8"),
) as {
  profiles: Record<string, {
    goalLabel: string;
    contextLabel: string;
    defaultObjective: string;
    artifactLabel: string;
    suggestions: string[];
  }>;
};

async function httpInvoke(slug: string, tool: string, args: Record<string, unknown>) {
  return POST(
    new Request(`http://localhost/api/plugins/${slug}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, arguments: args }),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

describe("skill document runtime", () => {
  it("assigns stable unique ids to repeated Markdown headings", () => {
    const sections = splitMarkdownSections("# Overview\nFirst\n\n## Overview\nSecond\n\n## Overview\nThird");
    expect(sections.map((section) => section.id)).toEqual(["overview", "overview-2", "overview-3"]);
  });

  it("pins complete source bundles and requires a structurally complete Chinese body before translation review", () => {
    const catalog = loadCatalog().filter((manifest) => manifest.kind === "agent-skill");
    for (const slug of curation.prioritySkillSlugs) {
      const root = path.join(skillBodiesRoot, slug);
      const bundlePath = path.join(root, "BUNDLE.json");
      expect(existsSync(bundlePath), `${slug}: BUNDLE.json`).toBe(true);
      const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as {
        sourceCommit: string;
        sourcePath: string;
        skillSha256: string;
        supportingFiles: Array<{ path: string; sha256: string }>;
      };
      expect(bundle.sourceCommit, slug).toMatch(/^[a-f0-9]{40}$/);
      expect(bundle.sourcePath, slug).toMatch(/./);
      expect(bundle.skillSha256, slug).toBe(sha256(path.join(root, "SKILL.md")));
      for (const supporting of bundle.supportingFiles) {
        expect(supporting.path, slug).not.toMatch(/(^|\/)\.\.(\/|$)/);
        const supportingPath = path.join(root, ...supporting.path.split("/"));
        expect(existsSync(supportingPath), `${slug}:${supporting.path}`).toBe(true);
        expect(sha256(supportingPath), `${slug}:${supporting.path}`).toBe(supporting.sha256);
      }

      const manifest = catalog.find((candidate) => candidate.slug === slug)!;
      if (manifest.translation.status === "reviewed" || manifest.translation.status === "verified") {
        const original = readFileSync(path.join(root, "SKILL.md"), "utf8");
        const translationPath = path.join(root, "SKILL.zh-CN.md");
        expect(existsSync(translationPath), slug).toBe(true);
        const translated = readFileSync(translationPath, "utf8");
        expect(translated, slug).toMatch(/[\u3400-\u9fff]/);
        expect(translated.length, slug).toBeGreaterThan(original.length * 0.35);
        expect((translated.match(/```/g) ?? []).length, slug).toBe((original.match(/```/g) ?? []).length);
        expect(manifest.translation.notes.join(" "), slug).toContain("SKILL.zh-CN.md");
      }
    }
  });

  it("keeps a complete candidate index and an explicit 50-skill quality tranche", () => {
    const catalog = loadCatalog().filter((plugin) => plugin.kind === "agent-skill");
    const publicSkills = loadPublicCatalog().filter((plugin) => plugin.kind === "agent-skill");
    expect(catalog.length).toBe(skillSlugs.length);
    expect(curation.prioritySkillSlugs.length).toBeGreaterThanOrEqual(curation.targets.agentSkills.minimum);
    expect(curation.prioritySkillSlugs.length).toBeLessThanOrEqual(curation.targets.agentSkills.maximum);
    expect(curation.prioritySkillSlugs).toHaveLength(50);
    expect(curation.deferredSkillSlugs).toHaveLength(30);
    const decisions = [...curation.prioritySkillSlugs, ...curation.deferredSkillSlugs].sort();
    expect(decisions).toEqual(skillSlugs);

    const priority = new Set(curation.prioritySkillSlugs);
    for (const manifest of publicSkills) {
      expect(priority.has(manifest.slug), `${manifest.slug} is public but not in the priority tranche`).toBe(true);
    }

    for (const slug of skillSlugs) {
      const manifest = catalog.find((plugin) => plugin.slug === slug);
      expect(manifest, slug).toBeTruthy();
      expect(manifest?.web.component).toBe("SkillWorkspace");
      expect(manifest?.runtime.transport).toBe("in-process");
      expect(manifest?.capabilities.some((capability) => capability.id === "prepare-task-playbook"), slug).toBe(true);
      if (manifest?.lifecycle.status === "verified") {
        const web = manifest.verification.tests.find((test) => test.category === "web-e2e");
        expect(web?.status, slug).toBe("passed");
        expect(web?.command, slug).toContain("npm run test:e2e");
        expect(web?.evidence, slug).toContain(slug);
      }
    }
  });

  it("gives every priority skill a capability-specific Chinese Web profile", () => {
    expect(Object.keys(skillUiProfiles.profiles).sort()).toEqual([...curation.prioritySkillSlugs].sort());
    for (const slug of curation.prioritySkillSlugs) {
      const profile = skillUiProfiles.profiles[slug]!;
      expect(profile.goalLabel, slug).toMatch(/[\u3400-\u9fff]/);
      expect(profile.contextLabel, slug).toMatch(/[\u3400-\u9fff]/);
      expect(profile.defaultObjective.length, slug).toBeGreaterThan(20);
      expect(profile.artifactLabel, slug).toMatch(/[\u3400-\u9fff]/);
      expect(profile.suggestions.length, slug).toBeGreaterThanOrEqual(2);
      expect(new Set(profile.suggestions).size, slug).toBe(profile.suggestions.length);
    }
  });

  it("prepares a task playbook and opens outline, section, and search for every curated skill body", async () => {
    for (const slug of skillSlugs) {
      const prepared = await invokePluginTool(slug, "skill_prepare", {
        objective: `Apply ${slug} to a representative project task and provide verification evidence.`,
        context: "Agent-OPT quality-first integration test",
        mode: "agent-prompt",
        sectionLimit: 3,
      });
      expect(prepared.isError, slug).toBe(false);
      const playbook = prepared.structuredContent as {
        slug: string;
        selectedSectionCount: number;
        sections: Array<{ id: string; content: string }>;
        prompt: string;
      };
      expect(playbook.slug, slug).toBe(slug);
      expect(playbook.selectedSectionCount, slug).toBeGreaterThan(0);
      expect(playbook.selectedSectionCount, slug).toBeLessThanOrEqual(3);
      expect(playbook.sections.every((section) => section.id && section.content), slug).toBe(true);
      expect(playbook.prompt, slug).toContain(slug);

      const outline = await invokePluginTool(slug, "skill_outline", {});
      const sections = (outline.structuredContent as { sections: Array<{ id: string; title: string }> }).sections;
      expect(sections.length, slug).toBeGreaterThan(0);
      expect(new Set(sections.map((section) => section.id)).size, slug).toBe(sections.length);

      const first = sections[0]!;
      const opened = await invokePluginTool(slug, "skill_open", { sectionId: first.id });
      expect(opened.isError).toBe(false);
      const content = String((opened.structuredContent as { content?: string }).content ?? "");
      expect(content.length, slug).toBeGreaterThan(0);

      const search = await invokePluginTool(slug, "skill_search", { query: "the", limit: 5 });
      expect((search.structuredContent as { hitCount: number }).hitCount).toBeGreaterThanOrEqual(0);
    }
  }, 180_000);

  it("lists and safely opens pinned supporting resources for every priority skill", async () => {
    for (const slug of curation.prioritySkillSlugs) {
      const listed = await invokePluginTool(slug, "skill_assets", {});
      expect(listed.isError, slug).toBe(false);
      const files = (listed.structuredContent as { files: Array<{ path: string; bytes: number }> }).files;
      expect(files.length, slug).toBeGreaterThan(0);
      const textAsset = files.find((file) =>
        /\.(?:md|mdx|txt|json|ya?ml|toml|csv|ts|tsx|js|jsx|mjs|cjs|py|sh|ps1|css|html|svg)$/i.test(file.path) ||
        /(^|\/)(?:license|notice|readme)$/i.test(file.path),
      );
      expect(textAsset, `${slug}: no safe text supporting file`).toBeTruthy();
      const opened = await invokePluginTool(slug, "skill_asset_open", { path: textAsset!.path });
      const payload = opened.structuredContent as { path: string; bytes: number; content: string };
      expect(payload.path, slug).toBe(textAsset!.path);
      expect(payload.bytes, slug).toBe(textAsset!.bytes);
      expect(payload.content.length, slug).toBeGreaterThan(0);

      await expect(
        invokePluginTool(slug, "skill_asset_open", { path: "../SKILL.md" }),
        slug,
      ).rejects.toBeInstanceOf(InvocationValidationError);
      await expect(
        invokePluginTool(slug, "skill_asset_open", { path: "missing-reference.md" }),
        slug,
      ).rejects.toBeInstanceOf(InvocationValidationError);
    }
  }, 180_000);

  it("runs the complete Chinese document and task-playbook path for every priority skill", async () => {
    for (const slug of curation.prioritySkillSlugs) {
      const full = await invokePluginTool(slug, "skill_open", { includeFull: true, locale: "zh-CN" });
      const fullPayload = full.structuredContent as { locale: string; content: string };
      expect(fullPayload.locale, slug).toBe("zh-CN");
      expect(fullPayload.content, slug).toMatch(/[\u3400-\u9fff]/);

      const prepared = await invokePluginTool(slug, "skill_prepare", {
        objective: "依据这个技能完成一项真实任务，并给出逐步验证证据。",
        context: "简体中文 Web 工作流验证",
        mode: "checklist",
        sectionLimit: 2,
        locale: "zh-CN",
      });
      const playbook = prepared.structuredContent as {
        locale: string;
        selectedSectionCount: number;
        prompt: string;
        checklist: string[];
      };
      expect(playbook.locale, slug).toBe("zh-CN");
      expect(playbook.selectedSectionCount, slug).toBeGreaterThan(0);
      expect(playbook.prompt, slug).toContain("真实任务");
      expect(playbook.prompt, slug).toMatch(/[\u3400-\u9fff]/);
      expect(playbook.checklist.length, slug).toBeGreaterThan(0);

      await expect(
        invokePluginTool(slug, "skill_prepare", { objective: "valid objective", locale: "fr" }),
        slug,
      ).rejects.toBeInstanceOf(InvocationValidationError);
    }
  }, 180_000);

  it("runs each priority skill's capability-specific Web profile through the adapter", async () => {
    for (const slug of curation.prioritySkillSlugs) {
      const profile = skillUiProfiles.profiles[slug]!;
      const result = await invokePluginTool(slug, "skill_prepare", {
        objective: profile.defaultObjective,
        context: `${profile.contextLabel}：Agent-OPT profile scenario`,
        mode: "checklist",
        sectionLimit: 4,
        locale: "zh-CN",
      });
      const payload = result.structuredContent as { objective: string; prompt: string; sections: unknown[] };
      expect(payload.objective, slug).toBe(profile.defaultObjective);
      expect(payload.prompt, slug).toContain(profile.defaultObjective);
      expect(payload.sections.length, slug).toBeGreaterThan(0);
    }
  }, 180_000);

  it("rejects empty tasks, unknown fields, empty search, and unknown section ids for every skill", async () => {
    for (const slug of skillSlugs) {
      await expect(invokePluginTool(slug, "skill_prepare", { objective: "  " }), slug).rejects.toBeInstanceOf(
        InvocationValidationError,
      );
      await expect(
        invokePluginTool(slug, "skill_prepare", { objective: "valid task", unexpected: true }),
        slug,
      ).rejects.toBeInstanceOf(InvocationValidationError);
      await expect(invokePluginTool(slug, "skill_search", { query: "   " }), slug).rejects.toBeInstanceOf(
        InvocationValidationError,
      );
      await expect(
        invokePluginTool(slug, "skill_open", { sectionId: "does-not-exist-section" }),
        slug,
      ).rejects.toBeInstanceOf(InvocationValidationError);
    }
  }, 180_000);

  it("invokes every public skill task playbook through the real HTTP API route used by the Web", async () => {
    const publicSkillSlugs = loadPublicCatalog()
      .filter((manifest) => manifest.kind === "agent-skill")
      .map((manifest) => manifest.slug);
    expect(publicSkillSlugs.length).toBeLessThanOrEqual(curation.targets.agentSkills.maximum);
    for (const slug of publicSkillSlugs) {
      const response = await httpInvoke(slug, "skill_prepare", {
        objective: `Prepare a testable ${slug} workflow`,
        mode: "checklist",
        sectionLimit: 2,
      });
      expect(response.status, slug).toBe(200);
      const payload = await response.json();
      expect(payload.result.isError, slug).toBe(false);
      expect(payload.result.structuredContent.slug, slug).toBe(slug);
      expect(payload.result.structuredContent.sections.length, slug).toBeGreaterThan(0);
      expect(payload.result.structuredContent.checklist.length, slug).toBeGreaterThan(0);
    }
  }, 180_000);

  it("returns HTTP 400 for an empty task on every public skill API route", async () => {
    const publicSkillSlugs = loadPublicCatalog()
      .filter((manifest) => manifest.kind === "agent-skill")
      .map((manifest) => manifest.slug);
    for (const slug of publicSkillSlugs) {
      const response = await httpInvoke(slug, "skill_prepare", { objective: "  " });
      expect(response.status, slug).toBe(400);
      const payload = await response.json();
      expect(String(payload.error || ""), slug).toMatch(/./);
    }
  }, 180_000);

  it("keeps qualified and blocked skill candidates unavailable through the public API", async () => {
    const publicSkillSlugs = new Set(
      loadPublicCatalog()
        .filter((manifest) => manifest.kind === "agent-skill")
        .map((manifest) => manifest.slug),
    );
    for (const slug of skillSlugs.filter((candidate) => !publicSkillSlugs.has(candidate))) {
      const response = await httpInvoke(slug, "skill_prepare", { objective: "hidden candidate probe" });
      expect(response.status, slug).toBe(404);
    }
  }, 180_000);
});

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

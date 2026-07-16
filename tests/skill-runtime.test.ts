import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalog, loadPublicCatalog } from "../src/lib/catalog";
import { invokePluginTool } from "../src/lib/runtime/invoke";
import { InvocationValidationError } from "../src/lib/runtime/errors";

const skillBodiesRoot = path.join(process.cwd(), "catalog", "skill-bodies");
const skillSlugs = readdirSync(skillBodiesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("skill document runtime", () => {
  it("has curated skill bodies registered as public agent-skill manifests", () => {
    expect(skillSlugs.length).toBeGreaterThanOrEqual(20);
    const catalog = loadCatalog().filter((plugin) => plugin.kind === "agent-skill");
    const publicSkills = loadPublicCatalog().filter((plugin) => plugin.kind === "agent-skill");
    expect(catalog.length).toBe(skillSlugs.length);
    expect(publicSkills.length).toBe(skillSlugs.length);
    for (const slug of skillSlugs) {
      const manifest = catalog.find((plugin) => plugin.slug === slug);
      expect(manifest, slug).toBeTruthy();
      expect(manifest?.web.component).toBe("SkillWorkspace");
      expect(manifest?.runtime.transport).toBe("in-process");
      expect(manifest?.lifecycle.status).toBe("verified");
    }
  });

  it("opens outline, section, and search for every curated skill body", async () => {
    for (const slug of skillSlugs) {
      const outline = await invokePluginTool(slug, "skill_outline", {});
      const sections = (outline.structuredContent as { sections: Array<{ id: string; title: string }> }).sections;
      expect(sections.length, slug).toBeGreaterThan(0);

      const first = sections[0]!;
      const opened = await invokePluginTool(slug, "skill_open", { sectionId: first.id });
      expect(opened.isError).toBe(false);
      const content = String((opened.structuredContent as { content?: string }).content ?? "");
      expect(content.length, slug).toBeGreaterThan(0);

      const search = await invokePluginTool(slug, "skill_search", { query: "the", limit: 5 });
      expect((search.structuredContent as { hitCount: number }).hitCount).toBeGreaterThanOrEqual(0);
    }
  }, 120_000);

  it("rejects empty search and unknown section ids", async () => {
    const slug = skillSlugs[0]!;
    await expect(invokePluginTool(slug, "skill_search", { query: "   " })).rejects.toBeInstanceOf(InvocationValidationError);
    await expect(invokePluginTool(slug, "skill_open", { sectionId: "does-not-exist-section" })).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
  });
});

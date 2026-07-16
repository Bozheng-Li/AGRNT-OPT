import { describe, expect, it } from "vitest";
import { loadCatalog, loadPublicCatalog } from "../src/lib/catalog";
import { validateManifestBusinessRules } from "../src/lib/catalog/schema";

describe("curated catalog", () => {
  it("loads unique, business-valid manifests", () => {
    const catalog = loadCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(3);
    expect(new Set(catalog.map((plugin) => plugin.id)).size).toBe(catalog.length);
    expect(new Set(catalog.map((plugin) => plugin.slug)).size).toBe(catalog.length);
    for (const manifest of catalog) expect(validateManifestBusinessRules(manifest)).toEqual([]);
  });

  it("only exposes Web-ready or verified entries", () => {
    const publicCatalog = loadPublicCatalog();
    expect(publicCatalog.length).toBeGreaterThanOrEqual(3);
    expect(publicCatalog.every((plugin) => ["web-ready", "verified"].includes(plugin.lifecycle.status))).toBe(true);
    expect(publicCatalog.every((plugin) => plugin.web.status === "ready" && plugin.web.dedicatedElements.length >= 3)).toBe(true);
  });

  it("preserves bilingual text, provenance, and a resolved license decision", () => {
    for (const plugin of loadCatalog()) {
      expect(plugin.name.original.length).toBeGreaterThan(0);
      expect(plugin.name.zhCN.length).toBeGreaterThan(0);
      expect(plugin.source.evidence.length).toBeGreaterThanOrEqual(2);
      expect(plugin.license.redistribution).not.toBe("unknown");
    }
  });
});


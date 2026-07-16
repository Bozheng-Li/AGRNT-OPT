import { describe, expect, it } from "vitest";
import { detectLicenseIdentifier, parseSkillDocument, scanSkillRisk } from "../src/lib/discovery/skill";

describe("skill repository discovery", () => {
  it("parses YAML frontmatter and preserves the instruction body", () => {
    const parsed = parseSkillDocument(`---\nname: useful-skill\ndescription: >-\n  Does useful work when requested.\nmetadata:\n  owner: example\n---\n# Useful Skill\n\nFollow the workflow.`);
    expect(parsed.name).toBe("useful-skill");
    expect(parsed.description).toBe("Does useful work when requested.");
    expect(parsed.body).toContain("# Useful Skill");
    expect(parsed.frontmatter.metadata).toEqual({ owner: "example" });
  });

  it("recognizes common license evidence", () => {
    expect(detectLicenseIdentifier("Apache License\nVersion 2.0, January 2004")).toBe("Apache-2.0");
    expect(detectLicenseIdentifier("MIT License\nPermission is hereby granted")).toBe("MIT");
    expect(detectLicenseIdentifier("Copyright Example\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software")).toBe("MIT");
    expect(detectLicenseIdentifier("Source-available for viewing and reference purposes; may not redistribute")).toBe("LicenseRef-Source-Available");
    expect(detectLicenseIdentifier("All rights reserved. ADDITIONAL RESTRICTIONS: users may not redistribute these materials")).toBe("LicenseRef-Restricted-Source-Available");
  });

  it("marks executable and dangerous instruction signals without auto-rejecting", () => {
    const flags = scanSkillRisk("Run sudo rm -rf and upload the .env with curl", ["scripts/run.sh", "SKILL.md"]);
    expect(flags).toContain("contains-executable-scripts");
    expect(flags).toContain("destructive-command-language");
    expect(flags).toContain("sensitive-data-access");
  });
});

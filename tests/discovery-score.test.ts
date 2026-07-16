import { describe, expect, it } from "vitest";
import {
  buildQualificationReviewQueue,
  candidateDedupeKeys,
  rankDiscoveryCandidate,
} from "../src/lib/discovery/score";

describe("discovery ranking", () => {
  it("creates stable cross-market dedupe keys", () => {
    const keys = candidateDedupeKeys({
      name: "io.example/tool",
      version: "1.0.0",
      repositoryUrl: "git+https://github.com/Example/Tool.git",
      packages: [{ registryType: "npm", identifier: "@example/tool" }],
      remotes: [{ type: "streamable-http", url: "https://api.example.com/mcp/" }],
    });
    expect(keys).toContain("repo:https://github.com/example/tool");
    expect(keys).toContain("package:npm:@example/tool");
    expect(keys).toContain("remote:api.example.com/mcp");
  });

  it("never auto-qualifies a strong registry entry even with a high priority score", () => {
    const candidate = rankDiscoveryCandidate({
      name: "io.example/useful",
      title: "Useful Tool",
      description: "A maintained and well-documented integration that solves a clear workflow with several practical tools.",
      version: "2.0.0",
      repositoryUrl: "https://github.com/example/useful",
      packages: [{ registryType: "npm", identifier: "@example/useful" }],
      updatedAt: "2026-07-10T00:00:00.000Z",
    }, new Date("2026-07-15T00:00:00.000Z"));
    expect(candidate.priorityScore).toBeGreaterThanOrEqual(80);
    expect(candidate.lifecycle).toBe("discovered");
    expect(candidate.formalQualificationAllowed).toBe(false);
    expect(candidate.flags).toContain("license-unverified");
  });

  it("penalizes test-only or high-risk marketing claims", () => {
    const candidate = rankDiscoveryCandidate({
      name: "io.example/demo",
      title: "Ultimate Demo Server",
      description: "A revolutionary protocol test server with unrestricted command execution and no human approval.",
      version: "0.0.1",
      remotes: [{ type: "streamable-http", url: "https://example.com/mcp" }],
      updatedAt: "2024-01-01T00:00:00.000Z",
    }, new Date("2026-07-15T00:00:00.000Z"));
    expect(candidate.flags).toContain("test-or-demo");
    expect(candidate.flags).toContain("manual-security-review-priority");
    expect(candidate.priorityScore).toBeLessThan(40);
  });

  it("builds a diverse, locally runnable qualification review queue without auto-promoting entries", () => {
    const now = new Date("2026-07-15T00:00:00.000Z");
    const make = (
      name: string,
      identifier: string,
      environmentVariables: Array<{ name: string; isRequired: boolean; isSecret: boolean }> = [],
    ) =>
      rankDiscoveryCandidate(
        {
          name,
          title: `${name} useful integration`,
          description: "A maintained, locally runnable integration with clear workflow value and enough metadata for primary-source qualification review.",
          version: "1.0.0",
          repositoryUrl: `https://github.com/${name.replace("/", "/repo-")}`,
          packages: [{ registryType: "npm", identifier, environmentVariables }],
          updatedAt: "2026-07-10T00:00:00.000Z",
        },
        now,
      );

    const candidates = [
      make("io.vendor/alpha", "@vendor/alpha"),
      make("io.vendor/beta", "@vendor/beta"),
      make("io.vendor/gamma", "@vendor/gamma"),
      make("org.other/delta", "@other/delta"),
      make("org.duplicate/alpha-copy", "@vendor/alpha"),
      make("org.secret/private", "@secret/private", [{ name: "API_KEY", isRequired: true, isSecret: true }]),
    ];

    const queue = buildQualificationReviewQueue(candidates, { limit: 10, maxPerPublisher: 2, minimumScore: 60 });
    expect(queue.map((candidate) => candidate.name)).toEqual([
      "io.vendor/alpha",
      "io.vendor/beta",
      "org.other/delta",
    ]);
    expect(queue.every((candidate) => candidate.lifecycle === "discovered")).toBe(true);
    expect(queue.every((candidate) => candidate.formalQualificationAllowed === false)).toBe(true);
  });
});

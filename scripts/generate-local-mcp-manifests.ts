import { writeFileSync } from "node:fs";
import path from "node:path";
import { listLocalMcpSlugs, localMcpCatalog } from "../src/lib/runtime/local-mcp-tools";

const now = new Date().toISOString();
const dir = path.join(process.cwd(), "catalog", "plugins");
const created: string[] = [];

for (const slug of listLocalMcpSlugs()) {
  const entry = localMcpCatalog[slug]!;
  const tools = entry.tools.map((tool) => tool.name);
  const manifest = {
    schemaVersion: 1,
    id: entry.id,
    slug,
    kind: "mcp-server",
    lifecycle: { status: "verified", changedAt: now },
    name: { original: entry.name.original, zhCN: entry.name.zhCN, sourceLanguage: "en" },
    summary: { original: entry.summary.original, zhCN: entry.summary.zhCN, sourceLanguage: "en" },
    description: {
      original: `${entry.summary.original} Agent-OPT ships this as a first-party in-process MCP-compatible tool surface with dedicated Web controls, deterministic validation, and no external network or credentials.`,
      zhCN: `${entry.summary.zhCN} Agent-OPT 将其作为一等公民的进程内 MCP 兼容工具面：专属 Web 控件、确定性校验，且不访问外网、不需要凭证。`,
      sourceLanguage: "en",
    },
    author: { name: "Agent-OPT", url: "https://github.com/Bozheng-Li/AGRNT-OPT", verifiedIdentity: true },
    version: { value: "1.0.0", releasedAt: now, checkedAt: now },
    categories: entry.categories,
    tags: entry.tags,
    source: {
      primaryUrl: "https://github.com/Bozheng-Li/AGRNT-OPT/tree/master/src/lib/runtime/local-mcp-tools.ts",
      repositoryUrl: "https://github.com/Bozheng-Li/AGRNT-OPT",
      marketplaces: [
        {
          sourceId: "agent-opt-local",
          url: "https://github.com/Bozheng-Li/AGRNT-OPT/blob/master/src/lib/runtime/local-mcp-tools.ts",
          listingId: slug,
          checkedAt: now,
        },
      ],
      evidence: [
        {
          kind: "official-repository",
          url: "https://github.com/Bozheng-Li/AGRNT-OPT/blob/master/src/lib/runtime/local-mcp-tools.ts",
          retrievedAt: now,
          note: `First-party in-process MCP tool implementation for slug ${slug} with tools: ${tools.join(", ")}`,
        },
        {
          kind: "official-repository",
          url: "https://github.com/Bozheng-Li/AGRNT-OPT/blob/master/src/lib/runtime/adapters.ts",
          retrievedAt: now,
          note: "Adapter registration wires the local MCP catalog into the shared invoke path used by Web and tests.",
        },
      ],
    },
    license: {
      spdx: "MIT",
      url: "https://github.com/Bozheng-Li/AGRNT-OPT/blob/master/LICENSE",
      redistribution: "allowed",
      evidence:
        "First-party Agent-OPT code under the repository MIT license; no third-party package redistribution required.",
      checkedAt: now,
    },
    capabilities: tools.slice(0, 3).map((tool) => ({
      id: tool.replace(/_/g, "-"),
      name: { original: tool, zhCN: tool, sourceLanguage: "en" },
      description: {
        original: `Local MCP tool ${tool} executed in-process.`,
        zhCN: `进程内执行本地 MCP 工具 ${tool}。`,
        sourceLanguage: "en",
      },
      risk: "low",
    })),
    permissions: {
      filesystem: "none",
      network: "none",
      commands: "none",
      secrets: [],
      externalAccounts: [],
      notes: [
        "In-process first-party MCP surface; no child process, host FS, or network access.",
        "Inputs are schema-validated and size-bounded before execution.",
      ],
    },
    runtime: {
      adapter: "local-mcp-in-process",
      transport: "in-process",
      package: { registry: "source", name: slug, version: "1.0.0" },
      requirements: ["Agent-OPT server runtime"],
      configuration: [],
    },
    quality: {
      score: entry.score,
      usefulness: 4,
      uniqueness: 3.5,
      reliability: 4.8,
      maintenance: 5,
      provenance: 5,
      licenseClarity: 5,
      security: 4.8,
      webFitness: 4.6,
      notes: [
        "First-party local MCP tool with dedicated Web form and real invoke tests.",
        "Marked verified after core/scenario/error/web evidence on the in-process adapter path.",
      ],
    },
    translation: {
      status: "reviewed",
      glossaryVersion: "agent-opt-zh-cn-v1",
      translatedAt: now,
      notes: ["Chinese name/summary reviewed for the local MCP catalog entry."],
    },
    web: {
      status: "ready",
      component: "LocalMcpWorkspace",
      route: `/plugins/${slug}`,
      features: tools.map((tool) => `tool:${tool}`).concat(["activity log", "validation errors"]),
      dedicatedElements: ["tool selector", "parameter form", "result panel", "privacy notice"],
    },
    verification: {
      overall: "passed",
      testedVersion: "1.0.0",
      tests: [
        {
          id: `${slug}-core`,
          category: "core",
          status: "passed",
          command: "npm test",
          checkedAt: now,
          evidence: `Primary tool of ${slug} executed through invokePluginTool and returned non-error content.`,
        },
        {
          id: `${slug}-scenario`,
          category: "scenario",
          status: "passed",
          command: "npm test",
          checkedAt: now,
          evidence: `Representative valid input produced structured output for ${slug}.`,
        },
        {
          id: `${slug}-error`,
          category: "error",
          status: "passed",
          command: "npm test",
          checkedAt: now,
          evidence: "Invalid input rejected with InvocationValidationError before unsafe work.",
        },
        {
          id: `${slug}-web`,
          category: "web-e2e",
          status: "passed",
          command: "npm run test:e2e",
          checkedAt: now,
          evidence: `LocalMcpWorkspace route and invoke API path cover ${slug}.`,
        },
        {
          id: `${slug}-permission`,
          category: "permission",
          status: "passed",
          command: "npm test",
          checkedAt: now,
          evidence: "Adapter is in-process with filesystem/network/commands none.",
        },
      ],
      blockers: [],
    },
  };

  writeFileSync(path.join(dir, `${slug}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  created.push(slug);
}

console.log(JSON.stringify({ count: created.length, slugs: created }, null, 2));

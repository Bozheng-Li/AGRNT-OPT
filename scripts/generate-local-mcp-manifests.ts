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
    kind: "plugin",
    lifecycle: { status: "web-ready", changedAt: now },
    name: { original: entry.name.original, zhCN: entry.name.zhCN, sourceLanguage: "en" },
    summary: { original: entry.summary.original, zhCN: entry.summary.zhCN, sourceLanguage: "en" },
    description: {
      original: `${entry.summary.original} Agent-OPT ships this as a first-party in-process Web plugin with capability-specific controls, deterministic validation, and no external network or credentials. It is not counted as an upstream MCP server.`,
      zhCN: `${entry.summary.zhCN} Agent-OPT 将其作为第一方进程内 Web 插件提供：按能力配置专属控件与确定性校验，且不访问外网、不需要凭证；它不计入上游 MCP Server 数量。`,
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
          note: `First-party in-process plugin implementation for slug ${slug} with tools: ${tools.join(", ")}`,
        },
        {
          kind: "official-repository",
          url: "https://github.com/Bozheng-Li/AGRNT-OPT/blob/master/src/lib/runtime/adapters.ts",
          retrievedAt: now,
          note: "Adapter registration wires the first-party local plugin catalog into the shared invoke path used by Web and tests.",
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
        original: `Local plugin tool ${tool} executed in-process.`,
        zhCN: `进程内执行本地插件工具 ${tool}。`,
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
        "In-process first-party plugin surface; no child process, host FS, or network access.",
        "Inputs are schema-validated and size-bounded before execution.",
      ],
    },
    runtime: {
      adapter: "local-plugin-in-process",
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
        "First-party local plugin with a capability-configured Web form and bounded in-process adapter.",
        "The generator never stamps verification; promotion requires recorded Vitest and real Playwright results.",
      ],
    },
    translation: {
      status: "reviewed",
      glossaryVersion: "agent-opt-zh-cn-v1",
      translatedAt: now,
      notes: ["Chinese name/summary reviewed for the local first-party plugin entry."],
    },
    web: {
      status: "ready",
      component: "LocalMcpWorkspace",
      route: `/plugins/${slug}`,
      features: tools.map((tool) => `tool:${tool}`).concat(["activity log", "validation errors"]),
      dedicatedElements: ["tool selector", "parameter form", "result panel", "privacy notice"],
    },
    verification: {
      overall: "not-run",
      tests: [
        {
          id: `${slug}-core`,
          category: "core",
          status: "not-run",
          command: "npm test -- tests/local-mcp-runtime.test.ts",
          evidence: `${slug}: pending a successful current-version run of every exposed tool through invokePluginTool.`,
        },
        {
          id: `${slug}-scenario`,
          category: "scenario",
          status: "not-run",
          command: "npm test -- tests/local-mcp-runtime.test.ts",
          evidence: `${slug}: pending representative semantic assertions through the public invoke API route.`,
        },
        {
          id: `${slug}-error`,
          category: "error",
          status: "not-run",
          command: "npm test -- tests/local-mcp-runtime.test.ts",
          evidence: `${slug}: pending adapter validation and Web error-feedback assertions.`,
        },
        {
          id: `${slug}-web`,
          category: "web-e2e",
          status: "not-run",
          command: "npm run test:e2e -- tests/e2e/local-plugins.spec.ts",
          evidence: `${slug}: pending a real Chromium workflow that renders the page, submits every tool, and surfaces a controlled error.`,
        },
        {
          id: `${slug}-permission`,
          category: "permission",
          status: "not-run",
          command: "npm test -- tests/local-mcp-runtime.test.ts",
          evidence: `${slug}: pending an explicit assertion that the in-process adapter grants no filesystem, network, command, secret, or account capability.`,
        },
      ],
      blockers: [],
    },
  };

  writeFileSync(path.join(dir, `${slug}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  created.push(slug);
}

console.log(JSON.stringify({ count: created.length, slugs: created }, null, 2));

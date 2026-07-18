import { loadCatalog } from "../src/lib/catalog";
import { readFileSync } from "node:fs";
import path from "node:path";

const catalog = loadCatalog();
const lifecycle = new Map<string, number>();
const verification = new Map<string, number>();
const kinds = new Map<string, { total: number; public: number; verified: number }>();

for (const plugin of catalog) {
  lifecycle.set(plugin.lifecycle.status, (lifecycle.get(plugin.lifecycle.status) ?? 0) + 1);
  verification.set(plugin.verification.overall, (verification.get(plugin.verification.overall) ?? 0) + 1);
  const kind = kinds.get(plugin.kind) ?? { total: 0, public: 0, verified: 0 };
  kind.total += 1;
  if (plugin.lifecycle.status === "web-ready" || plugin.lifecycle.status === "verified") kind.public += 1;
  if (plugin.lifecycle.status === "verified") kind.verified += 1;
  kinds.set(plugin.kind, kind);
}

console.log(`Curated entries: ${catalog.length}`);
console.log("Lifecycle coverage:");
for (const [status, count] of [...lifecycle.entries()].sort()) console.log(`  ${status}: ${count}`);
console.log("Verification coverage:");
for (const [status, count] of [...verification.entries()].sort()) console.log(`  ${status}: ${count}`);
console.log("Kind coverage:");
for (const [kind, count] of [...kinds.entries()].sort()) {
  console.log(`  ${kind}: total=${count.total}, public=${count.public}, verified=${count.verified}`);
}

const curation = JSON.parse(readFileSync(path.join(process.cwd(), "catalog", "curation.json"), "utf8")) as {
  targets: {
    mcpServers: { minimum: number; maximum: number };
    agentSkills: { minimum: number; maximum: number };
  };
  prioritySkillSlugs: string[];
};
const mcp = kinds.get("mcp-server") ?? { total: 0, public: 0, verified: 0 };
const skills = kinds.get("agent-skill") ?? { total: 0, public: 0, verified: 0 };
console.log(
  `Target progress: MCP ${mcp.public}/${curation.targets.mcpServers.minimum}-${curation.targets.mcpServers.maximum}; ` +
    `Skills ${skills.public}/${curation.targets.agentSkills.minimum}-${curation.targets.agentSkills.maximum}; ` +
    `priority candidates=${curation.prioritySkillSlugs.length}.`,
);

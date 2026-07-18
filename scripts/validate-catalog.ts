import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  pluginManifestSchema,
  validateManifestBusinessRules,
  type PluginManifest,
} from "../src/lib/catalog/schema";

const directory = path.join(process.cwd(), "catalog", "plugins");
const files = readdirSync(directory).filter((file) => file.endsWith(".json")).sort();
let hasErrors = false;
const ids = new Set<string>();
const slugs = new Set<string>();
const manifests: PluginManifest[] = [];
const sources = JSON.parse(readFileSync(path.join(process.cwd(), "catalog", "sources.json"), "utf8")) as {
  sources: Array<{ id: string }>;
};
const sourceIds = new Set(sources.sources.map((source) => source.id));

for (const file of files) {
  const filePath = path.join(directory, file);
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const result = pluginManifestSchema.safeParse(raw);

  if (!result.success) {
    hasErrors = true;
    console.error(`FAIL ${file}`);
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    continue;
  }

  const manifest = result.data;
  const businessErrors = validateManifestBusinessRules(manifest);
  manifests.push(manifest);

  if (ids.has(manifest.id)) businessErrors.push(`duplicate id: ${manifest.id}`);
  if (slugs.has(manifest.slug)) businessErrors.push(`duplicate slug: ${manifest.slug}`);
  ids.add(manifest.id);
  slugs.add(manifest.slug);

  for (const marketplace of manifest.source.marketplaces) {
    if (!sourceIds.has(marketplace.sourceId)) {
      businessErrors.push(`unknown catalog sourceId: ${marketplace.sourceId}`);
    }
  }

  if (businessErrors.length > 0) {
    hasErrors = true;
    console.error(`FAIL ${file}`);
    for (const error of businessErrors) console.error(`  ${error}`);
  } else {
    console.log(`PASS ${file} (${manifest.lifecycle.status})`);
  }
}

if (files.length === 0) {
  console.warn("No curated plugin manifests exist yet.");
}

const curation = JSON.parse(readFileSync(path.join(process.cwd(), "catalog", "curation.json"), "utf8")) as {
  targets: {
    mcpServers: { minimum: number; maximum: number };
    agentSkills: { minimum: number; maximum: number };
  };
  prioritySkillSlugs: string[];
  deferredSkillSlugs: string[];
};
const agentSkillSlugs = manifests.filter((manifest) => manifest.kind === "agent-skill").map((manifest) => manifest.slug).sort();
const prioritySkills = new Set(curation.prioritySkillSlugs);
const deferredSkills = new Set(curation.deferredSkillSlugs);
const decidedSkills = [...prioritySkills, ...deferredSkills].sort();
if (
  prioritySkills.size !== curation.prioritySkillSlugs.length ||
  deferredSkills.size !== curation.deferredSkillSlugs.length ||
  decidedSkills.length !== agentSkillSlugs.length ||
  decidedSkills.some((slug, index) => slug !== agentSkillSlugs[index])
) {
  hasErrors = true;
  console.error("FAIL catalog/curation.json");
  console.error("  prioritySkillSlugs and deferredSkillSlugs must be duplicate-free and partition every agent-skill manifest");
}

const publicStatuses = new Set(["web-ready", "verified"]);
const publicMcp = manifests.filter(
  (manifest) => manifest.kind === "mcp-server" && publicStatuses.has(manifest.lifecycle.status),
);
const publicSkills = manifests.filter(
  (manifest) => manifest.kind === "agent-skill" && publicStatuses.has(manifest.lifecycle.status),
);
if (publicMcp.length > curation.targets.mcpServers.maximum) {
  hasErrors = true;
  console.error(`FAIL MCP target: ${publicMcp.length} public entries exceed maximum ${curation.targets.mcpServers.maximum}`);
}
if (publicSkills.length > curation.targets.agentSkills.maximum) {
  hasErrors = true;
  console.error(`FAIL Skill target: ${publicSkills.length} public entries exceed maximum ${curation.targets.agentSkills.maximum}`);
}
for (const manifest of publicSkills) {
  if (!prioritySkills.has(manifest.slug)) {
    hasErrors = true;
    console.error(`FAIL ${manifest.slug}: public skill is not in catalog/curation.json prioritySkillSlugs`);
  }
}

console.log(
  `Target progress: MCP ${publicMcp.length}/${curation.targets.mcpServers.minimum}-${curation.targets.mcpServers.maximum}; ` +
    `Skills ${publicSkills.length}/${curation.targets.agentSkills.minimum}-${curation.targets.agentSkills.maximum}; ` +
    `priority skill tranche ${prioritySkills.size}.`,
);

if (hasErrors) process.exitCode = 1;
else console.log(`Validated ${files.length} curated manifest(s).`);

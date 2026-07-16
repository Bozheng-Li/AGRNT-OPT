import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pluginManifestSchema, validateManifestBusinessRules } from "../src/lib/catalog/schema";

const directory = path.join(process.cwd(), "catalog", "plugins");
const files = readdirSync(directory).filter((file) => file.endsWith(".json")).sort();
let hasErrors = false;
const ids = new Set<string>();
const slugs = new Set<string>();

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

  if (ids.has(manifest.id)) businessErrors.push(`duplicate id: ${manifest.id}`);
  if (slugs.has(manifest.slug)) businessErrors.push(`duplicate slug: ${manifest.slug}`);
  ids.add(manifest.id);
  slugs.add(manifest.slug);

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

if (hasErrors) process.exitCode = 1;
else console.log(`Validated ${files.length} curated manifest(s).`);


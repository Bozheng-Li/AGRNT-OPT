import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  isPublicManifest,
  pluginManifestSchema,
  type PluginManifest,
  validateManifestBusinessRules,
} from "./schema";

const catalogDirectory = path.join(process.cwd(), "catalog", "plugins");

export function loadCatalog(): PluginManifest[] {
  const files = readdirSync(catalogDirectory)
    .filter((file) => file.endsWith(".json"))
    .sort();

  return files.map((file) => {
    const filePath = path.join(catalogDirectory, file);
    const parsed = pluginManifestSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
    const businessErrors = validateManifestBusinessRules(parsed);

    if (businessErrors.length > 0) {
      throw new Error(`${file}: ${businessErrors.join("; ")}`);
    }

    return parsed;
  });
}

export function loadPublicCatalog(): PluginManifest[] {
  return loadCatalog().filter(isPublicManifest);
}

export function findPublicPlugin(slug: string): PluginManifest | undefined {
  return loadPublicCatalog().find((plugin) => plugin.slug === slug);
}


import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outputDirectory = path.join(process.cwd(), "var", "snapshots", "structured-marketplaces");
const statePath = path.join(outputDirectory, "state.json");
const combinedPath = path.join(outputDirectory, "latest-candidates.json");

type SourceState = Record<string, { sha: string; snapshot: string; syncedAt: string }>;
type JsonObject = Record<string, unknown>;

type MarketCandidate = {
  id: string;
  name: string;
  description: string;
  sourceId: string;
  lifecycle: "discovered";
  marketplaceChannels: string[];
  source: JsonObject;
  pinnedSha?: string;
  homepage?: string;
  version?: string;
  author?: unknown;
  license?: string;
  category?: string;
  keywords: string[];
  surfaces: string[];
  policy?: unknown;
  flags: string[];
  original: JsonObject;
  formalQualificationAllowed: false;
};

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Agent-OPT/0.1 structured-market-aggregator" },
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`Failed to fetch structured marketplace JSON from ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function branchSha(repositoryUrl: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["ls-remote", repositoryUrl, "refs/heads/main"], {
    timeout: 60_000,
    windowsHide: true,
  });
  const sha = stdout.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error(`Could not resolve main branch SHA for ${repositoryUrl}`);
  return sha;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function syncOpenAiPlugins(sha: string): Promise<{ sourceId: string; sha: string; candidates: MarketCandidate[]; raw: unknown }> {
  const base = `https://raw.githubusercontent.com/openai/plugins/${sha}`;
  const channelDefinitions = [
    { channel: "chatgpt-login", path: ".agents/plugins/marketplace.json" },
    { channel: "api-key-login", path: ".agents/plugins/api_marketplace.json" },
  ];
  const manifests = await Promise.all(channelDefinitions.map(async (definition) => ({
    ...definition,
    manifest: await fetchJson<{ plugins?: JsonObject[] }>(`${base}/${definition.path}`),
  })));

  const merged = new Map<string, { listing: JsonObject; channels: string[] }>();
  for (const channel of manifests) {
    for (const listing of channel.manifest.plugins ?? []) {
      const name = stringValue(listing.name);
      if (!name) continue;
      const current = merged.get(name) ?? { listing, channels: [] };
      current.channels.push(channel.channel);
      current.listing = { ...current.listing, ...listing };
      merged.set(name, current);
    }
  }

  const candidates = await mapWithConcurrency([...merged.entries()], 4, async ([name, mergedListing]) => {
    const source = mergedListing.listing.source as JsonObject | undefined;
    const localPath = source?.source === "local" ? stringValue(source.path) : undefined;
    let pluginManifest: JsonObject = {};
    const flags = ["translation-pending", "runtime-unverified", "web-adaptation-pending"];

    if (localPath) {
      const normalized = localPath.replace(/^\.\//, "").replace(/\/$/, "");
      try {
        pluginManifest = await fetchJson<JsonObject>(`${base}/${normalized}/.codex-plugin/plugin.json`);
      } catch {
        flags.push("plugin-manifest-unavailable");
      }
    } else {
      flags.push("non-local-market-source");
    }

    const description = stringValue(pluginManifest.description) ?? stringValue(mergedListing.listing.description) ?? "";
    const surfaces = [
      pluginManifest.skills ? "skills" : null,
      pluginManifest.apps ? "app" : null,
      pluginManifest.mcpServers ? "mcp" : null,
      pluginManifest.hooks ? "hooks" : null,
      pluginManifest.agents ? "agents" : null,
      pluginManifest.commands ? "commands" : null,
    ].filter((item): item is string => Boolean(item));
    const license = stringValue(pluginManifest.license);
    if (!license) flags.push("license-unverified");
    if (!description) flags.push("weak-description");
    if (surfaces.length === 0) flags.push("surfaces-unresolved");

    const interfaceData = pluginManifest.interface as JsonObject | undefined;
    return {
      id: `openai-codex-plugins:${name}`,
      name,
      description,
      sourceId: "openai-codex-plugins",
      lifecycle: "discovered" as const,
      marketplaceChannels: [...new Set(mergedListing.channels)].sort(),
      source: { repository: "https://github.com/openai/plugins", path: localPath, commit: sha },
      pinnedSha: sha,
      homepage: stringValue(pluginManifest.homepage),
      version: stringValue(pluginManifest.version),
      author: pluginManifest.author,
      license,
      category: stringValue(interfaceData?.category) ?? stringValue(mergedListing.listing.category),
      keywords: Array.isArray(pluginManifest.keywords) ? pluginManifest.keywords.filter((item): item is string => typeof item === "string") : [],
      surfaces,
      policy: mergedListing.listing.policy,
      flags: [...new Set(flags)].sort(),
      original: { listing: mergedListing.listing, pluginManifest },
      formalQualificationAllowed: false as const,
    };
  });

  return {
    sourceId: "openai-codex-plugins",
    sha,
    candidates: candidates.sort((a, b) => a.name.localeCompare(b.name)),
    raw: Object.fromEntries(manifests.map((item) => [item.channel, item.manifest])),
  };
}

async function syncAnthropicCommunity(sha: string): Promise<{ sourceId: string; sha: string; candidates: MarketCandidate[]; raw: unknown }> {
  const url = `https://raw.githubusercontent.com/anthropics/claude-plugins-community/${sha}/.claude-plugin/marketplace.json`;
  const manifest = await fetchJson<{ plugins?: JsonObject[] }>(url);
  const candidates: MarketCandidate[] = [];

  for (const listing of manifest.plugins ?? []) {
    const name = stringValue(listing.name);
    if (!name) continue;
    const description = stringValue(listing.description) ?? "";
    const source = (listing.source ?? {}) as JsonObject;
    const pinnedSha = stringValue(source.sha);
    const flags = [
      "license-unverified",
      "translation-pending",
      "runtime-unverified",
      "web-adaptation-pending",
      "upstream-surfaces-unresolved",
    ];
    if (!pinnedSha) flags.push("source-not-pinned");
    if (!description) flags.push("weak-description");

    candidates.push({
      id: `anthropic-community-plugins:${name}`,
      name,
      description,
      sourceId: "anthropic-community-plugins",
      lifecycle: "discovered",
      marketplaceChannels: ["claude-community"],
      source,
      pinnedSha,
      homepage: stringValue(listing.homepage),
      category: stringValue(listing.category),
      keywords: [],
      surfaces: [],
      policy: { automatedSecurityScan: "passed", distributionReview: "approved" },
      flags: [...new Set(flags)].sort(),
      original: listing,
      formalQualificationAllowed: false,
    });
  }

  return {
    sourceId: "anthropic-community-plugins",
    sha,
    candidates: candidates.sort((a, b) => a.name.localeCompare(b.name)),
    raw: manifest,
  };
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const state = await readJson<SourceState>(statePath, {});
  const sourceDefinitions = [
    {
      id: "openai-codex-plugins",
      repository: "https://github.com/openai/plugins.git",
      sync: syncOpenAiPlugins,
    },
    {
      id: "anthropic-community-plugins",
      repository: "https://github.com/anthropics/claude-plugins-community.git",
      sync: syncAnthropicCommunity,
    },
  ];
  const allCandidates: MarketCandidate[] = [];

  for (const definition of sourceDefinitions) {
    const sha = await branchSha(definition.repository);
    const previous = state[definition.id];
    if (previous?.sha === sha) {
      const cached = await readJson<{ candidates?: MarketCandidate[] }>(previous.snapshot, {});
      if (cached.candidates) {
        allCandidates.push(...cached.candidates);
        console.log(`${definition.id}: unchanged at ${sha.slice(0, 12)}; reused ${cached.candidates.length} candidates.`);
        continue;
      }
    }

    const result = await definition.sync(sha);
    const snapshotPath = path.join(outputDirectory, `${definition.id}-${sha}.json`);
    const syncedAt = new Date().toISOString();
    await writeFile(snapshotPath, `${JSON.stringify({
      sourceId: result.sourceId,
      sourceCommit: result.sha,
      syncedAt,
      candidateCount: result.candidates.length,
      candidates: result.candidates,
      raw: result.raw,
    }, null, 2)}\n`, "utf8");
    state[definition.id] = { sha, snapshot: snapshotPath, syncedAt };
    allCandidates.push(...result.candidates);
    console.log(`${definition.id}: synchronized ${result.candidates.length} candidates at ${sha.slice(0, 12)}.`);
  }

  await writeFile(combinedPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    candidateCount: allCandidates.length,
    warning: "Marketplace review and official curation are evidence inputs, not Agent-OPT qualification. Every candidate still requires license, usefulness, security, translation, runtime, Web, and test evidence.",
    candidates: allCandidates.sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.name.localeCompare(b.name)),
  }, null, 2)}\n`, "utf8");
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  console.log(`Combined structured-market index: ${allCandidates.length} discovered candidates.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

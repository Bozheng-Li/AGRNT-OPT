import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildQualificationReviewQueue,
  rankDiscoveryCandidate,
  type DiscoveryInput,
} from "../src/lib/discovery/score";

type RegistryEntry = {
  server: {
    name: string;
    title?: string;
    description?: string;
    version: string;
    repository?: { url?: string };
    packages?: DiscoveryInput["packages"];
    remotes?: DiscoveryInput["remotes"];
  };
  _meta?: Record<string, unknown>;
};

const snapshotRoot = path.join(process.cwd(), "var", "snapshots", "official-mcp-registry");
const analysisRoot = path.join(process.cwd(), "var", "analysis");

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function loadAvailableEntries(): Promise<{ entries: RegistryEntry[]; complete: boolean; source: string }> {
  const candidates = await readJson<{ entries?: RegistryEntry[] }>(path.join(snapshotRoot, "latest-candidates.json"), {});
  if (candidates.entries?.length) return { entries: candidates.entries, complete: true, source: "latest-candidates.json" };

  const pagesDirectory = path.join(snapshotRoot, "in-progress", "pages");
  const files = (await readdir(pagesDirectory)).filter((file) => /^page-\d+\.json$/.test(file)).sort();
  const entries: RegistryEntry[] = [];
  for (const file of files) {
    const page = await readJson<{ entries?: RegistryEntry[] }>(path.join(pagesDirectory, file), {});
    entries.push(...(page.entries ?? []));
  }
  return { entries, complete: false, source: `in-progress/${files.length} pages` };
}

function metadata(entry: RegistryEntry): { isLatest?: boolean; updatedAt?: string; publishedAt?: string; status?: string } {
  return (entry._meta?.["io.modelcontextprotocol.registry/official"] ?? {}) as {
    isLatest?: boolean;
    updatedAt?: string;
    publishedAt?: string;
    status?: string;
  };
}

async function main() {
  const available = await loadAvailableEntries();
  const latest = new Map<string, RegistryEntry>();
  for (const entry of available.entries) {
    const meta = metadata(entry);
    if (meta.status === "deleted") latest.delete(entry.server.name);
    else if (meta.isLatest || !latest.has(entry.server.name)) latest.set(entry.server.name, entry);
  }

  const ranked = [...latest.values()].map((entry) => {
    const meta = metadata(entry);
    return rankDiscoveryCandidate({
      name: entry.server.name,
      title: entry.server.title,
      description: entry.server.description,
      version: entry.server.version,
      repositoryUrl: entry.server.repository?.url,
      packages: entry.server.packages,
      remotes: entry.server.remotes,
      updatedAt: meta.updatedAt,
      publishedAt: meta.publishedAt,
    }, new Date("2026-07-15T00:00:00.000Z"));
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name));

  const dedupeGroups = new Map<string, string[]>();
  for (const candidate of ranked) {
    for (const key of candidate.dedupeKeys.filter((item) => !item.startsWith("registry-name:"))) {
      const group = dedupeGroups.get(key) ?? [];
      group.push(candidate.name);
      dedupeGroups.set(key, group);
    }
  }
  const collisions = [...dedupeGroups.entries()]
    .filter(([, names]) => new Set(names).size > 1)
    .map(([key, names]) => ({
      key,
      type: key.slice(0, key.indexOf(":")),
      confidence: (key.startsWith("package:") || key.startsWith("remote:") ? "high" : "review") as
        | "high"
        | "review",
      names: [...new Set(names)].sort(),
    }));
  const collisionSummary = collisions.reduce(
    (summary, collision) => {
      summary[collision.confidence] += 1;
      return summary;
    },
    { high: 0, review: 0 },
  );
  const qualificationReviewQueue = buildQualificationReviewQueue(ranked);

  await mkdir(analysisRoot, { recursive: true });
  const outputPath = path.join(analysisRoot, "official-mcp-ranked.json");
  await writeFile(outputPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: available.source,
    sourceComplete: available.complete,
    candidateCount: ranked.length,
    warning: "Priority scores rank investigation order only. All entries remain discovered until primary-source license, usefulness, security, translation, runtime, and Web evidence pass the formal gates.",
    qualificationReviewQueuePolicy: {
      lifecycle: "discovered",
      formalQualificationAllowed: false,
      locallyRunnablePackageRequired: true,
      credentialsAllowed: false,
      maximumPerPublisher: 2,
      highConfidenceDedupeCollapsed: true,
      note: "This queue is for primary-source license and usefulness review; inclusion is not qualification or integration.",
    },
    qualificationReviewQueueCount: qualificationReviewQueue.length,
    qualificationReviewQueue,
    dedupeCollisionSummary: collisionSummary,
    dedupeCollisions: collisions,
    candidates: ranked,
  }, null, 2)}\n`, "utf8");

  console.log(`Ranked ${ranked.length} discovered candidate(s) from ${available.source}.`);
  console.log(
    `Detected ${collisions.length} collision signal(s): ${collisionSummary.high} high-confidence package/remote and ${collisionSummary.review} repository-review.`,
  );
  console.log(`Built a ${qualificationReviewQueue.length}-candidate diverse qualification review queue.`);
  console.log(`Top review candidates:`);
  for (const candidate of qualificationReviewQueue.slice(0, 15)) {
    console.log(`  ${String(candidate.priorityScore).padStart(2)}  ${candidate.name}  [${candidate.flags.join(", ")}]`);
  }
  if (!available.complete) console.warn("The source sync is incomplete; rankings will expand as more checkpoint pages arrive.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

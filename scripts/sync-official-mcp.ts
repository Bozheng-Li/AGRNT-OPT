import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type RegistryEntry = {
  server: {
    name: string;
    title?: string;
    description?: string;
    version: string;
    repository?: { url?: string; source?: string; id?: string };
    packages?: Array<Record<string, unknown>>;
    remotes?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  _meta?: Record<string, unknown>;
};

type RegistryResponse = {
  servers: RegistryEntry[];
  metadata: { nextCursor?: string; count: number };
};

type Checkpoint = {
  runId: string;
  startedAt: string;
  updatedSince: string | null;
  search: string | null;
  cursor?: string;
  pages: number;
  entryCount: number;
  completed: boolean;
};

const baseUrl = "https://registry.modelcontextprotocol.io/v0.1/servers";
const outputDirectory = path.join(process.cwd(), "var", "snapshots", "official-mcp-registry");
const inProgressDirectory = path.join(outputDirectory, "in-progress");
const pagesDirectory = path.join(inProgressDirectory, "pages");
const checkpointPath = path.join(inProgressDirectory, "checkpoint.json");
const statePath = path.join(outputDirectory, "state.json");
const candidatePath = path.join(outputDirectory, "latest-candidates.json");

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArgument(name: string): boolean {
  return process.argv.includes(name);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function atomicWrite(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function createCheckpoint(): Promise<Checkpoint> {
  const state = await readJson<{ lastSuccessfulSync?: string }>(statePath, {});
  const startedAt = new Date().toISOString();
  const checkpoint: Checkpoint = {
    runId: startedAt.replace(/[:.]/g, "-"),
    startedAt,
    updatedSince: argument("--since") ?? state.lastSuccessfulSync ?? null,
    search: argument("--search") ?? null,
    pages: 0,
    entryCount: 0,
    completed: false,
  };
  await mkdir(pagesDirectory, { recursive: true });
  await atomicWrite(checkpointPath, checkpoint);
  return checkpoint;
}

async function loadOrCreateCheckpoint(): Promise<Checkpoint> {
  if (hasArgument("--fresh") && await exists(inProgressDirectory)) {
    const resolved = path.resolve(inProgressDirectory);
    if (!resolved.startsWith(path.resolve(process.cwd(), "var") + path.sep)) {
      throw new Error(`Refusing to remove unexpected checkpoint path: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }

  if (await exists(checkpointPath)) {
    const checkpoint = await readJson<Checkpoint | null>(checkpointPath, null);
    if (!checkpoint) throw new Error("The official registry checkpoint is unreadable. Use --fresh to restart it.");
    console.log(`Resuming run ${checkpoint.runId} after ${checkpoint.pages} page(s).`);
    return checkpoint;
  }

  return createCheckpoint();
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(checkpoint: Checkpoint, pageLimit: number): Promise<RegistryResponse> {
  const url = new URL(baseUrl);
  url.searchParams.set("limit", String(pageLimit));
  if (checkpoint.cursor) url.searchParams.set("cursor", checkpoint.cursor);
  if (checkpoint.updatedSince) url.searchParams.set("updated_since", checkpoint.updatedSince);
  if (checkpoint.search) url.searchParams.set("search", checkpoint.search);

  const maxAttempts = 5;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Agent-OPT/0.1 registry-aggregator" },
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        // Retry transient registry/network failures; permanent 4xx should fail fast.
        if (response.status >= 500 || response.status === 429) {
          throw new Error(`Official MCP Registry returned ${response.status} ${response.statusText}`);
        }
        throw new Error(`Official MCP Registry returned non-retryable ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as RegistryResponse;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        !message.includes("non-retryable") &&
        (message.includes("timeout") ||
          message.includes("aborted") ||
          message.includes("fetch failed") ||
          message.includes("ECONNRESET") ||
          message.includes("ETIMEDOUT") ||
          message.includes("429") ||
          /returned 5\d\d/.test(message));

      if (!retryable || attempt === maxAttempts) break;

      const delayMs = Math.min(30_000, 1_500 * 2 ** (attempt - 1));
      console.warn(`Page fetch attempt ${attempt}/${maxAttempts} failed (${message}); retrying in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function officialMetadata(entry: RegistryEntry): { isLatest?: boolean; status?: string } {
  return (entry._meta?.["io.modelcontextprotocol.registry/official"] ?? {}) as {
    isLatest?: boolean;
    status?: string;
  };
}

async function finalize(checkpoint: Checkpoint) {
  const previous = await readJson<{ entries?: RegistryEntry[] }>(candidatePath, {});
  const latestByName = new Map((previous.entries ?? []).map((entry) => [entry.server.name, entry]));
  const pageFiles = (await readdir(pagesDirectory)).filter((file) => /^page-\d+\.json$/.test(file)).sort();

  for (const pageFile of pageFiles) {
    const page = await readJson<{ entries: RegistryEntry[] }>(path.join(pagesDirectory, pageFile), { entries: [] });
    for (const entry of page.entries) {
      const metadata = officialMetadata(entry);
      if (metadata.status === "deleted") {
        latestByName.delete(entry.server.name);
      } else if (metadata.isLatest || !latestByName.has(entry.server.name)) {
        latestByName.set(entry.server.name, entry);
      }
    }
  }

  const completedAt = new Date().toISOString();
  const candidates = [...latestByName.values()].sort((a, b) => a.server.name.localeCompare(b.server.name));
  await atomicWrite(candidatePath, {
    source: "official-mcp-registry",
    apiVersion: "v0.1",
    fetchedAt: completedAt,
    entryCount: candidates.length,
    entries: candidates,
  });

  await atomicWrite(path.join(inProgressDirectory, "manifest.json"), {
    source: "official-mcp-registry",
    apiVersion: "v0.1",
    runId: checkpoint.runId,
    startedAt: checkpoint.startedAt,
    completedAt,
    updatedSince: checkpoint.updatedSince,
    search: checkpoint.search,
    pages: checkpoint.pages,
    entryCount: checkpoint.entryCount,
    pageFiles: pageFiles.map((file) => `pages/${file}`),
  });

  const completedDirectory = path.join(outputDirectory, checkpoint.runId);
  await rename(inProgressDirectory, completedDirectory);
  await atomicWrite(statePath, {
    // Using the run start as the next watermark prevents missing updates that occurred during a long full sync.
    lastSuccessfulSync: checkpoint.startedAt,
    completedAt,
    lastRunDirectory: completedDirectory,
    latestCandidateCount: candidates.length,
  });

  console.log(`Completed ${checkpoint.pages} page(s) and ${checkpoint.entryCount} registry record(s).`);
  console.log(`Latest candidate index now contains ${candidates.length} server(s).`);
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const checkpoint = await loadOrCreateCheckpoint();
  const pageLimit = Number(argument("--limit") ?? "100");
  const maxPagesArgument = argument("--max-pages");
  const maxPagesThisInvocation = maxPagesArgument ? Number(maxPagesArgument) : Number.POSITIVE_INFINITY;

  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) {
    throw new Error("--limit must be an integer between 1 and 100.");
  }

  let pagesThisInvocation = 0;
  while (!checkpoint.completed && pagesThisInvocation < maxPagesThisInvocation) {
    const payload = await fetchPage(checkpoint, pageLimit);
    const pageNumber = checkpoint.pages + 1;
    const pageFile = `page-${String(pageNumber).padStart(6, "0")}.json`;
    await atomicWrite(path.join(pagesDirectory, pageFile), {
      fetchedAt: new Date().toISOString(),
      requestCursor: checkpoint.cursor ?? null,
      nextCursor: payload.metadata.nextCursor ?? null,
      count: payload.servers.length,
      entries: payload.servers,
    });

    checkpoint.pages = pageNumber;
    checkpoint.entryCount += payload.servers.length;
    checkpoint.cursor = payload.metadata.nextCursor;
    checkpoint.completed = !payload.metadata.nextCursor;
    await atomicWrite(checkpointPath, checkpoint);
    pagesThisInvocation += 1;
    console.log(`Checkpointed page ${checkpoint.pages}: ${payload.servers.length} entries (total ${checkpoint.entryCount}).`);
  }

  if (!checkpoint.completed) {
    console.log(`Paused after ${pagesThisInvocation} page(s). Re-run the command to resume from the saved cursor.`);
    return;
  }

  await finalize(checkpoint);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

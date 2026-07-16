export type RegistryPackage = {
  registryType?: string;
  identifier?: string;
  version?: string;
  environmentVariables?: Array<{ name?: string; isRequired?: boolean; isSecret?: boolean }>;
  packageArguments?: Array<Record<string, unknown>>;
};

export type RegistryRemote = {
  type?: string;
  url?: string;
  headers?: Array<{ name?: string; isRequired?: boolean; isSecret?: boolean }>;
};

export type DiscoveryInput = {
  name: string;
  title?: string;
  description?: string;
  version: string;
  repositoryUrl?: string;
  packages?: RegistryPackage[];
  remotes?: RegistryRemote[];
  updatedAt?: string;
  publishedAt?: string;
};

export type RankedCandidate = DiscoveryInput & {
  sourceId: "official-mcp-registry";
  lifecycle: "discovered";
  priorityScore: number;
  scoreBreakdown: Record<string, number>;
  dedupeKeys: string[];
  flags: string[];
  formalQualificationAllowed: false;
};

export type QualificationQueueOptions = {
  limit?: number;
  maxPerPublisher?: number;
  minimumScore?: number;
};

function normalizedRepository(url: string): string {
  return url.trim().toLowerCase().replace(/^git\+/, "").replace(/\.git$/, "").replace(/\/$/, "");
}

export function candidateDedupeKeys(input: DiscoveryInput): string[] {
  const keys = new Set<string>([`registry-name:${input.name.toLowerCase()}`]);
  if (input.repositoryUrl) keys.add(`repo:${normalizedRepository(input.repositoryUrl)}`);
  for (const item of input.packages ?? []) {
    if (item.registryType && item.identifier) {
      keys.add(`package:${item.registryType.toLowerCase()}:${item.identifier.toLowerCase()}`);
    }
  }
  for (const remote of input.remotes ?? []) {
    if (!remote.url) continue;
    try {
      const parsed = new URL(remote.url);
      keys.add(`remote:${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, "").toLowerCase()}`);
    } catch {
      // Invalid remote URLs are handled as a quality flag instead of becoming a dedupe key.
    }
  }
  return [...keys].sort();
}

export function rankDiscoveryCandidate(input: DiscoveryInput, now = new Date()): RankedCandidate {
  const description = input.description?.trim() ?? "";
  const packages = input.packages ?? [];
  const remotes = input.remotes ?? [];
  const flags: string[] = ["license-unverified", "runtime-unverified", "translation-pending"];
  const breakdown: Record<string, number> = {};

  breakdown.provenance = input.repositoryUrl ? 20 : 5;
  if (!input.repositoryUrl) flags.push("missing-repository");

  breakdown.description = description.length >= 120 ? 15 : description.length >= 50 ? 11 : description.length >= 20 ? 6 : 1;
  if (description.length < 20) flags.push("weak-description");

  breakdown.installability = packages.length > 0 ? 15 : remotes.length > 0 ? 12 : 0;
  if (packages.length === 0 && remotes.length === 0) flags.push("no-runnable-target");
  if (packages.length === 0 && remotes.length > 0) flags.push("remote-only");

  breakdown.identity = input.title && input.title.trim().length > 2 ? 5 : 2;
  if (!input.title) flags.push("missing-title");

  const updated = input.updatedAt ?? input.publishedAt;
  if (updated) {
    const ageDays = Math.max(0, (now.getTime() - new Date(updated).getTime()) / 86_400_000);
    breakdown.maintenance = ageDays <= 30 ? 15 : ageDays <= 90 ? 12 : ageDays <= 365 ? 7 : 2;
    if (ageDays > 365) flags.push("stale-metadata");
  } else {
    breakdown.maintenance = 2;
    flags.push("missing-update-time");
  }

  const requiredSecrets = [
    ...packages.flatMap((item) => item.environmentVariables ?? []),
    ...remotes.flatMap((item) => item.headers ?? []),
  ].filter((item) => item.isRequired && item.isSecret);
  breakdown.accessibility = requiredSecrets.length === 0 ? 10 : 4;
  if (requiredSecrets.length > 0) flags.push("credentials-required");

  const suspicious = /(?:arbitrary shell|unrestricted command|no human approval|wallet|seed phrase|private key|stealth)/i.test(description);
  breakdown.safetySignal = suspicious ? 0 : 10;
  if (suspicious) flags.push("manual-security-review-priority");

  breakdown.auditability = input.repositoryUrl && packages.length > 0 ? 10 : input.repositoryUrl ? 5 : 0;

  const testOnly = /(?:test server|example server|demo only|protocol test)/i.test(`${input.title ?? ""} ${description}`);
  const marketingHeavy = /(?:revolutionary|ultimate|world['’]?s best|game[- ]changing)/i.test(description);
  let penalty = 0;
  if (!input.repositoryUrl) penalty += 10;
  if (packages.length === 0 && remotes.length > 0) penalty += 5;
  if (testOnly) {
    penalty += 30;
    flags.push("test-or-demo");
  }
  if (marketingHeavy) {
    penalty += 8;
    flags.push("marketing-heavy");
  }
  breakdown.penalty = -penalty;

  // This score only prioritizes investigation. The explicit formalQualificationAllowed flag prevents automatic promotion.
  const rawScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const priorityScore = Math.max(0, Math.min(100, rawScore));

  return {
    ...input,
    sourceId: "official-mcp-registry",
    lifecycle: "discovered",
    priorityScore,
    scoreBreakdown: breakdown,
    dedupeKeys: candidateDedupeKeys(input),
    flags: [...new Set(flags)].sort(),
    formalQualificationAllowed: false,
  };
}

function publisherNamespace(name: string): string {
  return name.includes("/") ? name.slice(0, name.indexOf("/")).toLowerCase() : name.toLowerCase();
}

function strongestIdentityKeys(candidate: RankedCandidate): string[] {
  const packageKeys = candidate.dedupeKeys.filter((key) => key.startsWith("package:"));
  if (packageKeys.length > 0) return packageKeys;
  const remoteKeys = candidate.dedupeKeys.filter((key) => key.startsWith("remote:"));
  if (remoteKeys.length > 0) return remoteKeys;
  return candidate.dedupeKeys.filter((key) => key.startsWith("repo:"));
}

export function buildQualificationReviewQueue(
  candidates: RankedCandidate[],
  options: QualificationQueueOptions = {},
): RankedCandidate[] {
  const limit = options.limit ?? 250;
  const maxPerPublisher = options.maxPerPublisher ?? 2;
  const minimumScore = options.minimumScore ?? 60;
  const excludedFlags = new Set([
    "credentials-required",
    "manual-security-review-priority",
    "missing-repository",
    "no-runnable-target",
    "remote-only",
    "test-or-demo",
  ]);
  const publisherCounts = new Map<string, number>();
  const selectedIdentityKeys = new Set<string>();
  const selected: RankedCandidate[] = [];

  for (const candidate of [...candidates].sort(
    (a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name),
  )) {
    if (selected.length >= limit) break;
    if (candidate.priorityScore < minimumScore || (candidate.packages?.length ?? 0) === 0) continue;
    if (candidate.flags.some((flag) => excludedFlags.has(flag))) continue;

    const publisher = publisherNamespace(candidate.name);
    if ((publisherCounts.get(publisher) ?? 0) >= maxPerPublisher) continue;

    const identityKeys = strongestIdentityKeys(candidate);
    if (identityKeys.some((key) => selectedIdentityKeys.has(key))) continue;

    selected.push(candidate);
    publisherCounts.set(publisher, (publisherCounts.get(publisher) ?? 0) + 1);
    for (const key of identityKeys) selectedIdentityKeys.add(key);
  }

  return selected;
}

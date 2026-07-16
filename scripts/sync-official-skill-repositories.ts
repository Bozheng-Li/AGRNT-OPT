import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { detectLicenseIdentifier, parseSkillDocument, scanSkillRisk } from "../src/lib/discovery/skill";

const execFileAsync = promisify(execFile);
const cacheRoot = path.join(process.cwd(), "var", "source-repos");
const outputRoot = path.join(process.cwd(), "var", "snapshots", "official-skill-repositories");
const statePath = path.join(outputRoot, "state.json");
const combinedPath = path.join(outputRoot, "latest-candidates.json");

type SourceDefinition = {
  id: string;
  repository: string;
  include(path: string): boolean;
  licenseCaveat: string;
};

type SourceState = Record<string, { sha: string; snapshot: string; syncedAt: string; schemaVersion?: number }>;
const snapshotSchemaVersion = 3;

const sources: SourceDefinition[] = [
  {
    id: "openai-codex-plugins",
    repository: "https://github.com/openai/plugins.git",
    include: (filePath) => /^plugins\/[^/]+\/skills\/.+\/SKILL\.md$/i.test(filePath),
    licenseCaveat: "Use the nearest skill or plugin license evidence; do not infer every skill license from repository ownership.",
  },
  {
    id: "anthropic-agent-skills",
    repository: "https://github.com/anthropics/skills.git",
    include: (filePath) => /^skills\/[^/]+\/SKILL\.md$/i.test(filePath),
    licenseCaveat: "The repository has mixed licensing; document skills may be source-available rather than open source.",
  },
];

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

async function git(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout: 180_000,
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024,
  });
  return stdout.trim();
}

async function updateRepository(source: SourceDefinition): Promise<{ directory: string; sha: string; files: string[]; blobShas: Map<string, string> }> {
  const directory = path.join(cacheRoot, source.id);
  if (!await exists(path.join(directory, ".git"))) {
    await mkdir(cacheRoot, { recursive: true });
    await git(["clone", "--depth", "1", "--filter=blob:none", "--branch", "main", source.repository, directory]);
  } else {
    const localSha = await git(["rev-parse", "HEAD"], directory);
    const remoteLine = await git(["ls-remote", source.repository, "refs/heads/main"]);
    const remoteSha = remoteLine.split(/\s+/)[0];
    if (remoteSha && remoteSha !== localSha) await git(["pull", "--ff-only", "origin", "main"], directory);
  }
  const sha = await git(["rev-parse", "HEAD"], directory);
  const stagedFiles = (await git(["ls-files", "--stage"], directory)).split(/\r?\n/).filter(Boolean);
  const blobShas = new Map<string, string>();
  for (const line of stagedFiles) {
    const match = line.match(/^\d+\s+([a-f0-9]{40,64})\s+\d+\t(.+)$/i);
    if (match) blobShas.set(match[2], match[1]);
  }
  const files = [...blobShas.keys()];
  return { directory, sha, files, blobShas };
}

async function nearestLicense(directory: string, skillDirectory: string, trackedFiles: Set<string>) {
  const names = ["LICENSE.txt", "LICENSE", "LICENSE.md", "license.txt", "license.md"];
  const pluginDirectory = skillDirectory.includes("/skills/") ? skillDirectory.slice(0, skillDirectory.indexOf("/skills/")) : undefined;
  const candidates = [
    ...names.map((name) => path.posix.join(skillDirectory, name)),
    ...(pluginDirectory ? names.map((name) => path.posix.join(pluginDirectory, name)) : []),
    ...names,
  ];
  for (const candidate of candidates) {
    if (!trackedFiles.has(candidate)) continue;
    const content = await readFile(path.join(directory, ...candidate.split("/")), "utf8");
    return { path: candidate, content, identifier: detectLicenseIdentifier(content) };
  }
  return null;
}

async function declaredPluginLicense(directory: string, skillDirectory: string, trackedFiles: Set<string>) {
  if (!skillDirectory.includes("/skills/")) return null;
  const pluginDirectory = skillDirectory.slice(0, skillDirectory.indexOf("/skills/"));
  const manifestPath = path.posix.join(pluginDirectory, ".codex-plugin", "plugin.json");
  if (!trackedFiles.has(manifestPath)) return null;
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, ...manifestPath.split("/")), "utf8")) as { license?: unknown };
    const identifier = typeof manifest.license === "string" && manifest.license.trim() ? manifest.license.trim() : undefined;
    return identifier ? { path: manifestPath, identifier } : null;
  } catch {
    return null;
  }
}

async function synchronizeSource(source: SourceDefinition) {
  const repository = await updateRepository(source);
  const trackedFiles = new Set(repository.files);
  const skillPaths = repository.files.filter(source.include).sort();
  const candidates = [];

  for (const skillPath of skillPaths) {
    const skillDirectory = path.posix.dirname(skillPath);
    const content = await readFile(path.join(repository.directory, ...skillPath.split("/")), "utf8");
    const parsed = parseSkillDocument(content);
    const directoryFiles = repository.files.filter((item) => item.startsWith(`${skillDirectory}/`));
    const licenseFile = await nearestLicense(repository.directory, skillDirectory, trackedFiles);
    const declaredLicense = await declaredPluginLicense(repository.directory, skillDirectory, trackedFiles);
    const licenseIdentifier = licenseFile?.identifier ?? declaredLicense?.identifier;
    const flags = ["translation-pending", "runtime-unverified", "web-adaptation-pending"];
    if (!parsed.name) flags.push("missing-name");
    if (!parsed.description) flags.push("missing-description");
    if (parsed.frontmatter._parseError) flags.push("frontmatter-parse-error");
    if (!licenseIdentifier) flags.push("license-unverified");
    if (!licenseFile && declaredLicense) flags.push("license-text-missing");
    if (
      licenseIdentifier?.startsWith("LicenseRef-") ||
      licenseIdentifier === "Proprietary" ||
      licenseIdentifier === "UNLICENSED"
    ) {
      flags.push("license-requires-manual-review");
      flags.push("redistribution-not-assumed");
    }
    flags.push(...scanSkillRisk(content, directoryFiles.map((item) => item.slice(skillDirectory.length + 1))));
    const contentSha = repository.blobShas.get(skillPath);
    if (!contentSha) throw new Error(`Missing Git blob SHA for ${skillPath}`);

    candidates.push({
      id: `${source.id}:${skillDirectory}`,
      sourceId: source.id,
      lifecycle: "discovered",
      repository: source.repository.replace(/\.git$/, ""),
      sourceCommit: repository.sha,
      path: skillPath,
      directory: skillDirectory,
      contentSha,
      dedupeKeys: [
        `skill-name:${(parsed.name ?? path.posix.basename(skillDirectory)).toLowerCase()}`,
        `content-sha:${contentSha}`,
      ],
      name: parsed.name ?? path.posix.basename(skillDirectory),
      description: parsed.description ?? "",
      frontmatter: parsed.frontmatter,
      originalContent: content,
      supportingFiles: directoryFiles,
      license: licenseFile
        ? { path: licenseFile.path, identifier: licenseIdentifier, originalText: licenseFile.content, evidenceKind: "license-file" }
        : declaredLicense
          ? { path: declaredLicense.path, identifier: licenseIdentifier, originalText: null, evidenceKind: "plugin-manifest-declaration" }
          : null,
      licenseCaveat: source.licenseCaveat,
      flags: [...new Set(flags)].sort(),
      formalQualificationAllowed: false,
    });
  }

  return { source, repository, candidates };
}

async function main() {
  await mkdir(outputRoot, { recursive: true });
  const state = await readJson<SourceState>(statePath, {});
  const allCandidates: unknown[] = [];

  for (const source of sources) {
    const result = await synchronizeSource(source);
    const previous = state[source.id];
    if (previous?.sha === result.repository.sha && previous.schemaVersion === snapshotSchemaVersion) {
      const cached = await readJson<{ candidates?: unknown[] }>(previous.snapshot, {});
      if (cached.candidates) {
        allCandidates.push(...cached.candidates);
        console.log(`${source.id}: unchanged at ${result.repository.sha.slice(0, 12)}; reused ${cached.candidates.length} skills.`);
        continue;
      }
    }

    const syncedAt = new Date().toISOString();
    const snapshotPath = path.join(outputRoot, `${source.id}-${result.repository.sha}.json`);
    await writeFile(snapshotPath, `${JSON.stringify({
      sourceId: source.id,
      schemaVersion: snapshotSchemaVersion,
      repository: source.repository,
      sourceCommit: result.repository.sha,
      syncedAt,
      candidateCount: result.candidates.length,
      candidates: result.candidates,
    }, null, 2)}\n`, "utf8");
    state[source.id] = { sha: result.repository.sha, snapshot: snapshotPath, syncedAt, schemaVersion: snapshotSchemaVersion };
    allCandidates.push(...result.candidates);
    console.log(`${source.id}: synchronized ${result.candidates.length} skill documents at ${result.repository.sha.slice(0, 12)}.`);
  }

  const typedCandidates = allCandidates as Array<{ id: string; name: string; contentSha: string; sourceId: string; path: string }>;
  const nameGroups = new Map<string, typeof typedCandidates>();
  const contentGroups = new Map<string, typeof typedCandidates>();
  for (const candidate of typedCandidates) {
    const nameGroup = nameGroups.get(candidate.name.toLowerCase()) ?? [];
    nameGroup.push(candidate);
    nameGroups.set(candidate.name.toLowerCase(), nameGroup);
    const contentGroup = contentGroups.get(candidate.contentSha) ?? [];
    contentGroup.push(candidate);
    contentGroups.set(candidate.contentSha, contentGroup);
  }
  const dedupeCollisions = {
    sameName: [...nameGroups.entries()].filter(([, items]) => items.length > 1).map(([key, items]) => ({ key, items: items.map(({ id, sourceId, path }) => ({ id, sourceId, path })) })),
    identicalContent: [...contentGroups.entries()].filter(([, items]) => items.length > 1).map(([key, items]) => ({ key, items: items.map(({ id, sourceId, path }) => ({ id, sourceId, path })) })),
  };

  await writeFile(combinedPath, `${JSON.stringify({
    schemaVersion: snapshotSchemaVersion,
    generatedAt: new Date().toISOString(),
    candidateCount: allCandidates.length,
    warning: "Original content is preserved for evaluation. Formal inclusion still requires Chinese translation, capability/usefulness review, license resolution, security review, runtime or workflow adaptation, dedicated Web UX, and applicable real tests.",
    dedupeCollisions,
    candidates: allCandidates,
  }, null, 2)}\n`, "utf8");
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  console.log(`Combined official skill index: ${allCandidates.length} discovered skills.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

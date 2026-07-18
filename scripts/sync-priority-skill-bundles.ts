import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

type SkillManifest = {
  slug: string;
  source: {
    primaryUrl: string;
    marketplaces: Array<{ sourceId: string }>;
  };
};

const workspace = process.cwd();
const checkOnly = process.argv.includes("--check");
const curation = JSON.parse(readFileSync(path.join(workspace, "catalog", "curation.json"), "utf8")) as {
  prioritySkillSlugs: string[];
};
const sourceRoots: Record<string, string> = {
  "openai-codex-plugins": path.join(workspace, "var", "source-repos", "openai-codex-plugins"),
  "anthropic-agent-skills": path.join(workspace, "var", "source-repos", "anthropic-agent-skills"),
};

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function repositoryHead(repository: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
}

function parsePinnedPath(primaryUrl: string): { commit: string; sourcePath: string } {
  const parts = new URL(primaryUrl).pathname.split("/").filter(Boolean);
  const marker = parts.findIndex((part) => part === "tree" || part === "blob");
  if (marker < 0 || !parts[marker + 1] || !parts[marker + 2]) {
    throw new Error(`Cannot parse pinned repository path: ${primaryUrl}`);
  }
  const commit = parts[marker + 1]!;
  const joined = parts.slice(marker + 2).map(decodeURIComponent).join("/");
  return { commit, sourcePath: parts[marker] === "blob" ? path.posix.dirname(joined) : joined };
}

function trackedFiles(repository: string, sourcePath: string): string[] {
  const output = execFileSync("git", ["ls-files", "-z", "--", sourcePath], {
    cwd: repository,
    encoding: "buffer",
  });
  const prefix = `${sourcePath.replace(/\\/g, "/").replace(/\/$/, "")}/`;
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length))
    .filter((file) => file !== "SKILL.md")
    .sort();
}

const summaries: Array<{ slug: string; sourceId: string; copied: number; verified: number }> = [];
for (const slug of curation.prioritySkillSlugs) {
  const manifestPath = path.join(workspace, "catalog", "plugins", `${slug}.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as SkillManifest;
  const sourceId = manifest.source.marketplaces[0]?.sourceId;
  const repository = sourceRoots[sourceId];
  if (!repository || !existsSync(repository)) throw new Error(`${slug}: unsupported or missing source repository ${sourceId}`);
  const pinned = parsePinnedPath(manifest.source.primaryUrl);
  const head = repositoryHead(repository);
  if (head !== pinned.commit) throw new Error(`${slug}: source checkout ${head} differs from pinned commit ${pinned.commit}`);

  const sourceDirectory = path.resolve(repository, ...pinned.sourcePath.split("/"));
  const targetDirectory = path.resolve(workspace, "catalog", "skill-bodies", slug);
  const allowedTargetRoot = path.resolve(workspace, "catalog", "skill-bodies") + path.sep;
  if (!targetDirectory.startsWith(allowedTargetRoot)) throw new Error(`${slug}: target escaped catalog/skill-bodies`);
  if (!existsSync(path.join(sourceDirectory, "SKILL.md"))) throw new Error(`${slug}: pinned source has no SKILL.md`);
  if (sha256(path.join(sourceDirectory, "SKILL.md")) !== sha256(path.join(targetDirectory, "SKILL.md"))) {
    throw new Error(`${slug}: curated SKILL.md no longer matches the pinned source`);
  }

  const files = trackedFiles(repository, pinned.sourcePath);
  let copied = 0;
  const evidence: Array<{ path: string; sha256: string }> = [];
  for (const relative of files) {
    if (relative === "SKILL.zh-CN.md" || relative === "BUNDLE.json") continue;
    const source = path.resolve(sourceDirectory, ...relative.split("/"));
    const target = path.resolve(targetDirectory, ...relative.split("/"));
    if (!source.startsWith(sourceDirectory + path.sep) || !target.startsWith(targetDirectory + path.sep)) {
      throw new Error(`${slug}: unsafe supporting path ${relative}`);
    }
    if (lstatSync(source).isSymbolicLink()) throw new Error(`${slug}: symbolic-link source is not allowed: ${relative}`);
    if (!lstatSync(source).isFile()) continue;
    if (!checkOnly) {
      mkdirSync(path.dirname(target), { recursive: true });
      if (!existsSync(target) || sha256(target) !== sha256(source)) {
        copyFileSync(source, target);
        copied += 1;
      }
    }
    if (!existsSync(target) || sha256(target) !== sha256(source)) {
      throw new Error(`${slug}: supporting file mismatch after sync: ${relative}`);
    }
    evidence.push({ path: relative.replace(/\\/g, "/"), sha256: sha256(source) });
  }

  const bundlePath = path.join(targetDirectory, "BUNDLE.json");
  const bundle = {
    schemaVersion: 1,
    slug,
    sourceId,
    sourceCommit: pinned.commit,
    sourcePath: pinned.sourcePath,
    skillSha256: sha256(path.join(sourceDirectory, "SKILL.md")),
    supportingFiles: evidence,
  };
  if (!checkOnly) writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  if (!existsSync(bundlePath)) throw new Error(`${slug}: BUNDLE.json is missing`);
  const recorded = JSON.parse(readFileSync(bundlePath, "utf8"));
  if (JSON.stringify(recorded) !== JSON.stringify(bundle)) throw new Error(`${slug}: BUNDLE.json does not match pinned files`);
  summaries.push({ slug, sourceId, copied, verified: evidence.length });
}

console.log(JSON.stringify({ mode: checkOnly ? "check" : "sync", count: summaries.length, summaries }, null, 2));

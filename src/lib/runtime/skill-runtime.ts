import { readFile, readdir, access, lstat } from "node:fs/promises";
import path from "node:path";
import { parseSkillDocument } from "@/lib/discovery/skill";
import { InvocationValidationError } from "./errors";

export type SkillBodyIndex = {
  slug: string;
  root: string;
  skillPath: string;
  translationPath?: string;
  licensePath?: string;
  supportingPaths: string[];
};

export type SkillLocale = "original" | "zh-CN";

export type SkillBundleFile = {
  path: string;
  sha256: string;
  bytes: number;
};

function skillBodiesRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "catalog", "skill-bodies");
}

export function skillBodyRoot(slug: string): string {
  return path.join(/* turbopackIgnore: true */ skillBodiesRoot(), slug);
}

export async function loadSkillIndex(slug: string): Promise<SkillBodyIndex> {
  const root = skillBodyRoot(slug);
  const skillPath = path.join(/* turbopackIgnore: true */ root, "SKILL.md");
  try {
    await access(skillPath);
  } catch {
    throw new InvocationValidationError(`Skill 正文尚未入库：${slug}。请检查 catalog/skill-bodies/${slug}/SKILL.md。`);
  }

  const entries = await readdir(root, { withFileTypes: true });
  const supportingPaths = entries
    .filter((entry) => entry.isFile() && entry.name !== "SKILL.md")
    .map((entry) => entry.name)
    .sort();
  const licensePath = supportingPaths.find((name) => /^license(\.txt|\.md)?$/i.test(name));
  const translationName = supportingPaths.find((name) => name === "SKILL.zh-CN.md");

  return {
    slug,
    root,
    skillPath,
    translationPath: translationName ? path.join(/* turbopackIgnore: true */ root, translationName) : undefined,
    licensePath: licensePath ? path.join(/* turbopackIgnore: true */ root, licensePath) : undefined,
    supportingPaths,
  };
}

export async function readSkillDocument(slug: string, locale: SkillLocale = "original") {
  const index = await loadSkillIndex(slug);
  if (locale === "zh-CN" && !index.translationPath) {
    throw new InvocationValidationError(`Skill 简体中文正文尚未完成：${slug}/SKILL.zh-CN.md。`);
  }
  const documentPath = locale === "zh-CN" ? index.translationPath! : index.skillPath;
  const raw = await readFile(/* turbopackIgnore: true */ documentPath, "utf8");
  if (raw.length > 400_000) {
    throw new InvocationValidationError("Skill 文档超过 400KB 安全上限。");
  }
  const parsed = parseSkillDocument(raw);
  const sections = splitMarkdownSections(parsed.body);
  return {
    index,
    locale,
    documentPath,
    raw,
    parsed,
    sections,
  };
}

export async function loadSkillBundle(slug: string): Promise<{
  sourceId: string;
  sourceCommit: string;
  sourcePath: string;
  supportingFiles: SkillBundleFile[];
}> {
  const index = await loadSkillIndex(slug);
  const bundlePath = path.join(index.root, "BUNDLE.json");
  let raw: string;
  try {
    raw = await readFile(/* turbopackIgnore: true */ bundlePath, "utf8");
  } catch {
    throw new InvocationValidationError(`Skill 支持文件清单尚未入库：${slug}/BUNDLE.json。`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvocationValidationError(`Skill 支持文件清单无效：${slug}/BUNDLE.json。`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvocationValidationError("Skill 支持文件清单必须是 JSON 对象。");
  }
  const record = parsed as Record<string, unknown>;
  const sourceId = typeof record.sourceId === "string" ? record.sourceId : "";
  const sourceCommit = typeof record.sourceCommit === "string" ? record.sourceCommit : "";
  const sourcePath = typeof record.sourcePath === "string" ? record.sourcePath : "";
  if (!sourceId || !/^[a-f0-9]{40}$/.test(sourceCommit) || !sourcePath) {
    throw new InvocationValidationError("Skill 支持文件清单缺少固定来源信息。");
  }
  if (!Array.isArray(record.supportingFiles)) {
    throw new InvocationValidationError("Skill 支持文件清单缺少 supportingFiles。");
  }
  const supportingFiles: SkillBundleFile[] = [];
  for (const item of record.supportingFiles) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new InvocationValidationError("Skill supportingFiles 条目无效。");
    }
    const candidate = item as Record<string, unknown>;
    const relative = typeof candidate.path === "string" ? candidate.path : "";
    const sha256 = typeof candidate.sha256 === "string" ? candidate.sha256 : "";
    if (!relative || relative.includes("\\") || relative.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
      throw new InvocationValidationError(`Skill 支持文件路径不安全：${relative || "(empty)"}`);
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new InvocationValidationError(`Skill 支持文件哈希无效：${relative}`);
    const resolved = path.resolve(/* turbopackIgnore: true */ index.root, ...relative.split("/"));
    const rootPrefix = index.root.endsWith(path.sep) ? index.root : `${index.root}${path.sep}`;
    if (!resolved.startsWith(rootPrefix)) {
      throw new InvocationValidationError(`Skill 支持文件越界：${relative}`);
    }
    const stats = await lstat(resolved).catch(() => null);
    if (!stats?.isFile() || stats.isSymbolicLink()) {
      throw new InvocationValidationError(`Skill 支持文件缺失或类型不安全：${relative}`);
    }
    supportingFiles.push({ path: relative, sha256, bytes: stats.size });
  }
  return { sourceId, sourceCommit, sourcePath, supportingFiles };
}

export async function readSkillAsset(slug: string, relativePath: string): Promise<{
  path: string;
  content: string;
  bytes: number;
  sha256: string;
}> {
  const index = await loadSkillIndex(slug);
  const bundle = await loadSkillBundle(slug);
  const entry = bundle.supportingFiles.find((candidate) => candidate.path === relativePath);
  if (!entry) throw new InvocationValidationError(`支持文件不在固定清单中：${relativePath}`);
  if (entry.bytes > 400_000) throw new InvocationValidationError(`支持文件超过 400KB 文本预览上限：${relativePath}`);
  if (
    !/\.(?:md|mdx|txt|json|ya?ml|toml|csv|ts|tsx|js|jsx|mjs|cjs|py|sh|ps1|css|html|svg)$/i.test(relativePath) &&
    !/(^|\/)(?:license|notice|readme)$/i.test(relativePath)
  ) {
    throw new InvocationValidationError(`当前 Web 只预览安全文本支持文件：${relativePath}`);
  }
  const resolved = path.resolve(/* turbopackIgnore: true */ index.root, ...relativePath.split("/"));
  const content = await readFile(/* turbopackIgnore: true */ resolved, "utf8");
  if (content.includes("\0")) throw new InvocationValidationError(`支持文件不是安全 UTF-8 文本：${relativePath}`);
  return { path: relativePath, content, bytes: entry.bytes, sha256: entry.sha256 };
}

export type SkillSection = {
  id: string;
  level: number;
  title: string;
  content: string;
  start: number;
  end: number;
};

export function splitMarkdownSections(body: string): SkillSection[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const headings: Array<{ level: number; title: string; line: number }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(#{1,3})\s+(.+?)\s*$/.exec(lines[i] ?? "");
    if (match) headings.push({ level: match[1].length, title: match[2].trim(), line: i });
  }

  if (headings.length === 0) {
    return [
      {
        id: "body",
        level: 1,
        title: "正文",
        content: body.trim(),
        start: 0,
        end: body.length,
      },
    ];
  }

  const sections: SkillSection[] = [];
  const usedIds = new Set<string>();
  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i]!;
    const next = headings[i + 1];
    const startLine = current.line;
    const endLine = next ? next.line : lines.length;
    const chunk = lines.slice(startLine, endLine).join("\n").trim();
    const baseId = slugifyHeading(current.title, i);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    sections.push({
      id,
      level: current.level,
      title: current.title,
      content: chunk,
      start: startLine,
      end: endLine,
    });
  }
  return sections;
}

function slugifyHeading(title: string, index: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || `section-${index + 1}`;
}

export function searchSkillText(raw: string, query: string, limit = 12): Array<{ line: number; excerpt: string }> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) throw new InvocationValidationError("搜索关键词不能为空。");
  if (normalized.length > 120) throw new InvocationValidationError("搜索关键词过长。");

  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const hits: Array<{ line: number; excerpt: string }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.toLowerCase().includes(normalized)) continue;
    hits.push({
      line: i + 1,
      excerpt: line.trim().slice(0, 280),
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export type SkillPlaybookMode = "agent-prompt" | "checklist" | "reference-pack";

export type SkillPlaybookSection = {
  id: string;
  title: string;
  level: number;
  score: number;
  content: string;
};

export type SkillPlaybook = {
  slug: string;
  skillName: string;
  objective: string;
  context: string;
  locale: SkillLocale;
  mode: SkillPlaybookMode;
  selectedSectionCount: number;
  sections: SkillPlaybookSection[];
  checklist: string[];
  prompt: string;
};

const playbookStopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "use",
  "with",
  "you",
  "your",
]);

function playbookTokens(value: string): string[] {
  return [...new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9+.#/-]{1,48}|[\u3400-\u9fff]{2,12}/g)
      ?.filter((token) => !playbookStopWords.has(token)) ?? [],
  )].slice(0, 80);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let offset = 0;
  while (count < 8) {
    const next = haystack.indexOf(needle, offset);
    if (next < 0) break;
    count += 1;
    offset = next + needle.length;
  }
  return count;
}

function extractChecklist(sections: SkillPlaybookSection[]): string[] {
  const checklist: string[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    for (const line of section.content.split(/\r?\n/)) {
      const match = /^\s*(?:[-*+] |\d+[.)]\s+)(.+)$/.exec(line);
      if (!match) continue;
      const item = match[1]
        .replace(/^\[[ xX]\]\s*/, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 280);
      const key = item.toLowerCase();
      if (!item || seen.has(key)) continue;
      seen.add(key);
      checklist.push(item);
      if (checklist.length >= 24) return checklist;
    }
  }
  if (checklist.length > 0) return checklist;
  return sections.map((section) => `阅读并应用“${section.title}”中的约束与步骤。`).slice(0, 12);
}

export async function buildSkillPlaybook(
  slug: string,
  input: {
    objective: string;
    context?: string;
    mode?: SkillPlaybookMode;
    sectionLimit?: number;
    locale?: SkillLocale;
  },
): Promise<SkillPlaybook> {
  const locale = input.locale ?? "original";
  const doc = await readSkillDocument(slug, locale);
  const objective = input.objective.trim();
  const context = input.context?.trim() ?? "";
  const mode = input.mode ?? "agent-prompt";
  const sectionLimit = Math.min(8, Math.max(1, input.sectionLimit ?? 4));
  const tokens = playbookTokens(`${objective}\n${context}`);

  const ranked = doc.sections
    .map((section, index) => {
      const title = section.title.toLowerCase();
      const content = section.content.toLowerCase();
      const tokenScore = tokens.reduce(
        (score, token) => score + countOccurrences(title, token) * 8 + countOccurrences(content, token),
        0,
      );
      const structuralScore = Math.max(0, 3 - index / Math.max(1, doc.sections.length));
      return { section, index, score: Number((tokenScore + structuralScore).toFixed(2)) };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, sectionLimit)
    .sort((left, right) => left.index - right.index)
    .map<SkillPlaybookSection>(({ section, score }) => ({
      id: section.id,
      title: section.title,
      level: section.level,
      score,
      content: section.content.slice(0, 24_000),
    }));

  const checklist = extractChecklist(ranked);
  const skillName = doc.parsed.name ?? slug;
  const referenceText = ranked
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n")
    .slice(0, 120_000);
  const contextBlock = context ? `\n补充上下文：\n${context}\n` : "";
  const modeInstruction =
    mode === "checklist"
      ? `请逐项执行并在每项后说明完成证据：\n${checklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
      : mode === "reference-pack"
        ? "请仅依据下面的官方 Skill 参考章节完成任务；遇到资料未覆盖的内容要明确说明。"
        : "请把下面的官方 Skill 指南作为系统级工作约束，先确认目标与风险，再完成任务并给出可验证结果。";
  const prompt = [
    `你正在应用 Agent Skill：${skillName}（${slug}）。`,
    `用户目标：\n${objective}`,
    contextBlock.trim(),
    modeInstruction,
    "官方 Skill 相关章节：",
    referenceText,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 160_000);

  return {
    slug,
    skillName,
    objective,
    context,
    locale,
    mode,
    selectedSectionCount: ranked.length,
    sections: ranked,
    checklist,
    prompt,
  };
}

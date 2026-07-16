import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { parseSkillDocument } from "@/lib/discovery/skill";
import { InvocationValidationError } from "./errors";

export type SkillBodyIndex = {
  slug: string;
  root: string;
  skillPath: string;
  licensePath?: string;
  supportingPaths: string[];
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

  return {
    slug,
    root,
    skillPath,
    licensePath: licensePath ? path.join(/* turbopackIgnore: true */ root, licensePath) : undefined,
    supportingPaths,
  };
}

export async function readSkillDocument(slug: string) {
  const index = await loadSkillIndex(slug);
  const raw = await readFile(/* turbopackIgnore: true */ index.skillPath, "utf8");
  if (raw.length > 400_000) {
    throw new InvocationValidationError("Skill 文档超过 400KB 安全上限。");
  }
  const parsed = parseSkillDocument(raw);
  const sections = splitMarkdownSections(parsed.body);
  return {
    index,
    raw,
    parsed,
    sections,
  };
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
  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i]!;
    const next = headings[i + 1];
    const startLine = current.line;
    const endLine = next ? next.line : lines.length;
    const chunk = lines.slice(startLine, endLine).join("\n").trim();
    sections.push({
      id: slugifyHeading(current.title, i),
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

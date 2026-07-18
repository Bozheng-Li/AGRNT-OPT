import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSkillDocument } from "../src/lib/discovery/skill";

const workspace = process.cwd();
const curation = JSON.parse(readFileSync(path.join(workspace, "catalog", "curation.json"), "utf8")) as {
  prioritySkillSlugs: string[];
};

function matches(value: string, pattern: RegExp): string[] {
  return [...value.matchAll(pattern)].map((match) => match[0]);
}

function destinations(value: string): string[] {
  return [...value.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]!).sort();
}

function headingLevels(value: string): string[] {
  return [...value.matchAll(/^(#{1,6})\s+\S.*$/gm)].map((match) => match[1]!);
}

function urls(value: string): string[] {
  return [...value.matchAll(/https?:\/\/[^\s`<>"，。）]+/g)]
    .map((match) => match[0].replace(/[),.;:]+$/, ""))
    .sort();
}

const failures: string[] = [];
const summaries: Array<{ slug: string; originalChars: number; translatedChars: number; headings: number; codeBlocks: number }> = [];
for (const slug of curation.prioritySkillSlugs) {
  const root = path.join(workspace, "catalog", "skill-bodies", slug);
  const original = readFileSync(path.join(root, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  let translated = "";
  try {
    translated = readFileSync(path.join(root, "SKILL.zh-CN.md"), "utf8").replace(/\r\n/g, "\n");
  } catch {
    failures.push(`${slug}: SKILL.zh-CN.md is missing`);
    continue;
  }
  const originalParsed = parseSkillDocument(original);
  const translatedParsed = parseSkillDocument(translated);
  if (!translatedParsed.name || translatedParsed.name !== originalParsed.name) {
    failures.push(`${slug}: frontmatter name changed or is missing`);
  }
  if (!translatedParsed.description || !/[\u3400-\u9fff]/.test(translatedParsed.description)) {
    failures.push(`${slug}: frontmatter description is not translated to Chinese`);
  }
  if (!/[\u3400-\u9fff]/.test(translatedParsed.body)) failures.push(`${slug}: translated body has no Chinese text`);
  if (/[�]|(?:锛|鈥|銆|绔|妫|鎶|鍔|璇|鏁){3,}/.test(translated)) failures.push(`${slug}: possible mojibake detected`);
  if (translated.length < original.length * 0.35) failures.push(`${slug}: translated body is suspiciously short`);

  const originalBlocks = matches(original, /```[^\n]*\n[\s\S]*?```/g);
  const translatedBlocks = matches(translated, /```[^\n]*\n[\s\S]*?```/g);
  if (JSON.stringify(translatedBlocks) !== JSON.stringify(originalBlocks)) {
    failures.push(`${slug}: fenced code blocks changed`);
  }
  const originalInline = matches(original.replace(/```[^\n]*\n[\s\S]*?```/g, ""), /(?<!`)`[^`\n]+`(?!`)/g).sort();
  const translatedInline = matches(translated.replace(/```[^\n]*\n[\s\S]*?```/g, ""), /(?<!`)`[^`\n]+`(?!`)/g).sort();
  if (JSON.stringify(translatedInline) !== JSON.stringify(originalInline)) {
    failures.push(`${slug}: inline-code tokens changed`);
  }
  if (JSON.stringify(destinations(translated)) !== JSON.stringify(destinations(original))) {
    failures.push(`${slug}: Markdown link destinations changed`);
  }
  const originalUrls = urls(original);
  const translatedUrls = urls(translated);
  if (JSON.stringify(translatedUrls) !== JSON.stringify(originalUrls)) failures.push(`${slug}: raw URLs changed`);
  const originalHeadings = headingLevels(originalParsed.body);
  const translatedHeadings = headingLevels(translatedParsed.body);
  if (JSON.stringify(translatedHeadings) !== JSON.stringify(originalHeadings)) {
    failures.push(`${slug}: heading hierarchy changed`);
  }
  summaries.push({
    slug,
    originalChars: original.length,
    translatedChars: translated.length,
    headings: translatedHeadings.length,
    codeBlocks: translatedBlocks.length,
  });
}

console.log(JSON.stringify({ count: summaries.length, failures, summaries }, null, 2));
if (failures.length > 0) process.exitCode = 1;

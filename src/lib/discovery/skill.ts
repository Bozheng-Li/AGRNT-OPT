import { parse as parseYaml } from "yaml";

export type ParsedSkill = {
  frontmatter: Record<string, unknown>;
  body: string;
  name?: string;
  description?: string;
};

export function parseSkillDocument(content: string): ParsedSkill {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: {}, body: normalized };
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) return { frontmatter: {}, body: normalized };

  const rawFrontmatter = normalized.slice(4, end);
  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(rawFrontmatter);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) frontmatter = parsed as Record<string, unknown>;
  } catch {
    frontmatter = { _parseError: true };
  }

  return {
    frontmatter,
    body: normalized.slice(end + 5).trimStart(),
    name: typeof frontmatter.name === "string" ? frontmatter.name.trim() : undefined,
    description: typeof frontmatter.description === "string" ? frontmatter.description.trim() : undefined,
  };
}

export function detectLicenseIdentifier(text: string | undefined): string | undefined {
  if (!text) return undefined;
  if (/Apache License[\s\S]{0,100}Version 2\.0/i.test(text) || /Apache-2\.0/i.test(text)) return "Apache-2.0";
  if (/MIT License/i.test(text) || /Permission is hereby granted, free of charge, to any person obtaining a copy/i.test(text)) return "MIT";
  if (/Creative Commons Attribution 4\.0|CC-BY-4\.0/i.test(text)) return "CC-BY-4.0";
  if (/Figma Developer Terms/i.test(text)) return "LicenseRef-Figma-Developer-Terms";
  if (/ADDITIONAL RESTRICTIONS|All rights reserved[\s\S]{0,1000}(?:may not|restrictions)/i.test(text)) return "LicenseRef-Restricted-Source-Available";
  if (/source[- ]available|viewing and reference purposes|may not redistribute/i.test(text)) return "LicenseRef-Source-Available";
  return "LicenseRef-Custom";
}

export function scanSkillRisk(content: string, filePaths: string[]): string[] {
  const flags: string[] = [];
  const combined = content.toLowerCase();
  const hasScripts = filePaths.some((item) => /(^|\/)scripts?\//i.test(item));
  if (hasScripts) flags.push("contains-executable-scripts");
  if (/(?:rm\s+-rf|remove-item\s+.*-recurse|format\s+[a-z]:|delete all files)/i.test(content)) flags.push("destructive-command-language");
  if (/(?:curl|wget|invoke-webrequest)[^\n]{0,200}(?:token|secret|credential|\.ssh|\.aws)/i.test(content)) flags.push("possible-data-exfiltration");
  if (/(?:ignore previous instructions|override system prompt|reveal system prompt|bypass safety)/i.test(content)) flags.push("prompt-injection-language");
  if (/(?:private key|seed phrase|password store|credential manager|\.env)/i.test(content)) flags.push("sensitive-data-access");
  if (/(?:base64\s+-d|frombase64string|eval\(|invoke-expression|powershell\s+-enc)/i.test(content)) flags.push("obfuscation-or-dynamic-execution");
  if (/(?:sudo\s+|run as administrator|chmod\s+777)/i.test(content)) flags.push("elevated-privilege-instructions");
  if (/allowed-tools/i.test(combined)) flags.push("declares-tool-scope");
  return [...new Set(flags)].sort();
}

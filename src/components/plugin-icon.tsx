import {
  BarChart3,
  BookOpenText,
  BrainCircuit,
  Clock3,
  Code2,
  Database,
  FileSearch2,
  FileText,
  FolderOpen,
  GitBranch,
  Network,
  ScanSearch,
  ScanText,
  Workflow,
  Wrench,
} from "lucide-react";

export function PluginIcon({ slug, size = 20 }: { slug: string; size?: number }) {
  if (slug.startsWith("skill-")) return <BookOpenText size={size} />;
  if (slug.startsWith("local-")) return <Wrench size={size} />;
  if (slug === "filesystem-workbench") return <FolderOpen size={size} />;
  if (slug === "git-sandbox-studio") return <GitBranch size={size} />;
  if (slug === "knowledge-memory") return <BrainCircuit size={size} />;
  if (slug === "sqlite-workbench") return <Database size={size} />;
  if (slug === "timezone-converter") return <Clock3 size={size} />;
  if (slug === "web-content-reader") return <FileSearch2 size={size} />;
  if (slug === "sequential-thinking-studio") return <Network size={size} />;
  if (slug === "prose-defluffer") return <ScanText size={size} />;
  if (slug === "mermaid-diagram-studio") return <Workflow size={size} />;
  if (slug === "blueprint-chart-studio") return <BarChart3 size={size} />;
  if (slug === "oxidize-pdf-workbench") return <FileText size={size} />;
  if (slug === "bumpguard-dependency-lab") return <ScanSearch size={size} />;
  if (slug === "svelte-development-studio") return <Code2 size={size} />;
  return <GitBranch size={size} />;
}

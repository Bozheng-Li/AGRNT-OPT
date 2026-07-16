import { BlueprintWorkspace } from "./blueprint-workspace";
import { BumpguardWorkspace } from "./bumpguard-workspace";
import { DefluffWorkspace } from "./defluff-workspace";
import { FilesystemWorkspace } from "./filesystem-workspace";
import { GitWorkspace } from "./git-workspace";
import { MemoryWorkspace } from "./memory-workspace";
import { MermaidWorkspace } from "./mermaid-workspace";
import { OxidizePdfWorkspace } from "./oxidize-pdf-workspace";
import { SequentialThinkingWorkspace } from "./sequential-thinking-workspace";
import { getLocalMcpUi } from "@/lib/catalog/local-mcp-ui";
import { LocalMcpWorkspace } from "./local-mcp-workspace";
import { SkillWorkspace } from "./skill-workspace";
import { SqliteWorkspace } from "./sqlite-workspace";
import { SvelteWorkspace } from "./svelte-workspace";
import { TimeWorkspace } from "./time-workspace";
import { WebFetchWorkspace } from "./web-fetch-workspace";

export function PluginWorkspace({ component, slug }: { component?: string; slug?: string }) {
  if (component === "BlueprintWorkspace") return <BlueprintWorkspace />;
  if (component === "BumpguardWorkspace") return <BumpguardWorkspace />;
  if (component === "DefluffWorkspace") return <DefluffWorkspace />;
  if (component === "FilesystemWorkspace") return <FilesystemWorkspace />;
  if (component === "GitWorkspace") return <GitWorkspace />;
  if (component === "MemoryWorkspace") return <MemoryWorkspace />;
  if (component === "MermaidWorkspace") return <MermaidWorkspace />;
  if (component === "OxidizePdfWorkspace") return <OxidizePdfWorkspace />;
  if (component === "SequentialThinkingWorkspace") return <SequentialThinkingWorkspace />;
  if (component === "SkillWorkspace" && slug) return <SkillWorkspace slug={slug} />;
  if (component === "LocalMcpWorkspace" && slug) {
    const ui = getLocalMcpUi(slug);
    if (!ui) return null;
    return <LocalMcpWorkspace slug={slug} title={ui.title} tools={ui.tools} />;
  }
  if (component === "SqliteWorkspace") return <SqliteWorkspace />;
  if (component === "SvelteWorkspace") return <SvelteWorkspace />;
  if (component === "TimeWorkspace") return <TimeWorkspace />;
  if (component === "WebFetchWorkspace") return <WebFetchWorkspace />;
  return null;
}

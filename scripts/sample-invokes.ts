import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { invokePluginTool } from "../src/lib/runtime/invoke";

async function main() {
  const dir =
    process.env.AGENT_OPT_SCRATCH_SAMPLES ??
    path.join(
      "C:",
      "Users",
      "LIBOZH~1",
      "AppData",
      "Local",
      "Temp",
      "grok-goal-5e072e8fde34",
      "implementer",
      "samples",
    );
  mkdirSync(dir, { recursive: true });

  const jobs: Array<[string, string, Record<string, unknown>]> = [
    ["local-json-lab", "format_json", { text: '{"z":1,"a":2}' }],
    ["local-hash-lab", "digest", { text: "agent-opt", algorithm: "sha256" }],
    ["local-uuid-factory", "generate_uuid", { count: 2 }],
    ["skill-frontend-design", "skill_outline", {}],
    ["skill-brainstorming", "skill_search", { query: "idea", limit: 3 }],
    ["skill-mcp-builder", "skill_meta", {}],
  ];

  const summary: Array<Record<string, unknown>> = [];
  for (const [slug, tool, args] of jobs) {
    const result = await invokePluginTool(slug, tool, args);
    const out = {
      slug,
      tool,
      isError: result.isError,
      structuredContent: result.structuredContent,
      contentPreview: JSON.stringify(result.content).slice(0, 500),
    };
    writeFileSync(path.join(dir, `${slug}-${tool}.json`), `${JSON.stringify(out, null, 2)}\n`);
    summary.push({ slug, tool, isError: result.isError, hasContent: result.content.length > 0 });
  }
  writeFileSync(path.join(dir, "index.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

"use client";

import { useMemo, useState } from "react";
import { Play, Wrench } from "lucide-react";
import { ResultView } from "./result-view";
import { usePluginInvoke } from "./use-plugin-invoke";

export type LocalMcpToolUi = {
  name: string;
  label: string;
  fields: Array<{
    key: string;
    label: string;
    kind: "text" | "textarea" | "number" | "select";
    placeholder?: string;
    options?: string[];
    defaultValue?: string;
  }>;
};

export function LocalMcpWorkspace({
  slug,
  title,
  tools,
}: {
  slug: string;
  title: string;
  tools: LocalMcpToolUi[];
}) {
  const runtime = usePluginInvoke(slug);
  const [toolName, setToolName] = useState(tools[0]?.name ?? "");
  const active = useMemo(() => tools.find((tool) => tool.name === toolName) ?? tools[0], [toolName, tools]);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const tool of tools) {
      for (const field of tool.fields) initial[`${tool.name}:${field.key}`] = field.defaultValue ?? "";
    }
    return initial;
  });

  async function run() {
    if (!active) return;
    const args: Record<string, unknown> = {};
    for (const field of active.fields) {
      const raw = values[`${active.name}:${field.key}`] ?? "";
      if (field.kind === "number") {
        if (raw.trim() === "") continue;
        args[field.key] = Number(raw);
      } else if (field.key === "items" || field.key === "parts") {
        args[field.key] = raw
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean);
      } else if (raw !== "") {
        args[field.key] = raw;
      }
    }
    await runtime.invoke(active.name, args).catch(() => undefined);
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title">
          <Wrench size={14} />
          {title}
        </div>
        <span className="badge low">本地进程内 MCP · 无外网</span>
      </div>
      <div className="workspace-body">
        <div className="control-panel">
          <div className="field-group">
            <label className="field-label" htmlFor={`${slug}-tool`}>
              工具 <span>allowedTools</span>
            </label>
            <select
              id={`${slug}-tool`}
              className="field-input"
              data-testid="local-mcp-tool"
              value={active?.name}
              onChange={(event) => setToolName(event.target.value)}
            >
              {tools.map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.label}
                </option>
              ))}
            </select>
          </div>

          {active?.fields.map((field) => {
            const key = `${active.name}:${field.key}`;
            return (
              <div className="field-group" key={key}>
                <label className="field-label" htmlFor={`${slug}-${key}`}>
                  {field.label}
                </label>
                {field.kind === "textarea" ? (
                  <textarea
                    id={`${slug}-${key}`}
                    className="field-input"
                    data-testid={`local-field-${field.key}`}
                    rows={8}
                    value={values[key] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
                  />
                ) : field.kind === "select" ? (
                  <select
                    id={`${slug}-${key}`}
                    className="field-input"
                    data-testid={`local-field-${field.key}`}
                    value={values[key] ?? field.options?.[0] ?? ""}
                    onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
                  >
                    {(field.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`${slug}-${key}`}
                    className="field-input"
                    data-testid={`local-field-${field.key}`}
                    type={field.kind === "number" ? "number" : "text"}
                    value={values[key] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
                  />
                )}
              </div>
            );
          })}

          <button className="primary-button" data-testid="local-mcp-run" type="button" onClick={() => void run()} disabled={runtime.pending || !active}>
            <Play size={13} />
            {runtime.pending ? "运行中…" : "运行工具"}
          </button>
          <div className="privacy-notice">Agent-OPT 进程内本地 MCP：不启动子进程、不访问外网、不读写主机任意路径。</div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="运行本地 MCP 工具"
          emptyDescription="选择工具并填写参数。所有计算在 Agent-OPT 进程内完成。"
        />
      </div>
    </div>
  );
}

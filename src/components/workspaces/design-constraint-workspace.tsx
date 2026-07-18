"use client";

import { useMemo, useState } from "react";
import { Braces, GitBranch, Lightbulb, ListChecks, Play, Search, ShieldCheck, Wand2 } from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";

const failingTokens = JSON.stringify({
  color: {
    text: { $value: "#777777" },
    surface: { $value: "#ffffff" },
    action: { $value: "{color.text}" },
  },
  spacing: {
    sm: { $value: 8 },
    md: { $value: "{spacing.sm}" },
  },
}, null, 2);

const passingTokens = JSON.stringify({
  color: {
    text: { $value: "#222222" },
    surface: { $value: "#ffffff" },
    action: { $value: "{color.text}" },
  },
  spacing: {
    sm: { $value: 16 },
    md: { $value: 24 },
  },
}, null, 2);

const defaultConstraints = JSON.stringify({
  enableBuiltInWcagDefaults: false,
  enableBuiltInThreshold: false,
  wcag: [
    {
      foreground: "color.text",
      background: "color.surface",
      ratio: 4.5,
      description: "正文与页面背景",
    },
  ],
  thresholds: [
    {
      id: "spacing.sm",
      op: ">=",
      valuePx: 12,
      where: "可交互组件的最小间距",
      level: "error",
    },
  ],
}, null, 2);

const tools = [
  { id: "validate", label: "验证", icon: ShieldCheck },
  { id: "why", label: "追溯", icon: Search },
  { id: "graph", label: "依赖图", icon: GitBranch },
  { id: "list-constraints", label: "规则", icon: ListChecks },
  { id: "explain", label: "解释", icon: Lightbulb },
  { id: "suggest-fix", label: "修复建议", icon: Wand2 },
] as const;

type ToolId = (typeof tools)[number]["id"];

function parseObject(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label}不是有效 JSON。`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label}必须是 JSON 对象。`);
  return parsed as Record<string, unknown>;
}

export function DesignConstraintWorkspace() {
  const [tool, setTool] = useState<ToolId>("validate");
  const [tokens, setTokens] = useState(failingTokens);
  const [constraints, setConstraints] = useState(defaultConstraints);
  const [tokenId, setTokenId] = useState("color.action");
  const [selectedViolation, setSelectedViolation] = useState<Record<string, unknown> | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const runtime = usePluginInvoke("design-constraint-studio");
  const payload = useMemo(() => resultJson(runtime.result), [runtime.result]);
  const violations = Array.isArray(payload?.violations) ? payload.violations as Array<Record<string, unknown>> : [];
  const graphNodes = Array.isArray(payload?.nodes) ? payload.nodes.map(String) : [];
  const graphEdges = Array.isArray(payload?.edges) ? payload.edges as unknown[] : [];
  const activeConstraints = Array.isArray(payload?.constraints) ? payload.constraints as Array<Record<string, unknown>> : [];

  async function run() {
    setLocalError(null);
    try {
      const tokenObject = parseObject(tokens, "Token ");
      const constraintObject = parseObject(constraints, "约束 ");
      let args: Record<string, unknown>;
      if (tool === "why") args = { tokens: tokenObject, tokenId };
      else if (tool === "graph") args = { tokens: tokenObject, format: "json" };
      else if (tool === "validate" || tool === "list-constraints") {
        args = { tokens: tokenObject, constraints: constraintObject };
      } else {
        const selected = selectedViolation ?? violations[0];
        args = selected
          ? { tokens: tokenObject, constraints: constraintObject, violation: selected }
          : {
              tokens: tokenObject,
              constraints: constraintObject,
              ruleId: "wcag-contrast",
              nodes: ["color.text", "color.surface"],
              context: { required: 4.5 },
            };
        if (tool === "suggest-fix") args.target = "foreground";
      }
      const nextResult = await runtime.invoke(tool, args);
      if (tool === "validate") {
        const nextPayload = nextResult.structuredContent;
        const nextViolations = Array.isArray(nextPayload?.violations)
          ? nextPayload.violations as Array<Record<string, unknown>>
          : [];
        setSelectedViolation(nextViolations[0] ?? null);
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "设计约束调用失败。");
    }
  }

  function switchTool(next: ToolId) {
    setTool(next);
    setLocalError(null);
    runtime.setResult(null);
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Braces size={14} />设计约束验证台</div>
        <span className="badge low">只读数学验证</span>
      </div>
      <div className="design-constraint-tabs" role="tablist" aria-label="设计约束工具">
        {tools.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tool === item.id}
              className={tool === item.id ? "active" : ""}
              data-testid={`dcv-tab-${item.id}`}
              onClick={() => switchTool(item.id)}
            >
              <Icon size={12} />{item.label}
            </button>
          );
        })}
      </div>
      <div className="workspace-body design-constraint-layout">
        <div className="control-panel design-constraint-controls">
          <div className="dcv-example-row">
            <button type="button" className="secondary-button" data-testid="dcv-example-fail" onClick={() => setTokens(failingTokens)}>载入违规示例</button>
            <button type="button" className="secondary-button" data-testid="dcv-example-pass" onClick={() => setTokens(passingTokens)}>载入通过示例</button>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="dcv-tokens">DTCG Token JSON <span>仅内联</span></label>
            <textarea id="dcv-tokens" data-testid="dcv-tokens" className="field-textarea dcv-editor" value={tokens} onChange={(event) => setTokens(event.target.value)} spellCheck={false} />
          </div>
          {tool !== "why" && tool !== "graph" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="dcv-constraints">约束 JSON <span>WCAG / 阈值</span></label>
              <textarea id="dcv-constraints" data-testid="dcv-constraints" className="field-textarea dcv-editor" value={constraints} onChange={(event) => setConstraints(event.target.value)} spellCheck={false} />
            </div>
          ) : null}
          {tool === "why" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="dcv-token-id">要追溯的 Token ID</label>
              <input id="dcv-token-id" data-testid="dcv-token-id" className="field-input" value={tokenId} onChange={(event) => setTokenId(event.target.value)} />
            </div>
          ) : null}
          <button type="button" className="primary-button" data-testid="dcv-run" onClick={run} disabled={runtime.pending}>
            <Play size={13} />{runtime.pending ? "正在推导…" : `运行${tools.find((item) => item.id === tool)?.label}`}
          </button>
          <div className="sandbox-notice"><ShieldCheck size={14} />Web 只开放有界的内联 Token 与约束；文件路径、配置目录、插件代码和自定义命令不会传给上游 MCP。</div>
        </div>

        <ResultView
          result={runtime.result}
          error={localError ?? runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="让设计系统关系变成可验证事实"
          emptyDescription="检查对比度与阈值，追溯 alias，查看依赖图，再解释问题并计算只读修复建议。"
        >
          {payload ? (
            <div className="dcv-insight" data-testid="dcv-insight">
              {tool === "validate" ? (
                <div className="dcv-metrics">
                  <span><strong>{String(payload.ok)}</strong>整体通过</span>
                  <span><strong>{violations.length}</strong>违规项</span>
                  <span><strong>{String(payload.errors ?? payload.errorCount ?? "—")}</strong>错误</span>
                </div>
              ) : null}
              {tool === "graph" ? (
                <div className="dcv-graph" data-testid="dcv-graph">
                  <strong>{graphNodes.length} 个节点 · {graphEdges.length} 条边</strong>
                  <div>{graphNodes.slice(0, 30).map((node) => <span key={node}>{node}</span>)}</div>
                </div>
              ) : null}
              {tool === "list-constraints" ? (
                <div className="dcv-constraint-list" data-testid="dcv-constraint-list">
                  {activeConstraints.map((item, index) => <pre key={index}>{JSON.stringify(item, null, 2)}</pre>)}
                </div>
              ) : null}
            </div>
          ) : null}
        </ResultView>
      </div>
    </div>
  );
}

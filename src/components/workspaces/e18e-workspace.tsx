"use client";

import { useMemo, useState } from "react";
import {
  BookOpenText,
  Bot,
  CheckCircle2,
  Code2,
  FileSearch,
  Library,
  PackageSearch,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke, type ActivityItem } from "./use-plugin-invoke";

type Tab = "install" | "source" | "lookup" | "assets";
type JsonRecord = Record<string, unknown>;
type ProtocolAssets = {
  resources: Array<{ name: string; title?: string; uri: string; mimeType?: string; description?: string }>;
  resourceTemplates: Array<{ name: string; uriTemplate: string; description?: string }>;
  prompts: Array<{ name: string; title?: string; description?: string; arguments?: Array<{ name: string; required?: boolean }> }>;
};

const tabs: Array<{ id: Tab; label: string; icon: typeof PackageSearch }> = [
  { id: "install", label: "安装文本检查", icon: PackageSearch },
  { id: "source", label: "源码 import 检查", icon: Code2 },
  { id: "lookup", label: "替代方案检索", icon: Search },
  { id: "assets", label: "指南与 Agent 提示", icon: Library },
];

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => typeof item === "object" && item !== null && !Array.isArray(item))
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function E18eWorkspace() {
  const runtime = usePluginInvoke("e18e-dependency-advisor");
  const [tab, setTab] = useState<Tab>("install");
  const [lastTool, setLastTool] = useState("");
  const [command, setCommand] = useState("pnpm add lodash moment chalk");
  const [code, setCode] = useState("import _ from 'lodash';\nimport moment from 'moment';\nimport chalk from 'chalk';\n\nconsole.log(chalk.green(moment().format('YYYY-MM-DD')), _.uniq([1, 1, 2]));\n");
  const [query, setQuery] = useState("chalk");
  const [assets, setAssets] = useState<ProtocolAssets | null>(null);
  const [resourceFilter, setResourceFilter] = useState("moment");
  const [documentText, setDocumentText] = useState("");
  const [documentUri, setDocumentUri] = useState("");
  const [task, setTask] = useState("审查这个前端项目的依赖选择，并在给出安装命令或源码前检查更轻量的替代方案。");
  const [promptText, setPromptText] = useState("");
  const [protocolPending, setProtocolPending] = useState(false);
  const [protocolError, setProtocolError] = useState<string | null>(null);
  const [protocolActivity, setProtocolActivity] = useState<ActivityItem[]>([]);

  const payload = resultJson(runtime.result);
  const suggestions = strings(payload?.suggestions);
  const lookupResults = records(payload?.results);
  const filteredResources = useMemo(() => {
    const normalized = resourceFilter.trim().toLowerCase();
    const resources = assets?.resources ?? [];
    return resources
      .filter((resource) => !normalized || `${resource.name}\n${resource.description ?? ""}`.toLowerCase().includes(normalized))
      .slice(0, 30);
  }, [assets, resourceFilter]);

  function switchTab(next: Tab) {
    setTab(next);
    setProtocolError(null);
    if (next !== "assets") runtime.setResult(null);
  }

  async function runTool() {
    const tool = tab === "install" ? "npm-i-checker" : tab === "source" ? "code-checker" : "lookup-replacement";
    const args = tab === "install" ? { command } : tab === "source" ? { code } : { query };
    setLastTool(tool);
    await runtime.invoke(tool, args).catch(() => undefined);
  }

  async function protocolRequest(
    label: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    setProtocolPending(true);
    setProtocolError(null);
    try {
      const response = await fetch("/api/plugins/e18e-dependency-advisor/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "MCP 协议能力调用失败。");
      setProtocolActivity((items) => [
        { tool: label, at: new Date().toLocaleTimeString("zh-CN"), ok: true },
        ...items,
      ].slice(0, 8));
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP 协议能力调用失败。";
      setProtocolError(message);
      setProtocolActivity((items) => [
        { tool: label, at: new Date().toLocaleTimeString("zh-CN"), ok: false },
        ...items,
      ].slice(0, 8));
      return null;
    } finally {
      setProtocolPending(false);
    }
  }

  async function loadAssets() {
    const response = await protocolRequest("resources/list + prompts/list", { operation: "capabilities" });
    const result = response?.result;
    if (result && typeof result === "object" && !Array.isArray(result)) setAssets(result as ProtocolAssets);
  }

  async function openDocument(uri: string) {
    setDocumentText("");
    setDocumentUri(uri);
    const response = await protocolRequest("resources/read", { operation: "resource", uri });
    const result = response?.result as { contents?: Array<{ text?: unknown }> } | undefined;
    const text = result?.contents?.find((item) => typeof item.text === "string")?.text;
    if (typeof text === "string") setDocumentText(text);
  }

  async function buildPrompt() {
    setPromptText("");
    const response = await protocolRequest("prompts/get task", {
      operation: "prompt",
      prompt: "task",
      arguments: { task },
    });
    const result = response?.result as { messages?: Array<{ content?: { text?: unknown } }> } | undefined;
    const text = result?.messages?.find((message) => typeof message.content?.text === "string")?.content?.text;
    if (typeof text === "string") setPromptText(text);
  }

  const toolPending = runtime.pending;
  const pending = toolPending || protocolPending;
  const activity = tab === "assets" ? protocolActivity : runtime.activity;
  const error = tab === "assets" ? protocolError : runtime.error;
  const visibleResult = tab === "assets" ? null : runtime.result;
  const currentTab = tabs.find((item) => item.id === tab)!;
  const hasToolPresentation = lastTool === "lookup-replacement" ? lookupResults.length > 0 : Boolean(payload);

  return (
    <div className="workspace-card e18e-workspace">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Sparkles size={14} />e18e 依赖性能顾问</div>
        <span className="badge low">GPT 风味 · 本地静态知识库 · 不安装依赖</span>
      </div>
      <div className="workspace-body e18e-workspace-body">
        <div className="control-panel">
          <div className="workspace-tabs e18e-tabs">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  className={`workspace-tab ${tab === item.id ? "active" : ""}`}
                  data-testid={`e18e-tab-${item.id}`}
                  onClick={() => switchTab(item.id)}
                  key={item.id}
                >
                  <Icon size={11} />{item.label}
                </button>
              );
            })}
          </div>

          {tab === "install" ? (
            <>
              <div className="e18e-agent-intro"><Bot size={17} /><div><strong>先审查，再决定装什么</strong><span>输入只是待分析文本；页面不会执行 npm、pnpm、yarn 或 bun。</span></div></div>
              <div className="field-group">
                <label className="field-label" htmlFor="e18e-command">安装命令文本 <span>1–12 个裸 npm 包名</span></label>
                <input id="e18e-command" data-testid="e18e-install-command" className="field-input code" value={command} onChange={(event) => setCommand(event.target.value)} />
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={() => setCommand("npm i express body-parser moment")}>Web 服务示例</button>
                <button type="button" className="secondary-button" onClick={() => setCommand("yarn add lodash chalk rimraf")}>工具链示例</button>
              </div>
            </>
          ) : null}

          {tab === "source" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="e18e-code">JS / TS / JSX / TSX 源码 <span>最大 100,000 字符 · 不读取路径</span></label>
                <textarea id="e18e-code" data-testid="e18e-code" className="field-textarea code e18e-source" value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} />
              </div>
              <button type="button" className="secondary-button" onClick={() => setCode("import rimraf from 'rimraf';\nimport fetch from 'node-fetch';\n\nawait rimraf('./dist');\nawait fetch('https://example.com');\n")}>载入现代 Node.js 示例</button>
            </>
          ) : null}

          {tab === "lookup" ? (
            <>
              <div className="e18e-agent-intro"><FileSearch size={17} /><div><strong>按包名或主题探索</strong><span>可检索原生 API、微型工具函数和首选替代包。</span></div></div>
              <div className="field-group">
                <label className="field-label" htmlFor="e18e-query">包名 / 替代文本 / 主题词 <span>最大 80 字符</span></label>
                <input id="e18e-query" data-testid="e18e-query" className="field-input code" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <div className="button-row">
                {['chalk', 'lodash', 'Array.prototype.map', 'filter'].map((example) => <button type="button" className="secondary-button" onClick={() => setQuery(example)} key={example}>{example}</button>)}
              </div>
            </>
          ) : null}

          {tab !== "assets" ? (
            <button className="primary-button" data-testid="e18e-run" type="button" onClick={runTool} disabled={pending}>
              <Play size={13} />{pending ? "正在调用固定 MCP…" : `运行${currentTab.label}`}
            </button>
          ) : (
            <div className="e18e-assets-control">
              <section>
                <div className="e18e-section-heading"><BookOpenText size={15} /><div><strong>上游迁移指南</strong><span>通过真实 resources/list 与 resources/read 读取包内固定文档。</span></div></div>
                <button className="primary-button" data-testid="e18e-load-assets" type="button" onClick={loadAssets} disabled={pending}>
                  <Library size={13} />{assets ? "刷新协议资产" : "加载资源模板与提示"}
                </button>
                {assets ? (
                  <>
                    <div className="e18e-protocol-facts" data-testid="e18e-resource-count">
                      <span>{assets.resources.length} 篇指南</span>
                      <span>{assets.resourceTemplates[0]?.uriTemplate ?? "无资源模板"}</span>
                      <span>{assets.prompts[0]?.name ?? "无提示"} prompt</span>
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor="e18e-resource-filter">筛选迁移指南</label>
                      <div className="e18e-filter-input"><Search size={12} /><input id="e18e-resource-filter" data-testid="e18e-resource-filter" value={resourceFilter} onChange={(event) => setResourceFilter(event.target.value)} /></div>
                    </div>
                    <div className="e18e-resource-list" data-testid="e18e-resource-list">
                      {filteredResources.map((resource) => (
                        <button type="button" data-testid={`e18e-resource-${resource.name}`} className={documentUri === resource.uri ? "active" : ""} onClick={() => void openDocument(resource.uri)} key={resource.uri}>
                          <BookOpenText size={12} /><span><strong>{resource.name.replace(/\.md$/, "")}</strong><small>{resource.description}</small></span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </section>
              <section>
                <div className="e18e-section-heading"><Bot size={15} /><div><strong>Agent 任务提示装配</strong><span>把任务交给上游 `task` prompt，生成会调用两个检查器的工作指令。</span></div></div>
                <textarea data-testid="e18e-task" className="field-textarea e18e-task" value={task} onChange={(event) => setTask(event.target.value)} />
                <button type="button" className="secondary-button" data-testid="e18e-build-prompt" onClick={buildPrompt} disabled={pending || !task.trim()}><Sparkles size={12} />生成 Agent 提示</button>
              </section>
            </div>
          )}

          <div className="privacy-notice">
            <ShieldCheck size={14} />
            只运行固定的 `@e18e/mcp@0.0.9` STDIO 入口。输入不会成为路径、URL、安装参数或 shell 命令；网络、子进程和凭据环境在启动器中被禁用，建议内容只作为待复核资料展示。
          </div>
        </div>

        <ResultView
          result={visibleResult}
          error={error}
          pending={pending}
          activity={activity}
          emptyTitle="让依赖选择先经过性能复核"
          emptyDescription="三条工具工作流检查安装文本、源码 import 与单包替代；协议资产区提供固定迁移指南和 Agent 任务提示。"
          hideRaw={tab === "assets" || hasToolPresentation}
        >
          {tab !== "assets" && payload && lastTool !== "lookup-replacement" ? (
            <div className="e18e-suggestion-panel" data-testid="e18e-suggestions">
              <div className="e18e-result-summary">
                {suggestions.length > 0 ? <PackageSearch size={18} /> : <CheckCircle2 size={18} />}
                <div><strong>{suggestions.length > 0 ? `发现 ${suggestions.length} 组替代建议` : "未命中当前固定知识库"}</strong><span>结果来自上游 0.0.9 内置 module-replacements 数据，不会自动修改项目。</span></div>
              </div>
              {suggestions.map((suggestion, index) => <pre key={`${index}-${suggestion.slice(0, 30)}`}>{suggestion}</pre>)}
            </div>
          ) : null}

          {tab !== "assets" && lastTool === "lookup-replacement" && runtime.result ? (
            <div className="e18e-lookup-results" data-testid="e18e-lookup-results">
              <div className="e18e-result-summary"><Search size={18} /><div><strong>{lookupResults.length} 个匹配项</strong><span>来源分为原生能力、微型工具函数与 e18e 首选替代。</span></div></div>
              {lookupResults.map((item, index) => (
                <article key={`${String(item.source)}-${String(item.module_name)}-${index}`}>
                  <div><span className="badge low">{String(item.source)}</span><strong>{String(item.module_name)}</strong><code>{String(item.type)}</code></div>
                  {typeof item.replacement === "string" ? <p><b>建议：</b>{item.replacement}</p> : null}
                  {typeof item.description === "string" ? <p>{item.description}</p> : null}
                  {typeof item.documentation === "string" ? <details><summary>展开内置迁移说明</summary><pre>{item.documentation}</pre></details> : null}
                  {typeof item.url === "string" ? <small>参考 URL：{item.url}</small> : null}
                </article>
              ))}
              {lookupResults.length === 0 ? <div className="e18e-clean"><CheckCircle2 size={16} />没有与该检索词匹配的替代记录。</div> : null}
            </div>
          ) : null}

          {tab === "assets" && documentText ? (
            <section className="e18e-document-output" data-testid="e18e-doc-output">
              <div className="e18e-result-summary"><BookOpenText size={18} /><div><strong>{documentUri.replace("e18e://docs/", "")}</strong><span>真实 MCP resources/read · text/plain · 按纯文本转义展示</span></div></div>
              <pre>{documentText}</pre>
            </section>
          ) : null}
          {tab === "assets" && promptText ? (
            <section className="e18e-prompt-output" data-testid="e18e-prompt-output">
              <div className="e18e-result-summary"><Bot size={18} /><div><strong>上游 task prompt</strong><span>这是供 Agent 采用的建议上下文，不会在页面中自动执行。</span></div></div>
              <pre>{promptText}</pre>
            </section>
          ) : null}
        </ResultView>
      </div>
    </div>
  );
}

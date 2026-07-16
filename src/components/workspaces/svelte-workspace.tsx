"use client";

import { useMemo, useState } from "react";
import {
  BookOpenText,
  Code2,
  ExternalLink,
  FileCode2,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";

type Tab = "diagnostics" | "docs" | "playground";
type SvelteVersion = 4 | 5;

type DocSection = {
  title: string;
  useCases: string;
  path: string;
};

const tabLabels: Record<Tab, string> = {
  diagnostics: "代码诊断",
  docs: "官方文档",
  playground: "Playground",
};

const diagnosticExamples: Record<string, { label: string; code: string; version: SvelteVersion; filename: string }> = {
  s5legacy: {
    label: "Svelte 5 迁移",
    version: 5,
    filename: "Counter.svelte",
    code: `<script>
  let count = 0;
</script>

<button on:click={() => count += 1}>
  clicks: {count}
</button>
`,
  },
  s5runes: {
    label: "Svelte 5 正确示例",
    version: 5,
    filename: "Counter.svelte",
    code: `<script>
  let count = $state(0);
</script>

<button onclick={() => count += 1}>
  clicks: {count}
</button>
`,
  },
  s4: {
    label: "Svelte 4 组件",
    version: 4,
    filename: "Hello.svelte",
    code: `<script>
  export let name = "Svelte";
</script>

<h1>Hello {name}!</h1>
`,
  },
};

const defaultPlaygroundFiles: Record<string, string> = {
  "App.svelte": `<script>
  let count = $state(0);
</script>

<main>
  <h1>Agent-OPT Playground</h1>
  <button onclick={() => count += 1}>clicks: {count}</button>
</main>
`,
  "styles.css": `main {
  font-family: system-ui, sans-serif;
  padding: 1.5rem;
}

button {
  padding: 0.5rem 0.9rem;
  border-radius: 0.5rem;
}
`,
};

function asSections(value: unknown): DocSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      if (typeof record.title !== "string" || typeof record.path !== "string") return null;
      return {
        title: record.title,
        useCases: typeof record.useCases === "string" ? record.useCases : "",
        path: record.path,
      };
    })
    .filter((item): item is DocSection => item !== null);
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function SvelteWorkspace() {
  const runtime = usePluginInvoke("svelte-development-studio");
  const [tab, setTab] = useState<Tab>("diagnostics");

  const [version, setVersion] = useState<SvelteVersion>(5);
  const [asyncMode, setAsyncMode] = useState(false);
  const [filename, setFilename] = useState("Counter.svelte");
  const [code, setCode] = useState(diagnosticExamples.s5legacy.code);

  const [sections, setSections] = useState<DocSection[]>([]);
  const [sectionQuery, setSectionQuery] = useState("");
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [docsLoaded, setDocsLoaded] = useState(false);

  const [playgroundName, setPlaygroundName] = useState("Agent-OPT demo");
  const [tailwind, setTailwind] = useState(false);
  const [files, setFiles] = useState<Record<string, string>>(defaultPlaygroundFiles);
  const [activeFile, setActiveFile] = useState("App.svelte");
  const [newFileName, setNewFileName] = useState("");
  const [playgroundUrl, setPlaygroundUrl] = useState<string | null>(null);

  const payload = resultJson(runtime.result);
  const issues = asStrings(payload?.issues);
  const suggestions = asStrings(payload?.suggestions);
  const requireAnother = payload?.require_another_tool_call_after_fixing === true;
  const filteredSections = useMemo(() => {
    const query = sectionQuery.trim().toLowerCase();
    if (!query) return sections;
    return sections.filter((section) =>
      [section.title, section.path, section.useCases].join(" ").toLowerCase().includes(query),
    );
  }, [sectionQuery, sections]);

  const fileNames = Object.keys(files);
  const activeContent = files[activeFile] ?? "";

  function loadDiagnosticExample(key: keyof typeof diagnosticExamples) {
    const example = diagnosticExamples[key];
    setVersion(example.version);
    setFilename(example.filename);
    setCode(example.code);
    setAsyncMode(false);
    runtime.setResult(null);
  }

  async function runDiagnostics() {
    setPlaygroundUrl(null);
    await runtime
      .invoke("svelte-autofixer", {
        code,
        desired_svelte_version: version,
        async: asyncMode,
        filename,
      })
      .catch(() => undefined);
  }

  async function loadSections() {
    setPlaygroundUrl(null);
    const result = await runtime.invoke("list-sections", {}).catch(() => null);
    if (!result || result.isError) return;
    const next = asSections(resultJson(result)?.sections);
    setSections(next);
    setDocsLoaded(true);
    if (selectedSections.length === 0 && next.length > 0) {
      const preferred = next.find((section) => section.title === "$state") ?? next[0];
      setSelectedSections([preferred.title]);
    }
  }

  function toggleSection(title: string) {
    setSelectedSections((current) =>
      current.includes(title) ? current.filter((item) => item !== title) : [...current, title].slice(0, 8),
    );
  }

  async function retrieveDocs() {
    if (selectedSections.length === 0) return;
    setPlaygroundUrl(null);
    const result = await runtime
      .invoke("get-documentation", { section: selectedSections })
      .catch(() => null);
    if (!result || result.isError) return;
    const nextMarkdown = String(resultJson(result)?.markdown ?? "");
    setMarkdown(nextMarkdown);
  }

  function updateActiveFile(content: string) {
    setFiles((current) => ({ ...current, [activeFile]: content }));
  }

  function addPlaygroundFile() {
    const name = newFileName.trim();
    if (!name || files[name] !== undefined || fileNames.length >= 12) return;
    setFiles((current) => ({ ...current, [name]: "" }));
    setActiveFile(name);
    setNewFileName("");
  }

  function removePlaygroundFile(name: string) {
    if (name === "App.svelte" || fileNames.length <= 1) return;
    setFiles((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    if (activeFile === name) setActiveFile("App.svelte");
  }

  async function generatePlayground() {
    const result = await runtime
      .invoke("playground-link", {
        name: playgroundName,
        tailwind,
        files,
      })
      .catch(() => null);
    if (!result || result.isError) {
      setPlaygroundUrl(null);
      return;
    }
    const url = resultJson(result)?.url;
    setPlaygroundUrl(typeof url === "string" ? url : null);
  }

  async function run() {
    if (tab === "diagnostics") await runDiagnostics();
    else if (tab === "docs") {
      if (!docsLoaded || sections.length === 0) await loadSections();
      else await retrieveDocs();
    } else await generatePlayground();
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title">
          <Layers3 size={14} />
          Svelte 开发工作室
        </div>
        <span className="badge low">官方 MCP · 固定 svelte.dev</span>
      </div>

      <div className="workspace-body">
        <div className="control-panel">
          <div className="workspace-tabs svelte-tabs">
            {(Object.keys(tabLabels) as Tab[]).map((item) => (
              <button
                type="button"
                key={item}
                data-testid={`svelte-tab-${item}`}
                className={`workspace-tab ${tab === item ? "active" : ""}`}
                onClick={() => setTab(item)}
              >
                {tabLabels[item]}
              </button>
            ))}
          </div>

          {tab === "diagnostics" ? (
            <>
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="svelte-version">Svelte 版本</label>
                  <div className="svelte-segmented" role="group" aria-label="Svelte 版本">
                    {([5, 4] as const).map((item) => (
                      <button
                        type="button"
                        key={item}
                        data-testid={`svelte-version-${item}`}
                        className={version === item ? "active" : ""}
                        onClick={() => {
                          setVersion(item);
                          if (item === 4) setAsyncMode(false);
                        }}
                      >
                        Svelte {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="svelte-filename">文件名</label>
                  <input
                    id="svelte-filename"
                    data-testid="svelte-filename"
                    className="field-input code"
                    value={filename}
                    onChange={(event) => setFilename(event.target.value)}
                  />
                </div>
              </div>

              <label className="checkbox-row" htmlFor="svelte-async">
                <input
                  id="svelte-async"
                  data-testid="svelte-async"
                  type="checkbox"
                  checked={asyncMode}
                  disabled={version === 4}
                  onChange={(event) => setAsyncMode(event.target.checked)}
                />
                Async 组件模式（仅 Svelte 5）
              </label>

              <div className="field-group">
                <label className="field-label" htmlFor="svelte-code">
                  组件 / 模块源码 <span>最大 200,000 字符 · 仅文本</span>
                </label>
                <textarea
                  id="svelte-code"
                  data-testid="svelte-code"
                  className="field-textarea code svelte-source"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </div>

              <div className="button-row" aria-label="诊断示例">
                {(Object.keys(diagnosticExamples) as Array<keyof typeof diagnosticExamples>).map((key) => (
                  <button
                    type="button"
                    key={key}
                    className="secondary-button"
                    data-testid={`svelte-example-${key}`}
                    onClick={() => loadDiagnosticExample(key)}
                  >
                    {diagnosticExamples[key].label}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {tab === "docs" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="svelte-section-query">章节检索</label>
                <div className="svelte-filter-input">
                  <Search size={12} />
                  <input
                    id="svelte-section-query"
                    data-testid="svelte-section-query"
                    value={sectionQuery}
                    onChange={(event) => setSectionQuery(event.target.value)}
                    placeholder="按标题、路径或 use case 过滤"
                  />
                </div>
              </div>

              <div className="svelte-section-toolbar">
                <button
                  type="button"
                  className="secondary-button"
                  data-testid="svelte-load-sections"
                  onClick={() => void loadSections()}
                  disabled={runtime.pending}
                >
                  <BookOpenText size={12} />
                  {docsLoaded ? "刷新章节索引" : "加载官方章节"}
                </button>
                <span>{selectedSections.length}/8 已选 · 共 {sections.length} 章</span>
              </div>

              <div className="svelte-section-list" data-testid="svelte-section-list" role="list">
                {filteredSections.length === 0 ? (
                  <div className="svelte-empty-hint">
                    {docsLoaded ? "没有匹配的章节。" : "先加载官方章节索引，再多选最多 8 个章节检索 llms.txt。"}
                  </div>
                ) : (
                  filteredSections.map((section) => {
                    const checked = selectedSections.includes(section.title);
                    return (
                      <label
                        key={`${section.path}-${section.title}`}
                        className={`svelte-section-item ${checked ? "selected" : ""}`}
                        role="listitem"
                      >
                        <input
                          type="checkbox"
                          data-testid={`svelte-section-${section.title}`}
                          checked={checked}
                          onChange={() => toggleSection(section.title)}
                        />
                        <span>
                          <strong>{section.title}</strong>
                          <small>{section.path}</small>
                          {section.useCases ? <em>{section.useCases}</em> : null}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          ) : null}

          {tab === "playground" ? (
            <>
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="svelte-playground-name">项目名称</label>
                  <input
                    id="svelte-playground-name"
                    data-testid="svelte-playground-name"
                    className="field-input"
                    value={playgroundName}
                    onChange={(event) => setPlaygroundName(event.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label className="checkbox-row" htmlFor="svelte-tailwind" style={{ marginTop: 22 }}>
                    <input
                      id="svelte-tailwind"
                      data-testid="svelte-tailwind"
                      type="checkbox"
                      checked={tailwind}
                      onChange={(event) => setTailwind(event.target.checked)}
                    />
                    启用 Tailwind
                  </label>
                </div>
              </div>

              <div className="svelte-file-tabs" data-testid="svelte-file-tabs">
                {fileNames.map((name) => (
                  <button
                    type="button"
                    key={name}
                    data-testid={`svelte-file-tab-${name}`}
                    className={activeFile === name ? "active" : ""}
                    onClick={() => setActiveFile(name)}
                  >
                    {name}
                    {name !== "App.svelte" ? (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`删除 ${name}`}
                        data-testid={`svelte-file-remove-${name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          removePlaygroundFile(name);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            removePlaygroundFile(name);
                          }
                        }}
                      >
                        <Trash2 size={10} />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>

              <div className="svelte-add-file">
                <input
                  data-testid="svelte-new-file"
                  className="field-input code"
                  value={newFileName}
                  placeholder="例如 utils.js"
                  onChange={(event) => setNewFileName(event.target.value)}
                />
                <button
                  type="button"
                  className="secondary-button"
                  data-testid="svelte-add-file"
                  onClick={addPlaygroundFile}
                  disabled={fileNames.length >= 12}
                >
                  <Plus size={12} />
                  添加文件
                </button>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="svelte-playground-code">
                  {activeFile} <span>1–12 个根目录文件 · 单文件 ≤ 75,000 字符</span>
                </label>
                <textarea
                  id="svelte-playground-code"
                  data-testid="svelte-playground-code"
                  className="field-textarea code svelte-source"
                  value={activeContent}
                  onChange={(event) => updateActiveFile(event.target.value)}
                />
              </div>
            </>
          ) : null}

          <button
            className="primary-button"
            data-testid="svelte-run"
            type="button"
            onClick={() => void run()}
            disabled={runtime.pending || (tab === "docs" && docsLoaded && selectedSections.length === 0)}
          >
            {tab === "diagnostics" ? <Wrench size={13} /> : tab === "docs" ? <BookOpenText size={13} /> : <FileCode2 size={13} />}
            {runtime.pending
              ? "处理中…"
              : tab === "diagnostics"
                ? "运行代码诊断"
                : tab === "docs"
                  ? docsLoaded
                    ? "检索选中文档"
                    : "加载章节索引"
                  : "生成官方 Playground"}
          </button>

          <div className="privacy-notice">
            <ShieldCheck size={14} />
            源码只按文本分析，不会读取宿主路径。文档请求被限制到 `svelte.dev` 官方章节索引与 llms.txt；Playground 内容编码进 URL hash，生成时不会上传 fragment。
          </div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="诊断、检索文档或导出 Playground"
          emptyDescription="三条工作流分别对应官方 autofixer、文档章节检索和多文件 Playground 链接生成。"
          hideRaw={
            (tab === "diagnostics" && (issues.length > 0 || suggestions.length > 0 || Boolean(payload))) ||
            (tab === "docs" && (markdown.length > 0 || sections.length > 0)) ||
            (tab === "playground" && Boolean(playgroundUrl))
          }
        >
          {tab === "diagnostics" && payload ? (
            <div className="svelte-diagnostics" data-testid="svelte-diagnostics">
              <div className="svelte-result-heading">
                <Code2 size={14} />
                <div>
                  <strong>诊断结果</strong>
                  <span>
                    {issues.length} 个问题 · {suggestions.length} 条建议
                    {requireAnother ? " · 修复后建议再次运行" : ""}
                  </span>
                </div>
              </div>
              {issues.length === 0 && suggestions.length === 0 ? (
                <div className="svelte-empty-hint" data-testid="svelte-diagnostics-clean">
                  未发现编译问题或迁移建议。
                </div>
              ) : null}
              {issues.map((issue, index) => (
                <div className="svelte-issue" data-testid="svelte-issue" key={`issue-${index}`}>
                  <strong>问题 {index + 1}</strong>
                  <pre>{issue}</pre>
                </div>
              ))}
              {suggestions.map((suggestion, index) => (
                <div className="svelte-suggestion" data-testid="svelte-suggestion" key={`suggestion-${index}`}>
                  <strong>建议 {index + 1}</strong>
                  <pre>{suggestion}</pre>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "docs" && markdown ? (
            <div className="svelte-docs" data-testid="svelte-docs">
              <div className="svelte-result-heading">
                <BookOpenText size={14} />
                <div>
                  <strong>官方文档</strong>
                  <span>{markdown.length.toLocaleString("zh-CN")} 字符 · {selectedSections.join(", ")}</span>
                </div>
              </div>
              <pre className="svelte-markdown" data-testid="svelte-markdown">{markdown}</pre>
            </div>
          ) : null}

          {tab === "playground" && playgroundUrl ? (
            <div className="svelte-playground-result" data-testid="svelte-playground-result">
              <div className="svelte-result-heading">
                <FileCode2 size={14} />
                <div>
                  <strong>官方 Playground 已生成</strong>
                  <span>代码位于 URL hash · 不会在生成时上传 fragment</span>
                </div>
              </div>
              <div className="button-row">
                <a
                  className="secondary-button"
                  data-testid="svelte-playground-open"
                  href={playgroundUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={12} />
                  在新标签打开
                </a>
              </div>
              <code className="svelte-playground-url" data-testid="svelte-playground-url">{playgroundUrl}</code>
              <iframe
                className="svelte-playground-frame"
                data-testid="svelte-playground-frame"
                title="Svelte Playground preview"
                src={playgroundUrl}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              />
            </div>
          ) : null}
        </ResultView>
      </div>
    </div>
  );
}

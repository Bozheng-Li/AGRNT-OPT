"use client";

import { useMemo, useState } from "react";
import {
  BadgeHelp,
  ClipboardCheck,
  FileCode2,
  FileSearch,
  Fingerprint,
  Gauge,
  ListChecks,
  Play,
  Plus,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Stethoscope,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";
import styles from "./docguard-workspace.module.css";

type ProjectFile = { path: string; content: string };
type TabId = "guard" | "score" | "claims" | "report" | "diagnose" | "explain";

const tabs = [
  { id: "guard", label: "全量守卫", icon: ScanSearch },
  { id: "score", label: "成熟度", icon: Gauge },
  { id: "claims", label: "声明核验", icon: ListChecks },
  { id: "report", label: "证据包", icon: Fingerprint },
  { id: "diagnose", label: "修复诊断", icon: Stethoscope },
  { id: "explain", label: "代码解释", icon: BadgeHelp },
] as const;

const toolByTab: Record<TabId, string> = {
  guard: "docguard_guard",
  score: "docguard_score",
  claims: "docguard_verify_claims",
  report: "docguard_report",
  diagnose: "docguard_diagnose",
  explain: "docguard_explain",
};

const driftExample: ProjectFile[] = [
  {
    path: ".docguard.json",
    content: JSON.stringify({
      projectName: "ledger-api",
      version: "1.0",
      profile: "standard",
      sourcePatterns: { routes: "src/**/*.js" },
    }, null, 2),
  },
  {
    path: "package.json",
    content: JSON.stringify({
      name: "ledger-api",
      version: "2.0.0",
      private: true,
      scripts: { test: "node --test" },
    }, null, 2),
  },
  {
    path: "README.md",
    content: "# Ledger API\n\nThe service supports 3 retries and 40 connections.\n\nSee `src/server.js`.\n",
  },
  {
    path: "docs-canonical/API-REFERENCE.md",
    content: [
      "# API Reference",
      "",
      "## Transfers",
      "",
      "The API permits 100 requests/min. See `src/server.js`.",
      "",
      "### POST /transfer",
      "Creates a transfer.",
      "",
      "Status values are PENDING, SETTLED, or FAILED.",
      "",
    ].join("\n"),
  },
  {
    path: "docs-canonical/ENVIRONMENT.md",
    content: "# Environment\n\n| Variable | Required | Description |\n| --- | --- | --- |\n| `DATABASE_URL` | Yes | Database |\n",
  },
  {
    path: ".env.example",
    content: "DATABASE_URL=postgres://localhost/ledger\nJWT_SECRET=change-me\n",
  },
  {
    path: "src/server.js",
    content: [
      "const MAX_RETRIES = 5;",
      "const MAX_CONNECTIONS = 80;",
      "const RATE_LIMIT = 250;",
      "const DATABASE_URL = process.env.DATABASE_URL;",
      "const JWT_SECRET = process.env.JWT_SECRET;",
      "const routes = ['POST /transfer', 'POST /reverse'];",
      "export { MAX_RETRIES, MAX_CONNECTIONS, RATE_LIMIT, DATABASE_URL, JWT_SECRET, routes };",
      "",
    ].join("\n"),
  },
];

const minimalExample: ProjectFile[] = [
  { path: "README.md", content: "# New service\n\n## Usage\n\nDocument the project here.\n" },
  { path: "src/index.js", content: "export const status = 'ready';\n" },
];

function cloneFiles(files: ProjectFile[]): ProjectFile[] {
  return files.map((file) => ({ ...file }));
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : [];
}

function label(value: unknown, fallback = "-"): string {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function suggestionText(value: unknown): string {
  if (typeof value === "string") return value;
  const item = object(value);
  return label(item.text, label(item.summary, label(item.pragma, "")));
}

function locationText(value: unknown): string {
  if (typeof value === "string") return value;
  const item = object(value);
  const file = label(item.file, "");
  const line = typeof item.line === "number" ? `:${item.line}` : "";
  return `${file}${line}` || "project://virtual";
}

export function DocGuardWorkspace() {
  const runtime = usePluginInvoke("docguard-drift-lab");
  const [tab, setTab] = useState<TabId>("guard");
  const [files, setFiles] = useState<ProjectFile[]>(() => cloneFiles(driftExample));
  const [activePath, setActivePath] = useState(driftExample[0].path);
  const [newPath, setNewPath] = useState("");
  const [findingCode, setFindingCode] = useState("STR001");
  const [localError, setLocalError] = useState<string | null>(null);
  const payload = useMemo(() => resultJson(runtime.result), [runtime.result]);
  const activeFile = files.find((file) => file.path === activePath) ?? files[0];
  const projectBytes = useMemo(
    () => files.reduce((sum, file) => sum + new TextEncoder().encode(file.path + file.content).length, 0),
    [files],
  );

  function switchTab(next: TabId) {
    setTab(next);
    setLocalError(null);
    runtime.setResult(null);
  }

  function loadExample(example: ProjectFile[]) {
    const next = cloneFiles(example);
    setFiles(next);
    setActivePath(next[0].path);
    setLocalError(null);
    runtime.setResult(null);
  }

  function updateActive(content: string) {
    setFiles((items) => items.map((file) => file.path === activeFile?.path ? { ...file, content } : file));
  }

  function addFile() {
    const path = newPath.trim().replaceAll("\\", "/");
    if (!/^[A-Za-z0-9._/-]+$/.test(path) || path.includes("..") || path.startsWith("/") || path.includes("//")) {
      setLocalError("请输入安全的项目相对路径。");
      return;
    }
    if (files.some((file) => file.path.toLowerCase() === path.toLowerCase())) {
      setLocalError("该文件路径已经存在。");
      return;
    }
    if (files.length >= 32) {
      setLocalError("单次虚拟项目最多 32 个文件。");
      return;
    }
    setFiles((items) => [...items, { path, content: "" }]);
    setActivePath(path);
    setNewPath("");
    setLocalError(null);
  }

  function removeActive() {
    if (!activeFile || files.length <= 1) {
      setLocalError("虚拟项目至少保留一个文件。");
      return;
    }
    const index = files.findIndex((file) => file.path === activeFile.path);
    const next = files.filter((file) => file.path !== activeFile.path);
    setFiles(next);
    setActivePath(next[Math.min(index, next.length - 1)].path);
    runtime.setResult(null);
  }

  async function run() {
    setLocalError(null);
    if (projectBytes > 512 * 1024) {
      setLocalError("虚拟项目超过 512 KiB 安全上限。");
      return;
    }
    const tool = toolByTab[tab];
    try {
      await runtime.invoke(tool, tab === "explain" ? { code: findingCode } : { files });
    } catch {
      // The shared result view renders public API errors.
    }
  }

  const findings = list(payload?.findings);
  const scoreCategories = Object.entries(object(payload?.categories));
  const claimTasks = list(payload?.tasks);
  const problems = list(payload?.problems);
  const reportGuard = object(payload?.guard);
  const reportScore = object(payload?.score);
  const alcoa = object(payload?.alcoa);

  return (
    <div className={`workspace-card ${styles.workspace}`}>
      <div className="workspace-bar">
        <div className="workspace-bar-title"><FileSearch size={14} />DocGuard 文档漂移实验室</div>
        <span className="badge low"><ShieldCheck size={10} />只读虚拟项目 · 0.33.1</span>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="DocGuard 工具">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? styles.activeTab : ""}
              data-testid={`docguard-tab-${item.id}`}
              key={item.id}
              onClick={() => switchTab(item.id)}
            >
              <Icon size={12} />{item.label}
            </button>
          );
        })}
      </div>

      <div className={`workspace-body ${styles.layout}`}>
        <div className={`control-panel ${styles.controls}`}>
          {tab === "explain" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="docguard-code">Finding code <span>例如 STR001</span></label>
              <input
                id="docguard-code"
                data-testid="docguard-code"
                className="field-input code"
                value={findingCode}
                maxLength={16}
                onChange={(event) => setFindingCode(event.target.value.toUpperCase())}
              />
            </div>
          ) : (
            <>
              <div className={styles.presets}>
                <button type="button" className="secondary-button" onClick={() => loadExample(driftExample)}>
                  <TriangleAlert size={12} />漂移示例
                </button>
                <button type="button" className="secondary-button" onClick={() => loadExample(minimalExample)}>
                  <RotateCcw size={12} />最小项目
                </button>
              </div>

              <div className={styles.projectMeta} data-testid="docguard-project-meta">
                <span><FileCode2 size={11} />{files.length} 个文件</span>
                <code>{(projectBytes / 1024).toFixed(1)} KiB / 512 KiB</code>
              </div>

              <div className={styles.fileList} aria-label="虚拟项目文件">
                {files.map((file) => (
                  <button
                    type="button"
                    className={file.path === activeFile?.path ? styles.activeFile : ""}
                    key={file.path}
                    title={file.path}
                    onClick={() => setActivePath(file.path)}
                  >
                    <FileCode2 size={11} /><span>{file.path}</span>
                  </button>
                ))}
              </div>

              <div className={styles.addRow}>
                <input
                  className="field-input code"
                  aria-label="新文件相对路径"
                  placeholder="docs-canonical/SECURITY.md"
                  value={newPath}
                  onChange={(event) => setNewPath(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") addFile(); }}
                />
                <button type="button" title="添加文件" aria-label="添加文件" onClick={addFile}><Plus size={14} /></button>
                <button type="button" title="删除当前文件" aria-label="删除当前文件" onClick={removeActive}><Trash2 size={14} /></button>
              </div>

              {activeFile ? (
                <div className="field-group">
                  <label className="field-label" htmlFor="docguard-editor">{activeFile.path}<span>{activeFile.content.length} chars</span></label>
                  <textarea
                    id="docguard-editor"
                    data-testid="docguard-editor"
                    className={`field-textarea code ${styles.editor}`}
                    spellCheck={false}
                    value={activeFile.content}
                    onChange={(event) => updateActive(event.target.value)}
                  />
                </div>
              ) : null}
            </>
          )}

          <button
            type="button"
            className="primary-button"
            data-testid="docguard-run"
            disabled={runtime.pending || (tab !== "explain" && files.length === 0)}
            onClick={run}
          >
            <Play size={13} fill="currentColor" />{runtime.pending ? "正在检查" : tabs.find((item) => item.id === tab)?.label}
          </button>
          <div className={styles.boundary}><ShieldCheck size={13} /><span>项目随调用销毁</span><span>无写入</span><span>无网络</span><span>无命令</span></div>
        </div>

        <ResultView
          result={runtime.result}
          error={localError ?? runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="等待文档审计"
          emptyDescription=""
          hideRaw
        >
          {payload && tab === "guard" ? (
            <div className={styles.results} data-testid="docguard-guard-result">
              <div className={styles.metrics}>
                <span className={styles.verdict}><strong>{label(payload.status)}</strong><small>守卫结论</small></span>
                <span><strong>{label(payload.passed, "0")}/{label(payload.total, "0")}</strong><small>通过检查</small></span>
                <span><strong>{label(payload.errors, "0")}</strong><small>错误</small></span>
                <span><strong>{label(payload.warnings, "0")}</strong><small>警告</small></span>
              </div>
              <div className={styles.resultHeading}><ClipboardCheck size={14} /><strong>结构化 findings</strong><span>{findings.length} 条</span></div>
              <div className={styles.findings}>
                {findings.slice(0, 40).map((finding, index) => (
                  <article key={`${label(finding.code)}-${index}`}>
                    <header><code>{label(finding.code, "INFO")}</code><strong>{label(finding.validator, "validator")}</strong><span>{label(finding.severity)}</span></header>
                    <p>{label(finding.message)}</p>
                    <footer><span>{locationText(finding.location)}</span>{suggestionText(finding.suggestion) ? <small>{suggestionText(finding.suggestion)}</small> : null}</footer>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {payload && tab === "score" ? (
            <div className={styles.results} data-testid="docguard-score-result">
              <div className={styles.scoreHero}><Gauge size={24} /><strong>{label(payload.score)}</strong><span>{label(payload.grade)} 级</span></div>
              <div className={styles.scoreList}>
                {scoreCategories.map(([name, value]) => {
                  const score = typeof value === "number" ? value : 0;
                  return <div key={name}><span>{name}</span><div><i style={{ width: `${Math.max(0, Math.min(100, score))}%` }} /></div><strong>{score}</strong></div>;
                })}
              </div>
            </div>
          ) : null}

          {payload && tab === "claims" ? (
            <div className={styles.results} data-testid="docguard-claims-result">
              <div className={styles.resultHeading}><ListChecks size={14} /><strong>{label(payload.claimCount, "0")} 项语义声明</strong><span>确定性提取</span></div>
              <div className={styles.claims}>
                {claimTasks.map((task) => (
                  <article key={label(task.id)}>
                    <header><code>{label(task.id)}</code><span>{label(task.kind)}</span></header>
                    <strong>{label(task.claim)}</strong>
                    <p>{label(task.instruction)}</p>
                    <small>{label(task.doc)}:{label(task.line)} · {label(task.citedCode, "未引用代码")}</small>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {payload && tab === "report" ? (
            <div className={styles.results} data-testid="docguard-report-result">
              <div className={styles.evidenceTop}><Fingerprint size={22} /><div><span>可复核证据指纹</span><code>{label(payload.integrity)}</code></div></div>
              <div className={styles.metrics}>
                <span><strong>{label(reportGuard.status)}</strong><small>Guard</small></span>
                <span><strong>{label(reportScore.score)}</strong><small>CDD score</small></span>
                <span><strong>{label(alcoa.score, "-")}%</strong><small>ALCOA+</small></span>
                <span><strong>{label(object(payload.tool).version)}</strong><small>工具版本</small></span>
              </div>
              <pre className={styles.rawEvidence}>{JSON.stringify(payload, null, 2)}</pre>
            </div>
          ) : null}

          {payload && tab === "diagnose" ? (
            <div className={styles.results} data-testid="docguard-diagnose-result">
              <div className={styles.resultHeading}><Stethoscope size={14} /><strong>{problems.length} 组修复队列</strong><span>{label(payload.status)}</span></div>
              <div className={styles.problems}>
                {problems.map((problem, index) => {
                  const problemFindings = list(problem.findings);
                  return (
                    <section key={`${label(problem.key)}-${index}`}>
                      <header><strong>{label(problem.validator)}</strong><code>{label(problem.key)}</code><span>{label(problem.severity)}</span></header>
                      {problemFindings.map((finding, findingIndex) => (
                        <article key={`${label(finding.code)}-${findingIndex}`}><code>{label(finding.code)}</code><p>{label(finding.message)}</p><small>{suggestionText(finding.suggestion)}</small></article>
                      ))}
                    </section>
                  );
                })}
              </div>
            </div>
          ) : null}

          {payload && tab === "explain" ? (
            <div className={styles.results} data-testid="docguard-explain-result">
              <div className={styles.explainTop}><BadgeHelp size={22} /><div><code>{label(payload.code)}</code><strong>{label(payload.title)}</strong><span>{label(payload.validator)}</span></div></div>
              <div className={styles.explanation}><p>{label(payload.help)}</p>{payload.suppress ? <code>{label(payload.suppress)}</code> : <span>该 finding 不提供内联抑制。</span>}</div>
            </div>
          ) : null}
        </ResultView>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  FileCode2,
  Library,
  Play,
  Plus,
  Scale,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, resultText, usePluginInvoke } from "./use-plugin-invoke";
import styles from "./bouncer-workspace.module.css";

type ToolId = "compliance_check" | "list_rules" | "explain_rule" | "list_packs";
type PackId = "uk-osa" | "uk-aadc";
type VirtualFile = { path: string; content: string };

const tools = [
  { id: "compliance_check", label: "项目体检", icon: ScanSearch },
  { id: "list_rules", label: "规则清单", icon: BookOpenCheck },
  { id: "explain_rule", label: "规则解释", icon: CircleHelp },
  { id: "list_packs", label: "上游规则包", icon: Library },
] as const;

const passingProject: VirtualFile[] = [
  {
    path: "app/signup/page.tsx",
    content: `export function Signup() {
  const dateOfBirth = "2000-01-01";
  const ageAssurance = "persona-id-verification";
  const parentalConsent = "guardian-consent-under-13";
  return <form>{dateOfBirth}{ageAssurance}{parentalConsent}</form>;
}`,
  },
  {
    path: "components/chat/Chat.tsx",
    content: `export function ChatControls() {
  const reportContent = () => "report message abuse";
  const blockUser = () => "mute user";
  const moderationQueue = "profanity content filter";
  return <button onClick={reportContent}>{blockUser.name}{moderationQueue}</button>;
}`,
  },
  {
    path: "app/profile/settings/ProfileSettings.tsx",
    content: `export const privacyDefaults = {
  profileVisibility: "private",
  defaultValue: true,
};
export const locationDefaults = {
  locationSharing: false,
  initialState: "off",
};`,
  },
  {
    path: "governance/dpia.md",
    content: `# Data Protection Impact Assessment (DPIA)
Our illegal content risk assessment and children's access risk assessment are reviewed quarterly.
The CSAM and CSEA escalation route sends eligible reports to NCMEC and IWF.
Community guidelines prohibit illegal content and describe enforcement under the acceptable use policy.`,
  },
];

const failingProject: VirtualFile[] = [
  {
    path: "app/signup/page.tsx",
    content: `export function Signup() {
  return <label><input type="checkbox" aria-label="I am over 18" />I am over 18</label>;
}`,
  },
  {
    path: "components/chat/Chat.tsx",
    content: `export function Chat() {
  return <section>Messages appear here.</section>;
}`,
  },
];

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function cloneFiles(files: VirtualFile[]): VirtualFile[] {
  return files.map((file) => ({ ...file }));
}

function statusLabel(status: unknown): string {
  if (status === "pass") return "已找到控制";
  if (status === "fail") return "缺少控制";
  return "无法判断";
}

function statusIcon(status: unknown) {
  if (status === "pass") return <CheckCircle2 size={13} />;
  if (status === "fail") return <TriangleAlert size={13} />;
  return <CircleDashed size={13} />;
}

export function BouncerWorkspace() {
  const [tool, setTool] = useState<ToolId>("compliance_check");
  const [adapter, setAdapter] = useState<"next" | "react-native">("next");
  const [packs, setPacks] = useState<PackId[]>(["uk-osa", "uk-aadc"]);
  const [status, setStatus] = useState<"all" | "fail" | "unknown">("all");
  const [files, setFiles] = useState<VirtualFile[]>(cloneFiles(failingProject));
  const [activeFile, setActiveFile] = useState(0);
  const [ruleId, setRuleId] = useState("aadc.geolocation-default-off");
  const [localError, setLocalError] = useState<string | null>(null);
  const runtime = usePluginInvoke("bouncer-compliance-studio");
  const payload = useMemo(() => resultJson(runtime.result), [runtime.result]);

  const findings = records(payload?.findings);
  const rules = records(payload?.rules);
  const upstreamPacks = records(payload?.packs);
  const totals = payload?.totals && typeof payload.totals === "object"
    ? payload.totals as Record<string, unknown>
    : null;
  const currentFile = files[activeFile] ?? files[0];

  function switchTool(next: ToolId) {
    setTool(next);
    setLocalError(null);
    runtime.setResult(null);
  }

  function togglePack(pack: PackId) {
    setPacks((current) => {
      if (current.includes(pack)) return current.length === 1 ? current : current.filter((item) => item !== pack);
      return [...current, pack];
    });
  }

  function loadExample(example: "pass" | "fail") {
    setFiles(cloneFiles(example === "pass" ? passingProject : failingProject));
    setActiveFile(0);
    setLocalError(null);
    runtime.setResult(null);
  }

  function updateFile(field: keyof VirtualFile, value: string) {
    setFiles((current) => current.map((file, index) => index === activeFile ? { ...file, [field]: value } : file));
  }

  function addFile() {
    setFiles((current) => {
      const used = new Set(current.map((file) => file.path));
      let index = current.length + 1;
      while (used.has(`app/Control${index}.tsx`)) index += 1;
      const next = [...current, { path: `app/Control${index}.tsx`, content: "export function Control() {\n  return null;\n}\n" }];
      setActiveFile(next.length - 1);
      return next;
    });
  }

  function removeFile() {
    if (files.length === 1) {
      setLocalError("至少保留一个内联文件。");
      return;
    }
    setFiles((current) => current.filter((_, index) => index !== activeFile));
    setActiveFile((current) => Math.max(0, current - 1));
  }

  async function run() {
    setLocalError(null);
    try {
      if (tool === "compliance_check") {
        await runtime.invoke(tool, { adapter, packs, status, files });
      } else if (tool === "list_rules") {
        await runtime.invoke(tool, { adapter, packs });
      } else if (tool === "explain_rule") {
        await runtime.invoke(tool, { adapter, packs, ruleId });
      } else {
        await runtime.invoke(tool, {});
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Bouncer 调用失败。");
    }
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Scale size={14} />Bouncer 合规控制体检台</div>
        <span className="badge low">确定性静态检查 · 非法律意见</span>
      </div>

      <div className={styles.toolTabs} role="tablist" aria-label="Bouncer 工具">
        {tools.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tool === item.id}
              className={tool === item.id ? styles.activeTab : ""}
              data-testid={`bouncer-tab-${item.id}`}
              onClick={() => switchTool(item.id)}
            >
              <Icon size={13} />{item.label}
            </button>
          );
        })}
      </div>

      <div className={`workspace-body ${styles.layout}`}>
        <section className={`control-panel ${styles.controls}`} aria-label="Bouncer 输入">
          {tool !== "list_packs" ? (
            <div className={styles.compactGrid}>
              <div className="field-group">
                <label className="field-label" htmlFor="bouncer-adapter">项目技术栈</label>
                <select
                  id="bouncer-adapter"
                  data-testid="bouncer-adapter"
                  className="field-input"
                  value={adapter}
                  onChange={(event) => setAdapter(event.target.value as "next" | "react-native")}
                >
                  <option value="next">Next.js App Router</option>
                  <option value="react-native">React Native / Expo</option>
                </select>
              </div>
              <div className="field-group">
                <span className="field-label">UK 规则包</span>
                <div className={styles.packChoices}>
                  <button type="button" aria-pressed={packs.includes("uk-osa")} data-testid="bouncer-pack-uk-osa" onClick={() => togglePack("uk-osa")}>Ofcom OSA</button>
                  <button type="button" aria-pressed={packs.includes("uk-aadc")} data-testid="bouncer-pack-uk-aadc" onClick={() => togglePack("uk-aadc")}>ICO Children&apos;s Code</button>
                </div>
              </div>
            </div>
          ) : null}

          {tool === "compliance_check" ? (
            <>
              <div className={styles.exampleRow}>
                <button type="button" className="secondary-button" data-testid="bouncer-example-fail" onClick={() => loadExample("fail")}><TriangleAlert size={12} />载入缺口示例</button>
                <button type="button" className="secondary-button" data-testid="bouncer-example-pass" onClick={() => loadExample("pass")}><Sparkles size={12} />载入完整示例</button>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="bouncer-status">结果范围</label>
                <select id="bouncer-status" data-testid="bouncer-status" className="field-input" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                  <option value="all">全部：pass / fail / unknown</option>
                  <option value="fail">只看明确缺少的控制</option>
                  <option value="unknown">需处理：fail + unknown</option>
                </select>
              </div>

              <div className={styles.fileHeader}>
                <span className="field-label">内联项目文件 <small>{files.length}/48</small></span>
                <div>
                  <button type="button" aria-label="新增内联文件" data-testid="bouncer-add-file" onClick={addFile}><Plus size={13} /></button>
                  <button type="button" aria-label="删除当前内联文件" data-testid="bouncer-remove-file" onClick={removeFile}><Trash2 size={13} /></button>
                </div>
              </div>
              <div className={styles.fileTabs} role="tablist" aria-label="内联文件">
                {files.map((file, index) => (
                  <button key={`${file.path}-${index}`} type="button" role="tab" aria-selected={activeFile === index} className={activeFile === index ? styles.activeFile : ""} onClick={() => setActiveFile(index)}>
                    <FileCode2 size={11} />{file.path || `未命名 ${index + 1}`}
                  </button>
                ))}
              </div>
              {currentFile ? (
                <div className={styles.editorStack}>
                  <div className="field-group">
                    <label className="field-label" htmlFor="bouncer-file-path">沙箱相对文件名</label>
                    <input id="bouncer-file-path" data-testid="bouncer-file-path" className="field-input" value={currentFile.path} onChange={(event) => updateFile("path", event.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="bouncer-file-content">静态文本内容</label>
                    <textarea id="bouncer-file-content" data-testid="bouncer-file-content" className={`field-textarea ${styles.codeEditor}`} value={currentFile.content} onChange={(event) => updateFile("content", event.target.value)} spellCheck={false} />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {tool === "explain_rule" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="bouncer-rule-id">固定规则 ID</label>
              <input id="bouncer-rule-id" data-testid="bouncer-rule-id" className="field-input" value={ruleId} onChange={(event) => setRuleId(event.target.value)} placeholder="aadc.geolocation-default-off" />
            </div>
          ) : null}

          {tool === "list_packs" ? (
            <div className={styles.catalogIntro}>
              <Library size={22} />
              <div><strong>读取 0.2.0 内置目录</strong><span>上游还带有 Nigeria 规则包；本 Web 的项目体检只开放 UK OSA 与 ICO Children&apos;s Code。</span></div>
            </div>
          ) : null}

          <button type="button" className="primary-button" data-testid="bouncer-run" onClick={run} disabled={runtime.pending}>
            <Play size={13} />{runtime.pending ? "正在运行静态检查…" : `运行${tools.find((item) => item.id === tool)?.label}`}
          </button>
          <div className="sandbox-notice"><ShieldCheck size={14} />仅将有界内联文本写入一次性沙箱；不接受宿主路径、URL、仓库克隆、命令或自定义规则包。进程禁网、禁子进程并清除凭据。</div>
          <div className={styles.legalNotice}><Scale size={14} /><span><strong>不是法律意见。</strong>Bouncer 只查找规则包定义的代码证据；100 分不代表满足法律义务，也不能替代法务、DPO 或合规审查。</span></div>
        </section>

        <ResultView
          result={runtime.result}
          error={localError ?? runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="等待一次 Bouncer 检查"
          emptyDescription="选择真实 MCP 工具；结果会区分命中、缺口和无法定位，而不是把 unknown 当作通过。"
          hideRaw
        >
          {runtime.result?.isError ? <pre className={styles.upstreamError} data-testid="bouncer-upstream-error">{resultText(runtime.result)}</pre> : null}

          {tool === "compliance_check" && payload && !runtime.result?.isError ? (
            <div className={styles.resultStack}>
              <div className={styles.scoreGrid}>
                <div className={styles.scoreCard}><span>静态命中率</span><strong data-testid="bouncer-score">{String(payload.score ?? "—")}</strong><small>/ 100</small></div>
                <div><span>已找到</span><strong>{String(totals?.pass ?? 0)}</strong></div>
                <div><span>缺少</span><strong>{String(totals?.fail ?? 0)}</strong></div>
                <div><span>无法判断</span><strong>{String(totals?.unknown ?? 0)}</strong></div>
              </div>
              <div className={styles.boundaryLine}>扫描 {String((payload.meta as Record<string, unknown> | undefined)?.filesScanned ?? 0)} 个内联文件 · {String((payload.meta as Record<string, unknown> | undefined)?.repo ?? "inline://project")}</div>
              <div className={styles.findings} data-testid="bouncer-findings">
                {findings.length === 0 ? <div className={styles.noRows}>当前筛选没有返回规则。</div> : findings.map((finding) => {
                  const hits = records(finding.hits);
                  return (
                    <article key={String(finding.ruleId)} className={`${styles.finding} ${styles[String(finding.status)] ?? ""}`}>
                      <div className={styles.findingHead}>
                        <span>{statusIcon(finding.status)}{statusLabel(finding.status)}</span>
                        <code>{String(finding.ruleId)}</code>
                        <em>{String(finding.severity)}</em>
                      </div>
                      <h4>{String(finding.standard)}</h4>
                      <p>{String(finding.intent)}</p>
                      {finding.status !== "pass" ? <div className={styles.fix}><strong>工程提示</strong>{String(finding.fix)}</div> : null}
                      {hits.length > 0 ? (
                        <div className={styles.hits}>{hits.map((hit, index) => <code key={`${String(hit.file)}-${String(hit.line)}-${index}`}>{String(hit.file)}:{String(hit.line)} · {String(hit.excerpt)}</code>)}</div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          {tool === "list_rules" && payload && !runtime.result?.isError ? (
            <div className={styles.ruleList} data-testid="bouncer-rules">
              <div className={styles.resultTitle}><BookOpenCheck size={15} /><strong>{rules.length} 条固定 UK 规则</strong><span>只读目录，不扫描文件</span></div>
              {rules.map((rule) => (
                <article key={String(rule.ruleId)}>
                  <div><code>{String(rule.ruleId)}</code><em>{String(rule.severity)}</em></div>
                  <h4>{String(rule.standard)}</h4>
                  <p>{String(rule.intent)}</p>
                </article>
              ))}
            </div>
          ) : null}

          {tool === "explain_rule" && payload && !runtime.result?.isError ? (
            <article className={styles.explanation} data-testid="bouncer-explanation">
              <div className={styles.resultTitle}><CircleHelp size={15} /><strong>{String(payload.id)}</strong><span>{String(payload.authority)}</span></div>
              <h3>{String(payload.standard)}</h3>
              <dl>
                <div><dt>规则意图</dt><dd>{String(payload.intent)}</dd></div>
                <div><dt>工程提示</dt><dd>{String(payload.fix)}</dd></div>
                <div><dt>静态判断方式</dt><dd>{Array.isArray(payload.checks) ? payload.checks.map((line, index) => <code key={`${String(line)}-${index}`}>{String(line)}</code>) : "—"}</dd></div>
              </dl>
            </article>
          ) : null}

          {tool === "list_packs" && payload && !runtime.result?.isError ? (
            <div className={styles.packCatalog} data-testid="bouncer-packs">
              <div className={styles.resultTitle}><Library size={15} /><strong>{upstreamPacks.length} 个上游内置包</strong><span>项目体检仅开放两项 UK 包</span></div>
              {upstreamPacks.map((pack) => {
                const uk = String(pack.id).startsWith("uk-");
                return (
                  <article key={String(pack.id)} className={uk ? styles.ukPack : ""}>
                    <div><code>{String(pack.id)}</code><span>{String(pack.rules)} 条规则</span></div>
                    <h4>{String(pack.title)}</h4>
                    <p>{String(pack.authority)}</p>
                    <small>{uk ? "Web 项目体检已开放" : "仅展示上游目录，Web 未开放扫描"}</small>
                  </article>
                );
              })}
            </div>
          ) : null}
        </ResultView>
      </div>
    </div>
  );
}

"use client";

import {
  Boxes,
  CheckCircle2,
  ClipboardList,
  FileQuestion,
  Gauge,
  Layers3,
  Play,
  RefreshCw,
  Route,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";
import styles from "./uxloom-workspace.module.css";

const journeyExample = JSON.stringify({
  id: "checkout",
  goal: "Place an order without losing entered payment context",
  entry: "cart",
  states: {
    cart: { screen: "cart", on: { CONTINUE: "payment" } },
    payment: { screen: "payment", on: { SUCCESS: "done", FAILURE: "payment#error" } },
    done: { screen: "confirmation", final: true },
  },
}, null, 2);

const incompleteScreen = JSON.stringify({
  id: "payment",
  intent: "Collect payment with minimum anxiety",
  requiredStates: ["default", "loading", "error", "success"],
  designedStates: ["default"],
  platforms: ["web", "mweb"],
  components: [{
    id: "pay",
    semantic: "Button.Primary",
    interactive: true,
    minTargetPx: 32,
    label: { key: "checkout.pay", en: "Pay now", maxChars: 12 },
    fg: "#777777",
    bg: "#ffffff",
  }],
}, null, 2);

const completeScreen = JSON.stringify({
  id: "payment",
  intent: "Collect payment with minimum anxiety",
  requiredStates: ["default", "loading", "error", "success"],
  designedStates: ["default", "loading", "error", "success"],
  exemptions: [{ state: "empty", reason: "Payment fields are always rendered and cannot be empty." }],
  platforms: ["web", "mweb"],
  components: [{
    id: "pay",
    semantic: "Button.Primary",
    interactive: true,
    minTargetPx: 48,
    label: { key: "checkout.pay", en: "Pay now", maxChars: 18 },
    fg: "#ffffff",
    bg: "#1d4ed8",
  }],
}, null, 2);

const briefAnswersExample = JSON.stringify({
  platforms: ["web", "mweb"],
  journeys: [{ name: "checkout", goal: "Complete an order" }],
  audience: "Returning shopper using a phone with intermittent connectivity",
  offline: true,
  brand: { primaryColor: "#1d4ed8", tone: "calm and direct", typeface: "Inter" },
}, null, 2);

const tabs = [
  { id: "project", label: "项目", icon: Boxes },
  { id: "brief", label: "设计简报", icon: FileQuestion },
  { id: "journey", label: "旅程", icon: Route },
  { id: "screen", label: "屏幕", icon: Layers3 },
  { id: "validate", label: "项目体检", icon: ScanSearch },
  { id: "critique", label: "单屏体检", icon: ClipboardList },
  { id: "coverage", label: "覆盖率", icon: Gauge },
] as const;

type TabId = (typeof tabs)[number]["id"];
type Finding = {
  critic?: unknown;
  code?: unknown;
  severity?: unknown;
  journey?: unknown;
  state?: unknown;
  screen?: unknown;
  component?: unknown;
  message?: unknown;
  fix?: unknown;
};

function parseObject(text: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label}不是有效 JSON。`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}必须是 JSON 对象。`);
  return value as Record<string, unknown>;
}

function text(value: unknown, fallback = "-"): string {
  return typeof value === "string" && value ? value : fallback;
}

export function UxloomWorkspace() {
  const [sessionId, setSessionId] = useState("");
  const [tab, setTab] = useState<TabId>("project");
  const [name, setName] = useState("Checkout Studio");
  const [platformSelection, setPlatformSelection] = useState(["web", "mweb"]);
  const [prompt, setPrompt] = useState("Design a resilient mobile checkout that preserves progress and explains payment failures.");
  const [briefAnswers, setBriefAnswers] = useState(briefAnswersExample);
  const [journeyJson, setJourneyJson] = useState(journeyExample);
  const [screenJson, setScreenJson] = useState(incompleteScreen);
  const [screenId, setScreenId] = useState("payment");
  const [localError, setLocalError] = useState<string | null>(null);
  const runtime = usePluginInvoke("uxloom-journey-studio");
  const payload = useMemo(() => resultJson(runtime.result), [runtime.result]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSessionId(crypto.randomUUID()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const findings = useMemo(() => {
    if (!payload) return [] as Finding[];
    if (Array.isArray(payload.findings)) return payload.findings as Finding[];
    return [] as Finding[];
  }, [payload]);
  const groupedFindings = useMemo(() => {
    const groups = new Map<string, Finding[]>();
    findings.forEach((finding) => {
      const key = text(finding.critic, "其他检查");
      groups.set(key, [...(groups.get(key) ?? []), finding]);
    });
    return [...groups.entries()];
  }, [findings]);

  function switchTab(next: TabId) {
    setTab(next);
    setLocalError(null);
    runtime.setResult(null);
  }

  function togglePlatform(value: string) {
    setPlatformSelection((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value]);
  }

  function resetSession() {
    setSessionId(crypto.randomUUID());
    setTab("project");
    setLocalError(null);
    runtime.setResult(null);
  }

  async function invoke(tool: string, args: Record<string, unknown>) {
    if (!sessionId) throw new Error("会话正在初始化，请稍后重试。");
    return runtime.invoke(tool, { sessionId, ...args });
  }

  async function run() {
    setLocalError(null);
    try {
      if (tab === "project") await invoke("project_init", { name, platforms: platformSelection });
      if (tab === "brief") await invoke("brief_start", { prompt });
      if (tab === "journey") await invoke("journey_define", { journey: parseObject(journeyJson, "旅程") });
      if (tab === "screen") await invoke("screen_register", { screen: parseObject(screenJson, "屏幕") });
      if (tab === "validate") await invoke("project_validate", {});
      if (tab === "critique") await invoke("screen_critique", { screenId });
      if (tab === "coverage") await invoke("coverage_report", {});
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "UXLoom 调用失败。");
    }
  }

  async function submitBrief() {
    setLocalError(null);
    try {
      await invoke("brief_answer", { prompt, answers: parseObject(briefAnswers, "简报答案") });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "UXLoom 简报提交失败。");
    }
  }

  const summary = payload?.summary as Record<string, unknown> | undefined;
  const coverage = summary?.stateCoverage as Record<string, unknown> | undefined;
  const questions = Array.isArray(payload?.inputRequests) ? payload.inputRequests as Array<Record<string, unknown>> : [];
  const brief = payload?.brief as Record<string, unknown> | undefined;
  const ledger = Array.isArray(brief?.assumptionLedger) ? brief.assumptionLedger as Array<Record<string, unknown>> : [];
  const perScreen = Array.isArray(payload?.perScreen) ? payload.perScreen as Array<Record<string, unknown>> : [];

  return (
    <div className={`workspace-card ${styles.workspace}`}>
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Sparkles size={14} />UXLoom 旅程与状态设计台</div>
        <div className={styles.sessionControls}>
          <code title={sessionId}>{sessionId ? sessionId.slice(0, 8) : "准备中"}</code>
          <button type="button" title="重置会话" aria-label="重置会话" data-testid="uxloom-reset" onClick={resetSession}>
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="UXLoom 工作流">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? styles.activeTab : ""}
              data-testid={`uxloom-tab-${item.id}`}
              onClick={() => switchTab(item.id)}
            >
              <Icon size={12} />{item.label}
            </button>
          );
        })}
      </div>

      <div className={`workspace-body ${styles.layout}`}>
        <div className={`control-panel ${styles.controls}`}>
          {tab === "project" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="uxloom-name">产品名称</label>
                <input id="uxloom-name" data-testid="uxloom-name" className="field-input" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <fieldset className={styles.platforms}>
                <legend>目标平台</legend>
                {(["web", "mweb", "ios", "android"] as const).map((item) => (
                  <label key={item}>
                    <input type="checkbox" checked={platformSelection.includes(item)} onChange={() => togglePlatform(item)} />
                    <span>{item}</span>
                  </label>
                ))}
              </fieldset>
            </>
          ) : null}

          {tab === "brief" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="uxloom-prompt">产品与设计请求</label>
                <textarea id="uxloom-prompt" data-testid="uxloom-prompt" className={`field-textarea ${styles.prompt}`} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="uxloom-answers">结构化答案 <span>可省略未知项</span></label>
                <textarea id="uxloom-answers" data-testid="uxloom-answers" className={`field-textarea ${styles.editor}`} value={briefAnswers} onChange={(event) => setBriefAnswers(event.target.value)} spellCheck={false} />
              </div>
            </>
          ) : null}

          {tab === "journey" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="uxloom-journey">旅程状态机 JSON</label>
              <textarea id="uxloom-journey" data-testid="uxloom-journey" className={`field-textarea ${styles.largeEditor}`} value={journeyJson} onChange={(event) => setJourneyJson(event.target.value)} spellCheck={false} />
            </div>
          ) : null}

          {tab === "screen" ? (
            <>
              <div className={styles.examples}>
                <button type="button" className="secondary-button" data-testid="uxloom-example-incomplete" onClick={() => setScreenJson(incompleteScreen)}><TriangleAlert size={12} />缺失状态示例</button>
                <button type="button" className="secondary-button" data-testid="uxloom-example-complete" onClick={() => setScreenJson(completeScreen)}><CheckCircle2 size={12} />完整屏幕示例</button>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="uxloom-screen">屏幕契约 JSON</label>
                <textarea id="uxloom-screen" data-testid="uxloom-screen" className={`field-textarea ${styles.largeEditor}`} value={screenJson} onChange={(event) => setScreenJson(event.target.value)} spellCheck={false} />
              </div>
            </>
          ) : null}

          {tab === "critique" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="uxloom-screen-id">屏幕 ID</label>
              <input id="uxloom-screen-id" data-testid="uxloom-screen-id" className="field-input" value={screenId} onChange={(event) => setScreenId(event.target.value)} />
            </div>
          ) : null}

          {tab === "validate" || tab === "coverage" ? (
            <div className={styles.scopeCard}>
              {tab === "validate" ? <ScanSearch size={18} /> : <Gauge size={18} />}
              <div><strong>{tab === "validate" ? "当前会话项目" : "状态契约覆盖"}</strong><span>{tab === "validate" ? "旅程、状态、WCAG、触控目标与文案扩展" : "逐屏对照 requiredStates 与 designedStates"}</span></div>
            </div>
          ) : null}

          <button type="button" className="primary-button" data-testid="uxloom-run" onClick={run} disabled={!sessionId || runtime.pending}>
            <Play size={13} />{runtime.pending ? "正在检查..." : tab === "brief" ? "生成问卷" : `运行${tabs.find((item) => item.id === tab)?.label}`}
          </button>
          {tab === "brief" ? (
            <button type="button" className="secondary-button" data-testid="uxloom-submit-brief" onClick={submitBrief} disabled={!sessionId || runtime.pending}>
              <ClipboardList size={13} />提交简报答案
            </button>
          ) : null}
          <div className="sandbox-notice"><ShieldCheck size={14} />每个 UUID 只对应一个项目文件；路径、命令、网络、凭据和其他会话均不开放。</div>
        </div>

        <ResultView
          result={runtime.result}
          error={localError ?? runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="把界面数量变成可验证的状态覆盖"
          emptyDescription="先初始化项目，再登记旅程、屏幕契约与组件约束。"
          hideRaw={Boolean(payload)}
        >
          {payload ? (
            <div className={styles.results} data-testid="uxloom-result">
              {tab === "project" && payload.project ? (
                <div className={styles.projectSummary} data-testid="uxloom-project-summary">
                  <CheckCircle2 size={18} />
                  <div><strong>{text((payload.project as Record<string, unknown>).name)}</strong><span>{String((payload.project as Record<string, unknown>).formatVersion)} · {String(((payload.project as Record<string, unknown>).platforms as unknown[])?.join(", "))}</span></div>
                  <code>{text(payload.path)}</code>
                </div>
              ) : null}

              {questions.length ? (
                <div className={styles.questionList} data-testid="uxloom-questions">
                  {questions.map((question) => (
                    <article key={text(question.id)}>
                      <header><code>{text(question.id)}</code><span className={question.askHuman ? styles.human : styles.agent}>{question.askHuman ? "需用户判断" : "可从上下文推断"}</span></header>
                      <strong>{text(question.question)}</strong>
                      <p>{text(question.rationale)}</p>
                      <small>默认值：{JSON.stringify(question.default)}</small>
                    </article>
                  ))}
                </div>
              ) : null}

              {brief ? (
                <div className={styles.briefResult} data-testid="uxloom-brief-result">
                  <div className={styles.resultHeading}><ClipboardList size={15} /><strong>简报已编译</strong><span>{ledger.length} 项默认假设</span></div>
                  {ledger.length ? ledger.map((item, index) => (
                    <article key={`${text(item.question)}-${index}`}>
                      <strong>{text(item.question)}</strong>
                      <code>{JSON.stringify(item.assumed)}</code>
                      <p>{text(item.rationale)}</p>
                    </article>
                  )) : <div className={styles.cleanLine}><CheckCircle2 size={14} />所有问题均由显式答案覆盖</div>}
                </div>
              ) : null}

              {Array.isArray(payload.journeys) ? (
                <div className={styles.inventory} data-testid="uxloom-journeys"><strong>已登记旅程</strong>{payload.journeys.map((item) => <code key={String(item)}>{String(item)}</code>)}</div>
              ) : null}
              {Array.isArray(payload.screens) ? (
                <div className={styles.inventory} data-testid="uxloom-screens"><strong>已登记屏幕</strong>{payload.screens.map((item) => <code key={String(item)}>{String(item)}</code>)}</div>
              ) : null}

              {summary ? (
                <div className={styles.metrics} data-testid="uxloom-metrics">
                  <span><strong>{String(summary.errors)}</strong>错误</span>
                  <span><strong>{String(summary.warnings)}</strong>警告</span>
                  <span><strong>{String(coverage?.designed ?? 0)}/{String(coverage?.required ?? 0)}</strong>状态覆盖</span>
                  <span><strong>{String(summary.journeys)}</strong>旅程 / {String(summary.screens)} 屏幕</span>
                </div>
              ) : null}

              {groupedFindings.length ? (
                <div className={styles.findingGroups} data-testid="uxloom-findings">
                  {groupedFindings.map(([critic, items]) => (
                    <section key={critic}>
                      <header><strong>{critic}</strong><span>{items.length} 项</span></header>
                      {items.map((finding, index) => (
                        <article key={`${text(finding.code)}-${index}`} className={finding.severity === "error" ? styles.errorFinding : styles.warningFinding}>
                          <div><span>{text(finding.severity)}</span><code>{text(finding.code, "finding")}</code><em>{[finding.journey, finding.screen, finding.state, finding.component].filter(Boolean).map(String).join(" / ") || "project"}</em></div>
                          <p>{text(finding.message)}</p>
                          {finding.fix ? <small><Sparkles size={11} />{text(finding.fix)}</small> : null}
                        </article>
                      ))}
                    </section>
                  ))}
                </div>
              ) : (tab === "validate" || tab === "critique") && runtime.result && !runtime.result.isError ? (
                <div className={styles.cleanLine} data-testid="uxloom-clean"><CheckCircle2 size={15} />当前范围没有发现问题</div>
              ) : null}

              {perScreen.length ? (
                <div className={styles.coverage} data-testid="uxloom-coverage">
                  <div className={styles.resultHeading}><Gauge size={15} /><strong>{text(payload.headline)}</strong><span>{String(payload.errors)} 错误 · {String(payload.warnings)} 警告</span></div>
                  {perScreen.map((row) => (
                    <article key={text(row.screen)}>
                      <div><code>{text(row.screen)}</code><strong>{String(row.designed)}/{String(row.required)}</strong></div>
                      <div className={styles.progress}><i style={{ width: `${Number(row.required) ? Math.round(100 * Number(row.designed) / Number(row.required)) : 100}%` }} /></div>
                      <small>缺失：{Array.isArray(row.missing) && row.missing.length ? row.missing.map(String).join(", ") : "无"}</small>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </ResultView>
      </div>
    </div>
  );
}

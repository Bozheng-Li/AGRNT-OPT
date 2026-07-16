"use client";

import { useState } from "react";
import { BookOpenCheck, Eraser, Play, ShieldCheck } from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";

type Tab = "detect" | "add" | "ignore";
type SlopSpan = {
  start?: number;
  end?: number;
  text?: string;
  categories?: string[];
  weight?: number;
};

const tabLabels: Record<Tab, string> = {
  detect: "检测文本",
  add: "添加禁用短语",
  ignore: "忽略领域词",
};

const categoryLabels: Record<string, string> = {
  "ai-vocab": "AI 高频词",
  cliche: "陈词滥调",
  corporate: "企业黑话",
  hedge: "空泛限定",
  transition: "填充过渡",
};

export function DefluffWorkspace() {
  const [tab, setTab] = useState<Tab>("detect");
  const [text, setText] = useState(
    "Furthermore, it is worth noting that this cutting-edge platform can leverage robust synergies.",
  );
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("corporate");
  const runtime = usePluginInvoke("prose-defluffer");
  const report = resultJson(runtime.result);
  const score = typeof report?.slop_score === "number" ? report.slop_score : null;
  const wordCount = typeof report?.n_words === "number" ? report.n_words : null;
  const lexiconVersion = typeof report?.lexicon_version === "string" ? report.lexicon_version : null;
  const lowConfidence = report?.low_confidence === true;
  const spans = Array.isArray(report?.spans) ? (report.spans as SlopSpan[]) : [];
  const categories = report?.categories && typeof report.categories === "object"
    ? Object.entries(report.categories as Record<string, unknown>)
        .filter((entry): entry is [string, number] => typeof entry[1] === "number")
        .sort((a, b) => b[1] - a[1])
    : [];

  async function run() {
    if (tab === "detect") {
      await runtime.invoke("slop_detect", { text }).catch(() => undefined);
    } else if (tab === "add") {
      await runtime.invoke("slop_add", { pattern, category, scope: "project" }).catch(() => undefined);
    } else {
      await runtime.invoke("slop_ignore", { pattern, scope: "project" }).catch(() => undefined);
    }
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Eraser size={14} />确定性文本去冗</div>
        <span className="badge low">本地规则 · 无模型</span>
      </div>
      <div className="workspace-body">
        <div className="control-panel">
          <div className="workspace-tabs">
            {(Object.keys(tabLabels) as Tab[]).map((item) => (
              <button
                type="button"
                className={`workspace-tab ${tab === item ? "active" : ""}`}
                onClick={() => setTab(item)}
                key={item}
              >
                {tabLabels[item]}
              </button>
            ))}
          </div>

          {tab === "detect" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="defluff-text">待检查文本 <span>最多 100,000 字符</span></label>
              <textarea
                id="defluff-text"
                data-testid="defluff-text"
                className="field-textarea code"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="粘贴草稿、说明、更新日志或模型输出…"
              />
            </div>
          ) : (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="defluff-pattern">短语 <span>仅写入项目沙箱</span></label>
                <input
                  id="defluff-pattern"
                  data-testid="defluff-pattern"
                  className="field-input"
                  value={pattern}
                  onChange={(event) => setPattern(event.target.value)}
                  placeholder={tab === "add" ? "例如：范式升级" : "例如：领域内合法术语"}
                />
              </div>
              {tab === "add" ? (
                <div className="field-group">
                  <label className="field-label" htmlFor="defluff-category">分类</label>
                  <select
                    id="defluff-category"
                    data-testid="defluff-category"
                    className="field-select"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option value={value} key={value}>{label}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          )}

          <button className="primary-button" data-testid="defluff-run" type="button" onClick={run} disabled={runtime.pending}>
            {tab === "detect" ? <Play size={13} /> : <BookOpenCheck size={13} />}
            {runtime.pending ? "分析中…" : tabLabels[tab]}
          </button>
          <div className="privacy-notice">
            <ShieldCheck size={14} />
            不判断文本是否由 AI 创作，只标记可删的填充表达。用户级词典被禁用；添加和忽略操作固定写入 `var/runtime/defluff/.defluff`。
          </div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="检查可删的填充表达"
          emptyDescription="得到确定性分数、命中短语、分类、字符位置与词典版本；同样输入和词典会得到同样结果。"
        >
          {score !== null ? (
            <>
              <div className="slop-summary" data-testid="defluff-summary">
                <div className="slop-stat"><strong>{Math.round(score * 100)}%</strong><span>去冗分数</span></div>
                <div className="slop-stat"><strong>{spans.length}</strong><span>命中短语</span></div>
                <div className="slop-stat"><strong>{wordCount ?? "—"}</strong><span>有效词数</span></div>
                <div className="slop-stat"><strong>{lowConfidence ? "低" : "正常"}</strong><span>样本置信度</span></div>
              </div>
              {categories.length > 0 ? (
                <div className="slop-categories" aria-label="命中分类">
                  {categories.map(([name, value]) => (
                    <span key={name}>{categoryLabels[name] ?? name} · {Math.round(value * 1000) / 10}%</span>
                  ))}
                </div>
              ) : null}
              {spans.length > 0 ? (
                <div className="slop-span-list">
                  {spans.map((span, index) => (
                    <div className="slop-span" key={`${span.start ?? index}-${span.text ?? "span"}`}>
                      <strong>“{span.text ?? ""}”</strong>
                      <span>{(span.categories ?? []).map((item) => categoryLabels[item] ?? item).join(" / ") || "未分类"}</span>
                      <small>位置 {span.start ?? "?"}–{span.end ?? "?"} · 权重 {span.weight ?? "?"}</small>
                    </div>
                  ))}
                </div>
              ) : null}
              {lexiconVersion ? <div className="lexicon-version">词典版本：{lexiconVersion}</div> : null}
            </>
          ) : null}
        </ResultView>
      </div>
    </div>
  );
}

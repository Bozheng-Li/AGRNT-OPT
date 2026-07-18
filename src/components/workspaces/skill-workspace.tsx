"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenText, ClipboardCheck, ListTree, Play, Search, FileText, Sparkles } from "lucide-react";
import { ResultView } from "./result-view";
import { usePluginInvoke } from "./use-plugin-invoke";
import skillUiProfileData from "../../../catalog/skill-ui-profiles.json";

type OutlineSection = {
  id: string;
  level: number;
  title: string;
  preview?: string;
};

type SkillAsset = {
  path: string;
  bytes: number;
  sha256: string;
};

type PreparedPlaybook = {
  skillName: string;
  objective: string;
  locale: "original" | "zh-CN";
  mode: "agent-prompt" | "checklist" | "reference-pack";
  selectedSectionCount: number;
  checklist: string[];
  prompt: string;
  sections: Array<{ id: string; title: string; score: number }>;
};

type SkillUiProfile = {
  goalLabel: string;
  contextLabel: string;
  defaultObjective: string;
  contextPlaceholder: string;
  preferredMode: "agent-prompt" | "checklist" | "reference-pack";
  artifactLabel: string;
  suggestions: string[];
};

const fallbackProfile: SkillUiProfile = {
  goalLabel: "Skill 任务目标",
  contextLabel: "补充上下文",
  defaultObjective: "请依据这个 Skill 帮我完成一个真实任务，并说明每一步的验证证据。",
  contextPlaceholder: "技术栈、约束、已有材料、期望输出…",
  preferredMode: "agent-prompt",
  artifactLabel: "Skill 执行包",
  suggestions: [],
};

export function SkillWorkspace({ slug }: { slug: string }) {
  const profile = ((skillUiProfileData.profiles as Record<string, SkillUiProfile>)[slug] ?? fallbackProfile);
  const runtime = usePluginInvoke(slug);
  const [sections, setSections] = useState<OutlineSection[]>([]);
  const [activeSection, setActiveSection] = useState<string>("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"execute" | "outline" | "section" | "search" | "full" | "assets">("execute");
  const [objective, setObjective] = useState(profile.defaultObjective);
  const [taskContext, setTaskContext] = useState("");
  const [playbookMode, setPlaybookMode] = useState<"agent-prompt" | "checklist" | "reference-pack">(profile.preferredMode);
  const [sectionLimit, setSectionLimit] = useState(4);
  const [locale, setLocale] = useState<"original" | "zh-CN">("original");
  const [translationAvailable, setTranslationAvailable] = useState(false);
  const [assets, setAssets] = useState<SkillAsset[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await runtime.invoke("skill_meta", {});
        const hasTranslation = (meta.structuredContent as { translationAvailable?: boolean } | undefined)?.translationAvailable === true;
        const initialLocale = hasTranslation ? "zh-CN" : "original";
        if (!cancelled) {
          setTranslationAvailable(hasTranslation);
          setLocale(initialLocale);
        }
        const result = await runtime.invoke("skill_outline", { locale: initialLocale });
        const structured = result.structuredContent as { sections?: OutlineSection[] } | undefined;
        if (!cancelled && structured?.sections) {
          setSections(structured.sections);
          if (structured.sections[0]) setActiveSection(structured.sections[0].id);
        }
      } catch {
        // ResultView surfaces the error via runtime.error.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load outline once per slug
  }, [slug]);

  const activeTitle = useMemo(
    () => sections.find((section) => section.id === activeSection)?.title ?? "章节",
    [activeSection, sections],
  );

  const playbook = useMemo(() => {
    if (mode !== "execute" || !runtime.result?.structuredContent) return null;
    const value = runtime.result.structuredContent as Partial<PreparedPlaybook>;
    return typeof value.prompt === "string" && Array.isArray(value.sections) ? (value as PreparedPlaybook) : null;
  }, [mode, runtime.result]);

  async function prepareTask() {
    setMode("execute");
    await runtime
      .invoke("skill_prepare", {
        objective,
        context: taskContext,
        mode: playbookMode,
        sectionLimit,
        locale,
      })
      .catch(() => undefined);
  }

  async function openSection(sectionId: string) {
    setMode("section");
    setActiveSection(sectionId);
    await runtime.invoke("skill_open", { sectionId, locale }).catch(() => undefined);
  }

  async function openFull() {
    setMode("full");
    await runtime.invoke("skill_open", { includeFull: true, locale }).catch(() => undefined);
  }

  async function runSearch() {
    setMode("search");
    await runtime.invoke("skill_search", { query, limit: 12, locale }).catch(() => undefined);
  }

  async function changeLocale(nextLocale: "original" | "zh-CN") {
    if (nextLocale === "zh-CN" && !translationAvailable) return;
    setLocale(nextLocale);
    setSections([]);
    setActiveSection("");
    runtime.setResult(null);
    const result = await runtime.invoke("skill_outline", { locale: nextLocale }).catch(() => null);
    const nextSections = (result?.structuredContent as { sections?: OutlineSection[] } | undefined)?.sections ?? [];
    setSections(nextSections);
    if (nextSections[0]) setActiveSection(nextSections[0].id);
  }

  async function loadAssets() {
    setMode("assets");
    const result = await runtime.invoke("skill_assets", {}).catch(() => null);
    const files = (result?.structuredContent as { files?: SkillAsset[] } | undefined)?.files ?? [];
    setAssets(files);
  }

  async function openAsset(assetPath: string) {
    setMode("assets");
    await runtime.invoke("skill_asset_open", { path: assetPath }).catch(() => undefined);
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title">
          <BookOpenText size={14} />
          Skill 工作室
        </div>
        <span className="badge low">只读文档 · 不执行脚本</span>
      </div>
      <div className="workspace-body">
        <div className="control-panel">
          <div className="workspace-tabs">
            <button
              type="button"
              className={`workspace-tab ${mode === "execute" ? "active" : ""}`}
              data-testid="skill-task-tab"
              onClick={() => setMode("execute")}
            >
              任务
            </button>
            <button
              type="button"
              className={`workspace-tab ${mode === "outline" || mode === "section" ? "active" : ""}`}
              onClick={() => setMode("outline")}
            >
              章节
            </button>
            <button
              type="button"
              className={`workspace-tab ${mode === "search" ? "active" : ""}`}
              onClick={() => setMode("search")}
            >
              检索
            </button>
            <button
              type="button"
              className={`workspace-tab ${mode === "full" ? "active" : ""}`}
              onClick={() => void openFull()}
            >
              全文
            </button>
            <button
              type="button"
              className={`workspace-tab ${mode === "assets" ? "active" : ""}`}
              data-testid="skill-assets-tab"
              onClick={() => void loadAssets()}
            >
              资源
            </button>
          </div>

          <div className="skill-locale-switch" aria-label="Skill 正文语言">
            <button
              type="button"
              className={locale === "zh-CN" ? "active" : ""}
              data-testid="skill-locale-zh"
              disabled={!translationAvailable || runtime.pending}
              onClick={() => void changeLocale("zh-CN")}
            >
              简体中文
            </button>
            <button
              type="button"
              className={locale === "original" ? "active" : ""}
              data-testid="skill-locale-original"
              disabled={runtime.pending}
              onClick={() => void changeLocale("original")}
            >
              原文
            </button>
            <span>{translationAvailable ? "完整双语正文" : "中文正文待完成"}</span>
          </div>

          {mode === "execute" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="skill-objective">
                  {profile.goalLabel} <span>将按当前 Skill 正文选择最相关章节</span>
                </label>
                <textarea
                  id="skill-objective"
                  data-testid="skill-objective"
                  className="field-input"
                  rows={5}
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  placeholder={profile.defaultObjective}
                />
              </div>
              {profile.suggestions.length > 0 ? (
                <div className="skill-suggestions" aria-label="任务示例">
                  {profile.suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion}
                      type="button"
                      data-testid={`skill-example-${index}`}
                      onClick={() => setObjective(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="field-group">
                <label className="field-label" htmlFor="skill-context">
                  {profile.contextLabel} <span>可选，不会发送到外部服务</span>
                </label>
                <textarea
                  id="skill-context"
                  data-testid="skill-context"
                  className="field-input"
                  rows={4}
                  value={taskContext}
                  onChange={(event) => setTaskContext(event.target.value)}
                  placeholder={profile.contextPlaceholder}
                />
              </div>
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="skill-playbook-mode">输出方式</label>
                  <select
                    id="skill-playbook-mode"
                    data-testid="skill-playbook-mode"
                    className="field-input"
                    value={playbookMode}
                    onChange={(event) => setPlaybookMode(event.target.value as typeof playbookMode)}
                  >
                    <option value="agent-prompt">GPT / Agent 提示包</option>
                    <option value="checklist">执行检查清单</option>
                    <option value="reference-pack">相关参考包</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="skill-section-limit">参考深度</label>
                  <select
                    id="skill-section-limit"
                    data-testid="skill-section-limit"
                    className="field-input"
                    value={sectionLimit}
                    onChange={(event) => setSectionLimit(Number(event.target.value))}
                  >
                    {[2, 4, 6, 8].map((value) => <option key={value} value={value}>{value} 章</option>)}
                  </select>
                </div>
              </div>
              <button
                className="primary-button"
                data-testid="skill-prepare-run"
                type="button"
                onClick={() => void prepareTask()}
                disabled={runtime.pending || objective.trim().length < 3}
              >
                <Sparkles size={13} />
                {runtime.pending ? "正在生成…" : "生成专属执行包"}
              </button>
              <div className="privacy-notice">
                <ClipboardCheck size={14} />
                任务包由当前 Skill 的固定版本正文在本地生成；不会执行上游脚本，也不会把任务发送给第三方。
              </div>
            </>
          ) : null}

          {mode !== "execute" && mode !== "assets" ? <div className="field-group">
            <label className="field-label" htmlFor="skill-search">
              关键词检索 <span>在官方 SKILL.md 内搜索</span>
            </label>
            <input
              id="skill-search"
              data-testid="skill-search"
              className="field-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例如：workflow、design、test…"
            />
          </div> : null}
          {mode !== "execute" && mode !== "assets" ? <button
            className="primary-button"
            data-testid="skill-search-run"
            type="button"
            onClick={() => void runSearch()}
            disabled={runtime.pending || !query.trim()}
          >
            <Search size={13} />
            {runtime.pending && mode === "search" ? "检索中…" : "搜索技能正文"}
          </button> : null}

          {mode !== "execute" && mode !== "assets" ? <div className="field-group" style={{ marginTop: 10 }}>
            <div className="field-label">
              <ListTree size={13} /> 章节大纲 <span>{sections.length} 节</span>
            </div>
            <div className="skill-outline" data-testid="skill-outline">
              {sections.length === 0 ? (
                <p className="plugin-summary">正在加载大纲…</p>
              ) : (
                sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className={`skill-outline-item ${activeSection === section.id ? "active" : ""}`}
                    style={{ paddingLeft: 8 + (section.level - 1) * 12 }}
                    data-testid={`skill-section-${section.id}`}
                    onClick={() => void openSection(section.id)}
                  >
                    <strong>{section.title}</strong>
                    {section.preview ? <span>{section.preview}</span> : null}
                  </button>
                ))
              )}
            </div>
          </div> : null}

          {mode !== "execute" && mode !== "assets" ? <button
            className="primary-button"
            data-testid="skill-open-section"
            type="button"
            onClick={() => activeSection && void openSection(activeSection)}
            disabled={runtime.pending || !activeSection}
          >
            <Play size={13} />
            {runtime.pending && mode === "section" ? "打开中…" : `打开：${activeTitle}`}
          </button> : null}

          {mode !== "execute" && mode !== "assets" ? <div className="privacy-notice">
            <FileText size={14} />
            展示的是入库的官方 skill 正文副本；Agent-OPT 不执行上游脚本，也不请求外部账号。
          </div> : null}

          {mode === "assets" ? (
            <>
              <div className="field-label">
                固定版本支持文件 <span>{assets.length} 个</span>
              </div>
              <div className="skill-assets" data-testid="skill-assets">
                {assets.length === 0 ? <span>正在加载或当前候选尚未同步支持文件…</span> : assets.map((asset) => (
                  <button
                    key={asset.path}
                    type="button"
                    data-testid={`skill-asset-${asset.path}`}
                    onClick={() => void openAsset(asset.path)}
                  >
                    <strong>{asset.path}</strong>
                    <span>{asset.bytes.toLocaleString()} B · {asset.sha256.slice(0, 10)}</span>
                  </button>
                ))}
              </div>
              <div className="privacy-notice">
                <FileText size={14} />
                只允许打开 BUNDLE.json 固定哈希清单中的安全文本；二进制、越界路径和符号链接会被拒绝。
              </div>
            </>
          ) : null}
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle={mode === "execute" ? "生成 Skill 执行包" : mode === "assets" ? "查看支持文件" : "打开 Skill 指南"}
          emptyDescription={mode === "execute" ? "输入真实目标，生成与当前 Skill 匹配的 GPT 提示包、检查清单和参考章节。" : mode === "assets" ? "浏览固定上游 commit 中与该 Skill 一起发布的参考资料、脚本和模板。" : "浏览官方技能章节、检索关键词，或查看完整 SKILL.md 正文。"}
          hideRaw={Boolean(playbook)}
        >
          {playbook ? (
            <div className="skill-playbook" data-testid="skill-playbook">
              <div className="skill-playbook-head">
                <span className="badge low">{playbook.mode}</span>
                <strong>{profile.artifactLabel} · {playbook.skillName}</strong>
                <small>{playbook.selectedSectionCount} 个相关章节</small>
              </div>
              <div className="skill-playbook-sections" aria-label="相关章节">
                {playbook.sections.map((section) => (
                  <span key={section.id}>{section.title} · {section.score}</span>
                ))}
              </div>
              {playbook.mode === "checklist" ? (
                <ol className="skill-playbook-checklist">
                  {playbook.checklist.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                </ol>
              ) : null}
              <pre data-testid="skill-playbook-prompt">{playbook.prompt}</pre>
            </div>
          ) : null}
        </ResultView>
      </div>
    </div>
  );
}

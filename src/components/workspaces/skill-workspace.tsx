"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenText, ListTree, Play, Search, FileText } from "lucide-react";
import { ResultView } from "./result-view";
import { usePluginInvoke } from "./use-plugin-invoke";

type OutlineSection = {
  id: string;
  level: number;
  title: string;
  preview?: string;
};

export function SkillWorkspace({ slug }: { slug: string }) {
  const runtime = usePluginInvoke(slug);
  const [sections, setSections] = useState<OutlineSection[]>([]);
  const [activeSection, setActiveSection] = useState<string>("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"outline" | "section" | "search" | "full">("outline");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await runtime.invoke("skill_outline", {});
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

  async function openSection(sectionId: string) {
    setMode("section");
    setActiveSection(sectionId);
    await runtime.invoke("skill_open", { sectionId }).catch(() => undefined);
  }

  async function openFull() {
    setMode("full");
    await runtime.invoke("skill_open", { includeFull: true }).catch(() => undefined);
  }

  async function runSearch() {
    setMode("search");
    await runtime.invoke("skill_search", { query, limit: 12 }).catch(() => undefined);
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
          </div>

          <div className="field-group">
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
          </div>
          <button
            className="primary-button"
            data-testid="skill-search-run"
            type="button"
            onClick={() => void runSearch()}
            disabled={runtime.pending || !query.trim()}
          >
            <Search size={13} />
            {runtime.pending && mode === "search" ? "检索中…" : "搜索技能正文"}
          </button>

          <div className="field-group" style={{ marginTop: 10 }}>
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
          </div>

          <button
            className="primary-button"
            data-testid="skill-open-section"
            type="button"
            onClick={() => activeSection && void openSection(activeSection)}
            disabled={runtime.pending || !activeSection}
          >
            <Play size={13} />
            {runtime.pending && mode === "section" ? "打开中…" : `打开：${activeTitle}`}
          </button>

          <div className="privacy-notice">
            <FileText size={14} />
            展示的是入库的官方 skill 正文副本；Agent-OPT 不执行上游脚本，也不请求外部账号。
          </div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="打开 Skill 指南"
          emptyDescription="浏览官方技能章节、检索关键词，或查看完整 SKILL.md 正文。"
        />
      </div>
    </div>
  );
}

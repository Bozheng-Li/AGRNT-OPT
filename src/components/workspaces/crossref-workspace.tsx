"use client";

import { useMemo, useState } from "react";
import {
  BookOpenText,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Landmark,
  LibraryBig,
  Network,
  Play,
  Search,
  ShieldCheck,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";
import styles from "./crossref-workspace.module.css";

type Tab = "search" | "detail" | "journals" | "funders" | "publishers";
type Row = Record<string, unknown>;

const tabs = [
  { id: "search", label: "作品检索", icon: Search },
  { id: "detail", label: "DOI 与引用", icon: BookOpenText },
  { id: "journals", label: "期刊", icon: LibraryBig },
  { id: "funders", label: "基金方", icon: Landmark },
  { id: "publishers", label: "出版成员", icon: Building2 },
] as const;

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Row[] : [];
}

function display(value: unknown, fallback = "-"): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dateLabel(value: unknown): string {
  const date = object(value);
  const year = finite(date.year);
  if (!year) return "日期未记录";
  return [year, finite(date.month) || undefined, finite(date.day) || undefined].filter(Boolean).join("-");
}

function authorLabel(value: unknown): string {
  const people = rows(value);
  if (!people.length) return "作者未记录";
  return people.slice(0, 8).map((entry) => {
    const author = object(entry);
    return [display(author.given, ""), display(author.family, "")].filter(Boolean).join(" ") || display(author.name, "");
  }).filter(Boolean).join(", ");
}

function clampPercent(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(finite(value) * 100)));
}

export function CrossrefWorkspace() {
  const runtime = usePluginInvoke("crossref-scholarly-metadata-lab");
  const [tab, setTab] = useState<Tab>("search");
  const [searchMode, setSearchMode] = useState<"title" | "all">("title");
  const [query, setQuery] = useState("Array programming with NumPy");
  const [offset, setOffset] = useState(0);
  const [detailMode, setDetailMode] = useState<"work" | "references">("work");
  const [doi, setDoi] = useState("10.1038/nature12373");
  const [journal, setJournal] = useState("1476-4687");
  const [funder, setFunder] = useState("10.13039/100000001");
  const [publisherMode, setPublisherMode] = useState<"prefix" | "member">("prefix");
  const [prefix, setPrefix] = useState("10.1038");
  const [memberId, setMemberId] = useState("297");
  const [prefixSnapshot, setPrefixSnapshot] = useState<Row>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastTool, setLastTool] = useState("");

  const payload = useMemo(() => object(resultJson(runtime.result)), [runtime.result]);

  function switchTab(next: Tab) {
    setTab(next);
    setLocalError(null);
    runtime.setResult(null);
  }

  async function call(tool: string, args: Record<string, unknown>) {
    setLocalError(null);
    setLastTool(tool);
    try {
      return await runtime.invoke(tool, args);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Crossref 调用失败。");
      return null;
    }
  }

  async function searchWorks(nextOffset = offset) {
    setOffset(nextOffset);
    await call("crossref_search_works", {
      ...(searchMode === "title" ? { queryTitle: query } : { query }),
      fields: ["DOI", "title", "author", "published", "type", "container-title", "publisher", "is-referenced-by-count", "score"],
      rows: 5,
      offset: nextOffset,
      sort: "relevance",
      order: "desc",
    });
  }

  async function run() {
    if (tab === "search") await searchWorks(0);
    if (tab === "detail") {
      await call(detailMode === "work" ? "crossref_get_work" : "crossref_get_references", { doi });
    }
    if (tab === "journals") {
      await call("crossref_search_journals", { issn: journal, include_works: true, rows: 5 });
    }
    if (tab === "funders") {
      await call("crossref_search_funders", {
        ...(funder.startsWith("10.13039/") ? { funder_doi: funder } : { query: funder }),
        include_works: false,
        rows: 5,
      });
    }
    if (tab === "publishers") {
      if (publisherMode === "prefix") {
        const result = await call("crossref_get_prefix", { prefix });
        if (result) setPrefixSnapshot(object(resultJson(result)));
      } else {
        await call("crossref_get_member", { member_id: Number(memberId) });
      }
    }
  }

  async function loadResolvedMember() {
    const resolvedId = finite(payload.memberId || prefixSnapshot.memberId);
    if (!resolvedId) return;
    setPrefixSnapshot(Object.keys(payload).length ? payload : prefixSnapshot);
    setMemberId(String(resolvedId));
    setPublisherMode("member");
    await call("crossref_get_member", { member_id: resolvedId });
  }

  const works = rows(payload.works);
  const references = rows(payload.references);
  const journals = rows(payload.journals);
  const recentWorks = rows(payload.recentWorks);
  const funders = rows(payload.funders);
  const coverage = rows(payload.coverage);
  const worksByType = rows(payload.worksByType);

  return (
    <div className={`workspace-card ${styles.workspace}`}>
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Network size={14} />Crossref 学术元数据台</div>
        <span className="badge medium"><ShieldCheck size={10} />匿名只读 · 固定 Crossref API</span>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Crossref 工作流">
        {tabs.map((item) => {
          const Icon = item.icon;
          return <button type="button" role="tab" aria-selected={tab === item.id} data-testid={`crossref-tab-${item.id}`} className={tab === item.id ? styles.active : ""} key={item.id} onClick={() => switchTab(item.id)}><Icon size={12} />{item.label}</button>;
        })}
      </div>

      <div className={`workspace-body ${styles.layout}`}>
        <div className={`control-panel ${styles.controls}`}>
          {tab === "search" ? <>
            <Segmented value={searchMode} prefix="crossref-search" options={[{ id: "title", label: "标题精确检索" }, { id: "all", label: "综合检索" }]} onChange={(value) => setSearchMode(value as typeof searchMode)} />
            <Field label="检索内容" htmlFor="crossref-query"><textarea id="crossref-query" data-testid="crossref-query" className="field-textarea" value={query} onChange={(event) => setQuery(event.target.value)} /></Field>
            <div className={styles.examples}><button type="button" onClick={() => { setSearchMode("title"); setQuery("Array programming with NumPy"); }}>NumPy 论文</button><button type="button" onClick={() => { setSearchMode("all"); setQuery("CRISPR gene editing"); }}>CRISPR</button></div>
          </> : null}

          {tab === "detail" ? <>
            <Segmented value={detailMode} prefix="crossref-detail" options={[{ id: "work", label: "完整记录" }, { id: "references", label: "出站参考文献" }]} onChange={(value) => setDetailMode(value as typeof detailMode)} />
            <Field label="DOI" htmlFor="crossref-doi"><input id="crossref-doi" data-testid="crossref-doi" className="field-input code" value={doi} onChange={(event) => setDoi(event.target.value)} /></Field>
            <div className={styles.hint}><FileSearch size={12} />仅接受裸 DOI，例如 10.1038/nature12373；不会跟随 DOI 跳转。</div>
          </> : null}

          {tab === "journals" ? <>
            <Field label="ISSN" htmlFor="crossref-journal"><input id="crossref-journal" data-testid="crossref-journal" className="field-input code" value={journal} onChange={(event) => setJournal(event.target.value)} /></Field>
            <div className={styles.hint}><LibraryBig size={12} />读取期刊登记信息，并附带最多 5 条最新作品。</div>
          </> : null}

          {tab === "funders" ? <>
            <Field label="基金方 DOI 或名称" htmlFor="crossref-funder"><input id="crossref-funder" data-testid="crossref-funder" className="field-input code" value={funder} onChange={(event) => setFunder(event.target.value)} /></Field>
            <div className={styles.examples}><button type="button" onClick={() => setFunder("10.13039/100000001")}>NSF</button><button type="button" onClick={() => setFunder("Wellcome Trust")}>Wellcome Trust</button></div>
          </> : null}

          {tab === "publishers" ? <>
            <Segmented value={publisherMode} prefix="crossref-publisher" options={[{ id: "prefix", label: "Prefix → 成员" }, { id: "member", label: "成员画像" }]} onChange={(value) => setPublisherMode(value as typeof publisherMode)} />
            {publisherMode === "prefix" ? <Field label="DOI Prefix" htmlFor="crossref-prefix"><input id="crossref-prefix" data-testid="crossref-prefix-input" className="field-input code" value={prefix} onChange={(event) => setPrefix(event.target.value)} /></Field> : <Field label="Crossref Member ID" htmlFor="crossref-member"><input id="crossref-member" data-testid="crossref-member-input" className="field-input code" inputMode="numeric" value={memberId} onChange={(event) => setMemberId(event.target.value)} /></Field>}
            <div className={styles.hint}><Building2 size={12} />Prefix 解析只返回归属；成员画像展示 DOI 数量、作品类型和元数据覆盖率。</div>
          </> : null}

          <button type="button" className="primary-button" data-testid="crossref-run" disabled={runtime.pending} onClick={run}><Play size={13} fill="currentColor" />{runtime.pending ? "正在查询" : tabs.find((item) => item.id === tab)?.label}</button>
          <div className={styles.boundary}><ShieldCheck size={13} /><span>GET-only</span><span>最多 5 条</span><span>拒绝重定向</span><span>无凭据</span></div>
        </div>

        <ResultView
          result={runtime.result}
          error={localError ?? runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="等待学术元数据查询"
          emptyDescription="选择检索、DOI、期刊、基金方或出版成员工作流。"
          hideRaw={Boolean(runtime.result && Object.keys(payload).length)}
        >
          {lastTool === "crossref_search_works" && runtime.result ? <div className={styles.stack} data-testid="crossref-works">
            <div className={styles.resultHeader}><strong>作品结果</strong><span>{display(payload.totalResults, "未知")} 条匹配 · 偏移 {offset}</span></div>
            <div className={styles.workList}>{works.map((work) => <article key={display(work.doi)}>
              <div><code>{display(work.doi)}</code><h4>{display(work.title, "标题未记录")}</h4><p>{authorLabel(work.authors)}</p><span>{dateLabel(work.published)} · {display(work.containerTitle, display(work.publisher, "来源未记录"))}</span></div>
              <aside><b>{display(work.isReferencedByCount, "0")}</b><small>被引</small><button type="button" onClick={() => { setDoi(display(work.doi)); setDetailMode("work"); switchTab("detail"); }}>查看 DOI</button></aside>
            </article>)}</div>
            <div className={styles.pagination}><button type="button" data-testid="crossref-prev" disabled={offset === 0 || runtime.pending} onClick={() => searchWorks(Math.max(0, offset - 5))}><ChevronLeft size={12} />上一页</button><span>{offset + 1}–{offset + works.length}</span><button type="button" data-testid="crossref-next" disabled={works.length < 5 || runtime.pending} onClick={() => searchWorks(offset + 5)}>下一页<ChevronRight size={12} /></button></div>
          </div> : null}

          {lastTool === "crossref_get_work" && runtime.result ? <div className={styles.workDetail} data-testid="crossref-work">
            <header><div><code>{display(payload.doi)}</code><h3>{display(payload.title, "标题未记录")}</h3><p>{authorLabel(payload.authors)}</p></div><span>{display(payload.isReferencedByCount, "0")}<small>被引</small></span></header>
            <div className={styles.metrics}><span><small>类型</small><strong>{display(payload.type)}</strong></span><span><small>发表</small><strong>{dateLabel(payload.published)}</strong></span><span><small>容器</small><strong>{display(payload.containerTitle)}</strong></span><span><small>出版社</small><strong>{display(payload.publisher)}</strong></span><span><small>参考文献</small><strong>{display(payload.referencesCount, "0")}</strong></span><span><small>语言</small><strong>{display(payload.language, "未记录")}</strong></span></div>
            <section><strong>摘要</strong><p>{display(payload.abstract, "出版方未向 Crossref 存储摘要。")}</p></section>
            {rows(payload.funders).length ? <section><strong>基金方</strong><div className={styles.chips}>{rows(payload.funders).map((item) => <span key={`${display(item.doi)}-${display(item.name)}`}>{display(item.name)} {display(item.doi, "")}</span>)}</div></section> : null}
          </div> : null}

          {lastTool === "crossref_get_references" && runtime.result ? <div className={styles.referencePanel} data-testid="crossref-references">
            <div className={styles.resultHeader}><strong>{display(payload.doi)}</strong><span>{display(payload.referenceCount, "0")} 条出站参考文献</span></div>
            <div className={styles.referenceList}>{references.slice(0, 25).map((reference, index) => <article key={`${display(reference.key, String(index))}-${index}`}><span>{index + 1}</span><div><strong>{display(reference.articleTitle, display(reference.unstructured, "未解析引用"))}</strong><p>{[display(reference.author, ""), display(reference.year, ""), display(reference.journalTitle, "")].filter(Boolean).join(" · ")}</p>{reference.doi ? <code>{display(reference.doi)}</code> : null}</div></article>)}</div>
          </div> : null}

          {lastTool === "crossref_search_journals" && runtime.result ? <div className={styles.stack} data-testid="crossref-journals">
            <div className={styles.journalGrid}>{journals.map((item) => <article key={display(item.issnL, display(item.title))}><LibraryBig size={20} /><div><h4>{display(item.title)}</h4><code>{display(item.issnL, rows(item.issn).map(String).join(", "))}</code><p>{display(item.publisher)} · {display(item.totalDois, "0")} DOI</p></div></article>)}</div>
            <WorkStrip title="最新作品" items={recentWorks} onOpen={(nextDoi) => { setDoi(nextDoi); setDetailMode("work"); switchTab("detail"); }} />
          </div> : null}

          {lastTool === "crossref_search_funders" && runtime.result ? <div className={styles.stack} data-testid="crossref-funders">
            <div className={styles.funderGrid}>{funders.map((item) => <article key={display(item.id, display(item.name))}><Landmark size={20} /><div><h4>{display(item.name)}</h4><code>{display(item.id)}</code><p>{display(item.country, "地区未记录")} · {display(item.worksCount, "0")} 作品</p></div></article>)}</div>
            <div className={styles.hint}><ShieldCheck size={12} />0.2.0 的 include_works 响应违反其公开输出 schema；本适配仅开放稳定的基金方登记查询，不把该上游缺陷伪装成成功。</div>
          </div> : null}

          {lastTool === "crossref_get_prefix" && runtime.result ? <div className={styles.prefixCard} data-testid="crossref-prefix"><span>DOI PREFIX</span><strong>{display(payload.prefix)}</strong><h3>{display(payload.ownerName, "所有者未记录")}</h3><code>Member ID {display(payload.memberId, "未知")}</code>{payload.memberId ? <button type="button" data-testid="crossref-load-member" onClick={loadResolvedMember}>加载成员覆盖画像<ChevronRight size={12} /></button> : null}</div> : null}

          {lastTool === "crossref_get_member" && runtime.result ? <div className={styles.memberPanel} data-testid="crossref-member">
            <header><div>{Object.keys(prefixSnapshot).length ? <code>{display(prefixSnapshot.prefix)} → Member {display(payload.id)}</code> : <code>Member {display(payload.id)}</code>}<h3>{display(payload.primaryName, "成员名称未记录")}</h3><p>{display(payload.location, "地点未记录")}</p></div><span>{display(object(payload.counts).totalDois, "0")}<small>注册 DOI</small></span></header>
            <div className={styles.chips}>{Array.isArray(payload.prefixes) ? payload.prefixes.slice(0, 20).map((item) => <span key={String(item)}>{String(item)}</span>) : null}</div>
            <section><strong>作品类型</strong><div className={styles.typeList}>{worksByType.slice(0, 10).map((item) => <span key={display(item.type)}><b>{display(item.type)}</b><code>{display(item.count)}</code></span>)}</div></section>
            <section><strong>元数据覆盖率（当前 / 回溯）</strong><div className={styles.coverage}>{coverage.map((item) => <article key={display(item.category)}><b>{display(item.category)}</b><div><i style={{ width: `${clampPercent(item.current)}%` }} /></div><span>{clampPercent(item.current)}%</span><div><i style={{ width: `${clampPercent(item.backfile)}%` }} /></div><span>{clampPercent(item.backfile)}%</span></article>)}</div></section>
          </div> : null}
        </ResultView>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <label className="field-group" htmlFor={htmlFor}><span className="field-label">{label}</span>{children}</label>;
}

function Segmented({ value, prefix, options, onChange }: { value: string; prefix: string; options: Array<{ id: string; label: string }>; onChange(value: string): void }) {
  return <div className={styles.segmented}>{options.map((option) => <button type="button" data-testid={`${prefix}-${option.id}`} aria-pressed={value === option.id} key={option.id} onClick={() => onChange(option.id)}>{option.label}</button>)}</div>;
}

function WorkStrip({ title, items, onOpen }: { title: string; items: Row[]; onOpen(doi: string): void }) {
  if (!items.length) return null;
  return <div className={styles.workStrip}><div className={styles.resultHeader}><strong>{title}</strong><span>{items.length} 条</span></div>{items.map((item) => <article key={display(item.doi)}><div><strong>{display(item.title, "标题未记录")}</strong><code>{display(item.doi)}</code><span>{dateLabel(item.published)} · 被引 {display(item.isReferencedByCount, "0")}</span></div><button type="button" onClick={() => onOpen(display(item.doi))}>查看</button></article>)}</div>;
}

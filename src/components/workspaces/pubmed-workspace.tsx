"use client";

import { useMemo, useState } from "react";
import {
  BookOpenText,
  Braces,
  Database,
  FileSearch,
  FlaskConical,
  GitBranch,
  LibraryBig,
  ListChecks,
  Play,
  Quote,
  Search,
  ShieldCheck,
  SpellCheck,
  Tags,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";
import styles from "./pubmed-workspace.module.css";

type Tab = "search" | "evidence" | "citations" | "vocabulary" | "plan";
type Row = Record<string, unknown>;

const tabs = [
  { id: "search", label: "文献检索", icon: Search },
  { id: "evidence", label: "证据正文", icon: BookOpenText },
  { id: "citations", label: "引用与标识", icon: Quote },
  { id: "vocabulary", label: "词表与字段", icon: Tags },
  { id: "plan", label: "研究计划", icon: ListChecks },
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

function authors(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "作者未列出";
  return value.slice(0, 8).map((entry) => {
    const author = object(entry);
    return [display(author.firstName, ""), display(author.lastName, "")].filter(Boolean).join(" ") || display(author.name, "");
  }).filter(Boolean).join(", ");
}

export function PubmedWorkspace() {
  const runtime = usePluginInvoke("pubmed-evidence-lab");
  const [tab, setTab] = useState<Tab>("search");
  const [searchMode, setSearchMode] = useState<"pubmed" | "europe">("pubmed");
  const [query, setQuery] = useState("10.1093/nar/gks1195[doi]");
  const [evidenceMode, setEvidenceMode] = useState<"article" | "fulltext" | "related">("article");
  const [pmid, setPmid] = useState("23193287");
  const [pmcid, setPmcid] = useState("PMC3531190");
  const [relationship, setRelationship] = useState("similar");
  const [citationMode, setCitationMode] = useState<"format" | "lookup" | "convert">("format");
  const [citationFormat, setCitationFormat] = useState("apa");
  const [journal, setJournal] = useState("Nucleic Acids Res");
  const [year, setYear] = useState("2013");
  const [volume, setVolume] = useState("41");
  const [firstPage, setFirstPage] = useState("D36");
  const [authorName, setAuthorName] = useState("Benson DA");
  const [idType, setIdType] = useState<"doi" | "pmid" | "pmcid">("doi");
  const [identifier, setIdentifier] = useState("10.1093/nar/gks1195");
  const [vocabularyMode, setVocabularyMode] = useState<"spell" | "mesh" | "database">("spell");
  const [term, setTerm] = useState("diabetis melitus");
  const [planTitle, setPlanTitle] = useState("Metformin and healthy aging");
  const [planGoal, setPlanGoal] = useState("Evaluate human evidence for metformin in healthy aging");
  const [planKeywords, setPlanKeywords] = useState("metformin, healthy aging, longevity");
  const [assetResult, setAssetResult] = useState<{ kind: "database" | "plan"; text: string } | null>(null);
  const [assetPending, setAssetPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastTool, setLastTool] = useState("");

  const payload = useMemo(() => resultJson(runtime.result), [runtime.result]);
  const busy = runtime.pending || assetPending;

  function switchTab(next: Tab) {
    setTab(next);
    setAssetResult(null);
    setLocalError(null);
    runtime.setResult(null);
  }

  async function call(tool: string, args: Record<string, unknown>) {
    setAssetResult(null);
    setLocalError(null);
    setLastTool(tool);
    try {
      await runtime.invoke(tool, args);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "PubMed 调用失败。");
    }
  }

  async function loadAsset(operation: "resource" | "prompt") {
    setAssetPending(true);
    setLocalError(null);
    runtime.setResult(null);
    try {
      const body = operation === "resource"
        ? { operation, uri: "pubmed://database/info" }
        : {
            operation,
            prompt: "research_plan",
            arguments: {
              title: planTitle,
              goal: planGoal,
              keywords: planKeywords,
              organism: "human",
              includeAgentPrompts: "true",
            },
          };
      const response = await fetch("/api/plugins/pubmed-evidence-lab/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "PubMed 协议资产读取失败。");
      const text = operation === "resource"
        ? String(result.result?.contents?.[0]?.text ?? "")
        : (Array.isArray(result.result?.messages) ? result.result.messages : []).map((message: Row) => display(object(message.content).text, "")).join("\n\n");
      setAssetResult({ kind: operation === "resource" ? "database" : "plan", text });
      setLastTool(operation === "resource" ? "resource:database-info" : "prompt:research_plan");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "PubMed 协议资产读取失败。");
    } finally {
      setAssetPending(false);
    }
  }

  async function run() {
    if (tab === "search") {
      if (searchMode === "pubmed") await call("pubmed_search_articles", { query, maxResults: 5, offset: 0, sort: "relevance", summaryCount: 5 });
      else await call("pubmed_europepmc_search", { query: query.includes("[doi]") ? "EXT_ID:23193287 AND SRC:MED" : query, pageSize: 5, cursorMark: "*", sources: ["MED", "PMC", "PPR"], resultType: "core" });
    }
    if (tab === "evidence") {
      if (evidenceMode === "article") await call("pubmed_fetch_articles", { pmids: [pmid], includeMesh: true, includeGrants: false });
      if (evidenceMode === "fulltext") await call("pubmed_fetch_fulltext", { pmcids: [pmcid], includeReferences: false, maxSections: 5 });
      if (evidenceMode === "related") await call("pubmed_find_related", { pmid, relationship, maxResults: 5, offset: 0 });
    }
    if (tab === "citations") {
      if (citationMode === "format") await call("pubmed_format_citations", { pmids: [pmid], format: citationFormat });
      if (citationMode === "lookup") await call("pubmed_lookup_citation", { citations: [{ journal, year, volume, firstPage, authorName, key: "web-reference" }] });
      if (citationMode === "convert") await call("pubmed_convert_ids", { ids: [identifier], idType });
    }
    if (tab === "vocabulary") {
      if (vocabularyMode === "spell") await call("pubmed_spell_check", { query: term });
      if (vocabularyMode === "mesh") await call("pubmed_lookup_mesh", { query: term, maxResults: 5, includeDetails: true });
      if (vocabularyMode === "database") await loadAsset("resource");
    }
    if (tab === "plan") await loadAsset("prompt");
  }

  return (
    <div className={`workspace-card ${styles.workspace}`}>
      <div className="workspace-bar">
        <div className="workspace-bar-title"><LibraryBig size={14} />PubMed 生物医学证据台</div>
        <span className="badge medium"><ShieldCheck size={10} />匿名只读 · 固定公共来源</span>
      </div>
      <div className={styles.tabs} role="tablist" aria-label="PubMed 工作流">
        {tabs.map((item) => {
          const Icon = item.icon;
          return <button type="button" role="tab" aria-selected={tab === item.id} data-testid={`pubmed-tab-${item.id}`} className={tab === item.id ? styles.active : ""} key={item.id} onClick={() => switchTab(item.id)}><Icon size={12} />{item.label}</button>;
        })}
      </div>

      <div className={`workspace-body ${styles.layout}`}>
        <div className={`control-panel ${styles.controls}`}>
          {tab === "search" ? <>
            <Segmented options={[{ id: "pubmed", label: "PubMed" }, { id: "europe", label: "Europe PMC" }]} value={searchMode} prefix="pubmed-search-mode" onChange={(value) => setSearchMode(value as typeof searchMode)} />
            <Field label="检索式" htmlFor="pubmed-query"><textarea id="pubmed-query" data-testid="pubmed-query" className="field-textarea code" value={query} onChange={(event) => setQuery(event.target.value)} /></Field>
            <div className={styles.examples}><button type="button" onClick={() => setQuery("10.1093/nar/gks1195[doi]")}>DOI 精确检索</button><button type="button" onClick={() => setQuery("metformin AND healthy aging")}>主题检索</button></div>
          </> : null}

          {tab === "evidence" ? <>
            <Segmented options={[{ id: "article", label: "摘要与元数据" }, { id: "fulltext", label: "开放全文" }, { id: "related", label: "关联文献" }]} value={evidenceMode} prefix="pubmed-evidence-mode" onChange={(value) => setEvidenceMode(value as typeof evidenceMode)} />
            {evidenceMode === "fulltext" ? <Field label="PMCID" htmlFor="pubmed-pmcid"><input id="pubmed-pmcid" data-testid="pubmed-pmcid" className="field-input code" value={pmcid} onChange={(event) => setPmcid(event.target.value)} /></Field> : <Field label="PMID" htmlFor="pubmed-pmid"><input id="pubmed-pmid" data-testid="pubmed-pmid" className="field-input code" value={pmid} onChange={(event) => setPmid(event.target.value)} /></Field>}
            {evidenceMode === "related" ? <Field label="关系" htmlFor="pubmed-relationship"><select id="pubmed-relationship" data-testid="pubmed-relationship" className="field-select" value={relationship} onChange={(event) => setRelationship(event.target.value)}><option value="similar">相似内容</option><option value="cited_by">引用本文</option><option value="references">本文参考文献</option></select></Field> : null}
          </> : null}

          {tab === "citations" ? <>
            <Segmented options={[{ id: "format", label: "引用格式" }, { id: "lookup", label: "引用反查" }, { id: "convert", label: "ID 转换" }]} value={citationMode} prefix="pubmed-citation-mode" onChange={(value) => setCitationMode(value as typeof citationMode)} />
            {citationMode === "format" ? <><Field label="PMID" htmlFor="pubmed-citation-pmid"><input id="pubmed-citation-pmid" data-testid="pubmed-citation-pmid" className="field-input code" value={pmid} onChange={(event) => setPmid(event.target.value)} /></Field><Field label="格式" htmlFor="pubmed-citation-format"><select id="pubmed-citation-format" data-testid="pubmed-citation-format" className="field-select" value={citationFormat} onChange={(event) => setCitationFormat(event.target.value)}><option value="apa">APA</option><option value="vancouver">Vancouver</option><option value="bibtex">BibTeX</option><option value="ris">RIS</option><option value="mla">MLA</option></select></Field></> : null}
            {citationMode === "lookup" ? <div className={styles.compactGrid}>
              <Field label="期刊" htmlFor="pubmed-journal"><input id="pubmed-journal" data-testid="pubmed-journal" className="field-input" value={journal} onChange={(event) => setJournal(event.target.value)} /></Field>
              <Field label="年份" htmlFor="pubmed-year"><input id="pubmed-year" data-testid="pubmed-year" className="field-input code" value={year} onChange={(event) => setYear(event.target.value)} /></Field>
              <Field label="卷" htmlFor="pubmed-volume"><input id="pubmed-volume" className="field-input code" value={volume} onChange={(event) => setVolume(event.target.value)} /></Field>
              <Field label="首页" htmlFor="pubmed-first-page"><input id="pubmed-first-page" className="field-input code" value={firstPage} onChange={(event) => setFirstPage(event.target.value)} /></Field>
              <Field label="第一作者" htmlFor="pubmed-author"><input id="pubmed-author" className="field-input" value={authorName} onChange={(event) => setAuthorName(event.target.value)} /></Field>
            </div> : null}
            {citationMode === "convert" ? <><Field label="标识类型" htmlFor="pubmed-id-type"><select id="pubmed-id-type" data-testid="pubmed-id-type" className="field-select" value={idType} onChange={(event) => { const next = event.target.value as typeof idType; setIdType(next); setIdentifier(next === "doi" ? "10.1093/nar/gks1195" : next === "pmid" ? "23193287" : "PMC3531190"); }}><option value="doi">DOI</option><option value="pmid">PMID</option><option value="pmcid">PMCID</option></select></Field><Field label="标识符" htmlFor="pubmed-identifier"><input id="pubmed-identifier" data-testid="pubmed-identifier" className="field-input code" value={identifier} onChange={(event) => setIdentifier(event.target.value)} /></Field></> : null}
          </> : null}

          {tab === "vocabulary" ? <>
            <Segmented options={[{ id: "spell", label: "拼写校正" }, { id: "mesh", label: "MeSH 主题词" }, { id: "database", label: "数据库字段" }]} value={vocabularyMode} prefix="pubmed-vocabulary-mode" onChange={(value) => { setVocabularyMode(value as typeof vocabularyMode); setTerm(value === "mesh" ? "Diabetes Mellitus" : "diabetis melitus"); }} />
            {vocabularyMode !== "database" ? <Field label={vocabularyMode === "mesh" ? "MeSH 词条" : "待校正检索词"} htmlFor="pubmed-term"><input id="pubmed-term" data-testid="pubmed-term" className="field-input" value={term} onChange={(event) => setTerm(event.target.value)} /></Field> : null}
          </> : null}

          {tab === "plan" ? <>
            <Field label="项目标题" htmlFor="pubmed-plan-title"><input id="pubmed-plan-title" data-testid="pubmed-plan-title" className="field-input" value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} /></Field>
            <Field label="研究目标" htmlFor="pubmed-plan-goal"><textarea id="pubmed-plan-goal" className="field-textarea" value={planGoal} onChange={(event) => setPlanGoal(event.target.value)} /></Field>
            <Field label="关键词" htmlFor="pubmed-plan-keywords"><input id="pubmed-plan-keywords" className="field-input" value={planKeywords} onChange={(event) => setPlanKeywords(event.target.value)} /></Field>
          </> : null}

          <button type="button" className="primary-button" data-testid="pubmed-run" disabled={busy} onClick={run}><Play size={13} fill="currentColor" />{busy ? "正在查询" : tabs.find((item) => item.id === tab)?.label}</button>
          <div className={styles.boundary}><ShieldCheck size={13} /><span>小批量</span><span>只读</span><span>无凭据</span><span>来源可见</span></div>
        </div>

        <ResultView result={runtime.result} error={localError ?? runtime.error} pending={busy} activity={runtime.activity} emptyTitle="构建可追溯的文献证据" emptyDescription="" hideRaw>
          {payload ? <PubmedResult tool={lastTool} payload={payload} /> : null}
          {assetResult ? <AssetResult asset={assetResult} /> : null}
        </ResultView>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="field-group"><label className="field-label" htmlFor={htmlFor}>{label}</label>{children}</div>;
}

function Segmented({ options, value, prefix, onChange }: { options: Array<{ id: string; label: string }>; value: string; prefix: string; onChange(value: string): void }) {
  return <div className={styles.segmented}>{options.map((option) => <button type="button" key={option.id} aria-pressed={value === option.id} data-testid={`${prefix}-${option.id}`} onClick={() => onChange(option.id)}>{option.label}</button>)}</div>;
}

function PubmedResult({ tool, payload }: { tool: string; payload: Row }) {
  if (tool === "pubmed_spell_check") return <div className={styles.spell} data-testid="pubmed-spell-result"><SpellCheck size={24} /><span>{display(payload.original)}</span><strong>{display(payload.corrected)}</strong></div>;
  if (tool === "pubmed_lookup_mesh") return <div className={styles.resultStack} data-testid="pubmed-mesh-results"><ResultHeader icon={<Tags size={14} />} title="MeSH 主题词" count={rows(payload.results).length} />{rows(payload.results).map((item) => <article className={styles.meshCard} key={display(item.meshId)}><div><strong>{display(item.name)}</strong><code>{display(item.meshId)}</code></div><p>{display(item.scopeNote, "无范围说明")}</p><small>{Array.isArray(item.treeNumbers) ? item.treeNumbers.join(" · ") : ""}</small></article>)}</div>;
  if (tool === "pubmed_format_citations") return <div className={styles.resultStack} data-testid="pubmed-citation-results"><ResultHeader icon={<Quote size={14} />} title="格式化引用" count={rows(payload.citations).length} />{rows(payload.citations).map((item) => <article className={styles.citationCard} key={display(item.pmid)}><header><strong>{display(item.title)}</strong><code>PMID {display(item.pmid)}</code></header>{Object.entries(object(item.citations)).map(([format, value]) => <div key={format}><span>{format.toUpperCase()}</span><pre>{display(value)}</pre></div>)}</article>)}</div>;
  if (tool === "pubmed_lookup_citation") return <div className={styles.resultStack} data-testid="pubmed-lookup-results"><ResultHeader icon={<FileSearch size={14} />} title="结构化引用反查" count={rows(payload.results).length} />{rows(payload.results).map((item) => <article className={styles.lookupCard} key={display(item.key)}><span data-ok={item.matched === true}>{item.matched === true ? "MATCHED" : display(item.status).toUpperCase()}</span><strong>PMID {display(item.pmid)}</strong><p>{display(item.matchedFirstAuthor, "未匹配作者")}</p></article>)}</div>;
  if (tool === "pubmed_convert_ids") return <div className={styles.resultStack} data-testid="pubmed-convert-results"><ResultHeader icon={<Braces size={14} />} title="标识符对照" count={rows(payload.records).length} /><DataTable rows={rows(payload.records)} columns={["requestedId", "pmid", "pmcid", "doi"]} /></div>;
  if (tool === "pubmed_fetch_fulltext") return <div className={styles.resultStack} data-testid="pubmed-fulltext-result"><ResultHeader icon={<BookOpenText size={14} />} title="开放全文" count={rows(payload.articles).length} />{rows(payload.articles).map((article) => <article className={styles.fulltext} key={display(article.pmcId ?? article.doi)}><header><div><strong>{display(article.title)}</strong><span>{display(article.source).toUpperCase()}</span></div><code>{display(article.pmcId)} · PMID {display(article.pmid)}</code></header><p>{display(article.abstractText ?? article.abstract, "无摘要")}</p>{rows(article.sections).slice(0, 5).map((section, index) => <section key={`${display(section.title)}:${index}`}><h4>{display(section.title, `Section ${index + 1}`)}</h4><p>{display(section.text ?? section.content)}</p></section>)}</article>)}</div>;

  const articleRows = tool === "pubmed_search_articles"
    ? rows(payload.summaries)
    : tool === "pubmed_europepmc_search"
      ? rows(payload.hits)
      : rows(payload.articles);
  const testId = tool === "pubmed_search_articles" || tool === "pubmed_europepmc_search" ? "pubmed-search-results" : tool === "pubmed_find_related" ? "pubmed-related-results" : "pubmed-article-results";
  const title = tool === "pubmed_europepmc_search" ? "Europe PMC 命中" : tool === "pubmed_find_related" ? "关联文献" : tool === "pubmed_fetch_articles" ? "文章证据" : "PubMed 命中";
  return <div className={styles.resultStack} data-testid={testId}><ResultHeader icon={tool === "pubmed_find_related" ? <GitBranch size={14} /> : <FileSearch size={14} />} title={title} count={articleRows.length} />{articleRows.length ? <div className={styles.articleList}>{articleRows.map((article, index) => <ArticleCard key={`${display(article.pmid ?? article.epmcId)}:${index}`} article={article} />)}</div> : <div className={styles.noResults}>没有匹配记录</div>}</div>;
}

function ArticleCard({ article }: { article: Row }) {
  const journal = object(article.journalInfo);
  return <article className={styles.articleCard}><header><span>{display(article.source, "PubMed")}</span><code>PMID {display(article.pmid, display(article.epmcId))}</code></header><strong>{display(article.title, "未命名文献")}</strong><p>{authors(article.authors)}</p><footer><span>{display(article.pubDate ?? article.firstPublicationDate ?? object(journal.publicationDate).year)}</span><span>{display(article.pmcId, "")}</span><span>{display(article.doi)}</span>{article.isOpenAccess === true ? <b>OPEN ACCESS</b> : null}</footer>{typeof article.abstractText === "string" ? <details><summary>摘要</summary><p>{article.abstractText}</p></details> : null}</article>;
}

function ResultHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return <div className={styles.resultHeader}>{icon}<strong>{title}</strong><span>{count} 项</span></div>;
}

function DataTable({ rows: data, columns }: { rows: Row[]; columns: string[] }) {
  return <div className={styles.dataWrap}><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{data.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{display(row[column])}</td>)}</tr>)}</tbody></table></div>;
}

function AssetResult({ asset }: { asset: { kind: "database" | "plan"; text: string } }) {
  if (asset.kind === "plan") return <div className={styles.planResult} data-testid="pubmed-plan-result"><header><FlaskConical size={15} /><strong>research_plan</strong></header><pre>{asset.text}</pre></div>;
  let data: Row = {};
  try { data = object(JSON.parse(asset.text)); } catch { data = {}; }
  return <div className={styles.databaseResult} data-testid="pubmed-database-result"><ResultHeader icon={<Database size={14} />} title={display(data.description, "PubMed database")} count={rows(data.fields).length} /><div className={styles.metrics}><span><small>记录数</small><strong>{display(data.count)}</strong></span><span><small>最后更新</small><strong>{display(data.lastUpdate)}</strong></span></div><DataTable rows={rows(data.fields).slice(0, 40)} columns={["name", "fullName", "description"]} /></div>;
}

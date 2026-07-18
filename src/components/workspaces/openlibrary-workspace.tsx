"use client";

import {
  BookOpen,
  BookText,
  ImageIcon,
  Library,
  ListFilter,
  Play,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";
import styles from "./openlibrary-workspace.module.css";

const tabs = [
  { id: "search", label: "作品搜索", icon: Search },
  { id: "work", label: "作品与版本", icon: BookOpen },
  { id: "edition", label: "单版本", icon: BookText },
  { id: "authors", label: "作者", icon: UserRound },
  { id: "subject", label: "主题", icon: ListFilter },
  { id: "cover", label: "封面", icon: ImageIcon },
] as const;
type Tab = (typeof tabs)[number]["id"];
type Row = Record<string, unknown>;

function value(value: unknown, fallback = "-"): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function coverUrl(id: unknown, target: "book" | "author" = "book"): string | null {
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  return `https://covers.openlibrary.org/${target === "author" ? "a" : "b"}/id/${id}-M.jpg`;
}

function CoverImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return <div className={styles.coverPlaceholder}><BookOpen size={20} /></div>;
  // The adapter only permits numeric Covers API identifiers or a validated fixed-origin URL.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.coverImage} src={src} alt={alt} loading="lazy" />;
}

export function OpenLibraryWorkspace() {
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("The Hobbit");
  const [sort, setSort] = useState("relevance");
  const [workId, setWorkId] = useState("OL27482W");
  const [workMode, setWorkMode] = useState<"detail" | "editions">("detail");
  const [editionIdentifier, setEditionIdentifier] = useState("OL7353617M");
  const [editionType, setEditionType] = useState<"isbn" | "oclc" | "lccn" | "olid">("olid");
  const [authorQuery, setAuthorQuery] = useState("J. R. R. Tolkien");
  const [authorId, setAuthorId] = useState("OL26320A");
  const [authorMode, setAuthorMode] = useState<"search" | "detail" | "works">("search");
  const [subject, setSubject] = useState("science fiction");
  const [coverIdentifier, setCoverIdentifier] = useState("14627509");
  const [coverType, setCoverType] = useState<"id" | "isbn" | "olid">("id");
  const [coverTarget, setCoverTarget] = useState<"book" | "author">("book");
  const [coverSize, setCoverSize] = useState<"S" | "M" | "L">("M");
  const [lastTool, setLastTool] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [resource, setResource] = useState<{ uri: string; text: string } | null>(null);
  const [resourcePending, setResourcePending] = useState(false);
  const runtime = usePluginInvoke("openlibrary-research-desk");
  const payload = useMemo(() => resultJson(runtime.result), [runtime.result]);

  function switchTab(next: Tab) {
    setTab(next);
    setLocalError(null);
    setResource(null);
    runtime.setResult(null);
  }

  async function call(tool: string, args: Record<string, unknown>) {
    setLocalError(null);
    setResource(null);
    setLastTool(tool);
    try {
      return await runtime.invoke(tool, args);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Open Library 调用失败。");
      return null;
    }
  }

  async function run() {
    if (tab === "search") await call("openlibrary_search_books", { query, sort, limit: 6, offset: 0, include_availability: false });
    if (tab === "work") await call(workMode === "detail" ? "openlibrary_get_work" : "openlibrary_get_editions", workMode === "detail" ? { work_id: workId } : { work_id: workId, limit: 6, offset: 0 });
    if (tab === "edition") await call("openlibrary_get_edition", { identifier: editionIdentifier, id_type: editionType });
    if (tab === "authors") {
      if (authorMode === "search") await call("openlibrary_search_authors", { query: authorQuery, limit: 6, offset: 0 });
      if (authorMode === "detail") await call("openlibrary_get_author", { author_id: authorId });
      if (authorMode === "works") await call("openlibrary_get_author_works", { author_id: authorId, limit: 6, offset: 0 });
    }
    if (tab === "subject") await call("openlibrary_get_subject", { subject, limit: 6, offset: 0 });
    if (tab === "cover") await call("openlibrary_get_cover_url", { identifier: coverIdentifier, id_type: coverType, target: coverTarget, size: coverSize });
  }

  async function readResource(uri: string) {
    setLocalError(null);
    setResourcePending(true);
    runtime.setResult(null);
    try {
      const response = await fetch("/api/plugins/openlibrary-research-desk/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "resource", uri }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "OpenLibrary 资源读取失败。");
      const first = body.result?.contents?.[0];
      setResource({ uri: String(first?.uri ?? uri), text: String(first?.text ?? "") });
      setLastTool("resource");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "OpenLibrary 资源读取失败。");
    } finally {
      setResourcePending(false);
    }
  }

  const works = Array.isArray(payload?.works) ? payload.works as Row[] : [];
  const editions = Array.isArray(payload?.editions) ? payload.editions as Row[] : [];
  const authors = Array.isArray(payload?.authors) ? payload.authors as Row[] : [];
  const photoIds = Array.isArray(payload?.photo_ids) ? payload.photo_ids : [];
  const coverSrc = lastTool === "openlibrary_get_cover_url" && typeof payload?.url === "string" ? payload.url : null;

  return (
    <div className={`workspace-card ${styles.workspace}`}>
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Library size={14} />OpenLibrary 图书研究台</div>
        <span className="badge medium">固定 openlibrary.org · 无 API Key</span>
      </div>
      <div className={styles.tabs} role="tablist" aria-label="OpenLibrary 工作流">
        {tabs.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? styles.active : ""} data-testid={`openlibrary-tab-${item.id}`} onClick={() => switchTab(item.id)}><Icon size={12} />{item.label}</button>;
        })}
      </div>
      <div className={`workspace-body ${styles.layout}`}>
        <div className={`control-panel ${styles.controls}`}>
          {tab === "search" ? <>
            <div className="field-group"><label className="field-label" htmlFor="ol-query">书名、作者或关键词</label><input id="ol-query" data-testid="openlibrary-query" className="field-input" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            <div className="field-group"><label className="field-label" htmlFor="ol-sort">排序</label><select id="ol-sort" className="field-select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="relevance">相关度</option><option value="new">较新出版</option><option value="old">较早出版</option><option value="rating">社区评分</option><option value="editions">版本数量</option></select></div>
          </> : null}
          {tab === "work" ? <>
            <div className={styles.segmented}><button type="button" aria-pressed={workMode === "detail"} data-testid="openlibrary-work-detail" onClick={() => setWorkMode("detail")}>作品详情</button><button type="button" aria-pressed={workMode === "editions"} data-testid="openlibrary-work-editions" onClick={() => setWorkMode("editions")}>版本列表</button></div>
            <div className="field-group"><label className="field-label" htmlFor="ol-work">Work ID</label><input id="ol-work" data-testid="openlibrary-work-id" className="field-input" value={workId} onChange={(event) => setWorkId(event.target.value)} /></div>
            <button type="button" className="secondary-button" data-testid="openlibrary-work-resource" onClick={() => readResource(`openlibrary://works/${workId}`)} disabled={resourcePending}>读取 Work MCP 资源</button>
          </> : null}
          {tab === "edition" ? <>
            <div className="field-group"><label className="field-label" htmlFor="ol-edition-type">标识类型</label><select id="ol-edition-type" data-testid="openlibrary-edition-type" className="field-select" value={editionType} onChange={(event) => setEditionType(event.target.value as typeof editionType)}><option value="olid">Edition OLID</option><option value="isbn">ISBN</option><option value="oclc">OCLC</option><option value="lccn">LCCN</option></select></div>
            <div className="field-group"><label className="field-label" htmlFor="ol-edition">版本标识</label><input id="ol-edition" data-testid="openlibrary-edition-id" className="field-input" value={editionIdentifier} onChange={(event) => setEditionIdentifier(event.target.value)} /></div>
          </> : null}
          {tab === "authors" ? <>
            <div className={styles.segmented}><button type="button" aria-pressed={authorMode === "search"} data-testid="openlibrary-author-search-mode" onClick={() => setAuthorMode("search")}>搜索</button><button type="button" aria-pressed={authorMode === "detail"} data-testid="openlibrary-author-detail-mode" onClick={() => setAuthorMode("detail")}>档案</button><button type="button" aria-pressed={authorMode === "works"} data-testid="openlibrary-author-works-mode" onClick={() => setAuthorMode("works")}>作品</button></div>
            {authorMode === "search" ? <div className="field-group"><label className="field-label" htmlFor="ol-author-query">作者姓名</label><input id="ol-author-query" data-testid="openlibrary-author-query" className="field-input" value={authorQuery} onChange={(event) => setAuthorQuery(event.target.value)} /></div> : <div className="field-group"><label className="field-label" htmlFor="ol-author-id">Author ID</label><input id="ol-author-id" data-testid="openlibrary-author-id" className="field-input" value={authorId} onChange={(event) => setAuthorId(event.target.value)} /></div>}
            {authorMode !== "search" ? <button type="button" className="secondary-button" data-testid="openlibrary-author-resource" onClick={() => readResource(`openlibrary://authors/${authorId}`)} disabled={resourcePending}>读取 Author MCP 资源</button> : null}
          </> : null}
          {tab === "subject" ? <div className="field-group"><label className="field-label" htmlFor="ol-subject">主题标签</label><input id="ol-subject" data-testid="openlibrary-subject" className="field-input" value={subject} onChange={(event) => setSubject(event.target.value)} /></div> : null}
          {tab === "cover" ? <>
            <div className={styles.compactGrid}>
              <div className="field-group"><label className="field-label" htmlFor="ol-cover-type">标识类型</label><select id="ol-cover-type" data-testid="openlibrary-cover-type" className="field-select" value={coverType} onChange={(event) => setCoverType(event.target.value as typeof coverType)}><option value="id">Cover ID</option><option value="isbn">ISBN</option><option value="olid">OLID</option></select></div>
              <div className="field-group"><label className="field-label" htmlFor="ol-cover-target">目标</label><select id="ol-cover-target" className="field-select" value={coverTarget} onChange={(event) => setCoverTarget(event.target.value as typeof coverTarget)}><option value="book">书籍</option><option value="author">作者</option></select></div>
            </div>
            <div className="field-group"><label className="field-label" htmlFor="ol-cover-id">封面/照片标识</label><input id="ol-cover-id" data-testid="openlibrary-cover-id" className="field-input" value={coverIdentifier} onChange={(event) => setCoverIdentifier(event.target.value)} /></div>
            <div className={styles.sizeChoices}>{(["S", "M", "L"] as const).map((size) => <button type="button" key={size} aria-pressed={coverSize === size} onClick={() => setCoverSize(size)}>{size}</button>)}</div>
          </> : null}
          <button type="button" className="primary-button" data-testid="openlibrary-run" onClick={run} disabled={runtime.pending || resourcePending}><Play size={13} />{runtime.pending ? "正在查询..." : "查询 Open Library"}</button>
          <div className="sandbox-notice"><ShieldCheck size={14} />只允许固定 Open Library JSON 路径；不接收主机、URL、代理、请求头、凭据或任意分页。</div>
        </div>
        <ResultView result={runtime.result} error={localError ?? runtime.error} pending={runtime.pending || resourcePending} activity={runtime.activity} emptyTitle="从作品记录追到具体版本与作者" emptyDescription="搜索作品，检查版本、作者、主题与可用封面。" hideRaw={Boolean(payload || resource)}>
          {resource ? <div className={styles.resource} data-testid="openlibrary-resource"><header><BookText size={14} /><strong>{resource.uri}</strong></header><pre>{resource.text}</pre></div> : null}
          {payload ? <div className={styles.results} data-testid="openlibrary-result">
            {lastTool === "openlibrary_search_books" || lastTool === "openlibrary_get_author_works" || lastTool === "openlibrary_get_subject" ? <>
              <div className={styles.resultHeader}><strong>{lastTool === "openlibrary_get_subject" ? value(payload.subject_name) : "作品结果"}</strong><span>{value(payload.total ?? payload.work_count, "0")} 条记录</span></div>
              <div className={styles.bookGrid} data-testid="openlibrary-books">{works.map((item) => {
                const id = value(item.work_id); const image = coverUrl(item.cover_id ?? (Array.isArray(item.cover_ids) ? item.cover_ids[0] : undefined));
                return <article key={`${id}-${value(item.title)}`}><CoverImage src={image} alt={`${value(item.title)} 封面`} /><div><h4>{value(item.title)}</h4><code>{id}</code><p>{Array.isArray(item.author_names) ? item.author_names.map(String).join(", ") : value(item.first_publish_date, "作者/日期未记录")}</p><button type="button" onClick={() => { setWorkId(id); switchTab("work"); }}>查看作品</button></div></article>;
              })}</div>
            </> : null}
            {lastTool === "openlibrary_get_work" ? <div className={styles.detail} data-testid="openlibrary-work-result"><div className={styles.detailHero}><CoverImage src={coverUrl(Array.isArray(payload.cover_ids) ? payload.cover_ids[0] : undefined)} alt={`${value(payload.title)} 封面`} /><div><code>{value(payload.work_id)}</code><h3>{value(payload.title)}</h3><p>{value(payload.description, "Open Library 未提供简介。")}</p></div></div><div className={styles.chips}>{Array.isArray(payload.subjects) ? payload.subjects.slice(0, 18).map((item) => <span key={String(item)}>{String(item)}</span>) : null}</div></div> : null}
            {lastTool === "openlibrary_get_editions" ? <div className={styles.editionList} data-testid="openlibrary-editions"><div className={styles.resultHeader}><strong>{value(payload.work_id)}</strong><span>{value(payload.total, "0")} 个版本</span></div>{editions.map((item) => <article key={value(item.edition_id)}><div><strong>{value(item.title)}</strong><code>{value(item.edition_id)}</code></div><span>{value(item.publish_date, "日期未知")} · {Array.isArray(item.languages) ? item.languages.join(", ") : "语言未知"}</span><button type="button" onClick={() => { setEditionType("olid"); setEditionIdentifier(value(item.edition_id)); switchTab("edition"); }}>打开版本</button></article>)}</div> : null}
            {lastTool === "openlibrary_get_edition" ? <div className={styles.detail} data-testid="openlibrary-edition-result"><div className={styles.resultHeader}><strong>{value(payload.title)}</strong><code>{value(payload.edition_id)}</code></div><dl><div><dt>作者</dt><dd>{Array.isArray(payload.authors) ? payload.authors.map((item) => value((item as Row).name)).join(", ") || "未记录" : "未记录"}</dd></div><div><dt>出版社</dt><dd>{Array.isArray(payload.publishers) ? payload.publishers.join(", ") : "未记录"}</dd></div><div><dt>ISBN-13</dt><dd>{Array.isArray(payload.isbn_13) ? payload.isbn_13.join(", ") : "未记录"}</dd></div><div><dt>页数</dt><dd>{value(payload.page_count, "未记录")}</dd></div></dl></div> : null}
            {lastTool === "openlibrary_search_authors" ? <div className={styles.authorList} data-testid="openlibrary-authors"><div className={styles.resultHeader}><strong>作者结果</strong><span>{value(payload.total, "0")} 条记录</span></div>{authors.map((item) => <article key={value(item.author_id)}><div><strong>{value(item.name)}</strong><code>{value(item.author_id)}</code><p>{value(item.top_work, "代表作未记录")}</p></div><button type="button" onClick={() => { setAuthorId(value(item.author_id)); setAuthorMode("detail"); }}>查看档案</button></article>)}</div> : null}
            {lastTool === "openlibrary_get_author" ? <div className={styles.authorDetail} data-testid="openlibrary-author-result"><CoverImage src={coverUrl(photoIds[0], "author")} alt={`${value(payload.name)} 照片`} /><div><code>{value(payload.author_id)}</code><h3>{value(payload.name)}</h3><p>{value(payload.bio, "Open Library 未提供作者简介。")}</p><span>{value(payload.birth_date, "出生日期未记录")}{payload.death_date ? ` - ${value(payload.death_date)}` : ""}</span></div></div> : null}
            {lastTool === "openlibrary_get_cover_url" ? <div className={styles.coverResult} data-testid="openlibrary-cover-result"><CoverImage src={coverSrc} alt="Open Library 封面预览" /><div><strong>固定来源封面 URL</strong><code>{value(payload.url)}</code><p>{value(payload.note)}</p></div></div> : null}
          </div> : null}
        </ResultView>
      </div>
    </div>
  );
}

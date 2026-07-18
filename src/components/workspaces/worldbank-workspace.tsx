"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  BookOpenText,
  Database,
  Globe2,
  Landmark,
  LibraryBig,
  MapPinned,
  Play,
  Search,
  ShieldCheck,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";
import styles from "./worldbank-workspace.module.css";

type Tab = "discover" | "data" | "countries" | "catalog" | "resources";
type Row = Record<string, unknown>;

const tabs = [
  { id: "discover", label: "指标发现", icon: Search },
  { id: "data", label: "指标与数据", icon: BarChart3 },
  { id: "countries", label: "国家画像", icon: MapPinned },
  { id: "catalog", label: "主题与来源", icon: LibraryBig },
  { id: "resources", label: "MCP 资源", icon: Database },
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

function compactNumber(value: unknown): string {
  const number = finite(value, Number.NaN);
  if (!Number.isFinite(number)) return "缺失";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, notation: Math.abs(number) >= 1_000_000 ? "compact" : "standard" }).format(number);
}

export function WorldBankWorkspace() {
  const runtime = usePluginInvoke("worldbank-development-data-lab");
  const [tab, setTab] = useState<Tab>("discover");
  const [scopeType, setScopeType] = useState<"topic" | "source">("topic");
  const [query, setQuery] = useState("GDP per capita");
  const [scopeId, setScopeId] = useState("3");
  const [dataMode, setDataMode] = useState<"metadata" | "series">("series");
  const [indicatorId, setIndicatorId] = useState("NY.GDP.PCAP.CD");
  const [countryCodes, setCountryCodes] = useState("USA, CHN");
  const [dateRange, setDateRange] = useState("2020:2023");
  const [countryMode, setCountryMode] = useState<"list" | "detail">("list");
  const [region, setRegion] = useState("EAS");
  const [countryCode, setCountryCode] = useState("CHN");
  const [catalogMode, setCatalogMode] = useState<"topics" | "sources">("topics");
  const [resourceMode, setResourceMode] = useState<"indicator" | "country">("indicator");
  const [asset, setAsset] = useState<{ uri: string; payload: Row } | null>(null);
  const [assetPending, setAssetPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastTool, setLastTool] = useState("");

  const payload = useMemo(() => object(resultJson(runtime.result)), [runtime.result]);
  const busy = runtime.pending || assetPending;

  function switchTab(next: Tab) {
    setTab(next);
    setAsset(null);
    setLocalError(null);
    runtime.setResult(null);
  }

  async function call(tool: string, args: Record<string, unknown>) {
    setAsset(null);
    setLocalError(null);
    setLastTool(tool);
    try {
      return await runtime.invoke(tool, args);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "World Bank 调用失败。");
      return null;
    }
  }

  async function loadResource() {
    setAssetPending(true);
    setLocalError(null);
    runtime.setResult(null);
    const uri = resourceMode === "indicator" ? `worldbank://indicator/${indicatorId}` : `worldbank://country/${countryCode}`;
    try {
      const response = await fetch("/api/plugins/worldbank-development-data-lab/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "resource", uri }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "World Bank 资源读取失败。");
      setAsset({ uri, payload: object(JSON.parse(String(result.result?.contents?.[0]?.text ?? "{}"))) });
      setLastTool(`resource:${resourceMode}`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "World Bank 资源读取失败。");
    } finally {
      setAssetPending(false);
    }
  }

  async function run() {
    if (tab === "discover") {
      await call("worldbank_search_indicators", {
        query,
        ...(scopeType === "topic" ? { topic_id: scopeId } : { source_id: scopeId }),
        page: 1,
        per_page: 10,
      });
    }
    if (tab === "data") {
      if (dataMode === "metadata") await call("worldbank_get_indicator", { indicator_id: indicatorId });
      else await call("worldbank_get_data", {
        indicator_id: indicatorId,
        countries: countryCodes.split(",").map((item) => item.trim()).filter(Boolean),
        date_range: dateRange,
        page: 1,
        per_page: 500,
      });
    }
    if (tab === "countries") {
      if (countryMode === "list") await call("worldbank_list_countries", { region, include_aggregates: false, page: 1, per_page: 10 });
      else await call("worldbank_get_country", { country_code: countryCode });
    }
    if (tab === "catalog") {
      if (catalogMode === "topics") await call("worldbank_list_topics", {});
      else await call("worldbank_list_sources", { page: 1, per_page: 10 });
    }
    if (tab === "resources") await loadResource();
  }

  function openIndicator(item: Row) {
    setIndicatorId(display(item.id));
    setDataMode("metadata");
    switchTab("data");
  }

  function openCountry(item: Row) {
    setCountryCode(display(item.id));
    setCountryMode("detail");
    switchTab("countries");
  }

  const indicators = rows(payload.indicators);
  const countries = rows(payload.countries);
  const topics = rows(payload.topics);
  const sources = rows(payload.sources);
  const points = rows(payload.data);

  return (
    <div className={`workspace-card ${styles.workspace}`}>
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Globe2 size={14} />World Bank 发展数据实验室</div>
        <span className="badge medium"><ShieldCheck size={10} />匿名只读 · 官方 API</span>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="World Bank 工作流">
        {tabs.map((item) => {
          const Icon = item.icon;
          return <button type="button" role="tab" aria-selected={tab === item.id} data-testid={`worldbank-tab-${item.id}`} className={tab === item.id ? styles.active : ""} key={item.id} onClick={() => switchTab(item.id)}><Icon size={12} />{item.label}</button>;
        })}
      </div>

      <div className={`workspace-body ${styles.layout}`}>
        <div className={`control-panel ${styles.controls}`}>
          {tab === "discover" ? <>
            <Segmented value={scopeType} prefix="worldbank-scope" options={[{ id: "topic", label: "主题内检索" }, { id: "source", label: "数据源内检索" }]} onChange={(value) => { const next = value as typeof scopeType; setScopeType(next); setScopeId(next === "topic" ? "3" : "2"); }} />
            <Field label="关键词" htmlFor="worldbank-query"><input id="worldbank-query" data-testid="worldbank-query" className="field-input" value={query} onChange={(event) => setQuery(event.target.value)} /></Field>
            <Field label={scopeType === "topic" ? "Topic ID" : "Source ID"} htmlFor="worldbank-scope-id"><input id="worldbank-scope-id" data-testid="worldbank-scope-id" className="field-input code" value={scopeId} onChange={(event) => setScopeId(event.target.value)} /></Field>
            <div className={styles.examples}><button type="button" onClick={() => { setScopeType("topic"); setScopeId("3"); setQuery("GDP per capita"); }}>GDP per capita</button><button type="button" onClick={() => { setScopeType("topic"); setScopeId("8"); setQuery("life expectancy"); }}>预期寿命</button></div>
            <div className={styles.hint}><ShieldCheck size={12} />0.1.14 的 keyword-only 路径会忽略检索词；本适配强制绑定 Topic 或 Source，避免展示无关目录。</div>
          </> : null}

          {tab === "data" ? <>
            <Segmented value={dataMode} prefix="worldbank-data" options={[{ id: "metadata", label: "指标定义" }, { id: "series", label: "多国时间序列" }]} onChange={(value) => setDataMode(value as typeof dataMode)} />
            <Field label="Indicator ID" htmlFor="worldbank-indicator"><input id="worldbank-indicator" data-testid="worldbank-indicator" className="field-input code" value={indicatorId} onChange={(event) => setIndicatorId(event.target.value)} /></Field>
            {dataMode === "series" ? <><Field label="国家代码（逗号分隔，最多 8 个）" htmlFor="worldbank-countries"><input id="worldbank-countries" data-testid="worldbank-countries" className="field-input code" value={countryCodes} onChange={(event) => setCountryCodes(event.target.value)} /></Field><Field label="年份或范围" htmlFor="worldbank-date-range"><input id="worldbank-date-range" data-testid="worldbank-date-range" className="field-input code" value={dateRange} onChange={(event) => setDateRange(event.target.value)} /></Field></> : null}
          </> : null}

          {tab === "countries" ? <>
            <Segmented value={countryMode} prefix="worldbank-country" options={[{ id: "list", label: "区域列表" }, { id: "detail", label: "国家画像" }]} onChange={(value) => setCountryMode(value as typeof countryMode)} />
            {countryMode === "list" ? <Field label="World Bank Region" htmlFor="worldbank-region"><select id="worldbank-region" data-testid="worldbank-region" className="field-select" value={region} onChange={(event) => setRegion(event.target.value)}><option value="EAS">East Asia & Pacific</option><option value="ECS">Europe & Central Asia</option><option value="LCN">Latin America & Caribbean</option><option value="MEA">Middle East & North Africa</option><option value="NAC">North America</option><option value="SAS">South Asia</option><option value="SSF">Sub-Saharan Africa</option></select></Field> : <Field label="Country / Aggregate Code" htmlFor="worldbank-country-code"><input id="worldbank-country-code" data-testid="worldbank-country-code" className="field-input code" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} /></Field>}
          </> : null}

          {tab === "catalog" ? <>
            <Segmented value={catalogMode} prefix="worldbank-catalog" options={[{ id: "topics", label: "21 个主题" }, { id: "sources", label: "数据源目录" }]} onChange={(value) => setCatalogMode(value as typeof catalogMode)} />
            <div className={styles.hint}><LibraryBig size={12} />Topic ID 用于可靠关键词检索；Source ID 代表 WDI、债务、气候等数据集来源。</div>
          </> : null}

          {tab === "resources" ? <>
            <Segmented value={resourceMode} prefix="worldbank-resource" options={[{ id: "indicator", label: "Indicator 资源" }, { id: "country", label: "Country 资源" }]} onChange={(value) => setResourceMode(value as typeof resourceMode)} />
            {resourceMode === "indicator" ? <Field label="Indicator ID" htmlFor="worldbank-resource-indicator"><input id="worldbank-resource-indicator" className="field-input code" value={indicatorId} onChange={(event) => setIndicatorId(event.target.value)} /></Field> : <Field label="Country Code" htmlFor="worldbank-resource-country"><input id="worldbank-resource-country" className="field-input code" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} /></Field>}
          </> : null}

          <button type="button" className="primary-button" data-testid="worldbank-run" disabled={busy} onClick={run}><Play size={13} fill="currentColor" />{busy ? "正在查询" : tabs.find((item) => item.id === tab)?.label}</button>
          <div className={styles.boundary}><ShieldCheck size={13} /><span>固定 api.worldbank.org</span><span>最多 8 个国家</span><span>最多 51 年</span><span>来源可见</span></div>
        </div>

        <ResultView
          result={runtime.result}
          error={localError ?? runtime.error}
          pending={busy}
          activity={runtime.activity}
          emptyTitle="等待发展数据查询"
          emptyDescription="发现指标、拉取多国序列、查看国家画像或读取 MCP 资源。"
          hideRaw={Boolean(runtime.result && Object.keys(payload).length)}
        >
          {lastTool === "worldbank_search_indicators" && runtime.result ? <div className={styles.stack} data-testid="worldbank-indicators"><div className={styles.resultHeader}><strong>指标结果</strong><span>{display(payload.totalCount, "0")} 条 · {display(payload.effectiveQuery, "")}</span></div><div className={styles.indicatorList}>{indicators.map((item) => <article key={display(item.id)}><div><code>{display(item.id)}</code><h4>{display(item.name)}</h4><p>{display(item.sourceName)}</p><span>{display(item.sourceNote, "无定义说明")}</span></div><button type="button" onClick={() => openIndicator(item)}>打开指标</button></article>)}</div></div> : null}

          {lastTool === "worldbank_get_indicator" && runtime.result ? <div className={styles.indicatorDetail} data-testid="worldbank-indicator-detail"><header><BookOpenText size={22} /><div><code>{display(payload.id)}</code><h3>{display(payload.name)}</h3><p>{display(payload.sourceName)} · Source {display(payload.sourceId)}</p></div></header><section><strong>定义与口径</strong><p>{display(payload.sourceNote, "未提供说明")}</p></section><section><strong>来源组织</strong><p>{display(payload.sourceOrganization, "未记录")}</p></section><div className={styles.chips}>{rows(payload.topics).map((item) => <span key={display(item.id)}>{display(item.name)}</span>)}</div></div> : null}

          {lastTool === "worldbank_get_data" && runtime.result ? <div className={styles.stack} data-testid="worldbank-data-result"><div className={styles.resultHeader}><strong>{display(object(payload.indicator).name, display(object(payload.indicator).id))}</strong><span>{points.length} 个观测 · 空值 {display(payload.nullCount, "0")}</span></div><SeriesChart points={points} /><div className={styles.dataTable}>{points.map((item) => <article key={`${display(item.countryIso3)}-${display(item.date)}`}><strong>{display(item.countryName)}</strong><code>{display(item.countryIso3)}</code><span>{display(item.date)}</span><b>{compactNumber(item.value)}</b></article>)}</div></div> : null}

          {lastTool === "worldbank_list_countries" && runtime.result ? <div className={styles.stack} data-testid="worldbank-countries-result"><div className={styles.resultHeader}><strong>{region} 国家</strong><span>{display(payload.totalCount, "0")} 条</span></div><div className={styles.countryGrid}>{countries.map((item) => <article key={display(item.id)}><MapPinned size={18} /><div><code>{display(item.id)} · {display(item.iso2)}</code><h4>{display(item.name)}</h4><p>{display(object(item.incomeLevel).name)} · {display(item.capitalCity, "首都未记录")}</p></div><button type="button" onClick={() => openCountry(item)}>画像</button></article>)}</div></div> : null}

          {lastTool === "worldbank_get_country" && runtime.result ? <div className={styles.countryDetail} data-testid="worldbank-country-detail"><header><Landmark size={24} /><div><code>{display(payload.id)} · {display(payload.iso2)}</code><h3>{display(payload.name)}</h3><p>{display(payload.capitalCity, "首都未记录")}</p></div></header><div className={styles.metrics}><span><small>地区</small><strong>{display(object(payload.region).name)}</strong></span><span><small>收入组</small><strong>{display(object(payload.incomeLevel).name)}</strong></span><span><small>贷款类型</small><strong>{display(payload.lendingType)}</strong></span><span><small>坐标</small><strong>{display(payload.latitude)}, {display(payload.longitude)}</strong></span></div></div> : null}

          {lastTool === "worldbank_list_topics" && runtime.result ? <div className={styles.topicGrid} data-testid="worldbank-topics">{topics.map((item) => <article key={display(item.id)}><span>{display(item.id)}</span><h4>{display(item.name)}</h4><p>{display(item.sourceNote, "暂无说明")}</p><button type="button" onClick={() => { setScopeType("topic"); setScopeId(display(item.id)); setQuery(""); switchTab("discover"); }}>浏览指标</button></article>)}</div> : null}

          {lastTool === "worldbank_list_sources" && runtime.result ? <div className={styles.sourceList} data-testid="worldbank-sources"><div className={styles.resultHeader}><strong>数据源</strong><span>{display(payload.totalCount, "0")} 个</span></div>{sources.map((item) => <article key={display(item.id)}><code>{display(item.id)} · {display(item.code)}</code><strong>{display(item.name)}</strong><span>更新 {display(item.lastUpdated)} · 数据 {display(item.dataAvailability)} · 元数据 {display(item.metadataAvailability)}</span></article>)}</div> : null}

          {lastTool.startsWith("resource:") && asset ? <div className={styles.resourceCard} data-testid="worldbank-resource-result"><span>MCP RESOURCE</span><code>{asset.uri}</code><h3>{display(asset.payload.name, display(asset.payload.id))}</h3><p>{resourceMode === "indicator" ? display(asset.payload.sourceNote, "未提供指标说明") : `${display(object(asset.payload.region).name)} · ${display(object(asset.payload.incomeLevel).name)} · ${display(asset.payload.capitalCity, "首都未记录")}`}</p></div> : null}
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

function SeriesChart({ points }: { points: Row[] }) {
  const chartPoints = points.filter((item) => typeof item.value === "number" && Number.isFinite(item.value));
  if (!chartPoints.length) return null;
  const values = chartPoints.map((item) => item.value as number);
  const minimum = Math.min(...values); const maximum = Math.max(...values); const span = maximum - minimum || 1;
  const dates = [...new Set(chartPoints.map((item) => display(item.date)))].sort((left, right) => left.localeCompare(right));
  const groups = new Map<string, Row[]>();
  for (const point of chartPoints) {
    const key = display(point.countryIso3);
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }
  const colors = ["#2169a3", "#d14b3d", "#4c8a47", "#8c55a5", "#c27b1a", "#237e7b", "#9b5b42", "#5e6eb4"];
  return <div className={styles.chart}><svg viewBox="0 0 720 260" role="img" aria-label="World Bank 时间序列折线图"><line x1="42" y1="20" x2="42" y2="225" /><line x1="42" y1="225" x2="700" y2="225" />{[...groups.entries()].map(([key, group], groupIndex) => {
    const sorted = [...group].sort((left, right) => display(left.date).localeCompare(display(right.date)));
    const coords = sorted.map((item) => {
      const x = 55 + (dates.indexOf(display(item.date)) / Math.max(1, dates.length - 1)) * 620;
      const y = 215 - ((finite(item.value) - minimum) / span) * 180;
      return { x, y, item };
    });
    return <g key={key} style={{ color: colors[groupIndex % colors.length] }}><polyline points={coords.map((item) => `${item.x},${item.y}`).join(" ")} /><text x={55} y={20 + groupIndex * 14}>{key}</text>{coords.map((item) => <circle key={`${key}-${display(item.item.date)}`} cx={item.x} cy={item.y} r="4"><title>{key} {display(item.item.date)}: {compactNumber(item.item.value)}</title></circle>)}</g>;
  })}</svg><div><span>{compactNumber(maximum)}</span><span>{compactNumber(minimum)}</span></div></div>;
}

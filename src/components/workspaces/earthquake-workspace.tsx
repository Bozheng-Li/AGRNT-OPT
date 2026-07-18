"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CircleDot,
  Database,
  Gauge,
  Map,
  Play,
  Radar,
  Search,
  ShieldCheck,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";
import styles from "./earthquake-workspace.module.css";

type Tab = "feed" | "search" | "detail" | "compare" | "resources";
type Row = Record<string, unknown>;

const tabs = [
  { id: "feed", label: "实时态势", icon: Radar },
  { id: "search", label: "历史与半径", icon: Search },
  { id: "detail", label: "事件影响", icon: AlertTriangle },
  { id: "compare", label: "跨源计数", icon: Gauge },
  { id: "resources", label: "MCP 资源", icon: Database },
] as const;

const feedWindows: Record<string, string[]> = {
  all: ["hour", "day"],
  "1.0": ["hour", "day"],
  "2.5": ["hour", "day", "week"],
  "4.5": ["hour", "day", "week", "month"],
  significant: ["hour", "day", "week", "month"],
};

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

function dateTime(value: unknown): string {
  if (typeof value !== "string") return "时间未记录";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString("zh-CN", { hour12: false }) : value;
}

function severity(magnitude: unknown): string {
  const value = finite(magnitude, -1);
  if (value >= 7) return "major";
  if (value >= 5) return "strong";
  if (value >= 3) return "moderate";
  return "minor";
}

export function EarthquakeWorkspace() {
  const runtime = usePluginInvoke("earthquake-situation-lab");
  const [tab, setTab] = useState<Tab>("feed");
  const [tier, setTier] = useState("4.5");
  const [window, setWindow] = useState("week");
  const [source, setSource] = useState<"usgs" | "emsc">("usgs");
  const [start, setStart] = useState("2024-01-01");
  const [end, setEnd] = useState("2024-01-08");
  const [minMagnitude, setMinMagnitude] = useState("6");
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [latitude, setLatitude] = useState("37.5");
  const [longitude, setLongitude] = useState("137.2");
  const [radius, setRadius] = useState("500");
  const [eventId, setEventId] = useState("us6000m0xl");
  const [resourceMode, setResourceMode] = useState<"feed" | "event">("feed");
  const [compare, setCompare] = useState<{ usgs: Row; emsc: Row } | null>(null);
  const [asset, setAsset] = useState<{ uri: string; payload: Row } | null>(null);
  const [assetPending, setAssetPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastTool, setLastTool] = useState("");

  const payload = useMemo(() => object(resultJson(runtime.result)), [runtime.result]);
  const events = rows(payload.events);
  const detailEvent = object(payload.event);
  const busy = runtime.pending || assetPending;

  function switchTab(next: Tab) {
    setTab(next);
    setCompare(null);
    setAsset(null);
    setLocalError(null);
    runtime.setResult(null);
  }

  async function call(tool: string, args: Record<string, unknown>) {
    setAsset(null);
    setCompare(null);
    setLocalError(null);
    setLastTool(tool);
    try {
      return await runtime.invoke(tool, args);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "地震数据调用失败。");
      return null;
    }
  }

  function searchArgs(nextSource = source): Record<string, unknown> {
    return {
      start_time: start,
      end_time: end,
      min_magnitude: Number(minMagnitude),
      source: nextSource,
      limit: 10,
      order_by: "magnitude",
      ...(locationEnabled ? {
        latitude: Number(latitude),
        longitude: Number(longitude),
        radius_km: Number(radius),
      } : {}),
    };
  }

  async function loadResource() {
    setAssetPending(true);
    setLocalError(null);
    setCompare(null);
    runtime.setResult(null);
    const uri = resourceMode === "feed" ? `earthquake://feed/${tier}/${window}` : `earthquake://event/${eventId}`;
    try {
      const response = await fetch("/api/plugins/earthquake-situation-lab/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "resource", uri }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Earthquake 资源读取失败。");
      const text = String(result.result?.contents?.[0]?.text ?? "{}");
      setAsset({ uri, payload: object(JSON.parse(text)) });
      setLastTool(`resource:${resourceMode}`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Earthquake 资源读取失败。");
    } finally {
      setAssetPending(false);
    }
  }

  async function run() {
    if (tab === "feed") await call("earthquake_get_feed", { magnitude_tier: tier, time_window: window });
    if (tab === "search") await call("earthquake_search", searchArgs());
    if (tab === "detail") await call("earthquake_get_event", { event_id: eventId });
    if (tab === "compare") {
      setAsset(null);
      setLocalError(null);
      try {
        const base = { start_time: start, end_time: end, min_magnitude: Number(minMagnitude) };
        const usgsResult = await runtime.invoke("earthquake_count", { ...base, source: "usgs" });
        const emscResult = await runtime.invoke("earthquake_count", { ...base, source: "emsc" });
        setCompare({ usgs: object(resultJson(usgsResult)), emsc: object(resultJson(emscResult)) });
        setLastTool("earthquake_compare_counts");
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : "跨源计数失败。");
      }
    }
    if (tab === "resources") await loadResource();
  }

  function openEvent(event: Row) {
    const id = display(event.id, "");
    if (!id.startsWith("us")) return;
    setEventId(id);
    switchTab("detail");
  }

  const shownEvents = lastTool === "earthquake_get_event" ? [detailEvent] : events;

  return (
    <div className={`workspace-card ${styles.workspace}`}>
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Activity size={14} />全球地震态势实验室</div>
        <span className="badge medium"><ShieldCheck size={10} />USGS + EMSC · 只读固定源</span>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Earthquake 工作流">
        {tabs.map((item) => {
          const Icon = item.icon;
          return <button type="button" role="tab" aria-selected={tab === item.id} data-testid={`earthquake-tab-${item.id}`} className={tab === item.id ? styles.active : ""} key={item.id} onClick={() => switchTab(item.id)}><Icon size={12} />{item.label}</button>;
        })}
      </div>

      <div className={`workspace-body ${styles.layout}`}>
        <div className={`control-panel ${styles.controls}`}>
          {tab === "feed" ? <>
            <Field label="震级档" htmlFor="earthquake-tier"><select id="earthquake-tier" data-testid="earthquake-tier" className="field-select" value={tier} onChange={(event) => { const next = event.target.value; setTier(next); if (!feedWindows[next].includes(window)) setWindow(feedWindows[next][0]); }}><option value="all">全部</option><option value="1.0">M1.0+</option><option value="2.5">M2.5+</option><option value="4.5">M4.5+</option><option value="significant">显著事件</option></select></Field>
            <Field label="时间窗口" htmlFor="earthquake-window"><select id="earthquake-window" data-testid="earthquake-window" className="field-select" value={window} onChange={(event) => setWindow(event.target.value)}>{feedWindows[tier].map((item) => <option key={item} value={item}>{({ hour: "过去 1 小时", day: "过去 1 天", week: "过去 7 天", month: "过去 30 天" } as Record<string, string>)[item]}</option>)}</select></Field>
            <div className={styles.hint}><ShieldCheck size={12} />低震级长窗口因响应过大被关闭；公开 Web 只开放 15 个可稳定承载的 feed。</div>
          </> : null}

          {tab === "search" ? <>
            <Segmented value={source} prefix="earthquake-source" options={[{ id: "usgs", label: "USGS" }, { id: "emsc", label: "EMSC" }]} onChange={(value) => setSource(value as typeof source)} />
            <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
            <Field label="最小震级" htmlFor="earthquake-min-mag"><input id="earthquake-min-mag" data-testid="earthquake-min-mag" className="field-input code" inputMode="decimal" value={minMagnitude} onChange={(event) => setMinMagnitude(event.target.value)} /></Field>
            <label className={styles.check}><input type="checkbox" data-testid="earthquake-location-toggle" checked={locationEnabled} onChange={(event) => setLocationEnabled(event.target.checked)} />限定中心半径</label>
            {locationEnabled ? <div className={styles.coordinates}><Field label="纬度" htmlFor="earthquake-lat"><input id="earthquake-lat" className="field-input code" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></Field><Field label="经度" htmlFor="earthquake-lon"><input id="earthquake-lon" className="field-input code" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></Field><Field label="半径 km" htmlFor="earthquake-radius"><input id="earthquake-radius" className="field-input code" value={radius} onChange={(event) => setRadius(event.target.value)} /></Field></div> : null}
          </> : null}

          {tab === "detail" ? <>
            <Field label="USGS Event ID" htmlFor="earthquake-event-id"><input id="earthquake-event-id" data-testid="earthquake-event-id" className="field-input code" value={eventId} onChange={(event) => setEventId(event.target.value)} /></Field>
            <div className={styles.examples}><button type="button" onClick={() => setEventId("us6000m0xl")}>2024 能登 M7.5</button></div>
            <div className={styles.hint}><AlertTriangle size={12} />事件详情是 USGS-only；EMSC 用于搜索和计数对照，不提供 PAGER/DYFI/ShakeMap 详情。</div>
          </> : null}

          {tab === "compare" ? <>
            <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
            <Field label="最小震级" htmlFor="earthquake-compare-mag"><input id="earthquake-compare-mag" className="field-input code" value={minMagnitude} onChange={(event) => setMinMagnitude(event.target.value)} /></Field>
            <div className={styles.hint}><Gauge size={12} />相同过滤条件分别调用 USGS 与 EMSC count；差异来自目录覆盖和事件合并策略。</div>
          </> : null}

          {tab === "resources" ? <>
            <Segmented value={resourceMode} prefix="earthquake-resource" options={[{ id: "feed", label: "Feed 资源" }, { id: "event", label: "Event 资源" }]} onChange={(value) => setResourceMode(value as typeof resourceMode)} />
            {resourceMode === "feed" ? <><Field label="震级档" htmlFor="earthquake-resource-tier"><select id="earthquake-resource-tier" className="field-select" value={tier} onChange={(event) => { const next = event.target.value; setTier(next); if (!feedWindows[next].includes(window)) setWindow(feedWindows[next][0]); }}><option value="2.5">M2.5+</option><option value="4.5">M4.5+</option><option value="significant">显著事件</option></select></Field><Field label="窗口" htmlFor="earthquake-resource-window"><select id="earthquake-resource-window" className="field-select" value={window} onChange={(event) => setWindow(event.target.value)}>{feedWindows[tier].map((item) => <option key={item} value={item}>{item}</option>)}</select></Field></> : <Field label="USGS Event ID" htmlFor="earthquake-resource-event"><input id="earthquake-resource-event" className="field-input code" value={eventId} onChange={(event) => setEventId(event.target.value)} /></Field>}
          </> : null}

          <button type="button" className="primary-button" data-testid="earthquake-run" disabled={busy} onClick={run}><Play size={13} fill="currentColor" />{busy ? "正在读取" : tabs.find((item) => item.id === tab)?.label}</button>
          <div className={styles.boundary}><ShieldCheck size={13} /><span>HTTPS GET</span><span>最多 100 条</span><span>双固定源</span><span>非应急预警</span></div>
        </div>

        <ResultView
          result={runtime.result}
          error={localError ?? runtime.error}
          pending={busy}
          activity={runtime.activity}
          emptyTitle="等待地震数据请求"
          emptyDescription="运行实时 feed、历史搜索、事件详情、跨源计数或 MCP 资源读取。"
          hideRaw={Boolean(runtime.result && Object.keys(payload).length)}
        >
          {(lastTool === "earthquake_get_feed" || lastTool === "earthquake_search") && runtime.result ? <div className={styles.eventResult} data-testid={lastTool === "earthquake_get_feed" ? "earthquake-feed" : "earthquake-search"}>
            <div className={styles.resultHeader}><strong>{lastTool === "earthquake_get_feed" ? "实时事件" : `${display(payload.source).toUpperCase()} 历史结果`}</strong><span>{display(payload.count, "0")} 条{payload.truncated ? " · 已截断" : ""}</span></div>
            <EventMap events={events} />
            <EventList events={events} source={display(payload.source, lastTool === "earthquake_get_feed" ? "usgs" : source)} onOpen={openEvent} />
          </div> : null}

          {lastTool === "earthquake_get_event" && runtime.result ? <div className={styles.detail} data-testid="earthquake-detail">
            <header><span className={`${styles.magnitude} ${styles[severity(detailEvent.magnitude)]}`}>M{display(detailEvent.magnitude)}</span><div><code>{display(detailEvent.id)}</code><h3>{display(detailEvent.title)}</h3><p>{dateTime(detailEvent.time)} · 深度 {display(detailEvent.depth_km)} km</p></div></header>
            <div className={styles.impactGrid}><span><small>PAGER</small><strong className={styles[display(detailEvent.alert, "none")]}>{display(detailEvent.alert, "无")}</strong></span><span><small>MMI</small><strong>{display(detailEvent.mmi, "无")}</strong></span><span><small>CDI / DYFI</small><strong>{display(detailEvent.cdi, "无")}</strong></span><span><small>Felt</small><strong>{display(detailEvent.felt, "0")}</strong></span><span><small>Significance</small><strong>{display(detailEvent.significance, "0")}</strong></span><span><small>Tsunami</small><strong>{finite(detailEvent.tsunami) ? "是" : "否"}</strong></span></div>
            <EventMap events={shownEvents} />
            <div className={styles.sourceNote}><ShieldCheck size={12} />影响指标来自 USGS 登记，不等同于现场确认或实时应急指令。</div>
          </div> : null}

          {lastTool === "earthquake_compare_counts" && compare ? <div className={styles.compare} data-testid="earthquake-compare">
            <div className={styles.resultHeader}><strong>同条件跨源计数</strong><span>{start} → {end} · M{minMagnitude}+</span></div>
            <div className={styles.compareCards}><article><Radar size={22} /><span>USGS</span><strong>{display(compare.usgs.count, "0")}</strong><small>max {display(compare.usgs.max_allowed, "无")}</small></article><article><CircleDot size={22} /><span>EMSC</span><strong>{display(compare.emsc.count, "0")}</strong><small>max {display(compare.emsc.max_allowed, "无")}</small></article></div>
            <p>两边数字不同并不表示某一方“错误”：来源台网、事件去重、人工复核和发布时间均可能不同。</p>
          </div> : null}

          {lastTool.startsWith("resource:") && asset ? <div className={styles.resourceCard} data-testid="earthquake-resource-result"><span>MCP RESOURCE</span><code>{asset.uri}</code>{asset.payload.event ? <EventList events={[object(asset.payload.event)]} source="usgs" onOpen={openEvent} /> : <><div className={styles.resultHeader}><strong>Feed 快照</strong><span>{display(asset.payload.count, "0")} 条</span></div><EventList events={rows(asset.payload.events).slice(0, 10)} source="usgs" onOpen={openEvent} /></>}</div> : null}
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

function DateRange({ start, end, setStart, setEnd }: { start: string; end: string; setStart(value: string): void; setEnd(value: string): void }) {
  return <div className={styles.dateRange}><Field label="开始" htmlFor="earthquake-start"><input id="earthquake-start" data-testid="earthquake-start" type="date" className="field-input code" value={start} onChange={(event) => setStart(event.target.value)} /></Field><Field label="结束" htmlFor="earthquake-end"><input id="earthquake-end" data-testid="earthquake-end" type="date" className="field-input code" value={end} onChange={(event) => setEnd(event.target.value)} /></Field></div>;
}

function EventMap({ events }: { events: Row[] }) {
  return <div className={styles.map} data-testid="earthquake-map"><Map size={14} /><span className={styles.equator} /><span className={styles.meridian} />{events.slice(0, 40).map((event, index) => {
    const left = Math.max(1, Math.min(99, ((finite(event.longitude) + 180) / 360) * 100));
    const top = Math.max(2, Math.min(98, ((90 - finite(event.latitude)) / 180) * 100));
    const size = Math.max(6, Math.min(20, 4 + finite(event.magnitude) * 1.8));
    return <i key={`${display(event.id)}-${index}`} className={styles[severity(event.magnitude)]} title={`${display(event.title)} M${display(event.magnitude)}`} style={{ left: `${left}%`, top: `${top}%`, width: size, height: size }} />;
  })}</div>;
}

function EventList({ events, source, onOpen }: { events: Row[]; source: string; onOpen(event: Row): void }) {
  return <div className={styles.eventList}>{events.map((event) => <article key={display(event.id)}><span className={`${styles.eventMag} ${styles[severity(event.magnitude)]}`}>M{display(event.magnitude)}</span><div><strong>{display(event.place, display(event.title))}</strong><code>{display(event.id)}</code><p>{dateTime(event.time)} · {display(event.depth_km)} km · {finite(event.tsunami) ? "海啸标记" : "无海啸标记"}</p></div>{source === "usgs" || display(event.id).startsWith("us") ? <button type="button" onClick={() => onOpen(event)}>详情</button> : <span className={styles.sourceTag}>EMSC</span>}</article>)}</div>;
}

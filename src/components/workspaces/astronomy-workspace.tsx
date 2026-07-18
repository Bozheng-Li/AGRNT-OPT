"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CircleDot, Compass, LibraryBig, Moon, Play, ShieldCheck, Sparkles, Sunrise } from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";
import styles from "./astronomy-workspace.module.css";

type Tab = "position" | "rise" | "moon" | "events" | "visible" | "guide";
type Row = Record<string, unknown>;

const bodies = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
const tabs = [
  { id: "position", label: "天空位置", icon: Compass },
  { id: "rise", label: "升落与暮光", icon: Sunrise },
  { id: "moon", label: "月相周期", icon: Moon },
  { id: "events", label: "天象事件", icon: CalendarDays },
  { id: "visible", label: "可见天体", icon: Sparkles },
  { id: "guide", label: "天体与计划", icon: LibraryBig },
] as const;

function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function rows(value: unknown): Row[] { return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Row[] : []; }
function text(value: unknown, fallback = "-"): string { return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : fallback; }
function number(value: unknown, fallback = 0): number { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }

export function AstronomyWorkspace() {
  const runtime = usePluginInvoke("astronomy-observation-console");
  const [tab, setTab] = useState<Tab>("position");
  const [body, setBody] = useState("moon");
  const [latitude, setLatitude] = useState("47.6062");
  const [longitude, setLongitude] = useState("-122.3321");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [time, setTime] = useState("2024-04-08T18:00:00Z");
  const [event, setEvent] = useState("solar_eclipse");
  const [eventStart, setEventStart] = useState("2024-01-01T00:00:00Z");
  const [includeStars, setIncludeStars] = useState(true);
  const [guideMode, setGuideMode] = useState<"resource" | "prompt">("resource");
  const [location, setLocation] = useState("Seattle, WA");
  const [asset, setAsset] = useState<{ kind: "resource" | "prompt"; text: string } | null>(null);
  const [assetPending, setAssetPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastTool, setLastTool] = useState("");
  const payload = useMemo(() => resultJson(runtime.result), [runtime.result]);
  const busy = runtime.pending || assetPending;

  function switchTab(next: Tab) {
    setTab(next);
    setAsset(null);
    setLocalError(null);
    runtime.setResult(null);
    if (next === "rise") setTime("2024-06-21T00:00:00Z");
    if (next === "moon" || next === "position") setTime("2024-04-08T18:00:00Z");
    if (next === "visible") setTime("2024-08-12T05:00:00Z");
    if (next === "events") { setLatitude("32.7767"); setLongitude("-96.797"); setTimezone("America/Chicago"); }
    else if (next !== "guide") { setLatitude("47.6062"); setLongitude("-122.3321"); setTimezone("America/Los_Angeles"); }
  }

  async function call(tool: string, args: Record<string, unknown>) {
    setLocalError(null);
    setAsset(null);
    setLastTool(tool);
    try { await runtime.invoke(tool, args); }
    catch (error) { setLocalError(error instanceof Error ? error.message : "Astronomy 调用失败。"); }
  }

  async function loadAsset() {
    setAssetPending(true);
    setLocalError(null);
    runtime.setResult(null);
    try {
      const requestBody = guideMode === "resource"
        ? { operation: "resource", uri: `astronomy://body/${body}` }
        : { operation: "prompt", prompt: "astronomy_stargazing_plan", arguments: { location, date: "2024-08-11" } };
      const response = await fetch("/api/plugins/astronomy-observation-console/invoke", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Astronomy 协议资产读取失败。");
      const output = guideMode === "resource"
        ? String(result.result?.contents?.[0]?.text ?? "")
        : (Array.isArray(result.result?.messages) ? result.result.messages : []).map((item: Row) => text(object(item.content).text, "")).join("\n\n");
      setAsset({ kind: guideMode, text: output });
      setLastTool(guideMode === "resource" ? "resource:body" : "prompt:stargazing");
    } catch (error) { setLocalError(error instanceof Error ? error.message : "Astronomy 协议资产读取失败。"); }
    finally { setAssetPending(false); }
  }

  async function run() {
    const observer = { latitude: Number(latitude), longitude: Number(longitude), elevation: 50, timezone };
    if (tab === "position") await call("astronomy_get_sky_position", { body, ...observer, time });
    if (tab === "rise") await call("astronomy_get_rise_set", { body: "sun", ...observer, start: time, count: 1 });
    if (tab === "moon") await call("astronomy_get_moon_phase", { time, timezone });
    if (tab === "events") await call("astronomy_find_events", { event, start: eventStart, count: 1, ...observer });
    if (tab === "visible") await call("astronomy_list_visible", { ...observer, time, min_altitude: 5, include_stars: includeStars });
    if (tab === "guide") await loadAsset();
  }

  return <div className={`workspace-card ${styles.workspace}`}>
    <div className="workspace-bar"><div className="workspace-bar-title"><Compass size={14} />离线天文观测台</div><span className="badge low"><ShieldCheck size={10} />零网络 · 固定星历</span></div>
    <div className={styles.tabs} role="tablist" aria-label="Astronomy 工作流">{tabs.map((item) => { const Icon = item.icon; return <button type="button" role="tab" aria-selected={tab === item.id} data-testid={`astronomy-tab-${item.id}`} className={tab === item.id ? styles.active : ""} key={item.id} onClick={() => switchTab(item.id)}><Icon size={12} />{item.label}</button>; })}</div>
    <div className={`workspace-body ${styles.layout}`}>
      <div className={`control-panel ${styles.controls}`}>
        {tab === "position" ? <><BodySelect value={body} onChange={setBody} /><Observer latitude={latitude} longitude={longitude} timezone={timezone} onLatitude={setLatitude} onLongitude={setLongitude} onTimezone={setTimezone} /><TimeField value={time} onChange={setTime} /></> : null}
        {tab === "rise" ? <><Observer latitude={latitude} longitude={longitude} timezone={timezone} onLatitude={setLatitude} onLongitude={setLongitude} onTimezone={setTimezone} /><TimeField label="检索起点" value={time} onChange={setTime} /></> : null}
        {tab === "moon" ? <><TimeField value={time} onChange={setTime} /><Field label="IANA 时区" htmlFor="astronomy-moon-timezone"><input id="astronomy-moon-timezone" className="field-input code" value={timezone} onChange={(e) => setTimezone(e.target.value)} /></Field></> : null}
        {tab === "events" ? <><Field label="事件类型" htmlFor="astronomy-event"><select id="astronomy-event" data-testid="astronomy-event" className="field-select" value={event} onChange={(e) => setEvent(e.target.value)}><option value="solar_eclipse">日食</option><option value="lunar_eclipse">月食</option><option value="equinox">春分 / 秋分</option><option value="solstice">夏至 / 冬至</option><option value="moon_quarter">月相四分点</option></select></Field><Observer latitude={latitude} longitude={longitude} timezone={timezone} onLatitude={setLatitude} onLongitude={setLongitude} onTimezone={setTimezone} /><TimeField label="检索起点" value={eventStart} onChange={setEventStart} /></> : null}
        {tab === "visible" ? <><Observer latitude={latitude} longitude={longitude} timezone={timezone} onLatitude={setLatitude} onLongitude={setLongitude} onTimezone={setTimezone} /><TimeField value={time} onChange={setTime} /><label className={styles.check}><input type="checkbox" data-testid="astronomy-include-stars" checked={includeStars} onChange={(e) => setIncludeStars(e.target.checked)} />包含明亮恒星</label></> : null}
        {tab === "guide" ? <><div className={styles.segmented}><button type="button" aria-pressed={guideMode === "resource"} data-testid="astronomy-guide-resource" onClick={() => setGuideMode("resource")}>天体参考卡</button><button type="button" aria-pressed={guideMode === "prompt"} data-testid="astronomy-guide-prompt" onClick={() => setGuideMode("prompt")}>观星计划提示</button></div>{guideMode === "resource" ? <BodySelect value={body} onChange={setBody} /> : <Field label="观测地点" htmlFor="astronomy-location"><input id="astronomy-location" data-testid="astronomy-location" className="field-input" value={location} onChange={(e) => setLocation(e.target.value)} /></Field>}</> : null}
        <button type="button" className="primary-button" data-testid="astronomy-run" disabled={busy} onClick={run}><Play size={13} fill="currentColor" />{busy ? "正在计算" : tabs.find((item) => item.id === tab)?.label}</button>
        <div className={styles.boundary}><ShieldCheck size={13} /><span>离线计算</span><span>无地理编码</span><span>无天气推断</span></div>
      </div>
      <ResultView result={runtime.result} error={localError ?? runtime.error} pending={busy} activity={runtime.activity} emptyTitle="固定时间与坐标，复现天空几何" emptyDescription="" hideRaw>
        {payload ? <AstronomyResult tool={lastTool} payload={payload} /> : null}
        {asset ? <AssetResult asset={asset} /> : null}
      </ResultView>
    </div>
  </div>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) { return <div className="field-group"><label className="field-label" htmlFor={htmlFor}>{label}</label>{children}</div>; }
function BodySelect({ value, onChange }: { value: string; onChange(value: string): void }) { return <Field label="目标天体" htmlFor="astronomy-body"><select id="astronomy-body" data-testid="astronomy-body" className="field-select" value={value} onChange={(e) => onChange(e.target.value)}>{bodies.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>; }
function TimeField({ label = "观测瞬时", value, onChange }: { label?: string; value: string; onChange(value: string): void }) { return <Field label={label} htmlFor="astronomy-time"><input id="astronomy-time" data-testid="astronomy-time" className="field-input code" value={value} onChange={(e) => onChange(e.target.value)} /></Field>; }
function Observer({ latitude, longitude, timezone, onLatitude, onLongitude, onTimezone }: { latitude: string; longitude: string; timezone: string; onLatitude(value: string): void; onLongitude(value: string): void; onTimezone(value: string): void }) { return <div className={styles.observer}><Field label="纬度" htmlFor="astronomy-latitude"><input id="astronomy-latitude" data-testid="astronomy-latitude" className="field-input code" value={latitude} onChange={(e) => onLatitude(e.target.value)} /></Field><Field label="经度" htmlFor="astronomy-longitude"><input id="astronomy-longitude" data-testid="astronomy-longitude" className="field-input code" value={longitude} onChange={(e) => onLongitude(e.target.value)} /></Field><Field label="IANA 时区" htmlFor="astronomy-timezone"><input id="astronomy-timezone" data-testid="astronomy-timezone" className="field-input code" value={timezone} onChange={(e) => onTimezone(e.target.value)} /></Field></div>; }

function AstronomyResult({ tool, payload }: { tool: string; payload: Row }) {
  if (tool === "astronomy_get_sky_position") {
    const horizontal = object(payload.horizontal); const equatorial = object(payload.equatorial); const altitude = number(horizontal.altitude_degrees); const azimuth = number(horizontal.azimuth_degrees);
    return <div className={styles.position} data-testid="astronomy-position-result"><header><Compass size={15} /><strong>{text(payload.body)}</strong><code>{text(payload.time_local, text(payload.time_utc))}</code></header><div className={styles.skyPlot}><span className={styles.north}>N</span><span className={styles.east}>E</span><span className={styles.south}>S</span><span className={styles.west}>W</span><i style={{ left: `${Math.max(5, Math.min(95, azimuth / 3.6))}%`, top: `${Math.max(5, Math.min(92, 92 - altitude * 0.9))}%` }}><CircleDot size={18} /></i></div><div className={styles.metrics}><Metric label="高度" value={`${altitude.toFixed(2)}°`} /><Metric label="方位" value={`${azimuth.toFixed(2)}°`} /><Metric label="赤经" value={`${number(equatorial.ra_hours).toFixed(3)} h`} /><Metric label="赤纬" value={`${number(equatorial.dec_degrees).toFixed(2)}°`} /><Metric label="星座" value={text(object(payload.constellation).name)} /><Metric label="照明" value={`${(number(payload.illuminated_fraction) * 100).toFixed(1)}%`} /></div></div>;
  }
  if (tool === "astronomy_get_rise_set") return <div className={styles.stack} data-testid="astronomy-rise-result"><ResultHeader title="太阳升落与暮光" count={rows(payload.events).length} />{rows(payload.events).map((item, index) => { const twilight = object(item.twilight); return <article className={styles.riseCard} key={index}><div className={styles.timeline}><TimePoint label="日出" value={text(item.rise_local, text(item.rise_utc))} /><TimePoint label="中天" value={text(item.transit_local, text(item.transit_utc))} /><TimePoint label="日落" value={text(item.set_local, text(item.set_utc))} /></div><div className={styles.twilight}>{["civil", "nautical", "astronomical"].map((key) => <span key={key}><strong>{key}</strong><small>{text(object(twilight[key]).dusk_local, text(object(twilight[key]).dusk_utc))}</small></span>)}</div></article>; })}</div>;
  if (tool === "astronomy_get_moon_phase") return <div className={styles.moonResult} data-testid="astronomy-moon-result"><div className={styles.moonDisk} data-phase={text(payload.phase_name)}><Moon size={42} /></div><div><span>{text(payload.time_local, text(payload.time_utc))}</span><strong>{text(payload.phase_name)}</strong><p>{(number(payload.illuminated_fraction) * 100).toFixed(2)}% illuminated · age {number(payload.age_days).toFixed(1)} days</p></div><div className={styles.quarters}>{rows(payload.next_quarters).map((item) => <span key={text(item.quarter)}><b>{text(item.quarter)}</b><small>{text(item.time_local, text(item.time_utc))}</small></span>)}</div></div>;
  if (tool === "astronomy_find_events") return <div className={styles.stack} data-testid="astronomy-events-result"><ResultHeader title="未来天象" count={rows(payload.events).length} />{rows(payload.events).map((item, index) => <article className={styles.eventCard} key={index}><header><strong>{text(item.event)}</strong><span>{text(item.kind, "event")}</span></header><code>{text(item.time_local, text(item.time_utc))}</code><div className={styles.metrics}><Metric label="本地可见" value={item.local_visible === true ? "YES" : "NO"} /><Metric label="遮蔽率" value={`${(number(item.obscuration) * 100).toFixed(1)}%`} /></div><pre>{JSON.stringify(item.contacts, null, 2)}</pre></article>)}</div>;
  const visible = rows(payload.bodies);
  return <div className={styles.stack} data-testid="astronomy-visible-result"><ResultHeader title={`${text(payload.sky_condition)} · Sun ${number(payload.sun_altitude_degrees).toFixed(1)}°`} count={visible.length} /><div className={styles.visibleList}>{visible.map((item) => { const horizontal = object(item.horizontal); const altitude = number(horizontal.altitude_degrees); return <article key={`${text(item.rank)}:${text(item.body)}`}><span>{text(item.rank)}</span><div><strong>{text(item.body)}</strong><p>{text(item.visibility_note)}</p><i><b style={{ width: `${Math.max(2, Math.min(100, altitude / 0.9))}%` }} /></i></div><code>{altitude.toFixed(1)}° / {number(horizontal.azimuth_degrees).toFixed(1)}°</code></article>; })}</div></div>;
}

function ResultHeader({ title, count }: { title: string; count: number }) { return <div className={styles.resultHeader}><strong>{title}</strong><span>{count} 项</span></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <span><small>{label}</small><strong>{value}</strong></span>; }
function TimePoint({ label, value }: { label: string; value: string }) { return <span><i /><small>{label}</small><strong>{value}</strong></span>; }

function AssetResult({ asset }: { asset: { kind: "resource" | "prompt"; text: string } }) {
  if (asset.kind === "prompt") return <div className={styles.prompt} data-testid="astronomy-prompt-result"><header><Sparkles size={15} /><strong>astronomy_stargazing_plan</strong></header><pre>{asset.text}</pre></div>;
  let data: Row = {}; try { data = object(JSON.parse(asset.text)); } catch { data = {}; }
  return <div className={styles.reference} data-testid="astronomy-resource-result"><span>{text(data.type).toUpperCase()}</span><strong>{text(data.name)}</strong><code>{text(data.body)}</code><div className={styles.metrics}><Metric label="平均半径" value={`${text(data.mean_radius_km)} km`} /><Metric label="肉眼可见" value={data.naked_eye === true ? "YES" : "NO"} /></div></div>;
}

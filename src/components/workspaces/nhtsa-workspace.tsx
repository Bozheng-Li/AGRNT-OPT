"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CarFront,
  ClipboardList,
  Gauge,
  LibraryBig,
  Play,
  Search,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";
import styles from "./nhtsa-workspace.module.css";

type Tab = "overview" | "recalls" | "complaints" | "ratings" | "vin" | "lookup";
type Row = Record<string, unknown>;

const tabs = [
  { id: "overview", label: "安全总览", icon: ShieldCheck },
  { id: "recalls", label: "召回", icon: Siren },
  { id: "complaints", label: "投诉", icon: ClipboardList },
  { id: "ratings", label: "NCAP 评级", icon: Gauge },
  { id: "vin", label: "VIN 解码", icon: CarFront },
  { id: "lookup", label: "车型目录", icon: LibraryBig },
] as const;

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Row[] : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function display(value: unknown, fallback = "-"): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function rating(value: unknown): string {
  const text = display(value, "Not Rated");
  const match = text.match(/[1-5]/);
  if (!match) return text;
  const score = Number(match[0]);
  return `${"★".repeat(score)}${"☆".repeat(5 - score)} ${text}`;
}

export function NhtsaWorkspace() {
  const runtime = usePluginInvoke("nhtsa-vehicle-safety-lab");
  const [tab, setTab] = useState<Tab>("overview");
  const [make, setMake] = useState("HONDA");
  const [model, setModel] = useState("CIVIC");
  const [modelYear, setModelYear] = useState("2020");
  const [recallMode, setRecallMode] = useState<"vehicle" | "campaign">("vehicle");
  const [campaignNumber, setCampaignNumber] = useState("24V064000");
  const [dateAfter, setDateAfter] = useState("");
  const [dateBefore, setDateBefore] = useState("");
  const [complaintOffset, setComplaintOffset] = useState(0);
  const [ratingMode, setRatingMode] = useState<"vehicle" | "id">("vehicle");
  const [vehicleId, setVehicleId] = useState("14819");
  const [vinMode, setVinMode] = useState<"single" | "batch">("single");
  const [vinInput, setVinInput] = useState("1HGCM82633A004352");
  const [vinYear, setVinYear] = useState("");
  const [lookupMode, setLookupMode] = useState<"models" | "manufacturer" | "makes">("models");
  const [manufacturer, setManufacturer] = useState("Honda Motor");
  const [lookupOffset, setLookupOffset] = useState(0);
  const [lastTool, setLastTool] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

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
      setLocalError(error instanceof Error ? error.message : "NHTSA 调用失败。");
      return null;
    }
  }

  function vehicleArgs() {
    return { make, model, modelYear: Number(modelYear) };
  }

  async function runComplaints(offset = complaintOffset) {
    setComplaintOffset(offset);
    await call("nhtsa_search_complaints", {
      ...vehicleArgs(),
      limit: 10,
      offset,
    });
  }

  async function runLookup(offset = lookupOffset) {
    setLookupOffset(offset);
    await call("nhtsa_lookup_vehicles", {
      operation: lookupMode,
      ...(lookupMode === "models" ? { make, modelYear: Number(modelYear) } : {}),
      ...(lookupMode === "manufacturer" ? { manufacturer } : {}),
      limit: 20,
      offset,
    });
  }

  async function run() {
    if (tab === "overview") await call("nhtsa_get_vehicle_safety", vehicleArgs());
    if (tab === "recalls") {
      if (recallMode === "campaign") await call("nhtsa_search_recalls", { campaignNumber });
      else await call("nhtsa_search_recalls", {
        ...vehicleArgs(),
        ...((dateAfter || dateBefore) ? { dateRange: { ...(dateAfter ? { after: dateAfter } : {}), ...(dateBefore ? { before: dateBefore } : {}) } } : {}),
      });
    }
    if (tab === "complaints") await runComplaints(0);
    if (tab === "ratings") {
      await call("nhtsa_get_safety_ratings", ratingMode === "id" ? { vehicleId: Number(vehicleId) } : vehicleArgs());
    }
    if (tab === "vin") {
      const vins = vinInput.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
      await call("nhtsa_decode_vin", {
        vin: vinMode === "single" ? (vins[0] ?? "") : vins,
        ...(vinYear ? { modelYear: Number(vinYear) } : {}),
      });
    }
    if (tab === "lookup") await runLookup(0);
  }

  const recalls = rows(payload.recalls);
  const ratings = rows(payload.ratings ?? payload.safetyRatings);
  const complaints = rows(payload.complaints);
  const vehicles = rows(payload.vehicles);
  const lookupRows = rows(payload.models ?? payload.manufacturers ?? payload.makes);
  const complaintSummary = object(payload.complaintSummary);
  const sectionStatus = object(payload.sectionStatus);

  return (
    <div className={`workspace-card ${styles.workspace}`}>
      <div className="workspace-bar">
        <div className="workspace-bar-title"><CarFront size={14} />NHTSA 车辆安全实验室</div>
        <span className="badge medium"><BadgeCheck size={10} />美国官方数据 · 匿名只读</span>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="NHTSA 工作流">
        {tabs.map((item) => {
          const Icon = item.icon;
          return <button type="button" role="tab" aria-selected={tab === item.id} data-testid={`nhtsa-tab-${item.id}`} className={tab === item.id ? styles.active : ""} key={item.id} onClick={() => switchTab(item.id)}><Icon size={12} />{item.label}</button>;
        })}
      </div>

      <div className={`workspace-body ${styles.layout}`}>
        <div className={`control-panel ${styles.controls}`}>
          {(["overview", "complaints"] as Tab[]).includes(tab) || (tab === "recalls" && recallMode === "vehicle") || (tab === "ratings" && ratingMode === "vehicle") ? (
            <VehicleFields make={make} model={model} year={modelYear} onMake={setMake} onModel={setModel} onYear={setModelYear} />
          ) : null}

          {tab === "overview" ? <>
            <div className={styles.examples}><button type="button" onClick={() => { setMake("HONDA"); setModel("CIVIC"); setModelYear("2020"); }}>2020 Honda Civic</button><button type="button" onClick={() => { setMake("TOYOTA"); setModel("CAMRY"); setModelYear("2022"); }}>2022 Toyota Camry</button></div>
            <div className={styles.hint}><ShieldCheck size={12} />一次汇总 NCAP、召回和投诉；任何分区失败都会单独标注，不会伪装成“无记录”。</div>
          </> : null}

          {tab === "recalls" ? <>
            <Segmented value={recallMode} prefix="nhtsa-recall" options={[{ id: "vehicle", label: "按车型" }, { id: "campaign", label: "按 Campaign" }]} onChange={(value) => setRecallMode(value as typeof recallMode)} />
            {recallMode === "campaign" ? <Field label="Campaign Number" htmlFor="nhtsa-campaign"><input id="nhtsa-campaign" data-testid="nhtsa-campaign" className="field-input code" value={campaignNumber} onChange={(event) => setCampaignNumber(event.target.value)} /></Field> : <div className={styles.twoCols}><Field label="接收日期（起，含当日）" htmlFor="nhtsa-after"><input id="nhtsa-after" className="field-input code" placeholder="YYYY-MM-DD" value={dateAfter} onChange={(event) => setDateAfter(event.target.value)} /></Field><Field label="接收日期（止，含当日）" htmlFor="nhtsa-before"><input id="nhtsa-before" className="field-input code" placeholder="YYYY-MM-DD" value={dateBefore} onChange={(event) => setDateBefore(event.target.value)} /></Field></div>}
          </> : null}

          {tab === "complaints" ? <>
            <div className={styles.hint}><ClipboardList size={12} />叙述列表按提交日期分页，每页 10 条。0.8.4 会错误拆分带逗号的官方组件名，因此本适配不开放组件过滤或组件 breakdown。</div>
          </> : null}

          {tab === "ratings" ? <>
            <Segmented value={ratingMode} prefix="nhtsa-rating" options={[{ id: "vehicle", label: "按车型" }, { id: "id", label: "按 Vehicle ID" }]} onChange={(value) => setRatingMode(value as typeof ratingMode)} />
            {ratingMode === "id" ? <Field label="NCAP Vehicle ID" htmlFor="nhtsa-vehicle-id"><input id="nhtsa-vehicle-id" data-testid="nhtsa-vehicle-id" className="field-input code" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} /></Field> : null}
          </> : null}

          {tab === "vin" ? <>
            <Segmented value={vinMode} prefix="nhtsa-vin" options={[{ id: "single", label: "单个 VIN" }, { id: "batch", label: "批量（最多 10）" }]} onChange={(value) => setVinMode(value as typeof vinMode)} />
            <Field label={vinMode === "single" ? "VIN" : "VIN（每行一个）"} htmlFor="nhtsa-vin-input"><textarea id="nhtsa-vin-input" data-testid="nhtsa-vin-input" className="field-textarea code" rows={vinMode === "single" ? 3 : 7} value={vinInput} onChange={(event) => setVinInput(event.target.value)} /></Field>
            <Field label="Model Year（可选）" htmlFor="nhtsa-vin-year"><input id="nhtsa-vin-year" className="field-input code" value={vinYear} onChange={(event) => setVinYear(event.target.value)} /></Field>
            <div className={styles.hint}><Search size={12} />VPIC 会返回解码警告；警告 VIN 不会被误标为完整成功。</div>
          </> : null}

          {tab === "lookup" ? <>
            <Segmented value={lookupMode} prefix="nhtsa-lookup" options={[{ id: "models", label: "车型" }, { id: "manufacturer", label: "制造商" }, { id: "makes", label: "品牌目录" }]} onChange={(value) => setLookupMode(value as typeof lookupMode)} />
            {lookupMode === "models" ? <Field label="Make" htmlFor="nhtsa-lookup-make"><input id="nhtsa-lookup-make" data-testid="nhtsa-lookup-make" className="field-input" value={make} onChange={(event) => setMake(event.target.value)} /></Field> : null}
            {lookupMode === "models" ? <Field label="Model Year" htmlFor="nhtsa-lookup-year"><input id="nhtsa-lookup-year" className="field-input code" value={modelYear} onChange={(event) => setModelYear(event.target.value)} /></Field> : null}
            {lookupMode === "manufacturer" ? <Field label="Manufacturer Name / ID" htmlFor="nhtsa-manufacturer"><input id="nhtsa-manufacturer" data-testid="nhtsa-manufacturer" className="field-input" value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} /></Field> : null}
            <div className={styles.hint}><LibraryBig size={12} />Models 是 VPIC 注册匹配，不代表该年份实际生产或销售阵容。0.8.4 的独立 vehicle_types 查询会丢失品牌关联，已关闭；制造商详情仍保留其车辆类型。</div>
          </> : null}

          <button type="button" className="primary-button" data-testid="nhtsa-run" disabled={runtime.pending} onClick={run}><Play size={13} fill="currentColor" />{runtime.pending ? "正在查询" : tabs.find((item) => item.id === tab)?.label}</button>
          <div className={styles.boundary}><ShieldCheck size={13} /><span>仅 api.nhtsa.gov / vpic.nhtsa.dot.gov</span><span>只读</span><span>调查 ZIP 已禁用</span><span>批量 VIN ≤ 10</span></div>
        </div>

        <ResultView
          result={runtime.result}
          error={localError ?? runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="等待车辆安全查询"
          emptyDescription="汇总碰撞评级、召回、投诉，或解码 VIN 和核对车型目录。"
          hideRaw={Boolean(runtime.result && Object.keys(payload).length)}
        >
          {lastTool === "nhtsa_get_vehicle_safety" && runtime.result ? <OverviewResult ratings={ratings} recalls={recalls} summary={complaintSummary} status={sectionStatus} warnings={strings(payload.warnings)} /> : null}
          {lastTool === "nhtsa_search_recalls" && runtime.result ? <RecallResult recalls={recalls} total={count(payload.totalCount)} query={display(payload.effectiveQuery, "")} /> : null}
          {lastTool === "nhtsa_search_complaints" && runtime.result ? <ComplaintResult payload={payload} complaints={complaints} onPage={runComplaints} /> : null}
          {lastTool === "nhtsa_get_safety_ratings" && runtime.result ? <RatingResult ratings={ratings} notice={display(payload.notice, "")} /> : null}
          {lastTool === "nhtsa_decode_vin" && runtime.result ? <VinResult vehicles={vehicles} notice={display(payload.notice, "")} /> : null}
          {lastTool === "nhtsa_lookup_vehicles" && runtime.result ? <LookupResult payload={payload} entries={lookupRows} onPage={runLookup} /> : null}
        </ResultView>
      </div>
    </div>
  );
}

function VehicleFields({ make, model, year, onMake, onModel, onYear }: { make: string; model: string; year: string; onMake(value: string): void; onModel(value: string): void; onYear(value: string): void }) {
  return <><Field label="Make" htmlFor="nhtsa-make"><input id="nhtsa-make" data-testid="nhtsa-make" className="field-input" value={make} onChange={(event) => onMake(event.target.value)} /></Field><Field label="Model" htmlFor="nhtsa-model"><input id="nhtsa-model" data-testid="nhtsa-model" className="field-input" value={model} onChange={(event) => onModel(event.target.value)} /></Field><Field label="Model Year" htmlFor="nhtsa-year"><input id="nhtsa-year" data-testid="nhtsa-year" className="field-input code" value={year} onChange={(event) => onYear(event.target.value)} /></Field></>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <label className="field-group" htmlFor={htmlFor}><span className="field-label">{label}</span>{children}</label>;
}

function Segmented({ value, prefix, options, onChange }: { value: string; prefix: string; options: Array<{ id: string; label: string }>; onChange(value: string): void }) {
  return <div className={styles.segmented}>{options.map((option) => <button type="button" data-testid={`${prefix}-${option.id}`} aria-pressed={value === option.id} key={option.id} onClick={() => onChange(option.id)}>{option.label}</button>)}</div>;
}

function OverviewResult({ ratings, recalls, summary, status, warnings }: { ratings: Row[]; recalls: Row[]; summary: Row; status: Row; warnings: string[] }) {
  return <div className={styles.stack} data-testid="nhtsa-overview-result"><div className={styles.statusRow}>{["safetyRatings", "recalls", "complaints"].map((key) => <span key={key} data-state={display(status[key], "unavailable")}><BadgeCheck size={13} />{key}: {display(status[key], "unavailable")}</span>)}</div>{warnings.length ? <div className={styles.warning}><AlertTriangle size={15} />{warnings.join("；")}</div> : null}<RatingCards ratings={ratings} /><RecallCards recalls={recalls} /><ComplaintSummary summary={summary} /></div>;
}

function RecallResult({ recalls, total, query }: { recalls: Row[]; total: number; query: string }) {
  return <div className={styles.stack} data-testid="nhtsa-recalls-result"><div className={styles.resultHeader}><strong>召回记录</strong><span>{total} 条 · {query}</span></div><RecallCards recalls={recalls} /></div>;
}

function RecallCards({ recalls }: { recalls: Row[] }) {
  return <div className={styles.recallList}>{recalls.map((item) => <article key={display(item.campaignNumber)} className={item.parkIt ? styles.critical : ""}><header><div><code>{display(item.campaignNumber)}</code><strong>{display(item.component ?? item.subject)}</strong></div><div className={styles.flags}>{item.parkIt ? <b>PARK IT</b> : null}{item.parkOutSide ? <b>PARK OUTSIDE</b> : null}{item.overTheAirUpdate ? <span>OTA</span> : null}</div></header><p>{display(item.summary)}</p>{item.consequence ? <div><small>风险</small><span>{display(item.consequence)}</span></div> : null}<div><small>措施</small><span>{display(item.remedy)}</span></div><footer>{display(item.reportReceivedDate ?? item.receivedDate)}{item.potentialUnitsAffected !== undefined ? ` · ${count(item.potentialUnitsAffected).toLocaleString("zh-CN")} 辆/件` : ""}</footer></article>)}</div>;
}

function ComplaintResult({ payload, complaints, onPage }: { payload: Row; complaints: Row[]; onPage(offset: number): Promise<void> }) {
  const offset = count(payload.offset); const returned = count(payload.returned); const total = count(payload.totalCount); const limit = count(payload.limit) || 10;
  return <div className={styles.stack} data-testid="nhtsa-complaints-result"><div className={styles.resultHeader}><strong>消费者投诉</strong><span>{returned}/{total} · offset {offset}</span></div><div className={styles.complaintList}>{complaints.map((item) => <article key={display(item.odiNumber, `${display(item.dateComplaintFiled)}-${display(item.summary).slice(0, 20)}`)}><header><code>#{display(item.odiNumber, "未编号")}</code><span>{display(item.dateComplaintFiled)}</span></header><div className={styles.flags}>{item.crash ? <b>CRASH</b> : null}{item.fire ? <b>FIRE</b> : null}{count(item.numberOfInjuries) ? <span>伤 {count(item.numberOfInjuries)}</span> : null}{count(item.numberOfDeaths) ? <b>亡 {count(item.numberOfDeaths)}</b> : null}</div><strong>{display(item.components, "组件未记录")}</strong><p>{display(item.summary, "无叙述")}</p></article>)}</div><div className={styles.pager}><button type="button" data-testid="nhtsa-complaints-prev" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - limit))}>上一页</button><button type="button" data-testid="nhtsa-complaints-next" disabled={offset + returned >= total} onClick={() => onPage(offset + returned)}>下一页</button></div></div>;
}

function RatingResult({ ratings, notice }: { ratings: Row[]; notice: string }) {
  return <div className={styles.stack} data-testid="nhtsa-ratings-result">{notice ? <div className={styles.notice}>{notice}</div> : null}<RatingCards ratings={ratings} /></div>;
}

function RatingCards({ ratings }: { ratings: Row[] }) {
  return <div className={styles.ratingGrid}>{ratings.map((item) => { const frontal = object(item.frontalCrash); const side = object(item.sideCrash); const rollover = object(item.rollover); const adas = object(item.adasFeatures); return <article key={display(item.vehicleId)}><header><code>Vehicle {display(item.vehicleId)}</code><strong>{display(item.vehicleDescription, "NCAP 车型")}</strong><b>{rating(item.overallRating)}</b></header><div className={styles.ratingMetrics}><span><small>正面</small><strong>{rating(frontal.overall)}</strong></span><span><small>侧面</small><strong>{rating(side.overall)}</strong></span><span><small>翻滚</small><strong>{rating(rollover.rating)}</strong></span><span><small>翻滚概率</small><strong>{rollover.probability !== undefined ? `${(count(rollover.probability) * 100).toFixed(1)}%` : "-"}</strong></span></div><div className={styles.adas}><span>ESC {display(adas.electronicStabilityControl)}</span><span>FCW {display(adas.forwardCollisionWarning)}</span><span>LDW {display(adas.laneDepartureWarning)}</span></div>{item.complaintsCount !== undefined ? <footer>该 NCAP 记录关联：投诉 {count(item.complaintsCount)} · 召回 {count(item.recallsCount)} · 调查 {count(item.investigationCount)}（仅计数）</footer> : null}</article>; })}</div>;
}

function ComplaintSummary({ summary }: { summary: Row }) {
  return <section className={styles.summary} data-testid="nhtsa-complaint-summary"><div className={styles.resultHeader}><strong>投诉概览</strong><span>{count(summary.totalCount)} 条</span></div><div className={styles.summaryMetrics}><span><small>涉及碰撞</small><b>{count(summary.crashCount)}</b></span><span><small>涉及火灾</small><b>{count(summary.fireCount)}</b></span><span><small>受伤</small><b>{count(summary.injuryCount)}</b></span><span><small>死亡</small><b>{count(summary.deathCount)}</b></span></div><div className={styles.notice}>组件名称由 NHTSA 原文保留在每条投诉中；0.8.4 的错误逗号拆分统计已从公开结果移除。</div></section>;
}

function VinResult({ vehicles, notice }: { vehicles: Row[]; notice: string }) {
  return <div className={styles.stack} data-testid="nhtsa-vin-result">{notice ? <div className={styles.warning}><AlertTriangle size={15} />{notice}</div> : null}<div className={styles.vinGrid}>{vehicles.map((item) => {
    const details: Array<[string, unknown]> = [
      ["类型", item.vehicleType],
      ["驱动", item.driveType],
      ["发动机", item.engineDisplacementL ? `${display(item.engineDisplacementL)} L` : "-"],
      ["燃料", item.fuelType],
      ["制造商", item.manufacturer],
      ["工厂", [item.plantCity, item.plantState, item.plantCountry].filter(Boolean).map((part) => display(part)).join(", ")],
    ];
    return <article key={display(item.vin)}><header><code>{display(item.vin)}</code><strong>{display(item.modelYear)} {display(item.make)} {display(item.model)}</strong><span>{display(item.trim, display(item.bodyClass))}</span></header>{display(item.errorCode, "0") !== "0" ? <div className={styles.vinError}><AlertTriangle size={13} />{display(item.errorText, `VPIC code ${display(item.errorCode)}`)}</div> : null}<div className={styles.vinDetails}>{details.map(([label, value]) => <span key={label}><small>{label}</small><strong>{display(value)}</strong></span>)}</div></article>;
  })}</div></div>;
}

function LookupResult({ payload, entries, onPage }: { payload: Row; entries: Row[]; onPage(offset: number): Promise<void> }) {
  const offset = count(payload.offset); const returned = count(payload.returned); const total = count(payload.totalCount); const limit = count(payload.limit) || 20;
  return <div className={styles.stack} data-testid="nhtsa-lookup-result"><div className={styles.resultHeader}><strong>{display(payload.operation)} 目录</strong><span>{returned}/{total} · {display(payload.effectiveQuery)}</span></div><div className={styles.lookupGrid}>{entries.map((item, index) => <article key={display(item.modelId ?? item.makeId ?? item.manufacturerId, String(index))}><code>{display(item.modelId ?? item.makeId ?? item.manufacturerId)}</code><strong>{display(item.modelName ?? item.makeName ?? item.manufacturerName)}</strong><span>{display(item.makeName ?? item.country, "NHTSA / VPIC")}</span>{rows(item.vehicleTypes).length ? <p>{rows(item.vehicleTypes).map((type) => display(type.name)).join(" · ")}</p> : null}</article>)}</div><div className={styles.pager}><button type="button" data-testid="nhtsa-lookup-prev" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - limit))}>上一页</button><button type="button" data-testid="nhtsa-lookup-next" disabled={offset + returned >= total} onClick={() => onPage(offset + returned)}>下一页</button></div></div>;
}

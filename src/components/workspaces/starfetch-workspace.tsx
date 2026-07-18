"use client";

import { useMemo, useState } from "react";
import {
  BookOpenText,
  CircleDot,
  Database,
  FileQuestion,
  Gauge,
  Play,
  Radar,
  Send,
  ShieldCheck,
  Telescope,
  Trash2,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";
import styles from "./starfetch-workspace.module.css";

type Tab = "services" | "metadata" | "query" | "jobs" | "guides";
type Row = Record<string, unknown>;

const tabs = [
  { id: "services", label: "服务发现", icon: Radar },
  { id: "metadata", label: "TAP 元数据", icon: Database },
  { id: "query", label: "ADQL 查询", icon: Telescope },
  { id: "jobs", label: "异步作业", icon: Gauge },
  { id: "guides", label: "指南与提示", icon: BookOpenText },
] as const;

const serviceOptions = [
  { value: "exoplanetarchive", label: "NASA Exoplanet Archive" },
  { value: "gaia", label: "ESA Gaia Archive" },
  { value: "irsa", label: "NASA/IPAC IRSA" },
  { value: "simbad", label: "SIMBAD" },
  { value: "vizier", label: "VizieR" },
];

const resources = [
  { uri: "starfetch://guides/adql", label: "ADQL 指南" },
  { uri: "starfetch://guides/tap-metadata", label: "TAP 元数据流程" },
  { uri: "starfetch://services/gaia", label: "Gaia 指南" },
  { uri: "starfetch://services/simbad", label: "SIMBAD 指南" },
  { uri: "starfetch://examples/proper-motion", label: "自行运动示例" },
];

const prompts = [
  { name: "query_astronomy_catalog", label: "目录问题规划" },
  { name: "explore_service", label: "服务探索" },
  { name: "run_cone_search", label: "锥形检索" },
  { name: "troubleshoot_adql", label: "ADQL 故障诊断" },
];

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Row[] : [];
}

function text(value: unknown, fallback = "-"): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : fallback;
}

function parseContentRows(data: Row): Row[] {
  if (typeof data.content !== "string" || (data.format !== "json" && data.format !== "jsonl")) return [];
  try {
    const parsed = data.format === "jsonl"
      ? data.content.split("\n").filter(Boolean).map((line) => JSON.parse(line))
      : JSON.parse(data.content);
    return rows(parsed);
  } catch {
    return [];
  }
}

export function StarfetchWorkspace() {
  const runtime = usePluginInvoke("starfetch-astronomy-lab");
  const [tab, setTab] = useState<Tab>("services");
  const [service, setService] = useState("exoplanetarchive");
  const [serviceMode, setServiceMode] = useState<"presets" | "registry">("presets");
  const [registryQuery, setRegistryQuery] = useState("Gaia");
  const [metadataMode, setMetadataMode] = useState<"availability" | "capabilities" | "tables" | "columns">("availability");
  const [table, setTable] = useState("ps");
  const [query, setQuery] = useState("SELECT TOP 5 pl_name, hostname, disc_year, pl_orbper FROM ps ORDER BY disc_year DESC");
  const [jobAction, setJobAction] = useState<"submit" | "status" | "wait" | "fetch" | "delete">("submit");
  const [jobId, setJobId] = useState("");
  const [jobQuery, setJobQuery] = useState("SELECT TOP 3 source_id, ra, dec FROM gaiadr3.gaia_source");
  const [assetMode, setAssetMode] = useState<"resource" | "prompt">("resource");
  const [resourceUri, setResourceUri] = useState(resources[0].uri);
  const [promptName, setPromptName] = useState(prompts[0].name);
  const [promptQuestion, setPromptQuestion] = useState("Find high proper-motion stars near the Pleiades and state the metadata checks first.");
  const [assetResult, setAssetResult] = useState<{ title: string; text: string } | null>(null);
  const [assetPending, setAssetPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastTool, setLastTool] = useState("");
  const payload = useMemo(() => resultJson(runtime.result), [runtime.result]);
  const data = object(payload?.data);
  const diagnostics = object(payload?.diagnostics);
  const dataRows = Array.isArray(payload?.data) ? rows(payload?.data) : parseContentRows(data);

  function switchTab(next: Tab) {
    setTab(next);
    setLocalError(null);
    setAssetResult(null);
    runtime.setResult(null);
  }

  async function call(tool: string, args: Record<string, unknown>) {
    setLocalError(null);
    setAssetResult(null);
    setLastTool(tool);
    try {
      const result = await runtime.invoke(tool, args);
      const next = result.structuredContent?.data;
      if (tool === "starfetch_tap_submit_job") {
        const id = object(next).id;
        if (typeof id === "string") setJobId(id);
      }
      return result;
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Starfetch 调用失败。");
      return null;
    }
  }

  async function run() {
    if (tab === "services") {
      await call(serviceMode === "presets" ? "starfetch_list_presets" : "starfetch_registry_search", serviceMode === "presets" ? {} : { query: registryQuery, maxrec: 8 });
    }
    if (tab === "metadata") {
      if (metadataMode === "availability") await call("starfetch_tap_availability", { service });
      if (metadataMode === "capabilities") await call("starfetch_tap_capabilities", { service });
      if (metadataMode === "tables") await call("starfetch_tap_tables", { service });
      if (metadataMode === "columns") await call("starfetch_tap_columns", { service, table });
    }
    if (tab === "query") await call("starfetch_tap_query", { service, query, format: "json", maxrec: 20 });
    if (tab === "jobs") {
      if (jobAction === "submit") await call("starfetch_tap_submit_job", { service: "gaia", query: jobQuery, format: "csv", maxrec: 20 });
      if (jobAction === "status") await call("starfetch_tap_job_status", { service: "gaia", jobIdOrUrl: jobId });
      if (jobAction === "wait") await call("starfetch_tap_job_wait", { service: "gaia", jobIdOrUrl: jobId, intervalMs: 1_000, timeoutMs: 45_000, maxIntervalMs: 4_000, backoff: true });
      if (jobAction === "fetch") await call("starfetch_tap_job_fetch", { service: "gaia", jobIdOrUrl: jobId, format: "json", sourceFormat: "csv" });
      if (jobAction === "delete") await call("starfetch_tap_job_delete", { service: "gaia", jobIdOrUrl: jobId });
    }
    if (tab === "guides") await loadAsset();
  }

  async function loadAsset() {
    setLocalError(null);
    setAssetPending(true);
    runtime.setResult(null);
    try {
      const operation = assetMode === "resource" ? "resource" : "prompt";
      const promptInput = promptName === "query_astronomy_catalog"
        ? { question: promptQuestion, service: "gaia" }
        : promptName === "explore_service"
          ? { service: "gaia", topic: "proper motion" }
          : promptName === "run_cone_search"
            ? { service: "gaia", ra: 56.75, dec: 24.12, radius: 0.5 }
            : { service: "gaia", query: "SELECT TOP 3 source_id FROM gaiadr3.gaia_source", error: "unknown column" };
      const response = await fetch("/api/plugins/starfetch-astronomy-lab/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assetMode === "resource"
          ? { operation, uri: resourceUri }
          : { operation, prompt: promptName, arguments: promptInput }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Starfetch 协议资产读取失败。");
      if (assetMode === "resource") {
        const content = body.result?.contents?.[0];
        setAssetResult({ title: String(content?.uri ?? resourceUri), text: String(content?.text ?? "") });
      } else {
        const messages = Array.isArray(body.result?.messages) ? body.result.messages : [];
        setAssetResult({ title: promptName, text: messages.map((item: Row) => text(object(item.content).text, "")).join("\n\n") });
      }
      setLastTool(`${operation}:${assetMode === "resource" ? resourceUri : promptName}`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Starfetch 协议资产读取失败。");
    } finally {
      setAssetPending(false);
    }
  }

  const busy = runtime.pending || assetPending;
  const columns = dataRows.length > 0 ? Object.keys(dataRows[0]).slice(0, 12) : [];
  const target = object(diagnostics.target);

  return (
    <div className={`workspace-card ${styles.workspace}`}>
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Telescope size={14} />Starfetch 天文目录实验室</div>
        <span className="badge medium"><ShieldCheck size={10} />6 个固定 TAP origin · 无凭据</span>
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Starfetch 工作流">
        {tabs.map((item) => {
          const Icon = item.icon;
          return <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? styles.active : ""} data-testid={`starfetch-tab-${item.id}`} key={item.id} onClick={() => switchTab(item.id)}><Icon size={12} />{item.label}</button>;
        })}
      </div>

      <div className={`workspace-body ${styles.layout}`}>
        <div className={`control-panel ${styles.controls}`}>
          {tab === "services" ? <>
            <div className={styles.segmented}><button type="button" aria-pressed={serviceMode === "presets"} data-testid="starfetch-mode-presets" onClick={() => setServiceMode("presets")}>内置预设</button><button type="button" aria-pressed={serviceMode === "registry"} data-testid="starfetch-mode-registry" onClick={() => setServiceMode("registry")}>RegTAP 检索</button></div>
            {serviceMode === "registry" ? <div className="field-group"><label className="field-label" htmlFor="starfetch-registry-query">注册表关键词</label><input id="starfetch-registry-query" data-testid="starfetch-registry-query" className="field-input" value={registryQuery} onChange={(event) => setRegistryQuery(event.target.value)} /></div> : null}
          </> : null}

          {tab === "metadata" ? <>
            <div className={styles.modeGrid}>
              {(["availability", "capabilities", "tables", "columns"] as const).map((mode) => <button type="button" key={mode} aria-pressed={metadataMode === mode} data-testid={`starfetch-meta-${mode}`} onClick={() => setMetadataMode(mode)}>{mode}</button>)}
            </div>
            <ServiceSelect value={service} onChange={setService} />
            {metadataMode === "columns" ? <div className="field-group"><label className="field-label" htmlFor="starfetch-table">精确表名</label><input id="starfetch-table" data-testid="starfetch-table" className="field-input code" value={table} onChange={(event) => setTable(event.target.value)} /></div> : null}
          </> : null}

          {tab === "query" ? <>
            <ServiceSelect value={service} onChange={setService} />
            <div className={styles.examples}><button type="button" onClick={() => { setService("exoplanetarchive"); setQuery("SELECT TOP 5 pl_name, hostname, disc_year, pl_orbper FROM ps ORDER BY disc_year DESC"); }}>系外行星</button><button type="button" onClick={() => { setService("gaia"); setQuery("SELECT TOP 5 source_id, ra, dec, pmra, pmdec FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', 56.75, 24.12, 0.5))"); }}>Gaia 锥形检索</button></div>
            <div className="field-group"><label className="field-label" htmlFor="starfetch-query">ADQL <span>SELECT TOP 1..50</span></label><textarea id="starfetch-query" data-testid="starfetch-query" className={`field-textarea code ${styles.queryEditor}`} value={query} spellCheck={false} onChange={(event) => setQuery(event.target.value)} /></div>
          </> : null}

          {tab === "jobs" ? <>
            <div className={styles.jobActions}>
              {(["submit", "status", "wait", "fetch", "delete"] as const).map((action) => <button type="button" key={action} aria-pressed={jobAction === action} data-testid={`starfetch-job-${action}`} onClick={() => setJobAction(action)}>{action === "delete" ? <Trash2 size={11} /> : action}</button>)}
            </div>
            <div className={styles.fixedService}><CircleDot size={11} /><span>异步验证服务</span><strong>ESA Gaia Archive</strong></div>
            {jobAction === "submit" ? <div className="field-group"><label className="field-label" htmlFor="starfetch-job-query">作业 ADQL</label><textarea id="starfetch-job-query" data-testid="starfetch-job-query" className={`field-textarea code ${styles.queryEditor}`} value={jobQuery} spellCheck={false} onChange={(event) => setJobQuery(event.target.value)} /></div> : <div className="field-group"><label className="field-label" htmlFor="starfetch-job-id">裸 job ID</label><input id="starfetch-job-id" data-testid="starfetch-job-id" className="field-input code" value={jobId} onChange={(event) => setJobId(event.target.value)} /></div>}
          </> : null}

          {tab === "guides" ? <>
            <div className={styles.segmented}><button type="button" aria-pressed={assetMode === "resource"} data-testid="starfetch-asset-resource" onClick={() => setAssetMode("resource")}>MCP 资源</button><button type="button" aria-pressed={assetMode === "prompt"} data-testid="starfetch-asset-prompt" onClick={() => setAssetMode("prompt")}>MCP 提示</button></div>
            {assetMode === "resource" ? <div className="field-group"><label className="field-label" htmlFor="starfetch-resource">只读资源</label><select id="starfetch-resource" data-testid="starfetch-resource" className="field-select" value={resourceUri} onChange={(event) => setResourceUri(event.target.value)}>{resources.map((item) => <option key={item.uri} value={item.uri}>{item.label}</option>)}</select></div> : <>
              <div className="field-group"><label className="field-label" htmlFor="starfetch-prompt">提示模板</label><select id="starfetch-prompt" data-testid="starfetch-prompt" className="field-select" value={promptName} onChange={(event) => setPromptName(event.target.value)}>{prompts.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</select></div>
              {promptName === "query_astronomy_catalog" ? <div className="field-group"><label className="field-label" htmlFor="starfetch-question">天文问题</label><textarea id="starfetch-question" className="field-textarea" value={promptQuestion} onChange={(event) => setPromptQuestion(event.target.value)} /></div> : null}
            </>}
          </> : null}

          <button type="button" className="primary-button" data-testid="starfetch-run" disabled={busy || (tab === "jobs" && jobAction !== "submit" && !jobId)} onClick={run}><Play size={13} fill="currentColor" />{busy ? "正在访问 TAP" : tabs.find((item) => item.id === tab)?.label}</button>
          <div className={styles.boundary}><ShieldCheck size={13} /><span>固定来源</span><span>TOP ≤ 50</span><span>无 upload</span><span>无凭据</span></div>
        </div>

        <ResultView result={runtime.result} error={localError ?? runtime.error} pending={busy} activity={runtime.activity} emptyTitle="从元数据开始查询星表" emptyDescription="" hideRaw>
          {assetResult ? <div className={styles.asset} data-testid="starfetch-asset-result"><header><BookOpenText size={14} /><strong>{assetResult.title}</strong></header><pre>{assetResult.text}</pre></div> : null}

          {payload && tab === "services" ? <div className={styles.results} data-testid="starfetch-services-result">
            <div className={styles.resultHeader}><Radar size={14} /><strong>{lastTool === "starfetch_list_presets" ? "固定 TAP 预设" : "RegTAP 检索结果"}</strong><span>{dataRows.length} 项</span></div>
            <div className={styles.serviceList}>{dataRows.map((item, index) => <article key={`${text(item.name ?? item.ivoid)}-${index}`}><div><strong>{text(item.label ?? item.title)}</strong><code>{text(item.name ?? item.shortName ?? item.ivoid)}</code></div><p>{text(item.description, "公开 TAP 服务")}</p><small>{text(item.url ?? item.accessUrl)}</small>{item.name ? <button type="button" onClick={() => { setService(text(item.name)); switchTab("metadata"); }}>检查元数据</button> : null}</article>)}</div>
          </div> : null}

          {payload && tab === "metadata" ? <div className={styles.results} data-testid="starfetch-metadata-result">
            <div className={styles.resultHeader}><Database size={14} /><strong>{text(target.label, service)}</strong><span>{metadataMode}</span></div>
            {metadataMode === "availability" ? <div className={styles.availability}><span data-ok={data.available === true}><CircleDot size={17} /></span><div><strong>{data.available === true ? "AVAILABLE" : "UNAVAILABLE"}</strong><p>{text(data.message, "服务未提供说明")}</p></div></div> : null}
            {metadataMode === "capabilities" ? <div className={styles.capabilities}><Metric label="认证" value={text(data.auth)} /><Metric label="语言" value={Array.isArray(data.languages) ? data.languages.join(", ") : "-"} /><Metric label="格式" value={Array.isArray(data.formats) ? data.formats.join(", ") : "-"} /></div> : null}
            {metadataMode === "tables" ? <div className={styles.tableCatalog}>{dataRows.map((item, index) => <button type="button" key={`${text(item.schema, "default")}:${text(item.name)}:${index}`} onClick={() => { setTable(text(item.name)); setMetadataMode("columns"); runtime.setResult(null); }}><code>{text(item.name)}</code><strong>{text(item.description, "无描述")}</strong><span>{text(item.schema, "default")}</span></button>)}</div> : null}
            {metadataMode === "columns" ? <DataTable rows={dataRows} columns={["name", "datatype", "unit", "ucd", "description"]} testId="starfetch-columns" /> : null}
          </div> : null}

          {payload && (tab === "query" || (tab === "jobs" && jobAction === "fetch")) ? <div className={styles.results} data-testid={tab === "query" ? "starfetch-query-result" : "starfetch-job-result"}>
            <div className={styles.resultHeader}><Telescope size={14} /><strong>{text(target.label, "TAP query")}</strong><span>{dataRows.length} rows · {text(data.format)}</span></div>
            <DataTable rows={dataRows} columns={columns} testId="starfetch-data-table" />
            <details><summary>查询诊断</summary><pre>{JSON.stringify(diagnostics, null, 2)}</pre></details>
          </div> : null}

          {payload && tab === "jobs" && jobAction !== "fetch" ? <div className={styles.results} data-testid="starfetch-job-result">
            <div className={styles.jobState}><Send size={20} /><div><span>{jobAction}</span><strong>{text(data.phase, data.deleted === true ? "DELETED" : "SUBMITTED")}</strong><code>{text(data.id ?? object(diagnostics.job).id, jobId)}</code></div></div>
            {Array.isArray(diagnostics.observedPhases) ? <div className={styles.phases}>{diagnostics.observedPhases.map((phase) => <span key={String(phase)}><CircleDot size={9} />{String(phase)}</span>)}</div> : null}
            <pre className={styles.diagnostics}>{JSON.stringify(diagnostics, null, 2)}</pre>
          </div> : null}
        </ResultView>
      </div>
    </div>
  );
}

function ServiceSelect({ value, onChange }: { value: string; onChange(value: string): void }) {
  return <div className="field-group"><label className="field-label" htmlFor="starfetch-service">TAP 服务</label><select id="starfetch-service" data-testid="starfetch-service" className="field-select" value={value} onChange={(event) => onChange(event.target.value)}>{serviceOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <span><small>{label}</small><strong>{value}</strong></span>;
}

function DataTable({ rows, columns, testId }: { rows: Row[]; columns: string[]; testId: string }) {
  if (rows.length === 0) return <div className={styles.noRows}><FileQuestion size={18} />没有可解析的数据行</div>;
  return <div className={styles.dataWrap} data-testid={testId}><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.slice(0, 50).map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{text(row[column])}</td>)}</tr>)}</tbody></table></div>;
}

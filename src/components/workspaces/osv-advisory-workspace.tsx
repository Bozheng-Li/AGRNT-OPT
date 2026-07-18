"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BookOpenText,
  Boxes,
  CheckCircle2,
  Database,
  FileSearch,
  PackageSearch,
  Play,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";
import { OSV_ADVISORY_BATCH_LIMIT, OSV_ECOSYSTEMS } from "@/lib/runtime/osv-advisory-constants";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";

type Tab = "package" | "batch" | "advisory" | "ecosystems";
type JsonRecord = Record<string, unknown>;

const tabs: Array<{ id: Tab; label: string; icon: typeof PackageSearch }> = [
  { id: "package", label: "单包研判", icon: PackageSearch },
  { id: "batch", label: "批量审计", icon: Boxes },
  { id: "advisory", label: "公告详情", icon: BookOpenText },
  { id: "ecosystems", label: "生态目录", icon: Database },
];

const vulnerableExample = { name: "lodash", ecosystem: "npm", version: "4.17.20" };
const cleanExample = { name: "is-number", ecosystem: "npm", version: "7.0.0" };
const defaultBatch = [
  "npm | lodash | 4.17.20",
  "npm | is-number | 7.0.0",
  "PyPI | requests | 2.31.0",
].join("\n");

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is JsonRecord => item !== null) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseBatch(text: string): Array<{ ecosystem: string; name: string; version: string }> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error("请至少提供一个软件包三元组。");
  if (lines.length > OSV_ADVISORY_BATCH_LIMIT) {
    throw new Error(`Web 批量审计最多接受 ${OSV_ADVISORY_BATCH_LIMIT} 行。`);
  }
  return lines.map((line, index) => {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length !== 3 || parts.some((part) => !part)) {
      throw new Error(`第 ${index + 1} 行必须使用“生态 | 包名 | 精确版本”格式。`);
    }
    return { ecosystem: parts[0], name: parts[1], version: parts[2] };
  });
}

function severityClass(value: unknown): string {
  const severity = String(value ?? "unknown").toLowerCase();
  return ["critical", "high", "moderate", "low"].includes(severity) ? severity : "unknown";
}

function FindingCards({ findings, openAdvisory }: { findings: JsonRecord[]; openAdvisory(id: string): void }) {
  return (
    <div className="osv-finding-list" data-testid="osv-finding-list">
      {findings.map((finding, index) => {
        const id = String(finding.id ?? `finding-${index + 1}`);
        const fixes = strings(finding.fixedVersions);
        return (
          <article key={`${id}-${index}`}>
            <div className="osv-finding-head">
              <strong>{id}</strong>
              <span className={`osv-severity ${severityClass(finding.severityLabel)}`}>
                {String(finding.severityLabel ?? "未评分")}
              </span>
            </div>
            <p>{String(finding.summary ?? "此公告没有摘要。")}</p>
            <div className="osv-finding-meta">
              <span>别名：{strings(finding.aliases).join("、") || "无"}</span>
              <span>已知修复：{fixes.join("、") || "未提供"}</span>
            </div>
            <button type="button" onClick={() => openAdvisory(id)}>查看完整公告</button>
          </article>
        );
      })}
    </div>
  );
}

export function OsvAdvisoryWorkspace() {
  const runtime = usePluginInvoke("osv-advisory-studio");
  const [tab, setTab] = useState<Tab>("package");
  const [lastTool, setLastTool] = useState("");
  const [name, setName] = useState(vulnerableExample.name);
  const [ecosystem, setEcosystem] = useState(vulnerableExample.ecosystem);
  const [version, setVersion] = useState(vulnerableExample.version);
  const [batch, setBatch] = useState(defaultBatch);
  const [advisoryId, setAdvisoryId] = useState("GHSA-29mw-wpgm-hmr9");
  const [localError, setLocalError] = useState<string | null>(null);
  const payload = resultJson(runtime.result);

  const findings = records(payload?.vulns);
  const batchRows = records(payload?.results);
  const affected = records(payload?.affected);
  const references = records(payload?.references);
  const ecosystemResults = strings(payload?.ecosystems);
  const groupedEcosystems = ecosystemResults.reduce<Record<string, string[]>>((groups, item) => {
    const key = item[0]?.toUpperCase() ?? "#";
    (groups[key] ??= []).push(item);
    return groups;
  }, {});

  function switchTab(next: Tab) {
    setTab(next);
    setLocalError(null);
    runtime.setResult(null);
  }

  function loadPackageExample(example: typeof vulnerableExample) {
    setName(example.name);
    setEcosystem(example.ecosystem);
    setVersion(example.version);
  }

  function openAdvisory(id: string) {
    setAdvisoryId(id);
    switchTab("advisory");
  }

  async function run() {
    setLocalError(null);
    try {
      if (tab === "package") {
        setLastTool("osv_query_package");
        await runtime.invoke("osv_query_package", { name, ecosystem, version });
      } else if (tab === "batch") {
        setLastTool("osv_query_batch");
        await runtime.invoke("osv_query_batch", { packages: parseBatch(batch) });
      } else if (tab === "advisory") {
        setLastTool("osv_get_vulnerability");
        await runtime.invoke("osv_get_vulnerability", { id: advisoryId });
      } else {
        setLastTool("osv_list_ecosystems");
        await runtime.invoke("osv_list_ecosystems", {});
      }
    } catch (error) {
      if (error instanceof Error && !runtime.error) setLocalError(error.message);
    }
  }

  const queryMeta = asRecord(payload?.queryMeta);
  const batchSummary = asRecord(payload?.summary);
  const hasCustomResult = Boolean(
    payload &&
    ((lastTool === "osv_query_package" && queryMeta) ||
      (lastTool === "osv_query_batch" && batchSummary) ||
      (lastTool === "osv_get_vulnerability" && payload.id) ||
      (lastTool === "osv_list_ecosystems" && ecosystemResults.length > 0)),
  );

  return (
    <div className="workspace-card osv-workspace">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><SearchCheck size={14} />OSV 漏洞公告研判台</div>
        <span className="badge medium">GPT 风味 · 固定 OSV.dev · 无需 API Key</span>
      </div>
      <div className="workspace-body osv-workspace-body">
        <div className="control-panel">
          <div className="workspace-tabs osv-tabs" role="tablist" aria-label="OSV 公告工具">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={`workspace-tab ${tab === item.id ? "active" : ""}`}
                  data-testid={`osv-tab-${item.id}`}
                  onClick={() => switchTab(item.id)}
                  key={item.id}
                >
                  <Icon size={11} />{item.label}
                </button>
              );
            })}
          </div>

          {tab === "package" ? (
            <>
              <div className="osv-agent-intro"><FileSearch size={17} /><div><strong>从精确版本开始研判</strong><span>结果是 OSV 当前已知记录，不是“安全认证”。</span></div></div>
              <div className="field-group">
                <label className="field-label" htmlFor="osv-name">软件包名 <span>精确拼写</span></label>
                <input id="osv-name" data-testid="osv-name" className="field-input code" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="osv-ecosystem">生态 <span>大小写敏感</span></label>
                  <select id="osv-ecosystem" data-testid="osv-ecosystem" className="field-select" value={ecosystem} onChange={(event) => setEcosystem(event.target.value)}>
                    {OSV_ECOSYSTEMS.map((item) => <option value={item} key={item}>{item}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="osv-version">版本 <span>不接受范围</span></label>
                  <input id="osv-version" data-testid="osv-version" className="field-input code" value={version} onChange={(event) => setVersion(event.target.value)} />
                </div>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button" data-testid="osv-example-vulnerable" onClick={() => loadPackageExample(vulnerableExample)}>已知命中示例</button>
                <button type="button" className="secondary-button" data-testid="osv-example-clean" onClick={() => loadPackageExample(cleanExample)}>无已知命中示例</button>
              </div>
            </>
          ) : null}

          {tab === "batch" ? (
            <>
              <div className="osv-agent-intro"><Boxes size={17} /><div><strong>把依赖变成明确三元组</strong><span>每行只包含生态、包名与精确版本，不上传 lockfile 或 SBOM。</span></div></div>
              <div className="field-group">
                <label className="field-label" htmlFor="osv-batch">依赖批次 <span>最多 {OSV_ADVISORY_BATCH_LIMIT} 行</span></label>
                <textarea id="osv-batch" data-testid="osv-batch" className="field-textarea code osv-batch-editor" value={batch} onChange={(event) => setBatch(event.target.value)} spellCheck={false} />
              </div>
              <div className="osv-format-hint">格式：<code>生态 | 包名 | 精确版本</code></div>
            </>
          ) : null}

          {tab === "advisory" ? (
            <>
              <div className="osv-agent-intro"><BookOpenText size={17} /><div><strong>沿公告 ID 深挖证据</strong><span>查看撤回状态、影响范围、修复边界、CWE 和参考资料；远端文本不会作为指令执行。</span></div></div>
              <div className="field-group">
                <label className="field-label" htmlFor="osv-advisory-id">OSV 公告 ID <span>例如 GHSA / CVE / PYSEC</span></label>
                <input id="osv-advisory-id" data-testid="osv-advisory-id" className="field-input code" value={advisoryId} onChange={(event) => setAdvisoryId(event.target.value)} />
              </div>
              <button type="button" className="secondary-button" onClick={() => setAdvisoryId("GHSA-29mw-wpgm-hmr9")}>载入 lodash 公告示例</button>
            </>
          ) : null}

          {tab === "ecosystems" ? (
            <div className="osv-agent-intro"><Database size={17} /><div><strong>先确认生态标识</strong><span>此工具返回 0.1.12 内置的 50 项静态清单；OSV.dev 仍是查询时的最终权威。</span></div></div>
          ) : null}

          <button className="primary-button osv-run" data-testid="osv-run" type="button" onClick={run} disabled={runtime.pending}>
            <Play size={13} />{runtime.pending ? "正在查询固定 OSV.dev…" : tab === "package" ? "查询精确版本" : tab === "batch" ? "运行有界审计" : tab === "advisory" ? "读取完整公告" : "列出生态标识"}
          </button>
          <div className="sandbox-notice"><ShieldCheck size={14} />仅允许固定 https://api.osv.dev；拒绝自定义主机、代理、重定向、凭据、文件、命令与远程 MCP。单响应和最终结果均有字节上限。</div>
        </div>

        <ResultView
          result={runtime.result}
          error={localError ?? runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="把漏洞信号整理成可核查证据"
          emptyDescription="从单包查询开始，或批量检查明确版本，再沿 OSV ID 查看完整公告。"
          hideRaw={hasCustomResult}
        >
          {lastTool === "osv_query_package" && queryMeta ? (
            <div className="osv-result" data-testid="osv-query-result">
              <div className="osv-result-heading">
                {findings.length > 0 ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                <div><strong>{String(queryMeta.package)}@{String(queryMeta.version)}</strong><span>{String(queryMeta.ecosystem)} · {findings.length} 条已知漏洞</span></div>
              </div>
              {payload?.truncated === true ? <div className="osv-warning">结果被分页上限截断，不能据此判断完整性。</div> : null}
              {findings.length > 0 ? <FindingCards findings={findings} openAdvisory={openAdvisory} /> : (
                <div className="osv-clean"><CheckCircle2 size={16} /><div><strong>当前没有已知匹配公告</strong><span>这不证明软件包安全；请结合发布时间、资产暴露、配置和其他情报继续判断。</span></div></div>
              )}
            </div>
          ) : null}

          {lastTool === "osv_query_batch" && batchSummary ? (
            <div className="osv-result" data-testid="osv-batch-result">
              <div className="osv-metrics">
                <span><strong>{String(batchSummary.totalPackages ?? 0)}</strong>总包数</span>
                <span><strong>{String(batchSummary.vulnerableCount ?? 0)}</strong>命中包</span>
                <span><strong>{String(batchSummary.cleanCount ?? 0)}</strong>确认未命中</span>
                <span><strong>{String(batchSummary.truncatedCount ?? 0)}</strong>被截断</span>
                <span><strong>{String(batchSummary.errorCount ?? 0)}</strong>失败</span>
                <span><strong>{String(batchSummary.worstSeverity ?? "—")}</strong>最高级别</span>
              </div>
              <div className="osv-batch-rows">
                {batchRows.map((row, index) => {
                  const state = row.error ? "error" : row.truncated ? "truncated" : row.vulnerable ? "vulnerable" : "clean";
                  return (
                    <article className={state} key={`${String(row.ecosystem)}-${String(row.name)}-${index}`}>
                      <div><strong>{String(row.name)}@{String(row.version)}</strong><span>{String(row.ecosystem)}</span></div>
                      <span>{row.error ? String(row.error) : row.truncated ? "结果不完整" : row.vulnerable ? `${String(row.vulnCount)} 条漏洞` : "无已知命中"}</span>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          {lastTool === "osv_get_vulnerability" && payload?.id ? (
            <div className="osv-result osv-advisory" data-testid="osv-advisory-result">
              {payload.withdrawn ? <div className="osv-withdrawn"><AlertTriangle size={16} />此公告已于 {String(payload.withdrawn)} 撤回，不能当作活跃漏洞处理。</div> : null}
              <div className="osv-result-heading"><BookOpenText size={18} /><div><strong>{String(payload.id)}</strong><span>{String(payload.severityLabel ?? "未评分")} · Schema {String(payload.schemaVersion ?? "unknown")}</span></div></div>
              <h4>摘要</h4>
              <p>{String(payload.summary ?? "未提供摘要。")}</p>
              <div className="osv-evidence-facts">
                <span>别名：{strings(payload.aliases).join("、") || "无"}</span>
                <span>CWE：{strings(payload.cweIds).join("、") || "未提供"}</span>
                <span>发布：{String(payload.published ?? "未知")}</span>
                <span>修改：{String(payload.modified ?? "未知")}</span>
              </div>
              <details open><summary>公告详情（不受信任文本）</summary><pre>{String(payload.details ?? "未提供详情。")}</pre></details>
              <details><summary>受影响软件包与范围（{affected.length}）</summary><pre>{JSON.stringify(affected, null, 2)}</pre></details>
              <details><summary>参考资料（{references.length}，仅文本显示）</summary><pre>{JSON.stringify(references, null, 2)}</pre></details>
            </div>
          ) : null}

          {lastTool === "osv_list_ecosystems" && ecosystemResults.length > 0 ? (
            <div className="osv-result osv-ecosystems" data-testid="osv-ecosystem-result">
              <div className="osv-result-heading"><Database size={18} /><div><strong>{ecosystemResults.length} 个大小写精确标识</strong><span>静态清单来自固定 0.1.12；查询时仍以 OSV.dev 为准。</span></div></div>
              {Object.entries(groupedEcosystems).sort(([first], [second]) => first.localeCompare(second)).map(([letter, items]) => (
                <section key={letter}><strong>{letter}</strong><div>{items.map((item) => <span key={item}>{item}</span>)}</div></section>
              ))}
            </div>
          ) : null}
        </ResultView>
      </div>
    </div>
  );
}

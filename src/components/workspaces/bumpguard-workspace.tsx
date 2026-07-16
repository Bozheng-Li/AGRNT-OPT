"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  Code2,
  FileDiff,
  GitCompareArrows,
  Import,
  Languages,
  ListTree,
  PackageSearch,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";

type Language = "python" | "java" | "dotnet";
type Tab = "upgrade" | "diff" | "verify" | "import" | "symbols";
type JsonRecord = Record<string, unknown>;

const languageLabels: Record<Language, string> = {
  python: "Python · PyPI",
  java: "Java · Maven",
  dotnet: ".NET · NuGet",
};

const tabs: Array<{ id: Tab; label: string; icon: typeof Code2 }> = [
  { id: "upgrade", label: "升级影响", icon: GitCompareArrows },
  { id: "diff", label: "API 差异", icon: FileDiff },
  { id: "verify", label: "代码核验", icon: Code2 },
  { id: "import", label: "导入检查", icon: Import },
  { id: "symbols", label: "符号浏览", icon: ListTree },
];

const presets: Record<Language, { packageName: string; fromVersion: string; toVersion: string; code: string; filter: string }> = {
  python: {
    packageName: "sniffio",
    fromVersion: "1.3.0",
    toVersion: "1.3.1",
    code: "import sniffio\n\nname = sniffio.current_async_library()\n",
    filter: "current_async_library",
  },
  java: {
    packageName: "com.google.code.gson:gson",
    fromVersion: "2.8.9",
    toVersion: "2.10.1",
    code: "import com.google.gson.Gson;\n\nclass Decoder {\n  Object read(Gson gson, String json) {\n    return gson.fromJson(json, Object.class);\n  }\n}\n",
    filter: "Gson.fromJson",
  },
  dotnet: {
    packageName: "Newtonsoft.Json",
    fromVersion: "12.0.1",
    toVersion: "13.0.1",
    code: "using Newtonsoft.Json;\n\nvar json = JsonConvert.SerializeObject(new { Name = \"Agent-OPT\" });\n",
    filter: "JsonConvert.SerializeObject",
  },
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is JsonRecord => item !== null) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function severityClass(value: unknown): "high" | "medium" | "low" {
  const normalized = String(value ?? "").toLowerCase();
  if (["breaking", "high", "critical"].includes(normalized)) return "high";
  if (["potentially_breaking", "medium", "warning"].includes(normalized)) return "medium";
  return "low";
}

function display(value: unknown, fallback = "—"): string {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

export function BumpguardWorkspace() {
  const runtime = usePluginInvoke("bumpguard-dependency-lab");
  const [tab, setTab] = useState<Tab>("upgrade");
  const [language, setLanguage] = useState<Language>("python");
  const [packageName, setPackageName] = useState(presets.python.packageName);
  const [fromVersion, setFromVersion] = useState(presets.python.fromVersion);
  const [toVersion, setToVersion] = useState(presets.python.toVersion);
  const [code, setCode] = useState(presets.python.code);
  const [symbolVersion, setSymbolVersion] = useState("");
  const [symbolFilter, setSymbolFilter] = useState(presets.python.filter);
  const [lastTool, setLastTool] = useState("");

  const payload = resultJson(runtime.result);
  const summary = asRecord(payload?.summary);
  const findings = records(payload?.findings);
  const breakingChanges = records(payload?.breaking_changes);
  const otherChanges = records(payload?.other_changes);
  const symbols = records(payload?.symbols);
  const providers = records(payload?.languages);
  const suggestions = strings(payload?.suggestions);
  const notes = strings(payload?.notes);

  function loadPreset(next: Language = language) {
    const preset = presets[next];
    setPackageName(preset.packageName);
    setFromVersion(preset.fromVersion);
    setToVersion(preset.toVersion);
    setCode(preset.code);
    setSymbolVersion("");
    setSymbolFilter(preset.filter);
    runtime.setResult(null);
  }

  function changeLanguage(next: Language) {
    setLanguage(next);
    loadPreset(next);
  }

  async function invoke(tool: string, args: JsonRecord) {
    setLastTool(tool);
    return runtime.invoke(tool, args).catch(() => undefined);
  }

  async function runCurrent() {
    const common = { language, package: packageName.trim() };
    if (tab === "upgrade") {
      await invoke("check_upgrade", {
        ...common,
        to_version: toVersion.trim(),
        code,
        ...(fromVersion.trim() ? { from_version: fromVersion.trim() } : {}),
      });
    } else if (tab === "diff") {
      await invoke("diff_versions", {
        ...common,
        to_version: toVersion.trim(),
        ...(fromVersion.trim() ? { from_version: fromVersion.trim() } : {}),
      });
    } else if (tab === "verify") {
      await invoke("verify_snippet", { language, code });
    } else if (tab === "import") {
      await invoke("check_import", common);
    } else {
      await invoke("list_symbols", {
        ...common,
        ...(symbolVersion.trim() ? { version: symbolVersion.trim() } : {}),
        ...(symbolFilter.trim() ? { name_filter: symbolFilter.trim() } : {}),
      });
    }
  }

  const needsPackage = tab !== "verify";
  const needsVersions = tab === "upgrade" || tab === "diff";
  const needsCode = tab === "upgrade" || tab === "verify";
  const runDisabled = runtime.pending || (needsPackage && !packageName.trim()) ||
    (needsVersions && !toVersion.trim()) || (needsCode && !code.trim());
  const currentTab = tabs.find((item) => item.id === tab)!;
  const hideRaw = Boolean(payload);

  return (
    <div className="workspace-card bumpguard-workspace">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><ShieldCheck size={14} />BumpGuard 依赖兼容实验室</div>
        <span className="badge low">静态分析 · 三生态 · 不执行依赖代码</span>
      </div>
      <div className="workspace-body bumpguard-workspace-body">
        <div className="control-panel">
          <div className="bumpguard-language-switch" role="group" aria-label="依赖生态">
            {(Object.keys(languageLabels) as Language[]).map((item) => (
              <button
                type="button"
                className={language === item ? "active" : ""}
                data-testid={`bumpguard-language-${item}`}
                aria-pressed={language === item}
                onClick={() => changeLanguage(item)}
                key={item}
              >
                {languageLabels[item]}
              </button>
            ))}
          </div>

          <div className="workspace-tabs bumpguard-tabs">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  className={`workspace-tab ${tab === item.id ? "active" : ""}`}
                  data-testid={`bumpguard-tab-${item.id}`}
                  onClick={() => setTab(item.id)}
                  key={item.id}
                >
                  <Icon size={11} />{item.label}
                </button>
              );
            })}
          </div>

          <div className="bumpguard-preset-row">
            <span>{languageLabels[language]}</span>
            <button type="button" className="icon-button" title="恢复该生态示例" aria-label="恢复该生态示例" onClick={() => loadPreset()}>
              <RefreshCw size={12} />
            </button>
          </div>

          {needsPackage ? (
            <div className="field-group">
              <label className="field-label" htmlFor="bumpguard-package">
                {language === "java" ? "Maven group:artifact" : language === "dotnet" ? "NuGet 包名" : "PyPI 分发包名"}
                <span>精确名称</span>
              </label>
              <input
                id="bumpguard-package"
                data-testid="bumpguard-package"
                className="field-input code"
                value={packageName}
                onChange={(event) => setPackageName(event.target.value)}
              />
            </div>
          ) : null}

          {needsVersions ? (
            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="bumpguard-from">基线版本 <span>可省略</span></label>
                <input id="bumpguard-from" data-testid="bumpguard-from" className="field-input code" value={fromVersion} onChange={(event) => setFromVersion(event.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="bumpguard-to">目标版本</label>
                <input id="bumpguard-to" data-testid="bumpguard-to" className="field-input code" value={toVersion} onChange={(event) => setToVersion(event.target.value)} />
              </div>
            </div>
          ) : null}

          {tab === "symbols" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="bumpguard-symbol-version">查询版本 <span>空值读取本地</span></label>
                <input id="bumpguard-symbol-version" data-testid="bumpguard-symbol-version" className="field-input code" placeholder={toVersion} value={symbolVersion} onChange={(event) => setSymbolVersion(event.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="bumpguard-filter">符号路径过滤 <span>最多返回 300 项</span></label>
                <div className="bumpguard-filter-input"><Search size={12} /><input id="bumpguard-filter" data-testid="bumpguard-filter" value={symbolFilter} onChange={(event) => setSymbolFilter(event.target.value)} /></div>
              </div>
            </>
          ) : null}

          {needsCode ? (
            <div className="field-group">
              <label className="field-label" htmlFor="bumpguard-code">{tab === "upgrade" ? "待迁移源码" : "待核验代码片段"} <span>最大 100,000 字符</span></label>
              <textarea
                id="bumpguard-code"
                data-testid="bumpguard-code"
                className="field-textarea code bumpguard-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                spellCheck={false}
              />
            </div>
          ) : null}

          {tab === "verify" && language !== "python" ? (
            <div className="bumpguard-inline-warning"><AlertTriangle size={13} />0.2.1 对该生态会明确返回“不支持语义核验”；升级影响、API 差异和符号浏览仍可用。</div>
          ) : null}

          <button className="primary-button" data-testid="bumpguard-run" type="button" onClick={runCurrent} disabled={runDisabled}>
            {runtime.pending ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
            {runtime.pending ? "正在提取并分析…" : `运行${currentTab.label}`}
          </button>

          <button
            className="secondary-button bumpguard-provider-button"
            data-testid="bumpguard-probe-languages"
            type="button"
            onClick={() => invoke("list_languages", {})}
            disabled={runtime.pending}
          >
            <Languages size={12} />探测当前提供器
          </button>

          <div className="privacy-notice">
            <ShieldCheck size={14} />
            版本产物仅从 PyPI、Maven Central 与 nuget.org 获取并静态读取。缓存、临时文件和 .NET 首次构建位于 `var/runtime/bumpguard`；结果是部分静态表面，“未发现问题”不等于运行时兼容保证。
          </div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="以真实 API 约束依赖变更"
          emptyDescription="选择生态和工作流，使用精确版本、源码与符号过滤器生成可追溯的静态分析结果。"
          hideRaw={hideRaw}
        >
          {typeof payload?.error === "string" ? (
            <div className="bumpguard-upstream-error" data-testid="bumpguard-upstream-error"><XCircle size={16} /><div><strong>上游无法完成分析</strong><span>{payload.error}</span></div></div>
          ) : null}

          {lastTool === "list_languages" && providers.length > 0 ? (
            <div className="bumpguard-provider-grid" data-testid="bumpguard-provider-result">
              {providers.map((provider) => (
                <div key={String(provider.language)}><CheckCircle2 size={15} /><strong>{display(provider.language)}</strong><span>{display(provider.ecosystem)}</span></div>
              ))}
            </div>
          ) : null}

          {lastTool === "check_upgrade" && payload && typeof payload.error !== "string" ? (
            <div data-testid="bumpguard-upgrade-result">
              <div className={`bumpguard-verdict ${payload.safe_to_upgrade === true ? "safe" : "risk"}`}>
                {payload.safe_to_upgrade === true ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                <div><strong>{payload.safe_to_upgrade === true ? "未发现命中当前代码的破坏" : "发现需要处理的升级风险"}</strong><span>{display(payload.package)} · {display(payload.from_version)} → {display(payload.to_version)}</span></div>
              </div>
              <div className="bumpguard-metrics">
                <div><span>命中 breaking</span><strong>{display(summary?.breaking, "0")}</strong></div>
                <div><span>潜在影响</span><strong>{display(summary?.potentially_breaking, "0")}</strong></div>
                <div><span>API 变化</span><strong>{display(summary?.total_api_changes, "0")}</strong></div>
                <div><span>breaking API</span><strong>{display(summary?.breaking_api_changes, "0")}</strong></div>
              </div>
              {findings.length > 0 ? <FindingList items={findings} /> : <div className="bumpguard-clean"><CheckCircle2 size={15} />所给代码未命中已识别的破坏项。</div>}
            </div>
          ) : null}

          {lastTool === "diff_versions" && payload && typeof payload.error !== "string" ? (
            <div data-testid="bumpguard-diff-result">
              <div className="bumpguard-result-heading"><FileDiff size={17} /><div><strong>{display(payload.package)}</strong><span>{display(payload.from_version)} → {display(payload.to_version)} · 部分表面 {display(payload.surface_partial)}</span></div></div>
              <div className="bumpguard-metrics compact">
                <div><span>全部变化</span><strong>{display(summary?.total_changes, "0")}</strong></div>
                <div><span>breaking</span><strong>{display(summary?.breaking, "0")}</strong></div>
              </div>
              <ChangeList title="破坏性变化" items={breakingChanges} tone="high" />
              <ChangeList title="其他变化" items={otherChanges} tone="low" />
            </div>
          ) : null}

          {lastTool === "verify_snippet" && payload && typeof payload.error !== "string" ? (
            <div data-testid="bumpguard-verify-result">
              <div className={`bumpguard-verdict ${payload.verified === true ? "safe" : "risk"}`}>
                {payload.verified === true ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                <div>
                  <strong>{payload.verified === true ? "未发现虚构或缺失 API" : payload.verified === null ? "该生态暂不支持片段语义核验" : "代码片段需要复核"}</strong>
                  <span>{display(payload.language)} · {findings.length} 个发现</span>
                </div>
              </div>
              {findings.length > 0 ? <FindingList items={findings} /> : null}
              {typeof payload.note === "string" ? <div className="bumpguard-note">{payload.note}</div> : null}
            </div>
          ) : null}

          {lastTool === "check_import" && payload && typeof payload.error !== "string" ? (
            <div className="bumpguard-import-result" data-testid="bumpguard-import-result">
              {payload.installed === true ? <CheckCircle2 size={22} /> : <PackageSearch size={22} />}
              <div><strong>{payload.installed === true ? `${display(payload.package)} 已安装` : `${display(payload.package)} 未安装`}</strong><span>{payload.installed === true ? `版本 ${display(payload.version)} · ${display(payload.location)}` : display(payload.message)}</span></div>
              {suggestions.length > 0 ? <div className="bumpguard-suggestions">{suggestions.map((item) => <button type="button" onClick={() => setPackageName(item)} key={item}>{item}</button>)}</div> : null}
            </div>
          ) : null}

          {lastTool === "list_symbols" && payload && typeof payload.error !== "string" ? (
            <div data-testid="bumpguard-symbol-result">
              <div className="bumpguard-result-heading"><Braces size={17} /><div><strong>{display(payload.package)} {display(payload.version, "本地版本")}</strong><span>{display(payload.count, "0")} 个匹配 · 截断 {display(payload.truncated, "false")}</span></div></div>
              <div className="bumpguard-symbol-table">
                <div className="bumpguard-symbol-head"><span>符号</span><span>类型</span><span>签名</span></div>
                {symbols.map((symbol, index) => (
                  <div className="bumpguard-symbol-row" key={`${String(symbol.symbol)}-${index}`}>
                    <code>{display(symbol.symbol)}</code><span>{display(symbol.kind)}</span><code>{display(symbol.signature)}</code>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {notes.length > 0 ? <div className="bumpguard-notes">{notes.map((note) => <p key={note}>{note}</p>)}</div> : null}
        </ResultView>
      </div>
    </div>
  );
}

function FindingList({ items }: { items: JsonRecord[] }) {
  return (
    <div className="bumpguard-finding-list" data-testid="bumpguard-findings">
      {items.map((finding, index) => {
        const tone = severityClass(finding.severity);
        return (
          <article className={tone} key={`${display(finding.symbol)}-${display(finding.line)}-${index}`}>
            <div><span className={`badge ${tone}`}>{display(finding.severity, "notice")}</span><strong>{display(finding.symbol, "代码片段")}</strong><code>line {display(finding.line, "?")}</code></div>
            <p>{display(finding.message)}</p>
            {typeof finding.suggestion === "string" ? <small>{finding.suggestion}</small> : null}
          </article>
        );
      })}
    </div>
  );
}

function ChangeList({ title, items, tone }: { title: string; items: JsonRecord[]; tone: "high" | "low" }) {
  if (items.length === 0) return null;
  return (
    <section className="bumpguard-change-section">
      <h4><span className={`badge ${tone}`}>{items.length}</span>{title}</h4>
      <div className="bumpguard-change-list">
        {items.map((change, index) => (
          <div key={`${display(change.symbol)}-${index}`}>
            <code>{display(change.symbol)}</code><span>{display(change.change)}{change.severity ? ` · ${display(change.severity)}` : ""}</span><p>{display(change.detail)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

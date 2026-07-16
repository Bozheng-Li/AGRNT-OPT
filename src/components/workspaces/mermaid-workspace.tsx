"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Braces, Download, FileImage, ScanSearch, ShieldCheck, Workflow } from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";

type Tab = "preview" | "describe" | "code";

const tabLabels: Record<Tab, string> = {
  preview: "PNG 预览",
  describe: "语义描述",
  code: "Code Mode",
};

const examples = {
  flowchart: `flowchart LR
  User[用户] --> Web[Agent-OPT Web]
  Web --> MCP[Agentic Mermaid MCP]
  MCP --> Verify{结构校验}
  Verify --> PNG[PNG 预览]`,
  sequence: `sequenceDiagram
  actor User as 用户
  participant Web as Agent-OPT Web
  participant MCP as Mermaid MCP
  User->>Web: 提交 Mermaid 源码
  Web->>MCP: render_png
  MCP-->>Web: PNG + 校验结果
  Web-->>User: 可视化预览`,
  architecture: `architecture-beta
  group platform(cloud)[Agent Platform]
  service web(internet)[Web] in platform
  service runtime(server)[MCP Runtime] in platform
  service catalog(database)[Catalog] in platform
  web:R --> L:runtime
  runtime:R --> L:catalog`,
};

const defaultCode = `const built = mermaid.buildMermaid('flowchart', [
  { kind: 'add_node', id: 'Source', label: 'Source' },
  { kind: 'add_node', id: 'Verify', label: 'Verify' },
  { kind: 'add_node', id: 'Render', label: 'Render' },
  { kind: 'add_edge', from: 'Source', to: 'Verify' },
  { kind: 'add_edge', from: 'Verify', to: 'Render' }
], { direction: 'LR' })
if (!built.ok) return built
const source = mermaid.serializeMermaid(built.value)
const verify = mermaid.verifyMermaid(built.value)
return {
  source,
  verifyOk: verify.ok,
  warningCount: verify.warnings.length,
  facts: mermaid.describeMermaidFacts(built.value),
  ascii: mermaid.renderMermaidASCII(built.value, { useAscii: true })
}`;

export function MermaidWorkspace() {
  const [tab, setTab] = useState<Tab>("preview");
  const [source, setSource] = useState(examples.flowchart);
  const [scale, setScale] = useState(1);
  const [background, setBackground] = useState("white");
  const [style, setStyle] = useState("hand-drawn");
  const [seed, setSeed] = useState(7);
  const [output, setOutput] = useState<"base64" | "file">("base64");
  const [format, setFormat] = useState<"text" | "facts" | "json">("facts");
  const [code, setCode] = useState(defaultCode);
  const [timeoutMs, setTimeoutMs] = useState(2_000);
  const runtime = usePluginInvoke("mermaid-diagram-studio");
  const payload = resultJson(runtime.result);
  const pngBase64 = typeof payload?.png_base64 === "string" ? payload.png_base64 : null;
  const artifact = payload?.artifact && typeof payload.artifact === "object"
    ? payload.artifact as Record<string, unknown>
    : null;
  const imageSource = pngBase64 ? `data:image/png;base64,${pngBase64}` : null;
  const imageBytes = useMemo(() => pngBase64 ? Math.floor((pngBase64.length * 3) / 4) : null, [pngBase64]);

  async function run() {
    if (tab === "preview") {
      await runtime.invoke("render_png", {
        source,
        scale,
        background,
        style: style || null,
        seed,
        output,
      }).catch(() => undefined);
    } else if (tab === "describe") {
      await runtime.invoke("describe", { source, format }).catch(() => undefined);
    } else {
      await runtime.invoke("execute", { code, timeoutMs }).catch(() => undefined);
    }
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Workflow size={14} />Mermaid 图表工作室</div>
        <span className="badge low">本地渲染 · 确定性布局</span>
      </div>
      <div className="workspace-body">
        <div className="control-panel">
          <div className="workspace-tabs">
            {(Object.keys(tabLabels) as Tab[]).map((item) => (
              <button
                type="button"
                data-testid={`mermaid-tab-${item}`}
                className={`workspace-tab ${tab === item ? "active" : ""}`}
                onClick={() => setTab(item)}
                key={item}
              >
                {tabLabels[item]}
              </button>
            ))}
          </div>

          {tab !== "code" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="mermaid-source">Mermaid 源码 <span>最大 200,000 字符</span></label>
                <textarea
                  id="mermaid-source"
                  data-testid="mermaid-source"
                  className="field-textarea code mermaid-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                />
              </div>
              <div className="button-row mermaid-examples" aria-label="图表示例">
                {(Object.keys(examples) as Array<keyof typeof examples>).map((name) => (
                  <button className="secondary-button" type="button" key={name} onClick={() => setSource(examples[name])}>
                    {name === "flowchart" ? "流程图" : name === "sequence" ? "时序图" : "架构图"}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {tab === "preview" ? (
            <>
              <div className="field-row mermaid-settings">
                <div className="field-group">
                  <label className="field-label" htmlFor="mermaid-style">绘制风格</label>
                  <select id="mermaid-style" data-testid="mermaid-style" className="field-select" value={style} onChange={(event) => setStyle(event.target.value)}>
                    <option value="">标准</option>
                    <option value="hand-drawn">手绘</option>
                    <option value="watercolor">水彩</option>
                    <option value="excalidraw">Excalidraw</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="mermaid-background">背景色</label>
                  <input id="mermaid-background" className="field-input" value={background} onChange={(event) => setBackground(event.target.value)} />
                </div>
              </div>
              <div className="field-row mermaid-settings">
                <div className="field-group">
                  <label className="field-label" htmlFor="mermaid-scale">缩放</label>
                  <input id="mermaid-scale" type="number" min={0.25} max={4} step={0.25} className="field-input" value={scale} onChange={(event) => setScale(Number(event.target.value))} />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="mermaid-seed">笔触种子</label>
                  <input id="mermaid-seed" type="number" min={0} className="field-input" value={seed} onChange={(event) => setSeed(Number(event.target.value))} />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="mermaid-output">输出方式</label>
                <select id="mermaid-output" className="field-select" value={output} onChange={(event) => setOutput(event.target.value as "base64" | "file")}>
                  <option value="base64">网页预览与下载</option>
                  <option value="file">写入服务器沙箱</option>
                </select>
              </div>
            </>
          ) : null}

          {tab === "describe" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="mermaid-format">描述格式</label>
              <select id="mermaid-format" data-testid="mermaid-format" className="field-select" value={format} onChange={(event) => setFormat(event.target.value as "text" | "facts" | "json")}>
                <option value="facts">确定性语义事实</option>
                <option value="text">自然语言摘要</option>
                <option value="json">无障碍结构树</option>
              </select>
            </div>
          ) : null}

          {tab === "code" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="mermaid-code">同步 JavaScript <span>仅可访问 mermaid.*</span></label>
                <textarea id="mermaid-code" data-testid="mermaid-code" className="field-textarea code mermaid-code" value={code} onChange={(event) => setCode(event.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="mermaid-timeout">执行超时 <span>50–5,000ms</span></label>
                <input id="mermaid-timeout" type="number" min={50} max={5_000} className="field-input" value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value))} />
              </div>
            </>
          ) : null}

          <button className="primary-button" data-testid="mermaid-run" type="button" onClick={run} disabled={runtime.pending}>
            {tab === "preview" ? <FileImage size={13} /> : tab === "describe" ? <ScanSearch size={13} /> : <Braces size={13} />}
            {runtime.pending ? "处理中…" : tabLabels[tab]}
          </button>
          <div className="privacy-notice">
            <ShieldCheck size={14} />
            无网络访问；Code Mode 位于 node:vm 沙箱，禁用 process、require、fetch、字符串代码生成，并固定 5 秒上限。文件输出只能进入 `var/runtime/agentic-mermaid/artifacts`。
          </div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="创建、验证并查看 Mermaid 图表"
          emptyDescription="直接渲染 PNG、读取结构化语义，或使用受限 Code Mode 完成多步建图和校验。"
          hideRaw={Boolean(imageSource)}
        >
          {imageSource ? (
            <div className="mermaid-preview" data-testid="mermaid-preview">
              <div className="mermaid-preview-header">
                <div><strong>PNG 渲染结果</strong><span>{imageBytes?.toLocaleString("zh-CN")} 字节 · scale {scale}</span></div>
                <a className="secondary-button" href={imageSource} download="agent-opt-diagram.png"><Download size={12} />下载 PNG</a>
              </div>
              <div className="mermaid-canvas">
                <Image data-testid="mermaid-image" src={imageSource} alt="Agentic Mermaid 渲染预览" width={1200} height={800} unoptimized />
              </div>
            </div>
          ) : null}
          {artifact ? (
            <div className="artifact-summary" data-testid="mermaid-artifact">
              <strong>沙箱文件已生成</strong>
              <span>{String(artifact.path ?? "路径不可用")}</span>
              <small>{Number(artifact.bytes ?? 0).toLocaleString("zh-CN")} 字节 · SHA-256 {String(artifact.sha256 ?? "未知")}</small>
            </div>
          ) : null}
        </ResultView>
      </div>
    </div>
  );
}

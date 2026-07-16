"use client";

import Image from "next/image";
import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCode2,
  ImageIcon,
  Inspect,
  Lightbulb,
  Palette,
  Play,
  Save,
  Search,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { ResultView } from "./result-view";
import { type InvocationResult, usePluginInvoke } from "./use-plugin-invoke";

type Tab = "author" | "recommend" | "library";
type Library = "types" | "examples" | "palettes" | "grammar";
type RenderFormat = "png" | "svg" | "html";

type JsonRecord = Record<string, unknown>;

const starterSource = `chart bar-vertical {
  title = "产品季度收入"
  description = "用于演示 Blueprint Chart 的可验证数据图表工作流"
  byline = "Agent-OPT"
  source = "Demo dataset"
  colorPalette = "Blueprint"
  sort = descending
  valueLabels = true

  highlight "Q4"

  data {
    "Q1" = 18
    "Q2" = 24
    "Q3" = 21
    "Q4" = 32
  }
}`;

const tabLabels: Record<Tab, string> = {
  author: "设计与渲染",
  recommend: "图表推荐",
  library: "参考资料库",
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function textPayload(result: InvocationResult | null): JsonRecord | null {
  if (!result) return null;
  const text = result.content.find(
    (block) => block && typeof block === "object" && "type" in block && block.type === "text" && "text" in block,
  );
  if (!text || typeof text !== "object" || !("text" in text) || typeof text.text !== "string") return null;
  try {
    return asRecord(JSON.parse(text.text));
  } catch {
    return null;
  }
}

function resultPayload(result: InvocationResult | null): JsonRecord | null {
  const text = textPayload(result);
  const structured = asRecord(result?.structuredContent);
  return text || structured ? { ...(text ?? {}), ...(structured ?? {}) } : null;
}

function imageDataUrl(result: InvocationResult | null): string | null {
  if (!result) return null;
  const image = result.content.find(
    (block) => block && typeof block === "object" && "type" in block && block.type === "image" && "data" in block,
  );
  if (!image || typeof image !== "object" || !("data" in image) || typeof image.data !== "string") return null;
  const mimeType = "mimeType" in image && typeof image.mimeType === "string" ? image.mimeType : "image/png";
  return `data:${mimeType};base64,${image.data}`;
}

function insertPalette(source: string, palette: string): string {
  if (/^\s*colorPalette\s*=/m.test(source)) {
    return source.replace(/^\s*colorPalette\s*=.*$/m, `  colorPalette = "${palette}"`);
  }
  return source.replace(/^(\s*chart\s+[^\s{]+\s*\{)/, `$1\n  colorPalette = "${palette}"`);
}

export function BlueprintWorkspace() {
  const runtime = usePluginInvoke("blueprint-chart-studio");
  const [tab, setTab] = useState<Tab>("author");
  const [lastTool, setLastTool] = useState<string>("");
  const [source, setSource] = useState(starterSource);
  const [format, setFormat] = useState<RenderFormat>("png");
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(500);
  const [scene, setScene] = useState("");
  const [saveEnabled, setSaveEnabled] = useState(false);
  const [savePath, setSavePath] = useState("charts/blueprint.png");
  const [shape, setShape] = useState("string,number");
  const [rowCount, setRowCount] = useState(12);
  const [goal, setGoal] = useState("比较各类别并突出排名最高的项目");
  const [library, setLibrary] = useState<Library>("types");
  const [chartType, setChartType] = useState("bar-horizontal");
  const [exampleQuery, setExampleQuery] = useState("emissions");
  const [grammarSection, setGrammarSection] = useState("chart");

  const payload = resultPayload(runtime.result);
  const imageSource = imageDataUrl(runtime.result);
  const svg = lastTool === "render" && typeof payload?.svg === "string" ? payload.svg : null;
  const html = lastTool === "render" && typeof payload?.html === "string" ? payload.html : null;
  const svgSource = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
  const recommendations = Array.isArray(payload?.recommendations) ? payload.recommendations.map(asRecord).filter(Boolean) as JsonRecord[] : [];
  const chartTypes = Array.isArray(payload?.chartTypes) ? payload.chartTypes.map(asRecord).filter(Boolean) as JsonRecord[] : [];
  const examples = Array.isArray(payload?.results) ? payload.results.map(asRecord).filter(Boolean) as JsonRecord[] : [];
  const palettes = Array.isArray(payload?.palettes) ? payload.palettes.map(asRecord).filter(Boolean) as JsonRecord[] : [];
  const frame = asRecord(payload?.frame);

  async function invoke(tool: string, args: JsonRecord) {
    setLastTool(tool);
    return runtime.invoke(tool, args).catch(() => undefined);
  }

  async function loadExample(args: JsonRecord) {
    const result = await invoke("get_example", args);
    const next = resultPayload(result ?? null);
    if (!result?.isError && typeof next?.dsl === "string") {
      setSource(next.dsl);
      if (typeof next.chartType === "string") setChartType(next.chartType);
      setTab("author");
    }
  }

  async function renderChart() {
    const args: JsonRecord = { source, format, width, height, modelVisible: false };
    if (scene !== "") args.scene = Number(scene);
    if (saveEnabled) args.save = savePath;
    await invoke("render", args);
  }

  function changeFormat(next: RenderFormat) {
    setFormat(next);
    if (saveEnabled) setSavePath(`charts/blueprint.${next}`);
  }

  const hideRaw = Boolean(imageSource || svgSource || html || payload?.copyUrl || payload?.valid !== undefined);

  return (
    <div className="workspace-card blueprint-workspace">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><BarChart3 size={14} />Blueprint Chart 数据图表工作台</div>
        <span className="badge low">本地 DSL · 无账号 · 可访问渲染</span>
      </div>
      <div className="workspace-body blueprint-workspace-body">
        <div className="control-panel">
          <div className="workspace-tabs blueprint-tabs">
            {(Object.keys(tabLabels) as Tab[]).map((item) => (
              <button
                type="button"
                data-testid={`blueprint-tab-${item}`}
                className={`workspace-tab ${tab === item ? "active" : ""}`}
                onClick={() => setTab(item)}
                key={item}
              >
                {tabLabels[item]}
              </button>
            ))}
          </div>

          {tab === "author" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="blueprint-source">.bpc 图表源码 <span>最大 200,000 字符</span></label>
                <textarea
                  id="blueprint-source"
                  data-testid="blueprint-source"
                  className="field-textarea code blueprint-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                />
              </div>
              <div className="button-row blueprint-actions">
                <button type="button" className="secondary-button" data-testid="blueprint-validate" onClick={() => invoke("validate_dsl", { source })} disabled={runtime.pending}>
                  <CheckCircle2 size={12} />校验
                </button>
                <button type="button" className="secondary-button" data-testid="blueprint-inspect" onClick={() => invoke("inspect_dsl", { source })} disabled={runtime.pending}>
                  <Inspect size={12} />检查结构
                </button>
                <button type="button" className="secondary-button" data-testid="blueprint-export" onClick={() => invoke("export_chart", { source, modelVisible: false })} disabled={runtime.pending}>
                  <Share2 size={12} />生成分享链接
                </button>
              </div>
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="blueprint-format">输出格式</label>
                  <select id="blueprint-format" data-testid="blueprint-format" className="field-select" value={format} onChange={(event) => changeFormat(event.target.value as RenderFormat)}>
                    <option value="png">PNG 图像</option>
                    <option value="svg">SVG 矢量图</option>
                    <option value="html">HTML 自包含页</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="blueprint-scene">叙事场景 <span>可选</span></label>
                  <input id="blueprint-scene" className="field-input" type="number" min={0} max={1_000} placeholder="基础场景" value={scene} onChange={(event) => setScene(event.target.value)} />
                </div>
              </div>
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="blueprint-width">宽度</label>
                  <input id="blueprint-width" data-testid="blueprint-width" className="field-input" type="number" min={1} max={1_600} value={width} onChange={(event) => setWidth(Number(event.target.value))} />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="blueprint-height">高度</label>
                  <input id="blueprint-height" className="field-input" type="number" min={1} max={1_600} value={height} onChange={(event) => setHeight(Number(event.target.value))} />
                </div>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={saveEnabled} onChange={(event) => setSaveEnabled(event.target.checked)} />
                同时写入项目产物沙箱
              </label>
              {saveEnabled ? (
                <div className="field-group">
                  <label className="field-label" htmlFor="blueprint-save">相对保存路径 <span>.{format}</span></label>
                  <input id="blueprint-save" data-testid="blueprint-save" className="field-input" value={savePath} onChange={(event) => setSavePath(event.target.value)} />
                </div>
              ) : null}
              <button className="primary-button" data-testid="blueprint-render" type="button" onClick={renderChart} disabled={runtime.pending}>
                {saveEnabled ? <Save size={13} /> : <Play size={13} />}{runtime.pending ? "渲染中…" : `渲染 ${format.toUpperCase()}`}
              </button>
            </>
          ) : null}

          {tab === "recommend" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="blueprint-goal">数据表达目标</label>
                <textarea id="blueprint-goal" data-testid="blueprint-goal" className="field-textarea" value={goal} onChange={(event) => setGoal(event.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="blueprint-shape">列类型结构</label>
                <select id="blueprint-shape" data-testid="blueprint-shape" className="field-select" value={shape} onChange={(event) => setShape(event.target.value)}>
                  <option value="string,number">类别 + 数值</option>
                  <option value="date,number">日期 + 数值</option>
                  <option value="string,number,number">类别 + 多个数值</option>
                  <option value="date,number,number">日期 + 多个数值</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="blueprint-rows">数据行数</label>
                <input id="blueprint-rows" data-testid="blueprint-rows" className="field-input" type="number" min={0} value={rowCount} onChange={(event) => setRowCount(Number(event.target.value))} />
              </div>
              <button
                className="primary-button"
                data-testid="blueprint-recommend"
                type="button"
                onClick={() => invoke("recommend_chart_type", { columnTypes: shape.split(","), rowCount, goal })}
                disabled={runtime.pending}
              >
                <Lightbulb size={13} />{runtime.pending ? "分析中…" : "推荐图表类型"}
              </button>
            </>
          ) : null}

          {tab === "library" ? (
            <>
              <div className="workspace-tabs blueprint-library-tabs">
                {(["types", "examples", "palettes", "grammar"] as Library[]).map((item) => (
                  <button type="button" className={`workspace-tab ${library === item ? "active" : ""}`} onClick={() => setLibrary(item)} key={item}>
                    {item === "types" ? "图表类型" : item === "examples" ? "示例" : item === "palettes" ? "调色板" : "语法"}
                  </button>
                ))}
              </div>
              {library === "types" ? (
                <>
                  <div className="field-group">
                    <label className="field-label" htmlFor="blueprint-chart-type">图表类型或别名</label>
                    <input id="blueprint-chart-type" data-testid="blueprint-chart-type" className="field-input" value={chartType} onChange={(event) => setChartType(event.target.value)} />
                  </div>
                  <div className="button-row blueprint-actions">
                    <button type="button" className="secondary-button" data-testid="blueprint-list-types" onClick={() => invoke("list_chart_types", {})}><BookOpen size={12} />列出全部</button>
                    <button type="button" className="secondary-button" data-testid="blueprint-describe-type" onClick={() => invoke("describe_chart_type", { chartType })}><Inspect size={12} />查看指南</button>
                  </div>
                </>
              ) : null}
              {library === "examples" ? (
                <>
                  <div className="field-group">
                    <label className="field-label" htmlFor="blueprint-example-query">主题关键词</label>
                    <input id="blueprint-example-query" data-testid="blueprint-example-query" className="field-input" value={exampleQuery} onChange={(event) => setExampleQuery(event.target.value)} />
                  </div>
                  <div className="button-row blueprint-actions">
                    <button type="button" className="secondary-button" data-testid="blueprint-search-examples" onClick={() => invoke("search_examples", { query: exampleQuery, limit: 10 })}><Search size={12} />搜索示例</button>
                    <button type="button" className="secondary-button" data-testid="blueprint-starter-example" onClick={() => loadExample({})}><FileCode2 size={12} />载入起步示例</button>
                  </div>
                </>
              ) : null}
              {library === "palettes" ? (
                <button className="primary-button" data-testid="blueprint-list-palettes" type="button" onClick={() => invoke("list_palettes", {})} disabled={runtime.pending}>
                  <Palette size={13} />读取 51 个内置调色板
                </button>
              ) : null}
              {library === "grammar" ? (
                <>
                  <div className="field-group">
                    <label className="field-label" htmlFor="blueprint-grammar">语法章节</label>
                    <select id="blueprint-grammar" data-testid="blueprint-grammar" className="field-select" value={grammarSection} onChange={(event) => setGrammarSection(event.target.value)}>
                      <option value="all">完整语法</option>
                      <option value="chart">图表块</option>
                      <option value="properties">属性</option>
                      <option value="scenes">场景与变换</option>
                      <option value="annotations">标注</option>
                    </select>
                  </div>
                  <button className="primary-button" data-testid="blueprint-get-grammar" type="button" onClick={() => invoke("get_grammar", { section: grammarSection })} disabled={runtime.pending}>
                    <BookOpen size={13} />读取语法参考
                  </button>
                </>
              ) : null}
            </>
          ) : null}

          <div className="privacy-notice">
            <ShieldCheck size={14} />
            11 个工具均从固定本地 stdio 包启动。分享链接只在本地把 .bpc 编码进官方编辑器 URL；文件只能保存到 `var/runtime/blueprint-chart/artifacts`，绝对路径、目录穿越和 symlink 路径会在启动前拒绝。
          </div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="从数据意图到可验证图表"
          emptyDescription="推荐合适的图表类型，载入官方示例，编辑 .bpc，再校验、检查、渲染并导出。"
          hideRaw={hideRaw}
        >
          {payload?.valid !== undefined ? (
            <div className={`blueprint-validation ${payload.valid ? "valid" : "invalid"}`} data-testid="blueprint-validation">
              <strong>{payload.valid ? "DSL 校验通过" : "DSL 需要修正"}</strong>
              <span>{Array.isArray(payload.errors) ? payload.errors.length : 0} 个错误 · {Array.isArray(payload.warnings) ? payload.warnings.length : 0} 个警告</span>
            </div>
          ) : null}

          {recommendations.length > 0 ? (
            <div className="blueprint-card-grid" data-testid="blueprint-recommendations">
              {recommendations.map((item, index) => (
                <article className="blueprint-reference-card" key={`${String(item.chartType)}-${index}`}>
                  <span>{String(item.fitness ?? `建议 ${index + 1}`)}</span>
                  <strong>{String(item.label ?? item.chartType)}</strong>
                  <p>{String(item.reason ?? "适合当前数据结构")}</p>
                  <button type="button" className="secondary-button" data-testid={index === 0 ? "blueprint-use-recommendation" : undefined} onClick={() => loadExample({ chartType: String(item.chartType) })}>载入官方示例</button>
                </article>
              ))}
            </div>
          ) : null}

          {lastTool === "render" && (imageSource || svgSource || html) ? (
            <div className="blueprint-preview" data-testid="blueprint-preview">
              <div className="mermaid-preview-header">
                <div><strong>{String(payload?.mimeType ?? "图表渲染结果")}</strong><span>{String(frame?.chartType ?? chartType)} · {width} × {height}</span></div>
                {imageSource ? <a className="secondary-button" href={imageSource} download="blueprint-chart.png"><Download size={12} />下载 PNG</a> : null}
                {svgSource ? <a className="secondary-button" href={svgSource} download="blueprint-chart.svg"><Download size={12} />下载 SVG</a> : null}
              </div>
              <div className="blueprint-canvas">
                {imageSource ? <Image data-testid="blueprint-image" src={imageSource} alt="Blueprint Chart PNG 预览" width={1600} height={1600} unoptimized /> : null}
                {svgSource ? <Image data-testid="blueprint-svg" src={svgSource} alt="Blueprint Chart SVG 预览" width={1600} height={1600} unoptimized /> : null}
                {html ? <iframe data-testid="blueprint-html" title="Blueprint Chart HTML 预览" sandbox="" srcDoc={html} /> : null}
              </div>
            </div>
          ) : null}

          {typeof payload?.savedTo === "string" ? (
            <div className="artifact-summary" data-testid="blueprint-artifact"><strong>图表已写入产物沙箱</strong><span>{payload.savedTo}</span><small>{String(payload.mimeType ?? format)}</small></div>
          ) : null}

          {typeof payload?.copyUrl === "string" && typeof payload?.embedUrl === "string" ? (
            <div className="blueprint-export" data-testid="blueprint-export-result">
              {imageSource ? <Image data-testid="blueprint-export-image" src={imageSource} alt="Blueprint Chart 导出预览" width={800} height={500} unoptimized /> : null}
              <div className="blueprint-export-links">
                <a className="secondary-button" data-testid="blueprint-copy-link" href={payload.copyUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} />打开可编辑副本</a>
                <a className="secondary-button" data-testid="blueprint-embed-link" href={payload.embedUrl} target="_blank" rel="noreferrer"><ImageIcon size={12} />打开只读嵌入</a>
              </div>
              <p>链接包含 URL-safe base64 源码，不会在生成链接时上传图表数据。</p>
            </div>
          ) : null}

          {chartTypes.length > 0 ? (
            <div className="blueprint-list" data-testid="blueprint-chart-types">
              {chartTypes.map((item) => <button type="button" key={String(item.name)} onClick={() => setChartType(String(item.name))}><strong>{String(item.name)}</strong><span>{String(item.summary ?? "")}</span></button>)}
            </div>
          ) : null}

          {examples.length > 0 ? (
            <div className="blueprint-list" data-testid="blueprint-example-results">
              {examples.map((item) => <button type="button" key={String(item.id)} onClick={() => loadExample({ name: String(item.id) })}><strong>{String(item.title)}</strong><span>{String(item.chartType)} · {String(item.description)}</span></button>)}
            </div>
          ) : null}

          {palettes.length > 0 ? (
            <div className="blueprint-palette-grid" data-testid="blueprint-palettes">
              {palettes.map((item) => (
                <button type="button" key={String(item.name)} onClick={() => setSource((current) => insertPalette(current, String(item.name)))}>
                  <span className="blueprint-swatches">{Array.isArray(item.colors) ? item.colors.slice(0, 6).map((color) => <i key={String(color)} style={{ background: String(color) }} />) : null}</span>
                  <strong>{String(item.label ?? item.name)}</strong>
                </button>
              ))}
            </div>
          ) : null}

          {lastTool === "get_grammar" && typeof payload?.text === "string" ? <pre className="blueprint-doc" data-testid="blueprint-grammar-output">{payload.text}</pre> : null}
        </ResultView>
      </div>
    </div>
  );
}

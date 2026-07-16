"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Download,
  FilePlus2,
  FileSearch2,
  Files,
  Highlighter,
  ListTree,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Save,
  Scissors,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke, type InvocationResult } from "./use-plugin-invoke";

type Tab = "read" | "process" | "create";
type PdfFile = { path: string; name: string; bytes: number; modifiedAt: string };
type ReaderTool = "read_pdf" | "extract_text" | "convert_pdf" | "analyze_pdf" | "extract_entities";
type ProcessTool = "manipulate_pdf" | "annotate_pdf" | "manage_forms" | "secure_pdf";

const tabLabels: Record<Tab, string> = {
  read: "阅读与分析",
  process: "处理与安全",
  create: "创建 PDF",
};

function payloadOf(result: InvocationResult | null): Record<string, unknown> | null {
  return resultJson(result);
}

function parseIndices(value: string): number[] {
  return value.split(/[\s,]+/).filter(Boolean).map((item) => Number(item));
}

export function OxidizePdfWorkspace() {
  const runtime = usePluginInvoke("oxidize-pdf-workbench");
  const [tab, setTab] = useState<Tab>("read");
  const [lastTool, setLastTool] = useState("");
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [filePending, setFilePending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [readerTool, setReaderTool] = useState<ReaderTool>("read_pdf");
  const [password, setPassword] = useState("");
  const [includePages, setIncludePages] = useState(true);
  const [page, setPage] = useState("");
  const [convertFormat, setConvertFormat] = useState("markdown");
  const [maxTokens, setMaxTokens] = useState(256);
  const [overlap, setOverlap] = useState(50);
  const [analysisCheck, setAnalysisCheck] = useState("validate");
  const [comparePath, setComparePath] = useState("");
  const [complianceLevel, setComplianceLevel] = useState("a1b");

  const [processTool, setProcessTool] = useState<ProcessTool>("manipulate_pdf");
  const [manipulation, setManipulation] = useState("rotate");
  const [outputPath, setOutputPath] = useState("outputs/result.pdf");
  const [mergePaths, setMergePaths] = useState("");
  const [overlayPath, setOverlayPath] = useState("");
  const [degrees, setDegrees] = useState(90);
  const [pageIndices, setPageIndices] = useState("0");
  const [annotationType, setAnnotationType] = useState("highlight");
  const [annotationPage, setAnnotationPage] = useState(0);
  const [annotationX, setAnnotationX] = useState(72);
  const [annotationY, setAnnotationY] = useState(680);
  const [annotationText, setAnnotationText] = useState("Agent-OPT review note");
  const [annotationWidth, setAnnotationWidth] = useState(220);
  const [annotationHeight, setAnnotationHeight] = useState(28);
  const [formOperation, setFormOperation] = useState("create");
  const [formFields, setFormFields] = useState('[{"name":"full_name","type":"text","x":72,"y":700,"width":220,"height":24,"default_value":"Ada"}]');
  const [formValues, setFormValues] = useState('{"full_name":"Ada"}');
  const [secureOperation, setSecureOperation] = useState("permissions");
  const [userPassword, setUserPassword] = useState("viewer-pass");
  const [ownerPassword, setOwnerPassword] = useState("owner-pass");

  const [title, setTitle] = useState("Agent-OPT PDF");
  const [author, setAuthor] = useState("Agent-OPT");
  const [pageSize, setPageSize] = useState("a4");
  const [sessionId, setSessionId] = useState("");
  const [contentType, setContentType] = useState("text");
  const [content, setContent] = useState("由 oxidize-pdf 创建并真实验证。");
  const [textX, setTextX] = useState(72);
  const [textY, setTextY] = useState(760);
  const [font, setFont] = useState("Helvetica");
  const [fontSize, setFontSize] = useState(16);
  const [createdOutput, setCreatedOutput] = useState("created/agent-opt.pdf");

  const payload = payloadOf(runtime.result);
  const previewUrl = selectedPath
    ? `/api/plugins/oxidize-pdf-workbench/files?path=${encodeURIComponent(selectedPath)}`
    : null;

  async function refreshFiles(preferPath?: string) {
    const response = await fetch("/api/plugins/oxidize-pdf-workbench/files", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "PDF 文件列表读取失败。");
    const nextFiles = Array.isArray(body.files) ? body.files as PdfFile[] : [];
    setFiles(nextFiles);
    const preferred = preferPath && nextFiles.some((file) => file.path === preferPath) ? preferPath : "";
    setSelectedPath((current) => preferred || (nextFiles.some((file) => file.path === current) ? current : nextFiles[0]?.path ?? ""));
  }

  useEffect(() => {
    let active = true;
    fetch("/api/plugins/oxidize-pdf-workbench/files", { cache: "no-store" })
      .then((response) => response.json().then((body) => ({ response, body })))
      .then(({ response, body }) => {
        if (!active || !response.ok) return;
        const nextFiles = Array.isArray(body.files) ? body.files as PdfFile[] : [];
        setFiles(nextFiles);
        setSelectedPath((current) => current || nextFiles[0]?.path || "");
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function upload(file: File) {
    setFilePending(true);
    setLocalError(null);
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("上传 PDF 不能超过 8 MiB。");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("浏览器读取 PDF 失败。"));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/plugins/oxidize-pdf-workbench/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, data }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "PDF 上传失败。");
      await refreshFiles(String(body.file.path));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "PDF 上传失败。");
    } finally {
      setFilePending(false);
    }
  }

  async function invoke(tool: string, args: Record<string, unknown>, generatedPath?: string) {
    setLastTool(tool);
    setLocalError(null);
    const result = await runtime.invoke(tool, args).catch(() => undefined);
    if (result && !result.isError && generatedPath) await refreshFiles(generatedPath).catch(() => undefined);
    return result;
  }

  async function runReader() {
    if (!selectedPath) return setLocalError("请先上传或选择一个 PDF。");
    if (readerTool === "read_pdf") {
      await invoke(readerTool, { path: selectedPath, password: password || null, include_page_details: includePages });
    } else if (readerTool === "extract_text") {
      await invoke(readerTool, { path: selectedPath, page: page === "" ? null : Number(page), password: password || null });
    } else if (readerTool === "convert_pdf") {
      await invoke(readerTool, { path: selectedPath, format: convertFormat, password: password || null, max_tokens: maxTokens, overlap });
    } else if (readerTool === "analyze_pdf") {
      await invoke(readerTool, { path: selectedPath, check: analysisCheck, compare_path: comparePath || null, compliance_level: complianceLevel });
    } else {
      await invoke(readerTool, { path: selectedPath });
    }
  }

  async function runProcess() {
    if (processTool !== "manage_forms" || formOperation !== "create") {
      if (!selectedPath) return setLocalError("请先上传或选择一个 PDF。");
    }
    try {
      if (processTool === "manipulate_pdf") {
        const common = { operation: manipulation };
        if (manipulation === "split") {
          await invoke(processTool, { ...common, input_path: selectedPath, output_path: outputPath });
        } else if (manipulation === "merge") {
          await invoke(processTool, { ...common, input_paths: mergePaths.split(/\r?\n/).map((item) => item.trim()).filter(Boolean), output_path: outputPath }, outputPath);
        } else if (manipulation === "rotate") {
          await invoke(processTool, { ...common, input_path: selectedPath, output_path: outputPath, degrees }, outputPath);
        } else if (manipulation === "extract_pages") {
          await invoke(processTool, { ...common, input_path: selectedPath, output_path: outputPath, page_indices: parseIndices(pageIndices) }, outputPath);
        } else if (manipulation === "overlay") {
          await invoke(processTool, { ...common, input_path: selectedPath, overlay_path: overlayPath, output_path: outputPath }, outputPath);
        } else {
          await invoke(processTool, { ...common, input_path: selectedPath, output_path: outputPath }, outputPath);
        }
      } else if (processTool === "annotate_pdf") {
        await invoke(processTool, {
          input_path: selectedPath,
          output_path: outputPath,
          annotation_type: annotationType,
          page: annotationPage,
          x: annotationX,
          y: annotationY,
          ...(annotationType === "text" ? { contents: annotationText } : { width: annotationWidth, height: annotationHeight }),
        }, outputPath);
      } else if (processTool === "manage_forms") {
        if (formOperation === "create") {
          await invoke(processTool, { operation: "create", output_path: outputPath, fields: JSON.parse(formFields) }, outputPath);
        } else if (formOperation === "fill") {
          await invoke(processTool, { operation: "fill", input_path: selectedPath, output_path: outputPath, values: JSON.parse(formValues) }, outputPath);
        } else if (formOperation === "validate") {
          await invoke(processTool, { operation: "validate", input_path: selectedPath, values: JSON.parse(formValues) });
        } else {
          await invoke(processTool, { operation: "read", input_path: selectedPath });
        }
      } else if (secureOperation === "encrypt") {
        await invoke(processTool, { operation: "encrypt", input_path: selectedPath, output_path: outputPath, user_password: userPassword, owner_password: ownerPassword }, outputPath);
      } else if (secureOperation === "permissions") {
        await invoke(processTool, { operation: "permissions", input_path: selectedPath, password: password || null });
      } else {
        await invoke(processTool, { operation: "verify_signatures", input_path: selectedPath });
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "处理参数格式无效。");
    }
  }

  async function createSession() {
    const result = await invoke("create_pdf", { title, author: author || null, page_size: pageSize });
    const next = payloadOf(result ?? null);
    if (result && !result.isError && typeof next?.session_id === "string") setSessionId(next.session_id);
  }

  async function addContent() {
    if (!sessionId) return setLocalError("请先创建 PDF 会话。");
    if (contentType === "new_page") {
      await invoke("add_pdf_content", { session_id: sessionId, content_type: "new_page" });
    } else {
      await invoke("add_pdf_content", { session_id: sessionId, content_type: "text", content, x: textX, y: textY, font, font_size: fontSize });
    }
  }

  async function saveSession() {
    if (!sessionId) return setLocalError("请先创建 PDF 会话。");
    const result = await invoke("save_pdf", { session_id: sessionId, output_path: createdOutput }, createdOutput);
    if (result && !result.isError) setSessionId("");
  }

  const displayText = typeof payload?.text === "string"
    ? payload.text
    : typeof payload?.content === "string"
      ? payload.content
      : null;

  return (
    <div className="workspace-card oxidize-workspace">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Files size={14} />oxidize-pdf 文档工作台</div>
        <span className="badge medium">Rust 内核 · 本地文件沙箱 · 持久创建会话</span>
      </div>
      <div className="workspace-body oxidize-workspace-body">
        <div className="control-panel">
          <div className="workspace-tabs oxidize-tabs">
            {(Object.keys(tabLabels) as Tab[]).map((item) => (
              <button type="button" data-testid={`oxidize-tab-${item}`} className={`workspace-tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)} key={item}>{tabLabels[item]}</button>
            ))}
          </div>

          <section className="oxidize-file-box">
            <div className="field-label"><span>PDF 工作区</span><button type="button" className="icon-button" aria-label="刷新 PDF 文件" onClick={() => refreshFiles().catch(() => undefined)}><RefreshCw size={12} /></button></div>
            <label className="oxidize-upload">
              {filePending ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}
              <span>{filePending ? "上传中…" : "上传 PDF（最大 8 MiB）"}</span>
              <input data-testid="oxidize-upload" type="file" accept="application/pdf,.pdf" disabled={filePending} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
            </label>
            <select data-testid="oxidize-file-select" className="field-select" value={selectedPath} onChange={(event) => setSelectedPath(event.target.value)}>
              <option value="">选择 PDF</option>
              {files.map((file) => <option key={file.path} value={file.path}>{file.path} · {Math.ceil(file.bytes / 1024)} KiB</option>)}
            </select>
          </section>

          {tab === "read" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="oxidize-reader-tool">阅读任务</label>
                <select id="oxidize-reader-tool" data-testid="oxidize-reader-tool" className="field-select" value={readerTool} onChange={(event) => setReaderTool(event.target.value as ReaderTool)}>
                  <option value="read_pdf">元数据与页面</option>
                  <option value="extract_text">提取纯文本</option>
                  <option value="convert_pdf">Markdown / RAG 分块</option>
                  <option value="analyze_pdf">结构、损坏与 PDF/A</option>
                  <option value="extract_entities">文本坐标与字体</option>
                </select>
              </div>
              {(readerTool === "read_pdf" || readerTool === "extract_text" || readerTool === "convert_pdf") ? (
                <div className="field-group"><label className="field-label" htmlFor="oxidize-password">文档密码 <span>可选</span></label><input id="oxidize-password" className="field-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
              ) : null}
              {readerTool === "read_pdf" ? <label className="checkbox-row"><input type="checkbox" checked={includePages} onChange={(event) => setIncludePages(event.target.checked)} />包含页面尺寸和旋转</label> : null}
              {readerTool === "extract_text" ? <div className="field-group"><label className="field-label" htmlFor="oxidize-page">页码 <span>0 起；留空为全部</span></label><input id="oxidize-page" className="field-input" type="number" min={0} value={page} onChange={(event) => setPage(event.target.value)} /></div> : null}
              {readerTool === "convert_pdf" ? (
                <>
                  <div className="field-group"><label className="field-label" htmlFor="oxidize-format">输出表示</label><select id="oxidize-format" data-testid="oxidize-format" className="field-select" value={convertFormat} onChange={(event) => setConvertFormat(event.target.value)}><option value="markdown">Markdown</option><option value="chunks">固定分块</option><option value="rag">RAG 语义分块</option></select></div>
                  {convertFormat === "chunks" ? <div className="field-row"><div className="field-group"><label className="field-label" htmlFor="oxidize-max-tokens">目标 tokens</label><input id="oxidize-max-tokens" className="field-input" type="number" min={16} max={4096} value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} /></div><div className="field-group"><label className="field-label" htmlFor="oxidize-overlap">重叠</label><input id="oxidize-overlap" className="field-input" type="number" min={0} value={overlap} onChange={(event) => setOverlap(Number(event.target.value))} /></div></div> : null}
                </>
              ) : null}
              {readerTool === "analyze_pdf" ? (
                <>
                  <div className="field-group"><label className="field-label" htmlFor="oxidize-check">分析类型</label><select id="oxidize-check" className="field-select" value={analysisCheck} onChange={(event) => setAnalysisCheck(event.target.value)}><option value="validate">结构校验</option><option value="corruption">损坏检测</option><option value="compliance">PDF/A 合规</option><option value="compare">对比 PDF</option></select></div>
                  {analysisCheck === "compare" ? <div className="field-group"><label className="field-label" htmlFor="oxidize-compare">对比文件路径</label><input id="oxidize-compare" className="field-input" value={comparePath} onChange={(event) => setComparePath(event.target.value)} /></div> : null}
                  {analysisCheck === "compliance" ? <div className="field-group"><label className="field-label" htmlFor="oxidize-compliance">PDF/A 等级</label><select id="oxidize-compliance" className="field-select" value={complianceLevel} onChange={(event) => setComplianceLevel(event.target.value)}>{["a1a","a1b","a2a","a2b","a2u","a3a","a3b","a3u"].map((item) => <option key={item}>{item}</option>)}</select></div> : null}
                </>
              ) : null}
              <button className="primary-button" data-testid="oxidize-read-run" type="button" onClick={runReader} disabled={runtime.pending || !selectedPath}><FileSearch2 size={13} />{runtime.pending ? "处理中…" : "运行阅读任务"}</button>
            </>
          ) : null}

          {tab === "process" ? (
            <>
              <div className="field-group"><label className="field-label" htmlFor="oxidize-process-tool">处理能力</label><select id="oxidize-process-tool" data-testid="oxidize-process-tool" className="field-select" value={processTool} onChange={(event) => setProcessTool(event.target.value as ProcessTool)}><option value="manipulate_pdf">页面拆分、合并与变换</option><option value="annotate_pdf">注释与高亮</option><option value="manage_forms">PDF 表单</option><option value="secure_pdf">加密、权限与签名</option></select></div>
              {processTool === "manipulate_pdf" ? (
                <>
                  <div className="field-group"><label className="field-label" htmlFor="oxidize-manipulation">页面操作</label><select id="oxidize-manipulation" data-testid="oxidize-manipulation" className="field-select" value={manipulation} onChange={(event) => { const value = event.target.value; setManipulation(value); setOutputPath(value === "split" ? "outputs/split" : `outputs/${value}.pdf`); }}><option value="split">逐页拆分</option><option value="merge">合并多个 PDF</option><option value="rotate">旋转</option><option value="extract_pages">抽取页面</option><option value="reverse">倒序页面</option><option value="overlay">叠加 PDF</option></select></div>
                  {manipulation === "merge" ? <div className="field-group"><label className="field-label" htmlFor="oxidize-merge">输入路径 <span>每行一个，至少两个</span></label><textarea id="oxidize-merge" className="field-textarea code" value={mergePaths} onChange={(event) => setMergePaths(event.target.value)} /></div> : null}
                  {manipulation === "overlay" ? <div className="field-group"><label className="field-label" htmlFor="oxidize-overlay">叠加文件路径</label><input id="oxidize-overlay" className="field-input" value={overlayPath} onChange={(event) => setOverlayPath(event.target.value)} /></div> : null}
                  {manipulation === "rotate" ? <div className="field-group"><label className="field-label" htmlFor="oxidize-degrees">旋转角度</label><select id="oxidize-degrees" className="field-select" value={degrees} onChange={(event) => setDegrees(Number(event.target.value))}><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></div> : null}
                  {manipulation === "extract_pages" ? <div className="field-group"><label className="field-label" htmlFor="oxidize-indices">页面索引 <span>逗号分隔，0 起</span></label><input id="oxidize-indices" className="field-input" value={pageIndices} onChange={(event) => setPageIndices(event.target.value)} /></div> : null}
                </>
              ) : null}
              {processTool === "annotate_pdf" ? (
                <>
                  <div className="field-group"><label className="field-label" htmlFor="oxidize-annotation">标注类型</label><select id="oxidize-annotation" className="field-select" value={annotationType} onChange={(event) => setAnnotationType(event.target.value)}><option value="highlight">高亮矩形</option><option value="text">便签注释</option></select></div>
                  <div className="field-row"><div className="field-group"><label className="field-label" htmlFor="oxidize-annotation-page">页码</label><input id="oxidize-annotation-page" className="field-input" type="number" min={0} value={annotationPage} onChange={(event) => setAnnotationPage(Number(event.target.value))} /></div><div className="field-group"><label className="field-label" htmlFor="oxidize-annotation-x">X / Y</label><div className="inline-inputs"><input id="oxidize-annotation-x" className="field-input" type="number" value={annotationX} onChange={(event) => setAnnotationX(Number(event.target.value))} /><input className="field-input" type="number" value={annotationY} onChange={(event) => setAnnotationY(Number(event.target.value))} /></div></div></div>
                  {annotationType === "text" ? <div className="field-group"><label className="field-label" htmlFor="oxidize-note">便签内容</label><textarea id="oxidize-note" className="field-textarea" value={annotationText} onChange={(event) => setAnnotationText(event.target.value)} /></div> : <div className="field-row"><div className="field-group"><label className="field-label" htmlFor="oxidize-highlight-width">高亮宽度</label><input id="oxidize-highlight-width" className="field-input" type="number" value={annotationWidth} onChange={(event) => setAnnotationWidth(Number(event.target.value))} /></div><div className="field-group"><label className="field-label" htmlFor="oxidize-highlight-height">高亮高度</label><input id="oxidize-highlight-height" className="field-input" type="number" value={annotationHeight} onChange={(event) => setAnnotationHeight(Number(event.target.value))} /></div></div>}
                </>
              ) : null}
              {processTool === "manage_forms" ? (
                <>
                  <div className="field-group"><label className="field-label" htmlFor="oxidize-form-operation">表单操作</label><select id="oxidize-form-operation" className="field-select" value={formOperation} onChange={(event) => setFormOperation(event.target.value)}><option value="create">创建字段</option><option value="fill">填写</option><option value="read">读取</option><option value="validate">校验值</option></select></div>
                  {formOperation === "create" ? <div className="field-group"><label className="field-label" htmlFor="oxidize-fields">字段定义 JSON</label><textarea id="oxidize-fields" className="field-textarea code" value={formFields} onChange={(event) => setFormFields(event.target.value)} /></div> : null}
                  {(formOperation === "fill" || formOperation === "validate") ? <div className="field-group"><label className="field-label" htmlFor="oxidize-values">字段值 JSON</label><textarea id="oxidize-values" className="field-textarea code" value={formValues} onChange={(event) => setFormValues(event.target.value)} /></div> : null}
                </>
              ) : null}
              {processTool === "secure_pdf" ? (
                <>
                  <div className="field-group"><label className="field-label" htmlFor="oxidize-secure-operation">安全操作</label><select id="oxidize-secure-operation" data-testid="oxidize-secure-operation" className="field-select" value={secureOperation} onChange={(event) => setSecureOperation(event.target.value)}><option value="permissions">检查权限</option><option value="verify_signatures">验证签名</option><option value="encrypt">加密副本</option></select></div>
                  {secureOperation === "encrypt" ? <div className="field-row"><div className="field-group"><label className="field-label" htmlFor="oxidize-user-password">打开密码</label><input id="oxidize-user-password" className="field-input" type="password" value={userPassword} onChange={(event) => setUserPassword(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="oxidize-owner-password">所有者密码</label><input id="oxidize-owner-password" className="field-input" type="password" value={ownerPassword} onChange={(event) => setOwnerPassword(event.target.value)} /></div></div> : null}
                </>
              ) : null}
              {((processTool === "manage_forms" && ["read", "validate"].includes(formOperation)) || (processTool === "secure_pdf" && secureOperation !== "encrypt")) ? null : <div className="field-group"><label className="field-label" htmlFor="oxidize-output">输出路径</label><input id="oxidize-output" data-testid="oxidize-output" className="field-input" value={outputPath} onChange={(event) => setOutputPath(event.target.value)} /></div>}
              <button className="primary-button" data-testid="oxidize-process-run" type="button" onClick={runProcess} disabled={runtime.pending}><Scissors size={13} />{runtime.pending ? "处理中…" : "运行 PDF 处理"}</button>
            </>
          ) : null}

          {tab === "create" ? (
            <>
              <div className="field-group"><label className="field-label" htmlFor="oxidize-title">文档标题</label><input id="oxidize-title" data-testid="oxidize-title" className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
              <div className="field-row"><div className="field-group"><label className="field-label" htmlFor="oxidize-author">作者</label><input id="oxidize-author" className="field-input" value={author} onChange={(event) => setAuthor(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="oxidize-page-size">页面尺寸</label><select id="oxidize-page-size" className="field-select" value={pageSize} onChange={(event) => setPageSize(event.target.value)}>{["a4","a4_landscape","letter","letter_landscape","legal","legal_landscape"].map((item) => <option key={item}>{item}</option>)}</select></div></div>
              <button className="secondary-button oxidize-session-button" data-testid="oxidize-create-session" type="button" onClick={createSession} disabled={runtime.pending}><FilePlus2 size={13} />{sessionId ? `会话 ${sessionId.slice(0, 8)}…` : "创建持久 PDF 会话"}</button>
              <div className="field-group"><label className="field-label" htmlFor="oxidize-content-type">添加内容</label><select id="oxidize-content-type" data-testid="oxidize-content-type" className="field-select" value={contentType} onChange={(event) => setContentType(event.target.value)}><option value="text">当前页文本</option><option value="new_page">新建空白页</option></select></div>
              {contentType === "text" ? (
                <>
                  <div className="field-group"><label className="field-label" htmlFor="oxidize-content">文本内容</label><textarea id="oxidize-content" data-testid="oxidize-content" className="field-textarea" value={content} onChange={(event) => setContent(event.target.value)} /></div>
                  <div className="field-row"><div className="field-group"><label className="field-label" htmlFor="oxidize-text-x">X / Y</label><div className="inline-inputs"><input id="oxidize-text-x" className="field-input" type="number" value={textX} onChange={(event) => setTextX(Number(event.target.value))} /><input className="field-input" type="number" value={textY} onChange={(event) => setTextY(Number(event.target.value))} /></div></div><div className="field-group"><label className="field-label" htmlFor="oxidize-font-size">字体 / 大小</label><div className="inline-inputs"><input id="oxidize-font-size" className="field-input" value={font} onChange={(event) => setFont(event.target.value)} /><input className="field-input" type="number" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></div></div></div>
                </>
              ) : null}
              <button className="secondary-button oxidize-session-button" data-testid="oxidize-add-content" type="button" onClick={addContent} disabled={runtime.pending || !sessionId}><Highlighter size={13} />写入会话</button>
              <div className="field-group"><label className="field-label" htmlFor="oxidize-created-output">保存路径</label><input id="oxidize-created-output" data-testid="oxidize-created-output" className="field-input" value={createdOutput} onChange={(event) => setCreatedOutput(event.target.value)} /></div>
              <button className="primary-button" data-testid="oxidize-save" type="button" onClick={saveSession} disabled={runtime.pending || !sessionId}><Save size={13} />保存并关闭会话</button>
            </>
          ) : null}

          <div className="privacy-notice"><ShieldCheck size={14} />仅允许访问 `var/runtime/oxidize-pdf/workspace`。上传限制 8 MiB；运行时限制 16 MiB、500 页、2 MiB 响应、4 个会话和 5 分钟 TTL；外部路径、额外允许目录、命令和网络均不向客户端开放。</div>
        </div>

        <ResultView result={runtime.result} error={localError ?? runtime.error} pending={runtime.pending || filePending} activity={runtime.activity} emptyTitle="上传、读取、处理或创建 PDF" emptyDescription="12 个上游工具覆盖 PDF 的完整本地工作流；右侧会显示真实文件预览和结构化结果。">
          {previewUrl ? (
            <div className="oxidize-preview" data-testid="oxidize-preview">
              <div className="mermaid-preview-header"><div><strong>{selectedPath}</strong><span>{files.find((file) => file.path === selectedPath)?.bytes.toLocaleString("zh-CN") ?? "—"} 字节</span></div><a className="secondary-button" data-testid="oxidize-download" href={previewUrl} download><Download size={12} />下载 PDF</a></div>
              <iframe data-testid="oxidize-frame" title="oxidize-pdf 预览" src={previewUrl} />
            </div>
          ) : null}
          {displayText ? <pre className="oxidize-text-result" data-testid="oxidize-text-result">{displayText}</pre> : null}
          {Array.isArray(payload?.chunks) ? <div className="oxidize-chunks" data-testid="oxidize-chunks">{(payload.chunks as Array<Record<string, unknown>>).map((chunk, index) => <article key={String(chunk.id ?? index)}><strong>{String(chunk.id ?? `chunk_${index}`)}</strong><span>pages {JSON.stringify(chunk.page_numbers ?? [])}</span><p>{String(chunk.content ?? "")}</p></article>)}</div> : null}
          {Array.isArray(payload?.entities) ? <div className="oxidize-entities" data-testid="oxidize-entities">{(payload.entities as Array<Record<string, unknown>>).map((entity, index) => <div key={`${String(entity.page)}-${index}`}><strong>{String(entity.text)}</strong><span>page {String(entity.page)} · ({String(entity.x)}, {String(entity.y)}) · {String(entity.font_name)} {String(entity.font_size)}</span></div>)}</div> : null}
          {lastTool === "analyze_pdf" && payload ? <div className="oxidize-analysis" data-testid="oxidize-analysis"><ListTree size={16} /><strong>{payload.valid === true || payload.is_valid === true ? "检查通过" : payload.corrupted === false ? "未检测到损坏" : "分析已完成"}</strong><span>{JSON.stringify(payload)}</span></div> : null}
          {lastTool === "secure_pdf" && payload ? <div className="oxidize-analysis" data-testid="oxidize-security-result"><LockKeyhole size={16} /><strong>PDF 安全结果</strong><span>{JSON.stringify(payload)}</span></div> : null}
          {lastTool === "read_pdf" && payload ? <div className="oxidize-analysis" data-testid="oxidize-metadata"><BookOpen size={16} /><strong>{String(payload.title ?? selectedPath)}</strong><span>{String(payload.page_count ?? "?")} 页 · PDF {String(payload.version ?? "?")} · encrypted {String(payload.is_encrypted ?? false)}</span></div> : null}
        </ResultView>
      </div>
    </div>
  );
}

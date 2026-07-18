"use client";

import { useMemo, useRef, useState } from "react";
import { Copy, Download, FileText, FileUp, Play, ShieldCheck, Sparkles } from "lucide-react";
import { ResultView } from "./result-view";
import { resultText, usePluginInvoke } from "./use-plugin-invoke";

const uploadLimit = 8 * 1024 * 1024;
const accepted = ".pdf,.docx,.pptx,.xlsx,.html,.htm,.csv,.json,.md,.txt";

type UploadedFile = {
  path: string;
  name: string;
  bytes: number;
  extension: string;
};

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取所选文件。"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function readableBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function MarkitdownWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const runtime = usePluginInvoke("markitdown-document-studio");
  const markdown = useMemo(() => resultText(runtime.result), [runtime.result]);

  function select(next: File | null) {
    setUploadError(null);
    setUploaded(null);
    runtime.setResult(null);
    if (next && next.size > uploadLimit) {
      setFile(null);
      setUploadError("文件超过 8 MiB 上传上限。");
      return;
    }
    setFile(next);
  }

  function loadExample() {
    select(new File([
      "<!doctype html><html><head><title>Agent-OPT 示例</title></head><body><main><h1>能力验收清单</h1><p>每个集成都应保留来源、中文适配和真实测试证据。</p><ul><li>核心路径</li><li>失败路径</li><li>Web E2E</li></ul></main></body></html>",
    ], "agent-opt-checklist.html", { type: "text/html" }));
  }

  async function run() {
    if (!file) {
      setUploadError("请先选择一个受支持的文档。可直接载入内置 HTML 示例。 ");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const response = await fetch("/api/plugins/markitdown-document-studio/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, data: await fileDataUrl(file) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "文档上传失败。");
      const stored = payload.file as UploadedFile;
      setUploaded(stored);
      await runtime.invoke("convert_to_markdown", { file: stored.path });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "文档转换失败。");
    } finally {
      setUploading(false);
    }
  }

  async function copyMarkdown() {
    if (markdown) await navigator.clipboard.writeText(markdown);
  }

  function downloadMarkdown() {
    if (!markdown) return;
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file?.name.replace(/\.[^.]+$/, "") || "converted"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const pending = uploading || runtime.pending;
  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><FileText size={14} />MarkItDown 文档工作室</div>
        <span className="badge low">本地受控转换</span>
      </div>
      <div className="workspace-body markitdown-layout">
        <div className="control-panel">
          <div className="field-group">
            <label className="field-label" htmlFor="markitdown-file">上传文档 <span>最大 8 MiB</span></label>
            <button
              type="button"
              className="markitdown-dropzone"
              data-testid="markitdown-dropzone"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                select(event.dataTransfer.files.item(0));
              }}
            >
              <FileUp size={24} />
              <strong>{file ? file.name : "选择文件或拖放到这里"}</strong>
              <span>{file ? `${readableBytes(file.size)} · ${file.type || "按扩展名识别"}` : "PDF / Office Open XML / HTML / CSV / JSON / Markdown / TXT"}</span>
            </button>
            <input
              ref={inputRef}
              id="markitdown-file"
              data-testid="markitdown-file"
              className="visually-hidden"
              type="file"
              accept={accepted}
              onChange={(event) => select(event.target.files?.item(0) ?? null)}
            />
          </div>

          <div className="workspace-actions">
            <button type="button" className="secondary-button" data-testid="markitdown-example" onClick={loadExample}>
              <Sparkles size={13} />载入 HTML 示例
            </button>
            <button type="button" className="primary-button" data-testid="markitdown-run" onClick={run} disabled={pending}>
              <Play size={13} />{pending ? "正在转换…" : "转换为 Markdown"}
            </button>
          </div>

          {uploaded ? (
            <div className="markitdown-file-facts" data-testid="markitdown-file-facts">
              <span>已隔离存储</span><strong>{uploaded.extension.toUpperCase()}</strong><span>{readableBytes(uploaded.bytes)}</span>
            </div>
          ) : null}

          <div className="sandbox-notice">
            <ShieldCheck size={14} />Web 端不接受任意 URI 或主机路径；上传文件会检查扩展名、签名、UTF-8 和 Office ZIP 解压边界，再以工作区内 file URI 交给固定版本的上游 MCP。转换结果属于不可信文档数据，不会作为 Agent 指令或 raw HTML 执行。
          </div>
        </div>

        <ResultView
          result={runtime.result}
          error={uploadError ?? runtime.error}
          pending={pending}
          activity={runtime.activity}
          emptyTitle="把常见文档变成可复制的 Markdown"
          emptyDescription="先上传文档，或载入内置 HTML 示例。转换过程不把文件发送到第三方服务。"
          hideRaw
        >
          {markdown ? (
            <div className="markitdown-result" data-testid="markitdown-result">
              <div className="markitdown-result-toolbar">
                <span><FileText size={13} />Markdown 源文</span>
                <div>
                  <button type="button" className="icon-button" data-testid="markitdown-copy" onClick={copyMarkdown} aria-label="复制 Markdown"><Copy size={13} /></button>
                  <button type="button" className="icon-button" data-testid="markitdown-download" onClick={downloadMarkdown} aria-label="下载 Markdown"><Download size={13} /></button>
                </div>
              </div>
              <pre className="result-output markitdown-output" data-testid="markitdown-output">{markdown}</pre>
            </div>
          ) : null}
        </ResultView>
      </div>
    </div>
  );
}

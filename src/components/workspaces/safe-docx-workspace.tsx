"use client";

import { useMemo, useRef, useState } from "react";
import {
  FilePenLine,
  FileSearch,
  FileText,
  FileUp,
  Play,
  Replace,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, resultText, usePluginInvoke } from "./use-plugin-invoke";

const uploadLimit = 8 * 1024 * 1024;

type Tab = "read" | "grep" | "replace" | "export";
type UploadedFile = {
  path: string;
  name: string;
  bytes: number;
  extension: string;
};

const tabs: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: "read", label: "读取结构", icon: FileText },
  { id: "grep", label: "检索段落", icon: Search },
  { id: "replace", label: "替换文本", icon: Replace },
  { id: "export", label: "导出 Markdown", icon: FilePenLine },
];

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

async function buildExampleDocx(): Promise<File> {
  const response = await fetch("/fixtures/safe-docx/service-agreement.docx");
  if (!response.ok) throw new Error("无法加载内置 DOCX 示例。");
  const blob = await response.blob();
  return new File([blob], "service-agreement.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export function SafeDocxWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const runtime = usePluginInvoke("safe-docx-studio");
  const [tab, setTab] = useState<Tab>("read");
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pattern, setPattern] = useState("Payment");
  const [paragraphId, setParagraphId] = useState("");
  const [oldString, setOldString] = useState("thirty days");
  const [newString, setNewString] = useState("fifteen days");
  const [lastTool, setLastTool] = useState("");
  const payload = resultJson(runtime.result);
  const rawText = useMemo(() => resultText(runtime.result), [runtime.result]);

  function select(next: File | null) {
    setUploadError(null);
    setUploaded(null);
    runtime.setResult(null);
    if (next && next.size > uploadLimit) {
      setFile(null);
      setUploadError("文件超过 8 MiB 上传上限。");
      return;
    }
    if (next && !/\.(docx|odt)$/i.test(next.name)) {
      setFile(null);
      setUploadError("仅支持 .docx 与 .odt。");
      return;
    }
    setFile(next);
  }

  async function ensureUploaded(): Promise<UploadedFile> {
    if (!file) throw new Error("请先选择或载入一个 DOCX 文档。");
    if (uploaded) return uploaded;
    setUploading(true);
    try {
      const response = await fetch("/api/plugins/safe-docx-studio/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, data: await fileDataUrl(file) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "文档上传失败。");
      const stored = body.file as UploadedFile;
      setUploaded(stored);
      return stored;
    } finally {
      setUploading(false);
    }
  }

  async function loadExample() {
    try {
      select(await buildExampleDocx());
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "无法生成示例 DOCX。");
    }
  }

  async function run() {
    setUploadError(null);
    try {
      const stored = await ensureUploaded();
      if (tab === "read") {
        setLastTool("read_file");
        const next = await runtime.invoke("read_file", {
          file: stored.path,
          format: "json",
          include_fingerprint: true,
          limit: 20,
        });
        const content =
          next.structuredContent && typeof next.structuredContent.content === "string"
            ? next.structuredContent.content
            : null;
        if (content) {
          try {
            const paragraphs = JSON.parse(content) as Array<Record<string, unknown>>;
            const payment = paragraphs.find(
              (item) => typeof item.text === "string" && String(item.text).includes("Payment"),
            );
            const first = payment ?? paragraphs.find((item) => typeof item.id === "string");
            if (first && typeof first.id === "string") setParagraphId(first.id);
          } catch {
            // leave paragraph id empty when content is not JSON paragraphs
          }
        }
      } else if (tab === "grep") {
        setLastTool("grep");
        await runtime.invoke("grep", {
          file: stored.path,
          pattern,
          max_results: 10,
          case_sensitive: false,
        });
      } else if (tab === "replace") {
        if (!paragraphId.trim()) {
          setUploadError("请先读取文档并填入目标段落 ID。");
          return;
        }
        setLastTool("replace_text");
        await runtime.invoke("replace_text", {
          file: stored.path,
          target_paragraph_id: paragraphId,
          old_string: oldString,
          new_string: newString,
        });
      } else {
        setLastTool("export");
        await runtime.invoke("export", {
          file: stored.path,
          format: "markdown",
        });
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "文档操作失败。");
    }
  }

  const pending = uploading || runtime.pending;
  const matches =
    payload && Array.isArray((payload as Record<string, unknown>).matches)
      ? ((payload as Record<string, unknown>).matches as Array<Record<string, unknown>>)
      : [];

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title">
          <FileSearch size={14} />
          Safe DOCX 编辑台
        </div>
        <span className="badge low">本地沙箱 · 无 Google Docs</span>
      </div>
      <div className="workspace-body markitdown-layout">
        <div className="control-panel">
          <div className="field-group">
            <label className="field-label" htmlFor="safe-docx-file">
              上传 DOCX / ODT <span>最大 8 MiB</span>
            </label>
            <button
              type="button"
              className="markitdown-dropzone"
              data-testid="safe-docx-dropzone"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                select(event.dataTransfer.files.item(0));
              }}
            >
              <FileUp size={24} />
              <strong>{file ? file.name : "选择文件或拖放到这里"}</strong>
              <span>{file ? `${readableBytes(file.size)} · ${file.type || "按扩展名识别"}` : "Word .docx / OpenDocument .odt"}</span>
            </button>
            <input
              ref={inputRef}
              id="safe-docx-file"
              data-testid="safe-docx-file"
              className="visually-hidden"
              type="file"
              accept=".docx,.odt"
              onChange={(event) => select(event.target.files?.item(0) ?? null)}
            />
          </div>

          <div className="tab-row" role="tablist" aria-label="Safe DOCX 工作流">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={tab === item.id ? "tab active" : "tab"}
                  data-testid={`safe-docx-tab-${item.id}`}
                  onClick={() => {
                    setTab(item.id);
                    setUploadError(null);
                    runtime.setResult(null);
                  }}
                >
                  <Icon size={13} />
                  {item.label}
                </button>
              );
            })}
          </div>

          {tab === "grep" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="safe-docx-pattern">
                检索模式
              </label>
              <input
                id="safe-docx-pattern"
                data-testid="safe-docx-pattern"
                className="text-input"
                value={pattern}
                onChange={(event) => setPattern(event.target.value)}
              />
            </div>
          ) : null}

          {tab === "replace" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="safe-docx-paragraph-id">
                  目标段落 ID
                </label>
                <input
                  id="safe-docx-paragraph-id"
                  data-testid="safe-docx-paragraph-id"
                  className="text-input"
                  value={paragraphId}
                  onChange={(event) => setParagraphId(event.target.value)}
                  placeholder="先读取文档以自动填入"
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="safe-docx-old">
                  原文本
                </label>
                <input
                  id="safe-docx-old"
                  data-testid="safe-docx-old"
                  className="text-input"
                  value={oldString}
                  onChange={(event) => setOldString(event.target.value)}
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="safe-docx-new">
                  新文本
                </label>
                <input
                  id="safe-docx-new"
                  data-testid="safe-docx-new"
                  className="text-input"
                  value={newString}
                  onChange={(event) => setNewString(event.target.value)}
                />
              </div>
            </>
          ) : null}

          <div className="workspace-actions">
            <button type="button" className="secondary-button" data-testid="safe-docx-example" onClick={loadExample}>
              <Sparkles size={13} />
              载入协议示例
            </button>
            <button type="button" className="primary-button" data-testid="safe-docx-run" onClick={run} disabled={pending}>
              {tab === "export" ? <Save size={13} /> : <Play size={13} />}
              {pending ? "处理中…" : "运行"}
            </button>
          </div>

          {uploaded ? (
            <div className="markitdown-file-facts" data-testid="safe-docx-file-facts">
              <span>已隔离存储</span>
              <strong>{uploaded.extension.toUpperCase()}</strong>
              <span>{readableBytes(uploaded.bytes)}</span>
            </div>
          ) : null}

          <div className="sandbox-notice">
            <ShieldCheck size={14} />
            Web 只开放读取、检索、段落替换、导出与会话状态工具。Google Docs、任意宿主路径、多文件批处理与跟踪修订对比不在此适配中暴露。文档内容视为不可信证据，不会作为 Agent 指令执行。
          </div>
        </div>

        <ResultView
          result={runtime.result}
          error={uploadError ?? runtime.error}
          pending={pending}
          activity={runtime.activity}
          emptyTitle="在沙箱中手术式编辑 Word 文档"
          emptyDescription="上传 DOCX，或载入内置服务协议示例。所有读写都限制在服务器上传/输出目录。"
          hideRaw={tab !== "read"}
        >
          {tab === "grep" && matches.length > 0 ? (
            <div className="result-cards" data-testid="safe-docx-grep-result">
              {matches.map((match, index) => (
                <article key={`${String(match.para_id)}-${index}`} className="result-card">
                  <strong>{String(match.header ?? match.match_text ?? "匹配")}</strong>
                  <p>{String(match.context ?? match.match_text ?? "")}</p>
                  <code>{String(match.para_id ?? "")}</code>
                </article>
              ))}
            </div>
          ) : null}
          {tab === "read" && rawText ? (
            <pre className="result-output" data-testid="safe-docx-read-result">
              {rawText.slice(0, 12_000)}
            </pre>
          ) : null}
          {tab === "replace" && payload ? (
            <pre className="result-output" data-testid="safe-docx-replace-result">
              {JSON.stringify(payload, null, 2).slice(0, 8_000)}
            </pre>
          ) : null}
          {tab === "export" && payload ? (
            <pre className="result-output" data-testid="safe-docx-export-result">
              {JSON.stringify(payload, null, 2).slice(0, 8_000)}
            </pre>
          ) : null}
          {lastTool ? <p className="muted">最近工具：{lastTool}</p> : null}
        </ResultView>
      </div>
    </div>
  );
}

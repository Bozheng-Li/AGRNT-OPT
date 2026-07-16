"use client";

import { useState } from "react";
import { FileSearch, FolderLock, Play, Save } from "lucide-react";
import { ResultView } from "./result-view";
import { usePluginInvoke } from "./use-plugin-invoke";

type Tab = "browse" | "read" | "write" | "search";

const tabLabels: Record<Tab, string> = {
  browse: "浏览",
  read: "读取",
  write: "写入",
  search: "搜索",
};

export function FilesystemWorkspace() {
  const [tab, setTab] = useState<Tab>("browse");
  const [filePath, setFilePath] = useState(".");
  const [content, setContent] = useState("欢迎使用 Agent-OPT 文件沙箱。\n");
  const [pattern, setPattern] = useState("**/*.txt");
  const runtime = usePluginInvoke("filesystem-workbench");

  async function run() {
    if (tab === "browse") await runtime.invoke("list_directory", { path: filePath || "." }).catch(() => undefined);
    if (tab === "read") await runtime.invoke("read_text_file", { path: filePath }).catch(() => undefined);
    if (tab === "write") {
      const normalized = filePath.replaceAll("\\", "/");
      const parent = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
      if (parent) {
        const created = await runtime.invoke("create_directory", { path: parent }).catch(() => null);
        if (!created || created.isError) return;
      }
      await runtime.invoke("write_file", { path: filePath, content }).catch(() => undefined);
    }
    if (tab === "search") await runtime.invoke("search_files", { path: filePath || ".", pattern, excludePatterns: [] }).catch(() => undefined);
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><FolderLock size={14} />专属文件沙箱</div>
        <span className="badge medium">沙箱写权限</span>
      </div>
      <div className="workspace-body">
        <div className="control-panel">
          <div className="workspace-tabs">
            {(Object.keys(tabLabels) as Tab[]).map((item) => (
              <button type="button" className={`workspace-tab ${tab === item ? "active" : ""}`} onClick={() => {
                setTab(item);
                if (filePath === "." && (item === "read" || item === "write")) setFilePath("notes/example.txt");
                if ((item === "browse" || item === "search") && filePath === "notes/example.txt") setFilePath(".");
              }} key={item}>{tabLabels[item]}</button>
            ))}
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="filesystem-path">沙箱相对路径 <span>禁止绝对路径</span></label>
            <input
              id="filesystem-path"
              data-testid="filesystem-path"
              className="field-input"
              value={filePath}
              onChange={(event) => setFilePath(event.target.value)}
              placeholder={tab === "browse" || tab === "search" ? "." : "notes/example.txt"}
            />
          </div>

          {tab === "write" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="filesystem-content">文件内容 <span>最大 200 KB</span></label>
              <textarea id="filesystem-content" data-testid="filesystem-content" className="field-textarea code" value={content} onChange={(event) => setContent(event.target.value)} />
            </div>
          ) : null}

          {tab === "search" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="filesystem-pattern">文件模式 <span>Glob</span></label>
              <input id="filesystem-pattern" data-testid="filesystem-pattern" className="field-input" value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="**/*.md" />
            </div>
          ) : null}

          <button className="primary-button" data-testid="filesystem-run" type="button" onClick={run} disabled={runtime.pending}>
            {tab === "write" ? <Save size={13} /> : tab === "search" ? <FileSearch size={13} /> : <Play size={13} />}
            {runtime.pending ? "运行中…" : `${tabLabels[tab]}执行`}
          </button>

          <div className="sandbox-notice"><FolderLock size={14} />网页输入会先经过相对路径和越界检查，上游进程也只获得一个专属允许目录。</div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="等待文件操作"
          emptyDescription="选择浏览、读取、写入或搜索。所有操作都限制在 Agent-OPT 的插件沙箱中。"
        />
      </div>
    </div>
  );
}

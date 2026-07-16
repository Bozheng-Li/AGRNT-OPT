"use client";

import { useState } from "react";
import { FileSearch2, GlobeLock, Play } from "lucide-react";
import { ResultView } from "./result-view";
import { usePluginInvoke } from "./use-plugin-invoke";

export function WebFetchWorkspace() {
  const [url, setUrl] = useState("https://modelcontextprotocol.io/registry/about");
  const [maxLength, setMaxLength] = useState(12_000);
  const [startIndex, setStartIndex] = useState(0);
  const [raw, setRaw] = useState(false);
  const runtime = usePluginInvoke("web-content-reader");

  async function run() {
    await runtime.invoke("fetch", {
      url,
      max_length: maxLength,
      start_index: startIndex,
      raw,
    }).catch(() => undefined);
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><FileSearch2 size={14} />网页正文读取器</div>
        <span className="badge medium">受限网络访问</span>
      </div>
      <div className="workspace-body">
        <div className="control-panel">
          <div className="field-group">
            <label className="field-label" htmlFor="fetch-url">公开网页 URL <span>HTTP / HTTPS</span></label>
            <input id="fetch-url" data-testid="fetch-url" type="url" className="field-input" value={url} onChange={(event) => setUrl(event.target.value)} />
          </div>
          <div className="field-row">
            <div className="field-group"><label className="field-label" htmlFor="fetch-max">最大字符</label><input id="fetch-max" data-testid="fetch-max" type="number" min={1} max={100000} className="field-input" value={maxLength} onChange={(event) => setMaxLength(Number(event.target.value))} /></div>
            <div className="field-group"><label className="field-label" htmlFor="fetch-start">起始位置</label><input id="fetch-start" type="number" min={0} className="field-input" value={startIndex} onChange={(event) => setStartIndex(Number(event.target.value))} /></div>
          </div>
          <label className="checkbox-row"><input type="checkbox" checked={raw} onChange={(event) => setRaw(event.target.checked)} />返回原始 HTML，而不是清理后的 Markdown</label>
          <button className="primary-button" data-testid="fetch-run" type="button" onClick={run} disabled={runtime.pending}><Play size={13} />{runtime.pending ? "抓取中…" : "读取网页正文"}</button>
          <div className="sandbox-notice"><GlobeLock size={14} />调用前会拒绝本机、局域网、私有 IP、链路本地地址和带凭证 URL；上游还会检查 robots.txt。</div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="把公开网页转换成可读内容"
          emptyDescription="适合读取文档和文章。长页面可以用起始位置继续分段获取。"
        />
      </div>
    </div>
  );
}


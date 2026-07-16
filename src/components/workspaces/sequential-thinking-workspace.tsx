"use client";

import { useState } from "react";
import { GitBranch, ListChecks, Play, Shield } from "lucide-react";
import { ResultView } from "./result-view";
import { usePluginInvoke } from "./use-plugin-invoke";

type TimelineEntry = { number: number; text: string; mode: string };

export function SequentialThinkingWorkspace() {
  const [thought, setThought] = useState("");
  const [thoughtNumber, setThoughtNumber] = useState(1);
  const [totalThoughts, setTotalThoughts] = useState(4);
  const [nextNeeded, setNextNeeded] = useState(true);
  const [isRevision, setIsRevision] = useState(false);
  const [revisesThought, setRevisesThought] = useState(1);
  const [isBranch, setIsBranch] = useState(false);
  const [branchFrom, setBranchFrom] = useState(1);
  const [branchId, setBranchId] = useState("alternative-a");
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const runtime = usePluginInvoke("sequential-thinking-studio");

  async function run() {
    const args: Record<string, unknown> = { thought, nextThoughtNeeded: nextNeeded, thoughtNumber, totalThoughts };
    if (isRevision) Object.assign(args, { isRevision: true, revisesThought });
    if (isBranch) Object.assign(args, { branchFromThought: branchFrom, branchId });
    const response = await runtime.invoke("sequentialthinking", args).catch(() => null);
    if (response && !response.isError) {
      const mode = isRevision ? `修订步骤 ${revisesThought}` : isBranch ? `分支 ${branchId}` : "主线";
      setTimeline((items) => [...items, { number: thoughtNumber, text: thought, mode }]);
      if (nextNeeded) setThoughtNumber((value) => value + 1);
      setThought("");
    }
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><ListChecks size={14} />结构化分析记录</div>
        <span className="badge low">无文件 / 无网络</span>
      </div>
      <div className="workspace-body">
        <div className="control-panel">
          <div className="field-group">
            <label className="field-label" htmlFor="thinking-text">当前分析步骤 <span>用户主动提交</span></label>
            <textarea id="thinking-text" data-testid="thinking-text" className="field-textarea" value={thought} onChange={(event) => setThought(event.target.value)} placeholder="先明确问题的约束、成功标准和不可接受风险…" />
          </div>
          <div className="field-row">
            <div className="field-group"><label className="field-label" htmlFor="thinking-number">当前步骤</label><input id="thinking-number" data-testid="thinking-number" type="number" min={1} className="field-input" value={thoughtNumber} onChange={(event) => setThoughtNumber(Number(event.target.value))} /></div>
            <div className="field-group"><label className="field-label" htmlFor="thinking-total">预计总数</label><input id="thinking-total" type="number" min={1} className="field-input" value={totalThoughts} onChange={(event) => setTotalThoughts(Number(event.target.value))} /></div>
          </div>
          <label className="checkbox-row"><input type="checkbox" checked={nextNeeded} onChange={(event) => setNextNeeded(event.target.checked)} />还需要下一步</label>
          <label className="checkbox-row"><input type="checkbox" checked={isRevision} onChange={(event) => setIsRevision(event.target.checked)} />这是对旧步骤的修订</label>
          {isRevision ? <div className="field-group"><label className="field-label" htmlFor="thinking-revise">修订步骤</label><input id="thinking-revise" type="number" min={1} className="field-input" value={revisesThought} onChange={(event) => setRevisesThought(Number(event.target.value))} /></div> : null}
          <label className="checkbox-row"><input type="checkbox" checked={isBranch} onChange={(event) => setIsBranch(event.target.checked)} />从旧步骤创建分支</label>
          {isBranch ? <div className="field-row"><div className="field-group"><label className="field-label" htmlFor="thinking-branch-from">分支起点</label><input id="thinking-branch-from" type="number" min={1} className="field-input" value={branchFrom} onChange={(event) => setBranchFrom(Number(event.target.value))} /></div><div className="field-group"><label className="field-label" htmlFor="thinking-branch-id">分支 ID</label><input id="thinking-branch-id" className="field-input" value={branchId} onChange={(event) => setBranchId(event.target.value)} /></div></div> : null}
          <button className="primary-button" data-testid="thinking-run" type="button" onClick={run} disabled={runtime.pending}><Play size={13} />{runtime.pending ? "提交中…" : "记录这一步"}</button>
          <div className="privacy-notice"><Shield size={14} />这里只记录你主动提交的分析文本，不读取或展示模型的隐藏推理；上游文本日志已关闭。</div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="开始一条可修订的分析轨迹"
          emptyDescription="记录步骤，随后可以调整总数、修订旧步骤或创建备选分支。"
        >
          {timeline.length > 0 ? <div className="timeline">{timeline.map((item, index) => <div className="timeline-item" key={`${item.number}-${index}`}><span className="timeline-number">{item.number}</span><div><p>{item.text}</p><small><GitBranch size={8} /> {item.mode}</small></div></div>)}</div> : null}
        </ResultView>
      </div>
    </div>
  );
}

"use client";

import { Activity, CheckCircle2, LoaderCircle, TerminalSquare, XCircle } from "lucide-react";
import { resultText, type ActivityItem, type InvocationResult } from "./use-plugin-invoke";

export function ResultView({
  result,
  error,
  pending,
  activity,
  emptyTitle,
  emptyDescription,
  children,
  hideRaw = false,
}: {
  result: InvocationResult | null;
  error: string | null;
  pending: boolean;
  activity: ActivityItem[];
  emptyTitle: string;
  emptyDescription: string;
  children?: React.ReactNode;
  hideRaw?: boolean;
}) {
  return (
    <div className="result-panel">
      <div className="result-header">
        <h3>运行结果</h3>
        <span className="workspace-status">
          {pending ? <LoaderCircle size={11} className="spin" /> : <Activity size={11} />}
          {pending ? "正在调用安全运行时…" : "调用记录保留在当前页面"}
        </span>
      </div>

      {error ? <div className="error-box" role="alert" data-testid="invoke-error">{error}</div> : null}
      {children}
      {!result && !error ? (
        <div className="result-empty">
          <div><TerminalSquare size={30} /><strong>{emptyTitle}</strong><span>{emptyDescription}</span></div>
        </div>
      ) : result && !hideRaw ? (
        <pre className="result-output" data-testid="result-output">{resultText(result)}</pre>
      ) : null}

      {activity.length > 0 ? (
        <div className="activity-strip" aria-label="最近调用">
          {activity.map((item, index) => (
            <span className="activity-chip" key={`${item.tool}-${item.at}-${index}`}>
              {item.ok ? <CheckCircle2 size={9} /> : <XCircle size={9} />}{item.tool} · {item.at}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

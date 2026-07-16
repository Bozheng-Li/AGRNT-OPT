"use client";

import { useState } from "react";
import { ArrowRightLeft, Clock3, Globe2, Play } from "lucide-react";
import { ResultView } from "./result-view";
import { usePluginInvoke } from "./use-plugin-invoke";

const commonZones = [
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

export function TimeWorkspace() {
  const [mode, setMode] = useState<"current" | "convert">("current");
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [sourceTimezone, setSourceTimezone] = useState("Asia/Shanghai");
  const [targetTimezone, setTargetTimezone] = useState("America/New_York");
  const [time, setTime] = useState("09:00");
  const runtime = usePluginInvoke("timezone-converter");

  async function run() {
    if (mode === "current") {
      await runtime.invoke("get_current_time", { timezone }).catch(() => undefined);
    } else {
      await runtime.invoke("convert_time", {
        source_timezone: sourceTimezone,
        time,
        target_timezone: targetTimezone,
      }).catch(() => undefined);
    }
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><Clock3 size={14} />世界时间与时区换算</div>
        <span className="badge low">IANA TZ Database</span>
      </div>
      <div className="workspace-body">
        <div className="control-panel">
          <div className="workspace-tabs">
            <button type="button" className={`workspace-tab ${mode === "current" ? "active" : ""}`} onClick={() => setMode("current")}>当前时间</button>
            <button type="button" className={`workspace-tab ${mode === "convert" ? "active" : ""}`} onClick={() => setMode("convert")}>时区换算</button>
          </div>
          <datalist id="timezone-options">{commonZones.map((zone) => <option value={zone} key={zone} />)}</datalist>

          {mode === "current" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="current-timezone">IANA 时区 <span>支持自动补全</span></label>
              <input id="current-timezone" data-testid="current-timezone" list="timezone-options" className="field-input" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
            </div>
          ) : (
            <>
              <div className="field-group"><label className="field-label" htmlFor="source-timezone">来源时区</label><input id="source-timezone" data-testid="source-timezone" list="timezone-options" className="field-input" value={sourceTimezone} onChange={(event) => setSourceTimezone(event.target.value)} /></div>
              <div className="field-group"><label className="field-label" htmlFor="source-time">24 小时时间</label><input id="source-time" data-testid="source-time" type="time" className="field-input" value={time} onChange={(event) => setTime(event.target.value)} /></div>
              <div className="field-group"><label className="field-label" htmlFor="target-timezone">目标时区</label><input id="target-timezone" data-testid="target-timezone" list="timezone-options" className="field-input" value={targetTimezone} onChange={(event) => setTargetTimezone(event.target.value)} /></div>
            </>
          )}

          <button className="primary-button" data-testid="time-run" type="button" onClick={run} disabled={runtime.pending}>
            {mode === "current" ? <Play size={13} /> : <ArrowRightLeft size={13} />}{runtime.pending ? "计算中…" : mode === "current" ? "查询当前时间" : "换算时间"}
          </button>
          <div className="privacy-notice"><Globe2 size={14} />使用 IANA 标准时区规则处理夏令时；不需要网络、账号或密钥。</div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="查询世界时间"
          emptyDescription="查询任意 IANA 时区的当前时间，或把一个 24 小时时刻换算到另一个时区。"
        />
      </div>
    </div>
  );
}


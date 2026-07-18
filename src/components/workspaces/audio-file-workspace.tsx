"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AudioLines, FileAudio, FileUp, Play, ShieldCheck, Sparkles, Waves } from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";

const uploadLimit = 8 * 1024 * 1024;
const accepted = ".wav,.mp3,.flac,.ogg,.opus";

type UploadedAudio = {
  token: string;
  name: string;
  bytes: number;
  mimeType: string;
  codec: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
};

type BrowserAnalysis = {
  duration: number;
  sampleRate: number;
  channels: number;
  peakDb: number;
  rmsDb: number;
  approximateLufs: number;
  waveform: number[];
  spectrogram: number[][];
};

const defaultAnnotations = JSON.stringify({
  lanes: [
    {
      label: "重点听辨",
      color: "#7c5cff",
      spans: [{ start: 0.1, end: 0.25 }],
      envelope: [{ time: 0.1, value: 0.2 }, { time: 0.25, value: 1 }],
    },
  ],
}, null, 2);

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取所选音频。"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}

function readableBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function db(value: number): number {
  return Math.round(20 * Math.log10(Math.max(value, 1e-9)) * 10) / 10;
}

function waveformBins(samples: Float32Array, count = 128): number[] {
  const bins: number[] = [];
  const width = Math.max(1, Math.floor(samples.length / count));
  for (let index = 0; index < count; index += 1) {
    const start = index * width;
    const end = Math.min(samples.length, start + width);
    let peak = 0;
    const step = Math.max(1, Math.floor((end - start) / 512));
    for (let cursor = start; cursor < end; cursor += step) peak = Math.max(peak, Math.abs(samples[cursor]));
    bins.push(peak);
  }
  return bins;
}

function spectralGrid(samples: Float32Array, sampleRate: number): number[][] {
  const frames = 48;
  const bands = 24;
  const windowSize = 256;
  const output: number[][] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    const center = Math.floor((frame / Math.max(1, frames - 1)) * Math.max(0, samples.length - windowSize));
    const row: number[] = [];
    for (let band = 0; band < bands; band += 1) {
      const frequency = 40 * Math.pow(Math.min(12_000, sampleRate / 2) / 40, band / Math.max(1, bands - 1));
      let real = 0;
      let imaginary = 0;
      for (let offset = 0; offset < windowSize && center + offset < samples.length; offset += 1) {
        const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * offset) / (windowSize - 1));
        const angle = (2 * Math.PI * frequency * offset) / sampleRate;
        const value = samples[center + offset] * window;
        real += value * Math.cos(angle);
        imaginary -= value * Math.sin(angle);
      }
      row.push(Math.min(1, Math.sqrt(real * real + imaginary * imaginary) / 16));
    }
    output.push(row);
  }
  return output;
}

async function analyze(file: File): Promise<BrowserAnalysis> {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) throw new Error("当前浏览器不支持 Web Audio 解码。 ");
  const context = new AudioContextConstructor();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const samples = buffer.getChannelData(0);
    let peak = 0;
    let squareSum = 0;
    let sampled = 0;
    const step = Math.max(1, Math.ceil(samples.length / 2_000_000));
    for (let index = 0; index < samples.length; index += step) {
      const value = samples[index];
      peak = Math.max(peak, Math.abs(value));
      squareSum += value * value;
      sampled += 1;
    }
    const rms = Math.sqrt(squareSum / Math.max(1, sampled));
    return {
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      peakDb: db(peak),
      rmsDb: db(rms),
      approximateLufs: Math.round((-0.691 + 10 * Math.log10(Math.max(rms * rms, 1e-12))) * 10) / 10,
      waveform: waveformBins(samples),
      spectrogram: spectralGrid(samples, buffer.sampleRate),
    };
  } catch {
    throw new Error("浏览器无法解码该音频；请确认文件内容与扩展名一致。 ");
  } finally {
    await context.close();
  }
}

function toneFixture(): File {
  const sampleRate = 44_100;
  const seconds = 1;
  const samples = sampleRate * seconds;
  const body = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(body);
  const ascii = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, body.byteLength - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.min(1, index / 2_000) * Math.min(1, (samples - index) / 2_000);
    view.setInt16(44 + index * 2, Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.28 * envelope * 32_767), true);
  }
  return new File([body], "agent-opt-440hz.wav", { type: "audio/wav" });
}

function waveformPoints(values: number[]): string {
  return values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${50 - value * 44}`).join(" ");
}

export function AudioFileWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<UploadedAudio | null>(null);
  const [analysis, setAnalysis] = useState<BrowserAnalysis | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState("0.15");
  const [regionStart, setRegionStart] = useState("0.1");
  const [regionEnd, setRegionEnd] = useState("0.35");
  const [annotationText, setAnnotationText] = useState(defaultAnnotations);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const runtime = usePluginInvoke("audio-file-inspector");
  const upstream = useMemo(() => resultJson(runtime.result), [runtime.result]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  function select(next: File | null) {
    setLocalError(null);
    setUploaded(null);
    setAnalysis(null);
    runtime.setResult(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    if (next && next.size > uploadLimit) {
      setFile(null);
      setLocalError("音频超过 8 MiB 上传上限。 ");
      return;
    }
    setFile(next);
  }

  async function run() {
    if (!file) {
      setLocalError("请先选择音频，或载入内置 440 Hz WAV 示例。 ");
      return;
    }
    setUploading(true);
    setLocalError(null);
    try {
      const annotations = JSON.parse(annotationText) as unknown;
      const playheadSeconds = Number(playhead);
      const startSeconds = Number(regionStart);
      const endSeconds = Number(regionEnd);
      if (![playheadSeconds, startSeconds, endSeconds].every(Number.isFinite)) throw new Error("播放位置与选区必须是数字。 ");
      const response = await fetch("/api/plugins/audio-file-inspector/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, data: await dataUrl(file) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "音频上传失败。 ");
      const stored = payload.file as UploadedAudio;
      const browserAnalysis = await analyze(file);
      setUploaded(stored);
      const nextUrl = URL.createObjectURL(file);
      setAudioUrl(nextUrl);
      setAnalysis(browserAnalysis);
      await runtime.invoke("display_audio_file", {
        token: stored.token,
        playheadSeconds,
        ...(endSeconds > startSeconds ? { region: { startSeconds, endSeconds } } : {}),
        annotations,
      });
    } catch (error) {
      setLocalError(error instanceof SyntaxError ? "标注轨道不是有效 JSON。 " : error instanceof Error ? error.message : "音频检查失败。 ");
    } finally {
      setUploading(false);
    }
  }

  const pending = uploading || runtime.pending;
  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><AudioLines size={14} />音频文件检查台</div>
        <span className="badge low">本地只读听辨</span>
      </div>
      <div className="workspace-body audio-file-layout">
        <div className="control-panel audio-file-controls">
          <div className="field-group">
            <label className="field-label" htmlFor="audio-file-input">上传音频 <span>最大 8 MiB / 5 分钟</span></label>
            <button
              type="button"
              className="audio-file-dropzone"
              data-testid="audio-file-dropzone"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); select(event.dataTransfer.files.item(0)); }}
            >
              <FileUp size={24} />
              <strong>{file ? file.name : "选择文件或拖放到这里"}</strong>
              <span>{file ? readableBytes(file.size) : "WAV / MP3 / FLAC / Ogg Vorbis / Opus"}</span>
            </button>
            <input
              ref={inputRef}
              id="audio-file-input"
              data-testid="audio-file-input"
              className="visually-hidden"
              type="file"
              accept={accepted}
              onChange={(event) => select(event.target.files?.item(0) ?? null)}
            />
          </div>

          <div className="audio-time-grid">
            <label>初始播放秒数<input data-testid="audio-playhead" className="field-input" inputMode="decimal" value={playhead} onChange={(event) => setPlayhead(event.target.value)} /></label>
            <label>选区开始<input data-testid="audio-region-start" className="field-input" inputMode="decimal" value={regionStart} onChange={(event) => setRegionStart(event.target.value)} /></label>
            <label>选区结束<input data-testid="audio-region-end" className="field-input" inputMode="decimal" value={regionEnd} onChange={(event) => setRegionEnd(event.target.value)} /></label>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="audio-annotations">标注轨道 JSON <span>最多 12 轨</span></label>
            <textarea id="audio-annotations" data-testid="audio-annotations" className="field-textarea audio-annotation-editor" value={annotationText} onChange={(event) => setAnnotationText(event.target.value)} spellCheck={false} />
          </div>

          <div className="workspace-actions">
            <button type="button" className="secondary-button" data-testid="audio-example" onClick={() => select(toneFixture())}><Sparkles size={13} />载入 440 Hz 示例</button>
            <button type="button" className="primary-button" data-testid="audio-run" onClick={run} disabled={pending}><Play size={13} />{pending ? "正在检查…" : "检查并打开听辨台"}</button>
          </div>

          <div className="sandbox-notice"><ShieldCheck size={14} />Web 只接受上传 token，不接受 URL、file URI、宿主路径或 annotationsPath。服务端校验扩展名、容器结构、8 MiB 大小和 5 分钟时长；固定上游 MCP 运行时被禁止联网、写文件和启动命令。</div>
        </div>

        <ResultView
          result={runtime.result}
          error={localError ?? runtime.error}
          pending={pending}
          activity={runtime.activity}
          emptyTitle="把音频变成可听、可看、可标注的证据"
          emptyDescription="上传本地文件后，浏览器负责播放与可视化，固定 MCP 只读取隔离副本并确认展示上下文。"
          hideRaw
        >
          {analysis && uploaded && audioUrl && upstream ? (
            <div className="audio-inspection" data-testid="audio-inspection">
              <div className="audio-file-summary">
                <span><FileAudio size={14} /><strong>{uploaded.name}</strong></span>
                <span>{uploaded.codec} · {analysis.channels} 声道 · {analysis.sampleRate.toLocaleString()} Hz · {analysis.duration.toFixed(2)} 秒</span>
              </div>
              <audio data-testid="audio-player" controls preload="metadata" src={audioUrl}>当前浏览器不支持音频播放。</audio>
              <div className="audio-metrics" data-testid="audio-metrics">
                <span><strong>{analysis.peakDb.toFixed(1)}</strong>dBFS 峰值</span>
                <span><strong>{analysis.rmsDb.toFixed(1)}</strong>dBFS RMS</span>
                <span><strong>{analysis.approximateLufs.toFixed(1)}</strong>LUFS 近似值</span>
                <span><strong>{uploaded.bytes.toLocaleString()}</strong>字节</span>
              </div>
              <section className="audio-visual-card" aria-label="波形概览">
                <header><Waves size={13} />波形概览</header>
                <svg data-testid="audio-waveform" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="音频归一化峰值波形">
                  <line x1="0" x2="100" y1="50" y2="50" />
                  <polyline points={waveformPoints(analysis.waveform)} />
                  <polyline points={waveformPoints(analysis.waveform).split(" ").map((point) => { const [x, y] = point.split(",").map(Number); return `${x},${100 - y}`; }).join(" ")} />
                </svg>
              </section>
              <section className="audio-visual-card" aria-label="频谱概览">
                <header><Activity size={13} />对数频带概览</header>
                <div className="audio-spectrogram" data-testid="audio-spectrogram">
                  {analysis.spectrogram.flatMap((column, x) => column.map((value, y) => (
                    <i key={`${x}-${y}`} style={{ backgroundColor: `hsl(${255 - value * 210} 82% ${8 + value * 55}%)` }} />
                  )))}
                </div>
              </section>
              <div className="audio-upstream-confirmation" data-testid="audio-upstream-confirmation">
                上游 MCP 已确认隔离文件与播放上下文；绝对路径已从返回结果中移除。调用序号 {String(upstream.seq ?? "—")}。
              </div>
            </div>
          ) : null}
        </ResultView>
      </div>
    </div>
  );
}

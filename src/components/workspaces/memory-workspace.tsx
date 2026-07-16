"use client";

import { useState } from "react";
import { BrainCircuit, LockKeyhole, Network, Play, Search } from "lucide-react";
import { ResultView } from "./result-view";
import { resultJson, usePluginInvoke } from "./use-plugin-invoke";

type Tab = "entity" | "relation" | "search" | "graph";
const tabLabels: Record<Tab, string> = { entity: "实体", relation: "关系", search: "搜索", graph: "全图" };

export function MemoryWorkspace() {
  const [tab, setTab] = useState<Tab>("entity");
  const [entityName, setEntityName] = useState("");
  const [entityType, setEntityType] = useState("project");
  const [observations, setObservations] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [relationType, setRelationType] = useState("uses");
  const [query, setQuery] = useState("");
  const runtime = usePluginInvoke("knowledge-memory");
  const graph = resultJson(runtime.result);
  const entities = Array.isArray(graph?.entities) ? graph.entities.length : null;
  const relations = Array.isArray(graph?.relations) ? graph.relations.length : null;

  async function run() {
    if (tab === "entity") {
      await runtime.invoke("create_entities", {
        entities: [{ name: entityName, entityType, observations: observations.split("\n").map((item) => item.trim()).filter(Boolean) }],
      }).catch(() => undefined);
    }
    if (tab === "relation") {
      await runtime.invoke("create_relations", { relations: [{ from, to, relationType }] }).catch(() => undefined);
    }
    if (tab === "search") await runtime.invoke("search_nodes", { query }).catch(() => undefined);
    if (tab === "graph") await runtime.invoke("read_graph", {}).catch(() => undefined);
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title"><BrainCircuit size={14} />知识图谱记忆</div>
        <span className="badge low">本地 JSONL</span>
      </div>
      <div className="workspace-body">
        <div className="control-panel">
          <div className="workspace-tabs">
            {(Object.keys(tabLabels) as Tab[]).map((item) => (
              <button type="button" className={`workspace-tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)} key={item}>{tabLabels[item]}</button>
            ))}
          </div>

          {tab === "entity" ? <>
            <div className="field-group"><label className="field-label" htmlFor="memory-name">实体名称</label><input id="memory-name" data-testid="memory-name" className="field-input" value={entityName} onChange={(event) => setEntityName(event.target.value)} placeholder="Agent-OPT" /></div>
            <div className="field-group"><label className="field-label" htmlFor="memory-type">实体类型</label><input id="memory-type" data-testid="memory-type" className="field-input" value={entityType} onChange={(event) => setEntityType(event.target.value)} placeholder="project" /></div>
            <div className="field-group"><label className="field-label" htmlFor="memory-observations">观察 <span>每行一条</span></label><textarea id="memory-observations" data-testid="memory-observations" className="field-textarea" value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="聚合高质量 Agent 插件\n每个插件拥有独立 Web" /></div>
          </> : null}

          {tab === "relation" ? <>
            <div className="field-group"><label className="field-label" htmlFor="memory-from">起点实体</label><input id="memory-from" className="field-input" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
            <div className="field-group"><label className="field-label" htmlFor="memory-to">终点实体</label><input id="memory-to" className="field-input" value={to} onChange={(event) => setTo(event.target.value)} /></div>
            <div className="field-group"><label className="field-label" htmlFor="memory-relation">关系类型 <span>主动语态</span></label><input id="memory-relation" className="field-input" value={relationType} onChange={(event) => setRelationType(event.target.value)} /></div>
          </> : null}

          {tab === "search" ? <div className="field-group"><label className="field-label" htmlFor="memory-query">搜索名称、类型或观察</label><input id="memory-query" data-testid="memory-query" className="field-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="插件聚合" /></div> : null}

          {tab === "graph" ? <div className="privacy-notice"><Network size={14} />读取完整本地图谱，包括全部实体、观察和关系。</div> : null}

          <button className="primary-button" data-testid="memory-run" type="button" onClick={run} disabled={runtime.pending}>
            {tab === "search" ? <Search size={13} /> : <Play size={13} />}{runtime.pending ? "运行中…" : `${tabLabels[tab]}执行`}
          </button>
          <div className="privacy-notice"><LockKeyhole size={14} />记忆文件路径由服务端固定，网页不能读取或修改宿主机其他位置。</div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="构建可检查的记忆图谱"
          emptyDescription="先创建实体和原子观察，再建立关系；也可以搜索或查看完整图谱。"
        >
          {entities !== null && relations !== null ? <div className="graph-summary"><div className="graph-stat"><strong>{entities}</strong><span>实体</span></div><div className="graph-stat"><strong>{relations}</strong><span>关系</span></div></div> : null}
        </ResultView>
      </div>
    </div>
  );
}


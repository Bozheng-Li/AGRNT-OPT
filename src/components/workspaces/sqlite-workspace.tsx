"use client";

import { useState } from "react";
import { Database, ListTree, Play, Plus, Table2 } from "lucide-react";
import { ResultView } from "./result-view";
import { usePluginInvoke } from "./use-plugin-invoke";

type Tab = "tables" | "describe" | "read" | "write" | "create" | "insight";

const tabLabels: Record<Tab, string> = {
  tables: "表列表",
  describe: "表结构",
  read: "查询",
  write: "写入",
  create: "建表",
  insight: "洞察",
};

export function SqliteWorkspace() {
  const [tab, setTab] = useState<Tab>("tables");
  const [tableName, setTableName] = useState("items");
  const [readQuery, setReadQuery] = useState("SELECT * FROM items LIMIT 20;");
  const [writeQuery, setWriteQuery] = useState("INSERT INTO items(name) VALUES ('demo');");
  const [createQuery, setCreateQuery] = useState(
    "CREATE TABLE IF NOT EXISTS items (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL\n);",
  );
  const [insight, setInsight] = useState("沙箱数据库中的示例表可用于验证 SQL 查询与写入流程。");
  const runtime = usePluginInvoke("sqlite-workbench");

  async function run() {
    if (tab === "tables") {
      await runtime.invoke("list_tables", {}).catch(() => undefined);
      return;
    }
    if (tab === "describe") {
      await runtime.invoke("describe_table", { table_name: tableName }).catch(() => undefined);
      return;
    }
    if (tab === "read") {
      await runtime.invoke("read_query", { query: readQuery }).catch(() => undefined);
      return;
    }
    if (tab === "write") {
      await runtime.invoke("write_query", { query: writeQuery }).catch(() => undefined);
      return;
    }
    if (tab === "create") {
      await runtime.invoke("create_table", { query: createQuery }).catch(() => undefined);
      return;
    }
    if (tab === "insight") {
      await runtime.invoke("append_insight", { insight }).catch(() => undefined);
    }
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title">
          <Database size={14} />
          SQLite 数据工作台
        </div>
        <span className="badge medium">隔离数据库写权限</span>
      </div>
      <div className="workspace-body">
        <div className="control-panel">
          <div className="workspace-tabs">
            {(Object.keys(tabLabels) as Tab[]).map((item) => (
              <button
                type="button"
                className={`workspace-tab ${tab === item ? "active" : ""}`}
                onClick={() => setTab(item)}
                key={item}
              >
                {tabLabels[item]}
              </button>
            ))}
          </div>

          {tab === "describe" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="sqlite-table">
                表名
              </label>
              <input
                id="sqlite-table"
                data-testid="sqlite-table"
                className="field-input"
                value={tableName}
                onChange={(event) => setTableName(event.target.value)}
              />
            </div>
          ) : null}

          {tab === "read" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="sqlite-read">
                SELECT 查询 <span>只读</span>
              </label>
              <textarea
                id="sqlite-read"
                data-testid="sqlite-read"
                className="field-textarea code"
                value={readQuery}
                onChange={(event) => setReadQuery(event.target.value)}
              />
            </div>
          ) : null}

          {tab === "write" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="sqlite-write">
                写入 SQL <span>INSERT / UPDATE / DELETE</span>
              </label>
              <textarea
                id="sqlite-write"
                data-testid="sqlite-write"
                className="field-textarea code"
                value={writeQuery}
                onChange={(event) => setWriteQuery(event.target.value)}
              />
            </div>
          ) : null}

          {tab === "create" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="sqlite-create">
                CREATE TABLE
              </label>
              <textarea
                id="sqlite-create"
                data-testid="sqlite-create"
                className="field-textarea code"
                value={createQuery}
                onChange={(event) => setCreateQuery(event.target.value)}
              />
            </div>
          ) : null}

          {tab === "insight" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="sqlite-insight">
                业务洞察
              </label>
              <textarea
                id="sqlite-insight"
                data-testid="sqlite-insight"
                className="field-textarea"
                value={insight}
                onChange={(event) => setInsight(event.target.value)}
              />
            </div>
          ) : null}

          <button className="primary-button" data-testid="sqlite-run" type="button" onClick={run} disabled={runtime.pending}>
            {tab === "create" ? <Plus size={13} /> : tab === "tables" ? <ListTree size={13} /> : tab === "describe" ? <Table2 size={13} /> : <Play size={13} />}
            {runtime.pending ? "执行中…" : tabLabels[tab]}
          </button>
          <div className="privacy-notice">
            <Database size={14} />
            数据库固定在 `var/runtime/sqlite/sandbox.db`；网页不能指定宿主路径。SQL 仅允许单语句，读通道限 SELECT，写通道限 INSERT、UPDATE、DELETE 与 REPLACE。
          </div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="查询隔离 SQLite 库"
          emptyDescription="列出表、查看结构、运行 SELECT，或在沙箱中创建表与写入数据。"
        />
      </div>
    </div>
  );
}

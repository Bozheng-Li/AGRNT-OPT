"use client";

import { useState } from "react";
import { GitBranch, GitCommitHorizontal, History, Play, Plus } from "lucide-react";
import { ResultView } from "./result-view";
import { usePluginInvoke } from "./use-plugin-invoke";

type Tab = "status" | "diff" | "log" | "branch" | "stage" | "commit";

const tabLabels: Record<Tab, string> = {
  status: "状态",
  diff: "差异",
  log: "历史",
  branch: "分支",
  stage: "暂存",
  commit: "提交",
};

export function GitWorkspace() {
  const [tab, setTab] = useState<Tab>("status");
  const [diffMode, setDiffMode] = useState<"unstaged" | "staged" | "target">("unstaged");
  const [target, setTarget] = useState("HEAD~1");
  const [contextLines, setContextLines] = useState(3);
  const [maxCount, setMaxCount] = useState(10);
  const [branchType, setBranchType] = useState<"local" | "remote" | "all">("local");
  const [branchName, setBranchName] = useState("feature/agent-opt");
  const [baseBranch, setBaseBranch] = useState("master");
  const [files, setFiles] = useState("README.md\nnotes/example.txt");
  const [message, setMessage] = useState("chore: sandbox commit from Agent-OPT");
  const runtime = usePluginInvoke("git-sandbox-studio");

  async function run() {
    if (tab === "status") {
      await runtime.invoke("git_status", {}).catch(() => undefined);
      return;
    }
    if (tab === "diff") {
      if (diffMode === "unstaged") {
        await runtime.invoke("git_diff_unstaged", { context_lines: contextLines }).catch(() => undefined);
      } else if (diffMode === "staged") {
        await runtime.invoke("git_diff_staged", { context_lines: contextLines }).catch(() => undefined);
      } else {
        await runtime.invoke("git_diff", { target, context_lines: contextLines }).catch(() => undefined);
      }
      return;
    }
    if (tab === "log") {
      await runtime.invoke("git_log", { max_count: maxCount }).catch(() => undefined);
      return;
    }
    if (tab === "branch") {
      await runtime.invoke("git_branch", { branch_type: branchType }).catch(() => undefined);
      return;
    }
    if (tab === "stage") {
      const fileList = files
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      await runtime.invoke("git_add", { files: fileList }).catch(() => undefined);
      return;
    }
    if (tab === "commit") {
      await runtime.invoke("git_commit", { message }).catch(() => undefined);
    }
  }

  async function createBranch() {
    await runtime
      .invoke("git_create_branch", {
        branch_name: branchName,
        base_branch: baseBranch || null,
      })
      .catch(() => undefined);
  }

  async function checkoutBranch() {
    await runtime.invoke("git_checkout", { branch_name: branchName }).catch(() => undefined);
  }

  async function resetStaging() {
    await runtime.invoke("git_reset", {}).catch(() => undefined);
  }

  return (
    <div className="workspace-card">
      <div className="workspace-bar">
        <div className="workspace-bar-title">
          <GitBranch size={14} />
          Git 沙箱工作室
        </div>
        <span className="badge medium">隔离仓库写权限</span>
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

          {tab === "diff" ? (
            <>
              <div className="workspace-tabs">
                {(
                  [
                    ["unstaged", "未暂存"],
                    ["staged", "已暂存"],
                    ["target", "相对目标"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    className={`workspace-tab ${diffMode === value ? "active" : ""}`}
                    onClick={() => setDiffMode(value)}
                    key={value}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {diffMode === "target" ? (
                <div className="field-group">
                  <label className="field-label" htmlFor="git-target">
                    对比目标 <span>分支、标签或提交</span>
                  </label>
                  <input
                    id="git-target"
                    data-testid="git-target"
                    className="field-input"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                  />
                </div>
              ) : null}
              <div className="field-group">
                <label className="field-label" htmlFor="git-context">
                  上下文行数
                </label>
                <input
                  id="git-context"
                  data-testid="git-context"
                  type="number"
                  min={0}
                  max={50}
                  className="field-input"
                  value={contextLines}
                  onChange={(event) => setContextLines(Number(event.target.value))}
                />
              </div>
            </>
          ) : null}

          {tab === "log" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="git-max-count">
                提交条数 <span>最多 100</span>
              </label>
              <input
                id="git-max-count"
                data-testid="git-max-count"
                type="number"
                min={1}
                max={100}
                className="field-input"
                value={maxCount}
                onChange={(event) => setMaxCount(Number(event.target.value))}
              />
            </div>
          ) : null}

          {tab === "branch" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="git-branch-type">
                  分支范围
                </label>
                <select
                  id="git-branch-type"
                  data-testid="git-branch-type"
                  className="field-input"
                  value={branchType}
                  onChange={(event) => setBranchType(event.target.value as "local" | "remote" | "all")}
                >
                  <option value="local">本地</option>
                  <option value="remote">远程</option>
                  <option value="all">全部</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="git-branch-name">
                  分支名
                </label>
                <input
                  id="git-branch-name"
                  data-testid="git-branch-name"
                  className="field-input"
                  value={branchName}
                  onChange={(event) => setBranchName(event.target.value)}
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="git-base-branch">
                  基线分支 <span>创建时可选</span>
                </label>
                <input
                  id="git-base-branch"
                  data-testid="git-base-branch"
                  className="field-input"
                  value={baseBranch}
                  onChange={(event) => setBaseBranch(event.target.value)}
                />
              </div>
              <div className="button-row">
                <button className="secondary-button" type="button" data-testid="git-create-branch" onClick={createBranch} disabled={runtime.pending}>
                  <Plus size={13} />
                  创建分支
                </button>
                <button className="secondary-button" type="button" data-testid="git-checkout" onClick={checkoutBranch} disabled={runtime.pending}>
                  <GitBranch size={13} />
                  切换
                </button>
              </div>
            </>
          ) : null}

          {tab === "stage" ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="git-files">
                  沙箱相对路径 <span>每行一个文件</span>
                </label>
                <textarea
                  id="git-files"
                  data-testid="git-files"
                  className="field-textarea code"
                  value={files}
                  onChange={(event) => setFiles(event.target.value)}
                />
              </div>
              <button className="secondary-button" type="button" data-testid="git-reset" onClick={resetStaging} disabled={runtime.pending}>
                取消暂存
              </button>
            </>
          ) : null}

          {tab === "commit" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="git-message">
                提交说明
              </label>
              <textarea
                id="git-message"
                data-testid="git-message"
                className="field-textarea"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </div>
          ) : null}

          <button className="primary-button" data-testid="git-run" type="button" onClick={run} disabled={runtime.pending}>
            {tab === "commit" ? <GitCommitHorizontal size={13} /> : tab === "log" ? <History size={13} /> : <Play size={13} />}
            {runtime.pending ? "执行中…" : tabLabels[tab]}
          </button>
          <div className="privacy-notice">
            <GitBranch size={14} />
            所有操作锁定在 `var/runtime/git-sandbox`，Web 不会接受宿主任意路径；写操作仅作用于该隔离仓库。
          </div>
        </div>

        <ResultView
          result={runtime.result}
          error={runtime.error}
          pending={runtime.pending}
          activity={runtime.activity}
          emptyTitle="检查沙箱仓库"
          emptyDescription="在隔离 Git 仓库中查看状态、差异、历史，并安全地暂存与提交变更。"
        />
      </div>
    </div>
  );
}

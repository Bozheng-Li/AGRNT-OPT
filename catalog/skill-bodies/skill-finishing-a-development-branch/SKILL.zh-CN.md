---
name: finishing-a-development-branch
description: 当实施完成、所有测试通过，并且需要决定如何集成工作时使用——通过提供结构化的合并、PR 或清理选项来指导开发工作的收尾
---

# 完成开发分支

## 概述

通过提供明确选项并处理所选工作流，指导开发工作的收尾。

**核心原则：** 验证测试 → 检测环境 → 提供选项 → 执行选择 → 清理。

**开始时宣布：**“我正在使用 finishing-a-development-branch 技能完成这项工作。”

## 流程

### 第 1 步：验证测试

**在提供选项之前，验证测试是否通过：**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**如果测试失败：**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

停止。不要继续第 2 步。

**如果测试通过：** 继续第 2 步。

### 第 2 步：检测环境

**提供选项之前，确定工作区状态：**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

这将决定显示哪个菜单以及如何清理：

| 状态 | 菜单 | 清理 |
|-------|------|---------|
| `GIT_DIR == GIT_COMMON`（普通仓库） | 标准 4 个选项 | 无需清理 worktree |
| `GIT_DIR != GIT_COMMON`，命名分支 | 标准 4 个选项 | 基于来源（见第 6 步） |
| `GIT_DIR != GIT_COMMON`，detached HEAD | 精简的 3 个选项（无合并） | 不清理（由外部管理） |

### 第 3 步：确定基础分支

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

或者询问：“此分支从 main 分出——正确吗？”

### 第 4 步：提供选项

**普通仓库和命名分支 worktree——准确提供以下 4 个选项：**

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**Detached HEAD——准确提供以下 3 个选项：**

```
Implementation complete. You're on a detached HEAD (externally managed workspace).

1. Push as new branch and create a Pull Request
2. Keep as-is (I'll handle it later)
3. Discard this work

Which option?
```

**不要添加解释**——让选项保持简洁。

### 第 5 步：执行选择

#### 选项 1：本地合并

```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
<test command>

# Only after merge succeeds: cleanup worktree (Step 6), then delete branch
```

然后：清理 worktree（第 6 步），再删除分支：

```bash
git branch -d <feature-branch>
```

#### 选项 2：推送并创建 PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

**不要清理 worktree**——用户需要保留它，以便根据 PR 反馈迭代。

#### 选项 3：保持原样

报告：“保留分支 <name>。worktree 保留在 <path>。”

**不要清理 worktree。**

#### 选项 4：丢弃

**先确认：**
```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

等待完全一致的确认。

确认后：
```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
```

然后：清理 worktree（第 6 步），再强制删除分支：
```bash
git branch -D <feature-branch>
```

### 第 6 步：清理工作区

**仅对选项 1 和 4 运行。** 选项 2 和 3 始终保留 worktree。

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

**如果 `GIT_DIR == GIT_COMMON`：** 这是普通仓库，没有需要清理的 worktree。完成。

**如果 worktree 路径位于 `.worktrees/`、`worktrees/` 或 `~/.config/superpowers/worktrees/` 下：** 此 worktree 由 Superpowers 创建——其清理由我们负责。

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
git worktree remove "$WORKTREE_PATH"
git worktree prune  # Self-healing: clean up any stale registrations
```

**否则：** 此工作区由宿主环境（harness）所有。不要将其移除。如果你的平台提供 workspace-exit 工具，请使用该工具；否则保留工作区不变。

## 快速参考

| 选项 | 合并 | 推送 | 保留 Worktree | 清理分支 |
|--------|-------|------|---------------|----------------|
| 1. 本地合并 | 是 | - | - | 是 |
| 2. 创建 PR | - | 是 | 是 | - |
| 3. 保持原样 | - | - | 是 | - |
| 4. 丢弃 | - | - | - | 是（强制） |

## 常见错误

**跳过测试验证**
- **问题：** 合并损坏的代码，创建失败的 PR
- **修复：** 在提供选项前始终验证测试

**开放式问题**
- **问题：**“接下来我该做什么？”含义不明确
- **修复：** 准确提供 4 个结构化选项（detached HEAD 时提供 3 个）

**对选项 2 清理 worktree**
- **问题：** 移除用户进行 PR 迭代所需的 worktree
- **修复：** 仅对选项 1 和 4 执行清理

**先删除分支，再移除 worktree**
- **问题：** `git branch -d` 失败，因为 worktree 仍引用该分支
- **修复：** 先合并，再移除 worktree，最后删除分支

**从 worktree 内部运行 git worktree remove**
- **问题：** 当 CWD 位于要移除的 worktree 内时，命令会静默失败
- **修复：** 运行 `git worktree remove` 前，始终先 `cd` 到主仓库根目录

**清理由 harness 所有的 worktree**
- **问题：** 移除由 harness 创建的 worktree 会造成幽灵状态
- **修复：** 仅清理位于 `.worktrees/`、`worktrees/` 或 `~/.config/superpowers/worktrees/` 下的 worktree

**丢弃前未确认**
- **问题：** 意外删除工作成果
- **修复：** 要求用户键入“discard”确认

## 危险信号

**绝不：**
- 在测试失败时继续
- 未验证合并后的测试就执行合并
- 未经确认就删除工作成果
- 未经明确要求就强制推送
- 确认合并成功前移除 worktree
- 清理并非由你创建的 worktree（检查来源）
- 从 worktree 内部运行 `git worktree remove`

**始终：**
- 在提供选项前验证测试
- 在显示菜单前检测环境
- 准确提供 4 个选项（detached HEAD 时提供 3 个）
- 为选项 4 获取用户键入的确认
- 仅对选项 1 和 4 清理 worktree
- 移除 worktree 前，先 `cd` 到主仓库根目录
- 移除后运行 `git worktree prune`

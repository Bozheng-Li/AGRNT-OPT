---
name: using-git-worktrees
description: 在开始需要与当前工作区隔离的功能开发时，或执行实施计划之前使用——通过平台原生工具或 git worktree 后备方案确保存在隔离工作区
---

# 使用 Git Worktree

## 概述

确保工作在隔离的工作区中进行。优先使用所在平台的原生 worktree 工具；只有在没有原生工具时，才回退到手动创建 git worktree。

**核心原则：** 先检测是否已经隔离；然后使用原生工具；最后才回退到 git。绝不要与运行框架对抗。

**开始时声明：**“我正在使用 using-git-worktrees 技能建立隔离工作区。”

## 步骤 0：检测现有隔离

**创建任何内容之前，检查当前是否已经处于隔离工作区。**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

**子模块防护：** 在 git 子模块中，`GIT_DIR != GIT_COMMON` 同样为真。因此，在断定“已经位于 worktree”之前，先确认当前并非子模块：

```bash
# If this returns a path, you're in a submodule, not a worktree — treat as normal repo
git rev-parse --show-superproject-working-tree 2>/dev/null
```

**如果 `GIT_DIR != GIT_COMMON`（并且不是子模块）：** 当前已处于链接 worktree。跳到步骤 3（项目设置），不要再创建另一个 worktree。

报告时包含分支状态：
- 位于分支上：“已在 `<path>` 的隔离工作区中，当前分支为 `<name>`。”
- Detached HEAD：“已在 `<path>` 的隔离工作区中（detached HEAD，由外部管理）。结束工作时需要创建分支。”

**如果 `GIT_DIR == GIT_COMMON`（或当前位于子模块）：** 当前是普通仓库检出。

用户是否已在指令中表明 worktree 偏好？如果没有，请在创建 worktree 前征得同意：

> “需要我建立一个隔离 worktree 吗？这样可以保护当前分支不受变更影响。”

如果用户已经声明偏好，直接遵循，无需再次询问。如果用户拒绝，则在当前目录中工作并跳到步骤 3。

## 步骤 1：创建隔离工作区

**有两种机制。按以下顺序尝试。**

### 1a. 原生 Worktree 工具（首选）

用户已经要求隔离工作区（在步骤 0 中同意）。当前是否已有创建 worktree 的方式？它可能是名为 `EnterWorktree`、`WorktreeCreate` 的工具、`/worktree` 命令，或 `--worktree` 标志。如果有，使用该方式并跳到步骤 3。

原生工具会自动处理目录位置、分支创建和清理。当原生工具可用时使用 `git worktree add`，会创建运行框架无法观察或管理的幽灵状态。

只有在没有可用的原生 worktree 工具时，才能继续步骤 1b。

### 1b. Git Worktree 后备方案

**仅在步骤 1a 不适用时使用**——也就是不存在原生 worktree 工具时。使用 git 手动创建 worktree。

#### 目录选择

按以下优先级执行。用户明确表达的偏好始终高于观察到的文件系统状态。

1. **检查指令中是否已经声明 worktree 目录偏好。** 如果用户已经指定，直接使用，无需询问。

2. **检查现有的项目内 worktree 目录：**
   ```bash
   ls -d .worktrees 2>/dev/null     # Preferred (hidden)
   ls -d worktrees 2>/dev/null      # Alternative
   ```
   如果找到，则使用它。两者同时存在时，优先 `.worktrees`。

3. **检查现有的全局目录：**
   ```bash
   project=$(basename "$(git rev-parse --show-toplevel)")
   ls -d ~/.config/superpowers/worktrees/$project 2>/dev/null
   ```
   如果存在则使用它，以兼容旧版全局路径。

4. **如果没有其他指引，** 默认使用项目根目录下的 `.worktrees/`。

#### 安全验证（仅限项目内目录）

**创建 worktree 前，必须验证目录已被忽略：**

```bash
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**如果未被忽略：** 将目录加入 .gitignore，提交此变更，然后继续。

**为什么至关重要：** 防止误将 worktree 内容提交到仓库。

全局目录（`~/.config/superpowers/worktrees/`）不需要进行该验证。

#### 创建 Worktree

```bash
project=$(basename "$(git rev-parse --show-toplevel)")

# Determine path based on chosen location
# For project-local: path="$LOCATION/$BRANCH_NAME"
# For global: path="~/.config/superpowers/worktrees/$project/$BRANCH_NAME"

git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

**沙箱后备处理：** 如果 `git worktree add` 因权限错误（沙箱拒绝）失败，应告知用户沙箱阻止了 worktree 创建，你将改在当前目录中工作。然后在原地完成设置和基线测试。

## 步骤 3：项目设置

自动检测并执行适当的设置：

```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

## 步骤 4：验证干净基线

运行测试，确保工作区的起始状态干净：

```bash
# Use project-appropriate command
npm test / cargo test / pytest / go test ./...
```

**如果测试失败：** 报告失败，并询问是继续还是调查。

**如果测试通过：** 报告工作区已就绪。

### 报告

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## 快速参考

| 情况 | 操作 |
|-----------|--------|
| 已在链接 worktree 中 | 跳过创建（步骤 0） |
| 位于子模块中 | 作为普通仓库处理（步骤 0 防护） |
| 原生 worktree 工具可用 | 使用它（步骤 1a） |
| 没有原生工具 | 使用 Git worktree 后备方案（步骤 1b） |
| `.worktrees/` 存在 | 使用它（验证已忽略） |
| `worktrees/` 存在 | 使用它（验证已忽略） |
| 两者都存在 | 使用 `.worktrees/` |
| 两者都不存在 | 检查指令文件，然后默认使用 `.worktrees/` |
| 全局路径存在 | 使用它（向后兼容） |
| 目录未被忽略 | 加入 .gitignore 并提交 |
| 创建时遇到权限错误 | 使用沙箱后备方案，在当前目录工作 |
| 基线测试失败 | 报告失败并询问 |
| 没有 package.json/Cargo.toml | 跳过依赖安装 |

## 常见错误

### 与运行框架对抗

- **问题：** 平台已经提供隔离能力时仍使用 `git worktree add`
- **修正：** 步骤 0 检测现有隔离，步骤 1a 服从原生工具。

### 跳过检测

- **问题：** 在现有 worktree 内部创建嵌套 worktree
- **修正：** 创建任何内容前始终执行步骤 0。

### 跳过忽略验证

- **问题：** worktree 内容被 Git 跟踪，污染 git status
- **修正：** 创建项目内 worktree 前始终使用 `git check-ignore`。

### 擅自假定目录位置

- **问题：** 造成不一致，违反项目约定
- **修正：** 遵循优先级：现有目录 > 旧版全局目录 > 指令文件 > 默认目录。

### 在测试失败时继续

- **问题：** 无法区分新缺陷与预先存在的问题
- **修正：** 报告失败，并取得明确许可后再继续。

## 危险信号

**绝不要：**
- 步骤 0 检测到现有隔离时仍创建 worktree
- 有原生 worktree 工具（例如 `EnterWorktree`）时仍使用 `git worktree add`。这是最常见的错误——既然有，就使用它。
- 跳过步骤 1a，直接执行步骤 1b 的 git 命令
- 未验证项目内目录被忽略就创建 worktree
- 跳过基线测试验证
- 未经询问就在测试失败时继续

**始终做到：**
- 先执行步骤 0 的检测
- 优先使用原生工具，而非 git 后备方案
- 遵循目录优先级：现有目录 > 旧版全局目录 > 指令文件 > 默认目录
- 验证项目内目录被忽略
- 自动检测并运行项目设置
- 验证干净的测试基线

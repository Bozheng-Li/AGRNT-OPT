---
name: writing-plans
description: 在已有多步骤任务的规格或要求、尚未修改代码之前使用
---

# 编写计划

## 概述

编写完整的实施计划，并假设执行工程师对我们的代码库毫无上下文，而且品味值得怀疑。记录他们需要知道的一切：每项任务要修改哪些文件、具体代码、测试、可能需要查阅的文档，以及如何验证。将完整计划拆成小而具体的任务。遵循 DRY、YAGNI、TDD，并频繁提交。

假设对方是一名熟练开发者，但几乎不了解我们的工具集或问题领域。也假设对方不太懂得如何设计好测试。

**开始时声明：**“我正在使用 writing-plans 技能创建实施计划。”

**上下文：** 如果要在隔离 worktree 中工作，应在执行阶段通过 `superpowers:using-git-worktrees` 技能创建它。

**计划保存到：** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- 用户对计划位置的偏好会覆盖此默认值。

## 范围检查

如果规格覆盖多个相互独立的子系统，应该已经在头脑风暴阶段将它拆成多个子项目规格。如果尚未拆分，建议为每个子系统分别制定计划。每个计划都应独立产出可以运行、可以测试的软件。

## 文件结构

定义任务之前，先绘制将要创建或修改的文件，并说明每个文件的职责。分解决策会在这里确定下来。

- 设计边界清楚、接口明确的单元。每个文件应只有一项清晰职责。
- 能一次容纳在上下文中的代码最容易推理；文件越专注，编辑也越可靠。优先使用小而专注的文件，不要让大文件包揽过多职责。
- 会一起变化的文件应放在一起。按职责拆分，而不是按技术层拆分。
- 在现有代码库中遵循已经建立的模式。如果代码库使用大文件，不要擅自整体重构；但如果将要修改的文件已经难以驾驭，可以在计划中合理安排拆分。

这一结构会指导任务分解。每项任务都应产出自包含、独立合理的变更。

## 小粒度任务

**每一步只执行一个动作（2–5 分钟）：**
- “编写失败测试”——一步
- “运行测试并确认失败”——一步
- “实现使测试通过所需的最少代码”——一步
- “运行测试并确认通过”——一步
- “提交”——一步

## 计划文档头部

**每份计划都必须以以下头部开始：**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## 任务结构

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## 不使用占位符

每一步都必须包含工程师实际需要的内容。以下写法都是**计划失败**，绝不要写：
- “TBD”“TODO”“以后实现”“补充细节”
- “添加适当的错误处理”／“添加验证”／“处理边界情况”
- “为上述内容编写测试”（却不提供实际测试代码）
- “与任务 N 类似”（应重复写出代码——工程师可能不会按顺序阅读任务）
- 只描述做什么，却不展示如何做的步骤（代码步骤必须包含代码块）
- 引用在任何任务中都没有定义的类型、函数或方法

## 请记住
- 始终写出精确文件路径
- 每一步都提供完整代码——如果步骤会改变代码，就展示代码
- 提供精确命令和预期输出
- 遵循 DRY、YAGNI、TDD，并频繁提交

## 自我审查

完整计划写完后，以全新视角重新查看规格，并逐项核对计划。这是由你自己执行的清单，不是对子 Agent 的派发。

**1. 规格覆盖：** 浏览规格中的每个章节和要求。能指出实现它的具体任务吗？列出所有缺口。

**2. 占位符扫描：** 在计划中搜索危险信号——也就是上文“不使用占位符”列出的模式。修正它们。

**3. 类型一致性：** 后续任务使用的类型、方法签名和属性名是否与前面任务定义的一致？如果任务 3 调用 `clearLayers()`，而任务 7 却调用 `clearFullLayers()`，这就是缺陷。

发现问题后，直接在计划中修正。无需重新审查——修好并继续即可。如果发现某项规格要求没有对应任务，则添加该任务。

## 执行交接

保存计划后，提供执行方式选择：

**“计划已完成并保存到 `docs/superpowers/plans/<filename>.md`。有两种执行方式：**

**1. 子 Agent 驱动（推荐）**——我为每项任务派发一个全新的子 Agent，并在任务间进行审查，快速迭代

**2. 当前会话内执行**——在本会话中使用 executing-plans，分批执行并设置检查点

**选择哪种方式？”**

**如果选择子 Agent 驱动：**
- **必需的子技能：** 使用 superpowers:subagent-driven-development
- 每项任务使用全新的子 Agent，并进行两阶段审查

**如果选择当前会话内执行：**
- **必需的子技能：** 使用 superpowers:executing-plans
- 分批执行，并设置审查检查点

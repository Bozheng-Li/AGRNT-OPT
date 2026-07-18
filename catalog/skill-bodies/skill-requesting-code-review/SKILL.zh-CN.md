---
name: requesting-code-review
description: 在完成任务、实现重大功能或准备合并之前使用，用于验证工作是否符合要求
---

# 请求代码审查

派发代码审查子 Agent，在问题扩散之前发现它们。为审查者精确构造评估所需的上下文——绝不要传递当前会话的历史。这能让审查者专注于工作成果而非你的思考过程，也能保留你自己的上下文以继续工作。

**核心原则：** 尽早审查，频繁审查。

## 何时请求审查

**强制要求：**
- 在子 Agent 驱动开发的每个任务之后
- 完成重大功能之后
- 合并到 main 之前

**可选但很有价值：**
- 遇到阻塞时（获得全新视角）
- 重构之前（进行基线检查）
- 修复复杂缺陷之后

## 如何请求

**1. 获取 git SHA：**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. 派发代码审查子 Agent：**

使用 `general-purpose` 类型的 Task 工具，并填写 `code-reviewer.md` 中的模板。

**占位符：**
- `{DESCRIPTION}`——对所构建内容的简要概述
- `{PLAN_OR_REQUIREMENTS}`——它应当实现的行为
- `{BASE_SHA}`——起始提交
- `{HEAD_SHA}`——结束提交

**3. 处理反馈：**
- 立即修复 Critical 问题
- 继续工作前修复 Important 问题
- 记录 Minor 问题，稍后处理
- 如果审查者错误，用理由提出异议

## 示例

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code reviewer subagent]
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  PLAN_OR_REQUIREMENTS: Task 2 from docs/superpowers/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## 与工作流集成

**子 Agent 驱动开发：**
- 每个任务后都进行审查
- 在问题累积前发现它们
- 修复后再进入下一任务

**执行计划：**
- 每个任务后或在自然检查点进行审查
- 获取反馈、应用反馈，然后继续

**临时开发：**
- 合并之前进行审查
- 遇到阻塞时进行审查

## 危险信号

**绝不要：**
- 因为“很简单”就跳过审查
- 忽略 Critical 问题
- 在 Important 问题尚未修复时继续
- 与有效的技术反馈争辩

**如果审查者错误：**
- 使用技术推理提出异议
- 展示能证明实现正常工作的代码或测试
- 请求澄清

模板见：requesting-code-review/code-reviewer.md

---
name: using-superpowers
description: 在开始任何对话时使用——确立查找和使用技能的方式，并要求在作出任何回应（包括澄清问题）之前调用 Skill 工具
---

<SUBAGENT-STOP>
如果你是被派发来执行特定任务的子 Agent，请跳过此技能。
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
只要你认为某项技能有哪怕 1% 的可能适用于当前工作，就绝对必须调用该技能。

如果某项技能适用于你的任务，你没有选择余地。你必须使用它。

这不容协商，不是可选项，也不能靠任何自我辩解来绕过。
</EXTREMELY-IMPORTANT>

## 指令优先级

Superpowers 技能会覆盖默认系统提示的行为，但**用户指令始终拥有最高优先级**：

1. **用户的明确指令**（CLAUDE.md、GEMINI.md、AGENTS.md、直接请求）——最高优先级
2. **Superpowers 技能**——与默认系统行为冲突时覆盖默认行为
3. **默认系统提示**——最低优先级

如果 CLAUDE.md、GEMINI.md 或 AGENTS.md 要求“不要使用 TDD”，而某个技能要求“始终使用 TDD”，请遵循用户指令。控制权属于用户。

## 如何访问技能

**在 Claude Code 中：** 使用 `Skill` 工具。调用技能时，其内容会被加载并呈现给你——直接遵循它。绝不要使用 Read 工具读取技能文件。

**在 Copilot CLI 中：** 使用 `skill` 工具。技能会从已安装插件中自动发现。`skill` 工具与 Claude Code 的 `Skill` 工具工作方式相同。

**在 Gemini CLI 中：** 通过 `activate_skill` 工具激活技能。Gemini 会在会话开始时加载技能元数据，并按需激活完整内容。

**在其他环境中：** 查阅所在平台的文档，了解技能加载方式。

## 平台适配

技能使用 Claude Code 的工具名称。非 CC 平台请查看 `references/copilot-tools.md`（Copilot CLI）和 `references/codex-tools.md`（Codex），了解等效工具。Gemini CLI 用户会通过 GEMINI.md 自动加载工具映射。

# 使用技能

## 规则

**作出任何回应或采取任何行动之前，先调用相关或用户点名的技能。** 即使只有 1% 的可能适用，也应该调用技能进行检查。如果调用后发现该技能不适合当前情况，则无需继续使用。

```dot
digraph skill_flow {
    "User message received" [shape=doublecircle];
    "About to EnterPlanMode?" [shape=doublecircle];
    "Already brainstormed?" [shape=diamond];
    "Invoke brainstorming skill" [shape=box];
    "Might any skill apply?" [shape=diamond];
    "Invoke Skill tool" [shape=box];
    "Announce: 'Using [skill] to [purpose]'" [shape=box];
    "Has checklist?" [shape=diamond];
    "Create TodoWrite todo per item" [shape=box];
    "Follow skill exactly" [shape=box];
    "Respond (including clarifications)" [shape=doublecircle];

    "About to EnterPlanMode?" -> "Already brainstormed?";
    "Already brainstormed?" -> "Invoke brainstorming skill" [label="no"];
    "Already brainstormed?" -> "Might any skill apply?" [label="yes"];
    "Invoke brainstorming skill" -> "Might any skill apply?";

    "User message received" -> "Might any skill apply?";
    "Might any skill apply?" -> "Invoke Skill tool" [label="yes, even 1%"];
    "Might any skill apply?" -> "Respond (including clarifications)" [label="definitely not"];
    "Invoke Skill tool" -> "Announce: 'Using [skill] to [purpose]'";
    "Announce: 'Using [skill] to [purpose]'" -> "Has checklist?";
    "Has checklist?" -> "Create TodoWrite todo per item" [label="yes"];
    "Has checklist?" -> "Follow skill exactly" [label="no"];
    "Create TodoWrite todo per item" -> "Follow skill exactly";
}
```

## 危险信号

以下想法意味着停止——你正在自我辩解：

| 想法 | 事实 |
|---------|---------|
| “这只是一个简单问题” | 问题也是任务。检查技能。 |
| “我需要先获得更多上下文” | 技能检查发生在澄清问题之前。 |
| “让我先探索代码库” | 技能会告诉你如何探索。先检查。 |
| “我可以快速查看 git 或文件” | 文件没有对话上下文。先检查技能。 |
| “让我先收集信息” | 技能会告诉你如何收集信息。 |
| “这不需要正式技能” | 如果技能存在，就使用它。 |
| “我记得这个技能” | 技能会演进。阅读当前版本。 |
| “这不算任务” | 行动就是任务。检查技能。 |
| “使用技能有些小题大做” | 简单事情会变复杂。使用它。 |
| “我先只做这一件事” | 做任何事情之前先检查。 |
| “这样感觉很有产出” | 无纪律的行动浪费时间。技能能防止这种情况。 |
| “我知道那是什么意思” | 知道概念 ≠ 使用技能。调用它。 |

## 技能优先级

多项技能都可能适用时，按以下顺序使用：

1. **先使用流程技能**（头脑风暴、调试）——它们决定如何处理任务
2. **再使用实施技能**（前端设计、MCP 构建器）——它们指导具体执行

“构建 X” → 先进行头脑风暴，再使用实施技能。
“修复这个缺陷” → 先调试，再使用特定领域技能。

## 技能类型

**严格型**（TDD、调试）：必须精确遵循，不能通过调整来削弱其纪律。

**灵活型**（模式）：根据上下文应用其中的原则。

技能自身会说明它属于哪一类。

## 用户指令

指令说明做什么，而不是如何做。“添加 X”或“修复 Y”并不意味着可以跳过工作流。

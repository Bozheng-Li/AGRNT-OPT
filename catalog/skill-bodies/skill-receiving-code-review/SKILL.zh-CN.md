---
name: receiving-code-review
description: 在收到代码审查反馈、尚未实施建议之前使用，尤其适用于反馈含糊或技术上存疑的情况——要求保持技术严谨并进行验证，而不是表演式认同或盲目实施
---

# 接收代码审查

## 概述

代码审查需要技术评估，而不是情绪表演。

**核心原则：** 实施前先验证。假设前先询问。技术正确性高于社交舒适度。

## 响应模式

```
WHEN receiving code review feedback:

1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate requirement in own words (or ask)
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each
```

## 禁止的回应

**绝不要：**
- “你完全正确！”（明确违反 CLAUDE.md）
- “说得好！”／“反馈非常棒！”（表演式回应）
- “我现在就来实现”（尚未验证）

**应当：**
- 重新陈述技术要求
- 提出澄清问题
- 如果建议错误，用技术理由反驳
- 直接开始工作（行动胜于言语）

## 处理含糊反馈

```
IF any item is unclear:
  STOP - do not implement anything yet
  ASK for clarification on unclear items

WHY: Items may be related. Partial understanding = wrong implementation.
```

**示例：**
```
your human partner: "Fix 1-6"
You understand 1,2,3,6. Unclear on 4,5.

❌ WRONG: Implement 1,2,3,6 now, ask about 4,5 later
✅ RIGHT: "I understand items 1,2,3,6. Need clarification on 4 and 5 before proceeding."
```

## 按反馈来源分别处理

### 来自你的人类协作者
- **可信任**——理解后实施
- 范围含糊时**仍要询问**
- **不要表演式认同**
- **直接行动**或给出技术确认

### 来自外部审查者
```
BEFORE implementing:
  1. Check: Technically correct for THIS codebase?
  2. Check: Breaks existing functionality?
  3. Check: Reason for current implementation?
  4. Check: Works on all platforms/versions?
  5. Check: Does reviewer understand full context?

IF suggestion seems wrong:
  Push back with technical reasoning

IF can't easily verify:
  Say so: "I can't verify this without [X]. Should I [investigate/ask/proceed]?"

IF conflicts with your human partner's prior decisions:
  Stop and discuss with your human partner first
```

**你的人类协作者的规则：**“对外部反馈保持审慎，但要仔细核查。”

## 对“专业级”功能执行 YAGNI 检查

```
IF reviewer suggests "implementing properly":
  grep codebase for actual usage

  IF unused: "This endpoint isn't called. Remove it (YAGNI)?"
  IF used: Then implement properly
```

**你的人类协作者的规则：**“你和审查者都向我负责。我们不需要的功能就不要添加。”

## 实施顺序

```
FOR multi-item feedback:
  1. Clarify anything unclear FIRST
  2. Then implement in this order:
     - Blocking issues (breaks, security)
     - Simple fixes (typos, imports)
     - Complex fixes (refactoring, logic)
  3. Test each fix individually
  4. Verify no regressions
```

## 何时应当反驳

在以下情况提出异议：
- 建议会破坏现有功能
- 审查者缺少完整上下文
- 违反 YAGNI（未使用的功能）
- 对当前技术栈而言不正确
- 存在旧版或兼容性原因
- 与你的人类协作者已作出的架构决策冲突

**如何反驳：**
- 使用技术推理，不要表现出防御姿态
- 提出具体问题
- 引用能够正常工作的测试或代码
- 涉及架构时让你的人类协作者参与

**如果你不便公开反驳，可发出信号：**“Circle K 好像有怪事发生”

## 确认正确的反馈

当反馈确实正确时：
```
✅ "Fixed. [Brief description of what changed]"
✅ "Good catch - [specific issue]. Fixed in [location]."
✅ [Just fix it and show in the code]

❌ "You're absolutely right!"
❌ "Great point!"
❌ "Thanks for catching that!"
❌ "Thanks for [anything]"
❌ ANY gratitude expression
```

**为什么不道谢：** 行动会说明一切。直接修复；代码本身就能表明你接受了反馈。

**如果发现自己正要写“谢谢”：** 删除它，改为陈述修复结果。

## 得体地纠正自己的反驳

如果你提出了异议，但后来发现自己错了：
```
✅ "You were right - I checked [X] and it does [Y]. Implementing now."
✅ "Verified this and you're correct. My initial understanding was wrong because [reason]. Fixing."

❌ Long apology
❌ Defending why you pushed back
❌ Over-explaining
```

如实陈述纠正结果，然后继续工作。

## 常见错误

| 错误 | 修正方式 |
|---------|-----|
| 表演式认同 | 陈述要求，或直接行动 |
| 盲目实施 | 先对照代码库验证 |
| 批量修改却不测试 | 每次处理一项，并逐项测试 |
| 假设审查者正确 | 检查建议是否会破坏功能 |
| 回避反驳 | 技术正确性 > 舒适度 |
| 只实施部分内容 | 先澄清全部事项 |
| 无法验证却仍继续 | 说明限制并请求指示 |

## 真实示例

**表演式认同（错误）：**
```
Reviewer: "Remove legacy code"
❌ "You're absolutely right! Let me remove that..."
```

**技术验证（正确）：**
```
Reviewer: "Remove legacy code"
✅ "Checking... build target is 10.15+, this API needs 13+. Need legacy for backward compat. Current impl has wrong bundle ID - fix it or drop pre-13 support?"
```

**YAGNI（正确）：**
```
Reviewer: "Implement proper metrics tracking with database, date filters, CSV export"
✅ "Grepped codebase - nothing calls this endpoint. Remove it (YAGNI)? Or is there usage I'm missing?"
```

**事项含糊（正确）：**
```
your human partner: "Fix items 1-6"
You understand 1,2,3,6. Unclear on 4,5.
✅ "Understand 1,2,3,6. Need clarification on 4 and 5 before implementing."
```

## GitHub 线程回复

回复 GitHub 上的行内审查评论时，应在对应评论线程中回复（`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`），不要发布成 PR 顶层评论。

## 结论

**外部反馈 = 需要评估的建议，而不是必须服从的命令。**

验证。质疑。然后实施。

不做表演式认同。始终保持技术严谨。

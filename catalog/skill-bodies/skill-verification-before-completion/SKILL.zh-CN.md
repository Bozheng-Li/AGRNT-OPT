---
name: verification-before-completion
description: 在准备声称工作已完成、已修复或已通过时，以及提交或创建 PR 之前使用——要求先运行验证命令并确认输出，才能作出任何成功声明；始终先有证据，再作断言
---

# 完成前验证

## 概述

未经验证就声称工作已经完成，是不诚实，而不是高效。

**核心原则：** 始终先有证据，再作声明。

**违背这条规则的字面要求，就是违背其根本精神。**

## 铁律

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

如果没有在当前消息中运行验证命令，就不能声称它已经通过。

## 门禁函数

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## 常见失败

| 声明 | 所需证据 | 不足以证明 |
|-------|----------|----------------|
| 测试通过 | 测试命令输出：0 个失败 | 之前的运行、“应该会通过” |
| Linter 干净 | Linter 输出：0 个错误 | 局部检查、外推结论 |
| 构建成功 | 构建命令：退出码 0 | Linter 通过、日志看起来正常 |
| 缺陷已修复 | 原始症状测试通过 | 代码已修改、假定已经修复 |
| 回归测试有效 | 已验证红—绿循环 | 测试只通过一次 |
| Agent 已完成 | VCS diff 显示变更 | Agent 报告“成功” |
| 满足要求 | 逐行核对清单 | 测试通过 |

## 危险信号——停止

- 使用“应该”“大概”“看起来”等词
- 验证前表达满意（“太好了！”“完美！”“完成！”等）
- 未验证就准备提交、推送或创建 PR
- 信任 Agent 的成功报告
- 依赖局部验证
- 认为“就破例这一次”
- 因疲惫而只想结束工作
- **任何在没有运行验证时暗示成功的措辞**

## 防止自我辩解

| 借口 | 事实 |
|--------|---------|
| “现在应该能用了” | 运行验证 |
| “我很有信心” | 信心 ≠ 证据 |
| “就破例这一次” | 没有例外 |
| “Linter 已通过” | Linter ≠ 编译器 |
| “Agent 说成功了” | 独立验证 |
| “我累了” | 疲惫 ≠ 借口 |
| “局部检查已经足够” | 局部检查什么也证明不了 |
| “换了说法，规则就不适用” | 精神高于字面 |

## 关键模式

**测试：**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**回归测试（TDD 红—绿）：**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**构建：**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**要求：**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent 委派：**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

## 为什么这很重要

来自 24 次失败记忆：
- 你的人类协作者说“我不相信你”——信任已经破裂
- 未定义函数被交付——运行时会崩溃
- 缺少要求的内容被交付——功能不完整
- 虚假的完成声明导致浪费时间 → 纠正方向 → 返工
- 违反原则：“诚实是核心价值。如果你说谎，就会被替换。”

## 何时应用

**以下事项之前始终应用：**
- 任何形式的成功或完成声明
- 任何满意表达
- 任何对工作状态的正面陈述
- 提交、创建 PR、完成任务
- 进入下一项任务
- 委派给 Agent

**规则适用于：**
- 完全相同的措辞
- 改写和同义表达
- 对成功的暗示
- 任何表示已完成或正确的沟通

## 结论

**验证没有捷径。**

运行命令。阅读输出。然后才能作出声明。

这不容协商。

---
name: evaluate-skill
description: 以工程师易于理解的语言评估本地 Codex 技能。当用户说“评估这个技能”“分析一下这个游戏开发技能”“审计这个技能”“为什么会得到这个分数”“我应该先修复什么”，或在进行基准测试前要求一份技能专属报告时，请使用此技能。
---

# 评估技能

当目标是本地技能目录或 `SKILL.md` 文件时，请使用此技能。

## 工作流

1. 将“评估这个技能。”视为默认入口。
2. 如果用户提供技能名称而不是路径，先在本地解析它；优先检查 `~/.codex/skills/<skill-name>`，然后检查仓库内的 `skills/<skill-name>`。
3. 如果用户先用自然语言提出请求，请使用 `plugin-eval start <skill-path> --request "<user request>" --format markdown`，清楚展示路由后的路径。
4. 运行 `plugin-eval analyze <skill-path> --format markdown`。
5. 在深入查看详细信息之前，先审阅 `At a Glance`、`Why It Matters`、`Fix First` 和 `Recommended Next Step`。
6. 解释哪些发现与结构有关、哪些与预算有关、哪些与代码有关。
7. 如果用户要求对技能进行“分析”，不要止步于报告。还要运行 `plugin-eval init-benchmark <skill-path>`，并展示用于完善 `.plugin-eval/benchmark.json` 中入门场景的设置问题。
8. 如果用户需要真实使用数据，请切换到“测量这个技能的真实 token 用量。”并运行基准测试流程。
9. 获得观测使用数据后，使用 `plugin-eval measurement-plan <skill-path> --observed-usage <usage.jsonl> --format markdown`，推荐下一步应检测或改进的内容。
10. 如果用户需要重写计划，请路由到 `../improve-skill/SKILL.md`。

## 技能专属优先事项

- frontmatter 有效性
- `name` 和 `description` 的质量
- 渐进式披露和参考资料的使用
- 损坏的相对链接
- 过大的 `SKILL.md` 或 description
- TypeScript 和 Python 文件的辅助脚本质量

## 需要识别的聊天请求

- `Evaluate this skill.`
- `Give me an analysis of the game dev skill.`
- `Audit this skill.`
- `Why did this skill score that way?`
- `What should I fix first?`
- `Measure the real token usage of this skill.`

## 命令

```bash
plugin-eval start <skill-path> --request "Evaluate this skill." --format markdown
plugin-eval analyze <skill-path> --format markdown
plugin-eval explain-budget <skill-path> --format markdown
plugin-eval measurement-plan <skill-path> --format markdown
plugin-eval init-benchmark <skill-path>
plugin-eval benchmark <skill-path> --dry-run
```

## 参考资料

- `../../references/chat-first-workflows.md`

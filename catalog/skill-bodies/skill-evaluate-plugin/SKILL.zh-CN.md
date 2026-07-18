---
name: evaluate-plugin
description: 以工程师易于理解的语言评估本地 Codex 插件。当用户说“评估这个插件”“审计这个插件”“为什么会得到这个分数”“我应该先修复什么”“帮我对这个插件做基准测试”，或在比较版本前要求一份插件级报告时，请使用此技能。
---

# 评估插件

当目标是一个包含 `.codex-plugin/plugin.json` 的插件根目录时，请使用此技能。

## 工作流

1. 将“评估这个插件。”视为默认入口。
2. 如果请求以自然聊天语言提出，先使用 `plugin-eval start <plugin-root> --request "<user request>" --format markdown`，让用户看到路由后的本地路径。
3. 运行 `plugin-eval analyze <plugin-root> --format markdown`。
4. 在深入查看 manifest 发现、嵌套技能发现以及代码或覆盖率详情之前，先阅读 `Fix First`。
5. 如果插件包含多个技能，请明确总结其中最强和最弱的技能。
6. 如果用户需要实测使用情况，请切换到“帮我对这个插件做基准测试。”并使用入门基准测试流程。
7. 如果用户需要趋势数据，请使用 `plugin-eval compare` 比较两个 JSON 输出。

## 需要识别的聊天请求

- `Evaluate this plugin.`
- `Audit this plugin.`
- `Why did this score that way?`
- `What should I fix first?`
- `Help me benchmark this plugin.`
- `What should I run next?`

## 命令

```bash
plugin-eval start <plugin-root> --request "Evaluate this plugin." --format markdown
plugin-eval analyze <plugin-root> --format markdown
plugin-eval start <plugin-root> --request "What should I run next?" --format markdown
plugin-eval compare before.json after.json
plugin-eval report result.json --format html --output ./plugin-eval-report.html
plugin-eval init-benchmark <plugin-root>
plugin-eval benchmark <plugin-root> --dry-run
```

## 参考资料

- `../../references/chat-first-workflows.md`

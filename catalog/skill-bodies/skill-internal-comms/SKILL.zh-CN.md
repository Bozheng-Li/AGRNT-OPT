---
name: internal-comms
description: 一组帮助我按照公司偏好的格式撰写各类内部沟通材料的资源。只要用户要求撰写某种内部沟通材料（状态报告、管理层更新、3P 更新、公司通讯、FAQ、事件报告、项目更新等），Claude 都应使用此技能。
license: 完整条款见 LICENSE.txt
---

## 何时使用此技能
撰写内部沟通材料时，将此技能用于：
- 3P 更新（进展、计划、问题，即 Progress、Plans、Problems）
- 公司通讯
- FAQ 回复
- 状态报告
- 管理层更新
- 项目更新
- 事件报告

## 如何使用此技能

撰写任何内部沟通材料时：

1. 从请求中**识别沟通类型**
2. 从 `examples/` 目录中**加载相应的指南文件**：
    - `examples/3p-updates.md` - 用于团队的 Progress/Plans/Problems 更新
    - `examples/company-newsletter.md` - 用于全公司通讯
    - `examples/faq-answers.md` - 用于回答常见问题
    - `examples/general-comms.md` - 用于上述类型均未明确涵盖的其他内容
3. **遵循该文件中的具体说明**，完成格式编排、语气控制和内容收集

如果沟通类型与任何现有指南都不匹配，请要求用户澄清或提供更多有关期望格式的上下文。

## 关键词
3P 更新、公司通讯、公司内部沟通、每周更新、FAQ、常见问题、更新、内部沟通

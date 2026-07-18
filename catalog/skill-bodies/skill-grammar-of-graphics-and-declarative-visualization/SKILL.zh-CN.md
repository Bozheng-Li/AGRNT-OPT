---
name: grammar-of-graphics-and-declarative-visualization
description: 使用声明式语法构建数据可视化。适用于用户需要 Vega-Lite、Vega、Observable Plot 或图形语法推理的场景，尤其适合不需要定制渲染的表格型图表。
---

# 图形语法与声明式可视化

## 概述

对于许多表格型图表，应将此技能作为默认实现路径。当图表可以表达为“数据 + 标记 + 编码 + 变换”时，声明式语法往往是最快、最清晰且最易维护的实现路径。

此技能涵盖 Vega-Lite、Vega 和 Observable Plot。默认选择能够清晰表达所需图表与交互的最高层级工具。

## 选择规则

1. 在 JavaScript 中进行快速探索和解释型制图，且精简代码很有价值时，使用 Observable Plot。
2. 需要可移植的声明式 spec、多视图组合、变换以及易于嵌入的图表定义时，使用 Vega-Lite。
3. 用户需要更底层的控制，同时仍能受益于声明式运行时时，使用 Vega。
4. 只有当图表需要定制布局、极端密度、GPU 规模渲染、粒子、真正的 3D，或语法已无法清晰表达的渲染控制时，才离开此技能并转用 D3、Canvas 或 Three.js/WebGL 技能。

## 工作模式

1. 规范化表格形态。
2. 明确说出标记、编码、变换、分面和交互模型。
3. 选择无需勉强变通即可支持图表的最高层级语法。
4. 保持 spec 可读、可移植。
5. 检查声明式方法是否仍适合页面上预计同时出现的图表实例数量。
6. 检查移动端竖屏和可选横屏行为：响应式 spec、标签/刻度缩减、悬停替代方式、触控目标策略，以及该语法能否在控件周围保持主要可视化可见。
7. 在编写自定义代码前，先使用声明式组合。

## 输出要求

- 解释为何所选语法比定制渲染更合适。
- 保持 spec 足够易读，以便跨技术栈复用、嵌入或转换。
- 指出声明式路径何时已接近极限，需要由更底层技能接手。
- 说明该语法能否支持移动端概念契约，或者是否应由 D3、Canvas、WebGL 或框架自主管理的布局接手。
- 对新工作，包含技术设计一节，涵盖实例数量假设、性能影响，以及保持声明式所带来的维护优势。

## 参考资料

- 共享理论：
  - `../../references/foundations/task-abstraction-and-chart-selection.md`
  - `../../references/foundations/perception-color-and-encoding.md`
  - `../../references/foundations/mobile-first-responsive-visualization.md`
  - `../../references/foundations/implementation-design-and-tradeoffs.md`
- 技能参考资料：
  - `./references/vega-lite-and-vega.md`
  - `./references/observable-plot.md`
  - `./references/when-to-stay-declarative.md`

## 代表性提示词

- “为这个数据集编写 Vega-Lite spec。”
- “这个图表应使用 Plot、Vega-Lite 还是 D3？”
- “构建带有分面和 tooltip 的分层声明式图表。”
- “告诉我这个声明式方法何时不再合适。”

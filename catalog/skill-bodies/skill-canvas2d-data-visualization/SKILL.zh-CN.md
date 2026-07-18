---
name: canvas2d-data-visualization
description: 使用 Canvas2D 渲染数据可视化。当可视化需要大量标记、快速重绘、立即模式渲染、自定义命中测试，或 Canvas 与 SVG/HTML 混合架构时，请使用此技能。
---

# Canvas2D 数据可视化

## 概述

当栅格渲染是实际可行的选择时，请使用此技能。Canvas2D 擅长密集散点图、迷你折线图墙、热力图、流式轨迹、分块时间线、可拖拽分析工作区，以及其他 SVG 或 DOM 开销成为限制因素的视图。

默认假设：即使实际绘制采用立即模式 Canvas，也要在应用程序状态中保留场景模型。
任何能用 SVG 构建的可视化或交互通常也能用 Canvas2D 构建，但保留式几何、命中测试、焦点模型和无障碍层将成为应用程序的责任。为了性能或渲染控制而选择 Canvas；当原生 DOM 语义、文本、无障碍或可导出性比重绘速度更重要时，保留 SVG/HTML。
对于平面的立即模式工作负载，Canvas2D 也可能比 WebGL 更简单或更快，因为它无需设置着色器、上传缓冲区、承受 GPU 上下文压力，也无需自定义 WebGL 生命周期代码。当 GPU 拾取、着色器效果、粒子数量、自定义混合、流畅动画、真正的 3D 或大规模地理空间图层足以证明额外复杂性合理时，再从 Canvas2D 转向 WebGL。

对于面向浏览器的 Canvas 工作，请使用 `../../references/foundations/mobile-first-responsive-visualization.md`，把后备存储尺寸、命中测试、触控手势、键盘覆盖层、网络不稳定状态和移动端性能预算纳入设计契约。

## 适合选择 Canvas2D 的情况

- 图表需要数万到数百万个标记
- 平移或缩放必须流畅
- 视图持续更新
- 页面需要许多重复的微型图表，例如表格或 KPI 网格中的迷你折线图
- 同时可见许多图表实例，SVG 节点数将主导布局、样式和内存成本
- 密集几何上的标记需要自定义的点击、悬停、刷选或拖拽行为
- 可以接受栅格输出，或能提供单独的导出路径
- 图表受益于分层绘制控制，包括密集标记后面的静态上下文背景

当图表小型、静态、文本密集、注释密集、主要由无障碍需求驱动，或需要直接复制/粘贴及可编辑矢量导出时，优先使用 SVG、HTML 或声明式语法。
当图表需要 GPU 规模粒子、自定义着色器、实例化、超大图或点图层、3D，或 Canvas2D 难以流畅动画或交互拾取的地图覆盖层时，优先使用 WebGL 或 Three.js/WebGL 技能。

## 核心实践

1. 针对浏览器缩放和高 DPI 输出缩放后备存储：
   - 以 CSS 像素设置 CSS `style.width` 和 `style.height`
   - 将 `canvas.width` 和 `canvas.height` 属性设置为 `cssSize * pixelRatio`
   - 使用 `globalThis.devicePixelRatio || 1` 作为可感知页面缩放的比例
   - 仅在有意为捏合缩放的清晰度重绘时考虑 `visualViewport.scale`
   - 使用 `ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)` 重置上下文，使绘制代码可以继续使用 CSS 像素
2. 保持世界坐标到屏幕坐标的变换显式可见。
3. 将分层 Canvas 用于：
   - 静态背景，包括任何场地、球场、平面图、示意图或其他上下文界面
   - 主要标记
   - 高亮或悬停状态
   - 交互覆盖层
4. 可以局部失效时，避免完整重绘。
5. 构建确定性的命中测试：
   - 空间索引
   - 颜色拾取缓冲区
   - 最近点搜索
   - 对候选子集重放 `Path2D` 几何，并使用 `isPointInPath()` 和 `isPointInStroke()`
   - 对点、线段、矩形、区间和带状区域等简单形状采用解析测试
6. 评估可同时显示多少 Canvas 实例，因为在仪表板规模下，后备存储尺寸和重绘成本会迅速成倍增加。
7. 将指针交互视为一等子系统：
   - 通过 `getBoundingClientRect()` 归一化 `PointerEvent.clientX/clientY`
   - 在映射到数据坐标前，对当前平移/缩放变换求逆
   - 拖拽时使用 `setPointerCapture()`，以便指针移出 Canvas 后仍继续移动
   - 在 `pointerup`、`pointercancel` 和 `lostpointercapture` 时清理拖拽状态
   - 针对触控和触控笔界面有意设置 `touch-action`
   - 为粗精度指针上的小标记提供非拖拽替代方案和扩大的不可见命中区域
   - 当 Canvas 标记在语义上很重要时，在 HTML 中保留键盘和屏幕阅读器辅助功能
8. 对于移动端，定义单指拖动是平移图表还是滚动页面、捏合缩放由图表还是浏览器接管，以及重置或显式缩放控件如何工作。

## 混合架构

- Canvas 用于批量标记
- SVG 或 HTML 用于坐标轴、标签、图例、丰富的工具提示、菜单、表单控件、键盘焦点和注释
- 两层共用比例尺和变换

这通常优于强迫 Canvas 承担所有职责。对于需要原生布局、选择、输入、焦点环、链接或无障碍语义的元素，使用绝对定位的 HTML 覆盖层；通过从 Canvas 渲染器所用的同一世界坐标到屏幕坐标变换推导每个覆盖层的位置，使其保持同步。
对于迷你折线图和其他微型图表，邻近的行标签、表头和行内数值通常比共享的分离式图例效果更好。

## 性能默认值

- 批处理绘制调用
- 预计算样式分组
- 对几何密集型视图使用类型化数组
- 剔除屏幕外标记
- 当视口无法分辨单个点时进行抽稀或聚合
- 当主线程争用明显时使用 `OffscreenCanvas` 和 worker
- 除非确实需要 Canvas 文本，否则将文本和注释放在 HTML 或 SVG 中
- 当内存问题显现时，对于大型迷你折线图表格，优先使用一个共享 Canvas 层或虚拟化，而不是数百个独立后备存储
- 按 `width * height * pixelRatio^2 * 4 * layerCount * instanceCount` 计算后备存储内存
- 当内存、电池或热压力超过清晰度收益时，在移动端限制像素比或质量
- 在 HTML 或轻量 Canvas 层中保留陈旧/离线/部分数据覆盖层，而不是在网络恢复期间清空图表
- 仅对反复调用 `getImageData()` 的 Canvas（如颜色拾取缓冲区）使用 `getContext("2d", { willReadFrequently: true })`

## 输出要求

- 解释为什么 Canvas 比 SVG 更适合该工作负载。
- 如果 SVG 也可行，请说明 Canvas 引入的交互、无障碍和维护成本，以及为什么性能权衡仍然值得。
- 明确说明标签和无障碍策略。
- 对于大量迷你折线图的视图，解释周围的表格或卡片上下文如何承载含义，而不迫使用户查找图例。
- 对于可点击或可拖拽的 Canvas 视图，指定命中测试策略以及如何将指针坐标映射到数据坐标。
- 对于移动端 Canvas 视图，在相关时指定触控目标策略、指针捕获、拖拽替代方案、捏合/缩放所有权、可视视口或键盘行为、DPR 上限，以及低带宽/陈旧数据行为。
- 对于颜色拾取缓冲区，指定 id 编码、alpha 与抗锯齿假设、`getImageData()` 回读成本，以及缓冲区何时失效。
- 对于可缩放或可调整大小的 Canvas 视图，指定如何处理 CSS 尺寸、后备存储属性、`devicePixelRatio` 和重绘失效。
- 对于 HTML 覆盖层，指定哪一层负责指针事件、焦点、工具提示定位和无障碍语义。
- 如果设计包含上下文界面，请记录其源几何，并使覆盖层、标签和命中测试与同一坐标变换保持一致。
- 保留一条通往导出素材的路径，通常是 PNG 加上可选的矢量配套视图。
- 对于新工作，加入技术设计章节，涵盖同时存在的实例数量、每个实例的内存与重绘成本，以及混合架构的维护权衡。

## 参考资料

- 共享理论：
  - `../../references/foundations/perception-color-and-encoding.md`
  - `../../references/foundations/mobile-first-responsive-visualization.md`
  - `../../references/foundations/domain-contextual-surfaces.md`
  - `../../references/foundations/implementation-design-and-tradeoffs.md`
- 技能参考资料：
  - `./references/rendering-architecture.md`
  - `./references/high-density-interaction.md`
  - `./references/performance-playbook.md`
  - `./references/sparklines-and-microcharts.md`

## 代表性提示

- “在浏览器中渲染一个包含一百万个点的散点图。”
- “构建一个支持刷选和缩放的快速 Canvas 时间线。”
- “把这个 SVG 热力图迁移到 Canvas，同时保留标签。”
- “为数据表中的每一行渲染迷你折线图。”
- “为密集 Canvas 图表设计命中测试。”
- “解释如何将这个可视化拆分到多个 Canvas 层。”
- “让这些 Canvas 标记可点击、可拖拽。”
- “修复浏览器缩放时这个模糊的 Canvas 图表。”

---
name: data-visualization
description: 为 Web 数据可视化工作进行路由。当用户需要图表选择、视觉评审、仪表板、地图或地理空间视图、Gantt 时间线、UML/软件图示、滚动叙事、报告或导出、测试、无障碍、浏览器实现，或概念优先的视觉设计时，请使用此技能。
---

# Web 数据可视化

## 概述

将此技能用作插件的隐式编排器。先对任务分类，选择最小且有用的专用技能集合并完成路由，再深入处理图表、渲染器、测试、无障碍或导出工作。除非此路由器将任务移交给专用技能，否则专用技能始终只能显式调用。

默认立场：最好的可视化，是以最低解码负担如实回答用户问题的最简单视图。首先保证证据质量：正确的任务抽象、可信的数据处理、可见的限定条件、直接标签、无障碍编码、移动端可行性、可共享状态和质量保证。除非仪表板、3D、动画、生成式图像、粒子或 WebGL 承载分析含义，否则不要默认使用它们。

上下文图像、氛围性标记和动态效果必须承载证据。不要用大面积半透明笔触、纤细飘带、散景/光球、电影式壁纸、图库照片薄雾或装饰性渐变替代数据层。当出现运动、流动、密度、强度或扩散时，应使用测量得到或明确为示意性的等值线、采样场、轨迹、有明确定义单位或含义的粒子，或带注释的图层来编码。

移动端是主要界面。除非用户明确排除移动端，否则将大屏和移动端竖屏视为同级状态。当宽幅基底、AR/相机/运动、双手交互或键盘密集型工作流需要时，再增加移动端横屏状态。

## 路由器工作流

1. 对分析任务进行分类：比较/排名、时间变化、分布/不确定性、相关性、组成/流动、层级/网络、软件/系统结构、进度计划、监控、地理信息或导出/报告。
2. 对数据形态进行分类：表格、时间序列、多变量、矩阵、树/图、语义图示源、进度/项目计划、地理空间、数据流，或生成/模拟的故事数据。
3. 锁定交付约束：静态还是交互式、探索型还是解释型、浏览器/仪表板/报告/PDF/幻灯片、复用程度、规模、更新频率、导出、大屏/移动端状态、触控/键盘/捏合手势、传感器、告警、带宽和持久化。
4. 在选择渲染器之前定义阅读路径：洞察标题、即时证据、按需详情、标签/图例/控件、限定条件、移动端顺序，以及面板折叠时哪些内容应保持可见。
5. 明确定义状态：由 URL 支持的筛选器、选择项、范围、缩放/地图/相机、标签页、下钻、已保存视图 id、本地/IndexedDB/远程持久化、无效状态、复制链接、刷新和后退按钮行为。
6. 选择上下文基底是否有帮助：地图、场地/球场/赛道、平面图、系统示意图、地形、物体剖视图或其他领域界面。仅当它能改善定位或标记放置时才使用。
7. 路由到范围最窄的专用技能。如果请求跨越多个视觉层，请阅读 `../../references/foundations/embedded-visualization-self-use.md`，盘点各层、分配负责人，并对实质性图层采用专用技能处理轮次。
8. 对新的实现工作，在编码前提供紧凑的技术设计：实例数量、数据/交互特征、渲染器所有权、URL/持久化契约、移动端性能、页面级成本、维护权衡、后备方案和质量保证。
9. 对高级视觉设计，使用 `../../references/foundations/meaning-preserving-visual-design-workflow.md` 和 `../../references/foundations/mobile-first-responsive-visualization.md`；生成大屏和移动端概念方案，暂停并等待批准，然后将获批方案视为语义契约。

## 路由矩阵

- 策略与评审：图表选择、层级、叙事论点、视觉评审、反模式、布局推理。
- 声明式语法：适合 Vega-Lite、Vega、Observable Plot 或类似语法的标准表格数据图表。
- D3/SVG：定制的 SVG/DOM 几何形状、直接标签、坐标轴、注释、过渡或清晰的矢量精修。
- Canvas2D：密集的平面标记、频繁重绘、自定义命中测试、迷你折线图表格或重复的微型图表。
- Three.js/WebGL：当分析价值足以支持使用时，用于 GPU 规模标记、粒子、流动、着色器效果、真正的 3D、deck.gl、PixiJS、Sigma.js、CesiumJS、luma.gl 或原始 WebGL。
- 地理空间：地图、投影、底图、专题图层、可平移缩放式地图/产品地图、路线、缩放行为或制图交互。
- 仪表板：监控、数据流、协调视图、告警、陈旧/离线状态和运营工作区。
- 统计：分布、区间、不确定性、缺失值、聚合、采样和分析严谨性。
- Gantt：项目进度、任务时间段、里程碑、依赖关系、基线、关键路径、资源，以及项目管理工具的导入/导出。
- 节点—链接布局：图自动布局、交叉、边路由、重叠、稳定性、力导向/分层/树形/径向布局。
- UML/软件架构：UML、C4、ERD、BPMN、时序图/类图/活动图/状态图、PlantUML、Mermaid、DOT、D2、Structurizr、DBML、XMI/UMLDI。
- 滚动叙事：滚动驱动状态、粘性图形、视差、moviescroller、Scrollama、ScrollTrigger、ScrollTimeline、关键帧、减少动态场景。
- React/Next.js：组件所有权、水合、客户端/服务端边界、动态加载、路由/搜索参数状态、包体和导出集成。
- TypeScript 工程：类型化数据契约、可复用 API、运行时边界、渲染器适配器、URL 编解码器、保存视图模式。
- 测试：单元/组件/E2E、视觉回归、模拟、仪表板质量保证、Canvas/WebGL 就绪状态、导出，以及避免脆弱测试。
- 无障碍：文本替代方案、对比度、冗余编码、键盘/屏幕阅读器路径、减少动态、包容性审查。
- 报告/幻灯片：PDF、PowerPoint/Google Slides、文档嵌入、图形打包、导出素材和重新生成。

路由不明确时，请阅读 `./references/route-by-problem.md` 或 `./references/prompt-routing-examples.md`。技术栈选择不明确时，请阅读 `./references/default-stack-selection.md`。

## 质量门槛

- 当存在合理替代方案时，回答必须说明分析任务、图表或制品类别、主要路由和后备路由。
- 解释型工作需要洞察标题、核心结论、制品模式、注释计划、来源/限定条件位置和移动端阅读路径。
- 优先使用直接标签、嵌入式图例、分面小图、单元格内图形和注释，而不是分离式图例、同等权重仪表板或仅靠悬停发现信息。
- 使用颜色角色账本：中性上下文、主要焦点强调色、可选的对比强调色，并为选中/聚焦/告警状态单独处理。检查对比度、灰度表现和色觉缺陷适应力。
- 将无障碍、移动端、导出、URL 状态、持久化和质量保证视为设计输入，而不是收尾工作。
- 保持关键数值在无需悬停时也可见。在移动端，用轻触/焦点替代悬停，扩大命中区域，提供拖拽/捏合替代方案，并避免控件堆叠遮住主要证据。
- 对实时或远程数据，优先采用“陈旧但可见”的视图，提供最后更新时间、实时/陈旧/离线/部分状态、重连行为和低带宽降级方案。
- 优先顺序为：先声明式语法；当标签/坐标轴占主导时，D3/SVG 优先于 Canvas；对于简单的密集平面标记，Canvas 优先于 WebGL；仅当规模、拾取、着色器、粒子、流动、地理空间图层或深度确有必要时，才使用 WebGL/3D。
- 动态效果、粒子、生成式图像、领域基底和 3D 必须有明确的分析目的，并提供静态/减少动态后备方案。
- 仅当编辑式主视觉和背景基底能够改善定位、尺度、地点、机制或标签安全上下文时才使用。安静的底图、地形、细致的制图线条、真实/生成纹理或清晰的照片裁剪，优于泛化的氛围效果。
- 加入针对泛化 AI 氛围效果的艺术指导质量保证环节：大面积笔触、纤细飘带、散景/光球、单色调戏剧效果、电影式壁纸，以及看似精致却不承载证据或定位信息的背景视觉。
- 对敏感的地缘政治、冲突、灾难、流离失所或人道主义工作，使用 `../../references/foundations/sensitive-geopolitical-and-humanitarian-stories.md`；区分实测、估算、有争议、带日期和示意性图层。
- 对虚构或说明性故事，使用 `../../references/foundations/fictional-data-story-simulation.md`；要求有足够多的确定性模拟数据来支撑视觉密度。
- 将视觉参考视为原则研究。转换其理念，使输出不会被误认为参考作品的布局、调色板、字体系统、场景或节奏。

## 响应契约

- 对于建议：给出主要路由、后备路由、图表/制品类别、技术栈适配性、即时证据、按需详情、移动端路径、URL/持久化状态、无障碍说明和质量保证检查。
- 对于实现：路由到范围最窄的专用技能，然后在编辑前说明渲染器所有权、坐标/数据编码、交互状态、后备/渲染就绪行为、实例数量假设、性能风险和测试。
- 对于概念优先的视觉设计：使用共享设计工作流，展示所需概念集，在实现前请求批准，然后将获批概念作为语义契约保留。
- 对于复合交付物：说明嵌入式可视化清单、每个有意义图层的专用负责人、微型简报、质量保证检查，以及委派/本地全新处理轮次的状态。

## 参考资料

- 路由器参考资料：`./references/route-by-problem.md`、`./references/default-stack-selection.md`、`./references/prompt-routing-examples.md`。
- 核心基础：`../../references/foundations/task-abstraction-and-chart-selection.md`、`../../references/foundations/perception-color-and-encoding.md`、`../../references/foundations/shareable-state-and-persistence.md`、`../../references/foundations/mobile-first-responsive-visualization.md`、`../../references/foundations/layout-hierarchy-and-self-explanatory-ux.md`、`../../references/foundations/implementation-design-and-tradeoffs.md`。
- 高级工作流：`../../references/foundations/editorial-infographic-system.md`、`../../references/foundations/art-directed-interactive-visual-stories.md`、`../../references/foundations/meaning-preserving-visual-design-workflow.md`、`../../references/foundations/embedded-visualization-self-use.md`、`../../references/foundations/fictional-data-story-simulation.md`、`../../references/foundations/sensitive-geopolitical-and-humanitarian-stories.md`、`../../references/foundations/operational-visualization-workspaces.md`。
- 模板：`../../assets/templates/advanced-interactive-visualization-contract.md`、`../../assets/templates/visual-design-contract.md`、`../../assets/templates/chart-brief.md`、`../../assets/templates/visualization-test-plan.md`。

---
name: game-playtest
description: 执行浏览器游戏试玩测试和前端 QA。当用户要求冒烟测试、基于截图的验证、浏览器自动化、HUD 或 overlay 审查，或要求结构化查找浏览器游戏中的问题时，请使用此技能。
---

# 游戏试玩测试

## 概述

使用此技能，按照玩家体验游戏的方式测试浏览器游戏：覆盖启动、输入、场景切换、HUD 可读性和视觉状态变化。如果项目支持，优先采用浏览器自动化和截图审查。

## 首选工作流

1. 启动游戏并确认第一个可操作屏幕。
2. 操作主要动作。
3. 从代表性状态捕获截图。
4. 分别检查 UI 层和渲染层。
5. 按严重程度排序报告发现，并附复现步骤。

## 工具指导

- 优先使用仓库中已有的 Playwright 或同类浏览器自动化工具。
- 当游戏大量使用 canvas 或 WebGL 时，截图是必需的，因为单靠 DOM 断言会遗漏视觉回归。
- 使用截图判断游戏区域是否被遮挡以及 HUD 的视觉权重，不要只检查文字或布局是否正确。
- 如果确定性自动化不可行，请进行结构化人工检查并捕获证据。
- 对于 3D 渲染错误或无法解释的帧开销，请使用 SpectorJS 和浏览器性能工具，不要只凭代码猜测。

## 常见检查

### 2D 检查

- sprite 对齐和基线一致性
- 命中或受伤动画的可读性
- HUD 是否与游戏区域重叠
- 命令菜单状态变化
- tile 或 platform 的可读性
- 输入状态反馈和回合状态清晰度

### 3D 检查

- 首次加载时的可玩性，而不是仪表板式界面装饰
- 持久 overlay 的视觉权重与游戏区域可见性
- 相机控制和相机重置行为
- 菜单和 overlay 打开时的 pointer-lock 或 drag-look 切换
- 深度可读性和轮廓清晰度
- 正常游玩时次要面板是否能够折叠或关闭
- resize 行为
- WebGL context 丢失或 renderer 回退行为
- 材质或光照回归
- GLB 或纹理流式加载停顿
- collision proxy 或 physics 不匹配
- 与 post-processing 或素材加载有关的性能断崖

## 响应式和浏览器检查

- 桌面端和移动端 viewport 基本合理
- 相关场景中的 safe-area 和刘海问题
- UI 转场的 reduced-motion 行为
- 键盘、指针和暂停状态处理
- 项目使用 React Three Fiber 时，React 状态与场景状态同步

## 报告标准

以发现开头。确保每项发现具体明确：

- 用户看到了什么
- 如何复现
- 为什么重要
- 可能由哪个子系统负责

## 参考资料

- 共享架构：`../web-game-foundations/SKILL.md`
- 前端审查线索：`../game-ui-frontend/SKILL.md`
- 3D 调试说明：`../../references/webgl-debugging-and-performance.md`
- 完整检查清单：`../../references/playtest-checklist.md`

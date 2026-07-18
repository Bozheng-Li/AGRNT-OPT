---
name: game-studio
description: 为浏览器游戏的早期工作选择路线。当用户在转到专业技能前，需要围绕设计、实施、素材和试玩测试进行技术栈选择与工作流规划时，请使用此技能。
---

# 游戏工作室

## 概述

将此技能作为浏览器游戏工作的总入口。默认采用 2D Phaser 路径，除非用户明确要求 3D、Three.js、React Three Fiber、以 shader-heavy 渲染为主，或其他 WebGL-first 方向。

此插件有意采用非对称设计：

- 2D 是 v1 中最强的执行路径。
- 3D 采用一套有明确倾向的默认生态系统：普通 TypeScript 或 Vite 应用使用 vanilla Three.js；由 React 承载的 3D 应用使用 React Three Fiber；默认发布素材格式为 GLB 或 glTF 2.0。
- 共享架构、UI 和试玩测试实践同时适用于两者。

## 使用此技能的时机

- 用户仍在选择技术栈
- 请求跨越多个领域，例如 runtime、UI、asset pipeline 和 QA
- 用户只说“帮我构建一个游戏”，没有指定实施路径

## 出现以下情况时不要停留在此技能

- runtime 明确是普通 Three.js
- runtime 明确是 React Three Fiber
- 任务明确是发布素材问题
- 任务明确仅涉及前端或 QA

意图明确后，路由到最具体的专业技能，并从那里继续。

## 路由规则

1. 在设计或编码前对请求进行分类：
   - `2D default`：Phaser、sprites、tilemaps、俯视、侧视、网格战术和动作平台游戏。
   - `3D + plain TS/Vite`：命令式场景控制、引擎式循环、非 React 应用和直接使用 Three.js 的工作。
   - `3D + React`：由 React 承载的产品界面、声明式场景组合、共享 React 状态和 UI 密集型 3D 应用。
   - `3D asset pipeline`：GLB、glTF、纹理打包、压缩、LOD 和 runtime 素材大小。
   - `Alternative engine`：Babylon.js 或 PlayCanvas 请求，通常涉及比较或生态适配问题。
   - `Shared`：核心循环设计、前端方向、保存/调试/性能边界和浏览器 QA。
2. 分类后立即路由到专业技能：
   - 共享架构和引擎选择：`../web-game-foundations/SKILL.md`
   - 深入 2D 实施：`../phaser-2d-game/SKILL.md`
   - Vanilla Three.js 实施：`../three-webgl-game/SKILL.md`
   - 由 React 承载的 3D 实施：`../react-three-fiber-game/SKILL.md`
   - 3D 素材发布与优化：`../web-3d-asset-pipeline/SKILL.md`
   - HUD 和菜单方向：`../game-ui-frontend/SKILL.md`
   - 2D sprite 生成与标准化：`../sprite-pipeline/SKILL.md`
   - 浏览器 QA 和视觉审查：`../game-playtest/SKILL.md`
3. 在路由到的各项技能之间维持一份连贯计划。不要让引擎、UI、素材和 QA 决策彼此偏离。

## 默认工作流

1. 确定游戏幻想和玩家动作。
2. 定义核心循环、失败状态、进度和目标游玩时长。
3. 选择实施路线：
   - 2D 浏览器游戏默认使用 Phaser。
   - 当项目明确是 3D，并希望在普通 TypeScript 或 Vite 应用中直接控制 render loop 时，选择 vanilla Three.js。
   - 当项目已经使用 React，或希望通过共享 React 状态进行声明式场景组合时，选择 React Three Fiber。
   - 只有当用户明确需要自定义 renderer 或 shader-first 界面时，才选择原生 WebGL。
4. 尽早定义 UI 界面。即使游戏区域使用 canvas 或 WebGL，浏览器游戏通常也需要 DOM HUD 和菜单层。
   - 对于 3D starter scaffold，默认使用低界面装饰的 HUD，以保留游戏区域，并让次要面板保持折叠。
5. 决定素材工作流：
   - 2D 角色和特效：使用 `sprite-pipeline`。
   - 3D 模型、纹理和发布格式：使用 `web-3d-asset-pipeline`。
6. 在将工作称为 production-ready 之前，以试玩测试循环收尾。

## 输出要求

- 对于规划请求，返回游戏专属计划，其中包含技术栈选择、游戏循环、UI 界面、素材工作流和测试方法。
- 对于实施请求，让文件结构和代码边界清楚体现所选技术栈。
- 对于混合请求，保留插件默认值：除非用户要求其他方案，否则首先选择 2D Phaser。
- 当用户询问 Babylon.js 或 PlayCanvas 时，请诚实比较；但除非用户明确选择其他引擎，否则仍以 Three.js 和 R3F 作为主要代码生成默认值。

## 参考资料

- 引擎选择：`../../references/engine-selection.md`
- Three.js 技术栈：`../../references/threejs-stack.md`
- React Three Fiber 技术栈：`../../references/react-three-fiber-stack.md`
- 3D asset pipeline：`../../references/web-3d-asset-pipeline.md`
- Vanilla Three.js starter：`../../references/threejs-vanilla-starter.md`
- React Three Fiber starter：`../../references/react-three-fiber-starter.md`
- 前端提示模式：`../../references/frontend-prompts.md`
- 试玩测试检查清单：`../../references/playtest-checklist.md`

## 示例

- “帮我制作一个浏览器战术游戏原型。”
- “我需要一个基于 Phaser、带 HUD 和菜单的动作游戏循环。”
- “我想要一个带 WebGL 光照和浏览器安全 UI 的 Three.js 探索演示。”
- “我想要一个使用 React Three Fiber、基于 React 的 3D 配置器。”
- “为 Web 优化我的 GLB 素材，并控制文件大小。”
- “设置素材工作流，让 2D sprite 动画保持一致。”

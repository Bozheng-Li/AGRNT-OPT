---
name: web-artifacts-builder
description: 一套使用现代 Web 前端技术（React、Tailwind CSS、shadcn/ui）创建精细、多组件 claude.ai HTML artifact 的工具。适用于需要状态管理、路由或 shadcn/ui 组件的复杂 artifact；不适用于简单的单文件 HTML/JSX artifact。
license: 完整条款见 LICENSE.txt
---

# Web Artifact 构建器

要构建强大的前端 claude.ai artifact，请遵循以下步骤：
1. 使用 `scripts/init-artifact.sh` 初始化前端 repo
2. 通过编辑生成的代码开发 artifact
3. 使用 `scripts/bundle-artifact.sh` 将所有代码打包为单个 HTML 文件
4. 向用户展示 artifact
5. （可选）测试 artifact

**技术栈**：React 18 + TypeScript + Vite + Parcel（打包）+ Tailwind CSS + shadcn/ui

## 设计与样式指南

非常重要：为避免通常所谓的“AI slop”，不要过度使用居中布局、紫色渐变、千篇一律的圆角和 Inter 字体。

## 快速开始

### 步骤 1：初始化项目

运行初始化脚本，创建新的 React 项目：
```bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
```

这会创建一个配置完备的项目，其中包括：
- ✅ React + TypeScript（通过 Vite）
- ✅ 带 shadcn/ui 主题系统的 Tailwind CSS 3.4.1
- ✅ 已配置路径别名（`@/`）
- ✅ 预安装 40 多个 shadcn/ui 组件
- ✅ 包含全部 Radix UI 依赖项
- ✅ 已配置 Parcel 用于打包（通过 .parcelrc）
- ✅ Node 18+ 兼容性（自动检测并锁定 Vite 版本）

### 步骤 2：开发 Artifact

要构建 artifact，请编辑生成的文件。有关指导，请参阅下方的**常见开发任务**。

### 步骤 3：打包为单个 HTML 文件

要将 React 应用打包为单个 HTML artifact：
```bash
bash scripts/bundle-artifact.sh
```

这会创建 `bundle.html`——一个将所有 JavaScript、CSS 和依赖项内联的自包含 artifact。该文件可以直接在 Claude 对话中作为 artifact 分享。

**要求**：项目根目录中必须有 `index.html`。

**脚本执行的工作**：
- 安装打包依赖项（parcel、@parcel/config-default、parcel-resolver-tspaths、html-inline）
- 创建支持路径别名的 `.parcelrc` 配置
- 使用 Parcel 构建（不生成 source map）
- 使用 html-inline 将所有资源内联到单个 HTML 中

### 步骤 4：与用户分享 Artifact

最后，在对话中与用户分享打包后的 HTML 文件，让他们能以 artifact 的形式查看。

### 步骤 5：测试/可视化 Artifact（可选）

注意：这是完全可选的步骤。仅在必要或用户要求时执行。

要测试/可视化 artifact，请使用可用工具（包括其他 Skills，或 Playwright、Puppeteer 等内置工具）。通常不要预先测试 artifact，因为这会增加从用户提出请求到看到完成品之间的延迟。先展示 artifact；若用户要求或出现问题，再进行测试。

## 参考资料

- **shadcn/ui 组件**：https://ui.shadcn.com/docs/components

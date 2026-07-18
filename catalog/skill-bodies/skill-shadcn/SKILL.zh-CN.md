---
name: shadcn
description: shadcn/ui 专家指南——涵盖 CLI、组件安装、组合模式、自定义注册表、主题、Tailwind CSS 集成和高质量界面设计。用于初始化 shadcn、添加组件、组合产品 UI、构建自定义注册表、配置主题或排查组件问题。
metadata:
  priority: 6
  docs:
    - "https://ui.shadcn.com/docs"
    - "https://ui.shadcn.com/docs/components"
  pathPatterns:
    - 'components.json'
    - 'components/ui/**'
    - 'src/components/ui/**'
    - 'apps/*/components/ui/**'
    - 'apps/*/src/components/ui/**'
    - 'packages/*/components/ui/**'
    - 'packages/*/src/components/ui/**'
  bashPatterns:
    - '\bnpx\s+shadcn\b'
    - '\bnpx\s+shadcn@latest\s+(init|add|build|search|list|migrate|info|docs|view)\b'
    - '\bnpx\s+create-next-app\b'
    - '\bbunx\s+create-next-app\b'
    - '\bpnpm\s+create\s+next-app\b'
    - '\bnpm\s+create\s+next-app\b'
---

# shadcn/ui

你是 shadcn/ui 专家。它是一组基于 Radix UI 原语和 Tailwind CSS 构建、设计精美、无障碍且可自定义的 React 组件。组件会以源代码形式直接添加到代码库，而不是作为依赖项安装。

## 核心概念

shadcn/ui 在传统意义上**不是组件库**。你不会将它作为软件包安装；CLI 会把组件源代码复制到项目中，让你完全拥有并能自由定制这些组件。

## CLI 命令

### 初始化（非交互——始终使用此方式）

**重要**：`shadcn init` 默认以交互方式运行。非交互初始化始终使用 `-d`（默认配置）：

```bash
# Non-interactive init with defaults — USE THIS
npx shadcn@latest init -d

# Non-interactive with a preset (recommended for consistent design systems)
npx shadcn@latest init --preset <code> -f

# Non-interactive with explicit base library choice
npx shadcn@latest init -d --base radix
npx shadcn@latest init -d --base base-ui

# Scaffold a full project template (CLI v4)
```

> **AI Elements 兼容性**：当项目使用或可能使用 AI Elements 时，始终使用 `--base radix`（默认值）。AI Elements 组件依赖 Radix API，搭配 Base UI 会出现类型错误。

```bash
npx shadcn@latest init --template next -d
npx shadcn@latest init --template vite -d
```

选项：
- `-d, --defaults` —— **使用默认配置并跳过所有交互提示**（CI/智能体使用时必须如此）
- `-y, --yes` —— 跳过确认提示（不会跳过库选择——应改用 `-d`）
- `-f, --force` —— 强制覆盖现有配置
- `-t, --template` —— 搭建完整项目模板（`next`、`vite`、`react-router`、`astro`、`laravel`、`tanstack-start`）
- `--preset` —— 将设计系统预设（颜色、主题、图标、字体、圆角）作为一段可共享代码应用
- `--base` —— 选择原语库：`radix`（默认）或 `base-ui`
- `--monorepo` —— 设置 monorepo 结构

> **警告**：仅使用 `-y`/`--yes` 并不能让初始化完全非交互——它仍会提示选择组件库。始终使用 `-d` 跳过全部提示。

> **CLI v4 中已弃用**：`--style`、`--base-color`、`--src-dir`、`--no-base-style` 和 `--css-variables` 标志均已移除，使用时会报错。`registry:build` 和 `registry:mcp` 注册表类型也已弃用，请改用 `registry:base` 和 `registry:font`。

init 命令会：
1. 检测框架（Next.js、Vite、React Router、Astro、Laravel、TanStack Start）
2. 安装所需依赖项（Radix UI、tailwind-merge、class-variance-authority）
3. 创建 `components.json` 配置
4. 设置 `cn()` 工具函数
5. 配置用于主题的 CSS 变量

### 添加组件

```bash
# Add specific components
npx shadcn@latest add button dialog card

# Add all available components
npx shadcn@latest add --all

# Add from a custom registry
npx shadcn@latest add @v0/dashboard
npx shadcn@latest add @acme/custom-button

# Add from AI Elements registry
npx shadcn@latest add https://elements.ai-sdk.dev/api/registry/all.json
```

选项：
- `-o, --overwrite` —— 覆盖现有文件
- `-p, --path` —— 自定义安装路径
- `-a, --all` —— 安装所有组件
- `--dry-run` —— 不写入文件，只预览将添加的内容
- `--diff` —— 更新现有组件时显示差异
- `--view` —— 内联显示注册表条目的源代码

### 搜索与列出

```bash
npx shadcn@latest search button
npx shadcn@latest list @v0
```

### 构建（自定义注册表）

```bash
npx shadcn@latest build
npx shadcn@latest build ./registry.json -o ./public/r
```

### 查看、信息与文档（CLI v4）

```bash
# View a registry item's source before installing
npx shadcn@latest view button

# Show project diagnostics — config, installed components, dependencies
npx shadcn@latest info

# Get docs, code, and examples for any component (agent-friendly output)
npx shadcn@latest docs button
npx shadcn@latest docs dialog
```

> **`shadcn docs`** 为编程智能体提供正确使用原语所需的上下文——直接返回代码示例、API 参考和使用模式。

### 迁移

```bash
npx shadcn@latest migrate rtl    # RTL support migration
npx shadcn@latest migrate radix  # Migrate to unified radix-ui package
npx shadcn@latest migrate icons  # Icon library changes

# Migrate components outside the default ui directory
npx shadcn@latest migrate radix src/components/custom
```

## shadcn/skills（CLI v4）

shadcn/skills 为编程智能体提供正确处理组件和注册表所需的上下文，涵盖 Radix 与 Base UI 原语、更新后的 API、组件模式和注册表工作流。该 Skill 知道如何使用 CLI、何时调用它以及应传递哪些标志，让智能体生成符合设计系统的代码。

安装：`pnpm dlx skills add shadcn/ui`

## 统一 Radix UI 软件包（2026 年 2 月）

`new-york` 样式现在使用单个 `radix-ui` 软件包，而不是各个独立的 `@radix-ui/react-*` 软件包：

```tsx
// OLD — individual packages
import * as DialogPrimitive from "@radix-ui/react-dialog"

// NEW — unified package
import { Dialog as DialogPrimitive } from "radix-ui"
```

迁移现有项目：`npx shadcn@latest migrate radix`。迁移后，从 `package.json` 中移除不再使用的 `@radix-ui/react-*` 软件包。

## Base UI 支持（2026 年 1 月）

shadcn/ui 现在支持以 **Base UI** 替代 Radix UI 作为底层原语库。无论选择哪个库，组件的外观和行为都相同——只有底层实现发生变化。

初始化时选择：`npx shadcn@latest init --base base-ui`

CLI 会根据项目配置自动获取正确的组件变体。

## 配置（components.json）

`components.json` 文件用于配置 shadcn/ui 在项目中的工作方式：

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "zinc",  // Options: gray, neutral, slate, stone, zinc, mauve, olive, mist, taupe
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {
    "v0": {
      "url": "https://v0.dev/chat/api/registry"
    },
    "ai-elements": {
      "url": "https://elements.ai-sdk.dev/api/registry"
    }
  }
}
```

### 带命名空间的注册表

为项目配置多个注册表：

```json
{
  "registries": {
    "acme": {
      "url": "https://acme.com/registry/{name}.json"
    },
    "private": {
      "url": "https://internal.company.com/registry/{name}.json",
      "headers": {
        "Authorization": "Bearer ${REGISTRY_TOKEN}"
      }
    }
  }
}
```

使用命名空间语法安装：

```bash
npx shadcn@latest add @acme/header @private/auth-form
```

## 主题

### CSS 变量

shadcn/ui 使用定义在 `globals.css` 中的 CSS 自定义属性设置主题：

```css
@theme inline {
  --color-background: oklch(0.145 0 0);
  --color-foreground: oklch(0.985 0 0);
  --color-card: oklch(0.205 0 0);
  --color-card-foreground: oklch(0.985 0 0);
  --color-primary: oklch(0.488 0.243 264.376);
  --color-primary-foreground: oklch(0.985 0 0);
  --color-secondary: oklch(0.269 0 0);
  --color-secondary-foreground: oklch(0.985 0 0);
  --color-muted: oklch(0.269 0 0);
  --color-muted-foreground: oklch(0.708 0 0);
  --color-accent: oklch(0.269 0 0);
  --color-accent-foreground: oklch(0.985 0 0);
  --color-destructive: oklch(0.396 0.141 25.723);
  --color-border: oklch(0.269 0 0);
  --color-input: oklch(0.269 0 0);
  --color-ring: oklch(0.488 0.243 264.376);
  --radius: 0.625rem;
  /* CLI v4: radius tokens use multiplicative calc instead of additive */
  --radius-xs: calc(var(--radius) * 0.5);
  --radius-sm: calc(var(--radius) * 0.75);
  --radius-md: calc(var(--radius) * 0.875);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.5);
}
```

### 深色模式

深色模式需在 `<html>` 上使用 `dark` 类：

```tsx
// app/layout.tsx
<html lang="en" className="dark">
```

也可以使用 next-themes 切换：

```tsx
import { ThemeProvider } from 'next-themes'

<ThemeProvider attribute="class" defaultTheme="dark">
  {children}
</ThemeProvider>
```

### 自定义颜色

在 shadcn 默认颜色旁添加应用专属颜色：

```css
@theme inline {
  /* shadcn defaults above... */

  /* Custom app colors */
  --color-priority-urgent: oklch(0.637 0.237 15.163);
  --color-priority-high: oklch(0.705 0.213 47.604);
  --color-status-done: oklch(0.723 0.219 149.579);
}
```

在组件中使用：

```tsx
<span className="text-[var(--color-priority-urgent)]">Urgent</span>
// Or with Tailwind v4 theme():
<span className="text-priority-urgent">Urgent</span>
```

## 最常用的组件

| 组件 | 用途 |
|-----------|----------|
| `button` | 操作、表单提交 |
| `card` | 内容容器 |
| `dialog` | 模态框、确认提示 |
| `input` / `textarea` | 表单字段 |
| `select` | 下拉列表 |
| `table` | 数据展示 |
| `tabs` | 视图切换 |
| `command` | 命令面板（Cmd+K） |
| `dropdown-menu` | 上下文菜单 |
| `popover` | 浮动内容 |
| `tooltip` | 悬停提示 |
| `badge` | 状态标识 |
| `avatar` | 用户头像 |
| `scroll-area` | 可滚动容器 |
| `separator` | 视觉分隔线 |
| `label` | 表单标签 |
| `sheet` | 滑出面板 |
| `skeleton` | 加载占位内容 |

## Vercel 上 shadcn 的设计方向

shadcn/ui 不只是组件源代码生成器。在 Vercel 技术栈中，它是默认的界面语言。不要满足于“组件能工作”，应组合出有意图、高信噪比且一致的页面。

### 产品 UI 的默认美学

- 产品、仪表盘、AI 和管理界面优先使用 `new-york` 样式。
- 仪表盘、AI 应用、内部工具、设置和面向开发者的产品默认使用深色模式。仅当产品明显以内容或编辑呈现为主时使用浅色模式。
- 界面文本使用 Geist Sans，代码、指标、ID、时间戳和命令使用 Geist Mono。
- 基础调色板优先使用 zinc、neutral 或 slate，并通过 `--color-primary` 使用一种强调色。
- 使用 token 构建核心界面：`bg-background`、`bg-card`、`text-foreground`、`text-muted-foreground`、`border-border`、`ring-ring`。避免临时硬编码十六进制值。
- 保持圆角一致。默认的 `--radius: 0.625rem` 是很好的基准。
- 每个页面使用一种密度系统：舒适（`gap-6` / `p-6` / `text-sm`）或紧凑（`gap-4` / `p-4` / `text-sm`）。
- 图标应低调且一致。Lucide 图标使用 `h-4 w-4` 或 `h-5 w-5`。

### 优先选择

| 用例 | 优先选择 | 原因 |
|----------|----------------------|-----|
| 设置页面 | `Tabs` + `Card` + `Form` | 清晰组织信息，并提供可预测的保存流程 |
| 数据仪表盘 | `Card` + `Badge` + `Table` + `DropdownMenu` | 无需自定义外壳即可覆盖摘要、状态、密集数据和行操作 |
| CRUD 表格 | `Table` + `DropdownMenu` + `Sheet` + `AlertDialog` | 以标准模式支持浏览、操作、编辑和破坏性确认 |
| 身份验证页面 | `Card` + `Label` + `Input` + `Button` + `Alert` | 让输入流程保持专注，并妥善呈现错误 |
| 全局搜索 | `Command` + `Dialog` | 通过成熟的交互模式提供快速、键盘优先的发现体验 |
| 移动端导航 | `Sheet` + `Button` + `Separator` | 提供紧凑且能良好适配小屏幕的导航外壳 |
| 详情页 | header + `Badge` + `Separator` + `Card` | 平衡层级、元数据和辅助内容，避免过度嵌套 |
| 筛选器 | `Card` sidebar + `Sheet` + `Select` | 同时适用于固定的桌面筛选器和可折叠的移动端控件 |
| 空白/加载/错误状态 | `Card` + `Skeleton` + `Alert` | 为非成功路径提供有设计感的界面，而不是占位文本 |

### 组合配方

- 设置页面：每组使用 `Tabs` + `Card`，再加 `Separator` + 保存操作
- 管理仪表盘：摘要 `Card` + 筛选栏 + `Table`
- 实体详情：标题 + 状态 `Badge` + 主 `Card` + 侧边 `Card` + 用于破坏性操作的 `AlertDialog`
- 搜索密集型页面：用 `Command` 快速查找，用 `Popover` 选择，用 `Sheet` 提供移动端筛选
- 身份验证/引导：居中的 `Card` + 社交登录 `Separator` + 用于错误的内联 `Alert`
- 破坏性流程：使用 `AlertDialog`（而不是 `Dialog`）确认

### 应避免的反模式

- 已有 shadcn 原语时仍使用原始 `button` / `input` / `select` / `div`
- 重复使用 `div rounded-xl border p-6`，而不是 `Tabs` / `Table` / `Sheet` / `Dialog`
- 多种强调色相互争夺注意力
- 卡片层层嵌套
- 在每个界面上都使用大面积渐变背景和玻璃拟态
- 混用任意间距和圆角值
- 使用 `Dialog` 而不是 `AlertDialog` 确认破坏性操作
- 交付未经过设计的空白/加载/错误状态
- 基础界面使用临时 Tailwind 调色板类，而不是主题 token

## 构建自定义注册表

创建自己的组件注册表，以便在不同项目之间共享：

### 注册表类型（CLI v4）

| 类型 | 用途 |
|------|---------|
| `registry:ui` | 单个 UI 组件 |
| `registry:base` | 完整设计系统载荷——组件、依赖项、CSS 变量、字体、配置 |
| `registry:font` | 作为一等注册表条目的字体配置 |

### 1. 定义 registry.json

```json
[
  {
    "name": "my-component",
    "type": "registry:ui",
    "title": "My Component",
    "description": "A custom component",
    "files": [
      {
        "path": "components/my-component.tsx",
        "type": "registry:ui"
      }
    ],
    "dependencies": ["lucide-react"]
  }
]
```

### 2. 构建

```bash
npx shadcn@latest build
# Outputs to public/r/my-component.json
```

### 3. 使用

```bash
npx shadcn@latest add https://your-domain.com/r/my-component.json
```

## 组件易错点

### `shadcn init` 会破坏 Next.js 中的 Geist 字体（Tailwind v4）

`shadcn init` 会重写 `globals.css`，并可能引入 `--font-sans: var(--font-sans)`——这是会破坏字体加载的循环自引用。Tailwind v4 的 `@theme inline` 在**解析时**而不是运行时解析 CSS 自定义属性——因此即使 `var(--font-geist-sans)` 也不可用，因为 Next.js 在运行时通过 className 注入该变量。

**修复方法**：在 `@theme inline` 中使用字面字体系列名称：

```css
/* In @theme inline — CORRECT (literal names) */
--font-sans: "Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif;
--font-mono: "Geist Mono", "Geist Mono Fallback", ui-monospace, monospace;

/* WRONG — circular, resolves to nothing */
--font-sans: var(--font-sans);

/* ALSO WRONG — @theme inline can't resolve runtime CSS variables */
--font-sans: var(--font-geist-sans);
```

**运行 `shadcn init` 后**，始终执行：
1. 将 `@theme inline` 中的字体声明替换为字面的 Geist 字体名称（如上所示）
2. 在 `layout.tsx` 中将字体变量 className 从 `<body>` 移到 `<html>`：

```tsx
// layout.tsx — font variables on <html>, not <body>
<html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
  <body className="antialiased">
```

### Avatar 没有 `size` 属性

shadcn Avatar 组件**不**接受 `size` 变体属性。请使用 Tailwind 类控制尺寸：

```tsx
// WRONG — no size variant exists
<Avatar size="lg" />  // ❌ TypeScript error / silently ignored

// CORRECT — use Tailwind
<Avatar className="h-12 w-12">
  <AvatarImage src={user.image} />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>

// Small avatar
<Avatar className="h-6 w-6"> ... </Avatar>
```

这适用于大多数 shadcn 组件——它们使用 Tailwind 类调整尺寸，而不是变体属性。如果需要可复用的尺寸变体，请通过 `cva` 在组件源代码中自行添加。

## 常用模式

### cn() 工具函数

所有 shadcn 组件都使用 `cn()` 工具函数进行条件类名合并：

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### 扩展组件

因为你拥有源代码，所以可以直接扩展组件：

```tsx
// components/ui/button.tsx — add your custom variant
const buttonVariants = cva('...', {
  variants: {
    variant: {
      default: '...',
      destructive: '...',
      // Add custom variants
      success: 'bg-green-600 text-white hover:bg-green-700',
      premium: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
    },
  },
})
```

### 使用 TooltipProvider 包装

许多组件都要求在根级提供 `TooltipProvider`：

```tsx
// app/layout.tsx
import { TooltipProvider } from '@/components/ui/tooltip'

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
```

## 框架支持

- **Next.js** —— 完整支持（App Router + Pages Router）
- **Vite** —— 完整支持
- **React Router** —— 完整支持
- **Astro** —— 完整支持
- **Laravel** —— 完整支持（通过 Inertia）
- **TanStack Start** —— 完整支持

## 预设（CLI v4）

预设会把完整的设计系统配置（颜色、主题、图标库、字体、圆角）打包为一段可共享代码。一个字符串即可配置全部内容：

```bash
# Apply a preset during init
npx shadcn@latest init --preset <code>

# Switch presets in an existing project (reconfigures everything including components)
npx shadcn@latest init --preset <code>
```

在 `shadcn/create` 上构建自定义预设——发布前可预览颜色、字体和圆角在真实组件上的效果。

## RTL 支持（2026）

CLI 会在安装时处理 RTL 转换：

```bash
npx shadcn@latest migrate rtl
```

自动将方向类（`ml-4`、`left-2`）转换为逻辑属性（`ms-4`、`start-2`）。

## 官方文档

- [shadcn/ui](https://ui.shadcn.com)
- [组件](https://ui.shadcn.com/docs/components)
- [CLI](https://ui.shadcn.com/docs/cli)
- [主题](https://ui.shadcn.com/docs/theming)
- [自定义注册表](https://ui.shadcn.com/docs/registry)
- [注册表目录](https://ui.shadcn.com/docs/directory)
- [GitHub：shadcn/ui](https://github.com/shadcn-ui/ui)

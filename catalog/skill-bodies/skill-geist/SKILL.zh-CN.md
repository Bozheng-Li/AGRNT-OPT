---
name: geist
description: Geist 专家指南。Geist 是 Vercel 为精确的 Next.js 界面提供的默认字体排版系统和字体家族。用于配置 Geist Sans、Geist Mono 或 Geist Pixel，设置字体导入，或应用 Vercel 字体排版与美学指南。
metadata:
  priority: 4
  docs:
    - "https://vercel.com/font"
    - "https://github.com/vercel/geist-font"
  sitemap: "https://vercel.com/sitemap/docs.xml"
  pathPatterns:
    - 'app/layout.*'
    - 'src/app/layout.*'
    - 'app/globals.css'
    - 'src/app/globals.css'
    - 'styles/**'
    - 'tailwind.config.*'
    - 'apps/*/app/layout.*'
    - 'apps/*/src/app/layout.*'
    - 'apps/*/app/globals.css'
    - 'apps/*/src/app/globals.css'
  importPatterns:
    - 'geist'
    - 'geist/font'
    - 'geist/font/*'
  bashPatterns:
    - '\bnpm\s+(install|i|add)\s+[^\n]*\bgeist\b'
    - '\bpnpm\s+(install|i|add)\s+[^\n]*\bgeist\b'
    - '\bbun\s+(install|i|add)\s+[^\n]*\bgeist\b'
    - '\byarn\s+add\s+[^\n]*\bgeist\b'
---

# Geist — Vercel 字体家族

你是 Geist（v1.7.0）专家。Geist 是 Vercel 面向开发者和界面设计的开源字体家族，包括 Geist Sans（现代无衬线字体）、Geist Mono（针对代码优化的等宽字体）和 Geist Pixel（用于标题和徽标装饰的展示字体，包含五种基于像素的变体）。

## 安装

```bash
npm install geist
```

## 在 Next.js 中使用（next/font）

### App Router

```tsx
// app/layout.tsx
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={GeistSans.className}>
        {children}
      </body>
    </html>
  )
}
```

### 与 Tailwind CSS 配合使用

```tsx
// app/layout.tsx
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)'],
        mono: ['var(--font-geist-mono)'],
      },
    },
  },
}
export default config
```

然后在组件中使用：

```tsx
<p className="font-sans">Geist Sans text</p>
<code className="font-mono">Geist Mono code</code>
```

### CSS 变量

Geist 字体会公开 CSS 自定义属性：

| 变量 | 字体 |
|---|---|
| `--font-geist-sans` | Geist Sans |
| `--font-geist-mono` | Geist Mono |

在 CSS 中使用：

```css
body {
  font-family: var(--font-geist-sans);
}

code, pre {
  font-family: var(--font-geist-mono);
}
```

## 字重

Geist Sans 和 Geist Mono 都支持以下字重：

| 字重 | 数值 |
|---|---|
| Thin | 100 |
| Extra Light | 200 |
| Light | 300 |
| Regular | 400 |
| Medium | 500 |
| Semi Bold | 600 |
| Bold | 700 |
| Extra Bold | 800 |
| Black | 900 |

## Geist 字体排版方向

Geist 不只是一次字体导入。在 Vercel 技术栈中，它是精确、平静、高信号界面的默认字体排版系统。

### 优秀效果的特征

- 标题清晰利落，字距紧凑，表达果断
- 正文易读且克制；次要文本应弱化，但不能淡到难以辨认
- 数字、命令、ID、时间戳使用 Geist Mono，以体现精确性
- 首先由字体排版承载层级，颜色和装饰居于其次

### 默认字体配方

```tsx
<h1 className="text-4xl font-medium tracking-[-0.04em]">Large page title</h1>
<p className="text-sm leading-6 text-muted-foreground">Supporting copy</p>
<div className="font-mono text-[12px] text-muted-foreground tabular-nums">Dense metadata</div>
<h2 className="text-lg tracking-tight">Section heading</h2>
<h2 className="text-xl tracking-tight">Large section heading</h2>
<label className="text-sm">UI label</label>
```

避免让整个界面都默认使用 `text-base`。

### 各字体家族的使用位置

- Geist Sans：导航、正文、按钮、标题、表单、表格、对话框
- Geist Mono：代码、快捷键、终端输出、commit hash、发票金额、指标、时间戳、ENV key、feature flag
- Geist Pixel：只用于一个强调时刻，例如 hero wordmark、campaign heading、empty-state label。绝不要用于正文或设置界面。

### 反模式

- 将 Geist 与多个互不相关的字体家族混用
- 用 Geist Mono 排长段正文
- 在超过一两个视觉焦点的位置使用 Geist Pixel
- 让每个标题都加粗（克制的字重和紧凑的字距最能体现 Geist 的优势）
- 让次要文本淡到层级消失

## Subset 配置

通过指定 subsets 优化字体加载：

```tsx
import { GeistSans } from 'geist/font/sans'

// GeistSans automatically uses the 'latin' subset
// For additional subsets, configure in next.config.js
```

## Geist Pixel（2026 年 2 月 6 日）

Geist Pixel 是受 bitmap 启发的展示字体家族，专为标题、徽标和装饰用途设计。它包含五种变体，每种都建立在不同的几何原语上：

| 变体 | 说明 |
|---|---|
| Geist Pixel Square | 基于正方形的像素网格 |
| Geist Pixel Grid | 密集网格图案 |
| Geist Pixel Circle | 圆点矩阵 |
| Geist Pixel Triangle | 三角形像素形态 |
| Geist Pixel Line | 基于线段的像素笔画 |

Geist Pixel 只适合展示字号 — 正文使用 Geist Sans，代码使用 Geist Mono。

## 编程连字（v1.7.0）

编程连字**不再默认启用**。它们已从 contextual alternates 移至 **Stylistic Set 11（SS11）**。如果编辑器或终端依赖编程连字，请显式启用 SS11：

- **VS Code**：`"editor.fontLigatures": "'ss11'"`
- **CSS**：`font-feature-settings: 'ss11' 1;`

## 西里尔字母支持（v1.7.0）

Geist 1.7.0 为所有 Geist Sans 和 Geist Mono 样式加入了重新设计的 Cyrillic script。

## 要点

1. **针对 Next.js 优化** — 与 `next/font` 无缝协作，实现无布局偏移的字体加载
2. **三个字体家族** — Geist Sans 用于 UI 文本，Geist Mono 用于代码，Geist Pixel 用于装饰性展示
3. **CSS 变量** — 使用 `--font-geist-sans` 和 `--font-geist-mono` 灵活设置样式
4. **Variable font** — 单个文件支持全部字重（100–900）
5. **自托管** — 字体与应用一起打包，不产生外部请求
6. **导入路径** — 使用 `geist/font/sans` 和 `geist/font/mono`（而不是 `geist/font`）
7. **编程连字** — 通过 Stylistic Set 11 选择启用（不再默认开启）

## 官方资源

- [Geist Font GitHub](https://github.com/vercel/geist-font)
- [Geist Design System](https://vercel.com/geist)

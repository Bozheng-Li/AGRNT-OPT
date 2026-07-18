---
name: satori
description: Satori 专家指南。Satori 是 Vercel 用于将 HTML 和 CSS 转换为 SVG 的库，常用于为 Next.js 和其他框架生成动态 OG 图片。
metadata:
  priority: 4
  docs:
    - "https://github.com/vercel/satori"
    - "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image"
  sitemap: "https://nextjs.org/sitemap.xml"
  pathPatterns:
    - 'app/**/og/**'
    - 'app/**/og.*'
    - 'app/**/opengraph-image.*'
    - 'app/**/twitter-image.*'
    - 'src/app/**/og/**'
    - 'src/app/**/og.*'
    - 'src/app/**/opengraph-image.*'
    - 'src/app/**/twitter-image.*'
    - 'pages/api/og.*'
    - 'pages/api/og/**'
    - 'src/pages/api/og.*'
    - 'src/pages/api/og/**'
    - 'apps/*/app/**/og/**'
    - 'apps/*/app/**/og.*'
    - 'apps/*/app/**/opengraph-image.*'
    - 'apps/*/app/**/twitter-image.*'
  importPatterns:
    - 'satori'
    - 'satori/wasm'
    - '@vercel/og'
    - 'next/og'
  bashPatterns:
    - '\bnpm\s+(install|i|add)\s+[^\n]*\bsatori\b'
    - '\bpnpm\s+(install|i|add)\s+[^\n]*\bsatori\b'
    - '\bbun\s+(install|i|add)\s+[^\n]*\bsatori\b'
    - '\byarn\s+add\s+[^\n]*\bsatori\b'
    - '\bnpm\s+(install|i|add)\s+[^\n]*@vercel/og\b'
    - '\bpnpm\s+(install|i|add)\s+[^\n]*@vercel/og\b'
    - '\bbun\s+(install|i|add)\s+[^\n]*@vercel/og\b'
    - '\byarn\s+add\s+[^\n]*@vercel/og\b'
---

# Satori — 为 OG 图片将 HTML/CSS 转换为 SVG

你是使用 Satori 和 `@vercel/og` 生成动态 Open Graph 图片的专家。

## 概述

**Satori** 将类似 JSX 的 HTML 和 CSS 转换为 SVG。**`@vercel/og`** 使用 `ImageResponse` 类封装 Satori，把 SVG 渲染为 PNG，并针对 Vercel Edge Functions 和其他 edge runtime 设计。

## 安装

```bash
# For Next.js projects (recommended — includes Satori + PNG rendering)
npm install @vercel/og

# Standalone Satori (SVG output only)
npm install satori
```

## Next.js App Router — OG 图片路由（推荐）

Next.js 通过从 `next/og` 重新导出的 `ImageResponse` 内置支持 OG 图片：

```tsx
// app/og/route.tsx  OR  app/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET(request: Request) {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          fontSize: 60,
          color: 'white',
          background: 'linear-gradient(to bottom, #1a1a2e, #16213e)',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Hello, OG Image!
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
```

## 基于约定的 OG 图片（Next.js 13.3+）

在任意路由片段中放置 `opengraph-image.tsx` 或 `twitter-image.tsx` 文件：

```tsx
// app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const alt = 'Blog post image'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const runtime = 'edge'

export default async function Image({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug)

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: '#000',
          color: '#fff',
          fontSize: 48,
        }}
      >
        <div>{post.title}</div>
      </div>
    ),
    { ...size }
  )
}
```

Next.js 会为这些文件自动生成 `<meta property="og:image">` 标签。

## 独立使用 Satori（仅 SVG）

```ts
import satori from 'satori'
import { readFileSync } from 'fs'

const svg = await satori(
  <div style={{ display: 'flex', color: 'black', fontSize: 40 }}>
    Hello from Satori
  </div>,
  {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Inter',
        data: readFileSync('./fonts/Inter-Regular.ttf'),
        weight: 400,
        style: 'normal',
      },
    ],
  }
)
```

## CSS 支持与限制

Satori 使用 CSS 子集，并通过 Flexbox（Yoga 引擎）布局：

**支持：**
- `display: flex`（默认 — 所有元素都是 flex 容器）
- Flexbox 属性：`flexDirection`、`alignItems`、`justifyContent`、`flexWrap`、`gap`
- 盒模型：`width`、`height`、`padding`、`margin`、`border`、`borderRadius`
- 字体排版：`fontSize`、`fontWeight`、`fontFamily`、`lineHeight`、`letterSpacing`、`textAlign`
- 颜色：`color`、`background`、`backgroundColor`、`opacity`
- 背景：`backgroundImage`（线性/径向渐变）、`backgroundClip`
- 阴影：`boxShadow`、`textShadow`
- 变换：`transform`（基础变换）
- 溢出：`overflow: hidden`
- 定位：`absolute`、`relative`
- 空白处理：`whiteSpace`、`wordBreak`、`textOverflow`

**不支持：**
- `display: grid` — 改用嵌套 flex 容器
- CSS animations 或 transitions
- `position: fixed` 或 `sticky`
- 伪元素（`::before`、`::after`）
- Media queries
- CSS variables

## 字体

必须显式加载字体 — 不存在默认系统字体：

```tsx
// Load font in edge runtime
const font = fetch(new URL('./Inter-Bold.ttf', import.meta.url)).then(
  (res) => res.arrayBuffer()
)

export async function GET() {
  const fontData = await font

  return new ImageResponse(
    (<div style={{ fontFamily: 'Inter' }}>Hello</div>),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Inter', data: fontData, weight: 700, style: 'normal' }],
    }
  )
}
```

对于 Google Fonts，可以直接从 CDN 获取，或将 `.ttf` 文件打包进项目。

## 来自 URL 参数的动态内容

```tsx
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const title = searchParams.get('title') ?? 'Default Title'

  return new ImageResponse(
    (<div style={{ display: 'flex', fontSize: 60 }}>{title}</div>),
    { width: 1200, height: 630 }
  )
}
```

## OG 中的图片

使用带绝对 URL 的 `<img>`：

```tsx
<img
  src="https://example.com/avatar.png"
  width={100}
  height={100}
  style={{ borderRadius: '50%' }}
/>
```

对于本地图片，将其转换为 base64，或使用绝对部署 URL。

## 关键模式

1. **在 Next.js 项目中使用 `next/og`** — 它重新导出带有内置优化的 `ImageResponse`
2. **始终设置 `runtime = 'edge'`** — Satori 和 `@vercel/og` 专为 edge runtime 设计
3. **到处使用 `display: 'flex'`** — Satori 默认为 flex 布局，不支持 block 或 grid
4. **显式加载字体** — 没有可用的系统字体；打包 `.ttf`/`.woff` 文件，或从 CDN 获取
5. **标准 OG 尺寸为 1200×630** — 这是支持最广泛的尺寸
6. **使用约定文件自动生成 `<meta>` 标签** — `opengraph-image.tsx` 和 `twitter-image.tsx`
7. **仅使用内联样式** — Satori 不支持外部 CSS 或 CSS-in-JS 库

## 官方资源

- [Satori GitHub](https://github.com/vercel/satori)
- [Vercel OG 图片生成](https://vercel.com/docs/functions/og-image-generation)
- [Next.js Metadata — OG 图片](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image)
- [Satori Playground](https://og-playground.vercel.app)

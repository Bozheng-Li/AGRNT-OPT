---
name: turbopack
description: Turbopack 专家指南。用于配置 Next.js bundler、优化 HMR、调试构建问题，或理解 Turbopack 与 Webpack 的区别。
metadata:
  priority: 4
  docs:
    - "https://turbo.build/pack/docs"
    - "https://nextjs.org/docs/architecture/turbopack"
  sitemap: "https://turbo.build/sitemap.xml"
  pathPatterns: 
    - 'next.config.*'
  bashPatterns: 
    - '\bnext\s+dev\s+--turbo\b'
    - '\bnext\s+dev\s+--turbopack\b'
---

# Turbopack

你是 Turbopack 专家。Turbopack 是 Vercel 使用 Rust 构建的 JavaScript/TypeScript bundler，也是 Next.js 16 的默认 bundler。

## 关键特性

- **即时 HMR**：Hot Module Replacement 性能不会随应用规模增大而下降
- **文件系统缓存（稳定版）**：重启之间把开发服务器产物缓存在磁盘上 — 大型项目启动速度最高可提升 14 倍。Next.js 16.1+ 默认启用，无需配置。构建缓存仍在规划中。
- **多环境构建**：Browser、Server、Edge、SSR、React Server Components
- **原生 RSC 支持**：从底层为 React Server Components 构建
- **TypeScript、JSX、CSS、CSS Modules、WebAssembly**：开箱即用
- **Rust 驱动**：使用增量计算引擎获得最高性能

## 配置（Next.js 16）

在 Next.js 16 中，Turbopack 配置位于顶层（从 `experimental.turbopack` 移出）：

```js
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    // Resolve aliases (like webpack resolve.alias)
    resolveAlias: {
      'old-package': 'new-package',
    },
    // Custom file extensions to resolve
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
}

export default nextConfig
```

## CSS 与 CSS Modules 处理

Turbopack 原生处理 CSS，无需额外配置。

### 全局 CSS

在根布局中导入全局 CSS：

```tsx
// app/layout.tsx
import './globals.css'
```

### CSS Modules

带 `.module.css` 后缀的 CSS Modules 可以开箱即用：

```tsx
// components/Button.tsx
import styles from './Button.module.css'

export function Button({ children }) {
  return <button className={styles.primary}>{children}</button>
}
```

### PostCSS

Turbopack 会自动读取 `postcss.config.js`。Tailwind CSS v4 零配置即可使用：

```js
// postcss.config.js
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
}
```

### Sass / SCSS

安装 `sass` 后直接导入 `.scss` 文件 — Turbopack 会原生编译：

```bash
npm install sass
```

```tsx
import styles from './Component.module.scss'
```

### 常见 CSS 陷阱

- **CSS 顺序与 webpack 不同**：Turbopack 加载 CSS chunk 的顺序可能不同。不要依赖跨文件的源码顺序 specificity — 使用更明确的 selector 或 CSS Modules。
- **全局 CSS 中的 `@import`**：使用标准 CSS `@import` — Turbopack 可以解析，但循环导入会导致构建失败。
- **CSS-in-JS 库**：`styled-components` 和 `emotion` 可以工作，但必须在 next.config 的 `compiler` 下配置各自的 SWC plugin。

## Tree Shaking

Turbopack 会在生产构建中按模块执行 tree shaking。关键行为包括：

- **ES module exports**：只包含实际使用的导出 — 为每个函数/常量单独写 `export`，不要使用 barrel `export *`
- **无副作用 package**：在 `package.json` 中将 package 标记为无副作用，以启用激进的 tree shaking：

```json
{
  "name": "my-ui-lib",
  "sideEffects": false
}
```

- **Barrel 文件优化**：当 package 声明 `"sideEffects": false` 时，Turbopack 可以跳过 barrel 文件（`index.ts`）中未使用的 re-export
- **动态导入**：`import()` 表达式会创建 async chunk 边界 — Turbopack 会自动将其拆分为独立 chunk

### 诊断大型 bundle

**内置 analyzer（Next.js 16.1+，实验性）**：原生支持 Turbopack，提供按路由筛选、导入追踪和 RSC 边界分析：

```ts
// next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    bundleAnalyzer: true,
  },
}
```

**旧版 `@next/bundle-analyzer`**：仍可作为后备方案：

```bash
ANALYZE=true next build
```

```ts
// next.config.ts
import withBundleAnalyzer from '@next/bundle-analyzer'

const nextConfig = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})({
  // your config
})
```

## 从 Webpack 自定义 Loader 迁移

Turbopack 不直接支持 webpack loader。按如下方式迁移常见模式：

| Webpack Loader | Turbopack 等价方案 |
|----------------|---------------------|
| `css-loader` + `style-loader` | 内置 CSS 支持 — 移除 loader |
| `sass-loader` | 内置 — 安装 `sass` package |
| `postcss-loader` | 内置 — 读取 `postcss.config.js` |
| `file-loader` / `url-loader` | 内置静态资产处理 |
| `svgr` / `@svgr/webpack` | 通过 `turbopack.rules` 使用 `@svgr/webpack` |
| `raw-loader` | 使用 `import x from './file?raw'` |
| `graphql-tag/loader` | 改用构建时 codegen 步骤 |
| `worker-loader` | 使用原生 `new Worker(new URL(...))` 语法 |

### 配置自定义规则（替代 loader）

对于没有内置等价方案的 loader，使用 `turbopack.rules`：

```js
// next.config.ts
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
}
```

### 无法迁移时

如果 webpack loader 没有 Turbopack 等价方案，也没有可用的 workaround，则退回 webpack：

```js
const nextConfig: NextConfig = {
  bundler: 'webpack',
}
```

在 [github.com/vercel/next.js](https://github.com/vercel/next.js) 提交 issue — Turbopack 团队会追踪 loader parity 请求。

## 生产构建诊断

### Turbopack 构建失败

1. **检查不支持的配置**：从 next.config 中移除所有 `webpack()` 函数；Turbopack 会忽略它们，可能掩盖真正的配置
2. **验证 `turbopack.rules`**：确认自定义规则引用了已安装的有效 loader
3. **检查 edge/client 中使用的 Node.js 内置模块**：Turbopack 强制执行环境边界 — `fs`、`path` 等不能导入 client 或 edge bundle
4. **Module not found 错误**：确认 `turbopack.resolveAlias` 覆盖了此前 webpack 配置中的所有自定义解析

### 构建输出过大

- 审核 `"use client"` 指令 — 每个 client component 边界都会创建新的 chunk
- 检查是否意外把仅服务端 package 打包进 client component
- 使用 `server-only` package 在导入时强制 server/client 边界：

```bash
npm install server-only
```

```ts
// lib/db.ts
import 'server-only' // Build fails if imported in a client component
```

### 比较 webpack 与 Turbopack 输出

分别运行两个 bundler 后进行比较：

```bash
# Turbopack build (default in Next.js 16)
next build

# Webpack build
BUNDLER=webpack next build
```

比较 `.next/` 输出大小和页面级 chunk。

## 性能分析

### HMR 分析

在开发环境中启用详细的 HMR timing：

```bash
NEXT_TURBOPACK_TRACING=1 next dev
```

这会在项目根目录写入 `trace.json` — 使用 `chrome://tracing` 或 [Perfetto](https://ui.perfetto.dev/) 打开，以查看模块级 timing。

### 构建分析

分析生产构建：

```bash
NEXT_TURBOPACK_TRACING=1 next build
```

查找：
- **长时间运行的 transform**：表示 SWC plugin 较慢或 PostCSS 配置繁重
- **大型模块图**：减少 barrel 文件 re-export
- **缓存未命中**：如果增量构建没有命中缓存，检查每次构建都会变化的文件（例如生成的时间戳）

### 内存用量

Turbopack 的 Rust core 自行管理内存。如果构建发生 OOM：
- 增大 Node.js heap：`NODE_OPTIONS='--max-old-space-size=8192' next build`
- 如果在 Turborepo 中运行，减少并发任务：`turbo build --concurrency=2`

## Turbopack 与 Webpack 对比

| 特性 | Turbopack | Webpack |
|---------|-----------|---------|
| 语言 | Rust | JavaScript |
| HMR 速度 | 恒定（O(1)） | 随应用规模增大而下降 |
| RSC 支持 | 原生 | 基于 plugin |
| 冷启动 | 快 | 较慢 |
| 生态系统 | 持续增长 | 庞大（loaders、plugins） |
| 在 Next.js 16 中的状态 | 默认 | 仍受支持 |
| Tree shaking | 模块级 | 模块级 |
| CSS 处理 | 内置 | 需要 loader |
| 生产构建 | 支持 | 支持 |

## 可能需要 Webpack 的情况

- 没有 Turbopack 等价方案的自定义 webpack loader
- 复杂的 webpack plugin 配置（例如 `ModuleFederationPlugin`）
- Turbopack 尚不具备的特定 webpack 功能（例如自定义 `externals` 函数）

改用 webpack：
```js
// next.config.ts
const nextConfig: NextConfig = {
  bundler: 'webpack', // Opt out of Turbopack
}
```

## 开发与生产

- **开发**：Turbopack 提供即时 HMR 和 fast refresh
- **生产**：Turbopack 负责生产构建（在 Next.js 16 中替代 webpack）

## 常见问题

1. **缺少 loader 等价方案**：部分 webpack loader 尚无 Turbopack 等价方案。查看 Turbopack 文档了解支持的转换。
2. **配置迁移**：把 next.config 中的 `experimental.turbopack` 移到顶层 `turbopack`。
3. **自定义 alias**：使用 `turbopack.resolveAlias`，而不是 `webpack.resolve.alias`。
4. **CSS 顺序变化**：迁移时测试视觉回归 — CSS chunk 顺序可能不同。
5. **环境边界错误**：在 client component 中导入仅服务端模块会导致构建失败 — 使用 `server-only` package。

## 官方文档

- [Turbopack](https://turborepo.dev/pack)
- [Turbopack 文档](https://turborepo.dev/pack/docs)
- [Next.js Turbopack 配置](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack)
- [GitHub：Turbopack](https://github.com/vercel/turborepo)

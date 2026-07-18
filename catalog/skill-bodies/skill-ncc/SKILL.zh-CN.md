---
name: ncc
description: '@vercel/ncc 专家指南。@vercel/ncc 是一个简单的 CLI，可将 Node.js 模块及其全部依赖编译成单个文件。用于把 Serverless Functions、CLI 工具或任何 Node.js 项目打包为自包含文件。'
metadata:
  priority: 4
  docs:
    - "https://github.com/vercel/ncc"
  pathPatterns: []
  importPatterns:
    - '@vercel/ncc'
  bashPatterns:
    - '\bnpm\s+(install|i|add)\s+[^\n]*@vercel/ncc\b'
    - '\bpnpm\s+(install|i|add)\s+[^\n]*@vercel/ncc\b'
    - '\bbun\s+(install|i|add)\s+[^\n]*@vercel/ncc\b'
    - '\byarn\s+add\s+[^\n]*@vercel/ncc\b'
    - '\bncc\s+build\b'
---

# @vercel/ncc — Node.js 编译器集合

你是 `@vercel/ncc` 专家。这是 Vercel 提供的简单 CLI，可将一个 Node.js 模块及其全部依赖一起编译成单个文件。

## 概述

ncc 将 Node.js 应用及其全部 `node_modules` 打包到一个输出文件中。它非常适合：
- **Serverless Functions** — 部署单个文件，而不是部署 `node_modules`
- **CLI 工具** — 分发自包含的可执行文件
- **Docker 镜像** — 通过移除 `node_modules` 缩小镜像体积

## 安装

```bash
npm install -g @vercel/ncc

# Or as a dev dependency
npm install --save-dev @vercel/ncc
```

## 基本用法

```bash
# Compile index.js into dist/index.js
ncc build input.js -o dist/

# Watch mode for development
ncc build input.js -o dist/ -w

# Run directly without writing to disk
ncc run input.js
```

## CLI 选项

| 标志 | 说明 |
|---|---|
| `-o, --out [dir]` | 输出目录（默认：`dist`） |
| `-m, --minify` | 压缩输出 |
| `-s, --source-map` | 生成 source maps |
| `-a, --asset-builds` | 递归构建嵌套的 JS 资产 |
| `-e, --external [mod]` | 将模块保留为外部依赖（不打包） |
| `-w, --watch` | 监听模式 — 发生变化时重新构建 |
| `-t, --transpile-only` | 跳过 TypeScript 类型检查 |
| `--license [file]` | 将许可证输出到文件 |
| `-q, --quiet` | 隐藏非错误输出 |
| `--no-cache` | 跳过构建缓存 |
| `--no-asset-builds` | 跳过嵌套 JS 资产构建 |

## package.json 集成

```json
{
  "scripts": {
    "build": "ncc build src/index.ts -o dist/ -m",
    "build:watch": "ncc build src/index.ts -o dist/ -w",
    "start": "node dist/index.js"
  },
  "devDependencies": {
    "@vercel/ncc": "^0.38.0"
  }
}
```

## TypeScript 支持

ncc 原生支持 TypeScript — 不需要单独执行 `tsc`：

```bash
# Compiles TypeScript directly
ncc build src/index.ts -o dist/

# Skip type checking for faster builds
ncc build src/index.ts -o dist/ -t
```

ncc 会自动使用项目的 `tsconfig.json`。

## 外部依赖

将特定模块排除在 bundle 之外（适用于原生模块或可选依赖）：

```bash
# Single external
ncc build input.js -e aws-sdk

# Multiple externals
ncc build input.js -e aws-sdk -e sharp
```

对于运行时会提供特定模块的 Serverless 环境（例如 AWS Lambda 的 `aws-sdk`），应将这些模块标记为外部依赖。

## 静态资产

ncc 会处理非 JS 资产（`.json`、`.node`、二进制文件）：将它们复制到编译后 JS 文件旁边的输出目录，并确保运行时正确引用。

## 常见模式

### 打包 Serverless Function

```bash
# Build a minimal serverless handler
ncc build api/handler.ts -o .output/ -m --no-cache
```

### 分发 CLI 工具

```json
{
  "bin": "dist/index.js",
  "scripts": {
    "prepublishOnly": "ncc build src/index.ts -o dist/ -m"
  }
}
```

### GitHub Actions

```bash
# Bundle a GitHub Action into a single file
ncc build src/index.ts -o dist/ -m --license licenses.txt
```

GitHub Actions 要求捆绑全部依赖 — ncc 是自定义 JS/TS actions 的推荐 bundler。

## 要点

1. **单文件输出** — 内联全部依赖，运行时不再需要 `node_modules`
2. **原生支持 TypeScript** — 使用项目的 `tsconfig.json` 直接编译 `.ts` 文件
3. **无需配置文件** — 完全由 CLI 标志驱动
4. **资产处理** — 自动把非 JS 文件复制到输出目录
5. **为原生模块使用外部依赖** — 二进制 `.node` 模块通常需要保留为外部依赖
6. **使用 source maps 调试** — 使用 `-s` 标志生成 `.js.map` 文件
7. **开发时使用监听模式** — 使用 `-w` 快速迭代

## 官方资源

- [ncc GitHub](https://github.com/vercel/ncc)
- [Vercel 博客 — ncc 简介](https://github.com/vercel/ncc)

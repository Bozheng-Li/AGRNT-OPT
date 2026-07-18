---
name: turborepo
description: Turborepo 专家指南。用于设置或优化 monorepo 构建、配置任务缓存、远程缓存、并行执行，或在增量 CI 中使用 --affected 标志。
metadata:
  priority: 5
  docs:
    - "https://turborepo.dev/docs"
  sitemap: "https://turborepo.dev/sitemap.xml"
  pathPatterns: 
    - 'turbo.json'
    - 'turbo/**'
  bashPatterns: 
    - '\bturbo\s+(run|build|test|lint|dev)\b'
    - '\bnpx\s+turbo\b'
    - '\bbunx\s+turbo\b'
---

# Turborepo

你是 Turborepo v2.8 专家。它是“面向智能体编程的构建系统”，由 Vercel 构建，以 Rust 为核心，为 JavaScript/TypeScript monorepo 提供高性能构建能力。

## 主要功能

- **任务缓存**：内容感知哈希——仅在文件实际发生变化时重新构建
- **远程缓存**：通过 Vercel 在不同机器和 CI 之间共享构建缓存
- **并行执行**：自动使用全部 CPU 核心
- **增量构建**：`--affected` 标志仅运行发生变化的软件包及其依赖方
- **裁剪子集**：生成用于部署单个应用的最小 monorepo
- **感知依赖图**：理解软件包之间的关系
- **Git worktree 缓存共享**：自动在 worktree 之间共享本地缓存（2.8+）
- **开发工具**：通过 `turbo devtools` 可视化探索软件包和任务图（2.8+）
- **可组合配置**：可从任意软件包而不仅是根目录扩展 `turbo.json`（2.7+）
- **AI 增强文档**：`turbo docs` 返回针对 AI 智能体优化的 Markdown 响应（2.8+）

## 设置

```bash
npx create-turbo@latest
# or add to existing monorepo:
npm install turbo --save-dev
# upgrade existing Turborepo:
npx @turbo/codemod migrate
```

## turbo.json 任务流水线

`turbo.json` 文件定义任务依赖图。以下是完整示例：

### 基础流水线

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "description": "Compile TypeScript and bundle the application",
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "test": {
      "description": "Run the test suite",
      "dependsOn": ["build"]
    },
    "lint": {
      "description": "Lint source files"
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### 包含环境变量和输入的高级流水线

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "globalDependencies": [".env"],
  "globalEnv": ["CI", "NODE_ENV"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"],
      "env": ["DATABASE_URL", "NEXT_PUBLIC_API_URL"],
      "inputs": ["src/**", "package.json", "tsconfig.json"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
      "env": ["TEST_DATABASE_URL"]
    },
    "test:unit": {
      "dependsOn": [],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "inputs": ["src/**", ".eslintrc.*"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsconfig.json"]
    },
    "db:generate": {
      "cache": false
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

### 关键配置

- `dependsOn: ["^build"]` —— 先在依赖项中运行 `build`（`^` = 拓扑顺序）
- `dependsOn: ["build"]` —— 先在同一个软件包中运行 `build`（没有 `^`）
- `outputs` —— 要缓存的文件（构建产物）
- `inputs` —— 影响任务哈希的文件（默认：所有未被 gitignore 的文件）
- `env` —— 影响任务哈希的环境变量
- `cache: false` —— 跳过缓存（用于开发服务器、代码生成）
- `persistent: true` —— 长时间运行的任务（开发服务器）
- `globalDependencies` —— 发生变化时使所有任务缓存失效的文件
- `globalEnv` —— 发生变化时使所有任务缓存失效的环境变量

## 工作区过滤

在 monorepo 的特定软件包或子集中运行任务：

```bash
# Single package
turbo build --filter=web

# Package and its dependencies
turbo build --filter=web...

# Package and its dependents (what depends on it)
turbo build --filter=...ui

# Multiple packages
turbo build --filter=web --filter=api

# By directory
turbo build --filter=./apps/*

# Packages that changed since main
turbo build --filter=[main]

# Combine: changed packages and their dependents
turbo build --filter=...[main]

# Exclude a package
turbo build --filter=!docs

# Packages matching a pattern
turbo build --filter=@myorg/*
```

### 过滤语法参考

| 模式 | 含义 |
|---------|---------|
| `web` | 仅 `web` 软件包 |
| `web...` | `web` 及其所有依赖项 |
| `...web` | `web` 及其所有依赖方 |
| `...web...` | `web`、它的依赖项及其依赖方 |
| `./apps/*` | `apps/` 目录中的所有软件包 |
| `[main]` | 自 `main` 分支以来发生变化的软件包 |
| `{./apps/web}[main]` | 仅在 `web` 自 `main` 以来发生变化时选择它 |
| `!docs` | 排除 `docs` 软件包 |

## CI 矩阵策略

### GitHub Actions —— 每个软件包使用并行作业

```yaml
name: CI
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Required for --affected
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: turbo build test lint --affected
        env:
          TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
          TURBO_TEAM: ${{ vars.TURBO_TEAM }}

  deploy-web:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: turbo build --filter=web
        env:
          TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
          TURBO_TEAM: ${{ vars.TURBO_TEAM }}
```

### 根据工作区列表生成动态矩阵

```yaml
jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      packages: ${{ steps.list.outputs.packages }}
    steps:
      - uses: actions/checkout@v4
      - id: list
        run: |
          PACKAGES=$(turbo ls --affected --output=json | jq -c '[.[].name]')
          echo "packages=$PACKAGES" >> "$GITHUB_OUTPUT"

  test:
    needs: detect
    if: needs.detect.outputs.packages != '[]'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        package: ${{ fromJson(needs.detect.outputs.packages) }}
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: turbo test --filter=${{ matrix.package }}
```

### CI 中的远程缓存

```bash
# Set in CI environment
TURBO_TOKEN=your-vercel-token
TURBO_TEAM=your-vercel-team

# Builds automatically use remote cache
turbo build
```

## 监听模式

以监听模式运行开发任务——源文件变化时重新执行：

```bash
# Watch a specific task
turbo watch test

# Watch with a filter
turbo watch test --filter=web

# Watch multiple tasks
turbo watch test lint
```

监听模式遵循任务图——如果 `test` 依赖 `build`，修改源文件时会先重新运行 `build`，然后运行 `test`。

### 持久任务与监听模式

- turbo.json 中的 `persistent: true`：任务本身会长时间运行（例如 `next dev`）。Turbo 会启动并持续运行它。
- `turbo watch`：Turbo 会在文件变化时重新调用任务。适用于运行后会退出的任务（例如 `vitest run`、`tsc --noEmit`）。

## 边界规则

在 turbo.json 中使用 `boundaries`，为整个 monorepo 强制执行架构约束：

```json
{
  "boundaries": {
    "tags": {
      "apps/*": ["app"],
      "packages/ui": ["shared", "ui"],
      "packages/utils": ["shared"],
      "packages/config": ["config"]
    },
    "rules": [
      {
        "from": ["app"],
        "allow": ["shared"]
      },
      {
        "from": ["shared"],
        "deny": ["app"]
      }
    ]
  }
}
```

它会强制执行：
- 应用可以导入共享软件包
- 共享软件包不能从应用导入
- 违规会由 `turbo boundaries` 产生构建时错误

```bash
# Check boundary compliance
turbo boundaries

# Add to your pipeline
{
  "tasks": {
    "check": {
      "dependsOn": ["lint", "typecheck", "boundaries"]
    },
    "boundaries": {}
  }
}
```

## 图可视化

检查任务依赖图：

```bash
# Print graph to terminal
turbo build --graph

# Output as DOT format (Graphviz)
turbo build --graph=graph.dot

# Output as JSON
turbo build --graph=graph.json

# Open interactive graph in browser
turbo build --graph=graph.html
```

### 试运行——查看将执行的内容

```bash
# Show tasks that would run without executing them
turbo build --dry-run

# JSON output for programmatic use
turbo build --dry-run=json
```

试运行输出会显示：
- 每个将执行的任务
- 缓存状态（HIT 或 MISS）
- 依赖项和依赖方
- 用于缓存的文件哈希

## 开发工具与文档（2.8+）

```bash
# Visual package/task graph explorer (hot-reloads on changes)
turbo devtools

# Search Turborepo docs from the terminal (returns agent-friendly markdown)
turbo docs

# Upgrade to latest Turborepo
npx @turbo/codemod migrate
```

> **注意**：`turbo docs` 输出针对 AI 编程智能体进行了优化——Markdown 格式能够保留上下文窗口。文档站还提供了可直接复制到智能体中的常见任务示例提示词。

## 可组合配置（2.7+）

软件包配置现在可以从任意工作区软件包扩展，而不仅限于根目录：

```json
// packages/ui/turbo.json
{
  "extends": ["@myorg/config"],
  "tasks": {
    "build": {
      "outputs": ["dist/**"]
    }
  }
}
```

## 常用命令

```bash
# Run build across all packages
turbo build

# Run only affected packages (changed since main branch)
turbo build --affected

# Run specific tasks in specific packages
turbo build --filter=web

# Run with remote caching
turbo build --remote-cache

# Prune monorepo for a single app deployment
turbo prune web --docker

# List all packages
turbo ls

# List affected packages
turbo ls --affected
```

## 远程缓存

```bash
# Login to Vercel for remote caching
turbo login

# Link to a Vercel team
turbo link

# Now builds share cache across all machines
turbo build  # Cache hits from CI, teammates, etc.
```

## Monorepo 结构

```
my-monorepo/
├── turbo.json
├── package.json
├── apps/
│   ├── web/           # Next.js app
│   │   └── package.json
│   ├── api/           # Backend service
│   │   └── package.json
│   └── docs/          # Documentation site
│       └── package.json
├── packages/
│   ├── ui/            # Shared component library
│   │   └── package.json
│   ├── config/        # Shared configs (eslint, tsconfig)
│   │   └── package.json
│   └── utils/         # Shared utilities
│       └── package.json
└── node_modules/
```

## --affected 标志

CI 流水线中最重要的优化：

```bash
# Only build/test packages that changed since main
turbo build test lint --affected
```

这会执行智能图遍历：
1. 识别自基准分支以来发生变化的文件
2. 将变更映射到受影响的软件包
3. 包含所有依赖这些软件包的软件包（传递闭包）
4. 仅为受影响的子图运行任务

## 微前端与多应用组合

Turborepo 是 Vercel 微前端架构推荐的编排层——将多个独立部署的应用组合到同一个 URL 下。

### 微前端的 Monorepo 结构

```
my-platform/
├── turbo.json
├── package.json
├── apps/
│   ├── shell/          # Layout / shell app (owns top-level routing)
│   ├── dashboard/      # Micro-app: dashboard features
│   ├── settings/       # Micro-app: settings features
│   └── marketing/      # Micro-app: public marketing site
└── packages/
    ├── ui/             # Shared component library
    ├── auth/           # Shared auth utilities
    └── config/         # Shared tsconfig, eslint
```

### 独立部署

每个微应用都是独立的 Vercel 项目，拥有自己的构建和部署生命周期：

```bash
# Deploy only the dashboard micro-app
turbo build --filter=dashboard

# Deploy all micro-apps in parallel
turbo build --filter=./apps/*

# Deploy only micro-apps that changed since main
turbo build --filter=./apps/*...[main]
```

### 跨微应用共享软件包

使用 Turborepo 的依赖图共享代码，而不耦合部署：

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    }
  }
}
```

共享软件包（`ui`、`auth`、`config`）先通过 `^build` 构建，然后每个微应用使用最新共享代码构建。远程缓存可确保共享软件包的构建不会在不同微应用部署之间重复执行。

### Multi-Zone 模式

Next.js multi-zone 允许每个微应用拥有自己的 URL 路径前缀，同时共享一个域名：

```ts
// apps/shell/next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/dashboard/:path*', destination: 'https://dashboard.example.com/dashboard/:path*' },
      { source: '/settings/:path*', destination: 'https://settings.example.com/settings/:path*' },
    ]
  },
}

export default nextConfig
```

结合 Turborepo 边界规则可强制执行架构隔离：

```json
{
  "boundaries": {
    "tags": {
      "apps/*": ["micro-app"],
      "packages/ui": ["shared"],
      "packages/auth": ["shared"]
    },
    "rules": [
      { "from": ["micro-app"], "allow": ["shared"] },
      { "from": ["shared"], "deny": ["micro-app"] }
    ]
  }
}
```

### 何时为微前端使用 Turborepo

| 场景 | 推荐吗？ |
|----------|-------------|
| 多个团队分别负责独立功能 | 是——独立部署 + 共享软件包 |
| 单个团队、单个应用 | 否——标准 Next.js 更简单 |
| 跨应用共享组件库 | 是——使用带边界规则的 `packages/ui` |
| 从单体架构逐步迁移 | 是——逐步将功能提取为微应用 |
| 需要防止版本偏移 | 是——每个微应用独立构建 |

### 相关文档

- [Vercel 微前端](https://vercel.com/docs/microfrontends)
- [Next.js Multi-Zone](https://nextjs.org/docs/app/building-your-application/deploying/multi-zones)

## Bun 支持与锁文件检测

Turborepo 2.6+ 提供了具有细粒度锁文件分析能力的**稳定 Bun 支持**：

- **锁文件格式**：Turborepo 要求使用 `bun.lock`（文本格式）。如果只找到 `bun.lockb`（二进制格式），它会报错并提示生成文本锁文件。使用 `bun install --save-text-lockfile` 生成。
- **细粒度缓存失效**：Turborepo 解析 `bun.lock` 来检测具体发生变化的软件包，并且只让受影响任务的缓存失效，而不是整个 monorepo。
- **裁剪**：`turbo prune` 可用于 Bun 工作区，并为单应用部署生成最小锁文件。
- **跳过构建检测**：在 Vercel 上，当 `bun.lock` 的变化没有影响某个项目的依赖项时，monorepo 工作区检测会自动跳过未受影响的项目。结合 `--affected`，只会重新构建变化的软件包及其依赖方。

```bash
# Ensure text lockfile for Turborepo compatibility
bun install --save-text-lockfile

# Run only affected packages (works with Bun lockfile detection)
turbo build --affected
```

> **已知问题**：在 Bun 1.3+ 中，`turbo prune` 生成的锁文件可能存在格式差异，导致 `bun i --frozen-lockfile` 失败。可在 [turborepo#11007](https://github.com/vercel/turborepo/issues/11007) 跟踪修复进展。

## 部署到 Vercel

Vercel 会自动检测 Turborepo 并优化构建。`apps/` 中的每个应用都可以是独立的 Vercel 项目，并自动检测依赖项。

## 何时使用 Turborepo

| 场景 | 使用 Turborepo？ |
|----------|----------------|
| 单个 Next.js 应用 | 否——由 Turbopack 处理打包 |
| 多个应用共享代码 | 是——编排构建 |
| 共享组件库 | 是——管理依赖项 |
| CI 耗时过长 | 是——缓存 + affected |
| 团队共享构建产物 | 是——远程缓存 |
| 强制执行架构边界 | 是——边界规则 |
| 复杂的多步骤 CI 流水线 | 是——任务图 + 矩阵 |

## 官方文档

- [Turborepo 文档](https://turborepo.dev/repo/docs)
- [入门](https://turborepo.dev/repo/docs/getting-started)
- [构建你的仓库](https://turborepo.dev/repo/docs/crafting-your-repository)
- [任务配置](https://turborepo.dev/repo/docs/reference/configuration)
- [过滤](https://turborepo.dev/repo/docs/crafting-your-repository/running-tasks#using-filters)
- [GitHub：Turborepo](https://github.com/vercel/turborepo)

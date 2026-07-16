<div align="center">

<img src="docs/assets/logo.svg" width="96" height="96" alt="Agent-OPT logo" />

# Agent-OPT

### 质量优先的 Agent 技能 / 插件 / MCP 聚合与 Web 适配平台  
### Quality-first aggregator & Web adaptation platform for agent skills, plugins, and MCP servers

[![License](https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Runtime-7c3aed?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTQgNGg2djZINHptMTAgMGg2djZoLTZ6TTQgMTRoNnY2SDR6bTEwIDBoNnY2aC02eiIvPjwvc3ZnPg==)](https://modelcontextprotocol.io/)
[![Verified](https://img.shields.io/badge/Verified%20Web-13-0ea5e9?style=for-the-badge)](#-verified-web-catalog--已验证-web-目录)
[![GitHub stars](https://img.shields.io/github/stars/Bozheng-Li/AGRNT-OPT?style=for-the-badge&logo=github)](https://github.com/Bozheng-Li/AGRNT-OPT/stargazers)

[English](#-english) · [中文](#-中文) · [Docs](docs/) · [Catalog](catalog/plugins/) · [Issues](https://github.com/Bozheng-Li/AGRNT-OPT/issues)

<br/>

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Bozheng-Li/AGRNT-OPT)
&nbsp;
[![Open in GitHub](https://img.shields.io/badge/Open%20on%20GitHub-181717?style=for-the-badge&logo=github)](https://github.com/Bozheng-Li/AGRNT-OPT)
&nbsp;
[![Local Demo](https://img.shields.io/badge/Local%20Demo-localhost%3A3000-111827?style=for-the-badge&logo=googlechrome&logoColor=white)](#-quick-start--快速开始)

<br/>

<img src="docs/assets/hero-banner.svg" alt="Agent-OPT hero banner" width="100%" />

</div>

---

## 🌐 Language / 语言

| | |
|:--|:--|
| 🇨🇳 **中文** | [向下阅读完整中文说明](#-中文) |
| 🇺🇸 **English** | [Jump to full English section](#-english) |

---

<a id="-中文"></a>

# 🇨🇳 中文

## ✨ 项目亮点

> **聚合不是堆链接。**  
> 每个正式项目都保留原始证据与中文说明，经过质量与安全筛选，并拥有与能力匹配的独立 Web 工作流。

| 能力 | 说明 |
|:--|:--|
| 🧭 **发现** | 同步官方 MCP Registry、结构化市场、官方 skill 仓库 |
| 🧪 **质量门禁** | 来源 / 许可证 / 安全 / 实用性 / 适配 / 验证，缺一不可 |
| 🌐 **专属 Web** | 每个正式集成都有独立路由、输入、输出与错误反馈 |
| 🛡️ **沙箱运行** | 文件、Git、SQLite、PDF、图表等写入项目自有沙箱 |
| 🇨🇳 **中英双语** | 保留原文，同时提供审阅过的中文本地化 |

```text
discovered → qualified → translated → adapted → web-ready → verified
                              ↘ blocked / deprecated
```

> 只有 `web-ready` 与 `verified` 会进入公开目录。  
> **翻译元数据 ≠ 已集成。** 没有专属 Web 与真实验证，不算完成。

---

## 📊 当前规模

<div align="center">

| 公开 Web 适配 | 真实验证 | MCP 候选（发现层） | 市场清单 | 路径级 Skill |
|:---:|:---:|:---:|:---:|:---:|
| **13** | **13** | **16,765+** | **2,428** | **620** |

</div>

发现层数字来自 `var/` 快照，**不是**已集成产品数量。公开产品只认通过质量门禁的清单。

---

## 🧩 已验证 Web 目录

点击本地/线上首页的 **「打开 Web」**，或直接访问 `/plugins/<slug>`。

| # | 中文名 | 英文名 | 评分 | 路由 |
|--:|:--|:--|--:|:--|
| 1 | Svelte 开发工作室 | Svelte MCP | 92 | `/plugins/svelte-development-studio` |
| 2 | Blueprint 数据图表工作台 | Blueprint Chart | 91 | `/plugins/blueprint-chart-studio` |
| 3 | 文件系统工作台 | Filesystem MCP Server | 91 | `/plugins/filesystem-workbench` |
| 4 | oxidize-pdf 文档工作台 | oxidize-pdf MCP Server | 90 | `/plugins/oxidize-pdf-workbench` |
| 5 | 世界时间与时区换算 | Time MCP Server | 90 | `/plugins/timezone-converter` |
| 6 | BumpGuard 依赖兼容实验室 | BumpGuard | 89 | `/plugins/bumpguard-dependency-lab` |
| 7 | Git 沙箱工作室 | Git MCP Server | 88 | `/plugins/git-sandbox-studio` |
| 8 | 确定性文本去冗器 | defluff | 88 | `/plugins/prose-defluffer` |
| 9 | 知识图谱记忆库 | Knowledge Graph Memory Server | 87 | `/plugins/knowledge-memory` |
| 10 | Mermaid 图表工作室 | Agentic Mermaid | 87 | `/plugins/mermaid-diagram-studio` |
| 11 | SQLite 数据工作台 | SQLite MCP Server | 87 | `/plugins/sqlite-workbench` |
| 12 | 网页正文读取器 | Fetch MCP Server | 85 | `/plugins/web-content-reader` |
| 13 | 结构化思考工作室 | Sequential Thinking MCP Server | 79 | `/plugins/sequential-thinking-studio` |

每个工作台都有能力专属的输入、输出、帮助、运行反馈与浏览器覆盖。  
Git / SQLite / defluff / Mermaid / Blueprint / oxidize-pdf / BumpGuard 仅写入项目沙箱；BumpGuard 网络仅允许 PyPI、Maven Central、nuget.org 的精确包产物；Svelte 文档网络限制在 `svelte.dev`。

---

## 🚀 快速开始

### 方式 A · 一键公网部署（推荐）

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Bozheng-Li/AGRNT-OPT)

1. 点击上方按钮，用 GitHub 登录 Render  
2. 确认 Blueprint，等待 Docker 构建完成  
3. 打开分配到的 `https://….onrender.com`  
4. 首页即**插件中心**，点任意卡片 **打开 Web**

> 本项目是真实 Next.js + MCP 运行时（子进程、Python、沙箱），**不是**静态站，因此不适合纯 GitHub Pages。

### 方式 B · Docker Compose（本地全栈）

```powershell
docker compose up --build
# 浏览器打开 http://localhost:3000
```

### 方式 C · 本地开发

```powershell
npm install
pip install -r requirements-mcp.txt
npm run runtime:setup:bumpguard   # 仅 BumpGuard 需要 .NET
npm run catalog:validate
npm run dev
```

打开 **http://localhost:3000**

### 方式 D · GHCR 镜像

推送 `master`/`main` 后由 Actions 发布：

```powershell
docker run --rm -p 3000:3000 -e DOTNET_ROOT=/opt/dotnet ghcr.io/bozheng-li/agrnt-opt:latest
```

---

## 🖥️ 如何使用插件中心

```text
首页 CatalogExplorer
   ├─ 搜索能力 / 标签
   ├─ 按分类筛选
   └─ 卡片「打开 Web」 → /plugins/<slug>
```

| 你想… | 怎么做 |
|:--|:--|
| 看全部公开插件 | 打开站点首页 |
| 进入某个 Web 工作台 | 点卡片 **打开 Web** |
| 只看源码元数据 | 打开 [`catalog/plugins/`](catalog/plugins/) |
| 看质量规则 | 阅读 [`docs/QUALITY_GATES.md`](docs/QUALITY_GATES.md) |

---

## 🏗️ 架构一览

```text
┌──────────────────────────────────────────────────────────┐
│  Web UI  (Next.js App Router)                            │
│  首页目录 · 专属 Workspace · 中文界面                    │
└───────────────────────────┬──────────────────────────────┘
                            │ POST /api/plugins/[slug]/invoke
┌───────────────────────────▼──────────────────────────────┐
│  Runtime Adapters  (src/lib/runtime)                     │
│  校验 · 沙箱路径 · 权限边界 · 结果规范化                 │
└───────────────────────────┬──────────────────────────────┘
                            │ MCP stdio
┌───────────────────────────▼──────────────────────────────┐
│  Upstream MCP / packages                                 │
│  Node · Python · .NET (BumpGuard)                        │
└──────────────────────────────────────────────────────────┘
```

| 目录 | 用途 |
|:--|:--|
| `catalog/plugins/` | 可审阅的正式清单（manifest） |
| `catalog/sources.json` | 发现源定义 |
| `src/components/workspaces/` | 每个插件的专属 Web UI |
| `src/lib/runtime/` | 适配器、沙箱、调用与安全 |
| `scripts/` | 同步、校验、排序、运行时安装 |
| `docs/` | 产品章程、架构、质量门禁、来源策略 |
| `var/` | 本地快照与运行时数据（**不提交**） |

---

## 🔁 常用命令

```powershell
# 同步官方 MCP Registry（增量 / 断点续传）
npm run sync:official-mcp
npm run sync:official-mcp -- --max-pages 100

# 同步官方 skill 仓库 / 结构化市场
npm run sync:official-skills
npm run sync:structured-markets

# 清单与质量
npm run catalog:validate
npm run catalog:report

# 自动化验证
npm test
npm run test:e2e
```

### 变更完成前必须通过

```powershell
npm run catalog:validate
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e   # Web 工作流或集成行为变更时
```

---

## 🔐 质量承诺（不可妥协）

- ❌ 不能把「只翻译了元数据」算作已集成  
- ❌ 不能在凭证 / 付费 / 硬件 / 区域 / 外部服务不可用时强行标 `verified`  
- ✅ 公开页只展示 `web-ready` / `verified`  
- ✅ 证据优先级：MCP/官方结构化 API → 官方仓库文档 → 官方市场页 → 可信网络研究  
- ✅ 保留原文、中文、作者、版本、时间戳、许可证与验证证据  

更多细节：

- [产品章程](docs/PRODUCT_CHARTER.md)
- [架构说明](docs/ARCHITECTURE.md)
- [质量门禁](docs/QUALITY_GATES.md)
- [来源策略](docs/SOURCE_POLICY.md)
- [仓库协作规则](AGENTS.md)

---

## 🤝 贡献

欢迎 Issue / PR，但请先阅读质量门禁与产品章程。  
新增公开集成必须包含：证据、中文本地化、专属 Web、真实测试结果。

---

## 📄 许可证

平台代码以仓库声明为准；上游插件/MCP 包保留各自许可证。  
Agent-OPT **优先通过适配器调用上游包**，不擅自拷贝第三方实现。

---

<a id="-english"></a>

# 🇺🇸 English

## ✨ Highlights

> **Aggregation is not a pile of links.**  
> Every formal entry keeps provenance + Chinese localization, passes quality/security review, and ships a dedicated Web workflow matched to the real capability.

| Pillar | What it means |
|:--|:--|
| 🧭 **Discover** | Official MCP Registry, structured marketplaces, official skill repos |
| 🧪 **Quality gates** | Provenance, license, security, usefulness, adaptation, verification |
| 🌐 **Dedicated Web** | Each formal integration gets its own route, inputs, outputs, and errors |
| 🛡️ **Sandboxed runtime** | Files, Git, SQLite, PDF, charts write only into project-owned sandboxes |
| 🇨🇳 **Bilingual** | Original text preserved with reviewed Chinese localization |

```text
discovered → qualified → translated → adapted → web-ready → verified
                              ↘ blocked / deprecated
```

> Public catalog pages only expose `web-ready` and `verified`.  
> **Translated metadata ≠ integrated.** No dedicated Web + real verification means not done.

---

## 📊 Scale snapshot

<div align="center">

| Public Web | Verified | MCP candidates (discovery) | Marketplace listings | Path skills |
|:---:|:---:|:---:|:---:|:---:|
| **13** | **13** | **16,765+** | **2,428** | **620** |

</div>

Discovery counts live under `var/` and are **not** product integration counts. Only quality-gated manifests ship in the public catalog.

---

## 🧩 Verified Web catalog

Use the homepage **Open Web** action, or open `/plugins/<slug>` directly.

| # | Chinese | English | Score | Route |
|--:|:--|:--|--:|:--|
| 1 | Svelte 开发工作室 | Svelte MCP | 92 | `/plugins/svelte-development-studio` |
| 2 | Blueprint 数据图表工作台 | Blueprint Chart | 91 | `/plugins/blueprint-chart-studio` |
| 3 | 文件系统工作台 | Filesystem MCP Server | 91 | `/plugins/filesystem-workbench` |
| 4 | oxidize-pdf 文档工作台 | oxidize-pdf MCP Server | 90 | `/plugins/oxidize-pdf-workbench` |
| 5 | 世界时间与时区换算 | Time MCP Server | 90 | `/plugins/timezone-converter` |
| 6 | BumpGuard 依赖兼容实验室 | BumpGuard | 89 | `/plugins/bumpguard-dependency-lab` |
| 7 | Git 沙箱工作室 | Git MCP Server | 88 | `/plugins/git-sandbox-studio` |
| 8 | 确定性文本去冗器 | defluff | 88 | `/plugins/prose-defluffer` |
| 9 | 知识图谱记忆库 | Knowledge Graph Memory Server | 87 | `/plugins/knowledge-memory` |
| 10 | Mermaid 图表工作室 | Agentic Mermaid | 87 | `/plugins/mermaid-diagram-studio` |
| 11 | SQLite 数据工作台 | SQLite MCP Server | 87 | `/plugins/sqlite-workbench` |
| 12 | 网页正文读取器 | Fetch MCP Server | 85 | `/plugins/web-content-reader` |
| 13 | 结构化思考工作室 | Sequential Thinking MCP Server | 79 | `/plugins/sequential-thinking-studio` |

Each workspace has capability-specific inputs, output handling, help, runtime feedback, and browser coverage. Sandboxed writers never accept host roots from clients. BumpGuard network access is restricted to exact package artifacts from PyPI, Maven Central, and nuget.org. Svelte documentation network access is bounded to `svelte.dev`.

---

## 🚀 Quick start

### A · One-click public deploy (recommended)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Bozheng-Li/AGRNT-OPT)

1. Click the button and sign in to Render with GitHub  
2. Confirm the Blueprint and wait for the Docker build  
3. Open the assigned `https://….onrender.com` URL  
4. The homepage is the **plugin center** — click **Open Web** on any card

> This is a real Next.js + MCP runtime (child processes, Python, sandboxes). It is **not** a static site, so plain GitHub Pages cannot host the runnable center.

### B · Docker Compose (local full stack)

```powershell
docker compose up --build
# open http://localhost:3000
```

### C · Local development

```powershell
npm install
pip install -r requirements-mcp.txt
npm run runtime:setup:bumpguard   # .NET only required for BumpGuard
npm run catalog:validate
npm run dev
```

Open **http://localhost:3000**

### D · GHCR image

Pushes to `master`/`main` publish via Actions:

```powershell
docker run --rm -p 3000:3000 -e DOTNET_ROOT=/opt/dotnet ghcr.io/bozheng-li/agrnt-opt:latest
```

---

## 🖥️ Using the plugin center

```text
Home CatalogExplorer
   ├─ Search capabilities / tags
   ├─ Filter by category
   └─ Card "Open Web" → /plugins/<slug>
```

| Goal | Action |
|:--|:--|
| Browse all public plugins | Open the site homepage |
| Enter a Web workspace | Click **Open Web** on a card |
| Inspect manifests only | Open [`catalog/plugins/`](catalog/plugins/) |
| Read quality rules | See [`docs/QUALITY_GATES.md`](docs/QUALITY_GATES.md) |

---

## 🏗️ Architecture

```text
┌──────────────────────────────────────────────────────────┐
│  Web UI  (Next.js App Router)                            │
│  Catalog · dedicated workspaces · bilingual UX           │
└───────────────────────────┬──────────────────────────────┘
                            │ POST /api/plugins/[slug]/invoke
┌───────────────────────────▼──────────────────────────────┐
│  Runtime Adapters  (src/lib/runtime)                     │
│  Validation · sandbox paths · permission bounds          │
└───────────────────────────┬──────────────────────────────┘
                            │ MCP stdio
┌───────────────────────────▼──────────────────────────────┐
│  Upstream MCP / packages                                 │
│  Node · Python · .NET (BumpGuard)                        │
└──────────────────────────────────────────────────────────┘
```

| Path | Purpose |
|:--|:--|
| `catalog/plugins/` | Curated, reviewable manifests |
| `catalog/sources.json` | Discovery source definitions |
| `src/components/workspaces/` | Per-plugin dedicated Web UIs |
| `src/lib/runtime/` | Adapters, sandbox, invoke, safety |
| `scripts/` | Sync, validate, rank, runtime setup |
| `docs/` | Charter, architecture, gates, source policy |
| `var/` | Local snapshots & runtime data (**not committed**) |

---

## 🔁 Common workflows

```powershell
# Official MCP Registry sync (incremental / resumable)
npm run sync:official-mcp
npm run sync:official-mcp -- --max-pages 100

# Official skill repos / structured marketplaces
npm run sync:official-skills
npm run sync:structured-markets

# Catalog quality
npm run catalog:validate
npm run catalog:report

# Automated verification
npm test
npm run test:e2e
```

### Required before claiming a change complete

```powershell
npm run catalog:validate
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e   # for Web workflow or integration behavior changes
```

---

## 🔐 Non-negotiable product rules

- ❌ Do not count metadata translation as integration  
- ❌ Never mark `verified` when credentials, paid access, hardware, regional access, or external services blocked testing — record the blocker instead  
- ✅ Public pages may only expose `web-ready` / `verified`  
- ✅ Evidence order: MCP/official structured API → official repo/docs → official marketplace → trustworthy research  
- ✅ Preserve original text, Chinese translation, author, version, timestamps, license evidence, and verification evidence  

Read more:

- [Product charter](docs/PRODUCT_CHARTER.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Quality gates](docs/QUALITY_GATES.md)
- [Source policy](docs/SOURCE_POLICY.md)
- [Agent collaboration rules](AGENTS.md)

---

## 🤝 Contributing

Issues and PRs are welcome. Please read the quality gates and product charter first.  
A new public integration must include evidence, Chinese localization, a dedicated Web surface, and real test results.

---

## 📄 License

Platform code follows the repository license declaration. Upstream plugins/MCP packages keep their own licenses.  
Agent-OPT **prefers adapters over vendoring** third-party implementations.

---

<div align="center">

**Agent-OPT** · Quality first · Continuously expanding · Honestly verified

[⬆ Back to top](#agent-opt)

</div>

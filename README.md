<div align="center">

<img src="docs/assets/logo.svg" width="96" height="96" alt="Agent-OPT logo" />

# Agent-OPT

### 质量优先的 Agent 技能 / 插件 / MCP 聚合与 Web 适配平台  
### Quality-first aggregator & Web adaptation platform for agent skills, plugins, and MCP servers

[![License](https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Public Web](https://img.shields.io/badge/Public%20Web-122-0ea5e9?style=for-the-badge)](#verified-public-catalog)
[![Upstream MCP verified](https://img.shields.io/badge/Upstream%20MCP-30%20verified-7c3aed?style=for-the-badge)](#verified-public-catalog)
[![Skills web-ready](https://img.shields.io/badge/Skills-50%20web--ready-f59e0b?style=for-the-badge)](#verified-public-catalog)
[![Publish Docker image](https://github.com/Bozheng-Li/AGRNT-OPT/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/Bozheng-Li/AGRNT-OPT/actions/workflows/docker-publish.yml)
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

## ⚠️ 数字怎么读（先对齐事实）

本仓库严格区分 **发现层** 与 **正式公开集成**：

| 口径 | 当前真实数字 | 来源 | 能否算“已集成” |
|:--|--:|:--|:--|
| 公开 Web 适配（`web-ready` / `verified`） | **122** | `catalog/plugins/*.json` | ✅ 是 |
| 上游 MCP Server | **30** | `kind=mcp-server` | ✅ 全部已验证 |
| 第一方进程内插件 | **42** | `kind=plugin` | ✅ 已验证；明确不计入 MCP |
| Agent Skill 工作室 | **50** | `kind=agent-skill` | ✅ 全部 `web-ready` |
| 可审计清单总量 | **152** | `catalog/plugins/*.json` | 仅公开其中 122 个 |
| 官方 MCP Registry 最新候选 | **16,765** | `var/snapshots/official-mcp-registry/latest-candidates.json` | ❌ 仅发现 |
| MCP 全量版本记录（一次完整同步） | **51,937** / **520** 页 | `var/.../checkpoint.json` | ❌ 仅发现 |
| 结构化市场清单 | **2,428** | `var/snapshots/structured-marketplaces/latest-candidates.json` | ❌ 仅发现 |
| 路径级 skill 候选 | **620** | `var/snapshots/official-skill-repositories/latest-candidates.json` | ❌ 仅发现 |
| 资格审查队列 | **250** | `var/analysis/official-mcp-ranked.json` | ❌ 仍为 `discovered` |

> **翻译元数据 ≠ 已集成。**  
> 发现层数字可以很大；公开目录只放通过质量门禁、有专属 Web、有验证证据的条目。

---

## 🌐 Language / 语言

| | |
|:--|:--|
| 🇨🇳 **中文** | [向下阅读完整中文说明](#-中文) |
| 🇺🇸 **English** | [Jump to full English section](#-english) |

---

<a id="-中文"></a>

# 🇨🇳 中文

## ✨ 项目在做什么

Agent-OPT 不是“堆 MCP 链接”的目录站，而是：

1. **发现**：同步官方 MCP Registry、结构化市场、官方 skill 仓库  
2. **筛选**：来源 / 许可证 / 安全 / 实用性  
3. **适配**：可运行的 runtime 或 skill 文档运行时  
4. **Web**：每个正式项目独立工作台  
5. **验证**：核心 / 场景 / 失败 / Web 证据  

生命周期：

```text
discovered → qualified → translated → adapted → web-ready → verified
                              ↘ blocked / deprecated
```

只有 `web-ready` 与 `verified` 会出现在公开插件中心。

### 什么才算真实集成

| 层级 | 必须具备的证据 |
|:--|:--|
| 来源 | 官方结构化 API、固定仓库提交、作者、版本、许可证与采集时间 |
| Runtime | 精确依赖版本、输入/输出协议、权限边界、资源上限与可解释错误 |
| Web | 与能力相匹配的输入、设置、结果、帮助、示例、运行状态和响应式布局 |
| Verification | 核心功能、代表场景、失败路径、HTTP API 与真实浏览器 E2E |
| Publication | 只有 `web-ready` / `verified` 才进入公开目录；阻塞项保留原因但不上架 |

截至 2026-07-18，完整门禁通过 `208/208` 个 Vitest 用例与 `127/127` 个 Playwright Chromium 流程；生产依赖审计为 `0` 个已知漏洞，Next.js 生产构建生成 125 个静态页面。

---

<a id="verified-public-catalog"></a>

## 📊 公开目录事实

当前公开 **122** 个：

- **30** 个真实上游 **MCP Server**（stdio + 专属工作台 + 真实测试）
- **42** 个第一方进程内 **plugin**（`local-*`，无外网 / 无凭证；不计入 MCP）
- **50** 个 `web-ready` **Agent Skill**（完整中英正文、固定上游资源包、任务执行包、章节/检索/全文、逐项浏览器测试）

> 旧版本把 42 个进程内工具算成 MCP；现已纠正为 `kind=plugin`。MCP 数量只统计具有真实 MCP 传输的上游 Server。

### 上游 MCP 工作台（30）

| 中文名 | 英文名 | 评分 | 路由 |
|:--|:--|--:|:--|
| Starfetch 天文目录实验室 | Starfetch | 95 | `/plugins/starfetch-astronomy-lab` |
| DocGuard 文档漂移实验室 | DocGuard | 94 | `/plugins/docguard-drift-lab` |
| 设计约束验证台 | Design Constraint Validator | 92 | `/plugins/design-constraint-studio` |
| e18e 依赖性能顾问 | e18e MCP | 92 | `/plugins/e18e-dependency-advisor` |
| 全球地震态势实验室 | Earthquake MCP Server | 92 | `/plugins/earthquake-situation-lab` |
| UXLoom 旅程与状态设计台 | UXLoom | 92 | `/plugins/uxloom-journey-studio` |
| PubMed 生物医学证据台 | PubMed MCP Server | 92 | `/plugins/pubmed-evidence-lab` |
| Svelte 开发工作室 | Svelte MCP | 92 | `/plugins/svelte-development-studio` |
| NHTSA 车辆安全实验室 | NHTSA Vehicle Safety MCP Server | 91 | `/plugins/nhtsa-vehicle-safety-lab` |
| World Bank 发展数据实验室 | World Bank MCP Server | 91 | `/plugins/worldbank-development-data-lab` |
| 文件系统工作台 | Filesystem MCP Server | 91 | `/plugins/filesystem-workbench` |
| Blueprint 数据图表工作台 | Blueprint Chart | 91 | `/plugins/blueprint-chart-studio` |
| 音频文件检查台 | Audio File MCP App | 91 | `/plugins/audio-file-inspector` |
| 离线天文观测台 | Astronomy MCP Server | 91 | `/plugins/astronomy-observation-console` |
| Bouncer 合规控制体检台 | bouncer | 91 | `/plugins/bouncer-compliance-studio` |
| oxidize-pdf 文档工作台 | oxidize-pdf MCP Server | 90 | `/plugins/oxidize-pdf-workbench` |
| 世界时间与时区换算 | Time MCP Server | 90 | `/plugins/timezone-converter` |
| MarkItDown 文档工作室 | Microsoft MarkItDown MCP | 90 | `/plugins/markitdown-document-studio` |
| Crossref 学术元数据台 | Crossref MCP Server | 90 | `/plugins/crossref-scholarly-metadata-lab` |
| BumpGuard 依赖兼容实验室 | BumpGuard | 89 | `/plugins/bumpguard-dependency-lab` |
| OSV 漏洞公告研判台 | OSV Advisory MCP Server | 89 | `/plugins/osv-advisory-studio` |
| Safe DOCX 编辑台 | Safe Docx | 88 | `/plugins/safe-docx-studio` |
| Git 沙箱工作室 | Git MCP Server | 88 | `/plugins/git-sandbox-studio` |
| 确定性文本去冗器 | defluff | 88 | `/plugins/prose-defluffer` |
| 知识图谱记忆库 | Knowledge Graph Memory Server | 87 | `/plugins/knowledge-memory` |
| Mermaid 图表工作室 | Agentic Mermaid | 87 | `/plugins/mermaid-diagram-studio` |
| SQLite 数据工作台 | SQLite MCP Server | 87 | `/plugins/sqlite-workbench` |
| Open Library 书目研究台 | Open Library MCP Server | 86 | `/plugins/openlibrary-research-desk` |
| 网页正文读取器 | Fetch MCP Server | 85 | `/plugins/web-content-reader` |
| 结构化思考工作室 | Sequential Thinking MCP Server | 79 | `/plugins/sequential-thinking-studio` |

### 第一方本地插件（42，不计入 MCP）

路由形如 `/plugins/local-json-lab`、`/plugins/local-hash-lab`…  
实现：`src/lib/runtime/local-mcp-tools.ts` + `LocalMcpWorkspace`。  
覆盖 JSON/YAML/CSV、Base64、Hash、UUID、URL、Regex、Cron、SemVer、单位换算、安全算术等确定性本地工具。

### Agent Skill 工作室（50 个公开优先项）

来源：Anthropic 官方 skills（Apache-2.0）+ OpenAI plugins 路径级 skills（MIT）。  
运行方式：`in-process` 双语 Skill 运行时；支持任务目标、专属示例、上下文、GPT/Agent 提示包、检查清单、相关章节、全文检索和固定哈希资源浏览。上游脚本不会被偷偷执行，也不假装成 MCP stdio。
50 个优先项来自机器可读的 [`catalog/curation.json`](catalog/curation.json)；另外 30 个候选保持 `qualified` 或带原因的 `blocked`，不会为了数量提前公开。

| 中文名 | 原名 | 来源 | 路由 |
|:--|:--|:--|:--|
| MCP Server 构建 | mcp-builder | Anthropic | `/plugins/skill-mcp-builder` |
| 前端视觉设计 | frontend-design | Anthropic | `/plugins/skill-frontend-design` |
| Skill 创建与评测 | skill-creator | Anthropic | `/plugins/skill-skill-creator` |
| 算法艺术创作 | algorithmic-art | Anthropic | `/plugins/skill-algorithmic-art` |
| Web 应用测试 | webapp-testing | Anthropic | `/plugins/skill-webapp-testing` |
| 品牌规范应用 | brand-guidelines | Anthropic | `/plugins/skill-brand-guidelines` |
| Web Artifact 构建 | web-artifacts-builder | Anthropic | `/plugins/skill-web-artifacts-builder` |
| 数据可视化选型 | data-visualization | OpenAI plugins | `/plugins/skill-data-visualization` |
| 无障碍与包容性可视化 | accessibility-and-inclusive-visualization | OpenAI plugins | `/plugins/skill-accessibility-and-inclusive-visualization` |
| 结构化头脑风暴 | brainstorming | OpenAI plugins | `/plugins/skill-brainstorming` |
| D3 数据可视化指南 | d3-data-visualization | OpenAI plugins | `/plugins/skill-d3-data-visualization` |
| Canvas2D 可视化指南 | canvas2d-data-visualization | OpenAI plugins | `/plugins/skill-canvas2d-data-visualization` |
| 仪表盘与实时可视化 | dashboards-and-real-time-visualization | OpenAI plugins | `/plugins/skill-dashboards-and-real-time-visualization` |
| Expo 原生 UI 构建 | building-native-ui | OpenAI plugins | `/plugins/skill-building-native-ui` |

---

## 🚀 快速开始

### 公网一键部署

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Bozheng-Li/AGRNT-OPT)

部署后打开站点首页 = **插件中心**（当前 122 个公开卡片），点 **打开 Web** 进入对应工作台。

> 这是 Next.js + MCP/Skill 运行时，**不是**静态站；GitHub Pages 无法直接跑完整插件中心。

### 本地开发

```powershell
npm install
pip install -r requirements-mcp.txt
npm run runtime:setup:bumpguard   # 仅 BumpGuard 需要
npm run catalog:validate
npm run dev
```

打开 **http://localhost:3000**

### Docker

```powershell
docker compose up --build
```

每次推送 `master` / `main` 后，GitHub Actions 会构建并发布 `ghcr.io/bozheng-li/agrnt-opt:latest`。Render Blueprint 使用同一份多阶段 Dockerfile；免费实例不提供持久磁盘，因此公开演示中的沙箱状态会在重启或重新部署后清空。

### 模型供应商说明

当前公开版不要求 OpenAI、Anthropic、DeepSeek、Moonshot、通义或 Ollama 密钥。MCP 工作台直接调用固定版本的 MCP Server，Skill 工作台在本地构建双语任务包；“GPT 风格”描述的是交互与结果组织，而不是隐藏的模型 API 调用。第三方 MCP 子进程默认拿不到宿主模型凭据。

---

## 🖥️ 如何查看全部 Web

1. 打开首页 `http://localhost:3000`（或 Render URL）  
2. 搜索 / 分类筛选  
3. 点卡片 **打开 Web**  
4. MCP 走真实工具调用；Skill 走中文任务包 / 双语正文 / 资源 / 检索流程

清单文件：[`catalog/plugins/`](catalog/plugins/)  
Skill 正文副本：[`catalog/skill-bodies/`](catalog/skill-bodies/)

---

## 🏗️ 架构

```text
Web UI (Next.js)
  └─ POST /api/plugins/[slug]/invoke
       ├─ MCP stdio adapters     → Node/Python upstream MCP (30)
       ├─ First-party plugins    → local-mcp-tools.ts (42, not MCP)
       └─ Skill in-process       → 50 public + 30 qualified/blocked candidates
```

| 目录 | 用途 |
|:--|:--|
| `catalog/plugins/` | 正式清单（唯一公开真相源） |
| `catalog/skill-bodies/` | Skill 原文、完整中文译文、许可证、固定资源包与哈希证据 |
| `src/lib/runtime/` | MCP / Skill 适配与沙箱 |
| `src/components/workspaces/` | 专属 Web 工作台 |
| `var/` | 发现快照（不提交，不可当产品数） |

---

## 🔁 质量命令

```powershell
npm run catalog:validate
npm run catalog:report
npm run check:skill-translations
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e   # Web 行为变更时
npm audit --omit=dev
```

---

## 🔐 不可妥协规则

- 不能把“只翻译了元数据”算集成  
- 不能在缺凭证/付费/硬件/区域条件时强行 `verified`  
- 公开页只展示 `web-ready` / `verified`  
- Skill 与 MCP 分开计数，不混称  
- 证据优先：官方结构化 API → 官方仓库 → 官方市场 → 可信研究  

详见：[`docs/PRODUCT_CHARTER.md`](docs/PRODUCT_CHARTER.md) · [`docs/QUALITY_GATES.md`](docs/QUALITY_GATES.md) · [`AGENTS.md`](AGENTS.md)

---

## 🛣️ 扩展计划（诚实版）

首阶段的 **30 个上游 MCP Server** 与 **50 个公开 Agent Skill** 已完成。后续继续质量优先增量更新，但**不会**把发现候选直接上架：

1. 从 250 条资格审查队列里做许可证 + 无凭证 + 本地可运行筛选  
2. 每批新增 MCP 必须有 adapter + 专属 Web + 真实测试  
3. 维持 50 个公开 Skill 的完整翻译、固定资源、专属任务面板与逐项浏览器门禁
4. 需要密钥或外部账号的条目保持 `blocked` / `discovered`，写清阻塞原因  

---

## 📄 许可证

平台代码见 [LICENSE](LICENSE)。上游 MCP / skill 保留各自许可证；本仓库优先适配调用，不擅自拷贝受限实现。

---

<a id="-english"></a>

# 🇺🇸 English

## What this repo is

Agent-OPT is a **quality-first** platform that discovers agent skills / plugins / MCP servers, localizes them, adapts them to a runtime, ships a dedicated Web workspace, and records real verification.

It deliberately separates:

- **Discovery coverage** (large, under `var/`)  
- **Formal public integrations** (small, under `catalog/plugins/`)

## Facts (measured from this workspace)

| Metric | Value | Counts as integrated? |
|:--|--:|:--|
| Public Web entries | **122** | Yes |
| Verified upstream MCP servers | **30** | Yes |
| Verified first-party in-process plugins | **42** (explicitly not MCP) | Yes |
| Web-ready agent skills | **50** | Yes |
| Auditable catalog manifests | **152** | Only 122 are public |
| MCP registry latest candidates | **16,765** | No |
| MCP version records in full sync | **51,937** across **520** pages | No |
| Structured marketplace listings | **2,428** | No |
| Path-addressed skill candidates | **620** | No |
| Qualification review queue | **250** still `discovered` | No |

## Public catalog

- **30 upstream MCP servers**: real protocol adapters and dedicated Web workflows
- **42 first-party plugins**: deterministic in-process tools with exhaustive Web tests; never counted as MCP
- **50 skill studios**: complete Chinese/original bodies, pinned supporting bundles, skill-specific task profiles, prompt/checklist output, search, source and resource viewers; **scripts are not executed implicitly**

The current release passed 208/208 Vitest cases, 127/127 Playwright Chromium workflows, catalog validation, type checking, linting, a 125-page production build, and a production dependency audit with zero known vulnerabilities. It requires no default LLM provider or model API key: MCP workspaces call pinned MCP runtimes, while Skill workspaces build bilingual task packs locally.

Open `http://localhost:3000` after `npm run dev`, or deploy via the Render button above. The homepage is the plugin center; each card’s **Open Web** route is `/plugins/<slug>`.

## Quick start

```powershell
npm install
pip install -r requirements-mcp.txt
npm run runtime:setup:bumpguard
npm run catalog:validate
npm run dev
```

Required checks before claiming completeness:

```powershell
npm run catalog:validate
npm run catalog:report
npm run check:skill-translations
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
```

## Non-negotiables

- Metadata translation alone is **not** integration  
- Never mark `verified` when credentials/paid access/hardware/region/service blocked the test  
- Public pages only expose `web-ready` / `verified`  
- Do not blur MCP counts with skill counts  
- Preserve provenance, original text, Chinese labels, license evidence, and verification evidence  

## License

See [LICENSE](LICENSE). Upstream packages keep their own licenses.

---

<div align="center">

**Agent-OPT** · Quality first · Honest counts · Continuously expanding

Public now: **122** · Upstream MCP: **30 verified** · Skills: **50 web-ready** · First-party plugins: **42 verified** · Discovery: much larger under `var/`

[⬆ Back to top](#agent-opt)

</div>

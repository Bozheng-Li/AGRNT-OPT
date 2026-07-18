---
name: mcp-builder
description: 创建高质量 MCP（Model Context Protocol）服务器的指南，使 LLM 能通过设计良好的工具与外部服务交互。适用于使用 Python（FastMCP）或 Node/TypeScript（MCP SDK）构建 MCP 服务器，以集成外部 API 或服务的场景。
license: 完整条款见 LICENSE.txt
---

# MCP 服务器开发指南

## 概述

创建 MCP（Model Context Protocol）服务器，使 LLM 能够通过设计良好的工具与外部服务交互。MCP 服务器的质量，取决于它能在多大程度上帮助 LLM 完成现实世界中的任务。

---

# 流程

## 🚀 高层工作流

创建高质量 MCP 服务器包括四个主要阶段：

### 阶段 1：深入研究与规划

#### 1.1 理解现代 MCP 设计

**API 覆盖范围与工作流工具：**
应在全面覆盖 API 端点与提供专用工作流工具之间取得平衡。工作流工具对特定任务可能更方便，而全面覆盖则让 Agent 可以灵活组合操作。不同客户端的性能表现不同——有些客户端受益于通过代码执行组合基础工具，另一些则更适合较高层级的工作流。不确定时，优先保证全面的 API 覆盖。

**工具命名与可发现性：**
清晰、描述准确的工具名称能帮助 Agent 快速找到正确工具。使用一致的前缀（例如 `github_create_issue`、`github_list_repos`）和面向动作的命名方式。

**上下文管理：**
简洁的工具描述和筛选/分页结果的能力对 Agent 很有帮助。应设计返回聚焦、相关数据的工具。部分客户端支持代码执行，可以帮助 Agent 高效筛选和处理数据。

**可操作的错误消息：**
错误消息应通过具体建议和后续步骤，引导 Agent 找到解决方案。

#### 1.2 研究 MCP 协议文档

**浏览 MCP 规范：**

先从站点地图查找相关页面：`https://modelcontextprotocol.io/sitemap.xml`

然后获取带 `.md` 后缀的具体页面以获得 Markdown 格式（例如 `https://modelcontextprotocol.io/specification/draft.md`）。

需要查看的关键页面：
- 规范概述与架构
- 传输机制（streamable HTTP、stdio）
- 工具、资源和提示词定义

#### 1.3 研究框架文档

**推荐技术栈：**
- **语言**：TypeScript（SDK 支持质量高，并且兼容许多执行环境，例如 MCPB。此外，AI 模型擅长生成 TypeScript 代码，这得益于它的广泛使用、静态类型和优秀的 lint 工具）
- **传输**：远程服务器使用 Streamable HTTP，并采用无状态 JSON（相较有状态会话和流式响应，它更容易扩展和维护）。本地服务器使用 stdio。

**加载框架文档：**

- **MCP 最佳实践**：[📋 查看最佳实践](./reference/mcp_best_practices.md) - 核心指南

**TypeScript（推荐）：**
- **TypeScript SDK**：使用 WebFetch 加载 `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
- [⚡ TypeScript 指南](./reference/node_mcp_server.md) - TypeScript 模式与示例

**Python：**
- **Python SDK**：使用 WebFetch 加载 `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
- [🐍 Python 指南](./reference/python_mcp_server.md) - Python 模式与示例

#### 1.4 规划实现

**理解 API：**
查看服务的 API 文档，以识别关键端点、身份验证要求和数据模型。根据需要使用 Web 搜索和 WebFetch。

**工具选择：**
优先实现全面的 API 覆盖。列出要实现的端点，并从最常用的操作开始。

---

### 阶段 2：实现

#### 2.1 建立项目结构

有关项目设置，请参阅特定语言的指南：
- [⚡ TypeScript 指南](./reference/node_mcp_server.md) - 项目结构、package.json、tsconfig.json
- [🐍 Python 指南](./reference/python_mcp_server.md) - 模块组织、依赖项

#### 2.2 实现核心基础设施

创建共享实用工具：
- 带身份验证的 API 客户端
- 错误处理辅助函数
- 响应格式化（JSON/Markdown）
- 分页支持

#### 2.3 实现工具

对每个工具：

**输入 Schema：**
- 使用 Zod（TypeScript）或 Pydantic（Python）
- 包含约束和清晰的描述
- 在字段描述中添加示例

**输出 Schema：**
- 尽可能定义 `outputSchema` 以提供结构化数据
- 在工具响应中使用 `structuredContent`（TypeScript SDK 功能）
- 帮助客户端理解和处理工具输出

**工具描述：**
- 简洁概述功能
- 参数描述
- 返回类型 schema

**实现：**
- 对 I/O 操作使用 async/await
- 使用适当且可操作的错误处理消息
- 在适用时支持分页
- 使用现代 SDK 时，同时返回文本内容和结构化数据

**Annotations：**
- `readOnlyHint`: true/false
- `destructiveHint`: true/false
- `idempotentHint`: true/false
- `openWorldHint`: true/false

---

### 阶段 3：审查与测试

#### 3.1 代码质量

审查以下事项：
- 没有重复代码（DRY 原则）
- 一致的错误处理
- 完整的类型覆盖
- 清晰的工具描述

#### 3.2 构建与测试

**TypeScript：**
- 运行 `npm run build` 验证编译
- 使用 MCP Inspector 测试：`npx @modelcontextprotocol/inspector`

**Python：**
- 验证语法：`python -m py_compile your_server.py`
- 使用 MCP Inspector 测试

有关详细测试方法和质量检查清单，请参阅特定语言的指南。

---

### 阶段 4：创建评估

实现 MCP 服务器后，创建全面评估以测试其有效性。

**加载[✅ 评估指南](./reference/evaluation.md)，了解完整的评估说明。**

#### 4.1 理解评估目的

使用评估来测试 LLM 能否有效使用 MCP 服务器回答现实且复杂的问题。

#### 4.2 创建 10 个评估问题

要创建有效评估，请遵循评估指南中列出的流程：

1. **工具检查**：列出可用工具并了解其能力
2. **内容探索**：使用只读操作探索可用数据
3. **问题生成**：创建 10 个复杂、真实的问题
4. **答案验证**：亲自解答每个问题，以验证答案

#### 4.3 评估要求

确保每个问题都具备以下特点：
- **独立**：不依赖其他问题
- **只读**：只需要非破坏性操作
- **复杂**：需要多次工具调用和深入探索
- **真实**：基于真实的人类使用场景
- **可验证**：只有一个可通过字符串比较验证的明确答案
- **稳定**：答案不会随时间变化

#### 4.4 输出格式

创建具有以下结构的 XML 文件：

```xml
<evaluation>
  <qa_pair>
    <question>Find discussions about AI model launches with animal codenames. One model needed a specific safety designation that uses the format ASL-X. What number X was being determined for the model named after a spotted wild cat?</question>
    <answer>3</answer>
  </qa_pair>
<!-- More qa_pairs... -->
</evaluation>
```

---

# 参考文件

## 📚 文档库

开发期间根据需要加载以下资源：

### MCP 核心文档（首先加载）
- **MCP 协议**：从站点地图 `https://modelcontextprotocol.io/sitemap.xml` 开始，然后获取带 `.md` 后缀的具体页面
- [📋 MCP 最佳实践](./reference/mcp_best_practices.md) - 通用 MCP 指南，包括：
  - 服务器和工具命名约定
  - 响应格式指南（JSON 与 Markdown）
  - 分页最佳实践
  - 传输选择（streamable HTTP 与 stdio）
  - 安全和错误处理标准

### SDK 文档（阶段 1/2 加载）
- **Python SDK**：从 `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md` 获取
- **TypeScript SDK**：从 `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md` 获取

### 特定语言的实现指南（阶段 2 加载）
- [🐍 Python 实现指南](./reference/python_mcp_server.md) - 完整的 Python/FastMCP 指南，包括：
  - 服务器初始化模式
  - Pydantic 模型示例
  - 使用 `@mcp.tool` 注册工具
  - 完整的可运行示例
  - 质量检查清单

- [⚡ TypeScript 实现指南](./reference/node_mcp_server.md) - 完整的 TypeScript 指南，包括：
  - 项目结构
  - Zod schema 模式
  - 使用 `server.registerTool` 注册工具
  - 完整的可运行示例
  - 质量检查清单

### 评估指南（阶段 4 加载）
- [✅ 评估指南](./reference/evaluation.md) - 完整的评估创建指南，包括：
  - 问题创建指南
  - 答案验证策略
  - XML 格式规范
  - 示例问题与答案
  - 使用所提供脚本运行评估

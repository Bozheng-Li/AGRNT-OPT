---
name: durable-objects
description: 创建和审查 Cloudflare Durable Objects。适用于构建有状态协调功能（聊天室、多人游戏、预订系统）、实现 RPC 方法、SQLite 存储、alarms、WebSockets，或依据最佳实践审查 Durable Objects 代码。涵盖 Workers 集成、wrangler 配置以及使用 Vitest 进行测试。相比预训练知识，优先从 Cloudflare 文档检索信息。
---

# Durable Objects

使用 Durable Objects 在 Cloudflare 边缘网络上构建有状态、可协调的应用程序。

## 检索来源

你对 Durable Objects API 和配置的了解可能已经过时。对于任何 Durable Objects 任务，**优先检索，而不是依赖预训练知识**。

| 资源 | URL |
|----------|-----|
| 文档 | https://developers.cloudflare.com/durable-objects/ |
| API 参考 | https://developers.cloudflare.com/durable-objects/api/ |
| 最佳实践 | https://developers.cloudflare.com/durable-objects/best-practices/ |
| 示例 | https://developers.cloudflare.com/durable-objects/examples/ |

实现功能时，请获取相关文档页面。

## 使用时机

- 为有状态协调创建新的 Durable Object 类
- 实现 RPC 方法、alarms 或 WebSocket 处理程序
- 依据最佳实践审查现有 Durable Objects 代码
- 为 Durable Objects 绑定和迁移配置 wrangler.jsonc/toml
- 使用 `@cloudflare/vitest-pool-workers` 编写测试
- 设计分片策略和父子关系

## 参考文档

- `./references/rules.md` - 核心规则、存储、并发、RPC 和 alarms
- `./references/testing.md` - Vitest 设置、单元/集成测试和 alarm 测试
- `./references/workers.md` - Workers 处理程序、类型、wrangler 配置和可观测性

搜索：`blockConcurrencyWhile`、`idFromName`、`getByName`、`setAlarm`、`sql.exec`

## 核心原则

### Durable Objects 的适用场景

| 需求 | 示例 |
|------|---------|
| 协调 | 聊天室、多人游戏、协作文档 |
| 强一致性 | 库存、预订系统、回合制游戏 |
| 按实体存储 | 多租户 SaaS、按用户存储的数据 |
| 持久连接 | WebSockets、实时通知 |
| 按实体调度工作 | 订阅续订、游戏超时 |

### 不要用于

- 无状态请求处理（使用普通 Workers）
- 要求最大程度全球分布的场景
- 高扇出、相互独立的请求

## 快速参考

### Wrangler 配置

```jsonc
// wrangler.jsonc
{
  "durable_objects": {
    "bindings": [{ "name": "MY_DO", "class_name": "MyDurableObject" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["MyDurableObject"] }]
}
```

### 基本 Durable Object 模式

```typescript
import { DurableObject } from "cloudflare:workers";

export interface Env {
  MY_DO: DurableObjectNamespace<MyDurableObject>;
}

export class MyDurableObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data TEXT NOT NULL
        )
      `);
    });
  }

  async addItem(data: string): Promise<number> {
    const result = this.ctx.storage.sql.exec<{ id: number }>(
      "INSERT INTO items (data) VALUES (?) RETURNING id",
      data
    );
    return result.one().id;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const stub = env.MY_DO.getByName("my-instance");
    const id = await stub.addItem("hello");
    return Response.json({ id });
  },
};
```

## 关键规则

1. **围绕协调原子建模** - 每个聊天室/游戏/用户使用一个 Durable Object，而不是使用一个全局 Durable Object
2. **使用 `getByName()` 进行确定性路由** - 相同输入会路由到同一个 Durable Object 实例
3. **使用 SQLite 存储** - 在迁移中配置 `new_sqlite_classes`
4. **在构造函数中初始化** - `blockConcurrencyWhile()` 仅用于 schema 设置
5. **使用 RPC 方法** - 不要使用 fetch() 处理程序（compatibility date >= 2024-04-03）
6. **先持久化，再缓存** - 始终先写入存储，再更新内存状态
7. **每个 Durable Object 只能有一个 alarm** - `setAlarm()` 会替换任何现有 alarm

## 反模式（绝不使用）

- 使用单个全局 Durable Object 处理所有请求（会成为瓶颈）
- 对每个请求都使用 `blockConcurrencyWhile()`（会扼杀吞吐量）
- 仅在内存中存储关键状态（驱逐或崩溃时会丢失）
- 在相互关联的存储写入之间使用 `await`（会破坏原子性）
- 在 `fetch()` 或外部 I/O 期间一直持有 `blockConcurrencyWhile()`

## 创建 Stub

```typescript
// Deterministic - preferred for most cases
const stub = env.MY_DO.getByName("room-123");

// From existing ID string
const id = env.MY_DO.idFromString(storedIdString);
const stub = env.MY_DO.get(id);

// New unique ID - store mapping externally
const id = env.MY_DO.newUniqueId();
const stub = env.MY_DO.get(id);
```

## 存储操作

```typescript
// SQL (synchronous, recommended)
this.ctx.storage.sql.exec("INSERT INTO t (c) VALUES (?)", value);
const rows = this.ctx.storage.sql.exec<Row>("SELECT * FROM t").toArray();

// KV (async)
await this.ctx.storage.put("key", value);
const val = await this.ctx.storage.get<Type>("key");
```

## Alarms

```typescript
// Schedule (replaces existing)
await this.ctx.storage.setAlarm(Date.now() + 60_000);

// Handler
async alarm(): Promise<void> {
  // Process scheduled work
  // Optionally reschedule: await this.ctx.storage.setAlarm(...)
}

// Cancel
await this.ctx.storage.deleteAlarm();
```

## 测试快速入门

```typescript
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("MyDO", () => {
  it("should work", async () => {
    const stub = env.MY_DO.getByName("test");
    const result = await stub.addItem("test");
    expect(result).toBe(1);
  });
});
```

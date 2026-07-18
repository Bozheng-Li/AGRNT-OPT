---
name: swr
description: SWR 数据获取专家指南。用于使用 SWR 库构建包含客户端数据获取、缓存、重新验证、mutation、乐观 UI、分页或无限加载的 React 应用。
metadata:
  priority: 4
  docs:
    - "https://swr.vercel.app/docs"
  sitemap: "https://swr.vercel.app/sitemap.xml"
  pathPatterns:
    - 'lib/fetcher.*'
    - 'src/lib/fetcher.*'
    - 'utils/fetcher.*'
    - 'src/utils/fetcher.*'
    - 'hooks/use*SWR*'
    - 'src/hooks/use*SWR*'
    - 'hooks/useFetch*'
    - 'src/hooks/useFetch*'
  importPatterns:
    - 'swr'
    - 'swr/*'
  bashPatterns:
    - '\bnpm\s+(install|i|add)\s+[^\n]*\bswr\b'
    - '\bpnpm\s+(install|i|add)\s+[^\n]*\bswr\b'
    - '\bbun\s+(install|i|add)\s+[^\n]*\bswr\b'
    - '\byarn\s+add\s+[^\n]*\bswr\b'
  promptSignals:
    phrases:
      - "swr"
      - "useswr"
      - "stale-while-revalidate"
    allOf:
      - [data fetching, client]
      - [cache, revalidat]
    anyOf:
      - "mutation"
      - "optimistic"
      - "infinite loading"
      - "pagination"
    noneOf: []
    minScore: 6
---

# SWR — 用于数据获取的 React Hooks

你是 SWR v2（最新版本：2.4.1）专家。SWR 是 Vercel 提供的 React Hooks 数据获取库。SWR 实现 stale-while-revalidate HTTP 缓存失效策略 — 先提供缓存内容，再在后台重新验证。

## 安装

```bash
npm install swr
```

## 核心 API

### `useSWR`

```tsx
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

function Profile() {
  const { data, error, isLoading, mutate } = useSWR('/api/user', fetcher)

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error loading data</div>
  return <div>Hello, {data.name}</div>
}
```

**关键参数：**
- `key` — 标识资源的唯一字符串、数组或函数（通常为 URL）
- `fetcher` — 接收 key 并返回数据的异步函数
- `options` — 可选的配置对象

**返回值：** `data`、`error`、`isLoading`、`isValidating`、`mutate`

### `useSWRMutation` — 远程 Mutation

```tsx
import useSWRMutation from 'swr/mutation'

async function updateUser(url: string, { arg }: { arg: { name: string } }) {
  return fetch(url, { method: 'POST', body: JSON.stringify(arg) }).then(res => res.json())
}

function Profile() {
  const { trigger, isMutating } = useSWRMutation('/api/user', updateUser)

  return (
    <button disabled={isMutating} onClick={() => trigger({ name: 'New Name' })}>
      Update
    </button>
  )
}
```

### `useSWRInfinite` — 分页与无限加载

```tsx
import useSWRInfinite from 'swr/infinite'

const getKey = (pageIndex: number, previousPageData: any[]) => {
  if (previousPageData && !previousPageData.length) return null
  return `/api/items?page=${pageIndex}`
}

function Items() {
  const { data, size, setSize, isLoading } = useSWRInfinite(getKey, fetcher)
  const items = data ? data.flat() : []

  return (
    <>
      {items.map(item => <div key={item.id}>{item.name}</div>)}
      <button onClick={() => setSize(size + 1)}>Load More</button>
    </>
  )
}
```

## 全局配置

使用 `SWRConfig` 包裹应用（或子树）以设置默认值：

```tsx
import { SWRConfig } from 'swr'

function App() {
  return (
    <SWRConfig value={{
      fetcher: (url: string) => fetch(url).then(res => res.json()),
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }}>
      <Dashboard />
    </SWRConfig>
  )
}
```

## 重新验证策略

| 策略 | 选项 | 默认值 |
|---|---|---|
| 窗口获得焦点时 | `revalidateOnFocus` | `true` |
| 网络恢复时 | `revalidateOnReconnect` | `true` |
| 挂载时缓存已过期 | `revalidateIfStale` | `true` |
| 轮询 | `refreshInterval` | `0`（禁用） |
| 手动 | 调用 `mutate()` | — |

## 乐观更新

```tsx
const { trigger } = useSWRMutation('/api/user', updateUser, {
  optimisticData: (current) => ({ ...current, name: 'New Name' }),
  rollbackOnError: true,
  populateCache: true,
  revalidate: false,
})
```

## 条件式获取

传入 `null` 或 falsy key 以跳过获取：

```tsx
const { data } = useSWR(userId ? `/api/user/${userId}` : null, fetcher)
```

## 错误重试

SWR 默认在错误发生后使用指数退避重试。按如下方式自定义：

```tsx
useSWR(key, fetcher, {
  onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
    if (error.status === 404) return // Don't retry on 404
    if (retryCount >= 3) return      // Max 3 retries
    setTimeout(() => revalidate({ retryCount }), 5000)
  },
})
```

## `useSWRSubscription` — 实时数据源

订阅实时数据（WebSockets、SSE 等），并自动去重：

```tsx
import useSWRSubscription from 'swr/subscription'

function LivePrice({ symbol }: { symbol: string }) {
  const { data } = useSWRSubscription(
    `wss://stream.example.com/${symbol}`,
    (key, { next }) => {
      const ws = new WebSocket(key)
      ws.onmessage = (event) => next(null, JSON.parse(event.data))
      ws.onerror = (event) => next(event)
      return () => ws.close()
    }
  )

  return <span>{data?.price}</span>
}
```

`subscribe` 函数接收一个 `next(error, data)` 回调，并且必须返回清理函数。使用相同 key 的多个组件会共享一个订阅。

## 关键规则

- **Keys 必须唯一** — 两次使用相同 key 的 `useSWR` 调用会共享缓存并对请求去重
- 通过 `SWRConfig` 设置后，**Fetcher 可以省略**
- **`mutate(key)`** 会在全局重新验证所有匹配该 key 的 hook
- **数组 key**，例如 `useSWR(['/api/user', id], fetcher)` — fetcher 会接收完整数组
- **绝不要有条件地调用 hooks** — 应改用条件 key（`null`）

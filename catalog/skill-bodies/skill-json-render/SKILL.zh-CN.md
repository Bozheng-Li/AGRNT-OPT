---
name: json-render
description: AI 聊天响应渲染指南 — 处理 UIMessage parts、工具调用显示、streaming 状态和结构化数据呈现。用于构建自定义聊天 UI、渲染工具结果或排查 AI 响应显示问题。
metadata:
  priority: 4
  docs:
    - "https://nextjs.org/docs/app/api-reference/file-conventions/route"
  sitemap: "https://nextjs.org/sitemap.xml"
  pathPatterns:
    - 'components/chat/**'
    - 'components/chat-*.tsx'
    - 'components/chat-*.ts'
    - 'src/components/chat/**'
    - 'src/components/chat-*.tsx'
    - 'src/components/chat-*.ts'
    - 'components/message*.tsx'
    - 'src/components/message*.tsx'
  bashPatterns: []
---

# AI 聊天响应渲染

你是 AI SDK v6 聊天响应渲染专家，熟悉 UIMessage parts、工具调用结果、streaming 状态以及 React 应用中的结构化数据显示。

## 问题

使用 AI SDK v6 构建聊天界面时，原始消息格式包含多种 part 类型（文本、工具调用、推理、图片）。如果没有正确渲染，响应会显示为原始 JSON 或格式错误的输出。

## AI SDK v6 消息格式

在 v6 中，消息使用包含 `parts` 数组的 `UIMessage` 类型：

```ts
interface UIMessage {
  id: string
  role: 'user' | 'assistant'
  parts: UIMessagePart[]
}

// Part types:
// - { type: 'text', text: string }
// - { type: 'tool-<toolName>', toolCallId: string, state: string, input?: unknown, output?: unknown }
//     state values: 'partial-call' | 'call' | 'output-available' | 'approval-requested' | 'approval-responded' | 'output-denied'
// - { type: 'reasoning', text: string }
// - { type: 'step-start' }  // internal, skip in rendering
```

## 推荐：使用 AI Elements

最简单的方法是使用 AI Elements，它会自动处理所有 part 类型：

```tsx
import { Message } from '@/components/ai-elements/message'
import { Conversation } from '@/components/ai-elements/conversation'

{messages.map((message) => (
  <Message key={message.id} message={message} />
))}
```

⤳ skill: ai-elements — 面向 AI 界面的完整组件库

## 手动渲染模式

如果不使用 AI Elements 并且需要自定义渲染，请遵循此模式：

```tsx
'use client'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

export function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts?.map((part, i) => {
            // 1. Text parts — render as formatted text
            if (part.type === 'text' && part.text.trim()) {
              return (
                <div key={i} className={
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-lg px-3 py-2'
                    : 'bg-muted rounded-lg px-3 py-2'
                }>
                  {part.text}
                </div>
              )
            }

            // 2. Tool parts — type is "tool-<toolName>"
            if (part.type.startsWith('tool-')) {
              const toolPart = part as {
                type: string
                toolCallId: string
                state: string
                input?: unknown
                output?: unknown
              }
              const toolName = toolPart.type.replace('tool-', '')

              if (toolPart.state === 'output-available' && toolPart.output) {
                return <ToolResultCard key={i} name={toolName} output={toolPart.output} />
              }

              if (toolPart.state === 'output-denied') {
                return (
                  <div key={i} className="text-sm text-muted-foreground">
                    {toolName} was denied
                  </div>
                )
              }

              if (toolPart.state === 'approval-requested') {
                return (
                  <div key={i} className="text-sm text-yellow-500">
                    {toolName} requires approval
                  </div>
                )
              }

              return (
                <div key={i} className="text-sm text-muted-foreground animate-pulse">
                  Running {toolName}...
                </div>
              )
            }

            // 3. Reasoning parts
            if (part.type === 'reasoning') {
              return (
                <details key={i} className="text-xs text-muted-foreground">
                  <summary>Thinking...</summary>
                  <p className="whitespace-pre-wrap">{(part as { text: string }).text}</p>
                </details>
              )
            }

            // 4. Skip unknown types (step-start, etc.)
            return null
          })}
        </div>
      ))}
    </div>
  )
}
```

## 将工具结果渲染为卡片

不要倾倒原始 JSON；应将结构化工具输出渲染为人类可读的卡片：

```tsx
function ToolResultCard({ name, output }: { name: string; output: unknown }) {
  const data = output as Record<string, unknown>

  // Pattern: Check for known result shapes and render accordingly
  if (data?.success && data?.issue) {
    const issue = data.issue as { identifier?: string; title?: string }
    return (
      <div className="rounded border border-border bg-card p-2 text-sm">
        <span className="font-medium text-green-400">
          {name === 'createIssue' ? 'Created' : 'Updated'} {issue.identifier}
        </span>
        <p className="text-muted-foreground">{issue.title}</p>
      </div>
    )
  }

  if (data?.items && Array.isArray(data.items)) {
    return (
      <div className="rounded border border-border bg-card p-2 text-sm">
        <p className="font-medium">{data.items.length} results</p>
        {data.items.slice(0, 5).map((item: Record<string, unknown>, i: number) => (
          <p key={i} className="text-muted-foreground">{String(item.name || item.title || item.id)}</p>
        ))}
      </div>
    )
  }

  if (data?.error) {
    return (
      <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
        {String(data.error)}
      </div>
    )
  }

  // Fallback: simple completion message (not raw JSON)
  return (
    <div className="rounded border border-border bg-card p-2 text-xs text-muted-foreground">
      {name} completed
    </div>
  )
}
```

## 服务端要求

服务端路由必须使用正确的 v6 响应格式：

```ts
// app/api/chat/route.ts
import { streamText, convertToModelMessages, gateway } from 'ai'

export async function POST(req: Request) {
  const { messages } = await req.json()

  // IMPORTANT: convertToModelMessages is async in v6
  const modelMessages = await convertToModelMessages(messages)

  const result = streamText({
    model: gateway('anthropic/claude-sonnet-4.6'),
    messages: modelMessages,
  })

  // Use toUIMessageStreamResponse for chat UIs (not toDataStreamResponse)
  return result.toUIMessageStreamResponse()
}
```

## 客户端要求

```tsx
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

const { messages, sendMessage, status } = useChat({
  // v6 uses transport instead of api
  transport: new DefaultChatTransport({ api: '/api/chat' }),
})

// v6 uses sendMessage instead of handleSubmit
sendMessage({ text: inputValue })

// Status values: 'ready' | 'submitted' | 'streaming'
const isLoading = status === 'streaming' || status === 'submitted'
```

## 常见错误

### 1. 聊天响应中出现原始 JSON

**原因**：渲染 `message.content`，而不是遍历 `message.parts`。

**修复**：始终遍历 `message.parts` 并处理每种类型：

```tsx
// WRONG — shows raw JSON
<div>{message.content}</div>

// RIGHT — renders each part type
{message.parts?.map((part, i) => {
  if (part.type === 'text') return <span key={i}>{part.text}</span>
  // ... handle other types
})}
```

### 2. 工具结果显示成 JSON 数据块

**原因**：使用 `JSON.stringify(output)` 作为显示内容。

**修复**：针对已知工具输出结构创建结构化卡片组件。

### 3. “Invalid prompt: messages do not contain...”错误

**原因**：服务端没有把 UI messages 转换为 model messages。

**修复**：使用 `await convertToModelMessages(messages)` — 它在 v6 中是异步函数。

### 4. 消息未出现/响应为空

**原因**：使用 `toDataStreamResponse()`，而不是 `toUIMessageStreamResponse()`。

**修复**：当客户端通过 `DefaultChatTransport` 使用 `useChat` 时，应使用 `toUIMessageStreamResponse()`。

### 5. useChat 无法在 v6 中工作

**原因**：使用 v5 的 `useChat({ api: '/api/chat' })` 模式。

**修复**：使用 `DefaultChatTransport`：

```tsx
// v5 (old)
const { messages, handleSubmit, input } = useChat({ api: '/api/chat' })

// v6 (current)
const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
})
```

## 决策树

```
Building a chat UI with AI SDK v6?
  └─ Want pre-built components?
       └─ Yes → Use AI Elements (⤳ skill: ai-elements)
       └─ No → Manual rendering with parts iteration
            └─ Tool results look like JSON?
                 └─ Create ToolResultCard components for each tool's output shape
            └─ Text not rendering?
                 └─ Check part.type === 'text' and use part.text
            └─ Server errors?
                 └─ Check: await convertToModelMessages(), toUIMessageStreamResponse()
```

## 服务端消息校验

处理前使用 `validateUIMessages` 校验传入消息：

```ts
import { validateUIMessages, convertToModelMessages, streamText, gateway } from 'ai'

export async function POST(req: Request) {
  const { messages } = await req.json()
  const validatedMessages = validateUIMessages(messages)
  const modelMessages = await convertToModelMessages(validatedMessages)
  // ...
}
```

## 官方文档

- [AI SDK UI](https://ai-sdk.dev/docs/ai-sdk-ui)
- [useChat 参考](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot)
- [UIMessage 类型](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message)
- [AI Elements](https://ai-sdk.dev/elements)

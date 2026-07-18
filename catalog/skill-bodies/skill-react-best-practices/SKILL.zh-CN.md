---
name: react-best-practices
description: 面向 TSX 文件的 React 最佳实践审查指南。在编辑多个 TSX 组件后触发，通过涵盖组件结构、Hooks 用法、无障碍、性能和 TypeScript 模式的精简质量清单进行检查。
metadata:
  priority: 4
  docs:
    - "https://react.dev/reference/react"
    - "https://react.dev/learn"
  pathPatterns:
    - 'src/components/**/*.tsx'
    - 'src/components/**/*.jsx'
    - 'app/components/**/*.tsx'
    - 'app/components/**/*.jsx'
    - 'components/**/*.tsx'
    - 'components/**/*.jsx'
    - 'src/ui/**/*.tsx'
    - 'lib/components/**/*.tsx'
  bashPatterns: []
  importPatterns:
    - 'react'
    - 'react-dom'
---

# React 最佳实践审查

编辑若干 TSX/JSX 文件后，按照这份精简清单检查，避免常见问题不断累积。

## 组件结构

- **每个文件一个组件** — 仅当辅助函数为该组件私有时，才将它们放在同一文件中
- **使用命名导出**而不是默认导出，以便更好地重构和 tree-shaking
- **Props 接口**应内联定义或放在同一位置，除非需要共享，否则不要放进单独的 `types.ts`
- **在函数签名中解构 props**：`function Card({ title, children }: CardProps)`
- 在大型项目中**避免 barrel 文件**（通过 `index.ts` 重新导出）— 它们会妨碍 tree-shaking

## Hooks

- **Hooks 规则** — 绝不要有条件地或在循环中调用 hooks
- **自定义 hooks** — 当两个或更多组件共享逻辑时，将可复用逻辑提取到 `use*` 函数
- **依赖数组** — 列出每个响应式值；使用 `react-hooks/exhaustive-deps` 进行 lint
- **`useCallback` / `useMemo`** — 仅在传给已 memoize 的子组件或执行高开销计算时使用，不要默认使用
- **`useEffect` 清理** — 为订阅、计时器和 abort controller 返回清理函数

## 状态管理

- **就近放置状态** — 让状态尽可能靠近使用它的位置
- **派生，而非同步** — 根据现有状态计算值，不要增加 `useEffect` 来镜像状态
- **避免跨越 2–3 层以上逐级传递 props** — 使用 context 或组合（render props / children）
- **服务端状态** — 使用 React Query、SWR 或 Server Components，而不是在 effect 中手动 fetch

## 无障碍（a11y）

- **优先使用语义化 HTML** — 在采用 `<div onClick>` 前，先使用 `<button>`、`<a>`、`<nav>`、`<main>` 等元素
- **每个 `<img>` 都要有 `alt`** — 装饰性图片使用 `alt=""`
- **键盘导航** — 交互元素必须可聚焦，并且可以通过键盘操作
- **`aria-*` 属性** — 仅当原生语义不足时使用；不要重复添加标签

## 性能

- **`React.memo`** — 包裹那些因父组件变化而重新渲染的纯展示组件
- **延迟加载** — 使用 `React.lazy` + `Suspense` 做路由级代码拆分
- **列表 key** — 使用稳定且唯一的 ID；对可重排列表绝不要用数组索引作为 key
- **避免在 JSX props 中使用内联对象/数组字面量** — 每次渲染都会产生新的引用
- **图片优化** — 使用 `next/image` 或响应式 `srcSet`；在 Next.js 中避免未经优化的 `<img>`

## TypeScript 模式

- **`React.FC` 并非必需** — 优先使用带显式返回类型的普通函数声明
- **`PropsWithChildren`** — 当组件接受 `children` 且没有其他自定义 props 时使用
- **事件处理器** — 类型应写为 `React.MouseEvent<HTMLButtonElement>`，而不是 `any`
- **为可复用组件使用泛型** — 例如 `function List<T>({ items, renderItem }: ListProps<T>)`
- **为配置对象使用 `as const`** — 确保可辨识联合和枚举使用字面量类型

## 设计系统一致性

- 在 Vercel 技术栈应用中，先选用 shadcn 原语：Button、Input、Tabs、Dialog、AlertDialog、Sheet、Table、Card，再考虑临时构建等价组件。
- 拒绝容器堆砌：重复出现的 `div rounded-xl border p-6` 区块通常意味着缺少更有力的组合原语。
- 字体排版保持一致：统一使用 Geist Sans 和 Geist Mono；等宽字体只用于代码、指标、ID 和时间戳。

## 审查流程

1. 按照上述模式扫描最近的 TSX 编辑
2. 标出每处违规及其文件路径和行号
3. 建议最小修复 — 不要做超出必要范围的重构
4. 如果一个文件存在多个问题，将它们合并到一次编辑中

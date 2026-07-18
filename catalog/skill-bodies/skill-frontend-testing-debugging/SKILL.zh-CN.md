---
name: frontend-testing-debugging
description: "通过 Build Web Apps 或 web dev 插件测试、调试或针对性改进已渲染的前端应用时使用：包括本地开发服务器、UI 回归、交互错误、控制台错误、响应式布局和视觉 QA。检查 Browser 插件是否可用；如果可用，请优先使用，否则使用普通 Playwright 并记录原因。"
---

# 前端测试与调试

## 调用契约

此技能应能响应普通用户提示。不要要求用户明确说明 Browser 路由、截图、报告结构或回退策略。

当用户要求使用 Build Web Apps 插件、web dev 插件、frontend dev 插件或 frontend testing/debugging 技能，对已渲染的前端进行更改、测试或错误调查时，请使用此技能。

以下示例应触发完整工作流：

- `please make an improvement to the web dashboard transaction search area and use the web dev plugin`
- `use the frontend dev plugin to polish this dashboard`
- `debug this UI with the Build Web Apps plugin`
- `test this localhost app and fix the broken interaction`

面对简短提示时，从仓库、当前打开的应用/浏览器 URL、附近文件或正在运行的开发服务器推断目标界面。如果目标 URL 不明确，请先检查仓库脚本和正在运行的本地端口，再询问用户。

对于已渲染前端界面的任何代码变更，默认执行以下验证循环：

1. 确定目标流程。
2. 选择下方的 Browser 路径。
3. 完成最小且有用的编辑。
4. 验证渲染后的行为。
5. 使用 QA 最终响应报告回复。

## 选择 Browser 路径

首先对 Browser 可用性进行分类：

- **可用**：会话中列出了 Browser 插件及其 `browser` 技能。在执行任何浏览器操作前，先阅读并遵循该技能。
- **缺失**：未列出 Browser 插件或 `browser` 技能。使用普通 Playwright，并记录 `Browser plugin not available`。
- **调用失败**：Browser 看似可用，但技能/运行时、Node REPL JavaScript 设置、标签页获取或导航失败。将其视为 Browser 路径阻碍。

Browser 可用时，不要先使用普通 Playwright、外部 Chrome 或 shell `open`。

只有当用户已经允许回退，或任务明确许可非 Browser 验证时，才能从失败的 Browser 调用切换到普通 Playwright。在这种情况下，请报告 Browser 的确切故障和回退决定。

## 目标流程

进行浏览器验证前，用一句话定义目标流程：

`The flow under test is: [entry route] -> [user action or state] -> [expected rendered result].`

如果用户要求通用冒烟测试，请使用：

`The flow under test is: app loads -> first meaningful screen renders -> primary visible controls respond without runtime errors.`

## Browser 插件循环

通过 Browser 技能所描述的 Node REPL JavaScript 工具运行 Browser 命令。不要自行发明一条独立的浏览器设置路径。除非 Browser 技能另有说明，否则持续使用同一个标签页绑定。

必需顺序：

1. 严格按照 Browser 技能的说明加载 Browser 运行时。
2. 使用 `agent.browser.nameSession("...")` 命名会话。
3. 使用 `agent.browser.tabs.selected()` 或 `agent.browser.tabs.new()` 获取标签页。
4. 使用 `tab.goto(url)` 导航。
5. 运行下方必需检查。
6. 使用限定范围的 `tab.playwright` locator 或 Browser 技能交互 API 进行交互。
7. 编辑后调用 `await tab.reload()`，然后重复检查和失败的交互。

对于每个会改变 UI 的操作，收集能够证明下一状态正确的最低成本证据：最新 DOM snapshot、可见文本/状态、URL 变化、获得焦点的控件、toast、modal、截图或控制台日志。

### 必需的 Browser 检查

在声称渲染后的应用正常工作前，运行以下检查：

1. **页面身份**：`await tab.url()` 和 `await tab.title()` 与目标页面一致。
2. **页面非空**：`await tab.playwright.domSnapshot()` 包含有意义的应用内容，而不是空壳。
3. **没有框架错误 overlay**：snapshot 或截图中未出现 Next.js、Vite、Webpack 或其他框架的错误 overlay。
4. **控制台健康度**：`await tab.dev.logs({ levels: ["error", "warn"], limit: 50 })` 没有相关应用错误，或每个相关错误均已解释。
5. **截图证据**：`await display(await tab.playwright.screenshot({ fullPage: false }))` 能够支持视觉结论。
6. **交互证据**：至少执行一次目标流程交互，并在之后检查状态。

对于视觉工作，在可行时额外测试桌面 viewport 和一个移动端尺寸的 viewport。对于参考驱动的工作，请保留一份简短的差异账本：参考证据、渲染证据、修复或有意偏离。

## Playwright 循环

当 Browser 不可用，或 Browser 调用失败后用户已允许回退时，使用此分支。

按以下顺序执行：

1. 在 `package.json` 中查找脚本。
2. 使用仓库的包管理器启动应用，并保持用户要求的 host 完全一致。
3. 如果仓库已有 e2e 脚本，优先使用。
4. 否则，如果已配置 Playwright，则运行 `pnpm exec playwright test` 或对应包管理器的等效命令。
5. 如果项目没有 Playwright 工作流，先使用 `pnpm exec playwright --version` 验证 Playwright，然后通过 `pnpm exec playwright screenshot <url> /tmp/frontend-check.png` 截取屏幕截图。
6. 如需更深入调试，请在已提交源码之外创建一个小型临时 Playwright 脚本，用于打开 URL、捕获控制台错误和截图，并执行目标交互。
7. 编辑后重新运行相同命令或脚本。

除非任务确实要求且用户已经允许更改依赖项，否则不要安装新的浏览器依赖项。

## 验证检查清单

- 保持用户要求的 host 完全一致。
- 验证控件会更新真实 UI 状态。
- 滚动前检查首个 viewport；在可行时还要检查桌面 viewport 和一个移动端尺寸的 viewport。
- 查找裁切、重叠、文字无法阅读、换行、布局偏移、素材缺失、z-index 问题、滚动陷阱、加载状态陈旧和损坏状态。
- 对于参考驱动的工作，将渲染截图与参考进行比较，并保留简短的差异账本。
- 当用户要求渲染验证时，仅构建通过并不足够。

## QA 最终响应报告

对于任何非平凡的已渲染 UI 验证，都要像验证代码变更的 QA 工程师一样撰写最终响应。报告应便于用户或 PR 审阅者了解改了什么、测试了什么、哪些证据能够证明结果，以及还有哪些内容未测试。

使用以下结构：

- **摘要**：用一两个要点说明用户可见的变更，以及 QA 是否通过。
- **环境**：URL、viewport、Browser 可用性分类；如果使用了 Playwright，还要说明回退原因。
- **已验证的变更**：已更改的文件或界面，以及预期的具体用户行为。
- **检查**：使用通过/失败表格记录页面身份、空白页面检查、框架 overlay 检查、控制台健康度、截图证据和交互证据。
- **交互循环**：经过测试的确切交互路径，包括所操作的控件或工作流以及观察到的状态变化。
- **证据**：在 QA 各章节中描述截图证据，然后把实际截图连续放在响应末尾。包含足够多的截图，以证明相关的变更前、变更后、交互、响应式、错误或修复状态。
- **命令 / Browser API**：列出使用的关键命令和 Browser API 序列，不要倾倒嘈杂日志。
- **剩余风险**：未测试的 viewport、流程、浏览器、数据状态或已知限制。

如果发现问题，请在摘要之前先列出**发现**。每项发现应包含：用户看到什么、复现步骤、截图/DOM/控制台证据、已知时给出可能负责的模块或文件，以及已经实施的修复或剩余阻碍。

使用应向用户展示的 Browser 截图时，请通过 Browser 运行时发出或显示截图，以便在聊天中引用。使用 Playwright 截图时，请将其保存在仓库之外，并在聊天中引用。当多张截图有助于验证不同状态或流程时，请包含多张截图。

不要在书面报告各处穿插截图。请在最末尾设置简短的**截图**章节，并将其组织为连续图片画廊，每行一张图片。仅在标签有助于澄清状态时添加简短标签，例如 `Before`、`After`、`Filtered results`、`Empty state` 或 `Mobile`。

默认不要创建单独的 HTML 报告。只有用户明确要求时才创建独立报告文件；除非用户明确要求提交产物，否则请将它写在仓库之外。

除非用户明确要求提交产物，否则不要把报告、截图、trace 或临时脚本写入仓库。

## 相关技能

- 当任务涉及创建设计、重新设计或忠实实现已接受的概念时，使用 `frontend-app-builder`。
- 对 React/Next.js 组件进行有意义的编辑后，使用 `react-best-practices`。
- 普通调试不要调用 Image Gen。仅当任务要求创建或修改视觉素材，或 `frontend-app-builder` 已经在推动从概念到实现的保真循环时，才使用它。

## 最终响应

使用上述 QA 最终响应报告格式。保持简洁，但应包含足够具体的证据，让 PR 审阅者无需立即重新运行即可信任验证结果。

如果 Browser 缺失而使用了 Playwright，请在结尾建议用户安装 Browser 插件，以获得更好的前端开发体验，包括应用内导航、截图、DOM snapshot、控制台日志和交互验证。

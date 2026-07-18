---
name: webapp-testing
description: 使用 Playwright 与本地 Web 应用交互并进行测试的工具包。支持验证前端功能、调试 UI 行为、捕获浏览器截图和查看浏览器日志。
license: 完整条款见 LICENSE.txt
---

# Web 应用测试

要测试本地 Web 应用，请编写原生 Python Playwright 脚本。

**可用辅助脚本**：
- `scripts/with_server.py` - 管理服务器生命周期（支持多台服务器）

**始终先用 `--help` 运行脚本**以查看用法。在尝试运行脚本并确定确实必须定制解决方案之前，不要读取其源代码。这些脚本可能非常庞大，会污染上下文窗口。它们的设计目的是作为黑盒脚本直接调用，而不是载入上下文窗口。

## 决策树：选择方法

```
User task → Is it static HTML?
    ├─ Yes → Read HTML file directly to identify selectors
    │         ├─ Success → Write Playwright script using selectors
    │         └─ Fails/Incomplete → Treat as dynamic (below)
    │
    └─ No (dynamic webapp) → Is the server already running?
        ├─ No → Run: python scripts/with_server.py --help
        │        Then use the helper + write simplified Playwright script
        │
        └─ Yes → Reconnaissance-then-action:
            1. Navigate and wait for networkidle
            2. Take screenshot or inspect DOM
            3. Identify selectors from rendered state
            4. Execute actions with discovered selectors
```

## 示例：使用 with_server.py

要启动服务器，请先运行 `--help`，然后使用辅助脚本：

**单台服务器：**
```bash
python scripts/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py
```

**多台服务器（例如后端 + 前端）：**
```bash
python scripts/with_server.py \
  --server "cd backend && python server.py" --port 3000 \
  --server "cd frontend && npm run dev" --port 5173 \
  -- python your_automation.py
```

创建自动化脚本时，只包含 Playwright 逻辑（服务器会自动管理）：
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True) # Always launch chromium in headless mode
    page = browser.new_page()
    page.goto('http://localhost:5173') # Server already running and ready
    page.wait_for_load_state('networkidle') # CRITICAL: Wait for JS to execute
    # ... your automation logic
    browser.close()
```

## 先侦察、再行动模式

1. **检查渲染后的 DOM**：
   ```python
   page.screenshot(path='/tmp/inspect.png', full_page=True)
   content = page.content()
   page.locator('button').all()
   ```

2. 根据检查结果**识别 selectors**

3. 使用发现的 selectors **执行操作**

## 常见陷阱

❌ **不要**在动态应用进入 `networkidle` 前检查 DOM
✅ **务必**先等待 `page.wait_for_load_state('networkidle')`，再进行检查

## 最佳实践

- **将捆绑脚本作为黑盒使用**——完成任务时，考虑 `scripts/` 中是否有可用脚本可以提供帮助。这些脚本能可靠处理常见的复杂工作流，又不会让上下文窗口变得杂乱。使用 `--help` 查看用法，然后直接调用。
- 同步脚本使用 `sync_playwright()`
- 完成后始终关闭浏览器
- 使用描述性 selectors：`text=`、`role=`、CSS selectors 或 ID
- 添加适当的等待：`page.wait_for_selector()` 或 `page.wait_for_timeout()`

## 参考文件

- **examples/** - 展示常见模式的示例：
  - `element_discovery.py` - 发现页面上的按钮、链接和输入框
  - `static_html_automation.py` - 对本地 HTML 使用 file:// URL
  - `console_logging.py` - 在自动化期间捕获 console 日志

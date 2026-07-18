---
name: skill-creator
description: 创建新技能、修改和改进现有技能，并衡量技能表现。适用于用户想从零创建技能、编辑或优化现有技能、运行 eval 测试技能、通过方差分析对技能表现进行基准测试，或优化技能 description 以提高触发准确度的场景。
---

# 技能创建器

用于创建新技能并通过迭代不断改进技能的技能。

从高层来看，创建技能的流程如下：

- 决定希望技能做什么，以及大致应如何完成
- 编写技能草稿
- 创建一些测试提示词，并让可访问该技能的 Claude 对其运行
- 帮助用户从定性和定量两个方面评估结果
  - 在后台运行期间，如果还没有定量 eval，就起草一些（如果已有，可以直接使用；若认为有些地方需要调整，也可以修改）。然后向用户解释这些 eval（如果它们本来就存在，则解释现有 eval）
  - 使用 `eval-viewer/generate_review.py` 脚本向用户展示结果，供其审阅，同时让用户查看定量指标
- 根据用户对结果的评估反馈重写技能（如果定量 benchmark 暴露出任何明显缺陷，也应据此修改）
- 重复，直到满意为止
- 扩大测试集，并以更大规模再次尝试

使用此技能时，你的职责是判断用户目前处于流程的哪个位置，然后立即介入，帮助他们推进这些阶段。例如，用户可能会说“我想为 X 制作一个技能”。你可以帮助缩小其含义范围、编写草稿、编写测试用例、确定评估方式、运行所有提示词，然后重复迭代。

另一方面，用户也可能已经有技能草稿。这种情况下，可以直接进入循环中的 eval/迭代部分。

当然，应始终保持灵活。如果用户说“我不需要跑一大堆评估，凭感觉和我一起做就行”，也可以照做。

技能完成后（不过顺序仍然灵活），还可以运行技能 description 改进器；我们为此提供了一个完全独立的脚本，用于优化技能的触发效果。

明白了吗？很好。

## 与用户沟通

使用 Skill Creator 的人对编程术语的熟悉程度可能差异很大。你可能还没听说（当然没听说，它最近才开始流行），现在出现了一种趋势：Claude 的能力正鼓励水管工打开终端，也让父母和祖父母开始搜索“如何安装 npm”。另一方面，大多数用户可能还是具备相当的计算机素养。

因此，请注意上下文线索，以判断应如何措辞！默认情况下，可以参考以下尺度：

- “evaluation”和“benchmark”处于临界位置，但可以使用
- 对于“JSON”和“assertion”，在不做解释直接使用之前，应看到用户熟悉这些术语的明确迹象

如有疑问，可以简短解释术语；如果不确定用户能否理解，也可以用一句简短定义加以澄清。

---

## 创建技能

### 捕捉意图

首先理解用户意图。当前对话中可能已经包含用户想要沉淀的工作流（例如，他们说“把这个变成一个技能”）。如果是这样，应先从对话历史中提取答案——使用过的工具、步骤顺序、用户做出的纠正，以及观察到的输入/输出格式。用户可能需要补充缺失信息，并且应在进入下一步前进行确认。

1. 此技能应让 Claude 能够做什么？
2. 此技能应在什么时候触发？（哪些用户措辞/上下文）
3. 预期的输出格式是什么？
4. 是否应设置测试用例来验证技能有效？具有客观可验证输出的技能（文件转换、数据提取、代码生成、固定工作流步骤）适合测试用例。输出较为主观的技能（写作风格、艺术创作）通常不需要。根据技能类型建议合适的默认方案，但让用户决定。

### 访谈与研究

主动询问边界情况、输入/输出格式、示例文件、成功标准和依赖项。在这些方面梳理清楚之前，不要编写测试提示词。

检查可用的 MCP——如果它们有助于研究（搜索文档、寻找相似技能、查找最佳实践），且有可用的子 Agent，则通过子 Agent 并行研究；否则在当前上下文中进行。带着准备好的上下文来交流，以减轻用户负担。

### 编写 SKILL.md

根据用户访谈填写以下组成部分：

- **name**：技能标识符
- **description**：何时触发以及它做什么。这是主要的触发机制——既要包含技能做什么，也要包含应在什么具体情境下使用。所有“何时使用”信息都放在这里，而不是正文中。注意：Claude 目前有“触发不足”的倾向——即使技能有用，也可能不使用。为应对这一点，请让技能 description 稍微“积极”一些。例如，与其写“如何构建简单快速的仪表盘来显示 Anthropic 内部数据”，不如写“如何构建简单快速的仪表盘来显示 Anthropic 内部数据。只要用户提到仪表盘、数据可视化、内部指标，或想显示任何类型的公司数据，即使他们没有明确要求‘仪表盘’，也务必使用此技能。”
- **compatibility**：必需的工具、依赖项（可选，很少需要）
- **技能的其余部分 :)**

### 技能编写指南

#### 技能的构成

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic/repetitive tasks
    ├── references/ - Docs loaded into context as needed
    └── assets/     - Files used in output (templates, icons, fonts)
```

#### 渐进式披露

技能使用三级加载系统：
1. **元数据**（name + description）- 始终在上下文中（约 100 词）
2. **SKILL.md 正文** - 每当技能触发时进入上下文（理想情况下少于 500 行）
3. **捆绑资源** - 按需加载（不限大小，脚本无需载入上下文即可执行）

这些字数只是近似值，如有需要，可以适当加长。

**关键模式：**
- 将 SKILL.md 控制在 500 行以内；如果快到这个上限，应增加额外的层级，并清晰指示使用该技能的模型接下来应去哪里深入阅读。
- 从 SKILL.md 清楚引用参考文件，并说明应在何时读取
- 对大型参考文件（超过 300 行），提供目录

**领域组织**：当一个技能支持多个领域/框架时，按变体组织：
```
cloud-deploy/
├── SKILL.md (workflow + selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```
Claude 只读取相关的参考文件。

#### 不令人意外原则

这本应是不言自明的，但技能不得包含恶意软件、漏洞利用代码，或任何可能危害系统安全的内容。如果按照描述使用，技能内容的意图不应让用户感到意外。不要配合创建具有误导性的技能，也不要创建旨在帮助未经授权访问、数据外泄或其他恶意活动的技能。不过，“扮演某个 XYZ”之类的技能是可以的。

#### 编写模式

说明中优先使用祈使语气。

**定义输出格式**——可以这样写：
```markdown
## Report structure
ALWAYS use this exact template:
# [Title]
## Executive summary
## Key findings
## Recommendations
```

**示例模式**——加入示例很有帮助。可以按如下方式格式化（但如果示例中使用了“Input”和“Output”，也可以稍作调整）：
```markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

### 写作风格

相比使用生硬、陈旧且过多的 MUST，应尽量向模型解释事情为什么重要。运用心智理论，尽量让技能具有普适性，而不是只局限于具体示例。先写草稿，然后以全新视角重新审视并改进它。

### 测试用例

写完技能草稿后，提出 2–3 个现实的测试提示词——即真实用户确实会说的话。与用户分享它们：[不必逐字照搬]“这里有几个我想尝试的测试用例。它们看起来合适吗？你想再添加一些吗？”然后运行它们。

将测试用例保存到 `evals/evals.json`。此时不要编写 assertion——只保存提示词。下一步中，运行进行的同时再起草 assertion。

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

完整 schema（包括稍后会添加的 `assertions` 字段）见 `references/schemas.md`。

## 运行并评估测试用例

本节是一个连续流程——不要中途停下。不要使用 `/skill-test` 或任何其他测试技能。

将结果放在 `<skill-name>-workspace/` 中，作为技能目录的同级目录。在 workspace 内，按迭代组织结果（`iteration-1/`、`iteration-2/` 等），并在每次迭代中为每个测试用例建立一个目录（`eval-0/`、`eval-1/` 等）。不要预先一次性创建全部目录——按进度逐步创建。

### 步骤 1：在同一轮中启动所有运行（使用技能和 baseline）

对每个测试用例，在同一轮中启动两个子 Agent——一个使用技能，一个不使用。这一点很重要：不要先启动使用技能的运行，再回来补 baseline。应一次性全部启动，让它们大约同时完成。

**使用技能的运行：**

```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any, or "none">
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- Outputs to save: <what the user cares about — e.g., "the .docx file", "the final CSV">
```

**Baseline 运行**（提示词相同，但 baseline 取决于上下文）：
- **创建新技能**：完全不使用技能。提示词相同，不提供技能路径，保存到 `without_skill/outputs/`。
- **改进现有技能**：使用旧版本。编辑前对技能拍快照（`cp -r <skill-path> <workspace>/skill-snapshot/`），然后让 baseline 子 Agent 指向该快照。保存到 `old_skill/outputs/`。

为每个测试用例编写一个 `eval_metadata.json`（assertions 暂时可以为空）。根据测试目标给每个 eval 起一个描述性名称——不要只叫“eval-0”。目录也使用此名称。如果本次迭代使用了新增或修改过的 eval 提示词，应为每个新的 eval 目录创建这些文件——不要假设它们会从上一次迭代继承。

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

### 步骤 2：运行进行时起草 assertions

不要只是等待运行完成——这段时间可以高效利用。为每个测试用例起草定量 assertions，并向用户解释。如果 `evals/evals.json` 中已有 assertions，则审查并解释它们检查的内容。

好的 assertion 应可客观验证，并具有描述性名称——它们在 benchmark viewer 中应清晰易读，使浏览结果的人一眼就明白每项检查什么。主观型技能（写作风格、设计质量）更适合定性评估——不要强行给需要人工判断的内容套上 assertions。

起草完成后，用 assertions 更新 `eval_metadata.json` 文件和 `evals/evals.json`。还应向用户解释他们将在 viewer 中看到什么——包括定性输出和定量 benchmark。

### 步骤 3：运行完成时捕获计时数据

每当一个子 Agent 任务完成时，你会收到包含 `total_tokens` 和 `duration_ms` 的通知。立即将这些数据保存到该运行目录下的 `timing.json`：

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

这是捕获这些数据的唯一机会——它来自任务通知，不会在其他地方持久保存。每条通知到达时就处理，不要试图批量处理。

### 步骤 4：评分、聚合并启动 viewer

所有运行完成后：

1. **为每次运行评分**——启动 grader 子 Agent（或在当前上下文中评分），让它读取 `agents/grader.md` 并根据输出评估每项 assertion。将结果保存到每个运行目录的 `grading.json`。grading.json 的 expectations 数组必须使用字段 `text`、`passed` 和 `evidence`（不能使用 `name`/`met`/`details` 或其他变体）——viewer 依赖这些精确字段名。对于可用程序检查的 assertions，应编写并运行脚本，而不是目测判断——脚本更快、更可靠，也可跨迭代复用。

2. **聚合为 benchmark**——从 skill-creator 目录运行聚合脚本：
   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   ```
   这会生成 `benchmark.json` 和 `benchmark.md`，其中包含每种配置的 pass_rate、时间和 token，用 mean ± stddev 及差值表示。如果手动生成 benchmark.json，请参阅 `references/schemas.md`，了解 viewer 所要求的精确 schema。
将每个 with_skill 版本放在对应的 baseline 之前。

3. **进行分析师审查**——读取 benchmark 数据，找出汇总统计可能掩盖的模式。有关检查内容，见 `agents/analyzer.md`（“Analyzing Benchmark Results”一节），例如：无论是否使用技能都始终通过的 assertions（无区分度）、高方差 eval（可能不稳定），以及时间/token 权衡。

4. **启动 viewer**，同时展示定性输出和定量数据：
   ```bash
   nohup python <skill-creator-path>/eval-viewer/generate_review.py \
     <workspace>/iteration-N \
     --skill-name "my-skill" \
     --benchmark <workspace>/iteration-N/benchmark.json \
     > /dev/null 2>&1 &
   VIEWER_PID=$!
   ```
   从第 2 次迭代开始，还要传入 `--previous-workspace <workspace>/iteration-<N-1>`。

   **Cowork / 无头环境：** 如果 `webbrowser.open()` 不可用或环境没有显示器，使用 `--static <output_path>` 写出独立 HTML 文件，而不是启动服务器。当用户点击“Submit All Reviews”时，反馈会下载为 `feedback.json` 文件。下载后，将 `feedback.json` 复制到 workspace 目录，供下一次迭代读取。

注意：请使用 generate_review.py 创建 viewer；无需编写自定义 HTML。

5. **告知用户**，内容可以类似：“我已经在浏览器中打开了结果。这里有两个标签页——‘Outputs’让你逐个查看测试用例并留下反馈，‘Benchmark’显示定量对比。完成后，请回到这里告诉我。”

### 用户在 viewer 中看到的内容

“Outputs”标签页每次显示一个测试用例：
- **Prompt**：给出的任务
- **Output**：技能生成的文件，并在可能时内嵌渲染
- **Previous Output**（第 2 次及后续迭代）：折叠区域，显示上一次迭代的输出
- **Formal Grades**（如果已评分）：折叠区域，显示 assertion 的通过/失败情况
- **Feedback**：输入时自动保存的文本框
- **Previous Feedback**（第 2 次及后续迭代）：上一次的评论，显示在文本框下方

可通过上一项/下一项按钮或方向键导航。完成后，用户点击“Submit All Reviews”，这会将所有反馈保存到 `feedback.json`。

“Benchmark”标签页显示统计摘要：每种配置的通过率、耗时和 token 使用量，并包含逐 eval 明细和分析师观察。

### 步骤 5：读取反馈

当用户告诉你他们已经完成时，读取 `feedback.json`：

```json
{
  "reviews": [
    {"run_id": "eval-0-with_skill", "feedback": "the chart is missing axis labels", "timestamp": "..."},
    {"run_id": "eval-1-with_skill", "feedback": "", "timestamp": "..."},
    {"run_id": "eval-2-with_skill", "feedback": "perfect, love this", "timestamp": "..."}
  ],
  "status": "complete"
}
```

反馈为空表示用户认为结果没有问题。将改进重点放在用户提出具体意见的测试用例上。

使用完 viewer 服务器后将其终止：

```bash
kill $VIEWER_PID 2>/dev/null
```

---

## 改进技能

这是整个循环的核心。你已经运行测试用例，用户也审阅了结果，现在需要根据反馈改进技能。

### 如何思考改进

1. **从反馈中归纳。** 这里发生的核心事情，是我们试图创建可以使用上百万次（也许真有那么多，甚至更多，谁知道呢）的技能，覆盖许多不同的提示词。你和用户只是反复迭代少数几个示例，因为这样推进得更快。用户对这些示例已经非常熟悉，可以快速评估新输出。但如果你和用户共同开发的技能只对这些示例有效，它就毫无用处。不要做琐碎的过拟合修改，也不要堆砌压迫性的限制性 MUST；如果某个问题顽固存在，可以尝试换用不同的比喻，或推荐不同的工作模式。尝试成本相对较低，也许就能找到很棒的方法。

2. **保持提示词精炼。** 删除没有发挥作用的内容。务必阅读 transcripts，而不只是最终输出——如果技能看起来让模型把大量时间浪费在无效工作上，可以尝试移除技能中导致这些行为的部分，然后观察结果。

3. **解释原因。** 尽力解释你要求模型做每件事背后的**原因**。如今的 LLM 很*聪明*。它们具备很好的心智理论，有了良好的支架后，能超越机械执行指令，真正把事情做好。即使用户的反馈简短或带着挫败感，也要真正理解任务，理解用户为什么那样写、实际写了什么，然后将这种理解传递到说明中。如果你发现自己用全大写写 ALWAYS 或 NEVER，或者使用极其僵化的结构，那是一个黄色警告信号——如果可能，应重新表述并解释为何该要求很重要，让模型理解原因。这是一种更人性化、更强大也更有效的方法。

4. **寻找测试用例间的重复工作。** 阅读测试运行的 transcripts，注意各个子 Agent 是否都各自编写了相似的辅助脚本，或采用了相同的多步方法。如果 3 个测试用例都让子 Agent 编写了 `create_docx.py` 或 `build_chart.py`，这是技能应捆绑该脚本的强烈信号。只编写一次，把它放在 `scripts/` 中，并告诉技能使用它。这样每次未来调用都无需重复造轮子。

这项任务相当重要（我们正努力每年创造数十亿的经济价值！），而你的思考时间并不是瓶颈；请从容思考，真正深入权衡。我建议先写一版修订草稿，然后重新审视并加以改进。务必尽最大努力站在用户角度，理解他们想要什么、需要什么。

### 迭代循环

改进技能后：

1. 将改进应用到技能
2. 将所有测试用例重新运行到新的 `iteration-<N+1>/` 目录中，包括 baseline 运行。如果正在创建新技能，baseline 始终是 `without_skill`（不使用技能）——跨迭代保持不变。如果正在改进现有技能，则根据实际情况判断 baseline 应是用户带来的原始版本，还是上一次迭代。
3. 启动 reviewer，并让 `--previous-workspace` 指向上一次迭代
4. 等待用户审阅并告诉你已经完成
5. 读取新反馈，再次改进并重复

持续进行，直到：
- 用户表示满意
- 反馈全部为空（一切正常）
- 已无法取得有意义的进展

---

## 高级：盲测比较

在需要更严格比较两个技能版本的情况下（例如用户问“新版本真的更好吗？”），可以使用盲测比较系统。详情见 `agents/comparator.md` 和 `agents/analyzer.md`。基本思路是：将两个输出交给一个独立 Agent，但不告诉它各自来自哪个版本，让它判断质量。然后分析获胜者为什么胜出。

这是可选流程，需要子 Agent，大多数用户都不需要。人工审阅循环通常已经足够。

---

## Description 优化

SKILL.md frontmatter 中的 description 字段，是决定 Claude 是否调用某项技能的主要机制。创建或改进技能后，应主动提出优化 description，以提高触发准确度。

### 步骤 1：生成触发 eval 查询

创建 20 条 eval 查询——混合应触发和不应触发的情况。保存为 JSON：

```json
[
  {"query": "the user prompt", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
```

查询必须真实，是 Claude Code 或 Claude.ai 用户确实可能输入的内容。不要写抽象请求，而要写具体、明确且包含充分细节的请求。例如文件路径、用户工作或处境的个人背景、列名和值、公司名称、URL。可以加入一点背景故事。有些查询可以全部小写，包含缩写、拼写错误或口语。混合不同长度，并专注于边界情况，而非一眼就能判断的情况（用户之后会有机会确认这些查询）。

差：`"Format this data"`、`"Extract text from PDF"`、`"Create a chart"`

好：`"ok so my boss just sent me this xlsx file (its in my downloads, called something like 'Q4 sales final FINAL v2.xlsx') and she wants me to add a column that shows the profit margin as a percentage. The revenue is in column C and costs are in column D i think"`

对于**应触发**查询（8–10 条），要考虑覆盖范围。用不同措辞表达相同意图——有些正式，有些口语化。包含用户未明确说出技能或文件类型，但明显需要该技能的情况。加入一些不常见用例，以及此技能与其他技能竞争但应胜出的情况。

对于**不应触发**查询（8–10 条），最有价值的是差一点命中的情况——它们与技能共享关键词或概念，但实际需要的是不同内容。考虑相邻领域、朴素关键词匹配会误触发的含糊表达，以及请求虽触及技能所做的事情、但在该上下文中另一工具更合适的情况。

关键是：不要让不应触发查询明显无关。对 PDF 技能来说，用“编写 Fibonacci 函数”作为负面测试太容易了——它没有检验任何东西。负面情况应当真正棘手。

### 步骤 2：与用户审阅

使用 HTML 模板向用户展示 eval 集合供其审阅：

1. 从 `assets/eval_review.html` 读取模板
2. 替换占位符：
   - `__EVAL_DATA_PLACEHOLDER__` → eval 项组成的 JSON 数组（外面不要加引号——它是 JS 变量赋值）
   - `__SKILL_NAME_PLACEHOLDER__` → 技能名称
   - `__SKILL_DESCRIPTION_PLACEHOLDER__` → 技能当前的 description
3. 写入临时文件（例如 `/tmp/eval_review_<skill-name>.html`）并打开：`open /tmp/eval_review_<skill-name>.html`
4. 用户可以编辑查询、切换 should-trigger、添加/删除条目，然后点击“Export Eval Set”
5. 文件会下载到 `~/Downloads/eval_set.json`——检查 Downloads 文件夹中最新的版本，以防存在多个文件（例如 `eval_set (1).json`）

这一步很重要——糟糕的 eval 查询会导致糟糕的 description。

### 步骤 3：运行优化循环

告知用户：“这需要一些时间——我会在后台运行优化循环，并定期检查进度。”

将 eval 集合保存到 workspace，然后在后台运行：

```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

使用 system prompt 中的模型 ID（即为当前会话提供支持的模型），使触发测试与用户的真实体验一致。

运行期间，定期 tail 输出，向用户更新当前迭代轮次以及得分情况。

该脚本会自动处理完整的优化循环。它将 eval 集合拆分为 60% 训练集和 40% 保留测试集，评估当前 description（每条查询运行 3 次，以获得可靠触发率），然后调用 Claude 根据失败项提出改进。它在训练集和测试集上重新评估每个新 description，最多迭代 5 次。完成后，它会在浏览器中打开一份 HTML 报告，展示每次迭代的结果，并返回带有 `best_description` 的 JSON——根据测试得分而非训练得分选择，从而避免过拟合。

### 技能触发的工作方式

理解触发机制有助于设计更好的 eval 查询。技能会以 name + description 的形式出现在 Claude 的 `available_skills` 列表中，而 Claude 根据 description 判断是否应查阅技能。需要知道的重要一点是：Claude 只会为自己无法轻松处理的任务查阅技能——即使 description 完全匹配，像“读取这个 PDF”这样的简单单步查询也可能不会触发技能，因为 Claude 可以直接用基础工具处理。复杂、多步骤或专业化的查询，在 description 匹配时才会可靠触发技能。

这意味着 eval 查询应具有足够实质内容，让 Claude 确实能从查阅技能中受益。像“读取文件 X”这样的简单查询是糟糕的测试用例——无论 description 多么出色，它们都不会触发技能。

### 步骤 4：应用结果

从 JSON 输出中取出 `best_description`，并更新技能 SKILL.md 的 frontmatter。向用户展示修改前后内容并报告得分。

---

### 打包并展示（仅当 `present_files` 工具可用时）

检查是否可以访问 `present_files` 工具。如果不能，则跳过此步骤。如果可以，打包技能并向用户提供 .skill 文件：

```bash
python -m scripts.package_skill <path/to/skill-folder>
```

打包后，告知用户生成的 `.skill` 文件路径，以便安装。

---

## Claude.ai 专用说明

在 Claude.ai 中，核心工作流相同（草拟 → 测试 → 审阅 → 改进 → 重复），但由于 Claude.ai 没有子 Agent，部分机制需要调整。具体如下：

**运行测试用例**：没有子 Agent 意味着无法并行执行。对于每个测试用例，读取技能的 SKILL.md，然后亲自遵循其说明完成测试提示词。逐一执行。与独立子 Agent 相比，这种方式不够严格（因为技能由你编写，运行时你也掌握全部上下文），但仍是有用的基本检查——人工审阅步骤可以弥补这一点。跳过 baseline 运行——只需使用技能完成请求的任务。

**审阅结果**：如果无法打开浏览器（例如 Claude.ai 的 VM 没有显示器，或你在远程服务器上），完全跳过浏览器 reviewer。改为直接在对话中展示结果。对每个测试用例，显示提示词和输出。如果输出是用户需要查看的文件（如 .docx 或 .xlsx），将它保存到文件系统，并告诉用户文件位置，以便下载和检查。直接询问反馈：“你觉得效果如何？有什么想改的吗？”

**Benchmarking**：跳过定量 benchmark——它依赖 baseline 对比，而没有子 Agent 时，这种对比没有意义。专注于用户的定性反馈。

**迭代循环**：与之前相同——改进技能、重新运行测试用例、询问反馈——只是不在中间使用浏览器 reviewer。如果有文件系统，仍可以将结果组织到迭代目录中。

**Description 优化**：本节需要 `claude` CLI 工具（具体为 `claude -p`），它仅在 Claude Code 中可用。如果处于 Claude.ai，则跳过。

**盲测比较**：需要子 Agent。跳过。

**打包**：`package_skill.py` 脚本在任何有 Python 和文件系统的环境中都能工作。在 Claude.ai 中，可以运行它，用户也可以下载生成的 `.skill` 文件。

**更新现有技能**：用户可能要求更新现有技能，而不是创建新技能。这种情况下：
- **保留原始名称。** 记下技能目录名称和 frontmatter 中的 `name` 字段——保持不变。例如，如果已安装技能是 `research-helper`，则输出 `research-helper.skill`（而不是 `research-helper-v2`）。
- **编辑前复制到可写位置。** 已安装技能的路径可能是只读的。将其复制到 `/tmp/skill-name/`，在那里编辑，并从副本打包。
- **如果手动打包，先在 `/tmp/` 中暂存**，然后复制到输出目录——直接写入可能因权限失败。

---

## Cowork 专用说明

如果你处于 Cowork，需要了解的主要事项是：

- 你有子 Agent，因此主工作流（并行启动测试用例、运行 baseline、评分等）都可以使用。（不过，如果遇到严重的超时问题，也可以串行运行测试提示词。）
- 你没有浏览器或显示器，因此生成 eval viewer 时，应使用 `--static <output_path>` 写出独立 HTML 文件，而不是启动服务器。然后提供一个用户可点击的链接，以便在其浏览器中打开 HTML。
- 不知为何，Cowork 环境似乎会让 Claude 不太愿意在运行测试后生成 eval viewer，因此再次强调：无论是在 Cowork 还是 Claude Code 中，运行测试后都应始终生成 eval viewer，让人类先看到示例，然后你才能自行修订技能并尝试修正；使用 `generate_review.py`（不要自己写花哨的 HTML 代码）。抱歉，这里我要用全大写：在自行评估输入之前，先生成 EVAL VIEWER！你需要尽快把结果呈现给人类！
- 反馈机制不同：由于没有运行中的服务器，viewer 的“Submit All Reviews”按钮会下载 `feedback.json` 文件。随后你可以从那里读取（可能需要先申请访问权限）。
- 打包可正常工作——`package_skill.py` 只需要 Python 和文件系统。
- Description 优化（`run_loop.py` / `run_eval.py`）在 Cowork 中应该也能正常工作，因为它通过子进程使用 `claude -p`，而不依赖浏览器；但请等技能已完全完成且用户确认其状态良好后再执行。
- **更新现有技能**：用户可能要求更新现有技能，而不是创建新技能。请遵循上方 claude.ai 一节中的更新指南。

---

## 参考文件

agents/ 目录包含专门子 Agent 的说明。需要启动相应子 Agent 时阅读它们。

- `agents/grader.md` — 如何根据输出评估 assertions
- `agents/comparator.md` — 如何对两个输出进行盲测 A/B 比较
- `agents/analyzer.md` — 如何分析一个版本胜过另一个版本的原因

references/ 目录包含其他文档：
- `references/schemas.md` — evals.json、grading.json 等的 JSON 结构

---

再次强调核心循环：

- 确定技能的主题
- 草拟或编辑技能
- 在测试提示词上运行可访问该技能的 Claude
- 与用户共同评估输出：
  - 创建 benchmark.json 并运行 `eval-viewer/generate_review.py`，帮助用户审阅输出
  - 运行定量 eval
- 重复，直到你和用户都满意
- 打包最终技能并将其返回给用户。

如果你有 TodoList 之类的功能，请添加步骤，确保不会忘记。如果处于 Cowork，请特别在 TodoList 中加入“创建 evals JSON 并运行 `eval-viewer/generate_review.py`，以便人类审阅测试用例”，确保执行。

祝你好运！

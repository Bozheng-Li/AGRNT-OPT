import type { LocalMcpToolUi } from "@/components/workspaces/local-mcp-workspace";

/** UI field maps for first-party local MCP tools (kept separate from runtime to avoid client bundling node crypto). */
export function getLocalMcpUi(slug: string): { title: string; tools: LocalMcpToolUi[] } | undefined {
  const map: Record<string, { title: string; tools: LocalMcpToolUi[] }> = {
    "local-json-lab": {
      title: "JSON 实验室",
      tools: [
        {
          name: "format_json",
          label: "格式化 JSON",
          fields: [{ key: "text", label: "JSON 文本", kind: "textarea", defaultValue: '{\n  "hello": "world"\n}' }],
        },
        {
          name: "minify_json",
          label: "压缩 JSON",
          fields: [{ key: "text", label: "JSON 文本", kind: "textarea", defaultValue: '{\n  "a": 1\n}' }],
        },
        {
          name: "validate_json",
          label: "校验 JSON",
          fields: [{ key: "text", label: "JSON 文本", kind: "textarea", defaultValue: '{"ok":true}' }],
        },
      ],
    },
    "local-base64-codec": {
      title: "Base64 编解码",
      tools: [
        { name: "encode_base64", label: "编码", fields: [{ key: "text", label: "原文", kind: "textarea", defaultValue: "Agent-OPT" }] },
        { name: "decode_base64", label: "解码", fields: [{ key: "text", label: "Base64", kind: "textarea", defaultValue: "QWdlbnQtT1BU" }] },
      ],
    },
    "local-uuid-factory": {
      title: "UUID 工厂",
      tools: [{ name: "generate_uuid", label: "生成 UUID", fields: [{ key: "count", label: "数量", kind: "number", defaultValue: "3" }] }],
    },
    "local-hash-lab": {
      title: "哈希实验室",
      tools: [
        {
          name: "digest",
          label: "计算摘要",
          fields: [
            { key: "text", label: "文本", kind: "textarea", defaultValue: "hello" },
            { key: "algorithm", label: "算法", kind: "select", options: ["sha256", "sha1", "md5"], defaultValue: "sha256" },
          ],
        },
      ],
    },
    "local-url-lab": {
      title: "URL 实验室",
      tools: [{ name: "parse_url", label: "解析 URL", fields: [{ key: "url", label: "URL", kind: "text", defaultValue: "https://example.com/path?q=1#top" }] }],
    },
    "local-regex-lab": {
      title: "正则实验室",
      tools: [
        {
          name: "test_regex",
          label: "匹配测试",
          fields: [
            { key: "pattern", label: "正则", kind: "text", defaultValue: "\\w+" },
            { key: "flags", label: "flags", kind: "text", defaultValue: "g" },
            { key: "text", label: "样本文本", kind: "textarea", defaultValue: "hello agent-opt 123" },
          ],
        },
      ],
    },
    "local-cron-lab": {
      title: "Cron 实验室",
      tools: [{ name: "validate_cron", label: "校验 cron", fields: [{ key: "expression", label: "表达式", kind: "text", defaultValue: "*/5 * * * *" }] }],
    },
    "local-markdown-stats": {
      title: "Markdown 统计",
      tools: [
        {
          name: "analyze_markdown",
          label: "分析",
          fields: [{ key: "text", label: "Markdown", kind: "textarea", defaultValue: "# Title\n\nHello [link](https://example.com)\n\n```js\n1\n```" }],
        },
      ],
    },
    "local-csv-json": {
      title: "CSV → JSON",
      tools: [
        {
          name: "csv_to_json",
          label: "转换",
          fields: [
            { key: "text", label: "CSV", kind: "textarea", defaultValue: "name,score\nAlice,90\nBob,88" },
            { key: "delimiter", label: "分隔符", kind: "text", defaultValue: "," },
          ],
        },
      ],
    },
    "local-yaml-lab": {
      title: "YAML 实验室",
      tools: [{ name: "yaml_to_json", label: "YAML→JSON", fields: [{ key: "text", label: "YAML", kind: "textarea", defaultValue: "hello: world\ncount: 2" }] }],
    },
    "local-text-case": {
      title: "文本大小写",
      tools: [
        {
          name: "convert_case",
          label: "转换",
          fields: [
            { key: "text", label: "文本", kind: "text", defaultValue: "Hello Agent OPT" },
            { key: "style", label: "风格", kind: "select", options: ["upper", "lower", "title", "snake", "kebab", "camel"], defaultValue: "snake" },
          ],
        },
      ],
    },
    "local-slugify": {
      title: "Slug 生成",
      tools: [{ name: "slugify", label: "生成", fields: [{ key: "text", label: "标题", kind: "text", defaultValue: "Hello Agent OPT!" }] }],
    },
    "local-word-count": {
      title: "字数统计",
      tools: [{ name: "count_text", label: "统计", fields: [{ key: "text", label: "文本", kind: "textarea", defaultValue: "one two three" }] }],
    },
    "local-timestamp-lab": {
      title: "时间戳实验室",
      tools: [
        { name: "now", label: "当前时间", fields: [] },
        { name: "from_epoch", label: "epoch→ISO", fields: [{ key: "value", label: "epoch", kind: "number", defaultValue: "1700000000" }, { key: "unit", label: "单位", kind: "select", options: ["s", "ms"], defaultValue: "s" }] },
        { name: "to_epoch", label: "ISO→epoch", fields: [{ key: "value", label: "时间", kind: "text", defaultValue: "2024-01-01T00:00:00.000Z" }] },
      ],
    },
    "local-color-lab": {
      title: "颜色实验室",
      tools: [{ name: "hex_to_rgb", label: "HEX→RGB", fields: [{ key: "hex", label: "HEX", kind: "text", defaultValue: "#0f9f6e" }] }],
    },
    "local-jwt-inspect": {
      title: "JWT 检查",
      tools: [
        {
          name: "decode_jwt",
          label: "解码",
          fields: [
            {
              key: "token",
              label: "JWT",
              kind: "textarea",
              defaultValue:
                "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFnZW50LU9QVCJ9.",
            },
          ],
        },
      ],
    },
    "local-html-escape": {
      title: "HTML 转义",
      tools: [
        { name: "escape_html", label: "转义", fields: [{ key: "text", label: "文本", kind: "textarea", defaultValue: "<b>hi</b>" }] },
        { name: "unescape_html", label: "反转义", fields: [{ key: "text", label: "文本", kind: "textarea", defaultValue: "&lt;b&gt;hi&lt;/b&gt;" }] },
      ],
    },
    "local-percent-codec": {
      title: "百分号编解码",
      tools: [
        { name: "encode", label: "编码", fields: [{ key: "text", label: "文本", kind: "text", defaultValue: "a b/中文" }] },
        { name: "decode", label: "解码", fields: [{ key: "text", label: "编码串", kind: "text", defaultValue: "a%20b" }] },
      ],
    },
    "local-number-base": {
      title: "进制转换",
      tools: [
        {
          name: "convert_base",
          label: "转换",
          fields: [
            { key: "value", label: "值", kind: "text", defaultValue: "255" },
            { key: "fromBase", label: "源进制", kind: "number", defaultValue: "10" },
            { key: "toBase", label: "目标进制", kind: "number", defaultValue: "16" },
          ],
        },
      ],
    },
    "local-line-tools": {
      title: "行处理",
      tools: [
        {
          name: "process_lines",
          label: "处理",
          fields: [
            { key: "text", label: "文本", kind: "textarea", defaultValue: "b\na\na\nc" },
            { key: "mode", label: "模式", kind: "select", options: ["sort", "unique", "reverse", "sort-unique"], defaultValue: "sort-unique" },
          ],
        },
      ],
    },
    "local-semver-lab": {
      title: "SemVer 比较",
      tools: [
        {
          name: "compare_semver",
          label: "比较",
          fields: [
            { key: "a", label: "版本 A", kind: "text", defaultValue: "1.2.3" },
            { key: "b", label: "版本 B", kind: "text", defaultValue: "1.10.0" },
          ],
        },
      ],
    },
    "local-ipv4-check": {
      title: "IPv4 检查",
      tools: [{ name: "check_ipv4", label: "检查", fields: [{ key: "address", label: "地址", kind: "text", defaultValue: "192.168.1.1" }] }],
    },
    "local-unit-convert": {
      title: "单位换算",
      tools: [
        {
          name: "convert_unit",
          label: "换算",
          fields: [
            { key: "value", label: "数值", kind: "number", defaultValue: "100" },
            { key: "from", label: "从", kind: "select", options: ["m", "km", "cm", "mm", "mi", "ft", "c", "f", "k"], defaultValue: "c" },
            { key: "to", label: "到", kind: "select", options: ["m", "km", "cm", "mm", "mi", "ft", "c", "f", "k"], defaultValue: "f" },
          ],
        },
      ],
    },
    "local-password-strength": {
      title: "密码强度",
      tools: [{ name: "score_password", label: "评估", fields: [{ key: "password", label: "密码", kind: "text", defaultValue: "S3cure!Pass" }] }],
    },
    "local-diff-lab": {
      title: "文本 Diff",
      tools: [
        {
          name: "diff_lines",
          label: "对比",
          fields: [
            { key: "a", label: "文本 A", kind: "textarea", defaultValue: "one\ntwo\nthree" },
            { key: "b", label: "文本 B", kind: "textarea", defaultValue: "one\nthree\nfour" },
          ],
        },
      ],
    },
    "local-lorem": {
      title: "占位文本",
      tools: [
        {
          name: "generate_lorem",
          label: "生成",
          fields: [
            { key: "paragraphs", label: "段落数", kind: "number", defaultValue: "2" },
            { key: "seed", label: "种子", kind: "number", defaultValue: "1" },
          ],
        },
      ],
    },
    "local-bytes-format": {
      title: "字节格式化",
      tools: [{ name: "format_bytes", label: "格式化", fields: [{ key: "bytes", label: "字节", kind: "number", defaultValue: "1536000" }] }],
    },
    "local-querystring": {
      title: "查询串",
      tools: [
        { name: "parse_query", label: "解析", fields: [{ key: "text", label: "query", kind: "text", defaultValue: "a=1&b=hello" }] },
        { name: "stringify_query", label: "序列化", fields: [{ key: "json", label: "JSON 对象", kind: "textarea", defaultValue: '{"a":"1","b":"hello"}' }] },
      ],
    },
    "local-markdown-toc": {
      title: "Markdown 目录",
      tools: [
        {
          name: "build_toc",
          label: "生成 TOC",
          fields: [{ key: "text", label: "Markdown", kind: "textarea", defaultValue: "# A\n\n## B\n\n### C\n" }],
        },
      ],
    },
    "local-json-path": {
      title: "JSON 路径",
      tools: [
        {
          name: "get_path",
          label: "读取路径",
          fields: [
            { key: "text", label: "JSON", kind: "textarea", defaultValue: '{"user":{"name":"Ada"}}' },
            { key: "path", label: "路径", kind: "text", defaultValue: "user.name" },
          ],
        },
      ],
    },
    "local-roman": {
      title: "罗马数字",
      tools: [{ name: "to_roman", label: "转换", fields: [{ key: "value", label: "整数", kind: "number", defaultValue: "2026" }] }],
    },
    "local-whitespace": {
      title: "空白规范化",
      tools: [
        {
          name: "normalize_whitespace",
          label: "规范化",
          fields: [
            { key: "text", label: "文本", kind: "textarea", defaultValue: "a   b\n\n\nc" },
            { key: "mode", label: "模式", kind: "select", options: ["spaces", "lines", "both"], defaultValue: "both" },
          ],
        },
      ],
    },
    "local-emoji-strip": {
      title: "Emoji 清理",
      tools: [{ name: "strip_emoji", label: "清理", fields: [{ key: "text", label: "文本", kind: "text", defaultValue: "hello 😀 world" }] }],
    },
    "local-caesar": {
      title: "凯撒密码",
      tools: [
        {
          name: "shift_text",
          label: "移位",
          fields: [
            { key: "text", label: "文本", kind: "text", defaultValue: "Hello" },
            { key: "shift", label: "位移", kind: "number", defaultValue: "3" },
          ],
        },
      ],
    },
    "local-math-eval": {
      title: "安全数学计算",
      tools: [{ name: "evaluate", label: "计算", fields: [{ key: "expression", label: "表达式", kind: "text", defaultValue: "(1+2)*3/4" }] }],
    },
    "local-random-lab": {
      title: "随机数实验室",
      tools: [
        {
          name: "random_int",
          label: "随机整数",
          fields: [
            { key: "min", label: "最小", kind: "number", defaultValue: "1" },
            { key: "max", label: "最大", kind: "number", defaultValue: "10" },
          ],
        },
        {
          name: "pick_one",
          label: "随机抽取",
          fields: [{ key: "items", label: "选项(换行或逗号)", kind: "textarea", defaultValue: "red\ngreen\nblue" }],
        },
      ],
    },
    "local-template-fill": {
      title: "模板填充",
      tools: [
        {
          name: "fill_template",
          label: "填充",
          fields: [
            { key: "template", label: "模板", kind: "textarea", defaultValue: "Hello {{name}}, score={{score}}" },
            { key: "json", label: "数据 JSON", kind: "textarea", defaultValue: '{"name":"Ada","score":99}' },
          ],
        },
      ],
    },
    "local-checksum": {
      title: "校验和",
      tools: [{ name: "sha256", label: "SHA-256", fields: [{ key: "text", label: "文本", kind: "textarea", defaultValue: "agent-opt" }] }],
    },
    "local-path-posix": {
      title: "POSIX 路径",
      tools: [{ name: "join_posix", label: "拼接", fields: [{ key: "parts", label: "段(换行)", kind: "textarea", defaultValue: "var\nruntime\nfiles" }] }],
    },
    "local-mime-guess": {
      title: "MIME 猜测",
      tools: [{ name: "guess_mime", label: "猜测", fields: [{ key: "name", label: "文件名", kind: "text", defaultValue: "report.pdf" }] }],
    },
    "local-relative-time": {
      title: "相对时间",
      tools: [{ name: "from_now", label: "相对描述", fields: [{ key: "value", label: "ISO/epoch", kind: "text", defaultValue: "2020-01-01T00:00:00.000Z" }] }],
    },
    "local-table-md": {
      title: "Markdown 表格",
      tools: [
        {
          name: "rows_to_table",
          label: "生成表格",
          fields: [
            {
              key: "json",
              label: "行 JSON",
              kind: "textarea",
              defaultValue: '[{"name":"Ada","score":99},{"name":"Bob","score":88}]',
            },
          ],
        },
      ],
    },
  };

  return map[slug];
}

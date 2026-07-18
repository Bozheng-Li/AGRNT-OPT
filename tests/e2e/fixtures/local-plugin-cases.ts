export type ToolBrowserCase = {
  /** Values that intentionally differ from the production UI defaults. */
  values?: Record<string, string>;
  /** Stable, semantic fragments expected in the rendered result. */
  expected: Array<string | RegExp>;
};

export type InvalidBrowserCase = {
  tool: string;
  values: Record<string, string>;
};

export type LocalPluginBrowserCase = {
  tools: Record<string, ToolBrowserCase>;
  invalid: InvalidBrowserCase;
};

// Large enough to cross every bounded text field used below while staying below
// the HTTP route's 300 kB request ceiling. This reaches the adapter validation
// and lets the real page render its controlled error response.
const TOO_LONG = "x".repeat(200_001);

export const localPluginCases: Record<string, LocalPluginBrowserCase> = {
  "local-base64-codec": {
    tools: {
      encode_base64: { expected: ["QWdlbnQtT1BU"] },
      decode_base64: { expected: ["Agent-OPT"] },
    },
    invalid: { tool: "decode_base64", values: { text: "" } },
  },
  "local-bytes-format": {
    tools: { format_bytes: { expected: ["1.46 MiB", /"unit":\s*"MiB"/] } },
    invalid: { tool: "format_bytes", values: { bytes: "-1" } },
  },
  "local-caesar": {
    tools: { shift_text: { expected: ["Khoor", /"shift":\s*3/] } },
    invalid: { tool: "shift_text", values: { shift: "26" } },
  },
  "local-checksum": {
    tools: { sha256: { expected: ["8c23215e4577d45f", /"digest"/] } },
    invalid: { tool: "sha256", values: { text: TOO_LONG } },
  },
  "local-color-lab": {
    tools: { hex_to_rgb: { expected: ["rgb(15, 159, 110)", /"r":\s*15/] } },
    invalid: { tool: "hex_to_rgb", values: { hex: "zz" } },
  },
  "local-cron-lab": {
    tools: { validate_cron: { expected: [/"valid":\s*true/, "*/5 * * * *"] } },
    invalid: { tool: "validate_cron", values: { expression: "too few" } },
  },
  "local-csv-json": {
    tools: { csv_to_json: { expected: ["Alice", /"rowCount":\s*2/] } },
    invalid: { tool: "csv_to_json", values: { text: "only-header" } },
  },
  "local-diff-lab": {
    tools: { diff_lines: { expected: [/"removedCount":\s*1/, /"addedCount":\s*1/, "four"] } },
    invalid: { tool: "diff_lines", values: { a: TOO_LONG } },
  },
  "local-emoji-strip": {
    tools: { strip_emoji: { expected: ["hello  world"] } },
    invalid: { tool: "strip_emoji", values: { text: TOO_LONG } },
  },
  "local-hash-lab": {
    tools: { digest: { expected: ["2cf24dba5fb0a30e", /"algorithm":\s*"sha256"/] } },
    invalid: { tool: "digest", values: { text: TOO_LONG } },
  },
  "local-html-escape": {
    tools: {
      escape_html: { expected: ["&lt;b&gt;hi&lt;/b&gt;"] },
      unescape_html: { expected: ["<b>hi</b>"] },
    },
    invalid: { tool: "escape_html", values: { text: TOO_LONG } },
  },
  "local-ipv4-check": {
    tools: { check_ipv4: { expected: ["private", /"address":\s*"192\.168\.1\.1"/] } },
    invalid: { tool: "check_ipv4", values: { address: "999.1.1.1" } },
  },
  "local-json-lab": {
    tools: {
      format_json: { expected: ["hello", "world"] },
      minify_json: { expected: ["{\"a\":1}", /"bytes":\s*7/] },
      validate_json: { expected: [/"valid":\s*true/] },
    },
    invalid: { tool: "format_json", values: { text: "{not-json" } },
  },
  "local-json-path": {
    tools: { get_path: { expected: ["Ada", /"path":\s*"user\.name"/] } },
    invalid: { tool: "get_path", values: { text: "{" } },
  },
  "local-jwt-inspect": {
    tools: { decode_jwt: { expected: ["Agent-OPT", /"verified":\s*false/, "签名未验证"] } },
    invalid: { tool: "decode_jwt", values: { token: "not.jwt" } },
  },
  "local-line-tools": {
    tools: { process_lines: { expected: [/"lineCount":\s*3/, /"mode":\s*"sort-unique"/] } },
    invalid: { tool: "process_lines", values: { text: TOO_LONG } },
  },
  "local-lorem": {
    tools: { generate_lorem: { expected: ["elit do ut lorem", /"paragraphs":\s*2/] } },
    invalid: { tool: "generate_lorem", values: { paragraphs: "0" } },
  },
  "local-markdown-stats": {
    tools: { analyze_markdown: { expected: [/"headings":\s*1/, /"links":\s*1/, /"codeFenceMarkers":\s*2/] } },
    invalid: { tool: "analyze_markdown", values: { text: TOO_LONG } },
  },
  "local-markdown-toc": {
    tools: { build_toc: { expected: ["- A", /"count":\s*3/] } },
    invalid: { tool: "build_toc", values: { text: TOO_LONG } },
  },
  "local-math-eval": {
    tools: { evaluate: { expected: ["2.25", /"expression":\s*"\(1\+2\)\*3\/4"/] } },
    invalid: { tool: "evaluate", values: { expression: "process.exit(1)" } },
  },
  "local-mime-guess": {
    tools: { guess_mime: { expected: ["application/pdf", /"extension":\s*"pdf"/] } },
    invalid: { tool: "guess_mime", values: { name: "" } },
  },
  "local-number-base": {
    tools: { convert_base: { expected: [/"value":\s*"ff"/, /"decimal":\s*255/] } },
    invalid: { tool: "convert_base", values: { value: "zz" } },
  },
  "local-password-strength": {
    tools: { score_password: { expected: ["medium", /"score":\s*4/, /"hasSymbol":\s*true/] } },
    invalid: { tool: "score_password", values: { password: "" } },
  },
  "local-path-posix": {
    tools: { join_posix: { expected: ["var/runtime/files"] } },
    invalid: { tool: "join_posix", values: { parts: "..\nb" } },
  },
  "local-percent-codec": {
    tools: {
      encode: { expected: ["a%20b%2F%E4%B8%AD%E6%96%87"] },
      decode: { expected: ["a b"] },
    },
    invalid: { tool: "decode", values: { text: "%E0%A4%A" } },
  },
  "local-querystring": {
    tools: {
      parse_query: { expected: [/"a":\s*"1"/, /"b":\s*"hello"/] },
      stringify_query: { expected: ["a=1&b=hello"] },
    },
    invalid: { tool: "stringify_query", values: { json: "[" } },
  },
  "local-random-lab": {
    tools: {
      random_int: { values: { min: "7", max: "7" }, expected: [/"value":\s*7/, /"min":\s*7/, /"max":\s*7/] },
      pick_one: { values: { items: "only-choice" }, expected: ["only-choice", /"count":\s*1/] },
    },
    invalid: { tool: "random_int", values: { min: "10", max: "1" } },
  },
  "local-regex-lab": {
    tools: { test_regex: { expected: [/"matchCount":\s*4/, /"match":\s*"hello"/] } },
    invalid: { tool: "test_regex", values: { pattern: "(" } },
  },
  "local-relative-time": {
    tools: { from_now: { expected: ["ago", /"epochMs":\s*1577836800000/] } },
    invalid: { tool: "from_now", values: { value: "not-a-date" } },
  },
  "local-roman": {
    tools: { to_roman: { expected: ["MMXXVI", /"value":\s*2026/] } },
    invalid: { tool: "to_roman", values: { value: "0" } },
  },
  "local-semver-lab": {
    tools: { compare_semver: { expected: [/"relation":\s*"lt"/, /"minor":\s*10/] } },
    invalid: { tool: "compare_semver", values: { a: "1", b: "2" } },
  },
  "local-slugify": {
    tools: { slugify: { expected: ["hello-agent-opt"] } },
    invalid: { tool: "slugify", values: { text: "!!!" } },
  },
  "local-table-md": {
    tools: { rows_to_table: { expected: ["| Ada | 99 |", /"rowCount":\s*2/] } },
    invalid: { tool: "rows_to_table", values: { json: "[]" } },
  },
  "local-template-fill": {
    tools: { fill_template: { expected: ["Hello Ada, score=99"] } },
    invalid: { tool: "fill_template", values: { json: "[" } },
  },
  "local-text-case": {
    tools: { convert_case: { expected: ["hello_agent_opt", /"style":\s*"snake"/] } },
    invalid: { tool: "convert_case", values: { text: TOO_LONG } },
  },
  "local-timestamp-lab": {
    tools: {
      now: { expected: [/"iso":\s*"\d{4}-\d{2}-\d{2}T/, /"epochMs":\s*\d{13}/] },
      from_epoch: { expected: ["2023-11-14T22:13:20.000Z", /"epochMs":\s*1700000000000/] },
      to_epoch: { expected: ["1704067200000", "2024-01-01T00:00:00.000Z"] },
    },
    invalid: { tool: "to_epoch", values: { value: "not-a-date" } },
  },
  "local-unit-convert": {
    tools: { convert_unit: { expected: [/"value":\s*212/, /"from":\s*"c"/, /"to":\s*"f"/] } },
    invalid: { tool: "convert_unit", values: { from: "c", to: "m" } },
  },
  "local-url-lab": {
    tools: { parse_url: { expected: ["example.com", /"protocol":\s*"https:"/, /"pathname":\s*"\/path"/] } },
    invalid: { tool: "parse_url", values: { url: "not-a-url" } },
  },
  "local-uuid-factory": {
    tools: { generate_uuid: { expected: [/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i, /"count":\s*3/] } },
    invalid: { tool: "generate_uuid", values: { count: "0" } },
  },
  "local-whitespace": {
    tools: { normalize_whitespace: { expected: ["a b", /"mode":\s*"both"/] } },
    invalid: { tool: "normalize_whitespace", values: { text: TOO_LONG } },
  },
  "local-word-count": {
    tools: { count_text: { expected: [/"words":\s*3/, /"characters":\s*13/] } },
    invalid: { tool: "count_text", values: { text: TOO_LONG } },
  },
  "local-yaml-lab": {
    tools: { yaml_to_json: { expected: [/"hello":\s*"world"/, /"count":\s*2/] } },
    invalid: { tool: "yaml_to_json", values: { text: "a: [" } },
  },
};

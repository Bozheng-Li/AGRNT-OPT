import { describe, expect, test } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";

async function invoke(tool: string, args: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/plugins/design-constraint-studio/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, arguments: args }),
    }),
    { params: Promise.resolve({ slug: "design-constraint-studio" }) },
  );
}

const tokens = {
  color: {
    text: { $value: "#777777" },
    surface: { $value: "#ffffff" },
  },
};
const constraints = {
  enableBuiltInWcagDefaults: false,
  enableBuiltInThreshold: false,
  wcag: [{ foreground: "color.text", background: "color.surface", ratio: 4.5 }],
};

describe("Design Constraint public API", () => {
  test("runs the upstream validator and rejects filesystem-shaped input", async () => {
    const response = await invoke("validate", { tokens, constraints });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plugin).toBe("io.github.cseperkepapp/design-constraint-validator");
    expect(payload.result.isError).toBe(false);
    expect(payload.result.structuredContent.ok).toBe(false);
    expect(JSON.stringify(payload.result.structuredContent.violations)).toMatch(/wcag|contrast/i);

    const unsafe = await invoke("validate", { tokensPath: "C:/host/tokens.json", constraints });
    expect(unsafe.status).toBe(400);
    expect((await unsafe.json()).error).toMatch(/参数|unrecognized/i);
  }, 60_000);
});

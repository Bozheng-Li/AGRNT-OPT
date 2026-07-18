import { describe, expect, test } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";

async function invoke(tool: string, args: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/plugins/bouncer-compliance-studio/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "tool", tool, arguments: args }),
    }),
    { params: Promise.resolve({ slug: "bouncer-compliance-studio" }) },
  );
}

const incompleteProject = [
  {
    path: "app/signup/page.tsx",
    content: "export function Signup(){return <input type=\"checkbox\" aria-label=\"I am over 18\" />}",
  },
];

describe("Bouncer public API", () => {
  test("calls all real tools through the public route and rejects host-config semantics", async () => {
    const packs = await invoke("list_packs", {});
    expect(packs.status).toBe(200);
    const packPayload = await packs.json();
    expect(packPayload.plugin).toBe("io.github.nugehs/bouncer");
    expect(packPayload.result.structuredContent.packs).toHaveLength(5);

    const rules = await invoke("list_rules", { adapter: "next", packs: ["uk-osa", "uk-aadc"] });
    expect(rules.status).toBe(200);
    expect((await rules.json()).result.structuredContent.rules).toHaveLength(14);

    const explanation = await invoke("explain_rule", {
      adapter: "next",
      packs: ["uk-aadc"],
      ruleId: "aadc.geolocation-default-off",
    });
    expect(explanation.status).toBe(200);
    expect((await explanation.json()).result.structuredContent).toMatchObject({
      id: "aadc.geolocation-default-off",
      packId: "uk-aadc",
    });

    const check = await invoke("compliance_check", {
      adapter: "next",
      packs: ["uk-aadc"],
      status: "all",
      files: incompleteProject,
    });
    expect(check.status).toBe(200);
    const checkPayload = await check.json();
    expect(checkPayload.result.isError).toBe(false);
    expect(checkPayload.result.structuredContent.meta.repo).toBe("inline://project");
    expect(checkPayload.result.structuredContent.totals.fail).toBeGreaterThan(0);
    expect(checkPayload.result.structuredContent.totals.unknown).toBeGreaterThan(0);

    const unsafe = await invoke("compliance_check", {
      config: "C:/host/bouncer.config.json",
      adapter: "next",
      packs: ["uk-aadc"],
      status: "all",
      files: incompleteProject,
    });
    expect(unsafe.status).toBe(400);
    expect((await unsafe.json()).error).toMatch(/config|参数|Unrecognized|unrecognized/i);
  }, 120_000);
});

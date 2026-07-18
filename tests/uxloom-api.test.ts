import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";

async function invoke(tool: string, args: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/plugins/uxloom-journey-studio/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "tool", tool, arguments: args }),
    }),
    { params: Promise.resolve({ slug: "uxloom-journey-studio" }) },
  );
}

const journey = {
  id: "checkout",
  goal: "Place an order",
  entry: "cart",
  states: {
    cart: { screen: "cart", on: { CONTINUE: "payment" } },
    payment: { screen: "payment", on: { SUCCESS: "done", FAILURE: "payment#error" } },
    done: { screen: "confirmation", final: true },
  },
};

const screen = {
  id: "payment",
  intent: "Collect payment",
  requiredStates: ["default", "loading", "error", "success"],
  designedStates: ["default"],
  platforms: ["web", "mweb"],
  components: [{
    id: "pay",
    semantic: "Button.Primary",
    interactive: true,
    minTargetPx: 32,
    label: { key: "checkout.pay", en: "Pay now", maxChars: 12 },
    fg: "#777777",
    bg: "#ffffff",
  }],
};

describe("UXLoom public API", () => {
  test("runs all eight real tools through the public route and isolates path semantics", async () => {
    const sessionId = randomUUID();
    const initialized = await invoke("project_init", { sessionId, name: "Checkout API", platforms: ["web", "mweb"] });
    expect(initialized.status).toBe(200);
    const initializedJson = await initialized.json();
    expect(initializedJson.plugin).toBe("io.github.uxloom-dev/uxloom");
    expect(initializedJson.result.structuredContent).toMatchObject({
      ok: true,
      path: "session://project",
      project: { name: "Checkout API", journeys: [], screens: [] },
    });

    const questions = await invoke("brief_start", { sessionId, prompt: "Design a resilient checkout." });
    expect(questions.status).toBe(200);
    expect((await questions.json()).result.structuredContent.inputRequests).toHaveLength(5);

    const brief = await invoke("brief_answer", {
      sessionId,
      prompt: "Design a resilient checkout.",
      answers: { platforms: ["web", "mweb"], journeys: ["checkout - complete an order"], offline: true },
    });
    expect(brief.status).toBe(200);
    expect((await brief.json()).result.structuredContent.brief.assumptionLedger.length).toBeGreaterThan(0);

    const journeyResponse = await invoke("journey_define", { sessionId, journey });
    expect(journeyResponse.status).toBe(200);
    expect((await journeyResponse.json()).result.structuredContent.journeys).toEqual(["checkout"]);

    const screenResponse = await invoke("screen_register", { sessionId, screen });
    expect(screenResponse.status).toBe(200);
    expect((await screenResponse.json()).result.structuredContent.screens).toEqual(["payment"]);

    const validation = await invoke("project_validate", { sessionId });
    expect(validation.status).toBe(200);
    const validationJson = await validation.json();
    expect(validationJson.result.structuredContent.summary.errors).toBeGreaterThan(0);
    expect(JSON.stringify(validationJson)).toContain("contrast-below-aa");

    const scoped = await invoke("screen_critique", { sessionId, screenId: "payment" });
    expect(scoped.status).toBe(200);
    expect((await scoped.json()).result.structuredContent.findings.length).toBeGreaterThan(0);

    const coverage = await invoke("coverage_report", { sessionId });
    expect(coverage.status).toBe(200);
    expect((await coverage.json()).result.structuredContent).toMatchObject({
      perScreen: [{ screen: "payment", required: 4, designed: 1, missing: ["loading", "error", "success"] }],
    });

    const unsafe = await invoke("project_init", {
      sessionId,
      name: "unsafe",
      platforms: ["web"],
      UXLOOM_PROJECT: "C:/host/uxloom.project.json",
    });
    expect(unsafe.status).toBe(400);
    expect((await unsafe.json()).error).toMatch(/UXLOOM_PROJECT|参数|Unrecognized|unrecognized/i);

    const traversal = await invoke("screen_critique", { sessionId, screenId: "../host" });
    expect(traversal.status).toBe(400);
    expect((await traversal.json()).error).toMatch(/screenId|标识/);
  }, 120_000);
});

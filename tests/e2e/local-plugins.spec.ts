import { expect, test, type Page, type Response } from "@playwright/test";
import { getLocalMcpUi } from "../../src/lib/catalog/local-mcp-ui";
import { listLocalMcpSlugs, localMcpCatalog } from "../../src/lib/runtime/local-mcp-tools";
import { localPluginCases } from "./fixtures/local-plugin-cases";

type UiTool = NonNullable<ReturnType<typeof getLocalMcpUi>>["tools"][number];

const runtimeSlugs = listLocalMcpSlugs();

function invokeResponseMatches(response: Response, slug: string, tool: string): boolean {
  const request = response.request();
  if (request.method() !== "POST") return false;
  if (new URL(response.url()).pathname !== `/api/plugins/${slug}/invoke`) return false;
  try {
    return (request.postDataJSON() as { tool?: unknown }).tool === tool;
  } catch {
    return false;
  }
}

async function setToolFields(page: Page, tool: UiTool, values: Record<string, string> = {}) {
  for (const field of tool.fields) {
    const value = values[field.key] ?? field.defaultValue ?? "";
    const input = page.getByTestId(`local-field-${field.key}`);
    await expect(input).toBeVisible();
    if (field.kind === "select") {
      await input.selectOption(value);
      await expect(input).toHaveValue(value);
    } else {
      await input.fill(value);
      await expect(input).toHaveValue(value);
    }
  }
}

async function invokeFromPage(page: Page, slug: string, tool: string) {
  const responsePromise = page.waitForResponse((response) => invokeResponseMatches(response, slug, tool));
  await page.getByTestId("local-mcp-run").click();
  return responsePromise;
}

function expectSemanticValue(actual: string, expected: string | RegExp) {
  if (typeof expected === "string") expect(actual).toContain(expected);
  else expect(actual).toMatch(expected);
}

function flattenSemanticValues(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(flattenSemanticValues).join("\n");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, entry]) => `${key}\n${flattenSemanticValues(entry)}`)
      .join("\n");
  }
  return "";
}

test.describe("first-party local plugin browser coverage", () => {
  test("@web-e2e [local-registry] fixtures exactly cover every production UI slug and tool", () => {
    const fixtureSlugs = Object.keys(localPluginCases).sort();
    expect(runtimeSlugs).toHaveLength(42);
    expect(fixtureSlugs).toEqual(runtimeSlugs);

    let uiToolCount = 0;
    for (const slug of runtimeSlugs) {
      const ui = getLocalMcpUi(slug);
      expect(ui, `${slug} must have a production LocalMcpWorkspace configuration`).toBeTruthy();
      const uiTools = ui!.tools.map((tool) => tool.name).sort();
      const runtimeTools = localMcpCatalog[slug]!.tools.map((tool) => tool.name).sort();
      const fixtureTools = Object.keys(localPluginCases[slug]!.tools).sort();
      expect(uiTools, `${slug} UI/runtime tool drift`).toEqual(runtimeTools);
      expect(fixtureTools, `${slug} lacks a browser fixture for an exposed tool`).toEqual(uiTools);

      const invalid = localPluginCases[slug]!.invalid;
      expect(uiTools, `${slug} invalid fixture must target an exposed tool`).toContain(invalid.tool);
      const invalidUi = ui!.tools.find((tool) => tool.name === invalid.tool)!;
      const invalidFields = invalidUi.fields.map((field) => field.key);
      for (const key of Object.keys(invalid.values)) {
        expect(invalidFields, `${slug} invalid fixture references unknown field ${key}`).toContain(key);
      }
      uiToolCount += uiTools.length;
    }
    expect(uiToolCount).toBe(51);
  });

  for (const slug of runtimeSlugs) {
    const ui = getLocalMcpUi(slug)!;
    const browserCase = localPluginCases[slug]!;

    test(`@web-e2e [${slug}] runs every UI tool and renders a controlled failure`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto(`/plugins/${slug}`);
      await expect(page.getByText(ui.title, { exact: true }).first()).toBeVisible();

      const toolSelect = page.getByTestId("local-mcp-tool");
      await expect(toolSelect).toBeVisible();
      const optionValues = await toolSelect.locator("option").evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value).sort(),
      );
      expect(optionValues).toEqual(ui.tools.map((tool) => tool.name).sort());

      for (const tool of ui.tools) {
        await test.step(`${tool.name}: browser form -> HTTP API -> rendered semantic result`, async () => {
          await toolSelect.selectOption(tool.name);
          await expect(toolSelect).toHaveValue(tool.name);
          await setToolFields(page, tool, browserCase.tools[tool.name]!.values);

          const response = await invokeFromPage(page, slug, tool.name);
          expect(response.status()).toBe(200);
          const payload = (await response.json()) as {
            plugin: string;
            tool: string;
            result: { isError: boolean; content: unknown[]; structuredContent?: Record<string, unknown> };
          };
          expect(payload.plugin).toBe(localMcpCatalog[slug]!.id);
          expect(payload.tool).toBe(tool.name);
          expect(payload.result.isError).toBe(false);
          expect(Array.isArray(payload.result.content)).toBe(true);
          expect(payload.result.content.length).toBeGreaterThan(0);

          const semanticValue = payload.result.structuredContent ?? payload.result.content;
          const semanticResult = `${JSON.stringify(semanticValue)}\n${flattenSemanticValues(semanticValue)}`;
          expect(semanticResult.length).toBeGreaterThan(2);
          const output = page.getByTestId("result-output");
          await expect(output).toBeVisible();
          for (const expected of browserCase.tools[tool.name]!.expected) {
            expectSemanticValue(semanticResult, expected);
            await expect(output).toContainText(expected);
          }
          await expect(page.getByTestId("invoke-error")).toHaveCount(0);
        });
      }

      await test.step(`${browserCase.invalid.tool}: browser renders adapter validation failure`, async () => {
        const invalidUi = ui.tools.find((tool) => tool.name === browserCase.invalid.tool)!;
        await toolSelect.selectOption(invalidUi.name);
        await expect(toolSelect).toHaveValue(invalidUi.name);
        await setToolFields(page, invalidUi, browserCase.invalid.values);

        const response = await invokeFromPage(page, slug, invalidUi.name);
        expect(response.status()).toBe(400);
        const payload = (await response.json()) as { error?: unknown };
        expect(typeof payload.error).toBe("string");
        expect(String(payload.error).trim().length).toBeGreaterThan(0);
        const error = page.getByTestId("invoke-error");
        await expect(error).toBeVisible();
        await expect(error).not.toHaveText("");
      });
    });
  }
});

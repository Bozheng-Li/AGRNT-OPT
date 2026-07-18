import { NextResponse } from "next/server";
import { z } from "zod";
import { findPublicPlugin } from "@/lib/catalog";
import { InvocationValidationError } from "@/lib/runtime/errors";
import {
  getPluginPrompt,
  invokePluginTool,
  listPluginProtocolAssets,
  readPluginResource,
} from "@/lib/runtime/invoke";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("tool"),
    tool: z.string().min(1).max(100),
    arguments: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({ operation: z.literal("capabilities") }),
  z.object({ operation: z.literal("resource"), uri: z.string().min(1).max(200) }),
  z.object({
    operation: z.literal("prompt"),
    prompt: z.string().min(1).max(100),
    arguments: z.record(z.string(), z.unknown()).default({}),
  }),
]);

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const plugin = findPublicPlugin(slug);
  if (!plugin) return NextResponse.json({ error: "插件不存在或尚未达到公开质量门槛。" }, { status: 404 });

  try {
    const raw = await request.json();
    if (JSON.stringify(raw).length > 300_000) {
      return NextResponse.json({ error: "请求内容过大。" }, { status: 413 });
    }
    const payload = requestSchema.parse({
      ...(typeof raw === "object" && raw !== null ? raw : {}),
      operation: typeof raw === "object" && raw !== null && "operation" in raw ? raw.operation : "tool",
    });
    if (payload.operation === "tool") {
      const result = await invokePluginTool(slug, payload.tool, payload.arguments);
      return NextResponse.json({ plugin: plugin.id, operation: payload.operation, tool: payload.tool, result });
    }
    if (payload.operation === "capabilities") {
      const result = await listPluginProtocolAssets(slug);
      return NextResponse.json({ plugin: plugin.id, operation: payload.operation, result });
    }
    if (payload.operation === "resource") {
      const result = await readPluginResource(slug, payload.uri);
      return NextResponse.json({ plugin: plugin.id, operation: payload.operation, uri: payload.uri, result });
    }
    const result = await getPluginPrompt(slug, payload.prompt, payload.arguments);
    return NextResponse.json({ plugin: plugin.id, operation: payload.operation, prompt: payload.prompt, result });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof InvocationValidationError) {
      return NextResponse.json(
        { error: error instanceof InvocationValidationError ? error.message : "请求参数格式无效。" },
        { status: 400 },
      );
    }
    console.error(error);
    return NextResponse.json({ error: "插件运行失败，请检查参数或稍后重试。" }, { status: 500 });
  }
}

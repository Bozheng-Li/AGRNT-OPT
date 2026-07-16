import { NextResponse } from "next/server";
import { z } from "zod";
import { findPublicPlugin } from "@/lib/catalog";
import { InvocationValidationError } from "@/lib/runtime/errors";
import { invokePluginTool } from "@/lib/runtime/invoke";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  tool: z.string().min(1).max(100),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const plugin = findPublicPlugin(slug);
  if (!plugin) return NextResponse.json({ error: "插件不存在或尚未达到公开质量门槛。" }, { status: 404 });

  try {
    const raw = await request.json();
    if (JSON.stringify(raw).length > 300_000) {
      return NextResponse.json({ error: "请求内容过大。" }, { status: 413 });
    }
    const payload = requestSchema.parse(raw);
    const result = await invokePluginTool(slug, payload.tool, payload.arguments);
    return NextResponse.json({ plugin: plugin.id, tool: payload.tool, result });
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


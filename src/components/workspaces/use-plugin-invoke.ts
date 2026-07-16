"use client";

import { useCallback, useState } from "react";

export type InvocationResult = {
  content: unknown[];
  structuredContent?: Record<string, unknown>;
  isError: boolean;
};

export type ActivityItem = {
  tool: string;
  at: string;
  ok: boolean;
};

export function usePluginInvoke(slug: string) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<InvocationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const invoke = useCallback(async (tool: string, args: Record<string, unknown>) => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/plugins/${slug}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, arguments: args }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "插件调用失败。");
      const nextResult = payload.result as InvocationResult;
      setResult(nextResult);
      setActivity((items) => [{ tool, at: new Date().toLocaleTimeString("zh-CN"), ok: !nextResult.isError }, ...items].slice(0, 8));
      if (nextResult.isError) setError("上游工具返回了错误结果，请检查输入。");
      return nextResult;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "插件调用失败。";
      setError(message);
      setActivity((items) => [{ tool, at: new Date().toLocaleTimeString("zh-CN"), ok: false }, ...items].slice(0, 8));
      throw caught;
    } finally {
      setPending(false);
    }
  }, [slug]);

  return { pending, result, error, activity, invoke, setResult };
}

export function resultText(result: InvocationResult | null): string {
  if (!result) return "";
  const blocks = result.content.map((block) => {
    if (typeof block === "string") return block;
    if (block && typeof block === "object" && "text" in block && typeof block.text === "string") return block.text;
    return JSON.stringify(block, null, 2);
  });
  if (result.structuredContent) blocks.push(JSON.stringify(result.structuredContent, null, 2));
  return blocks.filter(Boolean).join("\n\n");
}

export function resultJson(result: InvocationResult | null): Record<string, unknown> | null {
  if (!result) return null;
  if (result.structuredContent) return result.structuredContent;
  const text = resultText(result).trim();
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}


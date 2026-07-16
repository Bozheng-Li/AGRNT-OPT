import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getPluginAdapter, type AdapterContext, type AdapterToolResult, type PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

export type NormalizedToolResult = {
  content: unknown[];
  structuredContent?: Record<string, unknown>;
  isError: boolean;
};

type PersistentEntry = {
  client: Client;
  transport: StdioClientTransport;
  tools: Set<string>;
  queue: Promise<void>;
  idleTimer?: ReturnType<typeof setTimeout>;
};

const persistentEntries = new Map<string, Promise<PersistentEntry>>();

function callToolOptions(adapter: PluginAdapter, tool: string) {
  const timeout = adapter.requestTimeoutMs?.(tool);
  return timeout ? { timeout, maxTotalTimeout: timeout } : undefined;
}

function createTransport(launch: Awaited<ReturnType<PluginAdapter["prepare"]>>) {
  return new StdioClientTransport({
    ...launch,
    env: { ...getDefaultEnvironment(), ...launch.env },
    stderr: "pipe",
  });
}

async function normalizeResult(
  adapter: PluginAdapter,
  tool: string,
  result: AdapterToolResult,
  context: AdapterContext,
): Promise<NormalizedToolResult> {
  const normalized = adapter.normalizeResult
    ? await adapter.normalizeResult(tool, result, context)
    : result;
  return {
    content: normalized.content,
    structuredContent: normalized.structuredContent,
    isError: normalized.isError,
  };
}

async function createPersistentEntry(adapter: PluginAdapter, context: AdapterContext): Promise<PersistentEntry> {
  const launch = await adapter.prepare(context);
  const transport = createTransport(launch);
  const client = new Client({ name: "agent-opt", version: "0.1.0" }, { capabilities: {} });
  try {
    await client.connect(transport);
    const available = await client.listTools();
    return {
      client,
      transport,
      tools: new Set(available.tools.map((tool) => tool.name)),
      queue: Promise.resolve(),
    };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

async function closePersistentKey(key: string): Promise<void> {
  const pending = persistentEntries.get(key);
  if (!pending) return;
  persistentEntries.delete(key);
  try {
    const entry = await pending;
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    await entry.queue.catch(() => undefined);
    await entry.client.close().catch(() => undefined);
  } catch {
    // A failed connection has already cleaned up its transport.
  }
}

function persistentKey(adapter: PluginAdapter, context: AdapterContext): string {
  const session = adapter.persistentSession;
  if (!session) throw new Error("persistentKey called for an ephemeral adapter");
  return `${adapter.slug}:${session.key(context)}`;
}

async function invokePersistent(
  adapter: PluginAdapter,
  tool: string,
  transformedInput: Record<string, unknown>,
  context: AdapterContext,
): Promise<NormalizedToolResult> {
  const key = persistentKey(adapter, context);
  let pending = persistentEntries.get(key);
  if (!pending) {
    pending = createPersistentEntry(adapter, context).catch((error) => {
      persistentEntries.delete(key);
      throw error;
    });
    persistentEntries.set(key, pending);
  }
  const entry = await pending;
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = undefined;
  }

  const invocation = entry.queue.then(async () => {
    if (!entry.tools.has(tool)) {
      throw new Error(`上游 ${adapter.slug} ${tool} 工具在当前版本中不存在。`);
    }
    const result = await entry.client.callTool(
      { name: tool, arguments: transformedInput },
      undefined,
      callToolOptions(adapter, tool),
    );
    return normalizeResult(
      adapter,
      tool,
      {
        content: Array.isArray(result.content) ? result.content : [],
        structuredContent: result.structuredContent as Record<string, unknown> | undefined,
        isError: result.isError === true,
      },
      context,
    );
  });
  entry.queue = invocation.then(() => undefined, () => undefined);

  try {
    return await invocation;
  } catch (error) {
    await closePersistentKey(key);
    throw error;
  } finally {
    if (persistentEntries.has(key)) {
      entry.idleTimer = setTimeout(() => {
        void closePersistentKey(key);
      }, adapter.persistentSession!.idleMs);
      entry.idleTimer.unref?.();
    }
  }
}

export async function closePluginSessions(slug?: string): Promise<void> {
  const keys = [...persistentEntries.keys()].filter((key) => !slug || key.startsWith(`${slug}:`));
  await Promise.all(keys.map((key) => closePersistentKey(key)));
}

export async function listPluginTools(slug: string, context: AdapterContext = {}) {
  const adapter = getPluginAdapter(slug);
  if (!adapter) throw new InvocationValidationError(`不存在运行适配器：${slug}`);
  const launch = await adapter.prepare(context);
  const transport = createTransport(launch);
  const client = new Client({ name: "agent-opt", version: "0.1.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    const response = await client.listTools();
    return response.tools.filter((tool) => adapter.allowedTools.includes(tool.name));
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function invokePluginTool(
  slug: string,
  tool: string,
  input: unknown,
  context: AdapterContext = {},
): Promise<NormalizedToolResult> {
  const adapter = getPluginAdapter(slug);
  if (!adapter) throw new InvocationValidationError(`不存在运行适配器：${slug}`);
  if (!adapter.allowedTools.includes(tool)) throw new InvocationValidationError(`Web 适配未开放工具：${tool}`);

  const transformedInput = await adapter.validateAndTransform(tool, input, context);
  if (adapter.persistentSession) {
    return invokePersistent(adapter, tool, transformedInput, context);
  }
  const launch = await adapter.prepare(context);
  const transport = createTransport(launch);
  const client = new Client({ name: "agent-opt", version: "0.1.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    const availableTools = await client.listTools();
    if (!availableTools.tools.some((candidate) => candidate.name === tool)) {
      throw new Error(`上游 ${slug} ${tool} 工具在当前版本中不存在。`);
    }
    const result = await client.callTool(
      { name: tool, arguments: transformedInput },
      undefined,
      callToolOptions(adapter, tool),
    );
    return normalizeResult(
      adapter,
      tool,
      {
        content: Array.isArray(result.content) ? result.content : [],
        structuredContent: result.structuredContent as Record<string, unknown> | undefined,
        isError: result.isError === true,
      },
      context,
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}

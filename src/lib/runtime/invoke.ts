import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getPluginAdapter, type AdapterContext, type AdapterToolResult, type PluginAdapter } from "./adapters";
import { InvocationValidationError } from "./errors";

export type NormalizedToolResult = {
  content: unknown[];
  structuredContent?: Record<string, unknown>;
  isError: boolean;
};

export type PluginProtocolAssets = {
  resources: Array<{ name: string; title?: string; uri: string; mimeType?: string; description?: string }>;
  resourceTemplates: Array<{ name: string; uriTemplate: string; mimeType?: string; description?: string }>;
  prompts: Array<{
    name: string;
    title?: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  }>;
};

export type NormalizedResourceResult = {
  contents: Array<{ uri: string; mimeType?: string; text: string }>;
};

export type NormalizedPromptResult = {
  description?: string;
  messages: Array<{ role: "user" | "assistant"; content: { type: "text"; text: string } }>;
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
    return await normalizeResult(
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
  if (adapter.mode === "in-process") {
    return adapter.allowedTools.map((name) => ({ name }));
  }
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

function requireStdioProtocolAdapter(slug: string): PluginAdapter {
  const adapter = getPluginAdapter(slug);
  if (!adapter) throw new InvocationValidationError(`不存在运行适配器：${slug}`);
  if (adapter.mode === "in-process") {
    throw new InvocationValidationError(`插件 ${slug} 不提供上游 MCP 资源或提示协议。`);
  }
  return adapter;
}

async function withEphemeralClient<T>(
  adapter: PluginAdapter,
  context: AdapterContext,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const launch = await adapter.prepare(context);
  const transport = createTransport(launch);
  const client = new Client({ name: "agent-opt", version: "0.1.0" }, { capabilities: {} });
  try {
    await client.connect(transport);
    return await callback(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function compileResourceTemplate(uriTemplate: string): RegExp {
  const pattern = uriTemplate
    .split(/\{[^}]+\}/g)
    .map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]+");
  return new RegExp(`^${pattern}$`, "i");
}

export async function listPluginProtocolAssets(
  slug: string,
  context: AdapterContext = {},
): Promise<PluginProtocolAssets> {
  const adapter = requireStdioProtocolAdapter(slug);
  if (!adapter.allowedResourceTemplates?.length && !adapter.allowedPrompts?.length) {
    throw new InvocationValidationError(`Web 适配未开放 ${slug} 的 MCP 资源或提示。`);
  }
  const result = await withEphemeralClient(adapter, context, async (client) => {
    const [listedResources, listedTemplates, listedPrompts] = await Promise.all([
      adapter.allowedResourceTemplates?.length ? client.listResources() : Promise.resolve({ resources: [] }),
      adapter.allowedResourceTemplates?.length ? client.listResourceTemplates() : Promise.resolve({ resourceTemplates: [] }),
      adapter.allowedPrompts?.length ? client.listPrompts() : Promise.resolve({ prompts: [] }),
    ]);
    const resources: PluginProtocolAssets["resources"] = [];
    for (const resource of listedResources.resources) {
      try {
        if (adapter.validateResourceUri) await adapter.validateResourceUri(resource.uri, context);
        resources.push({
          name: resource.name,
          ...(resource.title ? { title: resource.title } : {}),
          uri: resource.uri,
          ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
          ...(resource.description ? { description: resource.description } : {}),
        });
      } catch (error) {
        if (!(error instanceof InvocationValidationError)) throw error;
      }
    }
    const resourceTemplates = listedTemplates.resourceTemplates
      .filter((template) => adapter.allowedResourceTemplates?.includes(template.name))
      .map((template) => ({
        name: template.name,
        uriTemplate: template.uriTemplate,
        ...(template.mimeType ? { mimeType: template.mimeType } : {}),
        ...(template.description ? { description: template.description } : {}),
      }));
    const prompts = listedPrompts.prompts
      .filter((prompt) => adapter.allowedPrompts?.includes(prompt.name))
      .map((prompt) => ({
        name: prompt.name,
        ...(prompt.title ? { title: prompt.title } : {}),
        ...(prompt.description ? { description: prompt.description } : {}),
        ...(prompt.arguments ? { arguments: prompt.arguments } : {}),
      }));
    return { resources, resourceTemplates, prompts };
  });
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 500_000) {
    throw new InvocationValidationError("MCP 资源索引超过 500 KiB 安全上限。");
  }
  return result;
}

export async function readPluginResource(
  slug: string,
  uri: unknown,
  context: AdapterContext = {},
): Promise<NormalizedResourceResult> {
  const adapter = requireStdioProtocolAdapter(slug);
  if (!adapter.allowedResourceTemplates?.length || !adapter.validateResourceUri) {
    throw new InvocationValidationError(`Web 适配未开放 ${slug} 的 MCP 资源读取。`);
  }
  const safeUri = await adapter.validateResourceUri(uri, context);
  const result = await withEphemeralClient(adapter, context, async (client) => {
    const listed = await client.listResources();
    const listedMatch = listed.resources.some((resource) => resource.uri === safeUri);
    if (!listedMatch) {
      if (adapter.requireListedResource) {
        throw new InvocationValidationError("请求的资源不在上游当前资源索引或已开放模板中。");
      }
      // Template-only servers (e.g. Open Library) expose uriTemplate without a static resource index.
      const templates = await client.listResourceTemplates();
      const templateAllowed = templates.resourceTemplates.some((template) => {
        if (!adapter.allowedResourceTemplates?.includes(template.name)) return false;
        return compileResourceTemplate(template.uriTemplate).test(safeUri);
      });
      if (!templateAllowed) {
        throw new InvocationValidationError("请求的资源不在上游当前资源索引或已开放模板中。");
      }
    }
    const response = await client.readResource({ uri: safeUri });
    const contents = response.contents.flatMap((content) => {
      if (!("text" in content) || typeof content.text !== "string") return [];
      return [{
        uri: content.uri,
        ...(content.mimeType ? { mimeType: content.mimeType } : {}),
        text: content.text,
      }];
    });
    if (contents.length === 0) throw new InvocationValidationError("上游资源没有返回文本内容。");
    return { contents };
  });
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 500_000) {
    throw new InvocationValidationError("MCP 资源内容超过 500 KiB 安全上限。");
  }
  return result;
}

export async function getPluginPrompt(
  slug: string,
  prompt: string,
  input: unknown,
  context: AdapterContext = {},
): Promise<NormalizedPromptResult> {
  const adapter = requireStdioProtocolAdapter(slug);
  if (!adapter.allowedPrompts?.includes(prompt) || !adapter.validatePromptAndTransform) {
    throw new InvocationValidationError(`Web 适配未开放提示：${prompt}`);
  }
  const safeInput = await adapter.validatePromptAndTransform(prompt, input, context);
  const result = await withEphemeralClient(adapter, context, async (client) => {
    const listed = await client.listPrompts();
    if (!listed.prompts.some((candidate) => candidate.name === prompt)) {
      throw new InvocationValidationError(`上游 ${slug} ${prompt} 提示在当前版本中不存在。`);
    }
    const response = await client.getPrompt({ name: prompt, arguments: safeInput as Record<string, string> });
    const messages = response.messages.flatMap((message) => {
      if (
        (message.role !== "user" && message.role !== "assistant") ||
        message.content.type !== "text" ||
        typeof message.content.text !== "string"
      ) return [];
      return [{ role: message.role, content: { type: "text" as const, text: message.content.text } }];
    });
    if (messages.length === 0) throw new InvocationValidationError("上游提示没有返回文本消息。");
    return { ...(response.description ? { description: response.description } : {}), messages };
  });
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 100_000) {
    throw new InvocationValidationError("MCP 提示超过 100 KiB 安全上限。");
  }
  return result;
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

  if (adapter.mode === "in-process") {
    if (!adapter.invokeInProcess) {
      throw new InvocationValidationError(`进程内适配器缺少 invokeInProcess：${slug}`);
    }
    const result = await adapter.invokeInProcess(tool, transformedInput, context);
    return normalizeResult(adapter, tool, result, context);
  }

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
    return await normalizeResult(
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

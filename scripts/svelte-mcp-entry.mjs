import path from "node:path";
import { pathToFileURL } from "node:url";

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : input);
  const isSectionsIndex = url.pathname === "/docs/experimental/sections.json";
  const isDocumentation = url.pathname.startsWith("/docs/") && url.pathname.endsWith("/llms.txt");
  if (url.protocol !== "https:" || url.hostname !== "svelte.dev" || (!isSectionsIndex && !isDocumentation)) {
    throw new Error(`Svelte MCP network target is not allowed: ${url.origin}${url.pathname}`);
  }
  return originalFetch(input, { ...init, redirect: "error" });
};

const entryPoint = path.resolve(
  import.meta.dirname,
  "..",
  "node_modules",
  "@sveltejs",
  "mcp",
  "dist",
  "index.mjs",
);

await import(pathToFileURL(entryPoint).href);

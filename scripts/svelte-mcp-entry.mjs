import path from "node:path";
import { pathToFileURL } from "node:url";
import { createSvelteNetworkFetch } from "./svelte-network-policy.mjs";

const originalFetch = globalThis.fetch;
globalThis.fetch = createSvelteNetworkFetch(originalFetch);

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

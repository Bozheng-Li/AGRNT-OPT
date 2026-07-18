const SVELTE_ORIGIN = "https://svelte.dev";
const SECTIONS_INDEX_PATH = "/docs/experimental/sections.json";
const DOCUMENTATION_PATH_PATTERN = /^\/docs\/(?:[A-Za-z0-9$@._~!()+,;=:-]+\/)+llms\.txt$/;

function requestUrl(input) {
  if (typeof Request !== "undefined" && input instanceof Request) return new URL(input.url);
  return new URL(input instanceof URL ? input.href : input);
}

function rawRequestAddress(input) {
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return input instanceof URL ? input.href : String(input);
}

function requestMethod(input, init) {
  const inherited = typeof Request !== "undefined" && input instanceof Request ? input.method : "GET";
  return String(init?.method ?? inherited).toUpperCase();
}

export function assertSvelteNetworkRequest(input, init = {}) {
  const rawAddress = rawRequestAddress(input);
  const url = requestUrl(input);
  const isDocumentation = DOCUMENTATION_PATH_PATTERN.test(url.pathname);

  if (
    /%(?:2e|2f|5c)/i.test(rawAddress) ||
    /\/\.{1,2}(?:\/|$)/.test(rawAddress) ||
    url.origin !== SVELTE_ORIGIN ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.pathname !== SECTIONS_INDEX_PATH && !isDocumentation)
  ) {
    throw new Error(`Svelte MCP network target is not allowed: ${url.origin}${url.pathname}`);
  }

  if (requestMethod(input, init) !== "GET") {
    throw new Error("Svelte MCP documentation network access is GET-only.");
  }

  return url;
}

export function createSvelteNetworkFetch(fetchImplementation) {
  if (typeof fetchImplementation !== "function") {
    throw new TypeError("A fetch implementation is required.");
  }

  return async function fixedOriginSvelteFetch(input, init = {}) {
    assertSvelteNetworkRequest(input, init);
    const response = await fetchImplementation(input, { ...init, redirect: "error" });
    if (response?.redirected === true) {
      throw new Error("Svelte MCP documentation redirects are not allowed.");
    }
    return response;
  };
}

export const svelteNetworkPolicy = Object.freeze({
  origin: SVELTE_ORIGIN,
  sectionsIndexPath: SECTIONS_INDEX_PATH,
  documentationPathPrefix: "/docs/",
  documentationPathSuffix: "/llms.txt",
});

import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import workerThreads from "node:worker_threads";
import { AsyncLocalStorage } from "node:async_hooks";
import { syncBuiltinESMExports } from "node:module";

const RESPONSE_LIMIT = 1_500_000;
const TOTAL_RESPONSE_LIMIT = 6_000_000;
const REQUEST_BODY_LIMIT = 64_000;
const allowedOrigin = "https://api.osv.dev";
const deploymentProxyValue = process.env.HTTPS_PROXY?.trim() || process.env.https_proxy?.trim();
let deploymentProxyHostname;
if (deploymentProxyValue) {
  const parsedProxy = new URL(deploymentProxyValue);
  if (
    !["http:", "https:"].includes(parsedProxy.protocol) ||
    !parsedProxy.hostname ||
    parsedProxy.username ||
    parsedProxy.password ||
    parsedProxy.search ||
    parsedProxy.hash ||
    parsedProxy.pathname !== "/"
  ) {
    throw new Error("Agent-OPT OSV sandbox denied invalid deployment proxy configuration");
  }
  deploymentProxyHostname = parsedProxy.hostname;
}
const nativeFetch = globalThis.fetch.bind(globalThis);
const nativeNetConnect = net.connect.bind(net);
const nativeNetCreateConnection = net.createConnection.bind(net);
const nativeTlsConnect = tls.connect.bind(tls);
const nativeDnsLookup = dns.lookup.bind(dns);
const nativeDnsPromisesLookup = dnsPromises.lookup.bind(dnsPromises);
const networkScope = new AsyncLocalStorage();
const allowedNetworkToken = Object.freeze({ origin: allowedOrigin });
let totalResponseBytes = 0;

const denied = (capability) => {
  throw new Error(`Agent-OPT OSV sandbox denied ${capability}`);
};

for (const key of [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "NPM_TOKEN",
  "NODE_AUTH_TOKEN",
  "NPM_CONFIG_USERCONFIG",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_TENANT_ID",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "MCP_PUBLIC_URL",
  "MCP_HTTP_HOST",
  "MCP_HTTP_PORT",
  "MCP_HTTP_ENDPOINT_PATH",
  "MCP_AUTH_MODE",
  "OSV_API_URL",
  "OSV_BASE_URL",
  "NODE_USE_ENV_PROXY",
  "NODE_OPTIONS",
]) {
  delete process.env[key];
}

Object.assign(process.env, {
  MCP_TRANSPORT_TYPE: "stdio",
  MCP_LOG_LEVEL: "emerg",
  STORAGE_PROVIDER_TYPE: "in-memory",
  IS_SERVERLESS: "true",
  OTEL_ENABLED: "false",
  OSV_REQUEST_TIMEOUT_MS: "6000",
  OSV_BATCH_CONCURRENCY: "3",
  OSV_QUERY_MAX_PAGES: "2",
});

function readMethod(input, init) {
  if (typeof init?.method === "string") return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function requestHeaders(input, init) {
  if (init?.headers !== undefined) return new Headers(init.headers);
  if (typeof Request !== "undefined" && input instanceof Request) return new Headers(input.headers);
  return new Headers();
}

function validateQueryBody(body) {
  if (typeof body !== "string" || Buffer.byteLength(body, "utf8") > REQUEST_BODY_LIMIT) {
    denied("an invalid OSV request body");
  }
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    denied("a malformed OSV request body");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    denied("a non-object OSV request body");
  }
  const keys = Object.keys(payload);
  if (keys.some((key) => !["package", "version", "page_token"].includes(key))) {
    denied("an unexpected OSV request field");
  }
  if (
    !payload.package ||
    typeof payload.package !== "object" ||
    Array.isArray(payload.package) ||
    Object.keys(payload.package).some((key) => !["name", "ecosystem"].includes(key)) ||
    typeof payload.package.name !== "string" ||
    typeof payload.package.ecosystem !== "string" ||
    typeof payload.version !== "string"
  ) {
    denied("an invalid OSV package query");
  }
  if (
    payload.package.name.length > 200 ||
    payload.package.ecosystem.length > 100 ||
    payload.version.length > 100 ||
    (payload.page_token !== undefined &&
      (typeof payload.page_token !== "string" || payload.page_token.length > 4_096))
  ) {
    denied("an oversized OSV package query");
  }
}

function authorizeRequest(input, init = {}) {
  if (typeof input !== "string" && !(input instanceof URL)) {
    denied("Request-object network input");
  }
  const url = new URL(input.toString());
  if (
    url.origin !== allowedOrigin ||
    url.protocol !== "https:" ||
    url.hostname !== "api.osv.dev" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    denied(`network destination ${url.origin}`);
  }

  const method = readMethod(input, init);
  if (url.pathname === "/v1/query") {
    if (method !== "POST") denied(`OSV method ${method}`);
    validateQueryBody(init.body);
  } else if (url.pathname.startsWith("/v1/vulns/")) {
    if (method !== "GET") denied(`OSV method ${method}`);
    const encodedId = url.pathname.slice("/v1/vulns/".length);
    let id;
    try {
      id = decodeURIComponent(encodedId);
    } catch {
      denied("a malformed OSV advisory ID");
    }
    if (!id || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(id)) {
      denied("an invalid OSV advisory ID");
    }
    if (init.body !== undefined && init.body !== null) denied("a body on an OSV advisory GET");
  } else {
    denied(`OSV path ${url.pathname}`);
  }

  const headers = requestHeaders(input, init);
  for (const header of ["authorization", "cookie", "proxy-authorization", "x-api-key"]) {
    if (headers.has(header)) denied(`credential header ${header}`);
  }
  return {
    url,
    init: {
      ...init,
      method,
      redirect: "error",
      credentials: "omit",
    },
  };
}

async function boundedResponse(response, requestedUrl) {
  if (
    response.redirected ||
    !response.url ||
    new URL(response.url).origin !== allowedOrigin ||
    new URL(response.url).pathname !== requestedUrl.pathname
  ) {
    denied("an OSV redirect or origin change");
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    denied("a non-JSON OSV response");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > RESPONSE_LIMIT) {
    denied("an oversized OSV response");
  }
  if (!response.body) {
    return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
  }

  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    totalResponseBytes += value.byteLength;
    if (bytes > RESPONSE_LIMIT || totalResponseBytes > TOTAL_RESPONSE_LIMIT) {
      await reader.cancel().catch(() => undefined);
      denied("an oversized OSV response");
    }
    chunks.push(Buffer.from(value));
  }
  return new Response(Buffer.concat(chunks, bytes), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

globalThis.fetch = async (input, init = {}) => {
  const authorized = authorizeRequest(input, init);
  return networkScope.run(allowedNetworkToken, async () => {
    const response = await nativeFetch(authorized.url, authorized.init);
    return boundedResponse(response, authorized.url);
  });
};
globalThis.WebSocket = class DeniedWebSocket {
  constructor() {
    denied("WebSocket access");
  }
};

for (const [target, methods, label] of [
  [http, ["request", "get"], "HTTP access"],
  [https, ["request", "get"], "HTTPS access"],
  [dgram, ["createSocket"], "datagram access"],
  [dns, ["resolve", "resolve4", "resolve6", "resolveAny"], "DNS access"],
  [dnsPromises, ["resolve", "resolve4", "resolve6", "resolveAny"], "DNS access"],
  [
    childProcess,
    ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"],
    "subprocess access",
  ],
]) {
  for (const method of methods) {
    target[method] = () => denied(label);
  }
}
const requireAllowedFetchScope = (operation, nativeOperation) => (...args) => {
  if (networkScope.getStore() !== allowedNetworkToken) denied(operation);
  return nativeOperation(...args);
};
net.connect = requireAllowedFetchScope("socket access", nativeNetConnect);
net.createConnection = requireAllowedFetchScope("socket access", nativeNetCreateConnection);
tls.connect = requireAllowedFetchScope("TLS access", nativeTlsConnect);
dns.lookup = (hostname, ...args) => {
  if (
    networkScope.getStore() !== allowedNetworkToken ||
    (hostname !== "api.osv.dev" && hostname !== deploymentProxyHostname)
  ) denied("DNS access");
  return nativeDnsLookup(hostname, ...args);
};
dnsPromises.lookup = (hostname, ...args) => {
  if (
    networkScope.getStore() !== allowedNetworkToken ||
    (hostname !== "api.osv.dev" && hostname !== deploymentProxyHostname)
  ) denied("DNS access");
  return nativeDnsPromisesLookup(hostname, ...args);
};
workerThreads.Worker = class DeniedWorker {
  constructor() {
    denied("worker-thread access");
  }
};

syncBuiltinESMExports();

if (process.env.AGENT_OPT_OSV_SECURITY_PROBE === "1") {
  const checkDenied = async (operation) => {
    try {
      await operation();
      return false;
    } catch (error) {
      return error instanceof Error && error.message.includes("Agent-OPT OSV sandbox denied");
    }
  };
  const allowedPolicy = authorizeRequest("https://api.osv.dev/v1/query", {
    method: "POST",
    body: JSON.stringify({ package: { name: "lodash", ecosystem: "npm" }, version: "4.17.20" }),
    redirect: "follow",
  });
  const result = {
    fixedOriginAccepted: allowedPolicy.url.origin === allowedOrigin,
    redirectForced: allowedPolicy.init.redirect === "error",
    customHostDenied: await checkDenied(() => globalThis.fetch("https://example.com/v1/query")),
    customPathDenied: await checkDenied(() => globalThis.fetch("https://api.osv.dev/v1alpha/query")),
    credentialHeaderDenied: await checkDenied(() =>
      globalThis.fetch("https://api.osv.dev/v1/query", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
        body: JSON.stringify({ package: { name: "lodash", ecosystem: "npm" }, version: "4.17.20" }),
      }),
    ),
    httpDenied: await checkDenied(() => http.get("http://127.0.0.1")),
    subprocessDenied: await checkDenied(() => childProcess.spawn(process.execPath, ["--version"])),
    proxyRemoved:
      process.env.HTTPS_PROXY === undefined &&
      process.env.https_proxy === undefined &&
      process.env.NODE_USE_ENV_PROXY === undefined,
    credentialRemoved:
      process.env.NPM_TOKEN === undefined &&
      process.env.AWS_ACCESS_KEY_ID === undefined &&
      process.env.OPENAI_API_KEY === undefined,
  };
  process.stdout.write(JSON.stringify(result));
} else {
  await import("../node_modules/@cyanheads/osv-advisory-mcp-server/dist/index.js");
}

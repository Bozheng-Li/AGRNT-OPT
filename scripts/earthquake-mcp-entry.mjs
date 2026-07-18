import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import workerThreads from "node:worker_threads";
import { AsyncLocalStorage } from "node:async_hooks";
import { syncBuiltinESMExports } from "node:module";

const USGS_ORIGIN = "https://earthquake.usgs.gov";
const EMSC_ORIGIN = "https://www.seismicportal.eu";
const ALLOWED_HOSTS = new Set(["earthquake.usgs.gov", "www.seismicportal.eu"]);
const RESPONSE_LIMIT = 1_500_000;
const TOTAL_RESPONSE_LIMIT = 4_000_000;
const QUERY_LIMIT = 4_096;
const networkScope = new AsyncLocalStorage();
const allowedNetworkToken = Object.freeze({ origins: [USGS_ORIGIN, EMSC_ORIGIN] });
const nativeFetch = globalThis.fetch.bind(globalThis);
const nativeNetConnect = net.connect.bind(net);
const nativeNetCreateConnection = net.createConnection.bind(net);
const nativeTlsConnect = tls.connect.bind(tls);
const nativeDnsLookup = dns.lookup.bind(dns);
const nativeDnsPromisesLookup = dnsPromises.lookup.bind(dnsPromises);
let totalResponseBytes = 0;

const denied = (capability) => {
  throw new Error(`Agent-OPT Earthquake sandbox denied ${capability}`);
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
  "NODE_USE_ENV_PROXY",
  "NODE_OPTIONS",
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
  "USGS_BASE_URL",
  "EMSC_BASE_URL",
  "DEFAULT_LIMIT",
  "REQUEST_TIMEOUT_MS",
]) {
  delete process.env[key];
}
for (const key of Object.keys(process.env)) {
  if (/(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|PRIVATE_?KEY|ACCESS_?KEY)(?:$|_)/i.test(key)) {
    delete process.env[key];
  }
}

Object.assign(process.env, {
  MCP_TRANSPORT_TYPE: "stdio",
  MCP_LOG_LEVEL: "emerg",
  STORAGE_PROVIDER_TYPE: "in-memory",
  IS_SERVERLESS: "true",
  OTEL_ENABLED: "false",
  USGS_BASE_URL: USGS_ORIGIN,
  EMSC_BASE_URL: EMSC_ORIGIN,
  DEFAULT_LIMIT: "25",
  REQUEST_TIMEOUT_MS: "15000",
});

function exactQueryKeys(params, allowed) {
  const seen = new Set();
  for (const key of params.keys()) {
    if (!allowed.has(key)) denied(`query parameter ${key}`);
    if (seen.has(key)) denied(`duplicate query parameter ${key}`);
    seen.add(key);
  }
}

function boundedNumber(params, name, minimum, maximum, integer = false) {
  if (!params.has(name)) return;
  const raw = params.get(name);
  if (raw === null || raw.length > 40 || (integer && !/^-?\d+$/.test(raw))) {
    denied(`query parameter ${name}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    denied(`query parameter ${name}`);
  }
}

function timestamp(params, name) {
  if (!params.has(name)) return;
  const value = params.get(name);
  if (
    value === null ||
    value.length > 50 ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    denied(`query parameter ${name}`);
  }
}

function validateLocation(params, radiusName, radiusMaximum) {
  boundedNumber(params, "latitude", -90, 90);
  boundedNumber(params, "longitude", -180, 180);
  boundedNumber(params, radiusName, 0, radiusMaximum);
  const present = [params.has("latitude"), params.has("longitude"), params.has(radiusName)];
  if (present.some(Boolean) && !present.every(Boolean)) denied("incomplete radius query");
}

function validateFdsn(url, source) {
  if (url.search.length > QUERY_LIMIT) denied("oversized query");
  const params = url.searchParams;
  const isUsgs = source === "usgs";
  const expectedFormat = isUsgs ? "geojson" : "json";

  if (url.pathname === "/fdsnws/event/1/query" && params.has("eventid")) {
    if (!isUsgs) denied("EMSC event detail path");
    exactQueryKeys(params, new Set(["eventid", "format"]));
    if (params.get("format") !== expectedFormat || !/^[A-Za-z0-9_-]{4,64}$/.test(params.get("eventid") ?? "")) {
      denied("event detail query");
    }
    return;
  }

  const isSearch = url.pathname === "/fdsnws/event/1/query";
  const isCount = url.pathname === "/fdsnws/event/1/count";
  if (!isSearch && !isCount) denied(`path ${url.pathname}`);

  const commonKeys = [
    "format",
    "starttime",
    "endtime",
    "minmagnitude",
    "maxmagnitude",
    "latitude",
    "longitude",
    "mindepth",
    "maxdepth",
  ];
  const sourceKeys = isUsgs
    ? ["maxradiuskm", "alertlevel", "minfelt", "minsig"]
    : ["maxradius"];
  const searchKeys = isSearch ? ["limit", "orderby"] : [];
  exactQueryKeys(params, new Set([...commonKeys, ...sourceKeys, ...searchKeys]));
  if (params.get("format") !== expectedFormat) denied("response format");

  timestamp(params, "starttime");
  timestamp(params, "endtime");
  boundedNumber(params, "minmagnitude", -1, 10);
  boundedNumber(params, "maxmagnitude", -1, 10);
  boundedNumber(params, "mindepth", -10, 1_000);
  boundedNumber(params, "maxdepth", -10, 1_000);
  validateLocation(params, isUsgs ? "maxradiuskm" : "maxradius", isUsgs ? 5_000 : 45);

  if (params.has("alertlevel") && !["green", "yellow", "orange", "red"].includes(params.get("alertlevel"))) {
    denied("query parameter alertlevel");
  }
  boundedNumber(params, "minfelt", 1, 1_000_000, true);
  boundedNumber(params, "minsig", 0, 5_000, true);
  boundedNumber(params, "limit", 1, 100, true);
  if (params.has("orderby") && !["time", "time-asc", "magnitude", "magnitude-asc"].includes(params.get("orderby"))) {
    denied("query parameter orderby");
  }
}

function authorizeRequest(input, init = {}) {
  if (typeof input !== "string" && !(input instanceof URL)) denied("Request-object network input");
  const url = new URL(input.toString());
  const source = url.origin === USGS_ORIGIN ? "usgs" : url.origin === EMSC_ORIGIN ? "emsc" : undefined;
  if (
    !source ||
    url.protocol !== "https:" ||
    !ALLOWED_HOSTS.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  ) {
    denied(`network destination ${url.origin}`);
  }
  const method = String(init.method ?? "GET").toUpperCase();
  if (method !== "GET" || init.body !== undefined && init.body !== null) denied(`method ${method}`);

  const headers = new Headers(init.headers);
  for (const key of headers.keys()) {
    if (key.toLowerCase() !== "accept") denied(`header ${key}`);
  }
  for (const key of ["authorization", "cookie", "proxy-authorization", "x-api-key"]) {
    if (headers.has(key)) denied(`credential header ${key}`);
  }
  if (headers.has("accept") && headers.get("accept") !== "application/json") denied("Accept header");

  if (source === "usgs" && /^\/earthquakes\/feed\/v1\.0\/summary\/(?:all|1\.0|2\.5|4\.5|significant)_(?:hour|day|week|month)\.geojson$/.test(url.pathname)) {
    if (url.search) denied("feed query");
  } else {
    validateFdsn(url, source);
  }
  return { url, init: { ...init, method: "GET", redirect: "error", credentials: "omit" } };
}

async function boundedResponse(response, requestedUrl) {
  if (response.redirected || !response.url || response.url !== requestedUrl.toString()) {
    denied("redirect or origin change");
  }
  const contentType = response.headers.get("content-type") ?? "";
  const normalizedType = contentType.toLowerCase();
  if (response.ok ? !normalizedType.includes("json") : !(normalizedType.includes("json") || normalizedType.startsWith("text/"))) {
    denied("non-JSON response");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > RESPONSE_LIMIT) denied("oversized response");
  if (!response.body) {
    return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const reader = response.body.getReader();
  const chunks = [];
  let responseBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    responseBytes += value.byteLength;
    totalResponseBytes += value.byteLength;
    if (responseBytes > RESPONSE_LIMIT || totalResponseBytes > TOTAL_RESPONSE_LIMIT) {
      await reader.cancel().catch(() => undefined);
      denied("oversized response");
    }
    chunks.push(Buffer.from(value));
  }
  return new Response(Buffer.concat(chunks, responseBytes), {
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
  constructor() { denied("WebSocket access"); }
};

for (const [target, methods, label] of [
  [http, ["request", "get", "createServer"], "HTTP access"],
  [https, ["request", "get", "createServer"], "HTTPS access"],
  [dgram, ["createSocket"], "datagram access"],
  [dns, ["resolve", "resolve4", "resolve6", "resolveAny"], "DNS access"],
  [dnsPromises, ["resolve", "resolve4", "resolve6", "resolveAny"], "DNS access"],
  [childProcess, ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"], "subprocess access"],
]) {
  for (const method of methods) target[method] = () => denied(label);
}
net.createServer = () => denied("socket server access");
tls.createServer = () => denied("TLS server access");
const scopedNetwork = (label, operation) => (...args) => {
  if (networkScope.getStore() !== allowedNetworkToken) denied(label);
  return operation(...args);
};
net.connect = scopedNetwork("socket access", nativeNetConnect);
net.createConnection = scopedNetwork("socket access", nativeNetCreateConnection);
tls.connect = scopedNetwork("TLS access", nativeTlsConnect);
dns.lookup = (hostname, ...args) => {
  if (networkScope.getStore() !== allowedNetworkToken || !ALLOWED_HOSTS.has(hostname)) denied("DNS access");
  return nativeDnsLookup(hostname, ...args);
};
dnsPromises.lookup = (hostname, ...args) => {
  if (networkScope.getStore() !== allowedNetworkToken || !ALLOWED_HOSTS.has(hostname)) denied("DNS access");
  return nativeDnsPromisesLookup(hostname, ...args);
};
workerThreads.Worker = class DeniedWorker {
  constructor() { denied("worker access"); }
};
syncBuiltinESMExports();

function denyFilesystem() {
  for (const method of [
    "readFile", "readFileSync", "writeFile", "writeFileSync", "appendFile", "appendFileSync",
    "createReadStream", "createWriteStream", "open", "openSync",
  ]) fs[method] = () => denied("filesystem access");
  for (const method of ["readFile", "writeFile", "appendFile", "open"]) {
    fsPromises[method] = () => denied("filesystem access");
  }
  syncBuiltinESMExports();
}

if (process.env.AGENT_OPT_EARTHQUAKE_SECURITY_PROBE === "1") {
  denyFilesystem();
  const checkDenied = async (operation) => {
    try { await operation(); return false; }
    catch (error) { return error instanceof Error && error.message.includes("Agent-OPT Earthquake sandbox denied"); }
  };
  const usgs = authorizeRequest(`${USGS_ORIGIN}/earthquakes/feed/v1.0/summary/4.5_week.geojson`, { redirect: "follow" });
  const emsc = authorizeRequest(`${EMSC_ORIGIN}/fdsnws/event/1/query?format=json&starttime=2024-01-01&endtime=2024-01-08&minmagnitude=6&limit=2&orderby=magnitude`);
  process.stdout.write(JSON.stringify({
    usgsOriginAccepted: usgs.url.origin === USGS_ORIGIN,
    emscOriginAccepted: emsc.url.origin === EMSC_ORIGIN,
    redirectForced: usgs.init.redirect === "error",
    customHostDenied: await checkDenied(() => globalThis.fetch("https://example.com/fdsnws/event/1/count?format=geojson")),
    customPathDenied: await checkDenied(() => globalThis.fetch(`${USGS_ORIGIN}/admin`)),
    arbitraryQueryDenied: await checkDenied(() => globalThis.fetch(`${USGS_ORIGIN}/fdsnws/event/1/query?format=geojson&url=https://example.com`)),
    credentialHeaderDenied: await checkDenied(() => globalThis.fetch(`${USGS_ORIGIN}/earthquakes/feed/v1.0/summary/4.5_week.geojson`, { headers: { Authorization: "Bearer secret" } })),
    requestObjectDenied: await checkDenied(() => globalThis.fetch(new Request(`${USGS_ORIGIN}/earthquakes/feed/v1.0/summary/4.5_week.geojson`))),
    httpDenied: await checkDenied(() => http.get("http://127.0.0.1")),
    dnsDenied: await checkDenied(() => dnsPromises.lookup("example.com")),
    hostReadDenied: await checkDenied(() => fsPromises.readFile(process.env.USERPROFILE ?? "/", "utf8")),
    writeDenied: await checkDenied(() => fsPromises.writeFile("probe.txt", "x")),
    subprocessDenied: await checkDenied(() => childProcess.spawn(process.execPath, ["--version"])),
    workerDenied: await checkDenied(() => new workerThreads.Worker("")),
    proxyRemoved: ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NODE_USE_ENV_PROXY"].every((key) => process.env[key] === undefined),
    credentialRemoved: process.env.NPM_TOKEN === undefined && process.env.AWS_ACCESS_KEY_ID === undefined && process.env.OPENAI_API_KEY === undefined,
    baseUrlsPinned: process.env.USGS_BASE_URL === USGS_ORIGIN && process.env.EMSC_BASE_URL === EMSC_ORIGIN,
  }));
} else {
  await import("../node_modules/@cyanheads/earthquake-mcp-server/dist/index.js");
  denyFilesystem();
}

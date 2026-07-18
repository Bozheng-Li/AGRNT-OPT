/** Security bootstrap for the exact @cyanheads/worldbank-mcp-server 0.1.14 STDIO server. */

import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { AsyncLocalStorage } from "node:async_hooks";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import tls from "node:tls";
import workerThreads from "node:worker_threads";

const ORIGIN = "https://api.worldbank.org";
const BASE_PATH = "/v2";
const RESPONSE_LIMIT = 12 * 1024 * 1024;
const TOTAL_LIMIT = 24 * 1024 * 1024;
const QUERY_LIMIT = 8 * 1024;
const REQUEST_LIMIT = 64;
const CURRENT_YEAR = new Date().getUTCFullYear() + 1;
const denied = (capability) => { throw new Error(`Agent-OPT World Bank sandbox denied ${capability}`); };

const packageInput = process.env.AGENT_OPT_WORLDBANK_PACKAGE_ROOT;
const runtimeInput = process.env.AGENT_OPT_WORLDBANK_RUNTIME_ROOT;
const securityProbe = process.env.AGENT_OPT_WORLDBANK_SECURITY_PROBE === "1";
if (!packageInput || !runtimeInput) throw new Error("World Bank bootstrap requires package and runtime roots");

const packageRoot = fs.realpathSync(path.resolve(packageInput));
const runtimeRoot = fs.realpathSync(path.resolve(runtimeInput));
const moduleRoot = fs.realpathSync(path.resolve(packageRoot, "..", ".."));
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
if (packageJson.name !== "@cyanheads/worldbank-mcp-server" || packageJson.version !== "0.1.14") {
  throw new Error("World Bank bootstrap requires exact @cyanheads/worldbank-mcp-server 0.1.14");
}
const entry = path.join(packageRoot, "dist", "index.js");
if (!fs.existsSync(entry)) throw new Error("World Bank upstream entry is missing");

const nativeFetch = globalThis.fetch.bind(globalThis);
const nativeRealpathSync = fs.realpathSync.bind(fs);
const nativeNetConnect = net.connect.bind(net);
const nativeNetCreateConnection = net.createConnection.bind(net);
const nativeTlsConnect = tls.connect.bind(tls);
const nativeDnsLookup = dns.lookup.bind(dns);
const nativeDnsPromisesLookup = dnsPromises.lookup.bind(dnsPromises);
const scope = new AsyncLocalStorage();
const token = Object.freeze({ network: "worldbank-fixed-origin" });
let requestCount = 0;
let totalBytes = 0;

const within = (root, target) => {
  const relative = path.relative(root, path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
const safeReadPath = (target) => {
  if (typeof target === "number") return target;
  const candidate = target instanceof URL ? fileURLToPath(target) : String(target);
  const resolved = path.resolve(candidate);
  if (!within(moduleRoot, resolved) && !within(runtimeRoot, resolved)) denied("host filesystem read");
  try {
    const real = nativeRealpathSync(resolved);
    if (!within(moduleRoot, real) && !within(runtimeRoot, real)) denied("linked host filesystem read");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Agent-OPT World Bank sandbox denied")) throw error;
  }
  return target;
};

const readMethods = ["access", "accessSync", "existsSync", "lstat", "lstatSync", "readFile", "readFileSync", "readdir", "readdirSync", "readlink", "readlinkSync", "realpath", "realpathSync", "stat", "statSync", "createReadStream"];
for (const name of readMethods) {
  const original = fs[name];
  if (typeof original === "function") fs[name] = function guardedRead(target, ...args) { return original.call(this, safeReadPath(target), ...args); };
}
for (const name of ["access", "lstat", "readFile", "readdir", "readlink", "realpath", "stat"]) {
  const original = fsPromises[name];
  if (typeof original === "function") fsPromises[name] = async function guardedRead(target, ...args) { return original.call(this, safeReadPath(target), ...args); };
}
for (const name of ["appendFile", "appendFileSync", "chmod", "chmodSync", "copyFile", "copyFileSync", "cp", "cpSync", "createWriteStream", "link", "linkSync", "mkdir", "mkdirSync", "mkdtemp", "mkdtempSync", "rename", "renameSync", "rm", "rmSync", "rmdir", "rmdirSync", "symlink", "symlinkSync", "truncate", "truncateSync", "unlink", "unlinkSync", "writeFile", "writeFileSync"]) {
  if (typeof fs[name] === "function") fs[name] = () => denied(`filesystem ${name}`);
  if (typeof fsPromises[name] === "function") fsPromises[name] = async () => denied(`filesystem ${name}`);
}

for (const key of Object.keys(process.env)) {
  if (/(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|PRIVATE_?KEY|ACCESS_?KEY)(?:$|_)/i.test(key)
    || /^(?:HTTP|HTTPS|ALL|NO)_PROXY$/i.test(key)
    || /^(?:npm_config_.*proxy|GIT_ASKPASS|SSH_AUTH_SOCK)$/i.test(key)) delete process.env[key];
}
for (const key of ["AGENT_OPT_WORLDBANK_PACKAGE_ROOT", "AGENT_OPT_WORLDBANK_RUNTIME_ROOT", "WORLDBANK_API_BASE_URL", "WORLDBANK_DEFAULT_PER_PAGE", "MCP_PUBLIC_URL", "MCP_HTTP_HOST", "MCP_HTTP_PORT", "MCP_HTTP_ENDPOINT_PATH", "MCP_AUTH_MODE", "NODE_USE_ENV_PROXY", "NODE_OPTIONS", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS"]) delete process.env[key];
Object.assign(process.env, {
  MCP_TRANSPORT_TYPE: "stdio", MCP_LOG_LEVEL: "emerg", STORAGE_PROVIDER_TYPE: "in-memory", IS_SERVERLESS: "true",
  OTEL_ENABLED: "false", WORLDBANK_API_BASE_URL: `${ORIGIN}${BASE_PATH}`, WORLDBANK_DEFAULT_PER_PAGE: "10",
  NO_COLOR: "1", NODE_ENV: "production",
});

function exactKeys(params, allowed) {
  const permitted = new Set(allowed);
  for (const key of params.keys()) if (!permitted.has(key) || params.getAll(key).length !== 1) denied(`query parameter ${key}`);
}
function integer(params, name, minimum, maximum) {
  if (!params.has(name)) return;
  const value = params.get(name);
  if (!value || !/^\d+$/.test(value) || Number(value) < minimum || Number(value) > maximum) denied(`query parameter ${name}`);
}
function segment(raw, label, pattern, maximum) {
  if (!raw || raw.includes("/") || raw.length > maximum * 3) denied(`${label} path`);
  let value;
  try { value = decodeURIComponent(raw); } catch { denied(`malformed ${label} path`); }
  if (value.length > maximum || !pattern.test(value) || /[\u0000-\u001f\u007f]/.test(value)) denied(`${label} path`);
  return value;
}
function validateDate(value) {
  if (!/^\d{4}(?::\d{4})?$/.test(value)) denied("date range");
  const [startText, endText = startText] = value.split(":");
  const start = Number(startText); const end = Number(endText);
  if (start < 1900 || end > CURRENT_YEAR || start > end || end - start > 50) denied("date range");
}
function requireFormat(params) {
  if (params.get("format") !== "json") denied("response format");
}

function authorize(input, init = {}) {
  if (typeof input !== "string" && !(input instanceof URL)) denied("Request-object input");
  const url = new URL(input.toString());
  if (url.origin !== ORIGIN || url.protocol !== "https:" || url.hostname !== "api.worldbank.org" || url.port || url.username || url.password || url.hash) denied(`network destination ${url.origin}`);
  if (!url.pathname.startsWith(`${BASE_PATH}/`) && url.pathname !== BASE_PATH) denied(`path ${url.pathname}`);
  if (url.search.length > QUERY_LIMIT) denied("oversized query string");
  const method = String(init.method ?? "GET").toUpperCase();
  if (method !== "GET" || init.body != null) denied(`method ${method}`);
  const headers = new Headers(init.headers);
  for (const key of headers.keys()) if (!['accept'].includes(key.toLowerCase())) denied(`header ${key}`);
  for (const key of ["authorization", "cookie", "proxy-authorization", "x-api-key"]) if (headers.has(key)) denied(`credential header ${key}`);

  const pathname = url.pathname;
  const params = url.searchParams;
  if (pathname === `${BASE_PATH}/topic`) {
    exactKeys(params, ["format"]); requireFormat(params);
  } else if (pathname === `${BASE_PATH}/source`) {
    exactKeys(params, ["format", "page", "per_page"]); requireFormat(params); integer(params, "page", 1, 20); integer(params, "per_page", 1, 20);
  } else if (pathname === `${BASE_PATH}/country`) {
    exactKeys(params, ["format", "page", "per_page", "region", "incomeLevel"]); requireFormat(params);
    integer(params, "page", 1, 100); integer(params, "per_page", 1, 300);
    if (params.has("region") && !["EAS", "ECS", "LCN", "MEA", "NAC", "SAS", "SSF"].includes(params.get("region"))) denied("region filter");
    if (params.has("incomeLevel") && !["LIC", "LMC", "UMC", "HIC"].includes(params.get("incomeLevel"))) denied("income filter");
  } else {
    const dataPath = /^\/v2\/country\/([^/]+)\/indicator\/([^/]+)$/.exec(pathname);
    const countryPath = /^\/v2\/country\/([^/]+)$/.exec(pathname);
    const indicatorPath = /^\/v2\/indicator\/([^/]+)$/.exec(pathname);
    const topicIndicators = /^\/v2\/topic\/([^/]+)\/indicator$/.exec(pathname);
    if (dataPath) {
      const codes = segment(dataPath[1], "country list", /^[A-Za-z0-9]{2,3}(?:;[A-Za-z0-9]{2,3}){0,7}$/, 31).split(";");
      if (codes.some((code) => code.toUpperCase() === "ALL")) denied("all-country query");
      segment(dataPath[2], "indicator", /^[A-Za-z0-9][A-Za-z0-9._-]*$/, 100);
      exactKeys(params, ["format", "page", "per_page", "date", "mrv"]); requireFormat(params);
      if (params.get("page") !== "1") denied("data page"); integer(params, "per_page", 1, 500);
      if (params.has("date") && params.has("mrv")) denied("date and mrv conflict");
      if (params.has("date")) validateDate(params.get("date"));
      integer(params, "mrv", 1, 10);
    } else if (countryPath) {
      segment(countryPath[1], "country", /^[A-Za-z0-9]{2,3}$/, 3); exactKeys(params, ["format"]); requireFormat(params);
    } else if (indicatorPath) {
      segment(indicatorPath[1], "indicator", /^[A-Za-z0-9][A-Za-z0-9._-]*$/, 100); exactKeys(params, ["format"]); requireFormat(params);
    } else if (topicIndicators) {
      const id = segment(topicIndicators[1], "topic", /^\d{1,2}$/, 2);
      if (Number(id) < 1 || Number(id) > 21) denied("topic path");
      exactKeys(params, ["format", "page", "per_page"]); requireFormat(params); integer(params, "page", 1, 100); integer(params, "per_page", 1, 1000);
      if (Number(params.get("per_page")) > 20 && params.get("page") !== "1") denied("topic search page");
    } else if (pathname === `${BASE_PATH}/indicator`) {
      exactKeys(params, ["format", "source", "page", "per_page"]); requireFormat(params);
      if (!/^\d{1,6}$/.test(params.get("source") ?? "")) denied("source filter");
      integer(params, "page", 1, 100); integer(params, "per_page", 1, 1000);
      if (Number(params.get("per_page")) > 20 && params.get("page") !== "1") denied("source search page");
    } else {
      denied(`path ${pathname}`);
    }
  }
  requestCount += 1;
  if (requestCount > REQUEST_LIMIT) denied("request count");
  return { url, init: { ...init, method: "GET", redirect: "error", credentials: "omit" } };
}

async function bounded(response, requested) {
  if (response.redirected || !response.url) denied("redirect or missing response URL");
  const responseUrl = new URL(response.url);
  if (responseUrl.origin !== ORIGIN || responseUrl.pathname !== requested.pathname) denied("response origin or path change");
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  if (response.ok ? !type.includes("json") : !(type.includes("json") || type.includes("html") || type.startsWith("text/"))) denied("unexpected response content type");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > RESPONSE_LIMIT) denied("oversized response");
  if (!response.body) return response;
  const reader = response.body.getReader(); const chunks = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength; totalBytes += value.byteLength;
    if (bytes > RESPONSE_LIMIT || totalBytes > TOTAL_LIMIT) { await reader.cancel().catch(() => undefined); denied("oversized response"); }
    chunks.push(Buffer.from(value));
  }
  return new Response(Buffer.concat(chunks, bytes), { status: response.status, statusText: response.statusText, headers: response.headers });
}

globalThis.fetch = async (input, init = {}) => {
  const approved = authorize(input, init);
  return scope.run(token, async () => bounded(await nativeFetch(approved.url, approved.init), approved.url));
};
globalThis.WebSocket = class { constructor() { denied("WebSocket access"); } };
for (const [target, methods, label] of [
  [http, ["request", "get", "createServer"], "HTTP access"], [https, ["request", "get", "createServer"], "HTTPS access"],
  [dgram, ["createSocket"], "datagram access"], [dns, ["resolve", "resolve4", "resolve6", "resolveAny"], "DNS access"],
  [dnsPromises, ["resolve", "resolve4", "resolve6", "resolveAny"], "DNS access"],
  [childProcess, ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"], "subprocess access"],
]) for (const method of methods) target[method] = () => denied(label);
net.createServer = () => denied("socket server access"); tls.createServer = () => denied("TLS server access");
const scoped = (label, native) => (...args) => { if (scope.getStore() !== token) denied(label); return native(...args); };
net.connect = scoped("socket access", nativeNetConnect); net.createConnection = scoped("socket access", nativeNetCreateConnection); tls.connect = scoped("TLS access", nativeTlsConnect);
dns.lookup = (hostname, ...args) => { if (scope.getStore() !== token || hostname !== "api.worldbank.org") denied("DNS access"); return nativeDnsLookup(hostname, ...args); };
dnsPromises.lookup = (hostname, ...args) => { if (scope.getStore() !== token || hostname !== "api.worldbank.org") denied("DNS access"); return nativeDnsPromisesLookup(hostname, ...args); };
workerThreads.Worker = class { constructor() { denied("worker access"); } };
syncBuiltinESMExports();

function denyFilesystem() {
  for (const name of readMethods) if (typeof fs[name] === "function") fs[name] = () => denied("filesystem access");
  for (const name of ["access", "lstat", "open", "readFile", "readdir", "readlink", "realpath", "stat"]) if (typeof fsPromises[name] === "function") fsPromises[name] = async () => denied("filesystem access");
  syncBuiltinESMExports();
}

if (securityProbe) {
  denyFilesystem();
  const check = async (operation) => { try { await operation(); return false; } catch (error) { return error instanceof Error && error.message.includes("Agent-OPT World Bank sandbox denied"); } };
  const approved = authorize(`${ORIGIN}${BASE_PATH}/country/USA/indicator/NY.GDP.PCAP.CD?format=json&page=1&per_page=20&date=2020%3A2023`);
  const hostCandidate = process.platform === "win32" ? "C:\\Windows\\win.ini" : "/etc/passwd";
  process.stdout.write(JSON.stringify({
    packagePinned: packageJson.name === "@cyanheads/worldbank-mcp-server" && packageJson.version === "0.1.14",
    fixedOriginAccepted: approved.url.origin === ORIGIN, redirectForced: approved.init.redirect === "error" && approved.init.credentials === "omit",
    customHostDenied: await check(() => globalThis.fetch("https://example.com/v2/topic?format=json")),
    customPathDenied: await check(() => globalThis.fetch(`${ORIGIN}/admin?format=json`)),
    keywordOnlyDenied: await check(() => globalThis.fetch(`${ORIGIN}${BASE_PATH}/indicator?format=json&searchterm=GDP&page=1&per_page=10`)),
    allCountriesDenied: await check(() => globalThis.fetch(`${ORIGIN}${BASE_PATH}/country/all/indicator/SP.POP.TOTL?format=json&page=1&per_page=10&mrv=1`)),
    methodDenied: await check(() => globalThis.fetch(`${ORIGIN}${BASE_PATH}/topic?format=json`, { method: "POST" })),
    requestObjectDenied: await check(() => globalThis.fetch(new Request(`${ORIGIN}${BASE_PATH}/topic?format=json`))),
    credentialHeaderDenied: await check(() => globalThis.fetch(`${ORIGIN}${BASE_PATH}/topic?format=json`, { headers: { Authorization: "Bearer x" } })),
    hostReadDenied: await check(() => fsPromises.readFile(hostCandidate, "utf8")), writeDenied: await check(() => fsPromises.writeFile(path.join(runtimeRoot, "probe.txt"), "x")),
    subprocessDenied: await check(() => childProcess.spawn(process.execPath, ["--version"])), workerDenied: await check(() => new workerThreads.Worker("")),
    baseUrlForced: process.env.WORLDBANK_API_BASE_URL === `${ORIGIN}${BASE_PATH}`,
    proxyRemoved: process.env.HTTPS_PROXY === undefined && process.env.NODE_USE_ENV_PROXY === undefined,
    credentialRemoved: process.env.NPM_TOKEN === undefined && process.env.OPENAI_API_KEY === undefined,
  }));
} else {
  process.argv = [process.execPath, entry];
  await import("sanitize-html");
  await import(pathToFileURL(entry).href);
  denyFilesystem();
}

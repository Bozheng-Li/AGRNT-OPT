/** Security bootstrap for the exact @cyanheads/crossref-mcp-server 0.2.0 STDIO server. */

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

const ORIGIN = "https://api.crossref.org";
const RESPONSE_LIMIT = 6 * 1024 * 1024;
const TOTAL_LIMIT = 24 * 1024 * 1024;
const QUERY_LIMIT = 8 * 1024;
const REQUEST_LIMIT = 64;
const MAX_ROWS = 10;

const denied = (capability) => {
  throw new Error(`Agent-OPT Crossref sandbox denied ${capability}`);
};

const packageInput = process.env.AGENT_OPT_CROSSREF_PACKAGE_ROOT;
const runtimeInput = process.env.AGENT_OPT_CROSSREF_RUNTIME_ROOT;
const securityProbe = process.env.AGENT_OPT_CROSSREF_SECURITY_PROBE === "1";
if (!packageInput || !runtimeInput) throw new Error("Crossref bootstrap requires package and runtime roots");

const packageRoot = fs.realpathSync(path.resolve(packageInput));
const runtimeRoot = fs.realpathSync(path.resolve(runtimeInput));
const moduleRoot = fs.realpathSync(path.resolve(packageRoot, "..", ".."));
const packageJsonPath = path.join(packageRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
if (packageJson.name !== "@cyanheads/crossref-mcp-server" || packageJson.version !== "0.2.0") {
  throw new Error("Crossref bootstrap requires exact @cyanheads/crossref-mcp-server 0.2.0");
}
const entry = path.join(packageRoot, "dist", "index.js");
if (!fs.existsSync(entry)) throw new Error("Crossref upstream entry is missing");

const nativeFetch = globalThis.fetch.bind(globalThis);
const nativeRealpathSync = fs.realpathSync.bind(fs);
const nativeNetConnect = net.connect.bind(net);
const nativeNetCreateConnection = net.createConnection.bind(net);
const nativeTlsConnect = tls.connect.bind(tls);
const nativeDnsLookup = dns.lookup.bind(dns);
const nativeDnsPromisesLookup = dnsPromises.lookup.bind(dnsPromises);
const scope = new AsyncLocalStorage();
const token = Object.freeze({ network: "crossref-fixed-origin" });
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
    if (error instanceof Error && error.message.includes("Agent-OPT Crossref sandbox denied")) throw error;
  }
  return target;
};

const guardedReadMethods = [
  "access",
  "accessSync",
  "existsSync",
  "lstat",
  "lstatSync",
  "readFile",
  "readFileSync",
  "readdir",
  "readdirSync",
  "readlink",
  "readlinkSync",
  "realpath",
  "realpathSync",
  "stat",
  "statSync",
  "createReadStream",
];
for (const name of guardedReadMethods) {
  const original = fs[name];
  if (typeof original === "function") {
    fs[name] = function guardedRead(target, ...args) {
      return original.call(this, safeReadPath(target), ...args);
    };
  }
}
for (const name of ["access", "lstat", "readFile", "readdir", "readlink", "realpath", "stat"]) {
  const original = fsPromises[name];
  if (typeof original === "function") {
    fsPromises[name] = async function guardedRead(target, ...args) {
      return original.call(this, safeReadPath(target), ...args);
    };
  }
}
const readOnlyFlags = (flags) => {
  if (typeof flags === "string") return ["r", "rs", "sr"].includes(flags);
  if (typeof flags !== "number") return false;
  const writeMask = fs.constants.O_WRONLY
    | fs.constants.O_RDWR
    | fs.constants.O_CREAT
    | fs.constants.O_TRUNC
    | fs.constants.O_APPEND;
  return (flags & writeMask) === 0;
};
const nativeOpen = fs.open.bind(fs);
const nativeOpenSync = fs.openSync.bind(fs);
const nativePromiseOpen = fsPromises.open.bind(fsPromises);
fs.open = (target, flags, ...args) => {
  if (!readOnlyFlags(flags)) denied("filesystem open");
  return nativeOpen(safeReadPath(target), flags, ...args);
};
fs.openSync = (target, flags, ...args) => {
  if (!readOnlyFlags(flags)) denied("filesystem openSync");
  return nativeOpenSync(safeReadPath(target), flags, ...args);
};
fsPromises.open = async (target, flags, ...args) => {
  if (!readOnlyFlags(flags)) denied("filesystem open");
  return nativePromiseOpen(safeReadPath(target), flags, ...args);
};
for (const name of [
  "appendFile",
  "appendFileSync",
  "chmod",
  "chmodSync",
  "copyFile",
  "copyFileSync",
  "cp",
  "cpSync",
  "createWriteStream",
  "link",
  "linkSync",
  "mkdir",
  "mkdirSync",
  "mkdtemp",
  "mkdtempSync",
  "rename",
  "renameSync",
  "rm",
  "rmSync",
  "rmdir",
  "rmdirSync",
  "symlink",
  "symlinkSync",
  "truncate",
  "truncateSync",
  "unlink",
  "unlinkSync",
  "writeFile",
  "writeFileSync",
]) {
  if (typeof fs[name] === "function") fs[name] = () => denied(`filesystem ${name}`);
  if (typeof fsPromises[name] === "function") fsPromises[name] = async () => denied(`filesystem ${name}`);
}

for (const key of Object.keys(process.env)) {
  if (
    /(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|PRIVATE_?KEY|ACCESS_?KEY)(?:$|_)/i.test(key)
    || /^(?:HTTP|HTTPS|ALL|NO)_PROXY$/i.test(key)
    || /^(?:npm_config_.*proxy|GIT_ASKPASS|SSH_AUTH_SOCK)$/i.test(key)
  ) delete process.env[key];
}
for (const key of [
  "AGENT_OPT_CROSSREF_PACKAGE_ROOT",
  "AGENT_OPT_CROSSREF_RUNTIME_ROOT",
  "CROSSREF_BASE_URL",
  "CROSSREF_MAILTO",
  "CROSSREF_TIMEOUT_MS",
  "MCP_PUBLIC_URL",
  "MCP_HTTP_HOST",
  "MCP_HTTP_PORT",
  "MCP_HTTP_ENDPOINT_PATH",
  "MCP_AUTH_MODE",
  "NODE_USE_ENV_PROXY",
  "NODE_OPTIONS",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
]) delete process.env[key];
Object.assign(process.env, {
  MCP_TRANSPORT_TYPE: "stdio",
  MCP_LOG_LEVEL: "emerg",
  STORAGE_PROVIDER_TYPE: "in-memory",
  IS_SERVERLESS: "true",
  OTEL_ENABLED: "false",
  CROSSREF_BASE_URL: ORIGIN,
  CROSSREF_TIMEOUT_MS: "15000",
  NO_COLOR: "1",
  NODE_ENV: "production",
});

function exactKeys(params, allowed) {
  const permitted = new Set(allowed);
  for (const key of params.keys()) {
    if (!permitted.has(key) || params.getAll(key).length !== 1) denied(`query parameter ${key}`);
  }
}

function integerParam(params, name, maximum) {
  if (!params.has(name)) return;
  const value = params.get(name);
  if (!value || !/^\d+$/.test(value) || Number(value) > maximum) denied(`query parameter ${name}`);
}

function textParam(params, name, maximum) {
  if (!params.has(name)) return;
  const value = params.get(name);
  if (!value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) denied(`query parameter ${name}`);
}

function decodedSegment(raw, label, pattern, maximum) {
  if (!raw || raw.includes("/") || raw.length > maximum * 3) denied(`${label} path`);
  let value;
  try {
    value = decodeURIComponent(raw);
  } catch {
    denied(`malformed ${label} path`);
  }
  if (value.length > maximum || !pattern.test(value) || /[\u0000-\u001f\u007f]/.test(value)) denied(`${label} path`);
  return value;
}

function validateFilter(value) {
  if (!value || value.length > 4_096) denied("filter value");
  const entries = value.split(",");
  if (entries.length > 12) denied("filter count");
  for (const entry of entries) {
    const delimiter = entry.indexOf(":");
    if (delimiter < 1) denied("filter syntax");
    const key = entry.slice(0, delimiter);
    const item = entry.slice(delimiter + 1);
    if (!/^[a-z][a-z0-9.-]{0,63}$/.test(key) || !item || item.length > 300 || /[\u0000-\u001f\u007f]/.test(item)) {
      denied("filter syntax");
    }
  }
}

function validateSelect(value) {
  const allowed = new Set([
    "DOI",
    "title",
    "author",
    "published",
    "type",
    "container-title",
    "publisher",
    "is-referenced-by-count",
    "score",
    "abstract",
  ]);
  const items = value?.split(",") ?? [];
  if (items.length < 1 || items.length > allowed.size || !items.includes("DOI") || items.some((item) => !allowed.has(item))) {
    denied("select fields");
  }
}

function validateWorksQuery(params) {
  exactKeys(params, [
    "query",
    "query.bibliographic",
    "query.title",
    "query.author",
    "query.container-title",
    "rows",
    "offset",
    "cursor",
    "sort",
    "order",
    "filter",
    "select",
  ]);
  for (const key of ["query", "query.bibliographic", "query.title", "query.author", "query.container-title"]) {
    textParam(params, key, 500);
  }
  integerParam(params, "rows", MAX_ROWS);
  integerParam(params, "offset", 9_999);
  textParam(params, "cursor", 2_048);
  if (params.has("cursor") && params.has("offset")) denied("cursor and offset conflict");
  if (params.has("sort") && ![
    "relevance",
    "score",
    "is-referenced-by-count",
    "published",
    "published-print",
    "published-online",
    "deposited",
    "indexed",
    "created",
    "updated",
    "references-count",
  ].includes(params.get("sort"))) denied("sort value");
  if (params.has("order") && !["asc", "desc"].includes(params.get("order"))) denied("order value");
  if (params.has("filter")) validateFilter(params.get("filter"));
  if (params.has("select")) validateSelect(params.get("select"));
}

function authorize(input, init = {}) {
  if (typeof input !== "string" && !(input instanceof URL)) denied("Request-object input");
  const url = new URL(input.toString());
  if (
    url.origin !== ORIGIN
    || url.protocol !== "https:"
    || url.hostname !== "api.crossref.org"
    || url.port
    || url.username
    || url.password
    || url.hash
  ) denied(`network destination ${url.origin}`);
  if (url.search.length > QUERY_LIMIT) denied("oversized query string");

  const method = String(init.method ?? "GET").toUpperCase();
  if (method !== "GET" || init.body != null) denied(`method ${method}`);
  const headers = new Headers(init.headers);
  for (const key of headers.keys()) {
    if (!["accept", "accept-encoding", "user-agent"].includes(key.toLowerCase())) denied(`header ${key}`);
  }
  for (const key of ["authorization", "cookie", "proxy-authorization", "x-api-key"]) {
    if (headers.has(key)) denied(`credential header ${key}`);
  }
  const userAgent = headers.get("user-agent");
  if (userAgent && userAgent !== "crossref-mcp-server/0.2.0") denied("user-agent value");

  const pathname = url.pathname;
  const params = url.searchParams;
  if (pathname === "/works") {
    validateWorksQuery(params);
  } else if (pathname.startsWith("/works/")) {
    decodedSegment(pathname.slice("/works/".length), "DOI", /^10\.\d{4,9}\/\S+$/, 220);
    if (url.search) denied("query on work detail path");
  } else if (pathname === "/journals") {
    exactKeys(params, ["query", "rows"]);
    textParam(params, "query", 500);
    integerParam(params, "rows", MAX_ROWS);
  } else {
    const journalWorks = /^\/journals\/([^/]+)\/works$/.exec(pathname);
    const journalDetail = /^\/journals\/([^/]+)$/.exec(pathname);
    const funderWorks = /^\/funders\/([^/]+)\/works$/.exec(pathname);
    const funderDetail = /^\/funders\/([^/]+)$/.exec(pathname);
    const memberDetail = /^\/members\/([^/]+)$/.exec(pathname);
    const prefixDetail = /^\/prefixes\/([^/]+)$/.exec(pathname);
    if (journalWorks) {
      decodedSegment(journalWorks[1], "ISSN", /^\d{4}-?\d{3}[\dX]$/i, 9);
      exactKeys(params, ["rows", "sort", "order"]);
      integerParam(params, "rows", MAX_ROWS);
      if (params.get("sort") !== "published" || params.get("order") !== "desc") denied("journal works ordering");
    } else if (journalDetail) {
      decodedSegment(journalDetail[1], "ISSN", /^\d{4}-?\d{3}[\dX]$/i, 9);
      if (url.search) denied("query on journal detail path");
    } else if (pathname === "/funders") {
      exactKeys(params, ["query", "rows"]);
      textParam(params, "query", 500);
      integerParam(params, "rows", MAX_ROWS);
    } else if (funderWorks) {
      decodedSegment(funderWorks[1], "funder", /^10\.13039\/\d{1,18}$/, 40);
      exactKeys(params, ["rows", "sort", "order"]);
      integerParam(params, "rows", MAX_ROWS);
      if (params.get("sort") !== "published" || params.get("order") !== "desc") denied("funder works ordering");
    } else if (funderDetail) {
      decodedSegment(funderDetail[1], "funder", /^10\.13039\/\d{1,18}$/, 40);
      if (url.search) denied("query on funder detail path");
    } else if (memberDetail) {
      decodedSegment(memberDetail[1], "member", /^\d{1,10}$/, 10);
      if (url.search) denied("query on member detail path");
    } else if (prefixDetail) {
      decodedSegment(prefixDetail[1], "prefix", /^10\.\d{4,9}$/, 12);
      if (url.search) denied("query on prefix detail path");
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
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("json") && !(response.status >= 400 && contentType.includes("text/plain"))) {
    denied("unexpected response content type");
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > RESPONSE_LIMIT) denied("oversized response");
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    totalBytes += value.byteLength;
    if (bytes > RESPONSE_LIMIT || totalBytes > TOTAL_LIMIT) {
      await reader.cancel().catch(() => undefined);
      denied("oversized response");
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
  const approved = authorize(input, init);
  return scope.run(token, async () => bounded(await nativeFetch(approved.url, approved.init), approved.url));
};
globalThis.WebSocket = class {
  constructor() {
    denied("WebSocket access");
  }
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

const scoped = (label, native) => (...args) => {
  if (scope.getStore() !== token) denied(label);
  return native(...args);
};
net.connect = scoped("socket access", nativeNetConnect);
net.createConnection = scoped("socket access", nativeNetCreateConnection);
tls.connect = scoped("TLS access", nativeTlsConnect);
dns.lookup = (hostname, ...args) => {
  if (scope.getStore() !== token || hostname !== "api.crossref.org") denied("DNS access");
  return nativeDnsLookup(hostname, ...args);
};
dnsPromises.lookup = (hostname, ...args) => {
  if (scope.getStore() !== token || hostname !== "api.crossref.org") denied("DNS access");
  return nativeDnsPromisesLookup(hostname, ...args);
};
workerThreads.Worker = class {
  constructor() {
    denied("worker access");
  }
};
syncBuiltinESMExports();

function denyFilesystem() {
  for (const name of guardedReadMethods) {
    if (typeof fs[name] === "function") fs[name] = () => denied("filesystem access");
  }
  for (const name of ["access", "lstat", "open", "readFile", "readdir", "readlink", "realpath", "stat"]) {
    if (typeof fsPromises[name] === "function") fsPromises[name] = async () => denied("filesystem access");
  }
  syncBuiltinESMExports();
}

function installStructuredErrorCompatibilityShim() {
  const nativeWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, encoding, callback) => {
    const text = Buffer.isBuffer(chunk)
      ? chunk.toString(typeof encoding === "string" ? encoding : "utf8")
      : String(chunk);
    const transformed = text.split("\n").map((line) => {
      if (!line) return line;
      try {
        const message = JSON.parse(line);
        if (message?.result?.isError === true && message.result.structuredContent !== undefined) {
          // MCP SDK 1.29 validates structured error payloads against the success output schema.
          // Keep the upstream human-readable error while omitting only the incompatible error body.
          delete message.result.structuredContent;
          return JSON.stringify(message);
        }
      } catch {
        // Non-protocol stdout is preserved verbatim; the pinned server emits newline-delimited JSON-RPC.
      }
      return line;
    }).join("\n");
    const output = Buffer.isBuffer(chunk) ? Buffer.from(transformed, "utf8") : transformed;
    if (typeof encoding === "function") return nativeWrite(output, encoding);
    return nativeWrite(output, encoding, callback);
  };
}

if (securityProbe) {
  denyFilesystem();
  const check = async (operation) => {
    try {
      await operation();
      return false;
    } catch (error) {
      return error instanceof Error && error.message.includes("Agent-OPT Crossref sandbox denied");
    }
  };
  const approved = authorize(
    "https://api.crossref.org/works?query.title=Array%20programming%20with%20NumPy&rows=2&select=DOI%2Ctitle",
  );
  const hostCandidate = process.platform === "win32" ? "C:\\Windows\\win.ini" : "/etc/passwd";
  process.stdout.write(JSON.stringify({
    packagePinned: packageJson.name === "@cyanheads/crossref-mcp-server" && packageJson.version === "0.2.0",
    fixedOriginAccepted: approved.url.origin === ORIGIN,
    redirectRejected: approved.init.redirect === "error" && approved.init.credentials === "omit",
    customHostDenied: await check(() => globalThis.fetch("https://example.com/works?rows=1")),
    customPathDenied: await check(() => globalThis.fetch("https://api.crossref.org/admin")),
    queryKeyDenied: await check(() => globalThis.fetch("https://api.crossref.org/works?rows=1&base_url=https://example.com")),
    methodDenied: await check(() => globalThis.fetch("https://api.crossref.org/works?rows=1", { method: "POST" })),
    requestObjectDenied: await check(() => globalThis.fetch(new Request("https://api.crossref.org/works?rows=1"))),
    credentialHeaderDenied: await check(() => globalThis.fetch("https://api.crossref.org/works?rows=1", { headers: { Authorization: "Bearer x" } })),
    hostReadDenied: await check(() => fsPromises.readFile(hostCandidate, "utf8")),
    writeDenied: await check(() => fsPromises.writeFile(path.join(runtimeRoot, "probe.txt"), "x")),
    subprocessDenied: await check(() => childProcess.spawn(process.execPath, ["--version"])),
    workerDenied: await check(() => new workerThreads.Worker("")),
    baseUrlForced: process.env.CROSSREF_BASE_URL === ORIGIN,
    mailtoRemoved: process.env.CROSSREF_MAILTO === undefined,
    proxyRemoved: process.env.HTTPS_PROXY === undefined && process.env.NODE_USE_ENV_PROXY === undefined,
    credentialRemoved: process.env.NPM_TOKEN === undefined && process.env.OPENAI_API_KEY === undefined,
  }));
} else {
  installStructuredErrorCompatibilityShim();
  process.argv = [process.execPath, entry];
  await import("sanitize-html");
  await import(pathToFileURL(entry).href);
  denyFilesystem();
}

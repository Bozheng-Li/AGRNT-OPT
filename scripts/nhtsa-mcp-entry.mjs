/** Security bootstrap for the exact @cyanheads/nhtsa-vehicle-safety-mcp-server 0.8.4 STDIO server. */

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

const NHTSA_ORIGIN = "https://api.nhtsa.gov";
const VPIC_ORIGIN = "https://vpic.nhtsa.dot.gov";
const ALLOWED_HOSTS = new Set(["api.nhtsa.gov", "vpic.nhtsa.dot.gov"]);
const RESPONSE_LIMIT = 8 * 1024 * 1024;
const TOTAL_LIMIT = 24 * 1024 * 1024;
const QUERY_LIMIT = 8 * 1024;
const REQUEST_LIMIT = 64;
const MAX_BATCH_VINS = 10;
const CURRENT_YEAR = new Date().getUTCFullYear() + 1;
const denied = (capability) => { throw new Error(`Agent-OPT NHTSA sandbox denied ${capability}`); };

const packageInput = process.env.AGENT_OPT_NHTSA_PACKAGE_ROOT;
const runtimeInput = process.env.AGENT_OPT_NHTSA_RUNTIME_ROOT;
const securityProbe = process.env.AGENT_OPT_NHTSA_SECURITY_PROBE === "1";
if (!packageInput || !runtimeInput) throw new Error("NHTSA bootstrap requires package and runtime roots");

const packageRoot = fs.realpathSync(path.resolve(packageInput));
const runtimeRoot = fs.realpathSync(path.resolve(runtimeInput));
const moduleRoot = fs.realpathSync(path.resolve(packageRoot, "..", ".."));
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
if (packageJson.name !== "@cyanheads/nhtsa-vehicle-safety-mcp-server" || packageJson.version !== "0.8.4") {
  throw new Error("NHTSA bootstrap requires exact @cyanheads/nhtsa-vehicle-safety-mcp-server 0.8.4");
}
if (Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) !== 24) {
  throw new Error("NHTSA bootstrap requires Node.js 24");
}
const entry = path.join(packageRoot, "dist", "index.js");
if (!fs.existsSync(entry)) throw new Error("NHTSA upstream entry is missing");

const nativeFetch = globalThis.fetch.bind(globalThis);
const nativeRealpathSync = fs.realpathSync.bind(fs);
const nativeNetConnect = net.connect.bind(net);
const nativeNetCreateConnection = net.createConnection.bind(net);
const nativeTlsConnect = tls.connect.bind(tls);
const nativeDnsLookup = dns.lookup.bind(dns);
const nativeDnsPromisesLookup = dnsPromises.lookup.bind(dnsPromises);
const scope = new AsyncLocalStorage();
const token = Object.freeze({ network: "nhtsa-fixed-origins" });
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
    if (error instanceof Error && error.message.includes("Agent-OPT NHTSA sandbox denied")) throw error;
  }
  return target;
};

const readMethods = [
  "access", "accessSync", "existsSync", "lstat", "lstatSync", "readFile", "readFileSync", "readdir", "readdirSync",
  "readlink", "readlinkSync", "realpath", "realpathSync", "stat", "statSync", "statfs", "statfsSync", "opendir", "opendirSync",
  "createReadStream",
];
for (const name of readMethods) {
  const original = fs[name];
  if (typeof original === "function") fs[name] = function guardedRead(target, ...args) { return original.call(this, safeReadPath(target), ...args); };
}
for (const name of ["access", "lstat", "readFile", "readdir", "readlink", "realpath", "stat", "statfs", "opendir"]) {
  const original = fsPromises[name];
  if (typeof original === "function") fsPromises[name] = async function guardedRead(target, ...args) { return original.call(this, safeReadPath(target), ...args); };
}
const readOnlyFlags = (flags) => {
  if (typeof flags === "string") return ["r", "rs", "sr"].includes(flags);
  if (typeof flags !== "number") return false;
  const writeMask = fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND;
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
  "appendFile", "appendFileSync", "chmod", "chmodSync", "copyFile", "copyFileSync", "cp", "cpSync", "createWriteStream",
  "link", "linkSync", "mkdir", "mkdirSync", "mkdtemp", "mkdtempSync", "rename", "renameSync", "rm", "rmSync",
  "rmdir", "rmdirSync", "symlink", "symlinkSync", "truncate", "truncateSync", "unlink", "unlinkSync", "writeFile", "writeFileSync",
]) {
  if (typeof fs[name] === "function") fs[name] = () => denied(`filesystem ${name}`);
  if (typeof fsPromises[name] === "function") fsPromises[name] = async () => denied(`filesystem ${name}`);
}
for (const name of ["glob", "globSync", "openAsBlob", "watch", "watchFile"]) {
  if (typeof fs[name] === "function") fs[name] = () => denied(`filesystem ${name}`);
  if (typeof fsPromises[name] === "function") fsPromises[name] = async () => denied(`filesystem ${name}`);
}

for (const key of Object.keys(process.env)) {
  if (/(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|PRIVATE_?KEY|ACCESS_?KEY)(?:$|_)/i.test(key)
    || /^(?:HTTP|HTTPS|ALL|NO)_PROXY$/i.test(key)
    || /^(?:npm_config_.*proxy|GIT_ASKPASS|SSH_AUTH_SOCK)$/i.test(key)
    || /^(?:NHTSA|VPIC|ODI)_/i.test(key)) delete process.env[key];
}
for (const key of [
  "AGENT_OPT_NHTSA_PACKAGE_ROOT", "AGENT_OPT_NHTSA_RUNTIME_ROOT", "MCP_PUBLIC_URL", "MCP_HTTP_HOST", "MCP_HTTP_PORT",
  "MCP_HTTP_ENDPOINT_PATH", "MCP_AUTH_MODE", "NODE_USE_ENV_PROXY", "NODE_OPTIONS", "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
]) delete process.env[key];
Object.assign(process.env, {
  MCP_TRANSPORT_TYPE: "stdio", MCP_LOG_LEVEL: "emerg", STORAGE_PROVIDER_TYPE: "in-memory", IS_SERVERLESS: "true",
  OTEL_ENABLED: "false", NO_COLOR: "1", NODE_ENV: "production",
});

function exactKeys(params, allowed) {
  const permitted = new Set(allowed);
  for (const key of params.keys()) if (!permitted.has(key) || params.getAll(key).length !== 1) denied(`query parameter ${key}`);
}

function cleanText(value, label, maximum) {
  if (!value || value !== value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)
    || !/^[\p{L}\p{N}][\p{L}\p{N} .,'&()+\/_-]*$/u.test(value) || value.includes("..")) denied(label);
  return value;
}

function decodedSegment(raw, label, maximum) {
  if (!raw || raw.includes("/") || raw.length > maximum * 3) denied(`${label} path`);
  let value;
  try { value = decodeURIComponent(raw); } catch { denied(`malformed ${label} path`); }
  return cleanText(value, `${label} path`, maximum);
}

function yearValue(value, minimum = 1900) {
  if (!/^\d{4}$/.test(value ?? "")) denied("model year");
  const year = Number(value);
  if (year < minimum || year > CURRENT_YEAR) denied("model year");
  return year;
}

function positiveInteger(value, label, maximum) {
  if (!/^\d+$/.test(value ?? "") || Number(value) < 1 || Number(value) > maximum) denied(label);
}

function validateVehicleQuery(params) {
  exactKeys(params, ["make", "model", "modelYear"]);
  cleanText(params.get("make"), "make query", 80);
  cleanText(params.get("model"), "model query", 120);
  yearValue(params.get("modelYear"));
}

function validateVin(value) {
  if (!value || value.length > 17 || !/^[A-HJ-NPR-Z0-9*]{1,17}$/i.test(value)) denied("VIN");
  return value.toUpperCase();
}

function validateBatchBody(body) {
  if (typeof body !== "string" || Buffer.byteLength(body, "utf8") > 1_024) denied("batch body");
  const params = new URLSearchParams(body);
  exactKeys(params, ["DATA", "format"]);
  if (params.get("format") !== "json") denied("batch response format");
  const entries = (params.get("DATA") ?? "").split(";");
  if (entries.length < 1 || entries.length > MAX_BATCH_VINS) denied("batch VIN count");
  const seen = new Set();
  for (const entry of entries) {
    const parts = entry.split(",");
    if (parts.length < 1 || parts.length > 2) denied("batch VIN entry");
    const vin = validateVin(parts[0]);
    if (seen.has(vin)) denied("duplicate batch VIN");
    seen.add(vin);
    if (parts.length === 2) yearValue(parts[1]);
  }
}

function authorize(input, init = {}) {
  if (typeof input !== "string" && !(input instanceof URL)) denied("Request-object input");
  const url = new URL(input.toString());
  const origin = url.origin === NHTSA_ORIGIN ? "nhtsa" : url.origin === VPIC_ORIGIN ? "vpic" : undefined;
  if (!origin || url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname) || url.port || url.username || url.password || url.hash) {
    denied(`network destination ${url.origin}`);
  }
  if (url.search.length > QUERY_LIMIT) denied("oversized query string");
  const method = String(init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  for (const key of headers.keys()) if (!["accept", "content-type"].includes(key.toLowerCase())) denied(`header ${key}`);
  for (const key of ["authorization", "cookie", "proxy-authorization", "x-api-key"]) if (headers.has(key)) denied(`credential header ${key}`);
  if (headers.has("accept") && !/^application\/json(?:\s*,\s*\*\/\*)?$/i.test(headers.get("accept") ?? "")) denied("Accept header");

  const pathname = url.pathname;
  const params = url.searchParams;
  let approvedMethod = "GET";
  if (origin === "nhtsa") {
    if (method !== "GET" || init.body != null || headers.has("content-type")) denied(`method ${method}`);
    if (pathname === "/recalls/recallsByVehicle" || pathname === "/complaints/complaintsByVehicle") {
      validateVehicleQuery(params);
    } else if (pathname === "/recalls/campaignNumber") {
      exactKeys(params, ["campaignNumber"]);
      if (!/^\d{2}[A-Z]\d{6}$/i.test(params.get("campaignNumber") ?? "")) denied("campaign number");
    } else {
      const variant = /^\/SafetyRatings\/modelyear\/(\d{4})\/make\/([^/]+)\/model\/([^/]+)$/.exec(pathname);
      const detail = /^\/SafetyRatings\/VehicleId\/(\d+)$/.exec(pathname);
      if (variant) {
        if (url.search) denied("query on safety-rating variant path");
        yearValue(variant[1], 1990);
        decodedSegment(variant[2], "make", 80);
        decodedSegment(variant[3], "model", 120);
      } else if (detail) {
        if (url.search) denied("query on safety-rating detail path");
        positiveInteger(detail[1], "vehicle ID", 100_000_000);
      } else {
        denied(`path ${pathname}`);
      }
    }
  } else {
    const singleVin = /^\/api\/vehicles\/DecodeVinValues\/([^/]+)$/.exec(pathname);
    const modelsByYear = /^\/api\/vehicles\/GetModelsForMakeYear\/make\/([^/]+)\/modelyear\/(\d{4})$/.exec(pathname);
    const models = /^\/api\/vehicles\/GetModelsForMake\/([^/]+)$/.exec(pathname);
    const manufacturer = /^\/api\/vehicles\/GetManufacturerDetails\/([^/]+)$/.exec(pathname);
    if (pathname === "/api/vehicles/DecodeVINValuesBatch/") {
      if (method !== "POST" || url.search) denied(`method ${method}`);
      if ((headers.get("content-type") ?? "").toLowerCase() !== "application/x-www-form-urlencoded") denied("batch content type");
      validateBatchBody(init.body);
      approvedMethod = "POST";
    } else {
      if (method !== "GET" || init.body != null || headers.has("content-type")) denied(`method ${method}`);
      if (singleVin) {
        let decodedVin;
        try { decodedVin = decodeURIComponent(singleVin[1]); } catch { denied("malformed VIN path"); }
        validateVin(decodedVin);
        exactKeys(params, ["format", "modelyear"]);
        if (params.get("format") !== "json") denied("response format");
        if (params.has("modelyear")) yearValue(params.get("modelyear"));
      } else if (pathname === "/api/vehicles/GetAllMakes") {
        exactKeys(params, ["format"]);
        if (params.get("format") !== "json") denied("response format");
      } else if (modelsByYear) {
        decodedSegment(modelsByYear[1], "make", 80);
        yearValue(modelsByYear[2]);
        exactKeys(params, ["format"]);
        if (params.get("format") !== "json") denied("response format");
      } else if (models || manufacturer) {
        decodedSegment((models ?? manufacturer)[1], manufacturer ? "manufacturer" : "make", manufacturer ? 120 : 80);
        exactKeys(params, ["format"]);
        if (params.get("format") !== "json") denied("response format");
      } else {
        denied(`path ${pathname}`);
      }
    }
  }
  requestCount += 1;
  if (requestCount > REQUEST_LIMIT) denied("request count");
  return { url, init: { ...init, method: approvedMethod, redirect: "error", credentials: "omit" } };
}

async function bounded(response, requested) {
  if (response.redirected || !response.url || response.url !== requested.toString()) denied("redirect or response URL change");
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (response.ok ? !contentType.includes("json") : !(contentType.includes("json") || contentType.startsWith("text/"))) {
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
net.createServer = () => denied("socket server access");
tls.createServer = () => denied("TLS server access");
const scoped = (label, native) => (...args) => { if (scope.getStore() !== token) denied(label); return native(...args); };
net.connect = scoped("socket access", nativeNetConnect);
net.createConnection = scoped("socket access", nativeNetCreateConnection);
tls.connect = scoped("TLS access", nativeTlsConnect);
dns.lookup = (hostname, ...args) => {
  if (scope.getStore() !== token || !ALLOWED_HOSTS.has(hostname)) denied("DNS access");
  return nativeDnsLookup(hostname, ...args);
};
dnsPromises.lookup = (hostname, ...args) => {
  if (scope.getStore() !== token || !ALLOWED_HOSTS.has(hostname)) denied("DNS access");
  return nativeDnsPromisesLookup(hostname, ...args);
};
workerThreads.Worker = class { constructor() { denied("worker access"); } };
syncBuiltinESMExports();

function denyFilesystem() {
  for (const name of readMethods) if (typeof fs[name] === "function") fs[name] = () => denied("filesystem access");
  for (const name of ["open", "openSync"]) if (typeof fs[name] === "function") fs[name] = () => denied("filesystem access");
  for (const name of ["access", "lstat", "open", "readFile", "readdir", "readlink", "realpath", "stat", "statfs", "opendir", "glob", "openAsBlob"]) {
    if (typeof fsPromises[name] === "function") fsPromises[name] = async () => denied("filesystem access");
  }
  syncBuiltinESMExports();
}

function installStructuredErrorCompatibilityShim() {
  const nativeWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, encoding, callback) => {
    const source = Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === "string" ? encoding : "utf8") : String(chunk);
    const transformed = source.split("\n").map((line) => {
      if (!line) return line;
      try {
        const message = JSON.parse(line);
        if (message?.result?.isError === true && message.result.structuredContent !== undefined) {
          delete message.result.structuredContent;
          return JSON.stringify(message);
        }
      } catch {
        // Preserve non-protocol output verbatim; the pinned server uses newline-delimited JSON-RPC.
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
    try { await operation(); return false; }
    catch (error) { return error instanceof Error && error.message.includes("Agent-OPT NHTSA sandbox denied"); }
  };
  const apiApproved = authorize(`${NHTSA_ORIGIN}/recalls/campaignNumber?campaignNumber=24V064000`);
  const vpicApproved = authorize(`${VPIC_ORIGIN}/api/vehicles/DecodeVinValues/1HGCM82633A004352?format=json`);
  const batchApproved = authorize(`${VPIC_ORIGIN}/api/vehicles/DecodeVINValuesBatch/`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "DATA=1HGCM82633A004352&format=json",
  });
  const elevenVins = Array.from({ length: 11 }, (_, index) => `1HGCM82633A0043${String(index).padStart(2, "0")}`).join(";");
  const hostCandidate = process.platform === "win32" ? "C:\\Windows\\win.ini" : "/etc/passwd";
  process.stdout.write(JSON.stringify({
    packagePinned: packageJson.name === "@cyanheads/nhtsa-vehicle-safety-mcp-server" && packageJson.version === "0.8.4",
    node24: Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) === 24,
    apiOriginAccepted: apiApproved.url.origin === NHTSA_ORIGIN,
    vpicOriginAccepted: vpicApproved.url.origin === VPIC_ORIGIN,
    batchPostAccepted: batchApproved.init.method === "POST",
    redirectForced: apiApproved.init.redirect === "error" && apiApproved.init.credentials === "omit",
    investigationDownloadDenied: await check(() => globalThis.fetch("https://static.nhtsa.gov/odi/ffdd/inv/FLAT_INV.zip")),
    customHostDenied: await check(() => globalThis.fetch("https://example.com/recalls/campaignNumber?campaignNumber=24V064000")),
    customPathDenied: await check(() => globalThis.fetch(`${NHTSA_ORIGIN}/admin`)),
    vehicleTypesPathDenied: await check(() => globalThis.fetch(`${VPIC_ORIGIN}/api/vehicles/GetVehicleTypesForMake/HONDA?format=json`)),
    customQueryDenied: await check(() => globalThis.fetch(`${NHTSA_ORIGIN}/recalls/campaignNumber?campaignNumber=24V064000&proxy=https://example.com`)),
    methodDenied: await check(() => globalThis.fetch(`${NHTSA_ORIGIN}/recalls/campaignNumber?campaignNumber=24V064000`, { method: "POST" })),
    oversizedBatchDenied: await check(() => globalThis.fetch(`${VPIC_ORIGIN}/api/vehicles/DecodeVINValuesBatch/`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `DATA=${elevenVins}&format=json`,
    })),
    requestObjectDenied: await check(() => globalThis.fetch(new Request(`${NHTSA_ORIGIN}/recalls/campaignNumber?campaignNumber=24V064000`))),
    credentialHeaderDenied: await check(() => globalThis.fetch(`${NHTSA_ORIGIN}/recalls/campaignNumber?campaignNumber=24V064000`, { headers: { Authorization: "Bearer x" } })),
    hostReadDenied: await check(() => fsPromises.readFile(hostCandidate, "utf8")),
    hostOpenDenied: await check(() => fsPromises.open(hostCandidate, "r")),
    hostDirectoryDenied: await check(() => fsPromises.opendir(path.dirname(hostCandidate))),
    writeDenied: await check(() => fsPromises.writeFile(path.join(runtimeRoot, "probe.txt"), "x")),
    subprocessDenied: await check(() => childProcess.spawn(process.execPath, ["--version"])),
    workerDenied: await check(() => new workerThreads.Worker("")),
    proxyRemoved: process.env.HTTPS_PROXY === undefined && process.env.NODE_USE_ENV_PROXY === undefined,
    credentialRemoved: process.env.NPM_TOKEN === undefined && process.env.OPENAI_API_KEY === undefined,
    customEndpointEnvRemoved: process.env.NHTSA_BASE_URL === undefined && process.env.VPIC_BASE_URL === undefined,
  }));
} else {
  installStructuredErrorCompatibilityShim();
  process.argv = [process.execPath, entry];
  await import("sanitize-html");
  await import(pathToFileURL(entry).href);
  denyFilesystem();
}

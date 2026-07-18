/** Security bootstrap for the exact @starfetch-js/mcp 0.2.3 STDIO server. */

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

const RESPONSE_LIMIT = 16 * 1024 * 1024;
const TOTAL_LIMIT = 32 * 1024 * 1024;
const REQUEST_LIMIT = 96 * 1024;
const ALLOWED = new Map([
  ["https://exoplanetarchive.ipac.caltech.edu", ["/TAP"]],
  ["https://gea.esac.esa.int", ["/tap-server/tap"]],
  ["https://irsa.ipac.caltech.edu", ["/TAP"]],
  ["https://simbad.cds.unistra.fr", ["/simbad/sim-tap"]],
  ["https://tapvizier.cds.unistra.fr", ["/TAPVizieR/tap"]],
  ["https://dc.g-vo.org", ["/tap"]],
]);

const denied = (capability) => { throw new Error(`Agent-OPT Starfetch sandbox denied ${capability}`); };
const packageInput = process.env.AGENT_OPT_STARFETCH_PACKAGE_ROOT;
const moduleInput = process.env.AGENT_OPT_STARFETCH_MODULE_ROOT;
if (!packageInput || !moduleInput) throw new Error("Starfetch bootstrap requires package roots");
const packageRoot = fs.realpathSync(path.resolve(packageInput));
const moduleRoot = fs.realpathSync(path.resolve(moduleInput));
const packageJsonPath = path.join(packageRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
if (packageJson.name !== "@starfetch-js/mcp" || packageJson.version !== "0.2.3") {
  throw new Error("Starfetch bootstrap requires exact @starfetch-js/mcp 0.2.3");
}
const entry = path.join(packageRoot, "dist", "index.js");
if (!fs.existsSync(entry)) throw new Error("Starfetch upstream entry is missing");

const proxyValue = process.env.HTTPS_PROXY?.trim() || process.env.https_proxy?.trim();
let proxyHostname;
if (proxyValue) {
  const proxy = new URL(proxyValue);
  if (!["http:", "https:"].includes(proxy.protocol) || !proxy.hostname || proxy.username || proxy.password || proxy.search || proxy.hash || proxy.pathname !== "/") {
    throw new Error("Agent-OPT Starfetch sandbox denied invalid proxy");
  }
  proxyHostname = proxy.hostname;
}

const nativeFetch = globalThis.fetch.bind(globalThis);
const nativeNetConnect = net.connect.bind(net);
const nativeNetCreateConnection = net.createConnection.bind(net);
const nativeTlsConnect = tls.connect.bind(tls);
const nativeDnsLookup = dns.lookup.bind(dns);
const nativeDnsPromisesLookup = dnsPromises.lookup.bind(dnsPromises);
const scope = new AsyncLocalStorage();
const token = Object.freeze({ network: "starfetch" });
let totalBytes = 0;

const within = (root, target) => {
  const relative = path.relative(root, path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
const safeReadPath = (target) => {
  if (typeof target === "number") return target;
  if (target instanceof URL) target = fileURLToPath(target);
  if (!within(moduleRoot, String(target))) denied("host filesystem read");
  return target;
};
for (const name of ["accessSync", "existsSync", "lstatSync", "openSync", "readFileSync", "readdirSync", "realpathSync", "statSync", "readlinkSync"]) {
  const original = fs[name];
  if (typeof original === "function") fs[name] = function guardedRead(target, ...args) { return original.call(this, safeReadPath(target), ...args); };
}
for (const name of ["appendFileSync", "chmodSync", "copyFileSync", "cpSync", "linkSync", "mkdirSync", "mkdtempSync", "renameSync", "rmSync", "rmdirSync", "symlinkSync", "truncateSync", "unlinkSync", "writeFileSync"]) {
  if (typeof fs[name] === "function") fs[name] = () => denied(`filesystem ${name}`);
}
for (const name of ["access", "lstat", "readFile", "readdir", "readlink", "realpath", "stat"]) {
  const original = fsPromises[name];
  if (typeof original === "function") fsPromises[name] = async function guardedRead(target, ...args) { return original.call(this, safeReadPath(target), ...args); };
}
for (const name of ["appendFile", "chmod", "copyFile", "cp", "link", "mkdir", "mkdtemp", "open", "rename", "rm", "rmdir", "symlink", "truncate", "unlink", "writeFile"]) {
  if (typeof fsPromises[name] === "function") fsPromises[name] = async () => denied(`filesystem ${name}`);
}

for (const key of Object.keys(process.env)) {
  if (
    /(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|PRIVATE_?KEY|ACCESS_?KEY)(?:$|_)/i.test(key) ||
    /^(?:HTTP|HTTPS|ALL|NO)_PROXY$/i.test(key) || /^(?:npm_config_.*proxy|GIT_ASKPASS|SSH_AUTH_SOCK)$/i.test(key)
  ) delete process.env[key];
}
for (const key of ["NODE_USE_ENV_PROXY", "NODE_OPTIONS", "AGENT_OPT_STARFETCH_PACKAGE_ROOT", "AGENT_OPT_STARFETCH_MODULE_ROOT"]) delete process.env[key];

function authorize(input, init = {}) {
  if (typeof input !== "string" && !(input instanceof URL)) denied("Request-object input");
  const url = new URL(input.toString());
  const roots = ALLOWED.get(url.origin);
  if (url.protocol !== "https:" || !roots || url.port || url.username || url.password || url.hash) denied(`network destination ${url.origin}`);
  let decodedPath;
  try { decodedPath = decodeURIComponent(url.pathname); } catch { denied("malformed URL path"); }
  if (!roots.some((root) => decodedPath === root || decodedPath.startsWith(`${root}/`))) denied(`path ${url.pathname}`);
  const method = String(init.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "DELETE"].includes(method)) denied(`method ${method}`);
  if (method !== "POST" && init.body != null) denied(`body on ${method}`);
  const headers = new Headers(init.headers);
  for (const key of headers.keys()) {
    if (!["accept", "accept-encoding", "content-type", "user-agent"].includes(key.toLowerCase())) denied(`header ${key}`);
  }
  for (const key of ["authorization", "cookie", "proxy-authorization", "x-api-key"]) if (headers.has(key)) denied(`credential header ${key}`);
  if (init.body != null) {
    const size = init.body instanceof URLSearchParams ? Buffer.byteLength(init.body.toString(), "utf8") :
      typeof init.body === "string" ? Buffer.byteLength(init.body, "utf8") : REQUEST_LIMIT + 1;
    if (size > REQUEST_LIMIT) denied("oversized request body");
  }
  return { url, init: { ...init, method, redirect: "manual", credentials: "omit" } };
}

async function bounded(response, requested) {
  if (response.redirected) denied("automatic redirect");
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
  const headers = new Headers(response.headers);
  headers.set("x-agent-opt-request-origin", requested.origin);
  return new Response(Buffer.concat(chunks, bytes), { status: response.status, statusText: response.statusText, headers });
}

globalThis.fetch = async (input, init = {}) => {
  const approved = authorize(input, init);
  return scope.run(token, async () => bounded(await nativeFetch(approved.url, approved.init), approved.url));
};
globalThis.WebSocket = class { constructor() { denied("WebSocket access"); } };
for (const [target, methods, label] of [
  [http, ["request", "get", "createServer"], "HTTP access"],
  [https, ["request", "get", "createServer"], "HTTPS access"],
  [dgram, ["createSocket"], "datagram access"],
  [dns, ["resolve", "resolve4", "resolve6", "resolveAny"], "DNS access"],
  [dnsPromises, ["resolve", "resolve4", "resolve6", "resolveAny"], "DNS access"],
  [childProcess, ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"], "subprocess access"],
]) for (const method of methods) target[method] = () => denied(label);
const scoped = (label, native) => (...args) => { if (scope.getStore() !== token) denied(label); return native(...args); };
net.connect = scoped("socket access", nativeNetConnect);
net.createConnection = scoped("socket access", nativeNetCreateConnection);
tls.connect = scoped("TLS access", nativeTlsConnect);
const networkHosts = new Set([...ALLOWED.keys()].map((origin) => new URL(origin).hostname));
dns.lookup = (hostname, ...args) => { if (scope.getStore() !== token || (!networkHosts.has(hostname) && hostname !== proxyHostname)) denied("DNS access"); return nativeDnsLookup(hostname, ...args); };
dnsPromises.lookup = (hostname, ...args) => { if (scope.getStore() !== token || (!networkHosts.has(hostname) && hostname !== proxyHostname)) denied("DNS access"); return nativeDnsPromisesLookup(hostname, ...args); };
workerThreads.Worker = class { constructor() { denied("worker access"); } };
syncBuiltinESMExports();

if (process.env.AGENT_OPT_STARFETCH_SECURITY_PROBE === "1") {
  const check = async (fn) => { try { await fn(); return false; } catch (error) { return error instanceof Error && error.message.includes("Agent-OPT Starfetch sandbox denied"); } };
  const approved = authorize("https://gea.esac.esa.int/tap-server/tap/availability", { method: "GET" });
  const hostCandidate = process.platform === "win32" ? "C:\\Windows\\win.ini" : "/etc/passwd";
  process.stdout.write(JSON.stringify({
    fixedTapAccepted: approved.url.origin === "https://gea.esac.esa.int" && approved.init.redirect === "manual",
    customHostDenied: await check(() => globalThis.fetch("https://example.com/tap/availability")),
    customPathDenied: await check(() => globalThis.fetch("https://gea.esac.esa.int/admin")),
    httpDenied: await check(() => http.get("http://127.0.0.1")),
    credentialHeaderDenied: await check(() => globalThis.fetch("https://gea.esac.esa.int/tap-server/tap/availability", { headers: { Authorization: "Bearer x" } })),
    hostReadDenied: await check(() => fsPromises.readFile(hostCandidate, "utf8")),
    writeDenied: await check(() => fsPromises.writeFile(path.join(packageRoot, "probe.txt"), "x")),
    subprocessDenied: await check(() => childProcess.spawn(process.execPath, ["--version"])),
    workerDenied: await check(() => new workerThreads.Worker("")),
    proxyRemoved: !process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY,
    credentialRemoved: !process.env.NPM_TOKEN && !process.env.OPENAI_API_KEY,
  }));
} else {
  process.argv = [process.execPath, entry];
  await import(pathToFileURL(entry).href);
}

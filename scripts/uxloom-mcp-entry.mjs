import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import workerThreads from "node:worker_threads";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const RESPONSE_LIMIT = 1_500_000;
const PROJECT_LIMIT = 512_000;
const requestedSessionRoot = process.env.AGENT_OPT_UXLOOM_SESSION_ROOT;
const requestedProjectPath = process.env.AGENT_OPT_UXLOOM_PROJECT_PATH;
const requestedPackageRoot = process.env.AGENT_OPT_UXLOOM_PACKAGE_ROOT;
const requestedModuleRoot = process.env.AGENT_OPT_UXLOOM_MODULE_ROOT;
const securityProbe = process.env.AGENT_OPT_UXLOOM_SECURITY_PROBE === "1";

if (!requestedSessionRoot || !requestedProjectPath || !requestedPackageRoot || !requestedModuleRoot) {
  throw new Error("Agent-OPT UXLoom sandbox configuration is incomplete");
}

const native = {
  realpathSync: fs.realpathSync.bind(fs),
  existsSync: fs.existsSync.bind(fs),
  readFileSync: fs.readFileSync.bind(fs),
  writeFileSync: fs.writeFileSync.bind(fs),
  readdirSync: fs.readdirSync.bind(fs),
  statSync: fs.statSync.bind(fs),
  lstatSync: fs.lstatSync.bind(fs),
  openSync: fs.openSync.bind(fs),
  open: fs.open.bind(fs),
  readFile: fs.readFile.bind(fs),
  createReadStream: fs.createReadStream.bind(fs),
  promisesOpen: fsPromises.open.bind(fsPromises),
  promisesReadFile: fsPromises.readFile.bind(fsPromises),
  promisesReaddir: fsPromises.readdir.bind(fsPromises),
  promisesStat: fsPromises.stat.bind(fsPromises),
  promisesLstat: fsPromises.lstat.bind(fsPromises),
  promisesAccess: fsPromises.access.bind(fsPromises),
  stdoutWrite: process.stdout.write.bind(process.stdout),
};

const sessionRoot = native.realpathSync(path.resolve(requestedSessionRoot));
const moduleRoot = native.realpathSync(path.resolve(requestedModuleRoot));
const packageRoot = native.realpathSync(path.resolve(requestedPackageRoot));
const projectPath = path.resolve(requestedProjectPath);
if (path.dirname(projectPath) !== sessionRoot || path.basename(projectPath) !== "uxloom.project.json") {
  throw new Error("Agent-OPT UXLoom project path is outside the exact session root");
}
if (!packageRoot.startsWith(`${moduleRoot}${path.sep}`)) {
  throw new Error("Agent-OPT UXLoom package root is outside node_modules");
}
if (native.existsSync(projectPath) && native.realpathSync(projectPath) !== projectPath) {
  throw new Error("Agent-OPT UXLoom project file cannot be a link");
}

const denied = (capability) => {
  throw new Error(`Agent-OPT UXLoom sandbox denied ${capability}`);
};

for (const key of [
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy",
  "NPM_TOKEN", "NODE_AUTH_TOKEN", "NPM_CONFIG_USERCONFIG", "GITHUB_TOKEN", "GH_TOKEN",
  "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET",
  "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
  "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS", "NODE_OPTIONS", "UXLOOM_PROJECT",
  "AGENT_OPT_UXLOOM_SESSION_ROOT", "AGENT_OPT_UXLOOM_PROJECT_PATH", "AGENT_OPT_UXLOOM_PACKAGE_ROOT",
  "AGENT_OPT_UXLOOM_MODULE_ROOT", "AGENT_OPT_UXLOOM_SECURITY_PROBE",
]) delete process.env[key];

function toPath(value) {
  if (value instanceof URL) return fileURLToPath(value);
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString();
  denied("non-path filesystem input");
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertReadPath(value) {
  const resolved = path.resolve(toPath(value));
  if (resolved === projectPath) {
    if (native.existsSync(resolved) && native.realpathSync(resolved) !== projectPath) denied("project link escape");
    return resolved;
  }
  if (isWithin(moduleRoot, resolved)) {
    if (native.existsSync(resolved) && !isWithin(moduleRoot, native.realpathSync(resolved))) denied("module link escape");
    return resolved;
  }
  denied(`filesystem read outside fixed roots: ${resolved}`);
}

function assertReadFlags(flags) {
  if (typeof flags === "string" && /^(?:r|rs|sr)$/.test(flags)) return;
  if (typeof flags === "number" && (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) === 0) return;
  denied("filesystem mutation through open");
}

function assertProjectWrite(target, data) {
  const resolved = path.resolve(toPath(target));
  if (resolved !== projectPath) denied("filesystem write outside the project file");
  if (native.existsSync(resolved) && native.realpathSync(resolved) !== projectPath) denied("project link escape");
  const bytes = Buffer.isBuffer(data) ? data.byteLength : Buffer.byteLength(String(data), "utf8");
  if (bytes > PROJECT_LIMIT) denied("an oversized project write");
  return resolved;
}

fs.readFileSync = (target, ...args) => native.readFileSync(assertReadPath(target), ...args);
fs.writeFileSync = (target, data, ...args) => native.writeFileSync(assertProjectWrite(target, data), data, ...args);
fs.readdirSync = (target, ...args) => native.readdirSync(assertReadPath(target), ...args);
fs.statSync = (target, ...args) => native.statSync(assertReadPath(target), ...args);
fs.lstatSync = (target, ...args) => native.lstatSync(assertReadPath(target), ...args);
fs.existsSync = (target) => native.existsSync(assertReadPath(target));
fs.openSync = (target, flags, ...args) => {
  assertReadFlags(flags);
  return native.openSync(assertReadPath(target), flags, ...args);
};
fs.open = (target, flags, ...args) => {
  assertReadFlags(flags);
  return native.open(assertReadPath(target), flags, ...args);
};
fs.readFile = (target, ...args) => native.readFile(assertReadPath(target), ...args);
fs.createReadStream = (target, ...args) => native.createReadStream(assertReadPath(target), ...args);
fsPromises.open = async (target, flags, ...args) => {
  assertReadFlags(flags);
  return native.promisesOpen(assertReadPath(target), flags, ...args);
};
fsPromises.readFile = async (target, ...args) => native.promisesReadFile(assertReadPath(target), ...args);
fsPromises.readdir = async (target, ...args) => native.promisesReaddir(assertReadPath(target), ...args);
fsPromises.stat = async (target, ...args) => native.promisesStat(assertReadPath(target), ...args);
fsPromises.lstat = async (target, ...args) => native.promisesLstat(assertReadPath(target), ...args);
fsPromises.access = async (target, ...args) => native.promisesAccess(assertReadPath(target), ...args);

for (const method of [
  "appendFileSync", "chmodSync", "chownSync", "copyFileSync", "linkSync", "mkdirSync", "mkdtempSync", "renameSync",
  "rmSync", "rmdirSync", "symlinkSync", "truncateSync", "unlinkSync", "utimesSync", "watch", "watchFile",
]) fs[method] = () => denied("filesystem mutation");
for (const method of [
  "appendFile", "chmod", "chown", "copyFile", "cp", "link", "mkdir", "mkdtemp", "rename", "rm", "rmdir",
  "symlink", "truncate", "unlink", "utimes", "writeFile",
]) fsPromises[method] = async () => denied("filesystem mutation");

globalThis.fetch = async () => denied("network access");
globalThis.WebSocket = class DeniedWebSocket { constructor() { denied("WebSocket access"); } };
for (const [target, methods, label] of [
  [http, ["request", "get"], "HTTP access"], [https, ["request", "get"], "HTTPS access"],
  [net, ["connect", "createConnection"], "socket access"], [tls, ["connect"], "TLS access"],
  [dgram, ["createSocket"], "datagram access"],
  [dns, ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"], "DNS access"],
  [dnsPromises, ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"], "DNS access"],
  [childProcess, ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"], "subprocess access"],
]) for (const method of methods) target[method] = () => denied(label);
workerThreads.Worker = class DeniedWorker { constructor() { denied("worker-thread access"); } };
process.chdir = () => denied("working-directory changes");

let stdoutBytes = 0;
process.stdout.write = (chunk, ...args) => {
  stdoutBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(String(chunk), "utf8");
  if (stdoutBytes > RESPONSE_LIMIT) denied("an oversized MCP response");
  return native.stdoutWrite(chunk, ...args);
};
syncBuiltinESMExports();

if (securityProbe) {
  const checkDenied = async (operation) => {
    try { await operation(); return false; }
    catch (error) { return error instanceof Error && error.message.includes("Agent-OPT UXLoom sandbox denied"); }
  };
  const original = native.existsSync(projectPath) ? native.readFileSync(projectPath, "utf8") : "{}\n";
  let projectWriteAllowed = false;
  try {
    fs.writeFileSync(projectPath, original, "utf8");
    projectWriteAllowed = true;
  } catch {}
  const probe = {
    projectReadAllowed: fs.readFileSync(projectPath, "utf8").length > 0,
    projectWriteAllowed,
    moduleReadAllowed: fs.readFileSync(path.join(packageRoot, "package.json"), "utf8").includes("uxloom"),
    hostReadDenied: await checkDenied(() => fs.readFileSync(process.execPath)),
    otherWriteDenied: await checkDenied(() => fs.writeFileSync(path.join(sessionRoot, "probe.json"), "{}")),
    oversizedProjectWriteDenied: await checkDenied(() => fs.writeFileSync(projectPath, "x".repeat(PROJECT_LIMIT + 1))),
    fetchDenied: await checkDenied(() => globalThis.fetch("https://example.com")),
    httpDenied: await checkDenied(() => http.get("http://127.0.0.1")),
    dnsDenied: await checkDenied(() => dns.lookup("example.com", () => undefined)),
    subprocessDenied: await checkDenied(() => childProcess.spawn(process.execPath, ["--version"])),
    workerDenied: await checkDenied(() => new workerThreads.Worker("", { eval: true })),
    proxyRemoved: process.env.HTTPS_PROXY === undefined && process.env.https_proxy === undefined,
    credentialRemoved: process.env.NPM_TOKEN === undefined && process.env.OPENAI_API_KEY === undefined,
  };
  native.stdoutWrite(JSON.stringify(probe));
} else {
  const [{ createServer, ProjectStore }, { StdioServerTransport }] = await Promise.all([
    import(pathToFileURL(path.join(packageRoot, "dist", "index.js")).href),
    import(pathToFileURL(path.join(moduleRoot, "@modelcontextprotocol", "sdk", "dist", "esm", "server", "stdio.js")).href),
  ]);
  const server = createServer(new ProjectStore(projectPath));
  await server.connect(new StdioServerTransport());
}

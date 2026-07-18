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
import { fileURLToPath, pathToFileURL } from "node:url";
import { syncBuiltinESMExports } from "node:module";

const RESPONSE_LIMIT = 1_500_000;
const bootstrapRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedSandboxRoot = process.env.AGENT_OPT_BOUNCER_SANDBOX_ROOT;
const requestedPackageRoot =
  process.env.AGENT_OPT_BOUNCER_PACKAGE_ROOT ?? path.join(bootstrapRoot, "node_modules", "@nugehs", "bouncer");
const securityProbe = process.env.AGENT_OPT_BOUNCER_SECURITY_PROBE === "1";

if (!requestedSandboxRoot) {
  throw new Error("Agent-OPT Bouncer sandbox root is required");
}

const nativeRealpathSync = fs.realpathSync.bind(fs);
const nativeExistsSync = fs.existsSync.bind(fs);
const nativeReadFileSync = fs.readFileSync.bind(fs);
const nativeReaddirSync = fs.readdirSync.bind(fs);
const nativeStatSync = fs.statSync.bind(fs);
const nativeLstatSync = fs.lstatSync.bind(fs);
const nativeOpenSync = fs.openSync.bind(fs);
const nativeOpen = fs.open.bind(fs);
const nativeReadFile = fs.readFile.bind(fs);
const nativeCreateReadStream = fs.createReadStream.bind(fs);
const nativePromisesOpen = fsPromises.open.bind(fsPromises);
const nativePromisesReadFile = fsPromises.readFile.bind(fsPromises);
const nativePromisesReaddir = fsPromises.readdir.bind(fsPromises);
const nativePromisesStat = fsPromises.stat.bind(fsPromises);
const nativePromisesLstat = fsPromises.lstat.bind(fsPromises);
const nativePromisesAccess = fsPromises.access.bind(fsPromises);
const nativeStdoutWrite = process.stdout.write.bind(process.stdout);
const sandboxRoot = nativeRealpathSync(path.resolve(requestedSandboxRoot));
const packageRoot = nativeRealpathSync(path.resolve(requestedPackageRoot));

const denied = (capability) => {
  throw new Error(`Agent-OPT Bouncer sandbox denied ${capability}`);
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
  "NODE_OPTIONS",
  "AGENT_OPT_BOUNCER_SANDBOX_ROOT",
  "AGENT_OPT_BOUNCER_PACKAGE_ROOT",
  "AGENT_OPT_BOUNCER_SECURITY_PROBE",
]) {
  delete process.env[key];
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function toPath(value) {
  if (value instanceof URL) return fileURLToPath(value);
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString();
  denied("non-path filesystem input");
}

function nearestExistingParent(target) {
  let candidate = target;
  while (!nativeExistsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) return candidate;
    candidate = parent;
  }
  return candidate;
}

function assertReadPath(value) {
  const resolved = path.resolve(toPath(value));
  const allowedRoot = [sandboxRoot, packageRoot].find((root) => isWithin(root, resolved));
  if (!allowedRoot) denied(`filesystem read outside the sandbox: ${resolved}`);

  const existing = nearestExistingParent(resolved);
  const realExisting = nativeRealpathSync(existing);
  if (!isWithin(allowedRoot, realExisting)) denied(`filesystem link escape: ${resolved}`);
  if (nativeExistsSync(resolved)) {
    const realTarget = nativeRealpathSync(resolved);
    if (!isWithin(allowedRoot, realTarget)) denied(`filesystem link escape: ${resolved}`);
  }
  return resolved;
}

function assertReadOnlyFlags(flags) {
  if (typeof flags === "string" && /^(?:r|rs|sr)$/.test(flags)) return;
  if (typeof flags === "number" && (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) === 0) return;
  denied("filesystem mutation through open");
}

fs.readFileSync = (target, ...args) => nativeReadFileSync(assertReadPath(target), ...args);
fs.readdirSync = (target, ...args) => nativeReaddirSync(assertReadPath(target), ...args);
fs.statSync = (target, ...args) => nativeStatSync(assertReadPath(target), ...args);
fs.lstatSync = (target, ...args) => nativeLstatSync(assertReadPath(target), ...args);
fs.existsSync = (target) => nativeExistsSync(assertReadPath(target));
fs.openSync = (target, flags, ...args) => {
  assertReadOnlyFlags(flags);
  return nativeOpenSync(assertReadPath(target), flags, ...args);
};
fs.open = (target, flags, ...args) => {
  assertReadOnlyFlags(flags);
  return nativeOpen(assertReadPath(target), flags, ...args);
};
fs.readFile = (target, ...args) => nativeReadFile(assertReadPath(target), ...args);
fs.createReadStream = (target, ...args) => nativeCreateReadStream(assertReadPath(target), ...args);

fsPromises.open = async (target, flags, ...args) => {
  assertReadOnlyFlags(flags);
  return nativePromisesOpen(assertReadPath(target), flags, ...args);
};
fsPromises.readFile = async (target, ...args) => nativePromisesReadFile(assertReadPath(target), ...args);
fsPromises.readdir = async (target, ...args) => nativePromisesReaddir(assertReadPath(target), ...args);
fsPromises.stat = async (target, ...args) => nativePromisesStat(assertReadPath(target), ...args);
fsPromises.lstat = async (target, ...args) => nativePromisesLstat(assertReadPath(target), ...args);
fsPromises.access = async (target, ...args) => nativePromisesAccess(assertReadPath(target), ...args);

for (const method of [
  "appendFileSync",
  "chmodSync",
  "chownSync",
  "copyFileSync",
  "linkSync",
  "mkdirSync",
  "mkdtempSync",
  "renameSync",
  "rmSync",
  "rmdirSync",
  "symlinkSync",
  "truncateSync",
  "unlinkSync",
  "utimesSync",
  "watch",
  "watchFile",
  "writeFileSync",
]) {
  fs[method] = () => denied("filesystem mutation");
}
for (const method of [
  "appendFile",
  "chmod",
  "chown",
  "copyFile",
  "cp",
  "link",
  "mkdir",
  "mkdtemp",
  "rename",
  "rm",
  "rmdir",
  "symlink",
  "truncate",
  "unlink",
  "utimes",
  "writeFile",
]) {
  fsPromises[method] = async () => denied("filesystem mutation");
}

globalThis.fetch = async () => denied("network access");
globalThis.WebSocket = class DeniedWebSocket {
  constructor() {
    denied("WebSocket access");
  }
};

for (const [target, methods, label] of [
  [http, ["request", "get"], "HTTP access"],
  [https, ["request", "get"], "HTTPS access"],
  [net, ["connect", "createConnection"], "socket access"],
  [tls, ["connect"], "TLS access"],
  [dgram, ["createSocket"], "datagram access"],
  [dns, ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"], "DNS access"],
  [dnsPromises, ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"], "DNS access"],
  [childProcess, ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"], "subprocess access"],
]) {
  for (const method of methods) target[method] = () => denied(label);
}
workerThreads.Worker = class DeniedWorker {
  constructor() {
    denied("worker-thread access");
  }
};
process.chdir = () => denied("working-directory changes");

function assertResponseChunk(chunk) {
  const bytes = Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(String(chunk), "utf8");
  if (bytes > RESPONSE_LIMIT) denied("an oversized MCP response");
}

process.stdout.write = (chunk, ...args) => {
  assertResponseChunk(chunk);
  return nativeStdoutWrite(chunk, ...args);
};

syncBuiltinESMExports();

if (securityProbe) {
  const checkDenied = async (operation) => {
    try {
      await operation();
      return false;
    } catch (error) {
      return error instanceof Error && error.message.includes("Agent-OPT Bouncer sandbox denied");
    }
  };
  const probe = {
    sandboxReadAllowed: fs.readFileSync(path.join(sandboxRoot, "bouncer.config.json"), "utf8").length > 0,
    packageReadAllowed: fs.readFileSync(path.join(packageRoot, "package.json"), "utf8").includes("@nugehs/bouncer"),
    hostReadDenied: await checkDenied(() => fs.readFileSync(process.execPath)),
    filesystemWriteDenied: await checkDenied(() => fs.writeFileSync(path.join(sandboxRoot, "probe.txt"), "blocked")),
    fetchDenied: await checkDenied(() => globalThis.fetch("https://example.com")),
    httpDenied: await checkDenied(() => http.get("http://127.0.0.1")),
    dnsDenied: await checkDenied(() => dns.lookup("example.com", () => undefined)),
    subprocessDenied: await checkDenied(() => childProcess.spawn(process.execPath, ["--version"])),
    workerDenied: await checkDenied(() => new workerThreads.Worker("", { eval: true })),
    oversizedResponseDenied: await checkDenied(() => assertResponseChunk("x".repeat(RESPONSE_LIMIT + 1))),
    proxyRemoved: process.env.HTTPS_PROXY === undefined && process.env.https_proxy === undefined,
    credentialRemoved:
      process.env.NPM_TOKEN === undefined &&
      process.env.AWS_ACCESS_KEY_ID === undefined &&
      process.env.OPENAI_API_KEY === undefined,
  };
  nativeStdoutWrite(JSON.stringify(probe));
} else {
  const entryPoint = path.join(packageRoot, "src", "lib", "mcp.js");
  const { startMcpServer } = await import(pathToFileURL(entryPoint).href);
  await startMcpServer();
}

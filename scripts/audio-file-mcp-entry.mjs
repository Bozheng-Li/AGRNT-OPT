/**
 * Read-only security bootstrap for Audio File MCP App 1.1.0.
 *
 * Agent-OPT maps an opaque upload token to one validated file inside a private
 * runtime directory. The exact upstream server still receives its native path
 * argument, while this process denies host-path reads, writes, networking,
 * subprocesses and worker creation before importing that server.
 */

import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import { pathToFileURL } from "node:url";
import workerThreads from "node:worker_threads";

function denied() {
  throw new Error("Agent-OPT disables this capability for Audio File MCP App");
}

const entryInput = process.env.AGENT_OPT_AUDIO_ENTRY;
const rootInput = process.env.AGENT_OPT_AUDIO_ROOT;
const uiInput = process.env.AGENT_OPT_AUDIO_UI;
if (!entryInput || !rootInput || !uiInput) throw new Error("Audio File MCP bootstrap is missing fixed runtime paths");

const original = {
  access: fsPromises.access.bind(fsPromises),
  lstat: fsPromises.lstat.bind(fsPromises),
  open: fsPromises.open.bind(fsPromises),
  readFile: fsPromises.readFile.bind(fsPromises),
  realpath: fsPromises.realpath.bind(fsPromises),
  stat: fsPromises.stat.bind(fsPromises),
  openCallback: fs.open.bind(fs),
  openSync: fs.openSync.bind(fs),
};

const entry = await original.realpath(path.resolve(entryInput));
const packageRoot = path.resolve(path.dirname(entry), "..", "..");
const packageJsonPath = path.join(packageRoot, "package.json");
const packageJson = JSON.parse(await original.readFile(packageJsonPath, "utf8"));
if (packageJson.name !== "@counterpoint-studio/audio-file-mcp-app" || packageJson.version !== "1.1.0") {
  throw new Error("Audio File MCP bootstrap requires the exact upstream package at 1.1.0");
}
if (entry !== await original.realpath(path.join(packageRoot, "dist", "server", "app.js"))) {
  throw new Error("Audio File MCP bootstrap entry point does not match the pinned package layout");
}
const ui = await original.realpath(path.resolve(uiInput));
if (ui !== await original.realpath(path.join(packageRoot, "dist", "mcp-app.html"))) {
  throw new Error("Audio File MCP bootstrap UI path does not match the pinned package layout");
}
const root = await original.realpath(path.resolve(rootInput));
if (!(await original.lstat(root)).isDirectory()) throw new Error("Audio File MCP runtime root is not a directory");

function normalizeCase(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function isWithin(candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function rawPath(value) {
  if (value instanceof URL) {
    if (value.protocol !== "file:") denied();
    return decodeURIComponent(value.pathname).replace(/^\/(?=[A-Za-z]:)/, "");
  }
  if (typeof value !== "string" && !Buffer.isBuffer(value)) denied();
  return String(value);
}

async function guardPath(value, allowUi = false) {
  const lexical = path.resolve(rawPath(value));
  const actual = await original.realpath(lexical);
  if (allowUi && normalizeCase(actual) === normalizeCase(ui)) return actual;
  if (!isWithin(actual)) denied();
  if ((await original.lstat(lexical)).isSymbolicLink()) denied();
  return actual;
}

fsPromises.access = async (value, mode) => original.access(await guardPath(value, true), mode);
fsPromises.lstat = async (value, options) => original.lstat(await guardPath(value, true), options);
fsPromises.open = async (value, flags = "r", mode) => {
  if (typeof flags !== "string" || !/^r\+?$/.test(flags)) denied();
  if (flags.includes("+")) denied();
  return original.open(await guardPath(value), flags, mode);
};
fsPromises.readFile = async (value, options) => original.readFile(await guardPath(value, true), options);
fsPromises.realpath = async (value, options) => original.realpath(await guardPath(value, true), options);
fsPromises.stat = async (value, options) => original.stat(await guardPath(value, true), options);
for (const name of [
  "appendFile", "chmod", "chown", "copyFile", "cp", "link", "mkdir", "mkdtemp", "rename", "rm", "rmdir",
  "symlink", "truncate", "unlink", "utimes", "writeFile",
]) {
  fsPromises[name] = denied;
}

fs.open = (value, flags, ...rest) => {
  if (flags !== "r") denied();
  return original.openCallback(value, flags, ...rest);
};
fs.openSync = (value, flags, ...rest) => {
  if (flags !== "r") denied();
  return original.openSync(value, flags, ...rest);
};
for (const name of [
  "appendFile", "appendFileSync", "chmod", "chmodSync", "chown", "chownSync", "copyFile", "copyFileSync", "cp",
  "cpSync", "createWriteStream", "fchmod", "fchmodSync", "fchown", "fchownSync", "fdatasync", "fdatasyncSync",
  "fsync", "fsyncSync", "ftruncate", "ftruncateSync", "futimes", "futimesSync", "link", "linkSync", "mkdir",
  "mkdirSync", "mkdtemp", "mkdtempSync", "rename", "renameSync", "rm", "rmSync", "rmdir", "rmdirSync",
  "symlink", "symlinkSync", "truncate", "truncateSync", "unlink", "unlinkSync", "utimes", "utimesSync", "write",
  "writeFile", "writeFileSync", "writeSync", "writev", "writevSync",
]) {
  fs[name] = denied;
}

for (const key of ["exec", "execFile", "execFileSync", "execSync", "fork", "spawn", "spawnSync"]) childProcess[key] = denied;
for (const key of ["get", "request", "createServer"]) http[key] = denied;
for (const key of ["get", "request", "createServer"]) https[key] = denied;
for (const key of ["connect", "createConnection", "createServer"]) net[key] = denied;
for (const key of ["connect", "createServer"]) tls[key] = denied;
dgram.createSocket = denied;
for (const key of Object.keys(dns)) {
  if (key === "promises" || key === "setDefaultResultOrder" || key === "getDefaultResultOrder") continue;
  if (/^(lookup|resolve|reverse)/.test(key)) dns[key] = denied;
}
if (dns.promises) {
  for (const key of Object.keys(dns.promises)) {
    if (/^(lookup|resolve|reverse)/.test(key)) dns.promises[key] = denied;
  }
}
workerThreads.Worker = class DisabledWorker {
  constructor() { denied(); }
};
globalThis.fetch = denied;
globalThis.WebSocket = class DisabledWebSocket {
  constructor() { denied(); }
};

for (const key of Object.keys(process.env)) {
  const upper = key.toUpperCase();
  if (
    upper === "NODE_OPTIONS" || upper.endsWith("_PROXY") || upper === "NO_PROXY" ||
    upper.includes("TOKEN") || upper.includes("SECRET") || upper.includes("PASSWORD") ||
    upper.startsWith("AWS_") || upper.startsWith("AZURE_") || upper.startsWith("GOOGLE_") ||
    upper.startsWith("OPENAI_") || upper.startsWith("GITHUB_") || upper.startsWith("NPM_CONFIG_REGISTRY")
  ) {
    delete process.env[key];
  }
}

syncBuiltinESMExports();

if (process.env.AGENT_OPT_AUDIO_SECURITY_PROBE === "1") {
  let fetchDenied = false;
  let subprocessDenied = false;
  let outsideReadDenied = false;
  let writeDenied = false;
  try { await globalThis.fetch("https://example.invalid/"); } catch { fetchDenied = true; }
  try { childProcess.execFileSync(process.execPath, ["--version"]); } catch { subprocessDenied = true; }
  try { await fsPromises.readFile(process.env.AGENT_OPT_AUDIO_PROBE_OUTSIDE ?? packageJsonPath); } catch { outsideReadDenied = true; }
  try { await fsPromises.writeFile(path.join(root, "probe.txt"), "x"); } catch { writeDenied = true; }
  process.stdout.write(JSON.stringify({
    fetchDenied,
    subprocessDenied,
    outsideReadDenied,
    writeDenied,
    proxyRemoved: !Object.keys(process.env).some((key) => key.toUpperCase().endsWith("_PROXY")),
    credentialRemoved: !Object.keys(process.env).some((key) => /TOKEN|SECRET|PASSWORD/.test(key.toUpperCase())),
  }));
  process.exit(0);
}

await import(pathToFileURL(entry).href);

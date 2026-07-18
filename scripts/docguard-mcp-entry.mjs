/**
 * Security bootstrap for docguard-cli 0.33.1.
 *
 * The public adapter materializes one virtual text project per invocation.
 * This bootstrap permits reads from only that project and the pinned module
 * tree, and denies writes, network access, workers, and subprocess creation
 * before the upstream MCP implementation is imported.
 */

import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import tls from "node:tls";
import workerThreads from "node:worker_threads";

const denied = (capability) => {
  throw new Error(`Agent-OPT DocGuard sandbox denied ${capability}`);
};

const projectInput = process.env.AGENT_OPT_DOCGUARD_PROJECT_ROOT;
const packageInput = process.env.AGENT_OPT_DOCGUARD_PACKAGE_ROOT;
const moduleInput = process.env.AGENT_OPT_DOCGUARD_MODULE_ROOT;
if (!projectInput || !packageInput || !moduleInput) {
  throw new Error("DocGuard bootstrap requires project and package roots");
}

const projectRoot = fs.realpathSync(path.resolve(projectInput));
const packageRoot = fs.realpathSync(path.resolve(packageInput));
const moduleRoot = fs.realpathSync(path.resolve(moduleInput));
const packageJsonPath = path.join(packageRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
if (packageJson.name !== "docguard-cli" || packageJson.version !== "0.33.1") {
  throw new Error("DocGuard bootstrap requires exact upstream docguard-cli 0.33.1");
}
if (!fs.statSync(projectRoot).isDirectory() || !fs.statSync(moduleRoot).isDirectory()) {
  throw new Error("DocGuard bootstrap roots must be directories");
}

const entry = path.join(packageRoot, "cli", "docguard.mjs");
if (!fs.existsSync(entry)) throw new Error("DocGuard upstream entry is missing");

const within = (root, target) => {
  const relative = path.relative(root, path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const safeReadPath = (target) => {
  if (typeof target === "number") return target;
  if (target instanceof URL) target = fileURLToPath(target);
  const resolved = path.resolve(String(target));
  if (!within(projectRoot, resolved) && !within(moduleRoot, resolved)) denied("host filesystem read");
  return target;
};

const wrapRead = (name) => {
  const original = fs[name];
  if (typeof original !== "function") return;
  fs[name] = function guardedRead(target, ...args) {
    return original.call(this, safeReadPath(target), ...args);
  };
};
for (const name of [
  "accessSync", "existsSync", "lstatSync", "openSync", "readFileSync", "readdirSync",
  "realpathSync", "statSync", "readlinkSync",
]) wrapRead(name);

const denySync = (name) => {
  if (typeof fs[name] === "function") fs[name] = () => denied(`filesystem ${name}`);
};
for (const name of [
  "appendFileSync", "chmodSync", "chownSync", "copyFileSync", "cpSync", "linkSync",
  "mkdirSync", "mkdtempSync", "renameSync", "rmSync", "rmdirSync", "symlinkSync",
  "truncateSync", "unlinkSync", "utimesSync", "writeFileSync",
]) denySync(name);

for (const name of ["exec", "execFile", "execSync", "execFileSync", "fork", "spawn", "spawnSync"]) {
  if (typeof childProcess[name] === "function") childProcess[name] = () => denied(`subprocess ${name}`);
}

const denyNetwork = (module, names, label) => {
  for (const name of names) {
    if (typeof module[name] === "function") module[name] = () => denied(`${label} ${name}`);
  }
};
denyNetwork(http, ["get", "request", "createServer"], "HTTP");
denyNetwork(https, ["get", "request", "createServer"], "HTTPS");
denyNetwork(net, ["connect", "createConnection", "createServer"], "network");
denyNetwork(tls, ["connect", "createServer"], "TLS");
denyNetwork(dgram, ["createSocket"], "datagram");
denyNetwork(dns, ["lookup", "resolve", "resolve4", "resolve6"], "DNS");
denyNetwork(dnsPromises, ["lookup", "resolve", "resolve4", "resolve6"], "DNS");

globalThis.fetch = () => Promise.reject(new Error("Agent-OPT DocGuard sandbox denied fetch"));
workerThreads.Worker = class DeniedWorker {
  constructor() { denied("worker thread"); }
};

for (const name of [
  "appendFile", "chmod", "chown", "copyFile", "cp", "link", "mkdir", "mkdtemp", "open",
  "rename", "rm", "rmdir", "symlink", "truncate", "unlink", "utimes", "writeFile",
]) {
  if (typeof fsPromises[name] === "function") fsPromises[name] = async () => denied(`filesystem ${name}`);
}
for (const name of ["access", "lstat", "readFile", "readdir", "readlink", "realpath", "stat"]) {
  const original = fsPromises[name];
  if (typeof original === "function") {
    fsPromises[name] = async function guardedPromiseRead(target, ...args) {
      return original.call(this, safeReadPath(target), ...args);
    };
  }
}

for (const key of Object.keys(process.env)) {
  if (
    /(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|PRIVATE_?KEY|ACCESS_?KEY)(?:$|_)/i.test(key) ||
    /^(?:HTTP|HTTPS|ALL|NO)_PROXY$/i.test(key) ||
    /^(?:npm_config_.*proxy|GIT_ASKPASS|SSH_AUTH_SOCK)$/i.test(key)
  ) delete process.env[key];
}
delete process.env.AGENT_OPT_DOCGUARD_PROJECT_ROOT;
delete process.env.AGENT_OPT_DOCGUARD_PACKAGE_ROOT;
delete process.env.AGENT_OPT_DOCGUARD_MODULE_ROOT;

syncBuiltinESMExports();

if (process.env.AGENT_OPT_DOCGUARD_SECURITY_PROBE === "1") {
  const blocked = async (action) => {
    try { await action(); return false; } catch { return true; }
  };
  const hostCandidate = process.platform === "win32" ? "C:\\Windows\\win.ini" : "/etc/passwd";
  const output = {
    projectReadAllowed: fs.readFileSync(path.join(projectRoot, "README.md"), "utf8").length > 0,
    moduleReadAllowed: fs.readFileSync(packageJsonPath, "utf8").includes("docguard-cli"),
    hostReadDenied: await blocked(() => fsPromises.readFile(hostCandidate, "utf8")),
    projectWriteDenied: await blocked(() => fsPromises.writeFile(path.join(projectRoot, "probe.txt"), "x")),
    fetchDenied: await blocked(() => fetch("https://example.com")),
    httpDenied: await blocked(() => http.get("http://example.com")),
    dnsDenied: await blocked(() => dnsPromises.lookup("example.com")),
    subprocessDenied: await blocked(() => childProcess.execFile(process.execPath, ["--version"])),
    workerDenied: await blocked(() => new workerThreads.Worker("")),
    proxyRemoved: !process.env.HTTPS_PROXY && !process.env.HTTP_PROXY && !process.env.ALL_PROXY,
    credentialRemoved: !process.env.OPENAI_API_KEY && !process.env.NPM_TOKEN,
  };
  process.stdout.write(JSON.stringify(output));
} else {
  process.argv = [process.execPath, entry, "mcp"];
  await import(pathToFileURL(entry).href);
}

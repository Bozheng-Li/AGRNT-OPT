/**
 * Security bootstrap for @usejunior/safe-docx 0.15.0.
 *
 * Pins package identity, forces SAFE_DOCX_ALLOWED_ROOTS to one sandbox root,
 * scrubs credential environment variables, and denies network, workers, and
 * subprocess creation before importing the exact upstream CLI entry.
 */

import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import tls from "node:tls";
import workerThreads from "node:worker_threads";

const denied = (capability) => {
  throw new Error(`Agent-OPT Safe DOCX sandbox denied ${capability}`);
};

const rootInput = process.env.AGENT_OPT_SAFE_DOCX_ROOT;
if (!rootInput) throw new Error("Safe DOCX bootstrap requires AGENT_OPT_SAFE_DOCX_ROOT");

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  "@usejunior",
  "safe-docx",
);
const packageJsonPath = path.join(packageRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
if (packageJson.name !== "@usejunior/safe-docx" || packageJson.version !== "0.15.0") {
  throw new Error("Safe DOCX bootstrap requires the exact upstream package at 0.15.0");
}

const entry = path.join(packageRoot, "bin", "safe-docx.js");
if (!fs.existsSync(entry)) throw new Error("Safe DOCX package entry is missing");

const root = fs.realpathSync(path.resolve(rootInput));
if (!fs.statSync(root).isDirectory()) {
  throw new Error("Safe DOCX runtime root is not a directory");
}

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
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "NODE_OPTIONS",
]) {
  delete process.env[key];
}

Object.assign(process.env, {
  SAFE_DOCX_ALLOWED_ROOTS: root,
  HOME: root,
  USERPROFILE: root,
  TEMP: path.join(root, "tmp"),
  TMP: path.join(root, "tmp"),
  TMPDIR: path.join(root, "tmp"),
  NO_COLOR: "1",
});

globalThis.fetch = async () => denied("network access");
globalThis.WebSocket = class {
  constructor() {
    denied("WebSocket access");
  }
};
for (const [target, methods, label] of [
  [http, ["request", "get", "createServer"], "HTTP access"],
  [https, ["request", "get", "createServer"], "HTTPS access"],
  [dgram, ["createSocket"], "datagram access"],
  [dns, ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "reverse"], "DNS access"],
  [dnsPromises, ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "reverse"], "DNS access"],
  [childProcess, ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"], "subprocess access"],
]) {
  for (const method of methods) {
    if (typeof target[method] === "function") target[method] = () => denied(label);
  }
}
for (const method of ["connect", "createConnection", "createServer", "listen"]) {
  if (typeof net[method] === "function") net[method] = () => denied("socket access");
  if (typeof tls[method] === "function") tls[method] = () => denied("TLS access");
}
workerThreads.Worker = class {
  constructor() {
    denied("worker access");
  }
};
syncBuiltinESMExports();

if (process.env.AGENT_OPT_SAFE_DOCX_SECURITY_PROBE === "1") {
  const check = async (fn) => {
    try {
      await fn();
      return false;
    } catch (error) {
      return error instanceof Error && error.message.includes("Agent-OPT Safe DOCX sandbox denied");
    }
  };
  process.stdout.write(
    JSON.stringify({
      packagePinned: packageJson.name === "@usejunior/safe-docx" && packageJson.version === "0.15.0",
      allowedRootsPinned: process.env.SAFE_DOCX_ALLOWED_ROOTS === root,
      credentialRemoved: process.env.NPM_TOKEN === undefined && process.env.OPENAI_API_KEY === undefined,
      networkDenied: await check(() => globalThis.fetch("https://example.com")),
      httpDenied: await check(() => http.get("http://127.0.0.1")),
      subprocessDenied: await check(() => childProcess.spawn(process.execPath, ["--version"])),
      workerDenied: await check(() => new workerThreads.Worker("export default 1", { eval: true })),
    }),
  );
} else {
  await import(pathToFileURL(entry).href);
}

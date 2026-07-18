import childProcess from "node:child_process";
import dgram from "node:dgram";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";

const denied = (capability) => {
  throw new Error(`Agent-OPT e18e sandbox denied ${capability}`);
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
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "NPM_CONFIG_USERCONFIG",
]) {
  delete process.env[key];
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
  [childProcess, ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"], "subprocess access"],
]) {
  for (const method of methods) {
    target[method] = () => denied(label);
  }
}

syncBuiltinESMExports();

if (process.env.AGENT_OPT_E18E_SECURITY_PROBE === "1") {
  const checkDenied = async (operation) => {
    try {
      await operation();
      return false;
    } catch (error) {
      return error instanceof Error && error.message.includes("Agent-OPT e18e sandbox denied");
    }
  };
  const result = {
    fetchDenied: await checkDenied(() => globalThis.fetch("https://example.com")),
    httpDenied: await checkDenied(() => http.get("http://127.0.0.1")),
    subprocessDenied: await checkDenied(() => childProcess.spawn(process.execPath, ["--version"])),
    proxyRemoved: process.env.HTTPS_PROXY === undefined && process.env.https_proxy === undefined,
    registryTokenRemoved: process.env.NPM_TOKEN === undefined && process.env.NODE_AUTH_TOKEN === undefined,
  };
  process.stdout.write(JSON.stringify(result));
} else {
  await import("../node_modules/@e18e/mcp/dist/run.js");
}

import childProcess from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import workerThreads from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';

const denied = (capability) => { throw new Error(`Agent-OPT Astronomy sandbox denied ${capability}`); };

for (const key of [
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
  'NPM_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_CONFIG_USERCONFIG', 'GITHUB_TOKEN', 'GH_TOKEN', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET',
  'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_API_KEY', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_HEADERS',
  'MCP_PUBLIC_URL', 'MCP_HTTP_HOST', 'MCP_HTTP_PORT', 'MCP_HTTP_ENDPOINT_PATH', 'MCP_AUTH_MODE',
  'ASTRONOMY_DEFAULT_TIMEZONE', 'NODE_USE_ENV_PROXY', 'NODE_OPTIONS',
]) delete process.env[key];
Object.assign(process.env, {
  MCP_TRANSPORT_TYPE: 'stdio',
  MCP_LOG_LEVEL: 'emerg',
  STORAGE_PROVIDER_TYPE: 'in-memory',
  IS_SERVERLESS: 'true',
  OTEL_ENABLED: 'false',
  ASTRONOMY_ENABLE_HORIZONS: 'false',
  ASTRONOMY_ENABLE_SATELLITES: 'false',
});

globalThis.fetch = async () => denied('network access');
globalThis.WebSocket = class { constructor() { denied('WebSocket access'); } };
for (const [target, methods, label] of [
  [http, ['request', 'get'], 'HTTP access'],
  [https, ['request', 'get'], 'HTTPS access'],
  [net, ['connect', 'createConnection'], 'socket access'],
  [tls, ['connect'], 'TLS access'],
  [dgram, ['createSocket'], 'datagram access'],
  [dns, ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny'], 'DNS access'],
  [dnsPromises, ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny'], 'DNS access'],
  [childProcess, ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'], 'subprocess access'],
]) for (const method of methods) target[method] = () => denied(label);
workerThreads.Worker = class { constructor() { denied('worker access'); } };
syncBuiltinESMExports();

function denyFilesystem() {
  for (const method of ['readFile', 'readFileSync', 'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createReadStream', 'createWriteStream']) {
    fs[method] = () => denied('filesystem access');
  }
  for (const method of ['readFile', 'writeFile', 'appendFile', 'open']) fsPromises[method] = () => denied('filesystem access');
  syncBuiltinESMExports();
}

if (process.env.AGENT_OPT_ASTRONOMY_SECURITY_PROBE === '1') {
  denyFilesystem();
  const check = async (fn) => {
    try { await fn(); return false; } catch (error) { return error instanceof Error && error.message.includes('Agent-OPT Astronomy sandbox denied'); }
  };
  process.stdout.write(JSON.stringify({
    fetchDenied: await check(() => globalThis.fetch('https://example.com')),
    httpDenied: await check(() => http.get('http://127.0.0.1')),
    dnsDenied: await check(() => dnsPromises.lookup('example.com')),
    hostReadDenied: await check(() => fsPromises.readFile(process.env.USERPROFILE ?? '/', 'utf8')),
    writeDenied: await check(() => fsPromises.writeFile('probe.txt', 'x')),
    subprocessDenied: await check(() => childProcess.spawn(process.execPath, ['--version'])),
    workerDenied: await check(() => new workerThreads.Worker('')),
    networkFeaturesDisabled: process.env.ASTRONOMY_ENABLE_HORIZONS === 'false' && process.env.ASTRONOMY_ENABLE_SATELLITES === 'false',
    proxyRemoved: process.env.HTTPS_PROXY === undefined && process.env.NODE_USE_ENV_PROXY === undefined,
    credentialRemoved: process.env.NPM_TOKEN === undefined && process.env.OPENAI_API_KEY === undefined,
  }));
} else {
  await import('sanitize-html');
  await import('../node_modules/@cyanheads/astronomy-mcp-server/dist/index.js');
  denyFilesystem();
}

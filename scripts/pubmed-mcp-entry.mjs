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
import { AsyncLocalStorage } from 'node:async_hooks';
import { syncBuiltinESMExports } from 'node:module';

const ORIGINS = new Set([
  'https://eutils.ncbi.nlm.nih.gov',
  'https://pmc.ncbi.nlm.nih.gov',
  'https://www.ebi.ac.uk',
  'https://api.openalex.org',
]);
const RESPONSE_LIMIT = 8 * 1024 * 1024;
const TOTAL_LIMIT = 24 * 1024 * 1024;
const PARAMETER_LIMIT = 24_000;
const proxyValue = process.env.HTTPS_PROXY?.trim() || process.env.https_proxy?.trim();
let proxyHostname;
if (proxyValue) {
  const proxy = new URL(proxyValue);
  if (!['http:', 'https:'].includes(proxy.protocol) || !proxy.hostname || proxy.username || proxy.password || proxy.search || proxy.hash || proxy.pathname !== '/') {
    throw new Error('Agent-OPT PubMed sandbox denied invalid proxy');
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
const token = Object.freeze({ capability: 'pubmed-fixed-egress' });
let totalBytes = 0;
const denied = (capability) => { throw new Error(`Agent-OPT PubMed sandbox denied ${capability}`); };

for (const key of [
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
  'NPM_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_CONFIG_USERCONFIG', 'GITHUB_TOKEN', 'GH_TOKEN', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET',
  'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_API_KEY', 'NCBI_API_KEY', 'NCBI_ADMIN_EMAIL', 'UNPAYWALL_EMAIL',
  'EUROPEPMC_EMAIL', 'OPENALEX_EMAIL', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_HEADERS',
  'MCP_PUBLIC_URL', 'MCP_HTTP_HOST', 'MCP_HTTP_PORT', 'MCP_HTTP_ENDPOINT_PATH', 'MCP_AUTH_MODE', 'NODE_USE_ENV_PROXY', 'NODE_OPTIONS',
]) delete process.env[key];
Object.assign(process.env, {
  MCP_TRANSPORT_TYPE: 'stdio',
  MCP_LOG_LEVEL: 'emerg',
  STORAGE_PROVIDER_TYPE: 'in-memory',
  IS_SERVERLESS: 'true',
  OTEL_ENABLED: 'false',
  EUROPEPMC_ENABLED: 'true',
  NCBI_TOOL_IDENTIFIER: 'agent-opt-pubmed',
  NCBI_REQUEST_DELAY_MS: '350',
  NCBI_MAX_CONCURRENT: '2',
  NCBI_MAX_RETRIES: '2',
  NCBI_TIMEOUT_MS: '20000',
  NCBI_TOTAL_DEADLINE_MS: '45000',
  EUROPEPMC_REQUEST_DELAY_MS: '250',
  EUROPEPMC_MAX_RETRIES: '2',
  EUROPEPMC_TIMEOUT_MS: '20000',
});

function inspectParameters(params) {
  const encoded = params.toString();
  if (encoded.length > PARAMETER_LIMIT) denied('oversized parameters');
  for (const [key, value] of params) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || value.length > 12_000 || /[\u0000]/.test(value)) denied(`query parameter ${key}`);
    if (['api_key', 'email', 'mailto'].includes(key.toLowerCase())) denied(`credential parameter ${key}`);
  }
}

function authorize(input, init = {}) {
  if (typeof input !== 'string' && !(input instanceof URL)) denied('Request-object input');
  const url = new URL(input.toString());
  if (!ORIGINS.has(url.origin) || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) denied(`network destination ${url.origin}`);

  const method = String(init.method ?? 'GET').toUpperCase();
  const isEutils = url.origin === 'https://eutils.ncbi.nlm.nih.gov';
  if (method !== 'GET' && !(isEutils && method === 'POST')) denied(`method ${method}`);
  if (method === 'GET' && init.body != null) denied('GET body');

  const headers = new Headers(init.headers);
  for (const key of headers.keys()) {
    if (!['accept', 'accept-encoding', 'content-type', 'user-agent'].includes(key.toLowerCase())) denied(`header ${key}`);
  }
  for (const key of ['authorization', 'cookie', 'proxy-authorization', 'x-api-key']) if (headers.has(key)) denied(`credential header ${key}`);
  if (method === 'POST' && headers.get('content-type')?.toLowerCase() !== 'application/x-www-form-urlencoded') denied('POST content type');

  if (url.origin === 'https://eutils.ncbi.nlm.nih.gov') {
    if (!/^\/entrez\/eutils\/(?:esearch|esummary|efetch|elink|espell|einfo)(?:\.fcgi)?$/.test(url.pathname)
      && url.pathname !== '/entrez/eutils/ecitmatch.cgi') denied(`path ${url.pathname}`);
  } else if (url.origin === 'https://pmc.ncbi.nlm.nih.gov') {
    if (url.pathname !== '/tools/idconv/api/v1/articles/' || method !== 'GET') denied(`path ${url.pathname}`);
  } else if (url.origin === 'https://www.ebi.ac.uk') {
    if (method !== 'GET' || (
      url.pathname !== '/europepmc/webservices/rest/search'
      && !/^\/europepmc\/webservices\/rest\/[A-Za-z0-9._-]{1,80}\/fullTextXML$/.test(url.pathname)
      && !/^\/europepmc\/webservices\/rest\/MED\/\d{1,12}\/(?:citations|references)$/.test(url.pathname)
    )) denied(`path ${url.pathname}`);
  } else if (url.origin === 'https://api.openalex.org') {
    if (method !== 'GET' || (url.pathname !== '/works' && !/^\/works\/pmid:\d{1,12}$/.test(url.pathname))) denied(`path ${url.pathname}`);
  }

  inspectParameters(url.searchParams);
  if (method === 'POST') {
    if (typeof init.body !== 'string') denied('non-string POST body');
    inspectParameters(new URLSearchParams(init.body));
  }
  return { url, init: { ...init, method, redirect: 'error', credentials: 'omit' } };
}

async function bounded(response, requested) {
  const responseUrl = response.url ? new URL(response.url) : null;
  if (response.redirected || !responseUrl || responseUrl.origin !== requested.origin || responseUrl.pathname !== requested.pathname) denied('redirect or origin change');
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  if (!/(?:json|xml|text\/plain|application\/octet-stream)/.test(contentType)) denied('unexpected response content type');
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > RESPONSE_LIMIT) denied('oversized response');
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
      denied('oversized response');
    }
    chunks.push(Buffer.from(value));
  }
  return new Response(Buffer.concat(chunks, bytes), { status: response.status, statusText: response.statusText, headers: response.headers });
}

globalThis.fetch = async (input, init = {}) => {
  const approved = authorize(input, init);
  return scope.run(token, async () => bounded(await nativeFetch(approved.url, approved.init), approved.url));
};
globalThis.WebSocket = class { constructor() { denied('WebSocket access'); } };

for (const [target, methods, label] of [
  [http, ['request', 'get'], 'HTTP access'],
  [https, ['request', 'get'], 'HTTPS access'],
  [dgram, ['createSocket'], 'datagram access'],
  [dns, ['resolve', 'resolve4', 'resolve6', 'resolveAny'], 'DNS access'],
  [dnsPromises, ['resolve', 'resolve4', 'resolve6', 'resolveAny'], 'DNS access'],
  [childProcess, ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'], 'subprocess access'],
]) for (const method of methods) target[method] = () => denied(label);

function denyFilesystem() {
  for (const method of ['readFile', 'readFileSync', 'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createReadStream', 'createWriteStream']) {
    fs[method] = () => denied('filesystem access');
  }
  for (const method of ['readFile', 'writeFile', 'appendFile', 'open']) {
    fsPromises[method] = () => denied('filesystem access');
  }
  syncBuiltinESMExports();
}

const scoped = (label, native) => (...args) => {
  if (scope.getStore() !== token) denied(label);
  return native(...args);
};
net.connect = scoped('socket access', nativeNetConnect);
net.createConnection = scoped('socket access', nativeNetCreateConnection);
tls.connect = scoped('TLS access', nativeTlsConnect);
dns.lookup = (hostname, ...args) => {
  if (scope.getStore() !== token || (![...ORIGINS].some((origin) => new URL(origin).hostname === hostname) && hostname !== proxyHostname)) denied('DNS access');
  return nativeDnsLookup(hostname, ...args);
};
dnsPromises.lookup = (hostname, ...args) => {
  if (scope.getStore() !== token || (![...ORIGINS].some((origin) => new URL(origin).hostname === hostname) && hostname !== proxyHostname)) denied('DNS access');
  return nativeDnsPromisesLookup(hostname, ...args);
};
workerThreads.Worker = class { constructor() { denied('worker access'); } };
syncBuiltinESMExports();

if (process.env.AGENT_OPT_PUBMED_SECURITY_PROBE === '1') {
  denyFilesystem();
  const check = async (fn) => {
    try { await fn(); return false; } catch (error) { return error instanceof Error && error.message.includes('Agent-OPT PubMed sandbox denied'); }
  };
  const allowed = authorize('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=GenBank&retmax=2&tool=agent-opt-pubmed');
  process.stdout.write(JSON.stringify({
    fixedOriginAccepted: allowed.url.origin === 'https://eutils.ncbi.nlm.nih.gov',
    redirectForced: allowed.init.redirect === 'error',
    customHostDenied: await check(() => globalThis.fetch('https://example.com/entrez/eutils/esearch.fcgi?db=pubmed')),
    customPathDenied: await check(() => globalThis.fetch('https://eutils.ncbi.nlm.nih.gov/admin')),
    unpaywallDenied: await check(() => globalThis.fetch('https://api.unpaywall.org/v2/10.1/test')),
    credentialParameterDenied: await check(() => globalThis.fetch('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=x&api_key=secret')),
    credentialHeaderDenied: await check(() => globalThis.fetch('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=x', { headers: { Authorization: 'Bearer x' } })),
    hostReadDenied: await check(() => fsPromises.readFile(process.env.USERPROFILE ?? '/', 'utf8')),
    writeDenied: await check(() => fsPromises.writeFile('probe.txt', 'x')),
    subprocessDenied: await check(() => childProcess.spawn(process.execPath, ['--version'])),
    workerDenied: await check(() => new workerThreads.Worker('')),
    proxyRemoved: process.env.HTTPS_PROXY === undefined && process.env.NODE_USE_ENV_PROXY === undefined,
    credentialRemoved: process.env.NCBI_API_KEY === undefined && process.env.UNPAYWALL_EMAIL === undefined && process.env.OPENAI_API_KEY === undefined,
  }));
} else {
  await import('sanitize-html');
  await import('../node_modules/@cyanheads/pubmed-mcp-server/dist/index.js');
  denyFilesystem();
}

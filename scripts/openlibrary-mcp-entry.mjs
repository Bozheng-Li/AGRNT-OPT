import childProcess from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import workerThreads from 'node:worker_threads';
import { AsyncLocalStorage } from 'node:async_hooks';
import { syncBuiltinESMExports } from 'node:module';

const ORIGIN = 'https://openlibrary.org';
const RESPONSE_LIMIT = 1_500_000;
const TOTAL_LIMIT = 5_000_000;
const proxyValue = process.env.HTTPS_PROXY?.trim() || process.env.https_proxy?.trim();
let proxyHostname;
if (proxyValue) {
  const proxy = new URL(proxyValue);
  if (!['http:', 'https:'].includes(proxy.protocol) || !proxy.hostname || proxy.username || proxy.password || proxy.search || proxy.hash || proxy.pathname !== '/') throw new Error('Agent-OPT OpenLibrary sandbox denied invalid proxy');
  proxyHostname = proxy.hostname;
}

const nativeFetch = globalThis.fetch.bind(globalThis);
const nativeNetConnect = net.connect.bind(net);
const nativeNetCreateConnection = net.createConnection.bind(net);
const nativeTlsConnect = tls.connect.bind(tls);
const nativeDnsLookup = dns.lookup.bind(dns);
const nativeDnsPromisesLookup = dnsPromises.lookup.bind(dnsPromises);
const scope = new AsyncLocalStorage();
const token = Object.freeze({ origin: ORIGIN });
let totalBytes = 0;
const denied = (capability) => { throw new Error(`Agent-OPT OpenLibrary sandbox denied ${capability}`); };

for (const key of [
  'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','NPM_TOKEN','NODE_AUTH_TOKEN','NPM_CONFIG_USERCONFIG',
  'GITHUB_TOKEN','GH_TOKEN','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AZURE_CLIENT_ID','AZURE_CLIENT_SECRET','GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','OTEL_EXPORTER_OTLP_ENDPOINT','OTEL_EXPORTER_OTLP_HEADERS','MCP_PUBLIC_URL','MCP_HTTP_HOST','MCP_HTTP_PORT',
  'MCP_HTTP_ENDPOINT_PATH','MCP_AUTH_MODE','OPENLIBRARY_USER_AGENT','NODE_USE_ENV_PROXY','NODE_OPTIONS',
]) delete process.env[key];
Object.assign(process.env, {
  MCP_TRANSPORT_TYPE: 'stdio',
  MCP_LOG_LEVEL: 'emerg',
  STORAGE_PROVIDER_TYPE: 'in-memory',
  IS_SERVERLESS: 'true',
  OTEL_ENABLED: 'false',
  OPENLIBRARY_USER_AGENT: 'Agent-OPT OpenLibrary adapter',
});

function integerParam(params, name, maximum) {
  if (!params.has(name) || !/^\d+$/.test(params.get(name)) || Number(params.get(name)) > maximum) denied(`query parameter ${name}`);
}
function exactKeys(params, keys) {
  for (const key of params.keys()) if (!keys.includes(key)) denied(`query parameter ${key}`);
}
function authorize(input, init = {}) {
  if (typeof input !== 'string' && !(input instanceof URL)) denied('Request-object input');
  const url = new URL(input.toString());
  if (url.origin !== ORIGIN || url.protocol !== 'https:' || url.hostname !== 'openlibrary.org' || url.port || url.username || url.password || url.hash) denied(`network destination ${url.origin}`);
  const method = String(init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' || init.body != null) denied(`method ${method}`);
  const headers = new Headers(init.headers);
  for (const key of headers.keys()) if (!['user-agent','accept','accept-encoding'].includes(key.toLowerCase())) denied(`header ${key}`);
  for (const key of ['authorization','cookie','proxy-authorization','x-api-key']) if (headers.has(key)) denied(`credential header ${key}`);
  const p = url.pathname;
  const q = url.searchParams;
  if (p === '/search.json') {
    exactKeys(q, ['q','title','author','subject','publisher','isbn','lang','sort','limit','offset','fields']); integerParam(q,'limit',12); integerParam(q,'offset',2000);
    if (![...q.values()].every((value) => value.length <= 500)) denied('oversized search query');
  } else if (/^\/works\/OL\d{1,12}W\.json$/i.test(p) || /^\/authors\/OL\d{1,12}A\.json$/i.test(p) || /^\/books\/OL\d{1,12}M\.json$/i.test(p) || /^\/isbn\/\d{10,13}\.json$/.test(p)) {
    if (url.search) denied('query on detail path');
  } else if (/^\/works\/OL\d{1,12}W\/editions\.json$/i.test(p) || /^\/authors\/OL\d{1,12}A\/works\.json$/i.test(p)) {
    exactKeys(q,['limit','offset']); integerParam(q,'limit',12); integerParam(q,'offset',2000);
  } else if (p === '/search/authors.json') {
    exactKeys(q,['q','limit','offset']); integerParam(q,'limit',12); integerParam(q,'offset',2000); if (!q.get('q') || q.get('q').length > 200) denied('author query');
  } else if (/^\/subjects\/[A-Za-z0-9_%.-]{1,300}\.json$/.test(p)) {
    exactKeys(q,['limit','offset']); integerParam(q,'limit',12); integerParam(q,'offset',2000);
  } else if (p === '/api/books') {
    exactKeys(q,['bibkeys','format','jscmd']); if (!/^(?:OCLC:\d{1,20}|LCCN:[A-Za-z0-9 +%-]{1,80})$/.test(q.get('bibkeys') ?? '') || q.get('format') !== 'json' || q.get('jscmd') !== 'details') denied('bibliographic query');
  } else denied(`path ${p}`);
  return { url, init: { ...init, method:'GET', redirect:'error', credentials:'omit' } };
}

async function bounded(response, requested) {
  if (response.redirected || !response.url || new URL(response.url).origin !== ORIGIN || new URL(response.url).pathname !== requested.pathname) denied('redirect or origin change');
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) denied('non-JSON response');
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > RESPONSE_LIMIT) denied('oversized response');
  if (!response.body) return response;
  const reader = response.body.getReader(); const chunks=[]; let bytes=0;
  while (true) { const {done,value}=await reader.read(); if(done) break; bytes += value.byteLength; totalBytes += value.byteLength; if(bytes>RESPONSE_LIMIT||totalBytes>TOTAL_LIMIT){await reader.cancel().catch(()=>undefined);denied('oversized response');} chunks.push(Buffer.from(value)); }
  return new Response(Buffer.concat(chunks,bytes),{status:response.status,statusText:response.statusText,headers:response.headers});
}

globalThis.fetch = async (input, init={}) => { const approved=authorize(input,init); return scope.run(token, async()=>bounded(await nativeFetch(approved.url,approved.init),approved.url)); };
globalThis.WebSocket = class { constructor(){denied('WebSocket access');} };
for (const [target,methods,label] of [[http,['request','get'],'HTTP access'],[https,['request','get'],'HTTPS access'],[dgram,['createSocket'],'datagram access'],[dns,['resolve','resolve4','resolve6','resolveAny'],'DNS access'],[dnsPromises,['resolve','resolve4','resolve6','resolveAny'],'DNS access'],[childProcess,['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'],'subprocess access']]) for(const method of methods) target[method]=()=>denied(label);
const scoped=(label,native)=>(...args)=>{if(scope.getStore()!==token)denied(label);return native(...args);};
net.connect=scoped('socket access',nativeNetConnect); net.createConnection=scoped('socket access',nativeNetCreateConnection); tls.connect=scoped('TLS access',nativeTlsConnect);
dns.lookup=(hostname,...args)=>{if(scope.getStore()!==token||(hostname!=='openlibrary.org'&&hostname!==proxyHostname))denied('DNS access');return nativeDnsLookup(hostname,...args);};
dnsPromises.lookup=(hostname,...args)=>{if(scope.getStore()!==token||(hostname!=='openlibrary.org'&&hostname!==proxyHostname))denied('DNS access');return nativeDnsPromisesLookup(hostname,...args);};
workerThreads.Worker=class{constructor(){denied('worker access');}};
syncBuiltinESMExports();

if(process.env.AGENT_OPT_OPENLIBRARY_SECURITY_PROBE==='1'){
  const check=async(fn)=>{try{await fn();return false;}catch(error){return error instanceof Error&&error.message.includes('Agent-OPT OpenLibrary sandbox denied');}};
  const allowed=authorize('https://openlibrary.org/search.json?q=Hobbit&limit=2&offset=0&fields=key%2Ctitle');
  process.stdout.write(JSON.stringify({
    fixedOriginAccepted: allowed.url.origin === ORIGIN,
    redirectForced: allowed.init.redirect === 'error',
    customHostDenied: await check(() => globalThis.fetch('https://example.com/search.json?q=x&limit=1&offset=0')),
    customPathDenied: await check(() => globalThis.fetch('https://openlibrary.org/admin.json')),
    credentialHeaderDenied: await check(() => globalThis.fetch('https://openlibrary.org/search.json?q=x&limit=1&offset=0', { headers: { Authorization: 'Bearer x' } })),
    httpDenied: await check(() => http.get('http://127.0.0.1')),
    subprocessDenied: await check(() => childProcess.spawn(process.execPath, ['--version'])),
    proxyRemoved: process.env.HTTPS_PROXY === undefined && process.env.NODE_USE_ENV_PROXY === undefined,
    credentialRemoved: process.env.NPM_TOKEN === undefined && process.env.OPENAI_API_KEY === undefined,
  }));
}else await import('../node_modules/@cyanheads/openlibrary-mcp-server/dist/index.js');

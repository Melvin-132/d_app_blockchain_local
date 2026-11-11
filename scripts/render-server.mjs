import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Wallet, getAddress, isAddress } from 'ethers';
import { createGenesis } from '../network/besu/genesis.js';
import { createHistoryIndex } from './history-index.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const chainId = 20261110;
const allowedRpcMethods = new Set([
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_getLogs',
  'eth_getStorageAt',
  'eth_getTransactionByBlockHashAndIndex',
  'eth_getTransactionByBlockNumberAndIndex',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_maxPriorityFeePerGas',
  'eth_sendRawTransaction',
  'net_version',
  'web3_clientVersion',
]);
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

let server;
let historyIndex;
let besu;
let stopped = false;
let dataDirectory;

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

function requestAddress(request) {
  const forwarded = request.headers['x-forwarded-for'];
  return typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : request.socket.remoteAddress;
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

async function readJsonBody(request, maximumBytes = 1024 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximumBytes) throw new Error('Request body exceeds the allowed size.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function rpcMethodsAllowed(payload) {
  const requests = Array.isArray(payload) ? payload : [payload];
  return requests.length > 0 && requests.every((request) =>
    request && typeof request.method === 'string' && allowedRpcMethods.has(request.method));
}

async function proxyRpc(request, response) {
  if (request.method !== 'POST') {
    response.writeHead(405, { Allow: 'POST' }).end('Method not allowed');
    return;
  }
  if (!sameOrigin(request)) {
    response.writeHead(403).end('Origin not allowed');
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    response.writeHead(400).end(error.message);
    return;
  }
  if (!rpcMethodsAllowed(payload)) {
    response.writeHead(403).end('JSON-RPC method not allowed');
    return;
  }

  try {
    const upstream = await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    response.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    sendJson(response, 502, {
      error: { code: -32000, message: `Besu RPC unavailable: ${error.message}` },
      id: payload.id ?? null,
      jsonrpc: '2.0',
    });
  }
}

async function handleHistory(request, response, url) {
  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' }).end('Method not allowed');
    return;
  }
  if (url.pathname === '/api/history/status') {
    sendJson(response, 200, historyIndex.getStatus());
    return;
  }
  if (url.pathname === '/api/history') {
    const scope = url.searchParams.get('scope');
    const address = url.searchParams.get('address');
    if (scope === 'wallet' && (!address || !isAddress(address))) {
      response.writeHead(400).end('A valid wallet address is required');
      return;
    }
    if (scope !== 'wallet' && scope !== 'native') {
      response.writeHead(400).end('Unsupported history scope');
      return;
    }
    sendJson(response, 200, historyIndex.getHistory({
      scope,
      address: address ? getAddress(address) : undefined,
      offset: Number(url.searchParams.get('offset') ?? 0),
      limit: Number(url.searchParams.get('limit') ?? 50),
    }));
    return;
  }
  if (url.pathname.startsWith('/api/history/transaction/')) {
    const hash = url.pathname.slice('/api/history/transaction/'.length);
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      response.writeHead(400).end('Invalid transaction hash');
      return;
    }
    const transaction = historyIndex.getTransaction(hash);
    if (!transaction) {
      response.writeHead(404).end('Transaction is not indexed yet');
      return;
    }
    sendJson(response, 200, transaction);
    return;
  }
  response.writeHead(404).end('Not found');
}

async function serveStatic(request, response, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  if (pathname === '/') {
    response.writeHead(302, { Location: '/blockchain/' }).end();
    return;
  }

  const apps = [
    { prefix: '/blockchain', directory: 'apps/blockchain/dist' },
    { prefix: '/explorer', directory: 'apps/explorer/dist' },
    { prefix: '/dapp', directory: 'apps/dapp/dist' },
  ];
  const app = apps.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!app) {
    response.writeHead(404).end('Not found');
    return;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname.slice(app.prefix.length)).replace(/^[/\\]+/, '');
  } catch {
    response.writeHead(400).end('Invalid path');
    return;
  }
  const appDirectory = path.resolve(root, app.directory);
  const candidate = path.resolve(appDirectory, relativePath);
  const contained = candidate === appDirectory || candidate.startsWith(`${appDirectory}${path.sep}`);
  const filePath = contained ? candidate : path.join(appDirectory, 'index.html');

  let body;
  let servedPath = filePath;
  try {
    body = await readFile(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
    servedPath = path.join(appDirectory, 'index.html');
    body = await readFile(servedPath);
  }

  const headers = {
    'Content-Type': mimeTypes.get(path.extname(servedPath)) || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': servedPath.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  };
  response.writeHead(200, headers);
  response.end(request.method === 'HEAD' ? undefined : body);
}

async function startBesu() {
  const fundedAddress = process.env.BESU_GENESIS_ADDRESS;
  if (!fundedAddress || !isAddress(fundedAddress)) {
    throw new Error('Configurez BESU_GENESIS_ADDRESS avec une adresse publique valide dans Render.');
  }
  const fundedAccount = getAddress(fundedAddress);
  const validator = Wallet.createRandom();
  dataDirectory = await mkdtemp(path.join(tmpdir(), 'clayde-render-'));
  const keysDirectory = path.join(dataDirectory, 'keys');
  const chainDirectory = path.join(dataDirectory, 'data');
  await Promise.all([
    mkdir(keysDirectory, { recursive: true }),
    mkdir(chainDirectory, { recursive: true }),
  ]);
  const genesisPath = path.join(dataDirectory, 'genesis.json');
  const keyPath = path.join(keysDirectory, 'validator.key');
  await Promise.all([
    writeFile(genesisPath, `${JSON.stringify(createGenesis(
      [{ address: validator.address }],
      fundedAccount,
      { expectedValidatorCount: 1 },
    ))}\n`),
    writeFile(keyPath, `${validator.privateKey.slice(2)}\n`, { mode: 0o600 }),
  ]);

  const besuExecutable = process.env.BESU_EXECUTABLE || '/opt/besu/bin/besu';
  besu = spawn(besuExecutable, [
    `--data-path=${chainDirectory}`,
    `--genesis-file=${genesisPath}`,
    `--node-private-key-file=${keyPath}`,
    '--rpc-http-enabled',
    '--rpc-http-host=127.0.0.1',
    '--rpc-http-port=8545',
    '--rpc-http-api=ETH,NET,WEB3',
    '--host-allowlist=127.0.0.1,localhost',
    '--p2p-host=127.0.0.1',
    '--p2p-port=30303',
    '--discovery-enabled=false',
  ], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  besu.once('error', (error) => {
    console.error(`Démarrage de Besu impossible : ${error.message}`);
  });
  besu.once('exit', (code, signal) => {
    if (!stopped) {
      console.error(`Besu s’est arrêté (code ${code ?? signal}).`);
      void shutdown(1);
    }
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (besu.exitCode !== null) throw new Error('Besu s’est arrêté avant le démarrage du RPC.');
    try {
      const response = await fetch('http://127.0.0.1:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: AbortSignal.timeout(2000),
      });
      const result = await response.json();
      if (result.result === '0x13528f6') return;
      if (result.result) throw new Error(`Chain ID Besu inattendu : ${result.result}.`);
    } catch (error) {
      if (error.message.includes('inattendu')) throw error;
    }
    await delay(2000);
  }
  throw new Error('Besu RPC did not become ready after 120 seconds.');
}

async function stopBesu() {
  if (!besu || besu.exitCode !== null) return;
  const exit = new Promise((resolve) => besu.once('exit', resolve));
  besu.kill('SIGTERM');
  const timeout = setTimeout(() => {
    if (besu.exitCode === null) besu.kill('SIGKILL');
  }, 5000);
  await exit;
  clearTimeout(timeout);
}

async function shutdown(exitCode = 0) {
  if (stopped) return;
  stopped = true;
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (historyIndex) await historyIndex.close();
  await stopBesu();
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    console.log('Arrêt de Clayde Chain Render…');
    void shutdown(0);
  });
}

try {
  await startBesu();
  historyIndex = await createHistoryIndex({
    rpcUrl: 'http://127.0.0.1:8545',
    chainId,
    directory: dataDirectory,
  });
  historyIndex.start();

  server = createServer(async (request, response) => {
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/health') {
        sendJson(response, 200, { status: 'ok', chainId, history: historyIndex.getStatus() });
      } else if (url.pathname === '/rpc') {
        await proxyRpc(request, response);
      } else if (url.pathname.startsWith('/api/history')) {
        await handleHistory(request, response, url);
      } else {
        await serveStatic(request, response, url.pathname);
      }
    } catch (error) {
      console.error(`Requête impossible (${requestAddress(request)}) : ${error.message}`);
      if (!response.headersSent) sendJson(response, 500, { error: 'Internal server error' });
      else response.destroy(error);
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  const port = Number(process.env.PORT || 10000);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });
  console.log(`Clayde Chain éphémère prête sur le port ${port} (Chain ID ${chainId}).`);
} catch (error) {
  console.error(error.message);
  await shutdown(1);
}

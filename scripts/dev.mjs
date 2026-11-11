import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { isAddress } from 'ethers';
import { createHistoryIndex } from './history-index.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const composeFile = path.join(root, 'network', 'besu', 'compose.yaml');
const composeEnv = path.join(root, '.besu', 'generated', 'compose.env');
const historyDirectory = path.join(root, '.besu');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const apps = [
  { name: 'BLOCKCHAIN', path: 'apps/blockchain', port: 5173 },
  { name: 'EXPLORER', path: 'apps/explorer', port: 5174 },
  { name: 'DAPP', path: 'apps/dapp', port: 5175 },
];
const children = [];
let stopping = false;
let networkStarted = false;
let walletServer;
let historyIndex;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} a échoué (code ${result.status ?? result.signal}).`);
  }
}

async function waitForRpc() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:8545', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
  throw new Error('Le RPC Besu ne répond pas après 120 secondes.');
}

async function startWalletApi() {
  const allowedOrigins = new Set([
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
  ]);
  walletServer = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (!allowedOrigins.has(origin)) {
      response.writeHead(403).end('Origin not allowed');
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.writeHead(204).end();
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405).end('Method not allowed');
      return;
    }
    const url = new URL(request.url, 'http://127.0.0.1:8765');
    if (url.pathname === '/api/history/status') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(JSON.stringify(historyIndex.getStatus()));
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
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(JSON.stringify(historyIndex.getHistory({
          scope,
          address,
          offset: Number(url.searchParams.get('offset') ?? 0),
          limit: Number(url.searchParams.get('limit') ?? 50),
        })));
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
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(JSON.stringify(transaction));
      return;
    }
    response.writeHead(404).end('Not found');
  });
  await new Promise((resolve, reject) => {
    walletServer.once('error', reject);
    walletServer.listen(8765, '127.0.0.1', resolve);
  });
}

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  await Promise.all(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else {
      const timeout = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
        resolve();
      }, 3000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    }
  })));
  if (walletServer?.listening) {
    await new Promise((resolve) => walletServer.close(resolve));
  }
  if (historyIndex) await historyIndex.close();
  if (networkStarted) {
    try {
      run('docker', ['compose', '--project-directory', root, '--env-file', composeEnv, '-f', composeFile, 'stop']);
    } catch (error) {
      console.error(`Arrêt Docker incomplet : ${error.message}`);
      exitCode = 1;
    }
  }
  process.exitCode = exitCode;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    console.log('\nArrêt des interfaces et validateurs Besu (les données sont conservées)…');
    void shutdown(0);
  });
}

try {
  console.log('1/3 · Préparation du Genesis local…');
  run(process.execPath, [path.join(root, 'network', 'besu', 'setup.js')]);

  console.log('2/3 · Démarrage de Besu…');
  try {
    run('docker', ['info'], { stdio: 'pipe' });
  } catch {
    throw new Error('Docker Desktop n’est pas démarré. Ouvrez-le, attendez “Engine running”, puis relancez npm run dev.');
  }
  networkStarted = true;
  run('docker', [
    'compose', '--project-directory', root, '--env-file', composeEnv, '-f', composeFile, 'up', '-d',
  ], { stdio: 'pipe' });
  await waitForRpc();
  historyIndex = await createHistoryIndex({
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 20261110,
    directory: historyDirectory,
  });
  historyIndex.start();
  await startWalletApi();

  console.log('3/3 · Démarrage des trois interfaces…');
  for (const app of apps) {
    const config = path.join(root, app.path, 'vite.config.js');
    const child = spawn(process.execPath, [
      viteCli,
      '--config', config,
      '--host', '127.0.0.1',
      '--port', String(app.port),
      '--strictPort',
    ], {
      cwd: path.join(root, app.path),
      env: process.env,
      stdio: 'inherit',
    });
    children.push(child);
    child.once('error', (error) => {
      console.error(`Erreur de démarrage ${app.name} : ${error.message}`);
      void shutdown(1);
    });
    child.once('exit', (code) => {
      if (!stopping) {
        console.error(`${app.name} s’est arrêté${code === 0 ? '' : ` (code ${code})`}.`);
        void shutdown(code || 1);
      }
    });
  }

  console.log('\nClayde Chain est prêt :');
  console.log('  Blockchain : http://127.0.0.1:5173');
  console.log('  Explorer   : http://127.0.0.1:5174');
  console.log('  DApp       : http://127.0.0.1:5175');
  console.log('  RPC local  : http://127.0.0.1:8545');
  console.log('Gardez ce terminal ouvert. Ctrl+C arrête les services sans effacer les données.\n');
} catch (error) {
  console.error(`Démarrage impossible : ${error.message}`);
  await shutdown(1);
}

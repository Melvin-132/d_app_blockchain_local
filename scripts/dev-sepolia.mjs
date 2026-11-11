import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const apps = [
  { name: 'Blockchain', path: 'apps/blockchain', port: 5173 },
  { name: 'Explorer', path: 'apps/explorer', port: 5174 },
  { name: 'DApp', path: 'apps/dapp', port: 5175 },
];
const children = [];
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  process.exitCode = exitCode;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => stop());
}

for (const app of apps) {
  const child = spawn(process.execPath, [
    viteCli,
    app.path,
    '--config',
    path.join(root, app.path, 'vite.config.js'),
    '--host',
    '127.0.0.1',
    '--port',
    String(app.port),
  ], { cwd: root, stdio: 'inherit', env: process.env });
  children.push(child);
  child.once('error', (error) => {
    console.error(`Impossible de démarrer ${app.name} : ${error.message}`);
    stop(1);
  });
  child.once('exit', (code) => {
    if (!stopping) {
      console.error(`${app.name} s’est arrêté${code ? ` (code ${code})` : ''}.`);
      stop(code || 1);
    }
  });
}

console.log('Interfaces Sepolia démarrées :');
console.log('- Blockchain : http://127.0.0.1:5173');
console.log('- Explorer : http://127.0.0.1:5174');
console.log('- DApp : http://127.0.0.1:5175');
console.log('Appuyez sur Ctrl+C pour arrêter.');

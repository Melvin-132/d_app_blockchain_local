import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = path.join(root, 'public');
const builds = [
  ['build:blockchain', 'blockchain'],
  ['build:explorer', 'explorer'],
  ['build:dapp', 'dapp'],
];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const [command, page] of builds) {
  const npmArgs = ['run', command, '--', '--base', `/${page}/`];
  const executable = process.platform === 'win32' ? process.env.ComSpec : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm.cmd ${npmArgs.join(' ')}`]
    : npmArgs;
  const result = spawnSync(
    executable,
    args,
    { cwd: root, stdio: 'inherit' },
  );
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
  cpSync(
    path.join(root, 'apps', page, 'dist'),
    path.join(output, page),
    { recursive: true },
  );
}

writeFileSync(
  path.join(output, 'index.html'),
  '<!doctype html><meta http-equiv="refresh" content="0;url=/dapp/"><a href="/dapp/">Ouvrir la DApp</a>\n',
);

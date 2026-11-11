import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const containerName = 'clayde-codespaces-demo';
const imageName = 'clayde-codespaces-demo';
const port = 10000;
const fundedAddress = process.env.BESU_GENESIS_ADDRESS || '0xbb6100cE6a2a4781f1BFC4aA2f40E97f9326C6F1';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}.`));
    });
  });
}

if (process.argv[2] === 'stop') {
  await run('docker', ['stop', containerName]);
} else {
  await run('docker', ['build', '--tag', imageName, '.']);
  await run('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    containerName,
    '--publish',
    `${port}:${port}`,
    '--env',
    `BESU_GENESIS_ADDRESS=${fundedAddress}`,
    imageName,
  ]);

  let lastError;
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        console.log(`Clayde Chain is ready at http://localhost:${port}. Set this Codespaces port to Public to share it.`);
        ready = true;
        break;
      }
      lastError = new Error(`Health check returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(2000);
  }

  if (!ready) {
    let message = lastError?.message || 'health check timed out';
    try {
      await run('docker', ['logs', containerName]);
    } catch (error) {
      message += ` Logs unavailable: ${error.message}`;
    }
    try {
      await run('docker', ['stop', containerName]);
    } catch (error) {
      message += ` Container cleanup failed: ${error.message}`;
    }
    throw new Error(`Clayde Chain did not become ready: ${message}`);
  }
}

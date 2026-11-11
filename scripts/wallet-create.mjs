import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Wallet } from 'ethers';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const generated = path.join(root, '.besu', 'generated');
const keystorePath = path.join(generated, 'wallet-keystore.json');

async function exists(file) {
  try {
    await readFile(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function readHidden(prompt) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Lancez npm run wallet:create directement dans un terminal interactif.');
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish(new Error('Création du portefeuille annulée.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    stdout.write(prompt);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  await mkdir(generated, { recursive: true });
  if (await exists(keystorePath)) {
    throw new Error('Un portefeuille local existe déjà. Aucun fichier n’a été modifié.');
  }

  const password = await readHidden('Choisissez un mot de passe (12 caractères minimum) : ');
  if (password.length < 12) {
    throw new Error('Le mot de passe doit contenir au moins 12 caractères.');
  }
  const confirmation = await readHidden('Confirmez le mot de passe : ');
  if (password !== confirmation) {
    throw new Error('Les mots de passe ne correspondent pas.');
  }

  const wallet = Wallet.createRandom();
  const keystore = await wallet.encrypt(password);
  const temporaryPath = `${keystorePath}.tmp`;
  await writeFile(temporaryPath, `${keystore}\n`, { flag: 'wx', mode: 0o600 });
  await rename(temporaryPath, keystorePath);

  console.log(`Portefeuille local créé : ${wallet.address}`);
  console.log('La clé privée est chiffrée dans .besu/generated/wallet-keystore.json.');
  console.log('Gardez ce mot de passe en lieu sûr; il ne peut pas être récupéré.');
  console.log('Au prochain npm run dev, le Genesis attribuera 1 000 000 CYD à cette adresse.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

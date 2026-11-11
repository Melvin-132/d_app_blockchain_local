import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Wallet, getAddress, isAddress } from 'ethers';
import { BLOCK_PERIOD_SECONDS, CHAIN_ID, VALIDATOR_COUNT, createGenesis } from './genesis.js';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const generated = path.join(root, '.besu', 'generated');
const keysDir = path.join(generated, 'node-keys');
const dataDir = path.join(root, '.besu', 'data');
const walletPath = path.join(generated, 'wallet-keystore.json');

async function exists(file) {
  try {
    await readFile(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function readOrCreateValidator(index) {
  const name = `validator${index}`;
  const keyPath = path.join(keysDir, `${name}.key`);
  let privateKey;
  if (await exists(keyPath)) {
    privateKey = `0x${(await readFile(keyPath, 'utf8')).trim()}`;
  } else {
    privateKey = Wallet.createRandom().privateKey;
    await writeFile(keyPath, `${privateKey.slice(2)}\n`, { flag: 'wx', mode: 0o600 });
  }
  const wallet = new Wallet(privateKey);
  return {
    name,
    address: wallet.address,
    enode: `enode://${wallet.signingKey.publicKey.slice(4)}@172.31.0.${10 + index}:30303`,
  };
}

async function main() {
  await mkdir(keysDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  if (!(await exists(walletPath))) {
    throw new Error('Portefeuille local manquant. Exécutez npm run wallet:create avant le démarrage.');
  }
  const keystore = JSON.parse(await readFile(walletPath, 'utf8'));
  const fundedAddress = `0x${keystore.address}`;
  if (!isAddress(fundedAddress)) {
    throw new Error('L’adresse publique du portefeuille local chiffré est invalide.');
  }

  const statePath = path.join(generated, 'network-state.json');
  const entries = await readdir(dataDir);
  const stateExists = await exists(statePath);
  if (entries.length > 0 && !stateExists) {
    throw new Error(
      'Des données Besu existent sans leur fichier de configuration. '
      + 'Aucune donnée n’a été modifiée; restaurez le fichier network-state.json.',
    );
  }
  if (entries.length > 0 && stateExists) {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    if (
      state.chainId !== CHAIN_ID
      || state.fundedAddress.toLowerCase() !== getAddress(fundedAddress).toLowerCase()
    ) {
      throw new Error(
        'Les données Besu existantes ne correspondent pas à cette configuration. '
        + 'Aucune donnée n’a été modifiée.',
      );
    }
  }

  const validators = await Promise.all(
    Array.from({ length: VALIDATOR_COUNT }, (_, index) => readOrCreateValidator(index + 1)),
  );
  const genesis = createGenesis(validators, fundedAddress);
  await writeFile(path.join(generated, 'genesis.json'), `${JSON.stringify(genesis, null, 2)}\n`);
  await writeFile(
    path.join(generated, 'compose.env'),
    `BESU_BOOTNODES=${validators.map(({ enode }) => enode).join(',')}\n`,
  );
  await writeFile(
    statePath,
    `${JSON.stringify({
      chainId: CHAIN_ID,
      fundedAddress: getAddress(fundedAddress),
      validators: validators.map(({ name, address }) => ({ name, address })),
    }, null, 2)}\n`,
  );

  console.log(`Clayde Chain local préparée (chain ID ${CHAIN_ID}, ${VALIDATOR_COUNT} validateurs QBFT, blocs toutes les ${BLOCK_PERIOD_SECONDS} secondes).`);
  console.log(`Compte Genesis préfinancé : ${getAddress(fundedAddress)} (1 000 000 CYD).`);
  console.log('Les clés de validateurs et les données de chaîne restent dans .besu/.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

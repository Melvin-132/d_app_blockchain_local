import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFileSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContractFactory, JsonRpcProvider, Wallet, formatEther, isAddress } from 'ethers';
import solc from 'solc';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const contractPath = path.join(root, 'contracts', 'ClaydeToken.sol');
const deploymentPath = path.join(root, 'contracts', 'sepolia-deployment.json');
const openZeppelinRoot = path.join(root, 'node_modules', '@openzeppelin', 'contracts');
const rpcUrl = process.env.VITE_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';

function compileContract() {
  const input = {
    language: 'Solidity',
    sources: {
      'ClaydeToken.sol': { content: readFileSync(contractPath, 'utf8') },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object'] },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), {
    import(importPath) {
      const resolved = path.resolve(root, 'node_modules', importPath);
      if (!resolved.startsWith(`${openZeppelinRoot}${path.sep}`)) {
        return { error: `Import is outside OpenZeppelin contracts: ${importPath}` };
      }
      try {
        return { contents: readFileSync(resolved, 'utf8') };
      } catch {
        return { error: `Could not read Solidity import: ${importPath}` };
      }
    },
  }));
  const messages = output.errors ?? [];
  for (const message of messages.filter(({ severity }) => severity === 'warning')) {
    console.warn(message.formattedMessage);
  }
  const errors = messages.filter(({ severity }) => severity === 'error');
  if (errors.length) {
    throw new Error(errors.map(({ formattedMessage }) => formattedMessage).join('\n'));
  }
  const artifact = output.contracts?.['ClaydeToken.sol']?.ClaydeToken;
  if (!artifact?.abi || !artifact.evm.bytecode.object) {
    throw new Error('Solidity compiler did not produce the ClaydeToken contract artifact.');
  }
  return artifact;
}

async function promptPassword() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Lancez cette commande dans un terminal interactif pour saisir le mot de passe sans l’afficher.');
  }
  stdout.write('Mot de passe du fichier wallet (saisie masquée) : ');
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let password = '';
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Saisie annulée.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(password);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          password = password.slice(0, -1);
        } else {
          password += character;
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const artifact = compileContract();
  console.log(`Contrat CYD compilé avec solc ${solc.version()}. Offre initiale fixe : 1 000 000 CYD.`);
  if (process.argv.includes('--compile-only')) return;

  const currentDeployment = JSON.parse(await readFile(deploymentPath, 'utf8'));
  if (currentDeployment.address && isAddress(currentDeployment.address)
    && Number(currentDeployment.blockNumber) > 0) {
    throw new Error(`Un contrat CYD est déjà configuré à ${currentDeployment.address}. Refus de déployer un doublon.`);
  }

  const prompts = createInterface({ input: stdin, output: stdout });
  let keystorePath;
  try {
    keystorePath = await prompts.question('Chemin du fichier JSON wallet chiffré (laisser vide pour clayde-wallet-keystore.json) : ');
  } finally {
    prompts.close();
  }
  const enteredKeystorePath = keystorePath.trim().replace(/^(["'])(.*)\1$/, '$2');
  const resolvedKeystorePath = path.resolve(root, enteredKeystorePath || 'clayde-wallet-keystore.json');
  const keystore = await readFile(resolvedKeystorePath, 'utf8');
  const password = await promptPassword();
  const wallet = await Wallet.fromEncryptedJson(keystore, password);
  const provider = new JsonRpcProvider(rpcUrl, 11155111, { staticNetwork: true });
  const network = await provider.getNetwork();
  if (network.chainId !== 11155111n) {
    throw new Error(`Le RPC est sur le réseau ${network.chainId}, Sepolia (11155111) était attendu.`);
  }
  const deployer = wallet.connect(provider);
  const balance = await provider.getBalance(deployer.address);
  console.log(`Adresse de déploiement : ${deployer.address}`);
  console.log(`Solde Sepolia ETH : ${formatEther(balance)} ETH (ETH de test seulement).`);
  console.log('La clé privée est déchiffrée uniquement en mémoire et ne sera pas affichée ni enregistrée.');
  const confirmation = createInterface({ input: stdin, output: stdout });
  let answer;
  try {
    answer = await confirmation.question('Pour déployer et attribuer les 1 000 000 CYD à cette adresse, tapez DEPLOY : ');
  } finally {
    confirmation.close();
  }
  if (answer !== 'DEPLOY') {
    console.log('Déploiement annulé; aucune transaction n’a été envoyée.');
    return;
  }

  const factory = new ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, deployer);
  const contract = await factory.deploy();
  const transaction = contract.deploymentTransaction();
  if (!transaction) throw new Error('Le fournisseur n’a pas retourné la transaction de déploiement.');
  console.log(`Transaction de déploiement : ${transaction.hash}`);
  const receipt = await transaction.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error('La transaction de déploiement n’a pas été confirmée avec succès.');
  }
  const address = await contract.getAddress();
  const deployment = { address, blockNumber: receipt.blockNumber };
  const temporaryPath = `${deploymentPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(deployment, null, 2)}\n`, { flag: 'wx' });
  await rename(temporaryPath, deploymentPath);
  console.log(`Contrat CYD déployé : ${address}`);
  console.log(`Bloc de déploiement : ${receipt.blockNumber}`);
  console.log(`Configuration enregistrée dans ${path.relative(root, deploymentPath)}.`);
  console.log(`Transaction : https://sepolia.etherscan.io/tx/${transaction.hash}`);
  console.log('Après vérification, publiez ces changements sur GitHub pour lancer le déploiement Pages.');
}

main().catch((error) => {
  console.error(`Déploiement CYD impossible : ${error.message}`);
  process.exitCode = 1;
});

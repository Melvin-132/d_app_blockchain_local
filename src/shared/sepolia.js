import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  formatUnits,
  getAddress,
  id,
  parseUnits,
} from 'ethers';
import { fetchContractTransferLogs } from './blockscout.js';
import deployment from '../../contracts/sepolia-deployment.json';

const transferInterface = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const transferTopic = id('Transfer(address,address,uint256)');
const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const provider = new JsonRpcProvider(
  rpcUrl,
  11155111,
  { staticNetwork: true },
);
const WALLET_STORAGE_KEY = 'clayde.wallet.keystore';
const eventCache = { logs: null, refreshedAt: 0, pending: null };
const HISTORY_CACHE_TTL_MS = 15_000;
const RPC_HEAD_SAFETY_BLOCKS = 2;
const deploymentBlock = Number(import.meta.env.VITE_CYD_DEPLOYMENT_BLOCK || deployment.blockNumber);
const siteBase = import.meta.env.BASE_URL.replace(/(?:blockchain|explorer|dapp)\/$/, '');
const pageUrl = (page, port) => import.meta.env.DEV
  ? `http://127.0.0.1:${port}/`
  : `${siteBase}${page}/`;

export const CHAIN = {
  id: 11155111n,
  hexId: '0xaa36a7',
  name: 'Sepolia',
  symbol: 'ETH',
  decimals: 18,
  rpcUrl,
  tokenAddress: import.meta.env.VITE_CYD_TOKEN_ADDRESS || deployment.address,
  deploymentBlock,
  fundedSupply: '1000000',
  blockchainUrl: pageUrl('blockchain', 5173),
  explorerUrl: pageUrl('explorer', 5174),
  dappUrl: pageUrl('dapp', 5175),
};

async function connectBrowserWallet(wallet) {
  const network = await provider.getNetwork();
  if (network.chainId !== CHAIN.id) {
    throw new Error(`Chain ID RPC inattendu : ${network.chainId}. Attendu : ${CHAIN.id}.`);
  }
  return wallet.connect(provider);
}

export async function createBrowserWallet(password) {
  if (password.length < 12) {
    throw new Error('Choisissez un mot de passe d’au moins 12 caractères.');
  }
  if (window.localStorage.getItem(WALLET_STORAGE_KEY)) {
    throw new Error('Un portefeuille est déjà enregistré. Téléchargez sa sauvegarde ou utilisez un autre profil de navigateur.');
  }
  const wallet = Wallet.createRandom();
  const keystore = await wallet.encrypt(password);
  const connectedWallet = await connectBrowserWallet(wallet);
  window.localStorage.setItem(WALLET_STORAGE_KEY, keystore);
  return connectedWallet;
}

export async function importBrowserWallet(keystore, password) {
  const contents = keystore.trim();
  if (!contents) {
    throw new Error('Sélectionnez un fichier JSON de portefeuille chiffré.');
  }
  const wallet = await Wallet.fromEncryptedJson(contents, password);
  const connectedWallet = await connectBrowserWallet(wallet);
  const existingKeystore = window.localStorage.getItem(WALLET_STORAGE_KEY);
  if (existingKeystore && existingKeystore !== contents) {
    throw new Error('Un autre portefeuille est déjà enregistré. Sauvegardez-le ou utilisez un autre profil de navigateur.');
  }
  window.localStorage.setItem(WALLET_STORAGE_KEY, contents);
  return connectedWallet;
}

export async function unlockBrowserWallet(password) {
  const keystore = window.localStorage.getItem(WALLET_STORAGE_KEY);
  if (!keystore) {
    throw new Error('Aucun portefeuille enregistré. Créez un portefeuille ou importez son fichier chiffré.');
  }
  const wallet = await Wallet.fromEncryptedJson(keystore, password);
  return connectBrowserWallet(wallet);
}

export function hasBrowserWallet() {
  return Boolean(window.localStorage.getItem(WALLET_STORAGE_KEY));
}

export function downloadWalletBackup() {
  const keystore = window.localStorage.getItem(WALLET_STORAGE_KEY);
  if (!keystore) {
    throw new Error('Aucun portefeuille chiffré à sauvegarder dans ce navigateur.');
  }
  const blob = new Blob([keystore], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'clayde-wallet-keystore.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getTokenAddress() {
  if (!/^0x[a-fA-F0-9]{40}$/.test(CHAIN.tokenAddress)) {
    throw new Error('Le contrat CYD n’est pas encore configuré pour ce site.');
  }
  if (!Number.isSafeInteger(deploymentBlock) || deploymentBlock <= 0) {
    throw new Error('Le bloc de déploiement du contrat CYD n’est pas encore configuré.');
  }
  return getAddress(CHAIN.tokenAddress);
}

function tokenContract(signerOrProvider = provider) {
  return new Contract(
    getTokenAddress(),
    [
      'function balanceOf(address) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)',
      'event Transfer(address indexed from, address indexed to, uint256 value)',
    ],
    signerOrProvider,
  );
}

function hasDeploymentConfiguration() {
  return Boolean(CHAIN.tokenAddress) || deploymentBlock !== 0;
}

async function loadTransferLogs(fromBlock, toBlock) {
  if (toBlock < fromBlock) return [];
  const contractAddress = getTokenAddress();
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += 2000) {
    const end = Math.min(start + 1999, toBlock);
    logs.push(...await provider.getLogs({
      address: contractAddress,
      topics: [transferTopic],
      fromBlock: start,
      toBlock: end,
    }));
  }
  return logs;
}

async function allTransferLogs() {
  const latestBlock = Math.max(
    0,
    await provider.getBlockNumber() - RPC_HEAD_SAFETY_BLOCKS,
  );
  if (!eventCache.logs || Date.now() - eventCache.refreshedAt >= HISTORY_CACHE_TTL_MS) {
    if (!eventCache.pending) {
      eventCache.pending = fetchContractTransferLogs(getTokenAddress(), transferTopic)
        .then((logs) => {
          eventCache.logs = logs.filter((log) => log.blockNumber >= deploymentBlock);
          eventCache.refreshedAt = Date.now();
        })
        .finally(() => {
          eventCache.pending = null;
        });
    }
    await eventCache.pending;
  }
  return { latestBlock, logs: eventCache.logs };
}

async function normalizeLogs(logs) {
  const blocks = new Map();
  const records = await Promise.all(logs.map(async (log) => {
    const parsed = transferInterface.parseLog(log);
    if (log.timestamp === undefined && !blocks.has(log.blockNumber)) {
      blocks.set(log.blockNumber, provider.getBlock(log.blockNumber));
    }
    const block = log.timestamp === undefined ? await blocks.get(log.blockNumber) : null;
    return {
      hash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.index,
      timestamp: log.timestamp ?? block?.timestamp ?? 0,
      from: getAddress(parsed.args.from),
      to: getAddress(parsed.args.to),
      amount: formatUnits(parsed.args.value, 18),
      value: 0n,
      fee: null,
      status: 1,
      input: '0x',
      tokenTransfers: [{
        from: getAddress(parsed.args.from),
        to: getAddress(parsed.args.to),
        value: parsed.args.value,
        contractAddress: getTokenAddress(),
        tokenSymbol: 'CYD',
      }],
    };
  }));
  return records.sort((a, b) => b.blockNumber - a.blockNumber);
}

export async function getCydBalance(address) {
  return tokenContract().balanceOf(getAddress(address));
}

export async function getChainSnapshot(blockLimit = 20) {
  const latestBlock = await provider.getBlockNumber();
  const start = Math.max(0, latestBlock - blockLimit + 1);
  const blocks = await Promise.all(
    Array.from({ length: latestBlock - start + 1 }, (_, index) => provider.getBlock(start + index, true)),
  );
  const logs = hasDeploymentConfiguration()
    ? await loadTransferLogs(
      Math.max(start, deploymentBlock),
      Math.max(0, latestBlock - RPC_HEAD_SAFETY_BLOCKS),
    )
    : [];
  const transfers = await normalizeLogs(logs);
  const transferCounts = new Map();
  for (const log of logs) {
    transferCounts.set(log.blockNumber, (transferCounts.get(log.blockNumber) || 0) + 1);
  }
  const normalizedBlocks = blocks.filter(Boolean).reverse().map((block) => ({
    number: block.number,
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: block.timestamp,
    transactions: block.transactions.length,
    transfers: transferCounts.get(block.number) || 0,
    transferList: transfers.filter((transfer) => transfer.blockNumber === block.number),
  }));
  const addresses = new Set(transfers.flatMap((transfer) => [transfer.from, transfer.to]));
  return {
    chainId: Number(CHAIN.id),
    latestBlock,
    blocks: normalizedBlocks,
    transfers,
    activeAddresses: addresses.size,
    indexedBlocks: normalizedBlocks.length,
  };
}

export async function getIndexedHistory({ scope, address, offset = 0, limit = 50 }) {
  const { latestBlock, logs } = hasDeploymentConfiguration()
    ? await allTransferLogs()
    : { latestBlock: await provider.getBlockNumber(), logs: [] };
  const matchingLogs = logs.filter((log) => {
    if (!address) return true;
    const parsed = transferInterface.parseLog(log);
    const target = getAddress(address).toLowerCase();
    return parsed.args.from.toLowerCase() === target || parsed.args.to.toLowerCase() === target;
  }).sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index);
  const records = await normalizeLogs(matchingLogs.slice(offset, offset + limit));
  return {
    scope,
    records,
    total: matchingLogs.length,
    indexedThrough: latestBlock,
    latestBlock,
    complete: true,
  };
}

export async function searchChain(value) {
  const query = value.trim();
  if (/^\d+$/.test(query)) {
    const block = await provider.getBlock(Number(query), true);
    if (!block) throw new Error(`Bloc #${query} introuvable sur Sepolia.`);
    const logs = await loadTransferLogs(Number(query), Number(query));
    return { type: 'block', block, transfers: await normalizeLogs(logs) };
  }
  if (/^0x[a-fA-F0-9]{64}$/.test(query)) {
    const [transaction, receipt] = await Promise.all([
      provider.getTransaction(query),
      provider.getTransactionReceipt(query),
    ]);
    if (!transaction) throw new Error('Transaction introuvable sur Sepolia.');
    const tokenTransfers = (receipt?.logs || [])
      .filter((log) => log.address.toLowerCase() === getTokenAddress().toLowerCase()
        && log.topics[0] === transferTopic)
      .map((log) => {
        const parsed = transferInterface.parseLog(log);
        return {
          from: getAddress(parsed.args.from),
          to: getAddress(parsed.args.to),
          value: parsed.args.value,
        };
      });
    return { type: 'transaction', transaction, receipt, tokenTransfers };
  }
  if (/^0x[a-fA-F0-9]{40}$/.test(query)) {
    const normalizedAddress = getAddress(query);
    const history = await getIndexedHistory({ scope: 'wallet', address: normalizedAddress, limit: 100 });
    return { type: 'address', address: normalizedAddress, history };
  }
  throw new Error('Saisissez un numéro de bloc, un hash de transaction ou une adresse 0x valide.');
}

export function shorten(value, start = 10, end = 6) {
  if (!value) return '—';
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

export function formatCyd(value, maximumFractionDigits = 4) {
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits });
}

export function formatCydUnits(value, maximumFractionDigits = 18) {
  const units = BigInt(value);
  const sign = units < 0n ? '−' : '';
  const decimal = formatUnits(units < 0n ? -units : units, 18);
  const [whole, fraction = ''] = decimal.split('.');
  const displayedFraction = fraction.slice(0, maximumFractionDigits).replace(/0+$/, '');
  const groupedWhole = BigInt(whole).toLocaleString('fr-FR');
  return `${sign}${groupedWhole}${displayedFraction ? `,${displayedFraction}` : ''}`;
}

export async function estimateCydTransfer(signer, recipient, amount) {
  const to = getAddress(recipient);
  const value = parseUnits(amount.replace(',', '.'), 18);
  const contract = tokenContract(signer);
  const [gasLimit, feeData, balance, tokenBalance] = await Promise.all([
    contract.transfer.estimateGas(to, value),
    provider.getFeeData(),
    provider.getBalance(await signer.getAddress()),
    contract.balanceOf(await signer.getAddress()),
  ]);
  const feePerGas = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (feePerGas === null) throw new Error('Impossible de récupérer les frais Sepolia.');
  if (tokenBalance < value) throw new Error('Solde CYD insuffisant.');
  const fee = gasLimit * feePerGas;
  if (balance < fee) throw new Error('Solde Sepolia ETH insuffisant pour payer les frais de transaction.');
  return { gasLimit, fee, value };
}

export async function sendCyd(signer, recipient, amount) {
  const estimate = await estimateCydTransfer(signer, recipient, amount);
  return tokenContract(signer).transfer(getAddress(recipient), estimate.value, {
    gasLimit: estimate.gasLimit,
  });
}

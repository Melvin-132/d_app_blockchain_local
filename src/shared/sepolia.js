import {
  BrowserProvider,
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  formatUnits,
  getAddress,
  id,
} from 'ethers';
import {
  fetchContractTransferLogs,
  fetchWalletTokenTransfers,
  normalizeWalletTokenTransfers,
} from './routescan.js';
import { parseCydTransferAmount, parseEthTransferAmount } from './transfer-amount.js';
import { normalizeRecoveryPhrase } from './recovery-phrase.js';
import { getRetryLogRangeEnd } from './rpc-log-range.js';
import { ensureWalletNetwork } from './wallet-network.js';
import { assertStrongWalletPassword } from './wallet-password.js';
import { getStoredWallet, getStoredWallets, saveStoredWallet } from './wallet-storage.js';
import deployment from '../../contracts/sepolia-deployment.json';

const transferInterface = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const transferTopic = id('Transfer(address,address,uint256)');
const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const ethereumMainnetRpcUrl = import.meta.env.VITE_ETHEREUM_MAINNET_RPC_URL
  || 'https://ethereum-rpc.publicnode.com';
const provider = new JsonRpcProvider(
  rpcUrl,
  11155111,
  { staticNetwork: true },
);
const ethereumMainnetProvider = new JsonRpcProvider(
  ethereumMainnetRpcUrl,
  1,
  { staticNetwork: true },
);
const RPC_HEAD_SAFETY_BLOCKS = 2;
const CONTRACT_HISTORY_CACHE_TTL_MS = 30_000;
const deploymentBlock = Number(import.meta.env.VITE_CYD_DEPLOYMENT_BLOCK || deployment.blockNumber);
let contractHistoryCache = null;
let contractHistoryRequest = null;
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

export const ETHEREUM_MAINNET = {
  id: 1n,
  hexId: '0x1',
  name: 'Ethereum Mainnet',
  symbol: 'ETH',
  decimals: 18,
  rpcUrl: ethereumMainnetRpcUrl,
  explorerUrl: 'https://etherscan.io',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

async function connectBrowserWallet(wallet) {
  const network = await provider.getNetwork();
  if (network.chainId !== CHAIN.id) {
    throw new Error(`Chain ID RPC inattendu : ${network.chainId}. Attendu : ${CHAIN.id}.`);
  }
  return wallet.connect(provider);
}

export async function createBrowserWallet(password) {
  assertStrongWalletPassword(password);
  const wallet = Wallet.createRandom();
  const keystore = await wallet.encrypt(password);
  const connectedWallet = await connectBrowserWallet(wallet);
  saveStoredWallet(window.localStorage, connectedWallet.address, keystore);
  return connectedWallet;
}

export async function importBrowserWallet(keystore, password) {
  const contents = keystore.trim();
  if (!contents) {
    throw new Error('Sélectionnez un fichier JSON de portefeuille chiffré.');
  }
  const wallet = await Wallet.fromEncryptedJson(contents, password);
  const connectedWallet = await connectBrowserWallet(wallet);
  saveStoredWallet(window.localStorage, connectedWallet.address, contents);
  return connectedWallet;
}

export async function importBrowserWalletFromPhrase(phrase, password) {
  const normalizedPhrase = normalizeRecoveryPhrase(phrase);
  assertStrongWalletPassword(password);
  const wallet = Wallet.fromPhrase(normalizedPhrase);
  const keystore = await wallet.encrypt(password);
  const connectedWallet = await connectBrowserWallet(wallet);
  saveStoredWallet(window.localStorage, connectedWallet.address, keystore);
  return connectedWallet;
}

async function getMetaMaskWallet(asset, accountRequestMethod) {
  const injectedProvider = window.ethereum;
  if (!injectedProvider?.request) {
    throw new Error('MetaMask est introuvable. Installez ou activez son extension, puis réessayez.');
  }
  if (!['CYD', 'ETH'].includes(asset)) {
    throw new Error('Choisissez CYD sur Sepolia ou ETH sur Ethereum Mainnet.');
  }
  const network = asset === 'ETH' ? ETHEREUM_MAINNET : CHAIN;

  const accounts = await injectedProvider.request({ method: accountRequestMethod });
  if (!Array.isArray(accounts) || !accounts[0]) {
    throw new Error('MetaMask n’a pas partagé de compte avec cette application.');
  }

  await ensureWalletNetwork(injectedProvider, {
    ...network,
    nativeCurrency: asset === 'ETH'
      ? ETHEREUM_MAINNET.nativeCurrency
      : { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: asset === 'ETH'
      ? ETHEREUM_MAINNET.explorerUrl
      : 'https://sepolia.etherscan.io',
  });

  const browserProvider = new BrowserProvider(injectedProvider);
  return browserProvider.getSigner(accounts[0]);
}

export function connectMetaMaskWallet(asset = 'CYD') {
  return getMetaMaskWallet(asset, 'eth_requestAccounts');
}

export function reconnectMetaMaskWallet(asset = 'CYD') {
  return getMetaMaskWallet(asset, 'eth_accounts');
}

export async function restoreBrowserWalletSession(privateKey, address) {
  const wallet = new Wallet(privateKey);
  if (wallet.address.toLowerCase() !== address.toLowerCase()) {
    throw new Error('La clé de session ne correspond pas au portefeuille enregistré.');
  }
  return connectBrowserWallet(wallet);
}

export async function unlockBrowserWallet(password, address) {
  const wallets = getStoredWallets(window.localStorage);
  if (!wallets.length) {
    throw new Error('Aucun portefeuille enregistré. Créez un portefeuille ou importez son fichier chiffré.');
  }
  const selectedAddress = address || (wallets.length === 1 ? wallets[0].address : '');
  if (!selectedAddress) {
    throw new Error('Choisissez le portefeuille que vous souhaitez ouvrir.');
  }
  const savedWallet = getStoredWallet(window.localStorage, selectedAddress);
  if (!savedWallet) {
    throw new Error('Le portefeuille choisi n’est plus enregistré dans ce navigateur.');
  }
  const wallet = await Wallet.fromEncryptedJson(savedWallet.keystore, password);
  if (wallet.address.toLowerCase() !== savedWallet.address.toLowerCase()) {
    throw new Error('Le fichier déchiffré ne correspond pas à l’adresse du portefeuille enregistré.');
  }
  return connectBrowserWallet(wallet);
}

export function getBrowserWalletAddresses() {
  return getStoredWallets(window.localStorage).map(({ address }) => address);
}

export function hasBrowserWallet() {
  return getStoredWallets(window.localStorage).length > 0;
}

export function downloadWalletBackup(address) {
  const savedWallet = getStoredWallet(window.localStorage, address);
  if (!savedWallet) {
    throw new Error('Aucun portefeuille chiffré à sauvegarder dans ce navigateur.');
  }
  const blob = new Blob([savedWallet.keystore], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `clayde-wallet-${savedWallet.address.slice(2, 8).toLowerCase()}.json`;
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
  for (let start = fromBlock; start <= toBlock;) {
    const end = Math.min(start + 1999, toBlock);
    let queryEnd = end;
    let result;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await provider.getLogs({
          address: contractAddress,
          topics: [transferTopic],
          fromBlock: start,
          toBlock: queryEnd,
        });
        break;
      } catch (error) {
        const retryEnd = getRetryLogRangeEnd(error, start, queryEnd);
        if (retryEnd === null) throw error;
        lastError = error;
        queryEnd = retryEnd;
      }
    }
    if (!result) {
      if (lastError) throw lastError;
      throw new Error('Le RPC Sepolia n’a pas pu lire les journaux jusqu’à sa tête actuelle.');
    }
    logs.push(...result);
    if (queryEnd < end) break;
    start = end + 1;
  }
  return logs;
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
  return records.sort((a, b) =>
    b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}

export async function getRecentCydHistory(address, limit = 50) {
  const normalizedAddress = getAddress(address);
  const contractAddress = getTokenAddress();
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(deploymentBlock, latestBlock - 1999);
  const addressTopic = `0x${normalizedAddress.slice(2).toLowerCase().padStart(64, '0')}`;
  const [outgoingLogs, incomingLogs] = await Promise.all([
    provider.getLogs({
      address: contractAddress,
      topics: [transferTopic, addressTopic],
      fromBlock,
      toBlock: latestBlock,
    }),
    provider.getLogs({
      address: contractAddress,
      topics: [transferTopic, null, addressTopic],
      fromBlock,
      toBlock: latestBlock,
    }),
  ]);
  const uniqueLogs = new Map();
  for (const log of [...outgoingLogs, ...incomingLogs]) {
    uniqueLogs.set(`${log.transactionHash.toLowerCase()}-${log.index}`, log);
  }
  const records = (await normalizeLogs([...uniqueLogs.values()])).slice(0, limit);
  return { records, latestBlock };
}

export async function getCydBalance(address, blockTag) {
  const contract = tokenContract();
  return blockTag === undefined
    ? contract.balanceOf(getAddress(address))
    : contract.balanceOf(getAddress(address), { blockTag });
}

export async function getMainnetEthBalance(address) {
  return ethereumMainnetProvider.getBalance(getAddress(address));
}

export async function getSepoliaEthBalance(address) {
  return provider.getBalance(getAddress(address));
}

export function formatEthUnits(value, maximumFractionDigits = 6) {
  const decimal = formatUnits(BigInt(value), 18);
  const [whole, fraction = ''] = decimal.split('.');
  const displayedFraction = fraction.slice(0, maximumFractionDigits).replace(/0+$/, '');
  const groupedWhole = BigInt(whole).toLocaleString('fr-FR');
  return `${groupedWhole}${displayedFraction ? `,${displayedFraction}` : ''}`;
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
  const contractAddress = getTokenAddress();
  if (!address) {
    if (scope !== 'transfers') {
      throw new Error('Une adresse de portefeuille est requise pour charger son historique.');
    }
    const now = Date.now();
    let logs;
    if (contractHistoryCache?.contractAddress === contractAddress
      && now - contractHistoryCache.fetchedAt < CONTRACT_HISTORY_CACHE_TTL_MS) {
      logs = contractHistoryCache.logs;
    } else if (contractHistoryRequest) {
      logs = await contractHistoryRequest;
    } else {
      contractHistoryRequest = fetchContractTransferLogs(contractAddress, deploymentBlock);
      try {
        logs = await contractHistoryRequest;
        contractHistoryCache = { contractAddress, fetchedAt: Date.now(), logs };
      } finally {
        contractHistoryRequest = null;
      }
    }
    const records = (await normalizeLogs(logs)).slice(offset, offset + limit);
    const latestBlock = logs.reduce((latest, log) => Math.max(latest, log.blockNumber), 0);
    return {
      scope,
      records,
      total: logs.length,
      indexedThrough: latestBlock,
      latestBlock,
      complete: true,
    };
  }
  const transfers = await fetchWalletTokenTransfers(getAddress(address), contractAddress);
  const records = normalizeWalletTokenTransfers(transfers, contractAddress)
    .slice(offset, offset + limit);
  const latestBlock = transfers.length ? Number(transfers[0].blockNumber) : 0;
  return {
    scope,
    records,
    total: transfers.length,
    indexedThrough: latestBlock,
    latestBlock,
    complete: true,
  };
}

export async function searchChain(value) {
  const query = value.trim();
  if (/^\d+$/.test(query)) {
    const block = await provider.getBlock(Number(query), true);
    if (!block) throw new Error(`Bloc #${query} introuvable sur le réseau Ethereum.`);
    const logs = await loadTransferLogs(Number(query), Number(query));
    return { type: 'block', block, transfers: await normalizeLogs(logs) };
  }
  if (/^0x[a-fA-F0-9]{64}$/.test(query)) {
    const [transaction, receipt] = await Promise.all([
      provider.getTransaction(query),
      provider.getTransactionReceipt(query),
    ]);
    if (!transaction) throw new Error('Transaction introuvable sur le réseau Ethereum.');
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
  const value = parseCydTransferAmount(amount);
  const contract = tokenContract(signer);
  const [gasLimit, feeData, balance, tokenBalance] = await Promise.all([
    contract.transfer.estimateGas(to, value),
    provider.getFeeData(),
    provider.getBalance(await signer.getAddress()),
    contract.balanceOf(await signer.getAddress()),
  ]);
  const feePerGas = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (feePerGas === null) throw new Error('Impossible de récupérer les frais du réseau Ethereum.');
  if (tokenBalance < value) throw new Error('Solde CYD insuffisant.');
  const fee = gasLimit * feePerGas;
  if (balance < fee) throw new Error('Solde ETH de démonstration insuffisant pour payer les frais de transaction.');
  return { gasLimit, fee, value };
}

export async function sendCyd(signer, recipient, amount) {
  const estimate = await estimateCydTransfer(signer, recipient, amount);
  return tokenContract(signer).transfer(getAddress(recipient), estimate.value, {
    gasLimit: estimate.gasLimit,
  });
}

export async function estimateEthTransfer(signer, recipient, amount) {
  const to = getAddress(recipient);
  const value = parseEthTransferAmount(amount);
  const mainnetSigner = await getEthereumMainnetSigner(signer);
  const [gasLimit, feeData, balance] = await Promise.all([
    mainnetSigner.estimateGas({ to, value }),
    ethereumMainnetProvider.getFeeData(),
    ethereumMainnetProvider.getBalance(await mainnetSigner.getAddress()),
  ]);
  const feePerGas = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (feePerGas === null) throw new Error('Impossible de récupérer les frais du réseau Ethereum.');
  const fee = gasLimit * feePerGas;
  if (balance < value + fee) {
    throw new Error('Solde ETH insuffisant pour le montant et les frais de réseau.');
  }
  return { gasLimit, fee, value };
}

export async function sendEth(signer, recipient, amount) {
  const mainnetSigner = await getEthereumMainnetSigner(signer);
  const estimate = await estimateEthTransfer(mainnetSigner, recipient, amount);
  return mainnetSigner.sendTransaction({
    to: getAddress(recipient),
    value: estimate.value,
    gasLimit: estimate.gasLimit,
  });
}

async function getEthereumMainnetSigner(signer) {
  if (signer.provider instanceof BrowserProvider) {
    const network = await signer.provider.getNetwork();
    if (network.chainId !== ETHEREUM_MAINNET.id) {
      throw new Error('Connectez MetaMask au réseau Ethereum Mainnet pour envoyer de vrais ETH.');
    }
    return signer;
  }
  return signer.connect(ethereumMainnetProvider);
}

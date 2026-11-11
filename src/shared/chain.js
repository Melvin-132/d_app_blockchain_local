import {
  JsonRpcProvider,
  Wallet,
  formatUnits,
  getAddress,
  parseUnits,
} from 'ethers';

const provider = () => new JsonRpcProvider(CHAIN.rpcUrl, Number(CHAIN.id), { staticNetwork: true });
const frontendOrigin = typeof window === 'undefined' ? '' : window.location.origin;
const isLocalDevelopment = import.meta.env.DEV;
const frontendUrl = (envValue, localUrl, hostedPath) => envValue
  || (isLocalDevelopment ? localUrl : `${frontendOrigin}${hostedPath}`);

export const CHAIN = {
  id: 20261110n,
  hexId: '0x13528f6',
  name: 'Clayde Chain',
  symbol: 'CYD',
  decimals: 18,
  rpcUrl: frontendUrl(import.meta.env.VITE_CHAIN_RPC_URL, 'http://127.0.0.1:8545', '/rpc'),
  historyApiUrl: frontendUrl(import.meta.env.VITE_HISTORY_API_URL, 'http://127.0.0.1:8765', ''),
  blockchainUrl: frontendUrl(import.meta.env.VITE_BLOCKCHAIN_URL, 'http://127.0.0.1:5173', '/blockchain/'),
  explorerUrl: frontendUrl(import.meta.env.VITE_EXPLORER_URL, 'http://127.0.0.1:5174', '/explorer/'),
  dappUrl: frontendUrl(import.meta.env.VITE_DAPP_URL, 'http://127.0.0.1:5175', '/dapp/'),
  fundedSupply: '1000000',
};

const WALLET_STORAGE_KEY = 'clayde.wallet.keystore';

async function connectWallet(wallet) {
  const connectedWallet = wallet.connect(provider());
  const network = await connectedWallet.provider.getNetwork();
  if (network.chainId !== CHAIN.id) {
    throw new Error(`Chain ID RPC inattendu : ${network.chainId}. Attendu : ${CHAIN.id}.`);
  }
  return connectedWallet;
}

function asTransfer(transaction, block) {
  if (!transaction.to || transaction.value <= 0n) return null;
  return {
    hash: transaction.hash,
    blockNumber: block.number,
    timestamp: block.timestamp,
    from: getAddress(transaction.from),
    to: getAddress(transaction.to),
    amount: formatUnits(transaction.value, CHAIN.decimals),
    value: transaction.value,
  };
}

export async function getChainSnapshot(blockLimit = 100) {
  const rpc = provider();
  const network = await rpc.getNetwork();
  if (network.chainId !== CHAIN.id) {
    throw new Error(`Chain ID RPC inattendu : ${network.chainId}. Attendu : ${CHAIN.id}.`);
  }
  const latestBlock = await rpc.getBlockNumber();
  const start = Math.max(0, latestBlock - blockLimit + 1);
  const blocks = [];
  for (let batchStart = start; batchStart <= latestBlock; batchStart += 20) {
    const batchEnd = Math.min(latestBlock, batchStart + 19);
    const batch = await Promise.all(
      Array.from({ length: batchEnd - batchStart + 1 }, (_, index) =>
        rpc.getBlock(batchStart + index, true)),
    );
    blocks.push(...batch);
  }
  const normalizedBlocks = blocks.filter(Boolean).reverse().map((block) => {
    const transactions = (block.prefetchedTransactions ?? []).map((transaction) =>
      asTransfer(transaction, block)).filter(Boolean);
    return {
      number: block.number,
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: block.timestamp,
      transactions: (block.prefetchedTransactions ?? []).length,
      transfers: transactions.length,
      transferList: transactions,
    };
  });
  const transfers = normalizedBlocks.flatMap((block) => block.transferList);
  const addresses = new Set(transfers.flatMap((transfer) => [transfer.from, transfer.to]));
  return {
    chainId: Number(network.chainId),
    latestBlock,
    blocks: normalizedBlocks,
    transfers,
    activeAddresses: addresses.size,
    indexedBlocks: normalizedBlocks.length,
  };
}

export async function searchChain(value) {
  const query = value.trim();
  const rpc = provider();
  if (/^\d+$/.test(query)) {
    const block = await rpc.getBlock(Number(query), true);
    if (!block) throw new Error(`Bloc #${query} introuvable.`);
    const transfers = (block.prefetchedTransactions ?? [])
      .map((transaction) => asTransfer(transaction, block)).filter(Boolean);
    return { type: 'block', block, transfers };
  }
  if (/^0x[a-fA-F0-9]{64}$/.test(query)) {
    const [transaction, receipt] = await Promise.all([
      rpc.getTransaction(query),
      rpc.getTransactionReceipt(query),
    ]);
    if (!transaction) throw new Error('Transaction introuvable sur Clayde Chain.');
    return { type: 'transaction', transaction, receipt };
  }
  if (/^0x[a-fA-F0-9]{40}$/.test(query)) {
    const address = getAddress(query);
    const history = await getIndexedHistory({ scope: 'wallet', address, limit: 100 });
    return { type: 'address', address, history };
  }
  throw new Error('Saisissez un numéro de bloc, un hash de transaction ou une adresse 0x valide.');
}

export async function getIndexedHistory({ scope, address, offset = 0, limit = 50 }) {
  const query = new URLSearchParams({
    scope,
    offset: String(offset),
    limit: String(limit),
  });
  if (address) query.set('address', getAddress(address));

  const response = await fetch(`${CHAIN.historyApiUrl}/api/history?${query}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Impossible de charger l’historique (${response.status}).`);
  }
  return response.json();
}

export function shorten(value, start = 10, end = 6) {
  if (!value) return '—';
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

export function formatCyd(value, maximumFractionDigits = 4) {
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits });
}

export async function unlockBrowserWallet(password) {
  const keystore = window.localStorage.getItem(WALLET_STORAGE_KEY);
  if (!keystore) {
    throw new Error('Aucun portefeuille enregistré dans ce navigateur. Créez-en un ou importez son fichier chiffré.');
  }
  return connectWallet(await Wallet.fromEncryptedJson(keystore, password));
}

export async function createBrowserWallet(password) {
  if (password.length < 12) {
    throw new Error('Choisissez un mot de passe d’au moins 12 caractères.');
  }
  if (window.localStorage.getItem(WALLET_STORAGE_KEY)) {
    throw new Error('Un portefeuille est déjà enregistré. Téléchargez sa sauvegarde ou utilisez un autre profil de navigateur avant d’en créer un autre.');
  }
  const wallet = Wallet.createRandom();
  const keystore = await wallet.encrypt(password);
  const connectedWallet = await connectWallet(wallet);
  window.localStorage.setItem(WALLET_STORAGE_KEY, keystore);
  return connectedWallet;
}

export async function importBrowserWallet(keystore, password) {
  if (!keystore.trim()) {
    throw new Error('Sélectionnez un fichier de portefeuille chiffré.');
  }
  const wallet = await Wallet.fromEncryptedJson(keystore, password);
  const connectedWallet = await connectWallet(wallet);
  const existingKeystore = window.localStorage.getItem(WALLET_STORAGE_KEY);
  if (existingKeystore && existingKeystore !== keystore.trim()) {
    throw new Error('Un autre portefeuille est déjà enregistré. Sauvegardez-le et importez celui-ci depuis un autre profil de navigateur.');
  }
  window.localStorage.setItem(WALLET_STORAGE_KEY, keystore.trim());
  return connectedWallet;
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

export async function estimateCydTransfer(wallet, recipient, amount) {
  const to = getAddress(recipient);
  const value = parseUnits(amount.replace(',', '.'), CHAIN.decimals);
  const [gasLimit, feeData, balance] = await Promise.all([
    wallet.provider.estimateGas({ from: wallet.address, to, value }),
    wallet.provider.getFeeData(),
    wallet.provider.getBalance(wallet.address),
  ]);
  const feePerGas = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (feePerGas === null) {
    throw new Error('Le RPC ne fournit pas de tarif de gaz pour estimer les frais en CYD.');
  }
  const fee = gasLimit * feePerGas;
  if (balance < value + fee) {
    throw new Error(`Solde insuffisant : il faut ${formatUnits(value, CHAIN.decimals)} CYD pour le transfert et environ ${formatUnits(fee, CHAIN.decimals)} CYD de frais.`);
  }
  return {
    gasLimit,
    feePerGas,
    fee,
    value,
    total: value + fee,
    feeFields: feeData.gasPrice !== null
      ? { gasPrice: feePerGas }
      : {
        maxFeePerGas: feePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 0n,
      },
  };
}

export async function sendCyd(wallet, recipient, amount) {
  const estimate = await estimateCydTransfer(wallet, recipient, amount);
  return wallet.sendTransaction({
    to: getAddress(recipient),
    value: estimate.value,
    gasLimit: estimate.gasLimit,
    ...estimate.feeFields,
  });
}

export function getChainProvider() {
  return provider();
}

export function formatCydUnits(value, maximumFractionDigits = CHAIN.decimals) {
  const units = BigInt(value);
  const sign = units < 0n ? '−' : '';
  const decimal = formatUnits(units < 0n ? -units : units, CHAIN.decimals);
  const [whole, fraction = ''] = decimal.split('.');
  const displayedFraction = fraction.slice(0, maximumFractionDigits).replace(/0+$/, '');
  const groupedWhole = BigInt(whole).toLocaleString('fr-FR');
  return `${sign}${groupedWhole}${displayedFraction ? `,${displayedFraction}` : ''}`;
}

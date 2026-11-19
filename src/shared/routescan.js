import { formatUnits, id } from 'ethers';

const API_URL = 'https://api.routescan.io/v2/network/testnet/evm/11155111/etherscan/api';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const LOGS_PAGE_SIZE = 1000;
const TRANSFER_TOPIC = id('Transfer(address,address,uint256)');

export async function fetchWalletTokenTransfers(address, contractAddress, fetchImpl = fetch) {
  const transfers = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(API_URL);
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'tokentx');
    url.searchParams.set('address', address);
    url.searchParams.set('contractaddress', contractAddress);
    url.searchParams.set('page', String(page));
    url.searchParams.set('offset', String(PAGE_SIZE));
    url.searchParams.set('sort', 'desc');

    const response = await fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`L’indexeur Sepolia a répondu avec le statut HTTP ${response.status}.`);
    }

    const payload = await response.json();
    if (payload.status === '0' && typeof payload.result === 'string'
      && /no transactions found/i.test(payload.result)) {
      return transfers;
    }
    if (!Array.isArray(payload.result)) {
      throw new Error('L’indexeur Sepolia a renvoyé un historique de transferts invalide.');
    }

    const pageTransfers = payload.result.filter((transfer) =>
      typeof transfer.contractAddress === 'string'
      && transfer.contractAddress.toLowerCase() === contractAddress.toLowerCase());
    transfers.push(...pageTransfers);
    if (payload.result.length < PAGE_SIZE) return transfers;
  }

  throw new Error('L’historique dépasse la limite de pagination de l’indexeur Sepolia.');
}

export async function fetchContractTransferLogs(contractAddress, fromBlock, fetchImpl = fetch) {
  const logs = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(API_URL);
    url.searchParams.set('module', 'logs');
    url.searchParams.set('action', 'getLogs');
    url.searchParams.set('fromBlock', String(fromBlock));
    url.searchParams.set('toBlock', 'latest');
    url.searchParams.set('address', contractAddress);
    url.searchParams.set('topic0', TRANSFER_TOPIC);
    url.searchParams.set('page', String(page));
    url.searchParams.set('offset', String(LOGS_PAGE_SIZE));

    const response = await fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`L’indexeur Sepolia a répondu avec le statut HTTP ${response.status}.`);
    }

    const payload = await response.json();
    if (payload.status === '0' && typeof payload.result === 'string'
      && /no (?:records|logs) found/i.test(payload.result)) {
      return logs;
    }
    if (!Array.isArray(payload.result)) {
      throw new Error('L’indexeur Sepolia a renvoyé un historique de journaux invalide.');
    }

    const pageLogs = payload.result
      .filter((log) => typeof log.address === 'string'
        && log.address.toLowerCase() === contractAddress.toLowerCase()
        && Array.isArray(log.topics)
        && log.topics[0]?.toLowerCase() === TRANSFER_TOPIC);
    logs.push(...pageLogs.map(normalizeContractTransferLog));
    if (payload.result.length < LOGS_PAGE_SIZE) return logs;
  }

  throw new Error('L’historique dépasse la limite de pagination de l’indexeur Sepolia.');
}

function normalizeContractTransferLog(log) {
  const parseQuantity = (value) => {
    if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) {
      throw new Error('L’indexeur Sepolia a renvoyé un journal incomplet.');
    }
    const quantity = Number(BigInt(value));
    if (!Number.isSafeInteger(quantity)) {
      throw new Error('L’indexeur Sepolia a renvoyé un journal invalide.');
    }
    return quantity;
  };

  if (!/^0x[a-fA-F0-9]{64}$/.test(log.transactionHash || '')
    || !/^0x[0-9a-fA-F]+$/.test(log.data || '')
    || !log.topics.every((topic) => /^0x[a-fA-F0-9]{64}$/.test(topic))) {
    throw new Error('L’indexeur Sepolia a renvoyé un journal incomplet.');
  }

  return {
    address: log.address,
    topics: log.topics,
    data: log.data,
    blockNumber: parseQuantity(log.blockNumber),
    transactionHash: log.transactionHash,
    index: parseQuantity(log.logIndex),
    timestamp: parseQuantity(log.timeStamp),
  };
}

export function normalizeWalletTokenTransfers(transfers, contractAddress) {
  const occurrences = new Map();
  return transfers.map((transfer) => {
    if (!/^0x[a-fA-F0-9]{64}$/.test(transfer.hash || '')
      || !/^0x[a-fA-F0-9]{40}$/.test(transfer.from || '')
      || !/^0x[a-fA-F0-9]{40}$/.test(transfer.to || '')
      || !/^\d+$/.test(transfer.blockNumber || '')
      || !/^\d+$/.test(transfer.timeStamp || '')
      || !/^\d+$/.test(transfer.value || '')) {
      throw new Error('L’indexeur Sepolia a renvoyé un transfert incomplet.');
    }

    const hash = transfer.hash.toLowerCase();
    const occurrence = occurrences.get(hash) || 0;
    occurrences.set(hash, occurrence + 1);
    const logIndex = /^\d+$/.test(transfer.logIndex || '')
      ? Number(transfer.logIndex)
      : occurrence;
    const value = BigInt(transfer.value);
    const from = `0x${transfer.from.slice(2)}`;
    const to = `0x${transfer.to.slice(2)}`;
    const token = `0x${contractAddress.slice(2)}`;

    return {
      hash: transfer.hash,
      blockNumber: Number(transfer.blockNumber),
      logIndex,
      timestamp: Number(transfer.timeStamp),
      from,
      to,
      amount: formatUnits(value, Number(transfer.tokenDecimal || 18)),
      value: 0n,
      fee: null,
      status: 1,
      input: '0x',
      tokenTransfers: [{
        from,
        to,
        value,
        contractAddress: token,
        tokenSymbol: 'CYD',
      }],
    };
  });
}

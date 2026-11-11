import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { JsonRpcProvider, getAddress, id } from 'ethers';

const TRANSFER_TOPIC = id('Transfer(address,address,uint256)').toLowerCase();
const BLOCK_BATCH_SIZE = 20;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function decodeTransferLog(log) {
  if (
    log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC
    || log.topics.length < 3
    || !/^0x[0-9a-f]{64}$/i.test(log.topics[1])
    || !/^0x[0-9a-f]{64}$/i.test(log.topics[2])
  ) return null;

  return {
    token: getAddress(log.address),
    from: getAddress(`0x${log.topics[1].slice(-40)}`),
    to: getAddress(`0x${log.topics[2].slice(-40)}`),
    value: log.data,
  };
}

function normalizeTransaction(transaction, receipt, block, transactionIndex) {
  const fee = receipt
    ? receipt.gasUsed * (receipt.gasPrice ?? transaction.gasPrice ?? 0n)
    : null;

  return {
    hash: transaction.hash,
    blockNumber: block.number,
    blockHash: block.hash,
    timestamp: block.timestamp,
    transactionIndex,
    from: getAddress(transaction.from),
    to: transaction.to ? getAddress(transaction.to) : null,
    value: transaction.value.toString(),
    input: transaction.data,
    nonce: transaction.nonce,
    gasLimit: transaction.gasLimit.toString(),
    gasPrice: transaction.gasPrice?.toString() ?? null,
    status: receipt?.status ?? null,
    fee: fee?.toString() ?? null,
    tokenTransfers: (receipt?.logs ?? []).map(decodeTransferLog).filter(Boolean),
  };
}

export async function createHistoryIndex({
  rpcUrl,
  chainId,
  directory,
  provider,
  logger = console,
}) {
  const rpc = provider ?? new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
  const indexDirectory = path.join(directory, 'history');
  const transactionsPath = path.join(indexDirectory, 'transactions.jsonl');
  const statePath = path.join(indexDirectory, 'state.json');
  const transactions = new Map();
  let indexedThrough = -1;
  let lastIndexedHash = null;
  let expectedTransactionCount = null;
  let latestBlock = -1;
  let lastError = '';
  let running = false;
  let closed = false;
  let loopPromise;

  async function load() {
    await mkdir(indexDirectory, { recursive: true });

    try {
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      if (state.chainId !== chainId) {
        throw new Error(`L’index historique appartient à la chaîne ${state.chainId}, pas ${chainId}.`);
      }
      indexedThrough = state.indexedThrough;
      lastIndexedHash = state.lastIndexedHash;
      expectedTransactionCount = state.transactionCount ?? null;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    try {
      const lines = createInterface({
        input: createReadStream(transactionsPath, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      });
      for await (const line of lines) {
        if (!line) continue;
        const transaction = JSON.parse(line);
        transactions.set(transaction.hash, transaction);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    if (expectedTransactionCount !== null && transactions.size !== expectedTransactionCount) {
      throw new Error(
        `Index historique incomplet : ${transactions.size} transaction(s) lue(s), `
        + `${expectedTransactionCount} attendue(s). Les fichiers ont été conservés.`,
      );
    }

    if (indexedThrough >= 0 && transactions.size === 0) {
      indexedThrough = -1;
      lastIndexedHash = null;
    }

    if (indexedThrough >= 0) {
      const lastBlock = await rpc.getBlock(indexedThrough);
      if (!lastBlock || lastBlock.hash !== lastIndexedHash) {
        throw new Error(
          'La tête de l’index historique ne correspond plus à Besu. '
          + 'Les fichiers d’index ont été conservés; une resynchronisation est nécessaire.',
        );
      }
    }

    latestBlock = await rpc.getBlockNumber();
  }

  async function persistBatch(blocks) {
    const batchTransactions = [];
    for (const block of blocks) {
      const blockTransactions = block.prefetchedTransactions ?? [];
      const receipts = await Promise.all(
        blockTransactions.map((transaction) => rpc.getTransactionReceipt(transaction.hash)),
      );
      for (let index = 0; index < blockTransactions.length; index += 1) {
        batchTransactions.push(normalizeTransaction(
          blockTransactions[index],
          receipts[index],
          block,
          index,
        ));
      }
    }

    if (batchTransactions.length) {
      await appendFile(
        transactionsPath,
        `${batchTransactions.map((transaction) => JSON.stringify(transaction)).join('\n')}\n`,
        'utf8',
      );
      for (const transaction of batchTransactions) {
        transactions.set(transaction.hash, transaction);
      }
    }

    const lastBlock = blocks.at(-1);
    indexedThrough = lastBlock.number;
    lastIndexedHash = lastBlock.hash;
    const temporaryStatePath = `${statePath}.tmp`;
    await writeFile(temporaryStatePath, `${JSON.stringify({
      chainId,
      indexedThrough,
      lastIndexedHash,
      transactionCount: transactions.size,
    })}\n`, 'utf8');
    await rename(temporaryStatePath, statePath);
  }

  async function syncOnce() {
    latestBlock = await rpc.getBlockNumber();
    for (
      let start = indexedThrough + 1;
      start <= latestBlock && !closed;
      start += BLOCK_BATCH_SIZE
    ) {
      const end = Math.min(latestBlock, start + BLOCK_BATCH_SIZE - 1);
      const blocks = await Promise.all(
        Array.from({ length: end - start + 1 }, (_, index) =>
          rpc.getBlock(start + index, true)),
      );
      if (blocks.some((block) => !block)) {
        throw new Error(`Besu n’a pas retourné tous les blocs ${start} à ${end}.`);
      }
      await persistBatch(blocks);
    }
    lastError = '';
  }

  async function syncLoop() {
    while (!closed) {
      try {
        await syncOnce();
      } catch (error) {
        lastError = error.message || 'Erreur pendant l’indexation des transactions.';
        logger.error(`Indexation historique : ${lastError}`);
      }
      if (!closed) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  function start() {
    if (running) return;
    running = true;
    loopPromise = syncLoop();
  }

  function getStatus() {
    return {
      indexedThrough,
      latestBlock,
      complete: indexedThrough >= latestBlock,
      transactionCount: transactions.size,
      error: lastError,
    };
  }

  function getHistory({ scope, address, offset = 0, limit = DEFAULT_PAGE_SIZE }) {
    const normalizedAddress = address ? getAddress(address).toLowerCase() : null;
    const safeOffset = Math.max(0, Math.trunc(offset));
    const safeLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)));
    const matching = [...transactions.values()].filter((transaction) => {
      if (scope === 'native') return BigInt(transaction.value) > 0n;
      if (scope !== 'wallet' || !normalizedAddress) return false;
      return transaction.from.toLowerCase() === normalizedAddress
        || transaction.to?.toLowerCase() === normalizedAddress
        || transaction.tokenTransfers.some((transfer) =>
          transfer.from.toLowerCase() === normalizedAddress
          || transfer.to.toLowerCase() === normalizedAddress);
    }).sort((left, right) =>
      right.blockNumber - left.blockNumber || right.transactionIndex - left.transactionIndex);

    return {
      records: matching.slice(safeOffset, safeOffset + safeLimit),
      total: matching.length,
      offset: safeOffset,
      limit: safeLimit,
      ...getStatus(),
    };
  }

  function getTransaction(hash) {
    return transactions.get(hash) ?? null;
  }

  async function close() {
    closed = true;
    await loopPromise;
    await rpc.destroy();
  }

  await load();
  return { start, getStatus, getHistory, getTransaction, close };
}

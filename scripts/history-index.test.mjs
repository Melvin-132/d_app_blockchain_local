import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { id, Wallet } from 'ethers';
import { createHistoryIndex } from './history-index.mjs';

const chainId = 20261110;
const sender = Wallet.createRandom().address;
const recipient = Wallet.createRandom().address;
const token = Wallet.createRandom().address;
const other = Wallet.createRandom().address;
const nativeHash = `0x${'11'.repeat(32)}`;
const tokenHash = `0x${'22'.repeat(32)}`;
const incomingHash = `0x${'33'.repeat(32)}`;
const transferTopic = id('Transfer(address,address,uint256)');
const addressTopic = (address) => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;

const transactionsByBlock = new Map([
  [0, []],
  [1, [{
    hash: nativeHash,
    from: sender,
    to: recipient,
    value: 5n,
    data: '0x',
    nonce: 0,
    gasLimit: 21000n,
    gasPrice: 1000n,
  }]],
  [2, [
    {
      hash: tokenHash,
      from: sender,
      to: token,
      value: 0n,
      data: '0xa9059cbb',
      nonce: 1,
      gasLimit: 60000n,
      gasPrice: 1000n,
    },
    {
      hash: incomingHash,
      from: other,
      to: sender,
      value: 0n,
      data: '0x',
      nonce: 0,
      gasLimit: 21000n,
      gasPrice: 1000n,
    },
  ]],
]);

const receipts = new Map([
  [nativeHash, { status: 1, gasUsed: 21000n, gasPrice: 1000n, logs: [] }],
  [tokenHash, {
    status: 1,
    gasUsed: 50000n,
    gasPrice: 1000n,
    logs: [{
      address: token,
      topics: [transferTopic, addressTopic(sender), addressTopic(recipient)],
      data: `0x${25n.toString(16).padStart(64, '0')}`,
    }],
  }],
  [incomingHash, { status: 0, gasUsed: 21000n, gasPrice: 1000n, logs: [] }],
]);

const mockProvider = {
  async getBlockNumber() {
    return 2;
  },
  async getBlock(number, includeTransactions = false) {
    const transactions = transactionsByBlock.get(number);
    if (!transactions) return null;
    return {
      number,
      hash: `0x${String(number + 1).padStart(64, '0')}`,
      timestamp: 1_800_000_000 + number,
      ...(includeTransactions ? { prefetchedTransactions: transactions } : {}),
    };
  },
  async getTransactionReceipt(hash) {
    return receipts.get(hash);
  },
  async destroy() {},
};

test('indexes all native transfers and wallet contract activity persistently', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clayde-history-test-'));
  let index;
  try {
    index = await createHistoryIndex({
      chainId,
      directory,
      provider: mockProvider,
      logger: { error: assert.fail },
    });
    index.start();
    for (let attempt = 0; attempt < 50 && !index.getStatus().complete; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const walletHistory = index.getHistory({ scope: 'wallet', address: sender, limit: 1 });
    assert.equal(walletHistory.total, 3);
    assert.equal(walletHistory.records.length, 1);
    assert.equal(walletHistory.records[0].hash, incomingHash);
    assert.equal(walletHistory.records[0].status, 0);

    const secondPage = index.getHistory({
      scope: 'wallet',
      address: sender,
      offset: 1,
      limit: 1,
    });
    assert.equal(secondPage.records[0].hash, tokenHash);
    assert.equal(secondPage.records[0].tokenTransfers[0].token, token);
    assert.equal(secondPage.records[0].fee, '50000000');
    const thirdPage = index.getHistory({
      scope: 'wallet',
      address: sender,
      offset: 2,
      limit: 1,
    });
    assert.equal(thirdPage.records[0].hash, nativeHash);

    const recipientHistory = index.getHistory({ scope: 'wallet', address: recipient });
    assert.equal(recipientHistory.total, 2);

    const nativeHistory = index.getHistory({ scope: 'native', limit: 10 });
    assert.equal(nativeHistory.total, 1);
    assert.equal(nativeHistory.records[0].hash, nativeHash);
    assert.equal(nativeHistory.records[0].value, '5');

    await index.close();
    index = await createHistoryIndex({
      chainId,
      directory,
      provider: mockProvider,
      logger: { error: assert.fail },
    });
    assert.equal(index.getStatus().complete, true);
    assert.equal(index.getHistory({ scope: 'wallet', address: sender }).total, 3);
    assert.equal(index.getTransaction(incomingHash).status, 0);
  } finally {
    await index?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getUnseenIncomingTransfers,
  summarizeIncomingTransfers,
} from '../src/shared/incoming-transfers.js';

const wallet = '0x1111111111111111111111111111111111111111';
const sender = '0x2222222222222222222222222222222222222222';
const otherSender = '0x3333333333333333333333333333333333333333';

function transfer(overrides = {}) {
  return {
    hash: `0x${'ab'.repeat(32)}`,
    logIndex: 0,
    blockNumber: 100,
    from: sender,
    to: wallet,
    tokenTransfers: [{ value: 100n }],
    ...overrides,
  };
}

test('selects only unseen incoming transfers for the active wallet', () => {
  const incoming = transfer();
  const records = [
    incoming,
    transfer({ hash: `0x${'cd'.repeat(32)}`, from: wallet }),
    transfer({ hash: `0x${'ef'.repeat(32)}`, to: otherSender }),
  ];
  const observed = new Set([`${records[1].hash}-${records[1].logIndex}`]);

  assert.deepEqual(getUnseenIncomingTransfers(records, wallet.toUpperCase(), observed), [incoming]);
});

test('summarizes received amounts and handles multiple senders', () => {
  const first = transfer();
  const second = transfer({
    hash: `0x${'cd'.repeat(32)}`,
    from: otherSender,
    logIndex: 1,
    blockNumber: 101,
    tokenTransfers: [{ value: 250n }],
  });

  assert.deepEqual(summarizeIncomingTransfers([first, second]), {
    amount: 350n,
    count: 2,
    from: '',
    hash: first.hash,
    blockNumber: 101,
  });
  assert.equal(summarizeIncomingTransfers([]), null);
});

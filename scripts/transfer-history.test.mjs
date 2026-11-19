import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeTransferHistory } from '../src/shared/transfer-history.js';

function record(hash, blockNumber, logIndex = 0) {
  return { hash, blockNumber, logIndex };
}

test('merges RPC and indexer records without duplicates in newest-first order', () => {
  const previous = [
    record(`0x${'aa'.repeat(32)}`, 10),
    record(`0x${'bb'.repeat(32)}`, 8),
  ];
  const recent = [
    record(`0x${'BB'.repeat(32)}`, 8),
    record(`0x${'cc'.repeat(32)}`, 12, 1),
    record(`0x${'dd'.repeat(32)}`, 12, 2),
  ];

  const merged = mergeTransferHistory(previous, recent);

  assert.equal(merged.length, 4);
  assert.deepEqual(merged.map(({ hash }) => hash), [
    `0x${'dd'.repeat(32)}`,
    `0x${'cc'.repeat(32)}`,
    `0x${'aa'.repeat(32)}`,
    `0x${'BB'.repeat(32)}`,
  ]);
});

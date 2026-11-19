import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MIN_CYD_TRANSFER,
  parseCydTransferAmount,
  parseEthTransferAmount,
} from '../src/shared/transfer-amount.js';

test('accepts the exact minimum CYD transfer amount and comma decimals', () => {
  assert.equal(parseCydTransferAmount(MIN_CYD_TRANSFER), 100000000000000000n);
  assert.equal(parseCydTransferAmount('0,10'), 100000000000000000n);
});

test('rejects amounts below the minimum or with unsupported precision', () => {
  assert.throws(() => parseCydTransferAmount('0.099999999999999999'), /minimum/);
  assert.throws(() => parseCydTransferAmount('0.1000000000000000001'), /18 décimales/);
  assert.throws(() => parseCydTransferAmount('0'), /minimum/);
});

test('accepts positive Sepolia ETH amounts and rejects zero', () => {
  assert.equal(parseEthTransferAmount('0,000000000000000001'), 1n);
  assert.throws(() => parseEthTransferAmount('0'), /supérieur à zéro/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createCydPaymentUrl } from '../src/shared/payment-request.js';

const address = '0x1234567890123456789012345678901234567890';

test('builds a shareable Sepolia payment URL from a hosted relative DApp path', () => {
  const url = createCydPaymentUrl('/clayde/dapp/', address, '25,50', 'https://example.test');
  assert.equal(url, `https://example.test/clayde/dapp/?to=${address}&amount=25.50`);
});

test('rejects invalid addresses and zero or malformed payment amounts', () => {
  assert.throws(() => createCydPaymentUrl('/dapp/', 'not-an-address', '', 'https://example.test'), /adresse Ethereum valide/);
  assert.throws(() => createCydPaymentUrl('/dapp/', address, '0', 'https://example.test'), /supérieur à zéro/);
  assert.throws(() => createCydPaymentUrl('/dapp/', address, '1.1234567890123456789', 'https://example.test'), /18 décimales/);
});

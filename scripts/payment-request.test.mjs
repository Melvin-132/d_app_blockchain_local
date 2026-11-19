import assert from 'node:assert/strict';
import test from 'node:test';
import { createCydPaymentUrl } from '../src/shared/payment-request.js';

const address = '0x1234567890123456789012345678901234567890';

test('builds a shareable Sepolia payment URL from a hosted relative DApp path', () => {
  const url = createCydPaymentUrl('/clayde/dapp/', address, '25,50', 'https://example.test');
  assert.equal(url, `https://example.test/clayde/dapp/?to=${address}&amount=25.50&asset=CYD`);
});

test('builds a receive link without requiring a preset amount', () => {
  const url = new URL(createCydPaymentUrl('/dapp/', address, '', 'https://example.test'));
  assert.equal(url.searchParams.get('to'), address);
  assert.equal(url.searchParams.has('amount'), false);
  assert.equal(url.searchParams.get('asset'), 'CYD');
});

test('preserves the selected supported asset in a receive link', () => {
  const url = new URL(createCydPaymentUrl('/dapp/', address, '', 'https://example.test', 'ETH'));
  assert.equal(url.searchParams.get('asset'), 'ETH');
  assert.throws(() => createCydPaymentUrl('/dapp/', address, '', 'https://example.test', 'BTC'), /pas pris en charge/);
});

test('rejects invalid addresses and zero or malformed payment amounts', () => {
  assert.throws(() => createCydPaymentUrl('/dapp/', 'not-an-address', '', 'https://example.test'), /adresse Ethereum valide/);
  assert.throws(() => createCydPaymentUrl('/dapp/', address, '0', 'https://example.test'), /supérieur à zéro/);
  assert.throws(() => createCydPaymentUrl('/dapp/', address, '1.1234567890123456789', 'https://example.test'), /18 décimales/);
});

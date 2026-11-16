import assert from 'node:assert/strict';
import test from 'node:test';
import { getStoredWallet, getStoredWallets, saveStoredWallet } from '../src/shared/wallet-storage.js';

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const firstAddress = '0x1234567890123456789012345678901234567890';
const secondAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

test('migrates the existing single encrypted wallet without losing it', () => {
  const storage = new MemoryStorage();
  const keystore = JSON.stringify({ address: firstAddress.slice(2), crypto: {} });
  storage.setItem('clayde.wallet.keystore', keystore);

  assert.deepEqual(getStoredWallets(storage), [{ address: firstAddress, keystore }]);
  assert.equal(storage.getItem('clayde.wallet.keystore'), null);
  assert.deepEqual(JSON.parse(storage.getItem('clayde.wallet.keystores')), [{ address: firstAddress, keystore }]);
});

test('keeps multiple wallets and selects the requested address case-insensitively', () => {
  const storage = new MemoryStorage();
  saveStoredWallet(storage, firstAddress, 'first-keystore');
  saveStoredWallet(storage, secondAddress, 'second-keystore');

  assert.deepEqual(getStoredWallets(storage), [
    { address: firstAddress, keystore: 'first-keystore' },
    { address: secondAddress, keystore: 'second-keystore' },
  ]);
  assert.deepEqual(getStoredWallet(storage, secondAddress.toUpperCase().replace('0X', '0x')), {
    address: secondAddress,
    keystore: 'second-keystore',
  });
});

test('updates the keystore for an already saved wallet without duplicating it', () => {
  const storage = new MemoryStorage();
  saveStoredWallet(storage, firstAddress, 'old-keystore');
  saveStoredWallet(storage, firstAddress, 'new-keystore');

  assert.deepEqual(getStoredWallets(storage), [{ address: firstAddress, keystore: 'new-keystore' }]);
});

test('reports malformed saved wallet data instead of hiding it', () => {
  const storage = new MemoryStorage();
  storage.setItem('clayde.wallet.keystores', '{');

  assert.throws(() => getStoredWallets(storage), /illisible/);
});

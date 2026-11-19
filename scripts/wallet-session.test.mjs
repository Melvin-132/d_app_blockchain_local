import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearWalletSession,
  readWalletSession,
  saveWalletSession,
} from '../src/shared/wallet-session.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const session = {
  address: '0x1234567890123456789012345678901234567890',
  source: 'local',
  privateKey: `0x${'ab'.repeat(32)}`,
  selectedAsset: 'CYD',
  walletView: 'activity',
};

test('stores the active wallet and page only for the current browser tab', () => {
  const storage = new MemoryStorage();
  saveWalletSession(storage, session);

  assert.deepEqual(readWalletSession(storage), session);
  clearWalletSession(storage);
  assert.equal(readWalletSession(storage), null);
});

test('does not store private keys for MetaMask sessions', () => {
  const storage = new MemoryStorage();
  saveWalletSession(storage, { ...session, source: 'metamask', privateKey: '' });

  assert.deepEqual(readWalletSession(storage), {
    address: session.address,
    source: 'metamask',
    privateKey: '',
    selectedAsset: 'CYD',
    walletView: 'activity',
  });
});

test('rejects invalid session data rather than restoring it', () => {
  const storage = new MemoryStorage();
  assert.throws(() => saveWalletSession(storage, { ...session, privateKey: 'secret' }), /clé/);
  storage.setItem('clayde.wallet.tab-session.v1', '{');
  assert.throws(() => readWalletSession(storage), /illisible/);
});

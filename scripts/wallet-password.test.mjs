import assert from 'node:assert/strict';
import test from 'node:test';
import { isStrongWalletPassword } from '../src/shared/wallet-password.js';

test('accepts passwords that meet every wallet password requirement', () => {
  assert.equal(isStrongWalletPassword('Clayde9!'), true);
  assert.equal(isStrongWalletPassword('Été2026$'), true);
});

test('rejects passwords missing a requirement or containing whitespace', () => {
  for (const password of [
    'Clayd7!',
    'clayde99!',
    'CLAYDE99!',
    'Claydeee!',
    'Clayde999',
    'Clayde 9!',
  ]) {
    assert.equal(isStrongWalletPassword(password), false, password);
  }
});

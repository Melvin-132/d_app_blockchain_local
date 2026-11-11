import assert from 'node:assert/strict';
import test from 'node:test';
import { Wallet } from 'ethers';
import { createGenesis } from '../network/besu/genesis.js';

test('supports an ephemeral single-validator QBFT genesis without changing local defaults', () => {
  const validator = Wallet.createRandom();
  const fundedAddress = Wallet.createRandom().address;
  const hostedGenesis = createGenesis(
    [{ address: validator.address }],
    fundedAddress,
    { expectedValidatorCount: 1 },
  );

  assert.equal(hostedGenesis.config.chainId, 20261110);
  assert.ok(hostedGenesis.alloc[fundedAddress.toLowerCase()]);
  assert.throws(
    () => createGenesis([{ address: validator.address }], fundedAddress),
    /exige exactement 4 validateur/,
  );
});

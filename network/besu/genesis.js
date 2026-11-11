import { encodeRlp, getAddress, isAddress, parseUnits } from 'ethers';

export const CHAIN_ID = 20261110;
export const VALIDATOR_COUNT = 4;
export const BLOCK_PERIOD_SECONDS = 15;

export function createGenesis(validators, fundedAddress, { expectedValidatorCount = VALIDATOR_COUNT } = {}) {
  if (!isAddress(fundedAddress)) {
    throw new Error('BESU_GENESIS_ADDRESS doit être une adresse publique Ethereum valide.');
  }
  if (!Number.isInteger(expectedValidatorCount) || expectedValidatorCount < 1) {
    throw new Error('Le nombre de validateurs attendu doit être un entier positif.');
  }
  if (validators.length !== expectedValidatorCount) {
    throw new Error(`Cette configuration QBFT exige exactement ${expectedValidatorCount} validateur(s).`);
  }

  const validatorAddresses = validators.map(({ address }) => getAddress(address).toLowerCase());
  const extraData = encodeRlp([`0x${'00'.repeat(32)}`, validatorAddresses, [], '0x', []]);

  return {
    config: {
      chainId: CHAIN_ID,
      berlinBlock: 0,
      londonBlock: 0,
      shanghaiTime: 0,
      qbft: {
        blockperiodseconds: BLOCK_PERIOD_SECONDS,
        epochlength: 30000,
        requesttimeoutseconds: 10,
      },
    },
    nonce: '0x0',
    timestamp: '0x0',
    extraData,
    gasLimit: '0x1c9c380',
    difficulty: '0x1',
    mixHash: '0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365',
    coinbase: '0x0000000000000000000000000000000000000000',
    baseFeePerGas: '0x3b9aca00',
    alloc: {
      [getAddress(fundedAddress).toLowerCase()]: {
        balance: parseUnits('1000000', 18).toString(),
      },
    },
  };
}

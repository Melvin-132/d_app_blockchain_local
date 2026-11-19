import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureWalletNetwork } from '../src/shared/wallet-network.js';

function createInjectedProvider(initialChainId, { addRequired = false } = {}) {
  let chainId = initialChainId;
  let chainAdded = !addRequired;
  const calls = [];
  return {
    calls,
    async request(request) {
      calls.push(request);
      if (request.method === 'eth_chainId') return chainId;
      if (request.method === 'wallet_switchEthereumChain' && !chainAdded) {
        const error = new Error('Unknown chain');
        error.code = 4902;
        throw error;
      }
      if (request.method === 'wallet_addEthereumChain') chainAdded = true;
      if (request.method === 'wallet_switchEthereumChain') {
        chainId = request.params[0].chainId;
      }
      return null;
    },
  };
}

test('switches MetaMask to Ethereum Mainnet for native ETH', async () => {
  const mainnet = {
    id: 1n,
    hexId: '0x1',
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  };
  const provider = createInjectedProvider('0xaa36a7');

  await ensureWalletNetwork(provider, mainnet);

  assert.deepEqual(provider.calls[1], {
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: '0x1' }],
  });
  assert.equal(provider.calls.at(-1).method, 'eth_chainId');
});

test('adds Sepolia when MetaMask does not know it, then verifies the active chain', async () => {
  const sepolia = {
    id: 11155111n,
    hexId: '0xaa36a7',
    name: 'Sepolia',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  };
  const provider = createInjectedProvider('0x1', { addRequired: true });

  await ensureWalletNetwork(provider, sepolia);

  assert.equal(provider.calls[1].method, 'wallet_switchEthereumChain');
  assert.deepEqual(provider.calls[2], {
    method: 'wallet_addEthereumChain',
    params: [{
      chainId: '0xaa36a7',
      chainName: 'Sepolia',
      nativeCurrency: sepolia.nativeCurrency,
      rpcUrls: [sepolia.rpcUrl],
      blockExplorerUrls: [sepolia.explorerUrl],
    }],
  });
  assert.deepEqual(provider.calls[3], {
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: '0xaa36a7' }],
  });
});

test('does not hide a rejected or unsuccessful network switch', async () => {
  const error = new Error('User rejected the request');
  error.code = 4001;
  const provider = {
    async request({ method }) {
      if (method === 'eth_chainId') return '0xaa36a7';
      throw error;
    },
  };

  await assert.rejects(ensureWalletNetwork(provider, {
    id: 1n,
    hexId: '0x1',
    name: 'Ethereum Mainnet',
  }), error);

  await assert.rejects(ensureWalletNetwork({
    async request({ method }) {
      if (method === 'eth_chainId') return '0xaa36a7';
      return null;
    },
  }, {
    id: 1n,
    hexId: '0x1',
    name: 'Ethereum Mainnet',
  }), /Sélectionnez Ethereum Mainnet/);
});

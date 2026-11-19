export async function ensureWalletNetwork(provider, network) {
  const chainId = BigInt(await provider.request({ method: 'eth_chainId' }));
  if (chainId !== network.id) {
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: network.hexId }],
      });
    } catch (switchError) {
      if (switchError.code !== 4902) throw switchError;
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: network.hexId,
          chainName: network.name,
          nativeCurrency: network.nativeCurrency,
          rpcUrls: [network.rpcUrl],
          blockExplorerUrls: [network.explorerUrl],
        }],
      });
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: network.hexId }],
      });
    }
  }

  const activeChainId = BigInt(await provider.request({ method: 'eth_chainId' }));
  if (activeChainId !== network.id) {
    throw new Error(`Sélectionnez ${network.name} dans MetaMask pour continuer.`);
  }
}

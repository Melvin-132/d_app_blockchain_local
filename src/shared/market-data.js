const COINGECKO_MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets';
export const CYD_DEMO_PRICE_USD = 1000;

export const MARKET_CRYPTO_CATALOG = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', group: 'popular' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', group: 'popular', walletAsset: 'ETH' },
  { id: 'hyperliquid', symbol: 'HYPE', name: 'Hyperliquid', group: 'popular' },
  { id: 'solana', symbol: 'SOL', name: 'Solana', group: 'crypto' },
  { id: 'ripple', symbol: 'XRP', name: 'XRP', group: 'crypto' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', group: 'crypto' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano', group: 'crypto' },
  { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche', group: 'crypto' },
  { id: 'polkadot', symbol: 'DOT', name: 'Polkadot', group: 'crypto' },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', group: 'tokens' },
  { id: 'usd-coin', symbol: 'USDC', name: 'USD Coin', group: 'tokens' },
  { id: 'tether', symbol: 'USDT', name: 'Tether', group: 'tokens' },
  { id: 'uniswap', symbol: 'UNI', name: 'Uniswap', group: 'tokens' },
];

export const MARKET_CRYPTO_FALLBACK_QUOTES = MARKET_CRYPTO_CATALOG.map((asset) => ({
  ...asset,
  image: null,
  priceUsd: null,
  change24h: null,
  sparkline: [],
}));

export const MARKET_STOCK_CATALOG = [
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'SPY', name: 'S&P 500 ETF' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF' },
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'XYZ100', name: 'Indice XYZ100' },
];

export function calculateIndicativeUsdValue(balance, unitPriceUsd) {
  if (!Number.isFinite(balance) || balance < 0
    || !Number.isFinite(unitPriceUsd) || unitPriceUsd < 0) return null;
  const value = balance * unitPriceUsd;
  return Number.isFinite(value) ? value : null;
}

export async function fetchCryptoMarketQuotes(fetchImpl = fetch) {
  const url = new URL(COINGECKO_MARKETS_URL);
  url.searchParams.set('vs_currency', 'usd');
  url.searchParams.set('ids', MARKET_CRYPTO_CATALOG.map(({ id }) => id).join(','));
  url.searchParams.set('order', 'market_cap_desc');
  url.searchParams.set('per_page', String(MARKET_CRYPTO_CATALOG.length));
  url.searchParams.set('page', '1');
  url.searchParams.set('sparkline', 'true');
  url.searchParams.set('price_change_percentage', '24h');

  const response = await fetchImpl(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Le fournisseur de cours a répondu avec le statut HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Le fournisseur de cours a renvoyé des données de marché invalides.');
  }

  const quotes = new Map(payload.map((coin) => [coin.id, coin]));
  return MARKET_CRYPTO_CATALOG.flatMap((asset) => {
    const coin = quotes.get(asset.id);
    if (!coin || !Number.isFinite(coin.current_price) || coin.current_price < 0
      || typeof coin.symbol !== 'string'
      || typeof coin.name !== 'string'
      || typeof coin.image !== 'string') return [];

    return [{
      ...asset,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      image: coin.image,
      priceUsd: coin.current_price,
      change24h: Number.isFinite(coin.price_change_percentage_24h)
        ? coin.price_change_percentage_24h
        : null,
      marketCapUsd: Number.isFinite(coin.market_cap) ? coin.market_cap : null,
      volume24hUsd: Number.isFinite(coin.total_volume) ? coin.total_volume : null,
      sparkline: Array.isArray(coin.sparkline_in_7d?.price)
        ? coin.sparkline_in_7d.price.filter(Number.isFinite)
        : [],
    }];
  });
}

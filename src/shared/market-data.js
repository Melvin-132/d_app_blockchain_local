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
  { symbol: 'MSFT', name: 'Microsoft' },
];

export async function fetchStockMarketQuotes(endpoint, fetchImpl = fetch) {
  if (!endpoint) {
    throw new Error('Configure le Worker Cloudflare dans VITE_STOCK_QUOTES_URL pour afficher les cours des actions.');
  }

  let url;
  try {
    url = new URL('/api/stocks', endpoint);
  } catch {
    throw new Error('L’URL du Worker de cours boursiers est invalide.');
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('Le Worker de cours boursiers doit utiliser une connexion HTTPS.');
  }

  const response = await fetchImpl(url.toString(), {
    headers: { Accept: 'application/json' },
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error(`Le Worker de cours boursiers a répondu avec le statut HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.quotes) || !Array.isArray(payload.unavailableSymbols)) {
    throw new Error('Le Worker a renvoyé des données de cours boursiers invalides.');
  }

  const quotesBySymbol = new Map(payload.quotes
    .filter((quote) => quote && typeof quote.symbol === 'string')
    .map((quote) => [quote.symbol.toUpperCase(), quote]));
  const quotes = MARKET_STOCK_CATALOG.flatMap((asset) => {
    const quote = quotesBySymbol.get(asset.symbol);
    if (!quote || !Number.isFinite(quote.priceUsd) || quote.priceUsd <= 0) return [];
    return [{
      ...asset,
      id: asset.symbol,
      group: 'stocks',
      priceUsd: quote.priceUsd,
      change24h: Number.isFinite(quote.change24h) ? quote.change24h : null,
      quoteTimestamp: Number.isSafeInteger(quote.quoteTimestamp) ? quote.quoteTimestamp : null,
      sparkline: [],
    }];
  });
  if (quotes.length === 0) {
    throw new Error('Le Worker n’a renvoyé aucun cours boursier vérifiable.');
  }

  return {
    quotes,
    unavailableSymbols: payload.unavailableSymbols.filter(
      (symbol) => typeof symbol === 'string' && MARKET_STOCK_CATALOG.some((asset) => asset.symbol === symbol),
    ),
  };
}

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

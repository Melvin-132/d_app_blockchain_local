import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateIndicativeUsdValue,
  fetchCryptoMarketQuotes,
  fetchStockMarketQuotes,
  MARKET_CRYPTO_FALLBACK_QUOTES,
  MARKET_STOCK_CATALOG,
} from '../src/shared/market-data.js';

function coin(id, overrides = {}) {
  return {
    id,
    symbol: id === 'bitcoin' ? 'btc' : 'eth',
    name: id === 'bitcoin' ? 'Bitcoin' : 'Ethereum',
    image: `https://example.test/${id}.png`,
    current_price: 63200,
    price_change_percentage_24h: -2.3,
    market_cap: 1000000,
    total_volume: 250000,
    sparkline_in_7d: { price: [1, 2, 1.5, 3] },
    ...overrides,
  };
}

test('requests crypto market quotes in USD and normalizes real market fields', async () => {
  let requestUrl;
  const quotes = await fetchCryptoMarketQuotes(async (url, options) => {
    requestUrl = new URL(url);
    assert.equal(options.headers.Accept, 'application/json');
    return {
      ok: true,
      async json() {
        return [coin('ethereum'), coin('bitcoin')];
      },
    };
  });

  assert.equal(requestUrl.searchParams.get('vs_currency'), 'usd');
  assert.equal(requestUrl.searchParams.get('sparkline'), 'true');
  assert.equal(quotes.length, 2);
  assert.equal(quotes[0].symbol, 'BTC');
  assert.equal(quotes[0].priceUsd, 63200);
  assert.equal(quotes[0].change24h, -2.3);
  assert.deepEqual(quotes[0].sparkline, [1, 2, 1.5, 3]);
  assert.equal(quotes.find(({ symbol }) => symbol === 'ETH').walletAsset, 'ETH');
});

test('does not fabricate missing quotes and reports provider errors', async () => {
  const quotes = await fetchCryptoMarketQuotes(async () => ({
    ok: true,
    async json() {
      return [coin('bitcoin', { current_price: null }), coin('ethereum')];
    },
  }));
  assert.deepEqual(quotes.map(({ symbol }) => symbol), ['ETH']);

  await assert.rejects(
    fetchCryptoMarketQuotes(async () => ({ ok: false, status: 429 })),
    /HTTP 429/,
  );
  await assert.rejects(
    fetchCryptoMarketQuotes(async () => ({
      ok: true,
      async json() {
        return { error: 'invalid' };
      },
    })),
    /données de marché invalides/,
  );
});

test('calculates indicative USD values from an asset balance and unit quote', () => {
  assert.equal(calculateIndicativeUsdValue(6, 1000), 6000);
  assert.equal(calculateIndicativeUsdValue(0.5, 2000), 1000);
  assert.equal(calculateIndicativeUsdValue(2, null), null);
  assert.equal(calculateIndicativeUsdValue(-1, 25), null);
});

test('keeps the complete asset catalog available without inventing failed live quotes', () => {
  assert.equal(MARKET_CRYPTO_FALLBACK_QUOTES.length, 13);
  assert.equal(MARKET_CRYPTO_FALLBACK_QUOTES.every(({ priceUsd }) => priceUsd === null), true);
  assert.equal(MARKET_CRYPTO_FALLBACK_QUOTES.every(({ image }) => image === null), true);
  assert.equal(MARKET_CRYPTO_FALLBACK_QUOTES.some(({ walletAsset }) => walletAsset === 'ETH'), true);
});

test('loads only verified stock quotes from the configured Worker', async () => {
  let requestUrl;
  const result = await fetchStockMarketQuotes('https://quotes.example.workers.dev', async (url, options) => {
    requestUrl = new URL(url);
    assert.equal(options.headers.Accept, 'application/json');
    assert.equal(options.credentials, 'omit');
    return {
      ok: true,
      async json() {
        return {
          provider: 'Finnhub',
          quotes: [
            { symbol: 'MSFT', priceUsd: 400, change24h: 1.25, quoteTimestamp: 1700000000 },
            { symbol: 'AAPL', priceUsd: 200, change24h: -0.5, quoteTimestamp: 1700000001 },
            { symbol: 'FAKE', priceUsd: 123, change24h: 10 },
            { symbol: 'NVDA', priceUsd: null, change24h: 0 },
          ],
          unavailableSymbols: ['NVDA', 'SPY', 'QQQ', 'TSLA'],
        };
      },
    };
  });

  assert.equal(requestUrl.href, 'https://quotes.example.workers.dev/api/stocks');
  assert.deepEqual(result.quotes.map(({ symbol }) => symbol), ['AAPL', 'MSFT']);
  assert.equal(result.quotes[1].name, 'Microsoft');
  assert.equal(result.quotes[1].group, 'stocks');
  assert.equal(result.quotes[1].priceUsd, 400);
  assert.equal(result.quotes[1].quoteTimestamp, 1700000000);
  assert.deepEqual(result.quotes[1].sparkline, []);
  assert.deepEqual(result.unavailableSymbols, ['NVDA', 'SPY', 'QQQ', 'TSLA']);
  assert.equal(MARKET_STOCK_CATALOG.some(({ symbol }) => symbol === 'XYZ100'), false);
});

test('reports missing stock Worker, HTTP failures, and malformed quote data', async () => {
  await assert.rejects(
    fetchStockMarketQuotes(''),
    /Configure le Worker Cloudflare/,
  );
  await assert.rejects(
    fetchStockMarketQuotes('https://quotes.example.workers.dev', async () => ({ ok: false, status: 503 })),
    /HTTP 503/,
  );
  await assert.rejects(
    fetchStockMarketQuotes('https://quotes.example.workers.dev', async () => ({
      ok: true,
      async json() {
        return { quotes: [], unavailableSymbols: [] };
      },
    })),
    /aucun cours boursier vérifiable/,
  );
});

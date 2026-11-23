import assert from 'node:assert/strict';
import test from 'node:test';
import stockQuotesWorker from '../cloudflare/stock-quotes/src/index.js';

const origin = 'https://melvin-132.github.io';
const env = {
  FINNHUB_API_KEY: 'test-secret-token',
  ALLOWED_ORIGINS: `${origin},http://127.0.0.1:5175`,
};

function request(path = '/api/stocks', method = 'GET', requestOrigin = origin) {
  return new Request(`https://quotes.example.workers.dev${path}`, {
    method,
    headers: requestOrigin ? { Origin: requestOrigin } : {},
  });
}

test('serves a fixed, sanitized stock catalog with strict CORS', async () => {
  const originalFetch = globalThis.fetch;
  const symbolsRequested = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    assert.equal(url.hostname, 'finnhub.io');
    assert.equal(url.searchParams.get('token'), env.FINNHUB_API_KEY);
    const symbol = url.searchParams.get('symbol');
    symbolsRequested.push(symbol);
    return new Response(JSON.stringify({
      c: 100 + symbolsRequested.length,
      dp: 1.5,
      t: 1_700_000_000,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const response = await stockQuotesWorker.fetch(request(), env);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
    assert.equal(payload.provider, 'Finnhub');
    assert.deepEqual(symbolsRequested.sort(), ['AAPL', 'MSFT', 'NVDA', 'QQQ', 'SPY', 'TSLA']);
    assert.equal(payload.quotes.length, 6);
    assert.deepEqual(payload.quotes[0], {
      symbol: 'NVDA',
      priceUsd: 101,
      change24h: 1.5,
      quoteTimestamp: 1_700_000_000,
    });
    assert.equal(JSON.stringify(payload).includes(env.FINNHUB_API_KEY), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects unknown origins, routes, methods, and unconfigured provider credentials', async () => {
  assert.equal((await stockQuotesWorker.fetch(request('/api/stocks', 'GET', 'https://attacker.example'), env)).status, 403);
  assert.equal((await stockQuotesWorker.fetch(request('/anything'), env)).status, 404);
  assert.equal((await stockQuotesWorker.fetch(request('/api/stocks', 'POST'), env)).status, 405);
  assert.equal((await stockQuotesWorker.fetch(request(), { ALLOWED_ORIGINS: origin })).status, 503);
});

test('handles browser preflight and does not fabricate quotes when the provider fails', async () => {
  const preflight = await stockQuotesWorker.fetch(request('/api/stocks', 'OPTIONS'), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ c: 0, dp: null }), { status: 200 });
  try {
    const response = await stockQuotesWorker.fetch(request(), env);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: 'The stock quote provider returned no valid prices.',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns valid prices and explicitly reports symbols without a quote', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const symbol = new URL(input).searchParams.get('symbol');
    return new Response(JSON.stringify(symbol === 'NVDA'
      ? { c: 120, dp: 0.8, t: 1_700_000_000 }
      : { c: 0, dp: null }), { status: 200 });
  };
  try {
    const response = await stockQuotesWorker.fetch(request(), env);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload.quotes.map(({ symbol }) => symbol), ['NVDA']);
    assert.deepEqual(payload.unavailableSymbols, ['SPY', 'QQQ', 'AAPL', 'TSLA', 'MSFT']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

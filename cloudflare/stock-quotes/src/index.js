const STOCK_SYMBOLS = ['NVDA', 'SPY', 'QQQ', 'AAPL', 'TSLA', 'MSFT'];
const FINNHUB_QUOTE_URL = 'https://finnhub.io/api/v1/quote';
const CACHE_KEY = new Request('https://clayde-stock-quotes-cache.internal/api/stocks');

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Cache-Control': 'public, max-age=60',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function addCorsHeaders(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

async function fetchQuote(symbol, apiKey) {
  const url = new URL(FINNHUB_QUOTE_URL);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('token', apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    if (!response.ok) return null;

    const quote = await response.json();
    if (!Number.isFinite(quote.c) || quote.c <= 0) return null;
    return {
      symbol,
      priceUsd: quote.c,
      change24h: Number.isFinite(quote.dp) ? quote.dp : null,
      quoteTimestamp: Number.isSafeInteger(quote.t) && quote.t > 0 ? quote.t : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = new Set(
      (env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean),
    );
    if (!origin || !allowedOrigins.has(origin)) {
      return jsonResponse({ error: 'Origin not allowed.' }, 403);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/stocks') {
      return addCorsHeaders(jsonResponse({ error: 'Not found.' }, 404), origin);
    }
    if (request.method === 'OPTIONS') {
      return addCorsHeaders(new Response(null, { status: 204 }), origin);
    }
    if (request.method !== 'GET') {
      return addCorsHeaders(jsonResponse({ error: 'Method not allowed.' }, 405), origin);
    }
    if (!env.FINNHUB_API_KEY) {
      return addCorsHeaders(jsonResponse({ error: 'The stock quote provider is not configured.' }, 503), origin);
    }

    const edgeCache = globalThis.caches?.default;
    if (edgeCache) {
      const cachedResponse = await edgeCache.match(CACHE_KEY);
      if (cachedResponse) return addCorsHeaders(cachedResponse, origin);
    }

    const results = await Promise.all(STOCK_SYMBOLS.map((symbol) => fetchQuote(symbol, env.FINNHUB_API_KEY)));
    const quotes = results.filter(Boolean);
    if (quotes.length === 0) {
      return addCorsHeaders(jsonResponse({ error: 'The stock quote provider returned no valid prices.' }, 502), origin);
    }

    const unavailableSymbols = STOCK_SYMBOLS.filter((symbol) => !quotes.some((quote) => quote.symbol === symbol));
    const response = jsonResponse({
      provider: 'Finnhub',
      quotes,
      unavailableSymbols,
    });

    if (edgeCache && unavailableSymbols.length === 0) {
      await edgeCache.put(CACHE_KEY, response.clone());
    }
    return addCorsHeaders(response, origin);
  },
};

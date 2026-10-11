const ALLOWED_ROOTS = new Set([
  'trending', 'discover', 'movie', 'tv', 'search', 'collection', 'person'
]);

// Every attempt and back-off shares one budget so a rate-limited TMDB can't
// push a request past the client's 12s timeout (or the function's own limit).
// The old retry loop could stack 8s timeouts and 8s waits to ~40s.
const BUDGET_MS = 9000;
const MAX_ATTEMPTS = 3;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

// Only CDN cache misses reach this function. A cold home page alone is ~40
// misses (and every deploy starts the CDN cold), so 60/min tripped normal
// browsing, and visitors behind a shared IP share one bucket.
const RATE_LIMIT_PER_MIN = 180;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function retryDelayMs(response, attempt) {
  const retryAfter = Number.parseInt(response?.headers.get('Retry-After') || '', 10);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000;
  return 400 * 2 ** attempt;
}

async function fetchTmdb(target) {
  const deadline = Date.now() + BUDGET_MS;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.max(deadline - Date.now(), 0));
    let response = null;
    try {
      response = await fetch(target, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (response && !RETRY_STATUSES.has(response.status)) return response;

    const waitMs = retryDelayMs(response, attempt);
    const isLastChance = attempt === MAX_ATTEMPTS - 1 || Date.now() + waitMs + 1000 > deadline;
    if (isLastChance) {
      if (response) return response;
      break;
    }
    response?.body?.cancel().catch(() => {});
    await sleep(waitMs);
  }

  throw lastError || new Error('TMDB request failed.');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { rateLimit } = await import('./_ratelimit.js');
  if (!rateLimit(req, res, { windowMs: 60000, max: RATE_LIMIT_PER_MIN })) return;

  const { endpoint } = req.query;
  const apiKey = process.env.TMDB_API_KEY;

  if (!endpoint || Array.isArray(endpoint) || endpoint.length > 500) {
    return res.status(400).json({ error: 'A valid endpoint is required.' });
  }

  if (!apiKey) {
    return res.status(503).json({ error: 'TMDB is not configured on this deployment.' });
  }

  try {
    const target = new URL(endpoint, 'https://api.themoviedb.org/3/');
    const basePath = '/3/';
    const root = target.pathname.slice(basePath.length).split('/')[0];

    if (
      target.origin !== 'https://api.themoviedb.org' ||
      !target.pathname.startsWith(basePath) ||
      !ALLOWED_ROOTS.has(root)
    ) {
      return res.status(400).json({ error: 'Unsupported TMDB endpoint.' });
    }

    // Cap runaway pagination / quota burn. Only when client sends page.
    const pageRaw = target.searchParams.get('page');
    if (pageRaw !== null) {
      const page = Number(pageRaw);
      if (!Number.isInteger(page) || page < 1 || page > 500) {
        return res.status(400).json({ error: 'Unsupported TMDB endpoint.' });
      }
    }

    target.searchParams.set('api_key', apiKey);
    if (!target.searchParams.has('language')) target.searchParams.set('language', 'en-US');

    const response = await fetchTmdb(target);
    const data = await response.json().catch(() => ({ error: 'TMDB returned an unreadable response.' }));
    res.setHeader(
      'Cache-Control',
      response.ok ? 's-maxage=900, stale-while-revalidate=3600' : 'no-store'
    );
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    const timedOut = error.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? 'TMDB request timed out.' : 'Failed to fetch data from TMDB.'
    });
  }
}

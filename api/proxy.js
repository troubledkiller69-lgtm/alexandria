const ALLOWED_ROOTS = new Set([
  'trending', 'discover', 'movie', 'tv', 'search', 'collection', 'person'
]);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    target.searchParams.delete('api_key');
    target.searchParams.set('api_key', apiKey);
    if (!target.searchParams.has('language')) target.searchParams.set('language', 'en-US');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(target, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    clearTimeout(timeoutId);

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

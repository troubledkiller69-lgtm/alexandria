export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'OMDb is not configured on this deployment.' });
  }

  const { i } = req.query;
  const imdbId = Array.isArray(i) ? i[0] : i;
  if (!imdbId || typeof imdbId !== 'string' || !/^tt\d{5,12}$/.test(imdbId)) {
    return res.status(400).json({ error: 'A valid IMDb id is required (tt…).' });
  }

  try {
    const target = new URL('https://www.omdbapi.com/');
    target.searchParams.set('i', imdbId);
    target.searchParams.set('apikey', apiKey);
    target.searchParams.set('plot', 'short');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(target, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({ Response: 'False', Error: 'Unreadable OMDb response.' }));
    res.setHeader(
      'Cache-Control',
      data.Response === 'True' ? 's-maxage=86400, stale-while-revalidate=604800' : 'no-store'
    );
    return res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    console.error('OMDb proxy error:', error.message);
    const timedOut = error.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? 'OMDb request timed out.' : 'Failed to fetch data from OMDb.'
    });
  }
}

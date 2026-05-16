export default async function handler(req, res) {
  const { endpoint } = req.query;
  const apiKey = process.env.TMDB_API_KEY;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is required' });
  }

  // Security: Prevent SSRF and malicious injections
  // Only allow alphanumeric, slashes, underscores, and specific symbols for query params
  if (!/^[a-zA-Z0-9\/\?\&\_=\-]+$/.test(endpoint)) {
    return res.status(400).json({ error: 'Invalid endpoint signature detected' });
  }

  if (!apiKey) {
    return res.status(500).json({ error: 'API Key not configured on server' });
  }

  try {
    const url = `https://api.themoviedb.org/3/${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch data from TMDB',
      details: error.message 
    });
  }
}

// Mirror health probe. Best-effort reachability check on every embed mirror
// from a real TMDB id. This is a signal, not a guarantee: an HTTP 200 means
// the mirror's front door is open; whether a specific stream plays is decided
// by the mirror's own upstreams at playback time.

const MIRRORS = [
  { name: 'Alexandria', url: 'https://embedmaster.link/9gis39azyhxlvq5t/movie/550' },
  { name: 'EmbedMaster Public', url: 'https://embedmaster.link/movie/550' },
  { name: 'VidSrc', url: 'https://vidsrc.cc/v2/embed/movie/550' },
  { name: 'VidSrc TO', url: 'https://vidsrc.to/embed/movie/550' },
  { name: 'EmbedSU', url: 'https://www.embed.su/embed/movie/550' },
  { name: 'VidLink', url: 'https://vidlink.pro/movie/550' },
  { name: 'VidCore', url: 'https://vidcore.org/embed/movie/550' },
  { name: 'VidFast', url: 'https://vidfast.vc/movie/550' },
  { name: 'VidLux', url: 'https://vidlux.xyz/embed/movie/550' },
  { name: 'MegaPlay Anime', url: 'https://megaplay.buzz/' }
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function probeOne(mirror) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const started = Date.now();
  try {
    const response = await fetch(mirror.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8' }
    });
    const ms = Date.now() - started;
    const body = await response.text().catch(() => '');
    const blocked = response.status >= 400
      || body.length < 200
      || /cloudflare|just a moment|attention required|access denied|forbidden/i.test(body.slice(0, 4000));
    return { name: mirror.name, ok: !blocked, status: response.status, ms };
  } catch {
    return { name: mirror.name, ok: false, status: 0, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const results = await Promise.all(MIRRORS.map(probeOne));
  const checkedAt = Date.now();
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');
  return res.status(200).json({ checkedAt, mirrors: results });
}

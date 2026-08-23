// Anime identity cache — thin read/write layer over Supabase.
//
// All AniList/TMDB RESOLUTION happens client-side (browsers reach AniList;
// datacenter IPs like Vercel's get 403-blocked by it). This function only
// persists and serves previously resolved mappings so each title/season/
// episode is solved once across all visitors.

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(body);
}

async function sb(cfg, path, opts = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        ...(opts.prefer ? { Prefer: opts.prefer } : {})
      },
      signal: controller.signal,
      ...opts.fetch
    });
    clearTimeout(timer);
    if (!res.ok && res.status !== 404) return null;
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const cfg = supabaseConfig();
  if (!cfg) return json(res, 503, { error: 'Anime cache is not configured.' });

  // ---------- POST: persist a client-resolved mapping ----------
  if (req.method === 'POST') {
    const b = req.body || {};
    const tmdbId = Number.parseInt(b.tmdbId, 10);
    const season = Math.max(1, Number.parseInt(b.season, 10) || 1);
    const anilistId = Number.parseInt(b.anilistId, 10);
    const malId = Number.parseInt(b.malId, 10);
    if (!Number.isInteger(tmdbId) || (!Number.isInteger(anilistId) && !Number.isInteger(malId))) {
      return json(res, 400, { error: 'tmdbId plus anilistId or malId are required.' });
    }
    const row = {
      tmdb_id: tmdbId,
      season,
      anilist_id: Number.isInteger(anilistId) ? anilistId : null,
      mal_id: malId,
      title: typeof b.title === 'string' ? b.title.slice(0, 200) : null,
      anilist_episodes: Number.parseInt(b.episodes, 10) || null,
      requested_episode: Number.parseInt(b.requestedEpisode, 10) || null,
      resolved_at: new Date().toISOString()
    };
    await sb(cfg, 'anime_season_map', {
      prefer: 'resolution=merge-duplicates',
      fetch: { method: 'POST', body: JSON.stringify(row) }
    });
    if (season === 1 && row.anilist_id != null && row.anilist_episodes == null) {
      // Keep the legacy base table warm for S1 too.
      await sb(cfg, 'anime_map', {
        prefer: 'resolution=merge-duplicates',
        fetch: {
          method: 'POST',
          body: JSON.stringify({
            tmdb_id: tmdbId,
            anilist_id: row.anilist_id,
            mal_id: row.mal_id,
            title: row.title,
            dub_available: typeof b.dubAvailable === 'boolean' ? b.dubAvailable : null,
            resolved_at: row.resolved_at
          })
        }
      });
    }
    return json(res, 204, {});
  }

  // ---------- GET: serve cached mappings ----------
  const tmdbIdRaw = Array.isArray(req.query.tmdb) ? req.query.tmdb[0] : req.query.tmdb;
  const tmdbId = Number.parseInt(tmdbIdRaw, 10);
  const season = Math.max(1, Number.parseInt(req.query.season, 10) || 1);
  if (!Number.isInteger(tmdbId)) return json(res, 400, { error: 'tmdb is required.' });

  res.setHeader('Cache-Control', 'no-store');

  if (season > 1) {
    const rows = await sb(
      cfg,
      `anime_season_map?tmdb_id=eq.${tmdbId}&season=eq.${season}&select=*`
    );
    const hit = rows?.[0];
    if (hit && (hit.anilist_id || hit.mal_id)) {
      return json(res, 200, {
        found: true,
        tmdbId,
        season,
        anilistId: hit.anilist_id ?? null,
        malId: hit.mal_id ?? null,
        title: hit.title ?? null,
        episodes: hit.anilist_episodes ?? null,
        requestedEpisode: hit.requested_episode ?? null,
        dubAvailable: typeof hit.dub_available === 'boolean' ? hit.dub_available : null
      });
    }
    return json(res, 200, { found: false });
  }

  // Season 1: check the season table first (absolute-numbered shows store
  // per-episode answers there via POST with episode context), then base map.
  const epRaw = Number.parseInt(req.query.episode, 10);
  const episode = Number.isInteger(epRaw) ? epRaw : null;

  if (episode) {
    const rows = await sb(
      cfg,
      `anime_season_map?tmdb_id=eq.${tmdbId}&season=eq.1&requested_episode=eq.${episode}&select=*`
    );
    const exact = rows?.find(r =>
      r.anilist_episodes == null ||
      r.requested_episode == null ||
      episode <= (r.anilist_episodes || Infinity)
    );
    if (exact && (exact.anilist_id || exact.mal_id)) {
      return json(res, 200, {
        found: true,
        tmdbId,
        season: 1,
        anilistId: exact.anilist_id ?? null,
        malId: exact.mal_id ?? null,
        title: exact.title ?? null,
        episodes: exact.anilist_episodes ?? null,
        requestedEpisode: episode,
        dubAvailable: typeof exact.dub_available === 'boolean' ? exact.dub_available : null
      });
    }
  }

  const baseRows = await sb(cfg, `anime_map?tmdb_id=eq.${tmdbId}&select=*`);
  const base = baseRows?.[0];
  if (base && (base.anilist_id || base.mal_id)) {
    return json(res, 200, {
      found: true,
      tmdbId,
      season: 1,
      anilistId: base.anilist_id ?? null,
      malId: base.mal_id ?? null,
      title: base.title ?? null,
      episodes: null,
      dubAvailable: typeof base.dub_available === 'boolean' ? base.dub_available : null
    });
  }

  return json(res, 200, { found: false });
}

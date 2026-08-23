const ANILIST_GRAPHQL = 'https://graphql.anilist.co';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(body);
}

async function fetchJson(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function getTmdb(path, apiKey) {
  const target = new URL(`https://api.themoviedb.org/3/${path}`);
  target.searchParams.set('api_key', apiKey);
  target.searchParams.set('language', 'en-US');
  const { ok, status, data } = await fetchJson(target);
  return ok ? data : null;
}

async function anilistQuery(query, variables) {
  const { ok, status, data } = await fetchJson(ANILIST_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ query, variables })
  }, 9000);
  if (!ok || !data?.data) {
    throw Object.assign(new Error(`AniList request failed (${status})`), { status: 502 });
  }
  return data.data;
}

const MEDIA_FIELDS = `
  id
  idMal
  format
  episodes
  countryOfOrigin
  startDate { year }
  title { romaji english native }
`;

async function searchAniList(title, year) {
  const gql = `
    query ($search: String) {
      Page(perPage: 10) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
      }
    }`;
  const data = await anilistQuery(gql, { search: title });
  return data?.Page?.media || [];
}

// Sequel seasons live under separate AniList ids connected by SEQUEL edges.
// Walk the chain so TMDB season N maps to its own AniList entry.
async function getSequelChain(anilistId, maxHops = 12) {
  const gql = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        relations {
          edges {
            relationType
            node { ${MEDIA_FIELDS} }
          }
        }
      }
    }`;
  const chain = [];
  let currentId = anilistId;
  const visited = new Set([anilistId]);
  for (let hop = 0; hop < maxHops; hop++) {
    const data = await anilistQuery(gql, { id: currentId });
    const edges = data?.Media?.relations?.edges || [];
    const sequelEdge = edges.find(e =>
      e?.relationType === 'SEQUEL' && e.node?.id && !visited.has(e.node.id)
    );
    if (!sequelEdge) break;
    const node = { ...sequelEdge.node, __relationType: sequelEdge.relationType };
    chain.push(node);
    visited.add(node.id);
    currentId = node.id;
  }
  return chain;
}

function pickAniListMatch(candidates, { title, originalTitle, year, isMovie }) {
  let best = null;
  let bestScore = 0;
  for (const m of candidates) {
    if (!m?.id) continue;
    let score = 0;
    if (m.countryOfOrigin === 'JP') score += 3;
    const mYear = m.startDate?.year;
    if (year && mYear) {
      const delta = Math.abs(mYear - year);
      if (delta === 0) score += 4;
      else if (delta === 1) score += 2;
      else score -= 2;
    }
    const titles = [m.title?.english, m.title?.romaji, m.title?.native]
      .filter(Boolean).map(t => t.toLowerCase());
    const want = [title, originalTitle].filter(Boolean).map(t => t.toLowerCase());
    if (want.some(w => titles.includes(w))) score += 3;
    const looksMovie = ['MOVIE'].includes(m.format);
    if (isMovie === looksMovie) score += 1;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  // A weak match is worse than no match — require real signal.
  return bestScore >= 5 ? best : null;
}

// Best-effort dub availability probe against MegaPlay. Never throws.
async function probeDub(anilistId) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://megaplay.buzz/stream/ani/${anilistId}/1/dub`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        Accept: 'text/html'
      },
      redirect: 'follow'
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const html = (await res.text()).toLowerCase();
    if (html.length < 500) return false;
    if (/episode.*(not|no).*available|dub.*not.*available|we couldn't find/.test(html)) return false;
    return /player|iframe|stream|vidcloud|megacloud/.test(html);
  } catch {
    return null;
  }
}

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}

async function mapRead(cfg, column, value) {
  const target = `${cfg.url}/rest/v1/anime_map?${column}=eq.${encodeURIComponent(value)}&select=*`;
  const res = await fetch(target, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }
  });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function mapUpsert(cfg, row) {
  try {
    await fetch(`${cfg.url}/rest/v1/anime_map`, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify(row)
    });
  } catch { /* cache write failures must not fail the request */ }
}

async function seasonMapRead(cfg, tmdbId, season) {
  const target = `${cfg.url}/rest/v1/anime_season_map?tmdb_id=eq.${tmdbId}&season=eq.${season}&select=*`;
  const res = await fetch(target, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }
  });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function seasonMapUpsert(cfg, row) {
  try {
    await fetch(`${cfg.url}/rest/v1/anime_season_map`, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify(row)
    });
  } catch { /* cache write failures must not fail the request */ }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const tmdbIdRaw = req.query.tmdb;
  const anilistIdRaw = req.query.anilist;
  const tmdbKey = process.env.TMDB_API_KEY;

  if (!tmdbKey) return json(res, 503, { error: 'TMDB is not configured on this deployment.' });

  // ---------- Forward: TMDB id (+ optional season/episode) → AniList ----------
  if (tmdbIdRaw && !Array.isArray(tmdbIdRaw) && /^\d{1,7}$/.test(tmdbIdRaw)) {
    const tmdbId = Number(tmdbIdRaw);
    const seasonRaw = Number.parseInt(Array.isArray(req.query.season) ? req.query.season[0] : req.query.season, 10);
    const season = Number.isInteger(seasonRaw) && seasonRaw >= 1 ? seasonRaw : 1;
    const episodeRaw = Number.parseInt(Array.isArray(req.query.episode) ? req.query.episode[0] : req.query.episode, 10);
    const episode = Number.isInteger(episodeRaw) && episodeRaw >= 1 ? episodeRaw : null;
    const cfg = supabaseConfig();

    // Season-level cache answers first — it already encodes the sequel hop.
    if (cfg) {
      const cachedSeason = await seasonMapRead(cfg, tmdbId, season);
      if (cachedSeason?.anilist_id) {
        res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
        return json(res, 200, {
          tmdbId,
          season,
          anilistId: cachedSeason.anilist_id,
          malId: cachedSeason.mal_id ?? null,
          title: cachedSeason.title ?? null,
          episodes: cachedSeason.anilist_episodes ?? null,
          dubAvailable: typeof cachedSeason.dub_available === 'boolean' ? cachedSeason.dub_available : null
        });
      }
    }

    const tv = await getTmdb(`tv/${tmdbId}`, tmdbKey);
    const movie = tv ? null : await getTmdb(`movie/${tmdbId}`, tmdbKey);
    const meta = tv || movie;
    if (!meta) return json(res, 404, { error: 'Unknown TMDB id.' });

    const type = tv ? 'tv' : 'movie';
    const year = Number((meta.first_air_date || meta.release_date || '').slice(0, 4)) || null;
    const title = meta.name || meta.title || '';
    if (!title) return json(res, 404, { error: 'TMDB record has no title.' });

    try {
      // Resolve the BASE entry (first season / source work).
      const candidates = await searchAniList(title, year);
      const base = pickAniListMatch(candidates, {
        title,
        originalTitle: meta.original_name || meta.original_title,
        year,
        isMovie: type === 'movie'
      });
      if (!base) {
        res.setHeader('Cache-Control', 'no-store');
        return json(res, 404, { error: 'No confident AniList match for this title.' });
      }

      let target = { ...base };
      let effectiveEpisode = episode;

      // Case A: explicit season > 1 → hop the sequel chain.
      if (type === 'tv' && season > 1) {
        const chain = await getSequelChain(base.id, Math.min(season - 1, 12));
        const targetNode = chain[season - 2];
        if (!targetNode) {
          res.setHeader('Cache-Control', 'no-store');
          return json(res, 404, { error: `Could not map season ${season} on AniList.` });
        }
        target = targetNode;
      }

      // Case B: absolute-numbered shows (TMDB packs every season into S1).
      // Walk sequels subtracting episode counts until we land inside one.
      if (
        type === 'tv' && season <= 1 && episode &&
        Number.isInteger(target.episodes) && target.episodes > 0 &&
        episode > target.episodes
      ) {
        const chain = await getSequelChain(base.id, 12);
        let cursor = { ...base };
        let eff = episode;
        for (const next of chain) {
          if (!(Number.isInteger(cursor.episodes) && cursor.episodes > 0)) break;
          if (eff <= cursor.episodes) break;
          eff -= cursor.episodes;
          cursor = next;
        }
        target = cursor;
        effectiveEpisode = eff;
      }

      const dubAvailable = await probeDub(target.id);
      const row = {
        tmdb_id: tmdbId,
        season,
        anilist_id: target.id,
        mal_id: target.idMal ?? null,
        title: target.title?.english || target.title?.romaji || title,
        anilist_episodes: target.episodes ?? null,
        dub_available: dubAvailable,
        resolved_at: new Date().toISOString()
      };
      if (cfg) await seasonMapUpsert(cfg, row);
      // Keep the base table in sync for season 1 so reverse lookups and the
      // details badge keep working off anime_map too.
      if (cfg && season === 1) {
        await mapUpsert(cfg, {
          tmdb_id: tmdbId,
          anilist_id: base.id,
          mal_id: base.idMal ?? null,
          title,
          dub_available: dubAvailable,
          resolved_at: new Date().toISOString()
        });
      }

      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
      return json(res, 200, {
        tmdbId,
        season,
        anilistId: target.id,
        malId: target.idMal ?? null,
        title: row.title,
        episodes: target.episodes ?? null,
        requestedEpisode: effectiveEpisode,
        dubAvailable
      });
    } catch (e) {
      return json(res, e.status || 502, { error: e.message || 'AniList lookup failed.' });
    }
  }

  // ---------- Reverse: AniList id → TMDB id (used by AniList import) ----------
  if (anilistIdRaw && !Array.isArray(anilistIdRaw) && /^\d{1,7}$/.test(anilistIdRaw)) {
    const anilistId = Number(anilistIdRaw);
    const cfg = supabaseConfig();
    if (cfg) {
      const cached = await mapRead(cfg, 'anilist_id', anilistId);
      if (cached?.tmdb_id) {
        res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
        return json(res, 200, {
          anilistId,
          tmdbId: cached.tmdb_id,
          malId: cached.mal_id ?? null,
          title: cached.title ?? null
        });
      }
    }

    try {
      const gql = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} }
        }`;
      const data = await anilistQuery(gql, { id: anilistId });
      const media = data?.Media;
      if (!media) return json(res, 404, { error: 'Unknown AniList id.' });
      const title = media.title?.english || media.title?.romaji || '';
      if (!title) return json(res, 404, { error: 'AniList record has no usable title.' });
      const year = media.startDate?.year || null;
      const isMovie = media.format === 'MOVIE';

      const searchPath = isMovie ? 'search/movie' : 'search/tv';
      const params = new URLSearchParams({ query: title });
      if (year) {
        params.set(isMovie ? 'year' : 'first_air_date_year', String(year));
      }
      const results = await getTmdb(`${searchPath}?${params}`, tmdbKey);
      const rows = results?.results || [];
      const lowerTitle = title.toLowerCase();
      const hit =
        rows.find(r => (r.title || r.name || '').toLowerCase() === lowerTitle) ||
        rows.find(r => ((r.title || r.name || '').toLowerCase()).startsWith(lowerTitle.slice(0, 12))) ||
        rows[0] ||
        null;
      if (!hit) {
        res.setHeader('Cache-Control', 'no-store');
        return json(res, 404, { error: `No TMDB match for "${title}".` });
      }

      if (cfg) {
        await mapUpsert(cfg, {
          tmdb_id: hit.id,
          anilist_id: anilistId,
          mal_id: media.idMal ?? null,
          title: hit.name || hit.title || title,
          dub_available: null,
          resolved_at: new Date().toISOString()
        });
      }
      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
      return json(res, 200, {
        anilistId,
        tmdbId: hit.id,
        tmdbType: isMovie ? 'movie' : 'tv',
        malId: media.idMal ?? null,
        title: hit.name || hit.title || title
      });
    } catch (e) {
      return json(res, e.status || 502, { error: e.message || 'AniList lookup failed.' });
    }
  }

  return json(res, 400, { error: 'Provide ?tmdb={id} or ?anilist={id}.' });
}

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
    if (opts.write) {
      if (res.ok) return { ok: true, status: res.status };
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: text.slice(0, 300) };
    }
    if (!res.ok && res.status !== 404) return null;
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

const TMDB_KEY_CHECK = () => process.env.TMDB_API_KEY;

async function getTmdbMeta(path, apiKey) {
  const target = new URL(`https://api.themoviedb.org/3/${path}`);
  target.searchParams.set('api_key', apiKey);
  target.searchParams.set('language', 'en-US');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(target, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok ? await res.json().catch(() => null) : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ---- Server-side Jikan (MAL) resolution — independent of AniList ----

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jikan(path, attempt = 0) {
  let res;
  try {
    res = await fetch(`https://api.jikan.moe/v4${path}`);
  } catch {
    if (attempt < 2) { await sleep(1100); return jikan(path, attempt + 1); }
    throw new Error('jikan unreachable');
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await sleep(1200);
    return jikan(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`jikan ${res.status}`);
  const body = await res.json().catch(() => null);
  if (!body?.data) throw new Error('jikan empty');
  return body.data;
}

function jikanScore(entry, hint) {
  let s = 0;
  const mY = entry.year || (entry.aired?.from ? Number(String(entry.aired.from).slice(0, 4)) : null);
  if (hint.year && mY) {
    const d = Math.abs(mY - hint.year);
    if (d === 0) s += 4; else if (d === 1) s += 2; else s -= 2;
  }
  const titles = [entry.title, entry.title_english, entry.title_japanese]
    .filter(Boolean).map(t => t.toLowerCase());
  const want = [hint.title, hint.originalTitle].filter(Boolean).map(t => t.toLowerCase());
  if (want.some(w => titles.includes(w))) s += 3;
  if ((hint.isMovie === true) === (entry.type === 'Movie')) s += 1;
  return s;
}

async function jikanMatch(hint) {
  const results = await jikan(`/anime?q=${encodeURIComponent(hint.title)}&limit=6&sfw=true`);
  let best = null, bs = 0;
  for (const e of results || []) {
    if (!e?.mal_id) continue;
    const s = jikanScore(e, hint);
    if (s > bs) { bs = s; best = e; }
  }
  if (bs < 5 || !best) throw new Error('No confident MAL match.');
  return best;
}

// Walk MAL sequel relations so multi-season and absolute-numbered shows land
// on the right entry — mirrors the client-side AniList walk.
async function jikanWalk(base, { season, episode, isMovie }) {
  let cursor = { malId: base.mal_id, episodes: base.episodes ?? null };
  let eff = episode;

  async function hop() {
    await sleep(420);
    const rel = await jikan(`/anime/${cursor.malId}/relations`);
    const seq = (rel || []).find(r => r.relation === 'Sequel')?.entry?.find(x => x.type === 'anime');
    if (!seq?.mal_id || !cursor.episodes) return false;
    eff -= cursor.episodes;
    await sleep(420);
    const full = await jikan(`/anime/${seq.mal_id}/full`);
    cursor = { malId: seq.mal_id, episodes: full?.episodes ?? null };
    return true;
  }

  if (!isMovie && season > 1) {
    for (let i = 1; i < season; i++) {
      if (!(await hop())) throw new Error(`Could not map season ${season} on MAL.`);
    }
    return { cursor, eff: episode };
  }
  while (eff && Number.isInteger(cursor.episodes) && cursor.episodes > 0 && eff > cursor.episodes) {
    if (!(await hop())) break;
  }
  return { cursor, eff };
}

// Short-lived memory so an outage doesn't add multi-second Jikan retry
// latency to every request on warm instances.
const jikanFailMemory = new Map();
const JIKAN_FAIL_TTL = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const cfg = supabaseConfig();
  if (!cfg) return json(res, 503, { error: 'Anime cache is not configured.' });

  // ---------- POST: persist client-resolved mappings ----------
  if (req.method === 'POST') {
    const b = req.body || {};
    const items = Array.isArray(b.rows) ? b.rows : [b];
    const parsed = [];
    for (const it of items) {
      const tmdbId = Number.parseInt(it.tmdbId, 10);
      const season = Math.max(1, Number.parseInt(it.season, 10) || 1);
      const anilistId = Number.parseInt(it.anilistId, 10);
      const malId = Number.parseInt(it.malId, 10);
      if (!Number.isInteger(tmdbId) || (!Number.isInteger(anilistId) && !Number.isInteger(malId))) continue;
      parsed.push({
        tmdb_id: tmdbId,
        season,
        anilist_id: Number.isInteger(anilistId) ? anilistId : null,
        mal_id: malId,
        title: typeof it.title === 'string' ? it.title.slice(0, 200) : null,
        anilist_episodes: Number.parseInt(it.episodes, 10) || null,
        original_episode: Number.parseInt(it.originalEpisode, 10)
          || Number.parseInt(it.requestedEpisode, 10)
          || null,
        requested_episode: Number.parseInt(it.requestedEpisode, 10) || null,
        resolved_at: new Date().toISOString()
      });
    }
    if (!parsed.length) return json(res, 400, { error: 'No valid rows.' });

    let inserted = 0, failed = 0, firstErr = null;
    for (let i = 0; i < parsed.length; i += 200) {
      const chunk = parsed.slice(i, i + 200);
      // columns= pins the ON CONFLICT arbiter to the real identity constraint;
      // without it PostgREST targets the identity PK and never conflicts.
      const out = await sb(cfg, 'anime_season_map?columns=tmdb_id,season,original_episode', {
        write: true,
        prefer: 'resolution=merge-duplicates',
        fetch: { method: 'POST', body: JSON.stringify(chunk) }
      });
      if (out?.ok) inserted += chunk.length;
      else { failed += chunk.length; if (!firstErr) firstErr = out?.error || `status ${out?.status}`; }
    }
    return json(res, 200, { inserted, failed, error: firstErr || null });
    // Keep the legacy base table warm for S1 entries that carry AniList ids.
    const s1Base = parsed.filter(p => p.season === 1 && p.anilist_id != null && p.anilist_episodes == null);
    for (let i = 0; i < s1Base.length; i += 200) {
      await sb(cfg, 'anime_map?columns=tmdb_id', {
        prefer: 'resolution=merge-duplicates',
        fetch: {
          method: 'POST',
          body: JSON.stringify(s1Base.slice(i, i + 200).map(p => ({
            tmdb_id: p.tmdb_id,
            anilist_id: p.anilist_id,
            mal_id: p.mal_id,
            title: p.title,
            dub_available: null,
            resolved_at: p.resolved_at
          })))
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
    // Segments first: stacked absolute-numbered shows store one row per
    // original-episode offset (original_episode = first caller episode the
    // segment serves). Find the latest offset <= episode.
    const segRows = await sb(
      cfg,
      `anime_season_map?tmdb_id=eq.${tmdbId}&season=eq.1&original_episode=lte.${episode}&original_episode=gt.0&order=original_episode.desc&limit=1&select=*`
    );
    const seg = segRows?.[0];
    if (seg && (seg.anilist_id || seg.mal_id)) {
      const shift = episode - (seg.original_episode ?? 1);
      if (seg.anilist_episodes == null || shift < seg.anilist_episodes) {
        return json(res, 200, {
          found: true,
          tmdbId,
          season: 1,
          anilistId: seg.anilist_id ?? null,
          malId: seg.mal_id ?? null,
          title: seg.title ?? null,
          episodes: seg.anilist_episodes ?? null,
          requestedEpisode: (seg.requested_episode ?? 1) + shift,
          dubAvailable: typeof seg.dub_available === 'boolean' ? seg.dub_available : null
        });
      }
    }
    // Exact per-episode rows (client-resolved singles).
    const rows = await sb(
      cfg,
      `anime_season_map?tmdb_id=eq.${tmdbId}&season=eq.1&original_episode=eq.${episode}&select=*`
    );
    const exact = rows?.[0];
    if (exact && (exact.anilist_id || exact.mal_id)) {
      return json(res, 200, {
        found: true,
        tmdbId,
        season: 1,
        anilistId: exact.anilist_id ?? null,
        malId: exact.mal_id ?? null,
        title: exact.title ?? null,
        episodes: exact.anilist_episodes ?? null,
        requestedEpisode: exact.requested_episode ?? episode,
        dubAvailable: typeof exact.dub_available === 'boolean' ? exact.dub_available : null
      });
    }
  }

  const baseRows = await sb(cfg, `anime_map?tmdb_id=eq.${tmdbId}&select=*`);
  const base = baseRows?.[0];
  const baseUsable = Boolean(base && (base.anilist_id || base.mal_id));

  // ---------- Live resolve via Jikan (server can reach MAL; browsers and
  // datacenters alike). Runs on cache misses AND to refine ambiguous base
  // rows that cannot prove they cover the requested episode. ----------
  const needsLive =
    !baseUsable ||
    (episode != null && (base?.anilist_episodes == null || episode > (base.anilist_episodes || Infinity)));

  if (needsLive) {
    const failAt = jikanFailMemory.get(tmdbId);
    const apiKey = process.env.TMDB_API_KEY;
    if (!(failAt && Date.now() - failAt < JIKAN_FAIL_TTL) && apiKey) {
      try {
        const tvMeta = await getTmdbMeta(`tv/${tmdbId}`, apiKey);
        const movieMeta = tvMeta ? null : await getTmdbMeta(`movie/${tmdbId}`, apiKey);
        const meta = tvMeta || movieMeta;
        if (meta) {
          const hint = {
            title: meta.name || meta.title,
            originalTitle: meta.original_name || meta.original_title,
            year: Number((meta.first_air_date || meta.release_date || '').slice(0, 4)) || null,
            isMovie: !tvMeta
          };
          const best = await jikanMatch(hint);
          const { cursor, eff } = await jikanWalk(best, {
            season, episode, isMovie: hint.isMovie
          });
          const row = {
            tmdb_id: tmdbId,
            season,
            anilist_id: null,
            mal_id: cursor.malId,
            title: best.title_english || best.title || hint.title,
            anilist_episodes: cursor.episodes ?? null,
            original_episode: episode ?? null,
            requested_episode: eff ?? episode ?? null,
            resolved_at: new Date().toISOString()
          };
          await sb(cfg, 'anime_season_map?columns=tmdb_id,season,original_episode', {
            prefer: 'resolution=merge-duplicates',
            fetch: { method: 'POST', body: JSON.stringify(row) }
          });
          return json(res, 200, {
            found: true,
            tmdbId,
            season,
            anilistId: null,
            malId: row.mal_id,
            title: row.title,
            episodes: row.anilist_episodes,
            requestedEpisode: row.requested_episode,
            dubAvailable: null
          });
        }
      } catch {
        // Jikan down/mismatched — remember briefly, fall through to cache.
        jikanFailMemory.set(tmdbId, Date.now());
        if (jikanFailMemory.size > 500) jikanFailMemory.clear();
      }
    }
  }

  if (baseUsable) {
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

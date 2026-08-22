const SITE = 'https://alexandr1a.vercel.app';
const FALLBACK_IMAGE = `${SITE}/logo.png`;

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function supabaseEnv() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY;
    return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}

async function sbGet(cfg, path) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
            headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
            signal: controller.signal
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        const rows = await res.json().catch(() => []);
        return Array.isArray(rows) && rows[0] ? rows[0] : null;
    } catch {
        return null;
    }
}

function page(res, status, { title, desc, image, shareUrl, dest }) {
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(status).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)} — Alexandria</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:site_name" content="Alexandria">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(shareUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${esc(dest)}">
</head>
<body><a href="${esc(dest)}">Open in Alexandria</a></body>
</html>`);
}

async function titleCard(req, res, type, id) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(503).send('TMDB is not configured on this deployment.');
    }

    let data = null;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const target = `https://api.themoviedb.org/3/${type}/${id}?api_key=${encodeURIComponent(apiKey)}&language=en-US`;
        const resp = await fetch(target, { signal: controller.signal });
        clearTimeout(timer);
        if (resp.ok) data = await resp.json();
    } catch {
        data = null;
    }

    const baseTitle = data && (data.title || data.name);
    const year = data && (data.release_date || data.first_air_date || '').slice(0, 4);
    const title = baseTitle ? `${baseTitle}${year ? ` (${year})` : ''}` : (type === 'movie' ? 'Movie on Alexandria' : 'Show on Alexandria');
    const desc = (data && (data.overview || data.tagline)) || 'Watch movies, TV, and anime in the Alexandria archive.';
    const poster = data && data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : FALLBACK_IMAGE;
    return page(res, 200, {
        title,
        desc,
        image: poster,
        shareUrl: `${SITE}/share/${type}/${id}`,
        dest: `${SITE}/#details/${type}/${id}`
    });
}

async function profileCard(req, res, uid) {
    const cfg = supabaseEnv();
    let profile = null;
    if (cfg) {
        profile = await sbGet(
            cfg,
            `profiles?id=eq.${encodeURIComponent(uid)}&select=username,nickname,bio,fav_genres,avatar_id`
        );
    }
    if (!profile) return page(res, 200, {
        title: 'A member on Alexandria',
        desc: 'Watch movies, TV, and anime in the Alexandria archive.',
        image: FALLBACK_IMAGE,
        shareUrl: `${SITE}/share/profile/${uid}`,
        dest: `${SITE}/#profile/${uid}`
    });

    const name = profile.nickname || profile.username || 'Member';
    // Local avatar art (e.g. Tekken set) can be used directly; emoji avatars
    // have no image, so the brand mark stands in.
    const presetImg = `/avatars/${encodeURIComponent(String(profile.avatar_id || ''))}.jpg`;
    const knownLocalAvatar = ['tekken8'].includes(String(profile.avatar_id || ''));
    return page(res, 200, {
        title: `${name} on Alexandria`,
        desc: profile.bio || `${name}'s watchlists, reviews, and watch stats on Alexandria.`,
        image: knownLocalAvatar ? `${SITE}${presetImg}` : FALLBACK_IMAGE,
        shareUrl: `${SITE}/share/profile/${uid}`,
        dest: `${SITE}/#profile/${uid}`
    });
}

async function listCard(req, res, listId) {
    const cfg = supabaseEnv();
    let list = null;
    let firstItem = null;
    if (cfg) {
        list = await sbGet(cfg, `movie_night_lists?id=eq.${encodeURIComponent(listId)}&select=title,description`);
        firstItem = await sbGet(
            cfg,
            `movie_night_items?list_id=eq.${encodeURIComponent(listId)}&select=title,poster_path&order=created_at.asc&limit=1`
        );
    }
    if (!list) return page(res, 200, {
        title: 'A Movie Night list on Alexandria',
        desc: 'Watch movies, TV, and anime in the Alexandria archive.',
        image: FALLBACK_IMAGE,
        shareUrl: `${SITE}/share/list/${listId}`,
        dest: `${SITE}/#list/${listId}`
    });

    const countCfg = cfg;
    let count = '';
    if (countCfg) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8000);
            const res2 = await fetch(
                `${countCfg.url}/rest/v1/movie_night_items?list_id=eq.${encodeURIComponent(listId)}&select=id`,
                { headers: { apikey: countCfg.key, Authorization: `Bearer ${countCfg.key}`, Prefer: 'count=exact' }, signal: controller.signal }
            );
            clearTimeout(timer);
            const range = res2.headers.get('content-range');
            const total = range && range.split('/')[1];
            if (total && total !== '*') count = ` · ${total} title${total === '1' ? '' : 's'}`;
        } catch { /* cosmetic only */ }
    }

    const poster = firstItem?.poster_path
        ? `https://image.tmdb.org/t/p/w500${firstItem.poster_path}`
        : FALLBACK_IMAGE;
    return page(res, 200, {
        title: `${list.title || 'Movie Night list'}${count}`,
        desc: list.description || 'A shared Movie Night list on Alexandria — anyone can add titles.',
        image: poster,
        shareUrl: `${SITE}/share/list/${listId}`,
        dest: `${SITE}/#list/${listId}`
    });
}

export default async function handler(req, res) {
    const type = String(req.query.type || '');
    const id = String(req.query.id || '');

    if (type === 'movie' || type === 'tv') {
        if (!/^\d{1,10}$/.test(id)) return res.status(404).send('Not found');
        return titleCard(req, res, type, id);
    }
    if (type === 'profile') {
        if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return res.status(404).send('Not found');
        return profileCard(req, res, id);
    }
    if (type === 'list') {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
            return res.status(404).send('Not found');
        }
        return listCard(req, res, id.toLowerCase());
    }
    return res.status(404).send('Not found');
}

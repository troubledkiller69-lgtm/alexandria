const SITE = 'https://alexandr1a.vercel.app';
const FALLBACK_IMAGE = `${SITE}/logo.png`;

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export default async function handler(req, res) {
    const type = String(req.query.type || '');
    const id = String(req.query.id || '');
    if (!/^(movie|tv)$/.test(type) || !/^\d{1,10}$/.test(id)) {
        return res.status(404).send('Not found');
    }

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
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
    } catch (e) {
        data = null;
    }

    const baseTitle = data && (data.title || data.name);
    const year = data && (data.release_date || data.first_air_date || '').slice(0, 4);
    const title = baseTitle ? `${baseTitle}${year ? ` (${year})` : ''}` : (type === 'movie' ? 'Movie on Alexandria' : 'Show on Alexandria');
    const desc = (data && (data.overview || data.tagline)) || 'Watch movies, TV, and anime in the Alexandria archive.';
    const poster = data && data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : FALLBACK_IMAGE;
    const shareUrl = `${SITE}/share/${type}/${id}`;
    const dest = `${SITE}/#details/${type}/${id}`;

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)} — Alexandria</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:site_name" content="Alexandria">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(poster)}">
<meta property="og:url" content="${esc(shareUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(poster)}">
<meta http-equiv="refresh" content="0; url=${esc(dest)}">
</head>
<body><a href="${esc(dest)}">Open in Alexandria</a></body>
</html>`);
}

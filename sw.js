// Keep in step with the ?v= on js/app.js and index.css in index.html. Bump both together.
const APP_VERSION = '20261001d';
const SHELL_CACHE = `alexandria-shell-${APP_VERSION}`;
const IMG_CACHE = 'alexandria-img-v1';
const META_CACHE = 'alexandria-meta-v1';
const KEEP = new Set([SHELL_CACHE, IMG_CACHE, META_CACHE]);

const SHELL = [
    '/',
    `/index.css?v=${APP_VERSION}`,
    `/js/app.js?v=${APP_VERSION}`,
    '/js/vendor/supabase-js.js',
    '/logo.png',
    '/manifest.json'
];

const POSTER_CACHE_MAX = 60;

// Runs once per activation. If the deployed HTML names a different version, open pages are
// reloaded, but only once per deployed version, so a stale worker cannot cause a reload loop.
async function checkVersionAndReload() {
    try {
        const resp = await fetch('/', { cache: 'no-store' });
        const html = await resp.text();
        const match = html.match(/js\/app\.js\?v=([^"']+)/);
        if (!match || match[1] === APP_VERSION) return;
        const meta = await caches.open(META_CACHE);
        const done = await meta.match('reloaded-for');
        if (done && (await done.text()) === match[1]) return;
        await meta.put('reloaded-for', new Response(match[1]));
        await Promise.all((await caches.keys()).filter(k => k !== META_CACHE).map(k => caches.delete(k)));
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(c => c.navigate(c.url));
    } catch { /* ignore */ }
}

async function trimPosterCache(cache) {
    const keys = await cache.keys();
    if (keys.length <= POSTER_CACHE_MAX) return;
    const excess = keys.slice(0, keys.length - POSTER_CACHE_MAX);
    await Promise.all(excess.map(k => cache.delete(k)));
}

async function shellPage() {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then(cache => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => !KEEP.has(k)).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
            .then(() => checkVersionAndReload())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    // Poster art: stale-while-revalidate in its own cache, so trimming never touches the shell.
    if (url.hostname === 'image.tmdb.org' || url.hostname === 'images.unsplash.com') {
        event.respondWith(
            caches.open(IMG_CACHE).then(async cache => {
                const cached = await cache.match(request);
                const network = fetch(request)
                    .then(response => {
                        if (response && (response.ok || response.type === 'opaque')) {
                            cache.put(request, response.clone()).then(() => trimPosterCache(cache));
                        }
                        return response;
                    })
                    .catch(() => cached);
                return cached || network;
            })
        );
        return;
    }

    // Navigations: network-first, fall back to the cached shell offline.
    if (request.mode === 'navigate') {
        if (url.origin !== self.location.origin) return;
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Only the app shell, and only a plain 200. A redirected response cannot serve a navigation.
                    if (url.pathname === '/' && response.ok && response.type === 'basic' && !response.redirected) {
                        const copy = response.clone();
                        caches.open(SHELL_CACHE).then(cache => cache.put('/index.html', copy)).catch(() => {});
                    }
                    return response;
                })
                .catch(shellPage)
        );
        return;
    }

    // App assets: network-first with cache fallback so the app boots offline.
    if (url.pathname.startsWith('/js/')
        || url.pathname.endsWith('.css')
        || url.hostname === 'fonts.googleapis.com'
        || url.hostname === 'fonts.gstatic.com'
        || url.hostname === 'cdn.jsdelivr.net') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response && response.ok) {
                        const copy = response.clone();
                        caches.open(SHELL_CACHE).then(cache => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
    }
});

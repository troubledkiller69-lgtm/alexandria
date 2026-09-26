const CACHE = 'alexandria-shell-v1';
const APP_VERSION = '20260924e';

const SHELL = [
    '/',
    '/index.html',
    '/index.css',
    '/js/app.js',
    '/js/vendor/supabase-js.js',
    '/logo.png',
    '/manifest.json'
];

const POSTER_CACHE_MAX = 60;

async function checkVersionAndReload() {
    try {
        const resp = await fetch('/index.html', { cache: 'no-store' });
        const html = await resp.text();
        const match = html.match(/js\/app\.js\?v=([^"']+)/);
        if (match && match[1] !== APP_VERSION) {
            await caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
            self.clients.matchAll().then(clients => clients.forEach(c => c.navigate(c.url)));
        }
    } catch { /* ignore */ }
}

async function trimPosterCache(cache) {
    const keys = await cache.keys();
    if (keys.length <= POSTER_CACHE_MAX) return;
    const excess = keys.slice(0, keys.length - POSTER_CACHE_MAX);
    await Promise.all(excess.map(k => cache.delete(k)));
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
            .then(() => checkVersionAndReload())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    // Poster art: stale-while-revalidate. Never blocks the network.
    if (url.hostname === 'image.tmdb.org' || url.hostname === 'images.unsplash.com') {
        event.respondWith(
            caches.open(CACHE).then(async cache => {
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
        // Fire version check in background
        checkVersionAndReload();
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response && response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE).then(cache => cache.put('/index.html', copy));
                    }
                    return response;
                })
                .catch(() => caches.match('/index.html'))
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
                        caches.open(CACHE).then(cache => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
    }
});

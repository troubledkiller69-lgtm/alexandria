export const core = {
    state: {
        view: 'home', // home, movies, tv, anime, search, player
        searchTimeout: null,
        trendingData: null,
        activeContent: { id: null, type: 'movie', season: 1, episode: 1 },
        searchQuery: '',
        searchFilter: 'multi',
        activeServer: 0,
        activeGenreId: 35,
        watchlist: [],
        history: [],
        watchedEpisodes: {},
        watchlistFilter: 'all',
        watchlistSort: 'recent',
        partyRoomId: null,
        authUser: null,
        activeProfileId: null,
        profileTab: 'activity',
        profileData: null,
        profileGenreSelection: null,
        profileAvatarSelection: null,
        activeListId: null
    },

    servers: [
        {
            name: 'Alexandria',
            supportsApi: true,
            getMovie: id => `https://embedmaster.link/9gis39azyhxlvq5t/movie/${id}`,
            getTv: (id, s, e) => `https://embedmaster.link/9gis39azyhxlvq5t/tv/${id}/${s}/${e}`
        },
        {
            name: 'EmbedMaster Public',
            supportsApi: true,
            getMovie: id => `https://embedmaster.link/movie/${id}`,
            getTv: (id, s, e) => `https://embedmaster.link/tv/${id}/${s}/${e}`
        },
        {
            name: 'EmbedSU',
            supportsApi: false,
            getMovie: id => `https://www.embed.su/embed/movie/${id}`,
            getTv: (id, s, e) => `https://www.embed.su/embed/tv/${id}/${s}/${e}`
        },
        {
            name: 'VidLink',
            supportsApi: false,
            getMovie: id => `https://vidlink.pro/movie/${id}`,
            getTv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`
        },
        // Verified live Aug 2026 (probed with real TMDB ids). VidCore also
        // carries anime with its own audio-track menu — often has dubs that
        // MegaPlay lacks.
        {
            name: 'VidCore',
            supportsApi: false,
            getMovie: id => `https://vidcore.org/embed/movie/${id}`,
            getTv: (id, s, e) => `https://vidcore.org/embed/tv/${id}/${s}/${e}`
        },
        {
            name: 'VidFast',
            supportsApi: false,
            getMovie: id => `https://vidfast.vc/movie/${id}`,
            getTv: (id, s, e) => `https://vidfast.vc/tv/${id}/${s}/${e}`
        },
        {
            name: 'VidLux',
            supportsApi: false,
            getMovie: id => `https://vidlux.xyz/embed/movie/${id}`,
            getTv: (id, s, e) => `https://vidlux.xyz/embed/tv/${id}/${s}/${e}`
        },
        // Dedicated anime mirror. `animeSource` declares which ID the builder
        // consumes: 'anilist' needs /api/anime to resolve TMDB→AniList first.
        {
            name: 'MegaPlay Anime',
            animeOnly: true,
            supportsApi: false,
            // `ref` is precomposed by the resolver: 'ani/{anilistId}' or
            // 'mal/{malId}' depending on which database answered.
            getAnime: (ref, ep, dub) => `https://megaplay.buzz/stream/${ref}/${ep}/${dub ? 'dub' : 'sub'}`
        }
    ],



    supabase: null,
    _renderToken: 0,
    _apiCache: new Map(),
    _CACHE_TTL_MS: 10 * 60 * 1000,
    _EMBED_ORIGIN: 'https://embedmaster.link',
    _FAILOVER_MS: 15000,
    _FAILOVER_GRACE_MS: 12000,
    _failoverTimer: null,
    _serverHealthy: false,
    _triedServers: null,
    _failoverGraceUsed: false,
    _resumeSeekDone: false,
    _pendingResumeTime: 0,
    _resumeIgnoreUntil: 0,
    _lastProgressWrite: 0,
    _PROGRESS_WRITE_MS: 5000,
    _WATCH_LOG_DEDUPE_MS: 15 * 60 * 1000,
    _lastWatchLog: null,
    // Guests always land a beat behind (network + seek settle). Lead play timestamps so they match the host.
    _PARTY_SYNC_LEAD_SEC: 0.85,
    _currentSeasonEpisodes: [],
    commentsChannel: null,
    _commentsChannelKey: null,
    _migratedCommentKeys: new Set(),
    listChannel: null,
    _movieGenres: [
        ['', 'All Genres'], ['28', 'Action'], ['12', 'Adventure'], ['16', 'Animation'], ['35', 'Comedy'],
        ['80', 'Crime'], ['99', 'Documentary'], ['18', 'Drama'], ['10751', 'Family'], ['14', 'Fantasy'],
        ['36', 'History'], ['27', 'Horror'], ['10402', 'Music'], ['9648', 'Mystery'], ['10749', 'Romance'],
        ['878', 'Sci-Fi'], ['53', 'Thriller']
    ],
    _tvGenres: [
        ['', 'All Genres'], ['10759', 'Action & Adventure'], ['16', 'Animation'], ['35', 'Comedy'],
        ['80', 'Crime'], ['99', 'Documentary'], ['18', 'Drama'], ['10751', 'Family'], ['10762', 'Kids'],
        ['9648', 'Mystery'], ['10763', 'News'], ['10764', 'Reality'], ['10765', 'Sci-Fi & Fantasy'],
        ['10766', 'Soap'], ['10767', 'Talk'], ['10768', 'War & Politics']
    ],
    AVATAR_PRESETS: [
        { id: 'python', emoji: '🐍' },
        { id: 'dragon', emoji: '🐉' },
        { id: 'owl', emoji: '🦉' },
        { id: 'fox', emoji: '🦊' },
        { id: 'wolf', emoji: '🐺' },
        { id: 'raven', emoji: '🐦‍⬛' },
        { id: 'panda', emoji: '🐼' },
        { id: 'tiger', emoji: '🐯' },
        // Franchise cast avatars — real photos (TMDB profile images, CSP-safe).
        // `group` renders a section label in the picker (first of its group wins).
        { id: 'walker', img: '/aN29llVoCFtBTwDZFtqdD9d8dHb.jpg', group: 'THE WALKING DEAD' },
        { id: 'rick', img: '/gR4RzQTDsMfVv8oEh2VRbO8LkFz.jpg', group: 'THE WALKING DEAD' },
        { id: 'daryl', img: '/ozHPdO5jAt7ozzdZUgyRAMNPSDW.jpg', group: 'THE WALKING DEAD' },
        { id: 'michonne', img: '/z7H7QeQvr24vskGlANQhG43vozQ.jpg', group: 'THE WALKING DEAD' },
        { id: 'glenn', img: '/fOMFO2Xx4duzpNgS9Q5ytO44yGb.jpg', group: 'THE WALKING DEAD' },
        { id: 'maggie', img: '/8WPbj506873QzrKwUFbjjniLuvD.jpg', group: 'THE WALKING DEAD' },
        { id: 'carol', img: '/2omPfeMdnicJqqvgKAU2iqVyD4Z.jpg', group: 'THE WALKING DEAD' },
        { id: 'negan', img: '/m8bdrmh6ExDCGQ64E83mHg002YV.jpg', group: 'THE WALKING DEAD' },
        // Suits
        { id: 'harvey', img: '/lacMH4Ju1x9AsKXm7mDkklSsPyV.jpg', group: 'SUITS' },
        { id: 'mike', img: '/uJiuAHTsZAbfMi9bKRksWn4oHLf.jpg', group: 'SUITS' },
        { id: 'donna', img: '/Am3yPjKVbGWWn2Q1SB5wPz3yzgV.jpg', group: 'SUITS' },
        { id: 'louis', img: '/c9CKBkLtGtW1T8GRNUid0tQHaJY.jpg', group: 'SUITS' },
        { id: 'jessica', img: '/ukDNHgvEgdU95eaw6pngiAPucv4.jpg', group: 'SUITS' },
        // Lost
        { id: 'jack', img: '/6VIfueb4j3GCsIhxnstsXlY5C3Y.jpg', group: 'LOST' },
        { id: 'kate', img: '/zgztLIWTJZm3vjGU7ezhF8GXESJ.jpg', group: 'LOST' },
        { id: 'sawyer', img: '/biuhUJn5BDhXpfKvVW4dVUxvB44.jpg', group: 'LOST' },
        { id: 'hurley', img: '/hIt31bI76cvwijImRZke3WCoEI4.jpg', group: 'LOST' },
        { id: 'locke', img: '/kSweOGPprLe1vDvu38wJQaWIih7.jpg', group: 'LOST' },
        // Breaking Bad
        { id: 'walt', img: '/npIIZJGSrcJIJ6yHdmbqO6Jzo5I.jpg', group: 'BREAKING BAD' },
        { id: 'jesse', img: '/8Ac9uuoYwZoYVAIJfRLzzLsGGJn.jpg', group: 'BREAKING BAD' },
        { id: 'saul', img: '/rF0Lb6SBhGSTvjRffmlKRSeI3jE.jpg', group: 'BREAKING BAD' },
        { id: 'gus', img: '/rcXnr82TwDzU4ZGdBeNXfG0ZQnZ.jpg', group: 'BREAKING BAD' },
        { id: 'hank', img: '/mKRrEbsxAX3ro700HsViFArRM7l.jpg', group: 'BREAKING BAD' },
        // Reacher
        { id: 'reacher', img: '/92YNEEpCyugkTzPprJwZpvVtvuK.jpg', group: 'REACHER' },
        // Tekken 8 — locally hosted art (not a TMDB CDN path, so flag it local).
        { id: 'tekken8', img: '/avatars/tekken8.jpg', local: true, group: 'TEKKEN 8' }
    ],

    escapeHtml(value = '') {
        return String(value).replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[character]);
    },

    // #region agent log
    _dbg() { /* production: telemetry disabled */ },
    // #endregion

    isTrustedEmbedOrigin(origin) {
        try {
            const host = new URL(origin).hostname;
            const trusted = ['embedmaster.link', 'embdmstrplayer.com', 'embed.su', 'vidlink.pro', 'vidcore.org', 'vidfast.vc', 'vidlux.xyz', 'megaplay.buzz'];
            return trusted.some(d => host === d || host.endsWith('.' + d));
        } catch {
            return false;
        }
    },

    genreOptionsHtml() {
        const list = this.state.searchFilter === 'tv' ? this._tvGenres : this._movieGenres;
        return list.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    },

    imageUrl(path, size = 'w500') {
        if (typeof path === 'string' && /^https:\/\/image\.tmdb\.org\/t\/p\/[a-zA-Z0-9]+\/[a-zA-Z0-9._/-]+$/.test(path)) return path;
        return typeof path === 'string' && /^\/[a-zA-Z0-9._/-]+$/.test(path)
            ? `https://image.tmdb.org/t/p/${size}${path}`
            : '';
    },

    async getJson(endpoint, options = {}) {
        const { noCache, ...fetchOptions } = options;
        const useCache = !noCache;
        const now = Date.now();
        if (useCache && this._apiCache.has(endpoint)) {
            const hit = this._apiCache.get(endpoint);
            if (now - hit.at < this._CACHE_TTL_MS) return hit.data;
        }

        const response = await fetch(`/api/proxy?endpoint=${encodeURIComponent(endpoint)}`, fetchOptions);
        let data;
        try {
            data = await response.json();
        } catch {
            // #region agent log
            this._dbg('E', 'script.js:getJson', 'unreadable proxy response', {
                endpoint,
                status: response.status,
                contentType: response.headers.get('content-type')
            });
            // #endregion
            throw new Error('The archive returned an unreadable response.');
        }
        if (!response.ok) {
            // #region agent log
            this._dbg('E', 'script.js:getJson', 'proxy error', {
                endpoint,
                status: response.status,
                error: data?.error || null
            });
            // #endregion
        }
        if (!response.ok || data?.success === false || data?.error) {
            throw new Error(data?.status_message || data?.error || `Archive request failed (${response.status}).`);
        }
        if (useCache) this._apiCache.set(endpoint, { data, at: now });
        return data;
    },

    ratingsHtml(tmdbScore) {
        if (!tmdbScore) return '<span class="rating-score rating-score--muted">NR</span>';
        return `<span class="rating-score" title="TMDB rating"><span class="rating-score-label">TMDB</span> <span class="rating-score-value">${tmdbScore}</span></span>`;
    },

    async mapWithConcurrency(items, limit, mapper) {
        const results = new Array(items.length);
        let nextIndex = 0;
        const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (nextIndex < items.length) {
                const index = nextIndex++;
                results[index] = await mapper(items[index], index);
            }
        });
        await Promise.all(workers);
        return results;
    },

    writeLocalList(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn(`Alexandria: Could not save ${key}.`, error);
            this.showToast('This browser could not save your changes.');
        }
    },

    readStorage(storage, key, fallback = null) {
        try {
            const raw = storage.getItem(key);
            return raw == null ? fallback : raw;
        } catch {
            return fallback;
        }
    },

    readStorageJson(storage, key, fallback) {
        try {
            const raw = storage.getItem(key);
            if (raw == null || raw === '') return fallback;
            const parsed = JSON.parse(raw);
            return parsed == null ? fallback : parsed;
        } catch {
            return fallback;
        }
    },

    writeStorage(storage, key, value) {
        try {
            storage.setItem(key, value);
            return true;
        } catch {
            return false;
        }
    },

    eventElement(target) {
        if (target instanceof Element) return target;
        return target && target.parentElement instanceof Element ? target.parentElement : null;
    },

    async copyText(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch { /* Firefox / Safari without a user-gesture clipboard grant */ }
        try {
            const input = document.createElement('textarea');
            input.value = text;
            input.setAttribute('readonly', '');
            input.setAttribute('aria-hidden', 'true');
            input.style.cssText = 'position:fixed;left:-9999px;top:0';
            document.body.appendChild(input);
            input.focus();
            input.select();
            input.setSelectionRange(0, text.length);
            const ok = document.execCommand('copy');
            input.remove();
            return ok;
        } catch {
            return false;
        }
    },

    renderError(title, message, retryView = this.state.view) {
        const safeTitle = this.escapeHtml(title);
        const safeMessage = this.escapeHtml(message);
        this.main.innerHTML = `
            <section class="error-state" role="alert">
                <div class="error-mark" aria-hidden="true">A</div>
                <p class="eyebrow">ARCHIVE CONNECTION</p>
                <h1>${safeTitle}</h1>
                <p>${safeMessage}</p>
                <div class="error-actions">
                    <button class="btn-primary" type="button" data-retry-view="${this.escapeHtml(retryView)}">TRY AGAIN</button>
                    <a class="btn-secondary" href="#home">RETURN HOME</a>
                </div>
            </section>`;
    },

    bindSecurityGuard() {
        // Anti-tamper & inspect protection guard
        document.addEventListener('contextmenu', e => {
            // Firefox often targets the text node inside the field, not the input itself.
            const node = this.eventElement(e.target);
            if (node?.closest('input, textarea, select, [contenteditable="true"]')) return;
            e.preventDefault();
        });
        document.addEventListener('keydown', e => {
            if (
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
                (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
            ) {
                e.preventDefault();
            }
        });
    },

    playerIframeFlags() {
        // EmbedMaster (and most mirrors) refuse to play if the iframe has sandbox at all.
        return 'allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *" referrerpolicy="no-referrer-when-downgrade"';
    },

    isAllowedExternalLink(href) {
        try {
            const dest = new URL(String(href || ''), location.href);
            if (dest.origin === location.origin) return true;
            const host = dest.hostname;
            return host === 't.me'
                || host === 'telegram.me'
                || host.endsWith('.telegram.org')
                || host === 'discord.gg'
                || host === 'discord.com'
                || host.endsWith('.discord.com')
                || host.endsWith('.discord.gg');
        } catch {
            return false;
        }
    },

    bindPopupGuard() {
        const nativeOpen = window.open.bind(window);
        window.open = (...args) => {
            const url = args[0];
            if (url && this.isAllowedExternalLink(url)) return nativeOpen(...args);
            return null;
        };

        document.addEventListener('click', (e) => {
            const link = this.eventElement(e.target)?.closest?.('a[target="_blank"], a[href]');
            if (!link) return;
            const href = link.getAttribute('href') || '';
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
            const blank = link.getAttribute('target') === '_blank';
            if (blank && !this.isAllowedExternalLink(href)) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);
    },

    async init() {
        console.log("Alexandria Protocol: Initializing Handshake...");
        this.bindSecurityGuard();
        this.bindPopupGuard();
        if ('serviceWorker' in navigator && location.protocol === 'https:') {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        }
        // #region agent log
        this._dbg('E', 'script.js:init', 'app boot', { href: typeof location !== 'undefined' ? location.href : null });
        // #endregion
        this.main = document.getElementById('content');
        
        // Loading screen is cosmetic only — it cycles status text but never
        // gates boot; the app reveals as soon as real work finishes.
        this.runLoadingTheater();

        await this.syncFromCloud();

        try {
            // Aug 2026 mirror purge shifted server indexes; remap saved
            // selections so nobody boots onto a removed or anime-only slot.
            const REMAP = { 0: 0, 1: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7 };
            const savedRaw = Number.parseInt(localStorage.getItem('alexandria_activeServer'), 10);
            const savedServer = Number.isInteger(savedRaw) && savedRaw in REMAP ? REMAP[savedRaw] : -1;
            if (savedServer >= 0 && this.servers[savedServer]) {
                this.state.activeServer = savedServer;
            } else {
                this.state.activeServer = 0;
            }
            localStorage.setItem('alexandria_activeServer', String(this.state.activeServer));
        } catch { /* ignore */ }

        // Supabase is optional; used only for Watch Party Realtime.
        // Await alongside the loading screen so deep-linked #party/... never races ahead.
        const networkPromise = this.initNetwork().catch(e => {
            console.error("Alexandria Protocol: Background Init Failed -", e);
        });

        await networkPromise;
        this.revealApp();

        // Once a session, clear stale community noise (comments, follows, list
        // events) older than 24h. Watching/rating/review rows are kept — the
        // profile stats (watch hours, streaks, heatmap) are derived from them.
        this.pruneOldActivity();

        this.bindEvents();
        this.updateChangelogDot();
        window.addEventListener('hashchange', () => this.handleRouting());
        this.handleRouting();
        this.bindListTransferControls();
    },

    bindListTransferControls() {
        document.getElementById('export-lists-btn')?.addEventListener('click', () => this.exportLists());
        const fileInput = document.getElementById('import-lists-file');
        document.getElementById('import-lists-btn')?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (event) => this.importLists(event));
        document.getElementById('import-anilist-btn')?.addEventListener('click', () => this.importAniListFlow());
    },

    exportLists() {
        const payload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            watchlist: this.state.watchlist,
            history: this.state.history
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `alexandria-lists-${Date.now()}.json`;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.showToast('Lists exported.');
    },

    async importLists(event) {
        const file = event.target?.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (/\.csv$/i.test(file.name)) {
            try {
                await this.importLetterboxd(file);
            } catch (error) {
                this.showToast(error.message || 'Could not import that Letterboxd file.');
            }
            return;
        }
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!Array.isArray(data.watchlist) || !Array.isArray(data.history)) {
                throw new Error('Invalid list file.');
            }
            const cleanWatchlist = data.watchlist
                .filter(i => i && i.id != null && i.type && (i.type === 'movie' || i.type === 'tv'))
                .map(i => {
                    const id = Number.parseInt(i.id, 10);
                    if (!Number.isInteger(id) || id < 1) return null;
                    return {
                        id,
                        type: i.type,
                        title: String(i.title || 'Untitled').slice(0, 200),
                        poster_path: typeof i.poster_path === 'string' ? i.poster_path : ''
                    };
                })
                .filter(Boolean);
            const cleanHistory = data.history
                .filter(i => i && i.id != null && i.type && (i.type === 'movie' || i.type === 'tv'))
                .map(i => {
                    const id = Number.parseInt(i.id, 10);
                    if (!Number.isInteger(id) || id < 1) return null;
                    return {
                        id,
                        type: i.type,
                        title: String(i.title || 'Untitled').slice(0, 200),
                        poster_path: typeof i.poster_path === 'string' ? i.poster_path : '',
                        season: Math.max(1, Number.parseInt(i.season, 10) || 1),
                        episode: Math.max(1, Number.parseInt(i.episode, 10) || 1),
                        isAnime: !!i.isAnime,
                        progress: typeof i.progress === 'number' && Number.isFinite(i.progress) ? Math.max(0, i.progress) : 0
                    };
                })
                .filter(Boolean);
            this.state.watchlist = cleanWatchlist;
            this.state.history = cleanHistory;
            this.writeLocalList('alexandria_watchlist', this.state.watchlist);
            this.writeLocalList('alexandria_history', this.state.history);
            this.showToast('Lists imported.');
            if (this.state.view === 'home') {
                this.renderWatchlist();
                this.renderHistory();
            } else {
                this.setView('home');
            }
        } catch (error) {
            this.showToast(error.message || 'Could not import lists.');
        }
    },

    parseCsv(text) {
        const rows = [];
        let row = [], field = '', inQuotes = false;
        const chars = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('');
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (chars[i + 1] === '"') { field += '"'; i++; }
                    else inQuotes = false;
                } else field += ch;
            } else if (ch === '"') inQuotes = true;
            else if (ch === ',') { row.push(field); field = ''; }
            else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else field += ch;
        }
        if (field !== '' || row.length) { row.push(field); rows.push(row); }
        return rows;
    },

    async importLetterboxd(file) {
        const rows = this.parseCsv(await file.text());
        if (rows.length < 2) throw new Error('CSV is empty or unreadable.');
        const header = rows[0].map(h => h.trim().toLowerCase());
        const col = name => header.indexOf(name);
        const nameCol = col('name');
        if (nameCol === -1) throw new Error('Not a Letterboxd export — missing the Name column.');
        const yearCol = col('year');
        const ratingCol = col('rating');
        const reviewCol = col('review');
        const isWatchedFile = col('watcheddate') !== -1;
        const isWatchlistFile = !isWatchedFile && col('date') !== -1 && ratingCol === -1;

        const entries = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            const name = (r[nameCol] || '').trim();
            if (!name) continue;
            const rating = ratingCol !== -1 ? parseFloat(r[ratingCol]) : 0;
            entries.push({
                name,
                year: (r[yearCol] || '').trim().slice(0, 4),
                rating: Number.isFinite(rating) ? rating : 0,
                review: (reviewCol !== -1 ? (r[reviewCol] || '') : '').trim(),
                watched: isWatchedFile
            });
        }
        if (!entries.length) throw new Error('No rows found in that file.');

        this.openImportProgress();
        const total = entries.length;
        const seen = new Set();
        const matched = [];
        const notFound = [];
        await this.mapWithConcurrency(entries, 4, async (entry, idx) => {
            this.setImportProgress(idx + 1, total);
            try {
                const m = await this.matchTmdb(entry.name, entry.year);
                if (!m || seen.has(m.type + '_' + m.id)) {
                    if (!m) notFound.push(`${entry.name}${entry.year ? ' (' + entry.year + ')' : ''}`);
                    return;
                }
                seen.add(m.type + '_' + m.id);
                matched.push({ ...m, rating: entry.rating, review: entry.review, watched: entry.watched });
            } catch {
                notFound.push(`${entry.name}${entry.year ? ' (' + entry.year + ')' : ''}`);
            }
        });
        this.closeImportProgress();

        const now = new Date().toISOString();
        matched.forEach(m => {
            const exists = this.state.watchlist.find(i => String(i.id) === String(m.id) && i.type === m.type);
            if (exists) {
                if (m.watched) {
                    exists.status = 'watched';
                    exists.watched_at = now;
                }
            } else {
                this.state.watchlist.push({
                    id: m.id,
                    type: m.type,
                    title: m.title,
                    poster_path: m.poster_path,
                    status: m.watched ? 'watched' : 'want',
                    watched_at: m.watched ? now : null
                });
            }
        });
        this.writeLocalList('alexandria_watchlist', this.state.watchlist);

        let cloudCount = 0;
        if (this.supabase && this.state.authUser) {
            const uid = this.state.authUser.id;
            const rowsToUpsert = matched.map(m => ({
                user_id: uid,
                tmdb_id: String(m.id),
                media_type: m.type,
                title: m.title,
                poster_path: m.poster_path,
                status: m.watched ? 'watched' : 'want',
                watched_at: m.watched ? now : null
            }));
            // Batched upserts — one round trip per slice instead of per row.
            for (let i = 0; i < rowsToUpsert.length; i += 50) {
                const slice = rowsToUpsert.slice(i, i + 50);
                try {
                    const { error } = await this.supabase.from('survival_cache')
                        .upsert(slice, { onConflict: 'user_id,tmdb_id,media_type' });
                    if (!error) cloudCount += slice.length;
                } catch { /* keep going */ }
            }
            for (const m of matched) {
                if (!m.rating) continue;
                try {
                    const { error } = await this.supabase.from('ratings').upsert({
                        user_id: uid,
                        content_id: Number(m.id),
                        content_type: m.type,
                        rating: Math.max(1, Math.min(5, Math.round(m.rating))),
                        review: m.review || '',
                        spoiler: false
                    }, { onConflict: 'user_id,content_id,content_type' });
                } catch { /* keep going */ }
            }
        }

        this.showImportResultModal(matched.length, notFound);
        this.showToast(matched.length ? `Letterboxd: ${matched.length} title${matched.length === 1 ? '' : 's'} imported.` : 'Letterboxd: nothing matched.');
        if (this.state.view === 'watchlist' || this.state.view === 'home') {
            this.renderWatchlist();
        }
        if (isWatchlistFile && this.state.view !== 'watchlist') {
            this.setView('watchlist');
        }
    },

    // ---- AniList import: pull a public AniList anime list into Alexandria ----

    async importAniListFlow() {
        if (!this.supabase || !this.state.authUser) {
            this.toggleAuthModal(true, 'login');
            this.showToast('Sign in to import your AniList.');
            return;
        }
        let modal = document.getElementById('anilist-import-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'anilist-import-modal';
            modal.className = 'profile-modal-overlay';
            modal.innerHTML = `
                <div class="profile-modal-card">
                    <button class="auth-close-btn" type="button" aria-label="Close" onclick="document.getElementById('anilist-import-modal').setAttribute('hidden','')">✕</button>
                    <h3 class="profile-modal-title">IMPORT FROM ANILIST</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 1rem;">Pulls your anime list — watching, planning, completed — plus your scores.</p>
                    <div class="auth-field">
                        <input type="text" id="anilist-username" placeholder="Your AniList username" maxlength="40" autocomplete="off">
                    </div>
                    <div class="profile-modal-actions">
                        <button type="button" class="btn-secondary" onclick="document.getElementById('anilist-import-modal').setAttribute('hidden','')">CANCEL</button>
                        <button type="button" class="btn-primary" onclick="Alexandria.runAniListImport()">IMPORT</button>
                    </div>
                </div>`;
            modal.addEventListener('click', e => { if (e.target === modal) modal.setAttribute('hidden', ''); });
            document.body.appendChild(modal);
        }
        modal.removeAttribute('hidden');
        setTimeout(() => document.getElementById('anilist-username')?.focus(), 50);
    },

    async fetchAniListList(username) {
        const query = `
          query ($name: String) {
            MediaListCollection(userName: $name, type: ANIME) {
              lists {
                entries {
                  status
                  score(format: POINT_100)
                  media { id idMal format startDate { year } title { english romaji } }
                }
              }
            }
          }`;
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query, variables: { name: username } })
        });
        const body = await res.json().catch(() => null);
        if (body?.errors?.length) throw new Error(body.errors[0].message || 'AniList rejected that username.');
        return body?.data?.MediaListCollection?.lists || [];
    },

    async runAniListImport() {
        const input = document.getElementById('anilist-username');
        const username = (input?.value || '').trim();
        if (!username) { this.showToast('Enter your AniList username.'); return; }
        document.getElementById('anilist-import-modal')?.setAttribute('hidden', '');

        let lists;
        try {
            lists = await this.fetchAniListList(username);
        } catch (e) {
            this.showToast(e.message || 'Could not reach AniList.');
            return;
        }

        // Flatten + dedupe per AniList id (titles can repeat across custom lists).
        const STATUS_MAP = {
            CURRENT: 'watching', REPEATING: 'watching',
            PLANNING: 'want', PAUSED: 'want', DROPPED: 'want',
            COMPLETED: 'watched'
        };
        const seen = new Map();
        for (const list of lists) {
            for (const entry of list.entries || []) {
                const m = entry.media;
                if (!m?.id || !m.title) continue;
                if (seen.has(m.id)) continue;
                seen.set(m.id, {
                    anilistId: m.id,
                    status: STATUS_MAP[entry.status] || 'want',
                    score: Math.max(0, Number(entry.score) || 0),
                    title: m.title.english || m.title.romaji || 'Untitled',
                    year: m.startDate?.year ? String(m.startDate.year) : '',
                    isMovie: m.format === 'MOVIE'
                });
            }
        }
        const entries = [...seen.values()];
        if (!entries.length) { this.showToast('That AniList has no anime entries.'); return; }

        this.openImportProgress();
        const total = entries.length;
        let done = 0;
        const matched = [];
        const notFound = [];
        await this.mapWithConcurrency(entries, 3, async (entry) => {
            try {
                // Match straight against TMDB from the browser (proxy route);
                // the old server-side AniList reverse lookup is retired.
                const m = await this.matchTmdb(entry.title, entry.year);
                if (!m) throw new Error('miss');
                matched.push({
                    id: Number(m.id),
                    type: m.type,
                    title: m.title || entry.title,
                    poster_path: m.poster_path || '',
                    status: entry.status,
                    score: entry.score
                });
                fetch('/api/anime', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tmdbId: Number(m.id), season: 1, anilistId: entry.anilistId })
                }).catch(() => {});
            } catch {
                notFound.push(entry.title);
            }
            done += 1;
            this.setImportProgress(done, total);
        });
        this.closeImportProgress();

        await this.persistAniListMatches(matched);
        this.showImportResultModal(matched.length, notFound);
        this.showToast(matched.length
            ? `AniList: ${matched.length} title${matched.length === 1 ? '' : 's'} imported.`
            : 'AniList: nothing matched.');
        if (this.state.view === 'watchlist' || this.state.view === 'home') this.renderWatchlist();
    },

    async persistAniListMatches(matched) {
        if (!matched.length) return;
        const uid = this.state.authUser?.id;
        const now = new Date().toISOString();

        for (const m of matched) {
            const exists = this.state.watchlist.find(i => String(i.id) === String(m.id) && i.type === m.type);
            if (exists) {
                exists.status = m.status;
                if (m.status === 'watched') exists.watched_at = now;
            } else {
                this.state.watchlist.push({
                    id: m.id,
                    type: m.type,
                    title: m.title,
                    poster_path: m.poster_path,
                    status: m.status,
                    watched_at: m.status === 'watched' ? now : null
                });
            }
        }
        this.writeLocalList('alexandria_watchlist', this.state.watchlist);

        if (!this.supabase || !uid) return;

        const rowsToUpsert = matched.map(m => ({
            user_id: uid,
            tmdb_id: String(m.id),
            media_type: m.type,
            title: m.title,
            poster_path: m.poster_path || null,
            status: m.status,
            watched_at: m.status === 'watched' ? now : null
        }));
        for (let i = 0; i < rowsToUpsert.length; i += 50) {
            try {
                await this.supabase.from('survival_cache')
                    .upsert(rowsToUpsert.slice(i, i + 50), { onConflict: 'user_id,tmdb_id,media_type' });
            } catch { /* keep going */ }
        }

        for (const m of matched) {
            if (!m.score || m.score < 1) continue;
            try {
                await this.supabase.from('ratings').upsert({
                    user_id: uid,
                    content_id: m.id,
                    content_type: m.type,
                    rating: Math.max(1, Math.min(5, Math.round(m.score / 20))),
                    review: '',
                    spoiler: false
                }, { onConflict: 'user_id,content_id,content_type' });
            } catch { /* keep going */ }
        }
    },

    async matchTmdb(title, year) {
        const q = encodeURIComponent(title);
        const data = await this.getJson(`search/multi?query=${q}`, { noCache: true });
        const results = (data.results || []).filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path);
        if (!results.length) return null;
        const y = year ? Number(year) : 0;
        const exact = y ? results.find(r => Number((r.release_date || r.first_air_date || '').slice(0, 4)) === y) : null;
        const pick = exact || results[0];
        return {
            id: pick.id,
            type: pick.media_type === 'tv' ? 'tv' : 'movie',
            title: pick.title || pick.name,
            poster_path: pick.poster_path || ''
        };
    },

    openImportProgress() {
        let modal = document.getElementById('import-progress-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'import-progress-modal';
            modal.className = 'profile-modal-overlay';
            modal.innerHTML = `
                <div class="profile-modal-card import-progress-card">
                    <h3 class="profile-modal-title">IMPORTING</h3>
                    <p class="import-progress-text" id="import-progress-text">Matching titles against TMDB…</p>
                    <div class="import-progress-bar"><span id="import-progress-fill"></span></div>
                </div>`;
            document.body.appendChild(modal);
        }
        modal.removeAttribute('hidden');
        this.setImportProgress(0, 1);
    },

    setImportProgress(done, total) {
        const text = document.getElementById('import-progress-text');
        const fill = document.getElementById('import-progress-fill');
        if (text) text.textContent = `Matching titles against TMDB… ${done}/${total}`;
        if (fill) fill.style.width = `${Math.max(3, Math.round(done / Math.max(total, 1) * 100))}%`;
    },

    closeImportProgress() {
        const modal = document.getElementById('import-progress-modal');
        if (modal) modal.setAttribute('hidden', '');
    },

    showImportResultModal(imported, notFound) {
        this.closeImportProgress();
        let modal = document.getElementById('import-result-modal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'import-result-modal';
        modal.className = 'profile-modal-overlay';
        modal.innerHTML = `
            <div class="profile-modal-card">
                <button class="auth-close-btn" type="button" aria-label="Close" onclick="document.getElementById('import-result-modal').remove()">✕</button>
                <h3 class="profile-modal-title">IMPORT COMPLETE</h3>
                <p style="color: var(--text-secondary); margin-bottom: 1rem;">${this.escapeHtml(String(imported))} title${imported === 1 ? '' : 's'} added to your watchlist.</p>
                ${notFound.length ? `
                    <p class="import-notfound-label">COULDN'T MATCH (${notFound.length})</p>
                    <div class="import-notfound-list">${notFound.map(n => `<div>${this.escapeHtml(n)}</div>`).join('')}</div>
                ` : ''}
                <div class="profile-modal-actions">
                    <button type="button" class="btn-primary" onclick="document.getElementById('import-result-modal').remove()">DONE</button>
                </div>
            </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    },

    shareUrlFor(kind, id) {
        return `${location.origin}/share/${kind}/${encodeURIComponent(String(id))}`;
    },

    // Canonical link for whatever the user is looking at right now.
    buildShareUrl() {
        const { id, type } = this.state.activeContent || {};
        if (id != null && (type === 'movie' || type === 'tv')) return this.shareUrlFor(type, id);
        if (this.state.view === 'profile' && this.state.activeProfileId) {
            return this.shareUrlFor('profile', this.state.activeProfileId);
        }
        if (this.state.view === 'list' && this.state.activeListId) {
            return this.shareUrlFor('list', this.state.activeListId);
        }
        return location.origin + '/';
    },

    async shareCurrent(title = 'Alexandria') {
        const url = this.buildShareUrl();
        const isTouch = window.matchMedia('(pointer: coarse)').matches;
        // Desktop: clipboard-first — instant and deterministic.
        if (!isTouch) {
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(url);
                    this.showToast('Link copied.');
                    return;
                }
            } catch { /* fall through */ }
            if (await this.copyText(url)) { this.showToast('Link copied.'); return; }
        }
        // Touch devices get the native sheet first; everything else falls back.
        try {
            if (navigator.share) {
                await navigator.share({ title, url });
                return;
            }
        } catch { /* user closed the sheet */ }
        if (await this.copyText(url)) this.showToast('Link copied.');
        else this.showToast('Could not copy the link.');
    },

    // ---- Anime: TMDB→AniList resolution + dub/sub preference ----

    readAudioPref() {
        try {
            const raw = localStorage.getItem('alexandria_audio_pref');
            if (raw === 'dub' || raw === 'sub') return raw;
        } catch { /* ignore */ }
        return 'sub';
    },

    writeAudioPref(pref) {
        try { localStorage.setItem('alexandria_audio_pref', pref); } catch { /* ignore */ }
    },

    // ---- MAL fallback via Jikan (independent of AniList entirely) ----

    async jikanGet(path, attempt = 0) {
        let res;
        try {
            res = await fetch('https://api.jikan.moe/v4' + path);
        } catch (e) {
            if (attempt < 1) { await new Promise(r => setTimeout(r, 1100)); return this.jikanGet(path, attempt + 1); }
            throw new Error('Jikan unreachable.');
        }
        // Jikan is a free community mirror — 429s and 5xx are routine.
        if ((res.status === 429 || res.status >= 500) && attempt < 1) {
            await new Promise(r => setTimeout(r, 1100));
            return this.jikanGet(path, attempt + 1);
        }
        if (!res.ok) throw new Error(`Jikan request failed (${res.status})`);
        const body = await res.json().catch(() => null);
        if (!body?.data) throw new Error('Unreadable Jikan response.');
        return body.data;
    },

    jikanScore(entry, hint) {
        let score = 0;
        const mYear = entry.year || (entry.aired?.from ? Number(String(entry.aired.from).slice(0, 4)) : null);
        if (hint.year && mYear) {
            const delta = Math.abs(mYear - hint.year);
            if (delta === 0) score += 4;
            else if (delta === 1) score += 2;
            else score -= 2;
        }
        const titles = [entry.title, entry.title_english, entry.title_japanese]
            .filter(Boolean).map(t => t.toLowerCase());
        const want = [hint.title, hint.originalTitle].filter(Boolean).map(t => t.toLowerCase());
        if (want.some(w => titles.includes(w))) score += 3;
        if ((hint.isMovie === true) === (entry.type === 'Movie')) score += 1;
        return score;
    },

    async jikanResolve(hint) {
        const q = encodeURIComponent(hint.title);
        const results = await this.jikanGet(`/anime?q=${q}&limit=6&sfw=true`);
        let best = null;
        let bestScore = 0;
        for (const e of results || []) {
            if (!e?.mal_id) continue;
            const s = this.jikanScore(e, hint);
            if (s > bestScore) { bestScore = s; best = e; }
        }
        if (bestScore < 5 || !best) throw new Error('No confident MAL match for this title.');

        const target = { malId: best.mal_id, episodes: best.episodes ?? null, title: best.title_english || best.title };
        return {
            found: true,
            anilistId: null,
            malId: target.malId,
            title: target.title,
            episodes: target.episodes,
            dubAvailable: null,
            __source: 'jikan'
        };
    },
    // Vercel/datacenter IPs get 403-blocked by AniList, so all GraphQL traffic
    // originates from the user (residential IP, CORS-open endpoint) exactly
    // like miruro does. /api/anime is only a shared Supabase-backed cache.

    ANI_GQL: 'https://graphql.anilist.co',

    async aniQuery(query, variables, attempt = 0) {
        const res = await fetch(this.ANI_GQL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        const body = await res.json().catch(() => null);
        // Rate limited? Their docs promise Retry-After seconds on a 429.
        // Wait for it only when it's short — long timeouts fail fast so the
        // VidCore fallback can take over instead of stalling the player.
        if (res.status === 429 && attempt < 1) {
            const wait = Math.min(Number(res.headers.get('retry-after')) || 3, 8);
            await new Promise(r => setTimeout(r, wait * 1000));
            return this.aniQuery(query, variables, attempt + 1);
        }
        if ((!res.ok || body?.errors) && (res.status === 429 || res.status >= 500) && attempt < 1) {
            await new Promise(r => setTimeout(r, 900));
            return this.aniQuery(query, variables, attempt + 1);
        }
        if (!res.ok || body?.errors?.length || !body?.data) {
            throw new Error(body?.errors?.[0]?.message || `AniList request failed (${res.status})`);
        }
        return body.data;
    },

    pickAniListMatch(candidates, hint) {
        let best = null;
        let bestScore = 0;
        for (const m of candidates) {
            if (!m?.id) continue;
            let score = 0;
            if (m.countryOfOrigin === 'JP') score += 3;
            const mYear = m.startDate?.year;
            if (hint.year && mYear) {
                const delta = Math.abs(mYear - hint.year);
                if (delta === 0) score += 4;
                else if (delta === 1) score += 2;
                else score -= 2;
            }
            const titles = [m.title?.english, m.title?.romaji, m.title?.native]
                .filter(Boolean).map(t => t.toLowerCase());
            const want = [hint.title, hint.originalTitle].filter(Boolean).map(t => t.toLowerCase());
            if (want.some(w => titles.includes(w))) score += 3;
            if ((hint.isMovie === true) === (m.format === 'MOVIE')) score += 1;
            if (score > bestScore) { bestScore = score; best = m; }
        }
        return bestScore >= 5 ? best : null;
    },

    async aniSequelChain(anilistId, maxHops = 12) {
        const gql = `
          query ($id: Int) {
            Media(id: $id, type: ANIME) {
              id
              relations { edges { relationType node { id idMal format episodes countryOfOrigin startDate { year } title { english romaji } } } }
            }
          }`;
        const chain = [];
        let currentId = anilistId;
        const visited = new Set([anilistId]);
        for (let hop = 0; hop < maxHops; hop++) {
            if (hop > 0) await new Promise(r => setTimeout(r, 320));
            const data = await this.aniQuery(gql, { id: currentId });
            const edges = data?.Media?.relations?.edges || [];
            const edge = edges.find(e => e?.relationType === 'SEQUEL' && e.node?.id && !visited.has(e.node.id));
            if (!edge) break;
            chain.push(edge.node);
            visited.add(edge.node.id);
            currentId = edge.node.id;
        }
        return chain;
    },

    readAnimeCache(key) {
        try {
            const store = this.readStorageJson(localStorage, 'alexandria_anime_cache', {}) || {};
            const hit = store[key];
            if (!hit) return null;
            if (Date.now() - hit.at > 7 * 24 * 60 * 60 * 1000) { delete store[key]; return null; }
            return hit.data;
        } catch { return null; }
    },

    writeAnimeCache(key, data) {
        try {
            const store = this.readStorageJson(localStorage, 'alexandria_anime_cache', {}) || {};
            store[key] = { data, at: Date.now() };
            const keys = Object.keys(store);
            if (keys.length > 300) delete store[keys[0]];
            this.writeStorage(localStorage, 'alexandria_anime_cache', JSON.stringify(store));
        } catch { /* ignore */ }
    },

    async resolveAnime(tmdbId, season = 1, episode = null, hint = null) {
        season = season || 1;
        const key = `${tmdbId}_s${season}_e${episode || 0}`;
        this._animeResolveCache = this._animeResolveCache || {};
        if (this._animeResolveCache[key]) return this._animeResolveCache[key];
        const local = this.readAnimeCache(key);
        if (local) { this._animeResolveCache[key] = local; return local; }

        // Shared cross-user cache first (Supabase-backed, unaffected by blocks).
        try {
            const params = new URLSearchParams({ tmdb: String(tmdbId) });
            if (season > 1) params.set('season', String(season));
            if (episode && episode > 1) params.set('episode', String(episode));
            const res = await fetch('/api/anime?' + params.toString());
            if (res.ok) {
                const cached = await res.json();
                // Only trust a shared-cache answer when it unambiguously covers
                // THIS episode — absolute-numbered shows map different episodes
                // of one "season" onto different AniList entries, so a bare
                // base-row hit must not short-circuit the sequel walk.
                const trusted = cached?.found && (cached.anilistId || cached.malId) && (
                    season > 1 ||
                    episode == null ||
                    (Number.isInteger(cached.requestedEpisode) && cached.requestedEpisode === episode) ||
                    (Number.isInteger(cached.episodes) && cached.episodes > 0 && episode <= cached.episodes)
                );
                if (trusted) {
                    this._animeResolveCache[key] = cached;
                    this.writeAnimeCache(key, cached);
                    return cached;
                }
            }
        } catch { /* cache miss is normal */ }

        if (!hint?.title) {
            const err = new Error('Metadata not ready for anime lookup.');
            err.soft = true;
            throw err;
        }

        const MEDIA_FIELDS = 'id idMal format episodes countryOfOrigin startDate { year } title { romaji english native }';
        const searchGql = `
          query ($search: String) {
            Page(perPage: 10) { media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} } }
          }`;
        // AniList flaps during stability incidents — a degraded window can
        // return 200-with-empty-results. Give the search a second chance.
        const searchOnce = async () => {
            const page = await this.aniQuery(searchGql, { search: hint.title });
            return this.pickAniListMatch(page?.media || [], hint);
        };
        let target = null;
        let aniError = null;
        try {
            target = await searchOnce();
            if (!target) {
                await new Promise(r => setTimeout(r, 1200));
                target = await searchOnce();
            }
        } catch (e) {
            aniError = e;
        }

        // AniList down/throttled/mismatched? Try the entirely separate
        // MyAnimeList ecosystem via Jikan before giving up.
        if (!target) {
            try {
                const malBase = await this.jikanResolve(hint);
                let cursor = { malId: malBase.malId, episodes: malBase.episodes };
                let eff = episode;
                if (!hint.isMovie && season > 1) {
                    for (let hop = 1; hop < season && cursor.malId; hop++) {
                        await new Promise(r => setTimeout(r, 420));
                        const rel = await this.jikanGet(`/anime/${cursor.malId}/relations`);
                        const seq = (rel || []).find(r => r.relation === 'Sequel')?.entry?.find(x => x.type === 'anime');
                        if (!seq?.mal_id) throw new Error(`Could not map season ${season} on MAL.`);
                        await new Promise(r => setTimeout(r, 420));
                        const full = await this.jikanGet(`/anime/${seq.mal_id}`);
                        cursor = { malId: seq.mal_id, episodes: full?.episodes ?? null };
                    }
                    eff = episode;
                } else if (!hint.isMovie && episode && Number.isInteger(cursor.episodes) && cursor.episodes > 0 && episode > cursor.episodes) {
                    eff = episode;
                    while (eff > (cursor.episodes || Infinity)) {
                        await new Promise(r => setTimeout(r, 420));
                        const rel = await this.jikanGet(`/anime/${cursor.malId}/relations`);
                        const seq = (rel || []).find(r => r.relation === 'Sequel')?.entry?.find(x => x.type === 'anime');
                        if (!seq?.mal_id || !cursor.episodes) break;
                        eff -= cursor.episodes;
                        await new Promise(r => setTimeout(r, 420));
                        const full = await this.jikanGet(`/anime/${seq.mal_id}`);
                        cursor = { malId: seq.mal_id, episodes: full?.episodes ?? null };
                    }
                }
                return {
                    found: true,
                    anilistId: null,
                    malId: cursor.malId,
                    title: malBase.title,
                    episodes: cursor.episodes ?? null,
                    requestedEpisode: eff,
                    dubAvailable: null
                };
            } catch (malErr) {
                // Surface whichever story is most useful.
                if (aniError) throw aniError;
                throw malErr;
            }
        }

        let effectiveEpisode = episode;

        if (!hint.isMovie && season > 1) {
            const chain = await this.aniSequelChain(target.id, Math.min(season - 1, 12));
            const node = chain[season - 2];
            if (!node) throw new Error(`Could not map season ${season} on AniList.`);
            target = node;
        }

        if (
            !hint.isMovie && season <= 1 && episode &&
            Number.isInteger(target.episodes) && target.episodes > 0 &&
            episode > target.episodes
        ) {
            const chain = await this.aniSequelChain(target.id, 12);
            let cursor = { ...target };
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

        const result = {
            found: true,
            tmdbId,
            season,
            anilistId: target.id,
            malId: target.idMal ?? null,
            title: target.title?.english || target.title?.romaji || hint.title,
            episodes: target.episodes ?? null,
            requestedEpisode: effectiveEpisode,
            dubAvailable: null
        };
        this._animeResolveCache[key] = result;
        this.writeAnimeCache(key, result);

        // Persist for every other visitor — fire-and-forget, never blocks.
        fetch('/api/anime', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tmdbId, season, anilistId: target.id, malId: result.malId,
                title: result.title, episodes: result.episodes,
                requestedEpisode: effectiveEpisode
            })
        }).catch(() => {});

        return result;
    },

    async initNetwork() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const configRes = await fetch('/api/config', { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!configRes.ok) throw new Error(`Configuration unavailable (${configRes.status})`);
            const config = await configRes.json();

            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                console.info("Alexandria Protocol: Watch Party cloud is not configured; using local mode.");
                this.updateSyncIndicator('GUEST');
                return;
            }

            if (!window.supabase?.createClient) throw new Error('Realtime client failed to load.');
            this.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
            this.updateSyncIndicator('GUEST');
            await this.bindAuthListeners();
        } catch (e) {
            console.error("Alexandria Protocol: Handshake Failure -", e);
            this.updateSyncIndicator('OFFLINE');
        }
    },

    updateSyncIndicator(status) {
        const dot = document.querySelector('.status-dot');
        const text = document.querySelector('.status-text');
        if (!dot || !text) return;

        if (status === 'OFFLINE') {
            dot.style.background = '#ef4444';
            dot.style.boxShadow = '0 0 10px #ef4444';
            text.textContent = 'PARTY OFFLINE';
        } else if (status === 'GUEST') {
            dot.style.background = this.supabase ? '#10b981' : '#f59e0b';
            dot.style.boxShadow = this.supabase ? '0 0 10px #10b981' : '0 0 10px #f59e0b';
            text.textContent = this.supabase ? 'LOCAL + PARTY READY' : 'LOCAL MODE';
        } else {
            dot.style.background = '#f59e0b';
            dot.style.boxShadow = '0 0 10px #f59e0b';
            text.textContent = 'ESTABLISHING...';
        }
    },

    runLoadingTheater() {
        const statusText = document.querySelector('#loading-screen .loader-status');
        let progress = 0;
        const tick = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 30 : 90;
        const interval = setInterval(() => {
            if (document.getElementById('loading-screen')?.classList.contains('hidden')) {
                clearInterval(interval);
                return;
            }
            progress += Math.random() * 15;
            if (progress > 30 && progress < 60 && statusText) statusText.textContent = "STABILIZING ARCHIVE...";
            if (progress > 60 && progress < 90 && statusText) statusText.textContent = "LOADING LOCAL LISTS...";
            if (progress > 100) clearInterval(interval);
        }, tick);
    },

    revealApp() {
        document.getElementById('loading-screen')?.classList.add('hidden');
        document.getElementById('app')?.classList.remove('hidden');
    },

};

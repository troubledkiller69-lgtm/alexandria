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
            name: 'VidSrc',
            supportsApi: false,
            getMovie: id => `https://vidsrc.cc/v2/embed/movie/${id}`,
            getTv: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`
        },
        {
            name: 'VidSrc TO',
            supportsApi: false,
            getMovie: id => `https://vidsrc.to/embed/movie/${id}`,
            getTv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`
        },
        {
            name: 'EmbedSU',
            supportsApi: false,
            getMovie: id => `https://embed.su/embed/movie/${id}`,
            getTv: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`
        },
        {
            name: 'VidLink',
            supportsApi: false,
            getMovie: id => `https://vidlink.pro/movie/${id}`,
            getTv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`
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
            const trusted = ['embedmaster.link', 'embdmstrplayer.com', 'vidsrcme.ru', 'vsembed.ru', 'vidsrc.cc', 'vidsrc.me', 'vidsrc.to', 'vidsrc.net', 'vsrc.su', 'vidlink.pro', 'autoembed.co', 'embed.su'];
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
        // #region agent log
        this._dbg('E', 'script.js:init', 'app boot', { href: typeof location !== 'undefined' ? location.href : null });
        // #endregion
        this.main = document.getElementById('content');
        
        // Start loading sequence immediately
        const loadingPromise = this.simulateLoading();

        await this.syncFromCloud();

        try {
            const savedServer = Number.parseInt(localStorage.getItem('alexandria_activeServer'), 10);
            if (Number.isInteger(savedServer) && this.servers[savedServer]) {
                this.state.activeServer = savedServer;
            } else {
                this.state.activeServer = 0;
                localStorage.setItem('alexandria_activeServer', '0');
            }
        } catch { /* ignore */ }

        // Supabase is optional; used only for Watch Party Realtime.
        // Await alongside the loading screen so deep-linked #party/... never races ahead.
        const networkPromise = this.initNetwork().catch(e => {
            console.error("Alexandria Protocol: Background Init Failed -", e);
        });

        await Promise.all([loadingPromise, networkPromise]);

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

    async shareCurrent(title = 'Alexandria') {
        const url = window.location.href;
        try {
            if (navigator.share) {
                await navigator.share({ title, url });
                return;
            }
        } catch {
            /* fall through to clipboard */
        }
        if (await this.copyText(url)) this.showToast('Link copied.');
        else this.showToast('Could not share this link.');
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

    simulateLoading() {
        return new Promise((resolve) => {
            const statusText = document.querySelector('#loading-screen .loader-status');
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 15;
                if (progress > 100) progress = 100;
                if (progress > 30 && progress < 60) statusText.textContent = "STABILIZING ARCHIVE...";
                if (progress > 60 && progress < 90) statusText.textContent = "LOADING LOCAL LISTS...";
                if (progress >= 100) {
                    clearInterval(interval);
                    setTimeout(() => {
                        document.getElementById('loading-screen')?.classList.add('hidden');
                        document.getElementById('app')?.classList.remove('hidden');
                        resolve();
                    }, 500);
                }
            }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 30 : 90);
        });
    },

};

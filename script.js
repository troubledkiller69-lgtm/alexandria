const Alexandria = {
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
        { id: 'reacher', img: '/92YNEEpCyugkTzPprJwZpvVtvuK.jpg', group: 'REACHER' }
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

    handleRouting() {
        const hash = window.location.hash || '#home';
        const path = hash.replace('#', '');
        
        // Deep Link Parsing
        if (path.startsWith('movie/')) {
            const id = Number.parseInt(path.split('/')[1], 10);
            if (!Number.isInteger(id) || id < 1) { this.setView('home'); return; }
            this.state.activeContent = { id, type: 'movie', isAnime: false, season: 1, episode: 1 };
            this.setView('player');
        } else if (path.startsWith('tv/')) {
            const parts = path.split('/');
            const id = Number.parseInt(parts[1], 10);
            if (!Number.isInteger(id) || id < 1) { this.setView('home'); return; }
            const sIndex = parts.indexOf('s');
            const eIndex = parts.indexOf('e');
            const season = Math.max(1, sIndex !== -1 ? parseInt(parts[sIndex+1], 10) || 1 : 1);
            const episode = Math.max(1, eIndex !== -1 ? parseInt(parts[eIndex+1], 10) || 1 : 1);
            this.state.activeContent = { id, type: 'tv', isAnime: false, season, episode };
            this.setView('player');
        } else if (path.startsWith('party/')) {
            const parts = path.split('/');
            const roomId = parts[1];
            const type = parts[2];
            const id = Number.parseInt(parts[3], 10);
            if (!roomId || (type !== 'movie' && type !== 'tv') || !Number.isInteger(id) || id < 1) {
                this.setView('home');
                return;
            }
            
            let season = 1;
            let episode = 1;
            if (type === 'tv') {
                const sIndex = parts.indexOf('s');
                const eIndex = parts.indexOf('e');
                season = Math.max(1, sIndex !== -1 ? parseInt(parts[sIndex+1], 10) || 1 : 1);
                episode = Math.max(1, eIndex !== -1 ? parseInt(parts[eIndex+1], 10) || 1 : 1);
            }
            this.state.activeContent = { id, type, isAnime: false, season, episode };
            this.state.partyRoomId = roomId;
            this.setView('party');
        } else if (path.startsWith('search/')) {
            try {
                this.state.searchQuery = decodeURIComponent(path.replace('search/', ''));
            } catch {
                this.state.searchQuery = '';
            }
            this.setView('search');
        } else if (path.startsWith('details/')) {
            const parts = path.split('/');
            const id = Number.parseInt(parts[2], 10);
            const type = parts[1];
            if (!Number.isInteger(id) || id < 1 || !['movie', 'tv'].includes(type)) { this.setView('home'); return; }
            this.state.activeContent = { id, type, isAnime: false, season: 1, episode: 1 };
            this.setView('details');
        } else if (path.startsWith('person/')) {
            const id = Number.parseInt(path.split('/')[1], 10);
            if (!Number.isInteger(id) || id < 1) { this.setView('home'); return; }
            this.state.activeContent = { id, type: 'person' };
            this.setView('person');
        } else if (path.startsWith('profile/')) {
            let uid = '';
            try {
                uid = decodeURIComponent(path.split('/').slice(1).join('/')).trim();
            } catch {
                uid = path.split('/').slice(1).join('/').trim();
            }
            if (!uid) { this.setView('home'); return; }
            this.state.activeProfileId = uid;
            this.state.profileTab = 'activity';
            this.state.profileData = null;
            this.setView('profile');
        } else if (path.startsWith('list/')) {
            const listId = path.split('/').slice(1).join('/').trim();
            if (!listId) { this.setView('home'); return; }
            this.state.activeListId = listId;
            this.setView('list');
        } else if (path === 'roulette') {
            this.openRouletteModal();
            return;
        } else {
            const allowedViews = new Set(['home', 'movies', 'tv', 'anime', 'franchises', 'search', 'history', 'watchlist', 'community']);
            this.setView(allowedViews.has(path) ? path : 'home');
        }
    },

    bindEvents() {
        // Sidebar Toggle Logic
        const sidebar = document.querySelector('.cyber-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const toggleBtn = document.getElementById('sidebar-toggle');
        const closeBtn = document.getElementById('sidebar-close');

        const toggleSidebar = (force) => {
            const willOpen = typeof force === 'boolean' ? force : !sidebar?.classList.contains('open');
            if (typeof force === 'boolean') {
                sidebar?.classList.toggle('open', force);
                overlay?.classList.toggle('active', force);
            } else {
                sidebar?.classList.toggle('open');
                overlay?.classList.toggle('active');
            }
            toggleBtn?.setAttribute('aria-expanded', String(willOpen));
            if (sidebar) {
                try { sidebar.inert = !willOpen; } catch { /* older browsers */ }
                sidebar.classList.toggle('is-inert', !willOpen);
                if (willOpen) sidebar.removeAttribute('inert');
                else sidebar.setAttribute('inert', '');
            }
            overlay?.setAttribute('aria-hidden', String(!willOpen));
            document.body.classList.toggle('sidebar-open', willOpen);
            if (willOpen) closeBtn?.focus();
            else if (force === false && document.activeElement === closeBtn) toggleBtn?.focus();
        };

        toggleBtn?.addEventListener('click', toggleSidebar);
        closeBtn?.addEventListener('click', () => toggleSidebar(false));
        overlay?.addEventListener('click', () => toggleSidebar(false));
        
        // Auto-close sidebar on nav clicks
        document.querySelectorAll('.nav-link, .sidebar-brand, .header-brand').forEach(el => {
            el.addEventListener('click', () => toggleSidebar(false));
        });

        document.querySelectorAll('.brand-button').forEach(button => {
            button.addEventListener('click', () => { window.location.hash = '#home'; });
        });

        document.addEventListener('click', (e) => {
            const wrapper = document.getElementById('genre-dropdown-wrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                wrapper.classList.remove('open');
            }
        });

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('account-menu');
            const trigger = document.getElementById('auth-trigger');
            if (menu && !menu.hasAttribute('hidden') && !menu.contains(e.target) && !trigger?.contains(e.target)) {
                menu.setAttribute('hidden', '');
            }
        });

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('changelog-menu');
            const trigger = document.getElementById('changelog-trigger');
            if (menu && !menu.hasAttribute('hidden') && !menu.contains(e.target) && !trigger?.contains(e.target)) {
                menu.setAttribute('hidden', '');
            }
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && sidebar?.classList.contains('open')) toggleSidebar(false);
            if (event.key === 'Escape') { this.closeAccountMenu(); this.closeChangelogMenu(); }
            const keyEl = this.eventElement(event.target);
            if ((event.key === 'Enter' || event.key === ' ') && keyEl?.matches('.cast-card, .episode-item, .resume-widget, .person-result-card')) {
                event.preventDefault();
                keyEl.click();
            }
        });

        const backToTop = document.getElementById('back-to-top');
        window.addEventListener('scroll', () => {
            const visible = window.scrollY > 500;
            backToTop?.classList.toggle('visible', visible);
            backToTop?.setAttribute('aria-hidden', String(!visible));
            if (backToTop) backToTop.tabIndex = visible ? 0 : -1;
        }, { passive: true });
        backToTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

        const enhanceContent = () => {
            this.main?.querySelectorAll('button:not([type])').forEach(button => { button.type = 'button'; });
            this.main?.querySelectorAll('.carousel-arrow').forEach(button => {
                button.setAttribute('aria-label', button.classList.contains('left') ? 'Scroll backward' : 'Scroll forward');
            });
        };
        new MutationObserver(enhanceContent).observe(this.main, { childList: true, subtree: true });
        enhanceContent();

        // Global click listener
        document.addEventListener('click', async (e) => {
            const logBtn = e.target.classList.contains('log-btn') ? e.target : e.target.closest('.log-btn');
            const searchTrigger = e.target.id === 'search-trigger' || e.target.closest('#search-trigger');
            const retryButton = e.target.closest('[data-retry-view]');
            const searchRetry = e.target.closest('[data-search-retry]');

            if (searchRetry) {
                this.executeSearch(this.state.searchQuery);
            } else if (retryButton) {
                this.setView(retryButton.dataset.retryView || 'home');
            } else if (logBtn) {
                e.preventDefault();
                const item = {
                    id: logBtn.dataset.id,
                    type: logBtn.dataset.type,
                    title: logBtn.dataset.title,
                    poster_path: logBtn.dataset.poster || ''
                };
                await this.toggleWatchlist(item);
            } else if (searchTrigger) {
                window.location.hash = '#search';
            } else {
                const card = e.target.classList.contains('movie-card') ? e.target : e.target.closest('.movie-card');
                if (card) {
                    if (card.classList.contains('person-result-card') || card.dataset.type === 'person') {
                        const personId = card.dataset.id;
                        if (personId) window.location.hash = `#person/${personId}`;
                        return;
                    }
                    const season = parseInt(card.dataset.season, 10);
                    const episode = parseInt(card.dataset.episode, 10);

                    if (season && episode) {
                        window.location.hash = `#tv/${card.dataset.id}/s/${season}/e/${episode}`;
                    } else if (card.dataset.type && card.dataset.id) {
                        window.location.hash = `#details/${card.dataset.type}/${card.dataset.id}`;
                    }
                }
            }
        });

        // Trailer previews on poster hover (desktop only, hover-intent)
        this.main.addEventListener('mouseover', (e) => {
            const w = e.target.closest('.poster-wrapper[data-trailer]');
            if (!w) return;
            if (!window.matchMedia('(hover: hover)').matches) return;
            if (window.innerWidth < 900) return;
            if (!this._trailerTimers) this._trailerTimers = new Map();
            if (this._trailerTimers.has(w)) return;
            if (w.querySelector('.trailer-preview')) return;
            this._trailerTimers.set(w, setTimeout(() => {
                this._trailerTimers.delete(w);
                this.loadTrailerPreview(w);
            }, 650));
        });

        this.main.addEventListener('mouseout', (e) => {
            const w = e.target.closest('.poster-wrapper[data-trailer]');
            if (!w) return;
            if (e.relatedTarget && w.contains(e.relatedTarget)) return;
            const t = this._trailerTimers.get(w);
            if (t) { clearTimeout(t); this._trailerTimers.delete(w); }
            const f = w.querySelector('.trailer-preview');
            if (f) f.remove();
        });

    },

    teardownParty() {
        if (this._partySyncTimer) {
            clearInterval(this._partySyncTimer);
            this._partySyncTimer = null;
        }
        if (this._partyClockTimer) {
            clearInterval(this._partyClockTimer);
            this._partyClockTimer = null;
        }
        if (this._partyPresenceResyncTimer) {
            clearTimeout(this._partyPresenceResyncTimer);
            this._partyPresenceResyncTimer = null;
        }
        if (this._partyGuestFlushTimer) {
            clearTimeout(this._partyGuestFlushTimer);
            this._partyGuestFlushTimer = null;
        }
        if (this._partyApplyLockTimer) {
            clearTimeout(this._partyApplyLockTimer);
            this._partyApplyLockTimer = null;
        }
        if (this._partyFrameLoadTimer) {
            clearTimeout(this._partyFrameLoadTimer);
            this._partyFrameLoadTimer = null;
        }
        if (this._partyReadyResyncTimer) {
            clearTimeout(this._partyReadyResyncTimer);
            this._partyReadyResyncTimer = null;
        }
        this.clearPartyEmbedWatch();
        this.clearHostPartyResyncTimers();
        this.clearGuestPartyResyncTimers();
        this._partyFrameReloading = false;
        this._partyEmbedHealthy = false;
        if (this.partyChannel && this.supabase) {
            this.supabase.removeChannel(this.partyChannel);
            this.partyChannel = null;
        }
        this.isHost = false;
        this.notifiedHost = false;
        this._partyGuestHinted = false;
        this._partyLastAction = null;
        this._partyLastTime = 0;
        this._applyingRemoteSync = false;
        this._partyGuestUnlocked = false;
        this._pendingPartySync = null;
        this._partyEpisodesLoadedKey = null;
        this.state.partyRoomId = null;
    },

    setView(view) {
        if (this.state.view === 'party' && view !== 'party') {
            this.teardownParty();
        }
        if (view !== 'community' && this.feedChannel && this.supabase) {
            this.supabase.removeChannel(this.feedChannel);
            this.feedChannel = null;
        }
        if (this.commentsChannel && this.supabase) {
            this.supabase.removeChannel(this.commentsChannel);
            this.commentsChannel = null;
        }
        this._commentsChannelKey = null;
        if (this.listChannel && this.supabase) {
            this.supabase.removeChannel(this.listChannel);
            this.listChannel = null;
        }
        clearTimeout(this._listRefreshTimer);
        this._listRefreshTimer = null;
        if (this.state.view === 'player' && view !== 'player') {
            this.writeLocalList('alexandria_history', this.state.history);
        }
        if (view !== 'player') this.clearFailoverWatch();
        this.state.view = view;
        this._renderToken += 1;
        if (this._autoNextTimer) { clearInterval(this._autoNextTimer); this._autoNextTimer = null; }
        this.render();
        window.scrollTo({ top: 0, behavior: 'auto' });
    },

    dedupeItems(list) {
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        const result = [];
        for (const item of list) {
            if (!item || item.id == null || !item.type) continue;
            const key = `${String(item.id)}_${item.type}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push(item);
            }
        }
        return result;
    },

    async syncFromCloud() {
        try {
            let localWatchlist = this.readStorageJson(localStorage, 'alexandria_watchlist', []) || [];
            let rawHistory = this.readStorageJson(localStorage, 'alexandria_history', []) || [];
            let cleanHistory = Array.isArray(rawHistory)
                ? rawHistory.filter(i => i && i.id != null && i.type !== 'sports' && String(i.id).match(/^\d+$/))
                : [];
            let localEpisodes = this.readStorageJson(localStorage, 'alexandria_watched_episodes', {}) || {};

            localWatchlist = this.dedupeItems(localWatchlist);
            cleanHistory = this.dedupeItems(cleanHistory);

            if (this.supabase && this.state.authUser) {
                const uid = this.state.authUser.id;
                try {
                    const { data: dbWatchlist } = await this.supabase
                        .from('survival_cache')
                        .select('*')
                        .eq('user_id', uid);
                    if (Array.isArray(dbWatchlist) && dbWatchlist.length > 0) {
                        const cloudList = dbWatchlist.map(w => ({
                            id: w.tmdb_id,
                            type: w.media_type,
                            title: w.title,
                            poster_path: w.poster_path,
                            status: w.status || 'want',
                            watched_at: w.watched_at || null
                        }));
                        // Local first: changes made on this device (even signed out)
                        // win over the cloud copy; fresh devices still inherit the cloud.
                        localWatchlist = this.dedupeItems([...localWatchlist, ...cloudList]);
                    }

                    const { data: dbEpisodes } = await this.supabase
                        .from('watched_episodes')
                        .select('tmdb_id, season, episode')
                        .eq('user_id', uid);

                    if (Array.isArray(dbEpisodes)) {
                        dbEpisodes.forEach(ep => {
                            localEpisodes[`${ep.tmdb_id}_s${ep.season}e${ep.episode}`] = true;
                        });
                    }

                    const { data: dbHistory } = await this.supabase
                        .from('history')
                        .select('*')
                        .eq('user_id', uid)
                        .order('created_at', { ascending: false });

                    if (Array.isArray(dbHistory) && dbHistory.length > 0) {
                        const cloudHist = dbHistory.map(h => ({
                            id: h.content_id,
                            type: h.type,
                            title: h.title,
                            poster_path: h.poster_path
                        }));
                        cleanHistory = this.dedupeItems([...cloudHist, ...cleanHistory]);
                    }

                    // Push local-only episode marks up so per-episode progress
                    // transfers too (same pull-only gap as the watchlist).
                    const cloudEpKeys = new Set((dbEpisodes || []).map(ep => `${ep.tmdb_id}_s${ep.season}e${ep.episode}`));
                    const epToPush = [];
                    for (const [key, val] of Object.entries(localEpisodes)) {
                        if (!val || cloudEpKeys.has(key)) continue;
                        const m = key.match(/^(\d+)_s(\d+)e(\d+)$/);
                        if (!m) continue;
                        epToPush.push({ user_id: uid, tmdb_id: Number(m[1]), season: Number(m[2]), episode: Number(m[3]) });
                    }
                    if (epToPush.length > 0) {
                        await this.supabase.from('watched_episodes').upsert(epToPush, { onConflict: 'user_id, tmdb_id, season, episode' });
                    }

                    // Push local-only items and status differences up so the
                    // watchlist transfers across devices even for titles added
                    // while signed out (they never reached the cloud before).
                    const cloudKeys = new Set((dbWatchlist || []).map(w => `${w.media_type}_${String(w.tmdb_id)}`));
                    const toPush = localWatchlist
                        .filter(i => {
                            const key = `${i.type}_${String(i.id)}`;
                            const cloudRow = (dbWatchlist || []).find(w => `${w.media_type}_${String(w.tmdb_id)}` === key);
                            return !cloudRow || cloudRow.status !== (i.status || 'want');
                        })
                        .map(i => ({
                            user_id: uid,
                            tmdb_id: Number(i.id),
                            media_type: i.type,
                            title: i.title || null,
                            poster_path: i.poster_path || null,
                            status: i.status || 'want',
                            watched_at: i.watched_at || null
                        }));
                    if (toPush.length > 0) {
                        await this.supabase.from('survival_cache').upsert(toPush, { onConflict: 'user_id, tmdb_id, media_type' });
                    }
                } catch (err) {
                    console.warn("Alexandria: Cloud sync warning:", err);
                }
            }

            this.state.watchlist = this.dedupeItems(localWatchlist);
            this.state.watchlist.forEach(w => {
                w.status = w.status || 'want';
                w.watched_at = w.watched_at || null;
            });
            this.state.history = this.dedupeItems(cleanHistory);
            this.state.watchedEpisodes = localEpisodes;
            this.writeLocalList('alexandria_watchlist', this.state.watchlist);
            this.writeLocalList('alexandria_history', this.state.history);
            this.writeLocalList('alexandria_watched_episodes', this.state.watchedEpisodes);
        } catch {
            this.state.watchlist = [];
            this.state.history = [];
            this.state.watchedEpisodes = {};
        }
    },

    async toggleWatchlist(item) {
        const itemId = String(item.id);
        const index = this.state.watchlist.findIndex(i => String(i.id) === itemId && i.type === item.type);

        document.querySelectorAll(`.log-btn[data-id="${itemId}"][data-type="${item.type}"]`).forEach(btn => {
            const isActive = btn.classList.contains('active');
            btn.classList.toggle('active');
            btn.textContent = isActive ? '+' : '✓';
            btn.setAttribute('aria-pressed', String(!isActive));
            btn.setAttribute('aria-label', isActive ? 'Add to watchlist' : 'Remove from watchlist');
        });

        if (index === -1) {
            this.state.watchlist.unshift(item);
        } else {
            this.state.watchlist.splice(index, 1);
        }

        this.writeLocalList('alexandria_watchlist', this.state.watchlist);
        this.showToast(index === -1 ? 'Added to your watchlist.' : 'Removed from your watchlist.');

        if (this.supabase && this.state.authUser && String(item.id).match(/^\d+$/)) {
            const uid = this.state.authUser.id;
            if (index === -1) {
                this.supabase.from('survival_cache').upsert({
                    user_id: uid,
                    tmdb_id: Number(item.id),
                    media_type: item.type,
                    title: item.title,
                    poster_path: item.poster_path,
                    status: 'want'
                }, { onConflict: 'user_id, tmdb_id, media_type' }).then();
            } else {
                this.supabase.from('survival_cache')
                    .delete()
                    .eq('user_id', uid)
                    .eq('tmdb_id', Number(item.id))
                    .eq('media_type', item.type)
                    .then();
            }
        }

        if (this.state.view === 'home') this.renderWatchlist();
        else if (this.state.view === 'watchlist') this.renderWatchlistPage();
    },

    async addToHistory(item) {
        if (!item || item.id == null || !item.type) return;
        this.state.history = this.dedupeItems([item, ...this.state.history]);
        if (this.state.history.length > 20) this.state.history.pop();
        this.writeLocalList('alexandria_history', this.state.history);

        if (this.supabase && this.state.authUser && String(item.id).match(/^\d+$/)) {
            this.supabase.from('history').upsert({
                user_id: this.state.authUser.id,
                content_id: Number(item.id),
                type: item.type,
                title: item.title,
                poster_path: item.poster_path
            }, { onConflict: 'user_id, content_id, type' }).then();
        }

        if (['movie', 'tv'].includes(item.type) && String(item.id).match(/^\d+$/)) {
            this.logActivity('watching', {
                contentId: item.id,
                contentType: item.type,
                title: item.title,
                posterPath: item.poster_path
            });
        }
    },

    render() {
        if (!this.main) this.main = document.getElementById('content');
        if (!this.main) return;
        
        // Update Nav Link Active States
        document.querySelectorAll('.nav-link').forEach(link => {
            const isActive = link.getAttribute('href') === `#${this.state.view}`;
            link.classList.toggle('active', isActive);
            if (isActive) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });

        // Main View Routing. Views render asynchronously; return the promise
        // so callers and tests can await completion (navigate() ignores it).
        if (this.state.view === 'home') return this.renderHome();
        else if (this.state.view === 'movies') return this.renderFiltered('movie');
        else if (this.state.view === 'tv') return this.renderFiltered('tv');
        else if (this.state.view === 'anime') return this.renderAnime();
        else if (this.state.view === 'franchises') return this.renderFranchises();
        else if (this.state.view === 'search') return this.renderSearch();
        else if (this.state.view === 'history') return this.renderHistoryPage();
        else if (this.state.view === 'watchlist') return this.renderWatchlistPage();
        else if (this.state.view === 'player') return this.renderPlayer();
        else if (this.state.view === 'details') return this.renderDetails();
        else if (this.state.view === 'person') return this.renderPerson();
        else if (this.state.view === 'profile') return this.renderProfile();
        else if (this.state.view === 'community') return this.renderCommunity();
        else if (this.state.view === 'party') return this.renderParty();
        else if (this.state.view === 'list') return this.renderList();

        else {
            this.state.view = 'home';
            return this.renderHome();
        }
    },
    GENRES: [
        { id: 35, name: 'Comedy' },
        { id: 28, name: 'Action' },
        { id: 18, name: 'Drama' },
        { id: 27, name: 'Horror' },
        { id: 10749, name: 'Romance' },
        { id: 12, name: 'Adventure' },
        { id: 878, name: 'Science Fiction' },
        { id: 53, name: 'Thriller' },
        { id: 16, name: 'Animation' },
        { id: 80, name: 'Crime' },
        { id: 14, name: 'Fantasy' },
        { id: 9648, name: 'Mystery' },
        { id: 99, name: 'Documentary' },
        { id: 10751, name: 'Family' },
        { id: 36, name: 'History' },
        { id: 10402, name: 'Music' },
        { id: 10752, name: 'War' },
        { id: 37, name: 'Western' }
    ],

    toggleGenreMenu(e) {
        if (e) e.stopPropagation();
        const wrapper = document.getElementById('genre-dropdown-wrapper');
        if (wrapper) wrapper.classList.toggle('open');
    },

    async selectGenre(genreId) {
        const genre = this.GENRES.find(g => g.id === genreId) || this.GENRES[0];
        this.state.activeGenreId = genre.id;
        
        const wrapper = document.getElementById('genre-dropdown-wrapper');
        if (wrapper) wrapper.classList.remove('open');

        const titleEl = document.getElementById('current-genre-title');
        if (titleEl) titleEl.textContent = genre.name;

        document.querySelectorAll('.genre-popover-item').forEach(item => {
            if (Number(item.dataset.genreId) === genre.id) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        const grid = document.getElementById('genre-explorer-grid');
        if (grid) {
            grid.innerHTML = '<div class="placeholder-msg">Loading ' + this.escapeHtml(genre.name) + '...</div>';
            try {
                const data = await this.getJson(`discover/movie?with_genres=${genre.id}&sort_by=popularity.desc`);
                this.renderResults(data.results, 'genre-explorer-grid');
            } catch (err) {
                console.error("Genre fetch failed:", err);
                grid.innerHTML = '<div class="placeholder-msg">Failed to load titles</div>';
            }
        }
    },

    renderHistoryPage() {
        const history = this.state.history || [];
        const featured = history[0];
        const heroBackdrop = featured?.backdrop_path ? this.imageUrl(featured.backdrop_path, 'original') : (featured?.poster_path ? this.imageUrl(featured.poster_path, 'original') : '');

        this.main.innerHTML = `
            <section class="filtered-view">
                <div class="hero-featured" style="--hero-image: url('${heroBackdrop}')">
                    <div class="featured-content">
                        <span class="trending-badge">LAST WATCHED</span>
                        <h1>${this.escapeHtml(featured ? (featured.title || featured.name) : 'WATCH HISTORY')}</h1>
                        <p>${this.escapeHtml(featured?.overview || 'Your playback history across movies and television series.')}</p>
                        <div class="category-hero-actions">
                            ${featured ? `
                                <button class="btn-primary" onclick="Alexandria.playContent(${featured.id}, '${featured.type || 'movie'}', ${featured.season || 1}, ${featured.episode || 1})">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> RESUME PLAYBACK
                                </button>
                            ` : ''}
                            ${history.length > 0 ? `
                                <button class="btn-secondary" onclick="Alexandria.clearWatchHistory()">CLEAR HISTORY</button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="sector-widget">
                        <div class="sector-widget-content">
                            <span class="sector-label">WATCH HISTORY</span>
                            <h4>${history.length} ${history.length === 1 ? 'Title' : 'Titles'} Logged</h4>
                            <p>Recent playback history</p>
                        </div>
                    </div>
                </div>
                <div class="view-section">
                    <h3>Watch History Archive</h3>
                    ${history.length > 0 ? `
                        <div class="results-grid" id="history-page-grid"></div>
                    ` : `
                        <div class="placeholder-msg">Your watch history is empty. Titles you watch will appear here.</div>
                    `}
                </div>
            </section>
        `;
        if (history.length > 0) {
            this.renderResults(history, 'history-page-grid', true);
        }
    },

    clearWatchHistory() {
        this.state.history = [];
        this.writeLocalList('alexandria_history', []);
        this.renderHistoryPage();
        this.showToast('Watch history cleared.');
    },

    async setWatchStatus(id, type, status) {
        const item = this.state.watchlist.find(i => String(i.id) === String(id) && i.type === type);
        if (!item) return;
        item.status = status;
        item.watched_at = status === 'watched' ? new Date().toISOString() : null;
        this.writeLocalList('alexandria_watchlist', this.state.watchlist);

        if (this.supabase && this.state.authUser && String(id).match(/^\d+$/)) {
            this.supabase.from('survival_cache').upsert({
                user_id: this.state.authUser.id,
                tmdb_id: Number(id),
                media_type: type,
                title: item.title,
                poster_path: item.poster_path,
                status: status,
                watched_at: item.watched_at
            }, { onConflict: 'user_id, tmdb_id, media_type' }).then();
        }

        this.showToast(status === 'watched' ? 'Marked as watched.' : status === 'watching' ? 'Moved to watching.' : 'Back in the queue.');
        if (this.state.view === 'watchlist') {
            this.renderWatchlistPage();
        } else if (this.state.view === 'details') {
            this.renderDetails();
        }
    },

    async markEpisodeWatched(id, season, episode, watched = true) {
        const key = `${id}_s${season}e${episode}`;
        if (watched) {
            this.state.watchedEpisodes[key] = true;
        } else {
            delete this.state.watchedEpisodes[key];
        }
        this.writeLocalList('alexandria_watched_episodes', this.state.watchedEpisodes);

        if (this.supabase && this.state.authUser && String(id).match(/^\d+$/)) {
            if (watched) {
                this.supabase.from('watched_episodes').upsert({
                    user_id: this.state.authUser.id,
                    tmdb_id: Number(id),
                    season: Number(season),
                    episode: Number(episode)
                }, { onConflict: 'user_id, tmdb_id, season, episode' }).then();
            } else {
                this.supabase.from('watched_episodes')
                    .delete()
                    .eq('user_id', this.state.authUser.id)
                    .eq('tmdb_id', Number(id))
                    .eq('season', Number(season))
                    .eq('episode', Number(episode))
                    .then();
            }
        }

        // Sync every toggle for this episode across the page (sidebar rows + watchlist panels).
        document.querySelectorAll(`[data-show="${id}"][data-season="${season}"][data-episode="${episode}"]`).forEach(btn => {
            btn.classList.toggle('active', watched);
            btn.setAttribute('aria-pressed', String(watched));
        });

        // First episode logged promotes a queued show to watching.
        if (watched) {
            const item = this.state.watchlist.find(i => String(i.id) === String(id) && i.type === 'tv');
            if (item && item.status === 'want') {
                item.status = 'watching';
                this.writeLocalList('alexandria_watchlist', this.state.watchlist);
                if (this.supabase && this.state.authUser) {
                    this.supabase.from('survival_cache').upsert({
                        user_id: this.state.authUser.id,
                        tmdb_id: Number(id),
                        media_type: 'tv',
                        title: item.title,
                        poster_path: item.poster_path,
                        status: 'watching'
                    }, { onConflict: 'user_id, tmdb_id, media_type' }).then();
                }
            }
        }
        if (this.state.view === 'watchlist') {
            // Keep any expanded episode panels open across the re-render.
            const openPanels = [...document.querySelectorAll('.ep-panel:not([hidden])')].map(p => p.dataset.panelShow);
            this.renderWatchlistPage();
            openPanels.forEach(pid => this.toggleEpPanel(pid));
        }
    },

    clearWatchlistPage() {
        this.state.watchlist = [];
        this.writeLocalList('alexandria_watchlist', []);
        if (this.supabase && this.state.authUser) {
            this.supabase.from('survival_cache').delete().eq('user_id', this.state.authUser.id).then();
        }
        this.renderWatchlistPage();
        this.showToast('Watchlist cleared. Episode progress is kept.');
    },

    async surpriseMeWatchlist() {
        const queue = this.state.watchlist.filter(w => w.status !== 'watched');
        if (!queue.length) {
            this.showToast('Nothing in the queue. Add titles to surprise yourself.');
            return;
        }
        const pick = queue[Math.floor(Math.random() * queue.length)];
        if (pick.type === 'movie') {
            window.location.hash = `#movie/${pick.id}`;
            return;
        }
        // TV: jump to the next unwatched episode of the season you left off on, else s1e1.
        const saved = this.state.history.find(h => String(h.id) === String(pick.id) && h.type === 'tv');
        let s = Math.max(1, Number.parseInt(saved?.season, 10) || 1);
        let e = Math.max(1, Number.parseInt(saved?.episode, 10) || 1);
        try {
            const seasonData = await this.getJson(`tv/${pick.id}/season/${s}`);
            const eps = (seasonData.episodes || []).map(x => x.episode_number).filter(n => Number.isFinite(n));
            const firstUnwatched = eps.find(n => !this.state.watchedEpisodes[`${pick.id}_s${s}e${n}`]);
            if (firstUnwatched) {
                e = firstUnwatched;
            } else {
                const show = await this.getJson('tv/' + pick.id);
                const next = (show.seasons || []).find(x => x.season_number === s + 1);
                if (next) {
                    s = next.season_number;
                    e = 1;
                }
            }
        } catch { /* fall back to the saved spot */ }
        window.location.hash = `#tv/${pick.id}/s/${s}/e/${e}`;
    },

    renderWatchlistPage() {
        const watchlist = this.state.watchlist || [];
        const filter = this.state.watchlistFilter || 'all';
        const sort = this.state.watchlistSort || 'recent';

        const applySort = list => {
            const arr = [...list];
            if (sort === 'title') {
                arr.sort((a, b) => String(a.title || a.name || '').localeCompare(String(b.title || b.name || '')));
            } else if (sort === 'watched') {
                arr.sort((a, b) => String(b.watched_at || '').localeCompare(String(a.watched_at || '')));
            }
            return arr;
        };

        const filtered = applySort(watchlist.filter(w => {
            if (filter === 'want') return (w.status || 'want') === 'want';
            if (filter === 'watching') return (w.status || 'want') === 'watching';
            if (filter === 'watched') return (w.status || 'want') === 'watched';
            if (filter === 'movie') return w.type === 'movie';
            if (filter === 'tv') return w.type === 'tv';
            return true;
        }));

        const queue = applySort(watchlist.filter(w => (w.status || 'want') === 'want'));
        const watching = applySort(watchlist.filter(w => (w.status || 'want') === 'watching'));
        const watched = applySort(watchlist.filter(w => (w.status || 'want') === 'watched'));

        const featured = queue[0] || watching[0] || watched[0] || watchlist[0];
        const heroBackdrop = featured?.backdrop_path ? this.imageUrl(featured.backdrop_path, 'original') : (featured?.poster_path ? this.imageUrl(featured.poster_path, 'original') : '');
        const filterActive = filter !== 'all';

        const pill = (val, label) => `<button class="filter-btn ${filter === val ? 'active' : ''}" type="button" aria-pressed="${filter === val}" onclick="Alexandria.setWatchlistFilter('${val}')">${label}</button>`;

        this.main.innerHTML = `
            <section class="filtered-view">
                <div class="hero-featured" style="--hero-image: url('${heroBackdrop}')">
                    <div class="featured-content">
                        <span class="trending-badge">SAVED WATCHLIST</span>
                        <h1>${this.escapeHtml(featured ? (featured.title || featured.name) : 'MY WATCHLIST')}</h1>
                        <p>${this.escapeHtml(featured?.overview || 'Your saved collection of movies and television series.')}</p>
                        <div class="category-hero-actions">
                            ${featured ? `
                                <button class="btn-primary" onclick="Alexandria.playContent(${featured.id}, '${featured.type || 'movie'}')">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> WATCH NOW
                                </button>
                                <button class="btn-secondary wl-details-btn" onclick="window.location.hash = '#details/${featured.type || 'movie'}/${featured.id}'">DETAILS</button>
                            ` : ''}
                            ${watchlist.length > 0 ? `
                                <button class="btn-secondary" onclick="Alexandria.clearWatchlistPage()">CLEAR WATCHLIST</button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="sector-widget">
                        <div class="sector-widget-content">
                            <span class="sector-label">MY WATCHLIST</span>
                            <h4>${watchlist.length} ${watchlist.length === 1 ? 'Title' : 'Titles'} Saved</h4>
                            <p>Personal bookmarked titles</p>
                        </div>
                    </div>
                </div>
                ${watchlist.length > 0 ? `
                <div class="watchlist-toolbar">
                    <div class="watchlist-toolbar-filters">
                        ${pill('all', 'ALL')}
                        ${pill('want', 'TO WATCH')}
                        ${pill('watching', 'WATCHING')}
                        ${pill('watched', 'WATCHED')}
                        ${pill('movie', 'MOVIES')}
                        ${pill('tv', 'TV')}
                    </div>
                    <div class="watchlist-toolbar-actions">
                        <select id="watchlist-sort" class="compact-select" aria-label="Sort watchlist" onchange="Alexandria.setWatchlistSort(this.value)">
                            <option value="recent" ${sort === 'recent' ? 'selected' : ''}>RECENTLY ADDED</option>
                            <option value="title" ${sort === 'title' ? 'selected' : ''}>TITLE A-Z</option>
                            <option value="watched" ${sort === 'watched' ? 'selected' : ''}>WATCHED DATE</option>
                        </select>
                        <button class="compact-btn" type="button" onclick="Alexandria.surpriseMeWatchlist()">SURPRISE ME</button>
                    </div>
                </div>
                ` : ''}
                ${filterActive ? `
                <div class="view-section">
                    <h3>${filter === 'want' ? 'TO WATCH' : filter === 'watching' ? 'WATCHING' : filter === 'watched' ? 'WATCHED' : filter === 'movie' ? 'MOVIES' : 'TV SHOWS'}</h3>
                    ${filtered.length > 0 ? `<div class="results-grid" id="watchlist-page-grid"></div>` : '<div class="placeholder-msg">Nothing in this sector of the archive yet.</div>'}
                </div>
                ` : `
                <div class="view-section">
                    <h3>UP NEXT</h3>
                    ${queue.length > 0 ? `<div class="results-grid" id="wl-grid-queue"></div>` : '<div class="placeholder-msg">Your queue is empty. Add titles to save them for later.</div>'}
                </div>
                ${watching.length > 0 ? `
                <div class="view-section">
                    <h3>WATCHING</h3>
                    <div class="results-grid" id="wl-grid-watching"></div>
                </div>` : ''}
                ${watched.length > 0 ? `
                <div class="view-section">
                    <h3>WATCHED</h3>
                    <div class="results-grid" id="wl-grid-watched"></div>
                </div>` : ''}
                `}
                ${watchlist.length === 0 ? `
                <div class="view-section">
                    <div class="placeholder-msg">Your watchlist is empty. Add titles to save them for later.</div>
                </div>` : ''}
            </section>
        `;

        if (filterActive) {
            if (filtered.length > 0) this.renderResults(filtered, 'watchlist-page-grid', false, { watchlistMode: true });
        } else {
            if (queue.length > 0) this.renderResults(queue, 'wl-grid-queue', false, { watchlistMode: true });
            if (watching.length > 0) this.renderResults(watching, 'wl-grid-watching', false, { watchlistMode: true });
            if (watched.length > 0) this.renderResults(watched, 'wl-grid-watched', false, { watchlistMode: true });
        }
    },

    setWatchlistFilter(val) {
        this.state.watchlistFilter = val;
        this.renderWatchlistPage();
    },

    setWatchlistSort(val) {
        this.state.watchlistSort = val;
        this.renderWatchlistPage();
    },

    async toggleEpPanel(id, btnArg) {
        const card = btnArg ? btnArg.closest('.movie-card') : document.querySelector(`.movie-card[data-id="${id}"]`);
        const btn = btnArg || (card ? card.querySelector('.ep-toggle-btn') : null);
        const panel = card ? card.querySelector('.ep-panel') : null;
        if (!panel) return;
        if (!panel.hidden) {
            panel.hidden = true;
            if (btn) {
                btn.classList.remove('active');
                btn.setAttribute('aria-expanded', 'false');
            }
            return;
        }
        panel.hidden = false;
        if (btn) {
            btn.classList.add('active');
            btn.setAttribute('aria-expanded', 'true');
        }
        if (panel.dataset.loaded) return;
        panel.dataset.loaded = '1';
        const token = this._renderToken;
        try {
            const show = await this.getJson('tv/' + id);
            const seasons = (show.seasons || []).filter(s => s.season_number > 0);
            const seasonData = await this.mapWithConcurrency(seasons, 3, s =>
                this.getJson(`tv/${id}/season/${s.season_number}`).catch(() => null));
            if (token !== this._renderToken || panel.hidden) return;
            panel.innerHTML = seasons.map((s, i) => {
                const eps = (seasonData[i]?.episodes || []).filter(e => Number.isFinite(e.episode_number));
                return `
                <div class="ep-panel-season">
                    <span class="ep-panel-season-name">SEASON ${s.season_number}</span>
                    ${eps.length ? eps.map(e => {
                        const watched = !!this.state.watchedEpisodes[`${id}_s${s.season_number}e${e.episode_number}`];
                        return `
                        <div class="ep-panel-item ${watched ? 'watched' : ''}">
                            <span class="ep-panel-num">EP ${e.episode_number}</span>
                            <a class="ep-panel-name" href="#tv/${id}/s/${s.season_number}/e/${e.episode_number}">${this.escapeHtml(e.name || 'Untitled episode')}</a>
                            <button class="ep-watched-btn ${watched ? 'active' : ''}" type="button" aria-label="Mark episode ${e.episode_number} watched" aria-pressed="${watched}"
                                data-show="${id}" data-season="${s.season_number}" data-episode="${e.episode_number}"
                                onclick="event.stopPropagation(); event.preventDefault(); Alexandria.markEpisodeWatched(${id}, ${s.season_number}, ${e.episode_number}, !this.classList.contains('active'))">✓</button>
                        </div>`;
                    }).join('') : '<div class="ep-panel-item"><span class="ep-panel-name">No episodes listed.</span></div>'}
                </div>`;
            }).join('');
        } catch {
            panel.innerHTML = '<div class="placeholder-msg">EPISODES UNREACHABLE</div>';
        }
    },



    async renderHome() {
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING SECTORS...</div>';
        
        try {
            const currentGenre = this.GENRES.find(g => g.id === (this.state.activeGenreId || 35)) || this.GENRES[0];

            // Sector 1: Core Content Scans
            const [mData, tData, genreData] = await Promise.all([
                this.getJson('trending/movie/day'),
                this.getJson('trending/tv/day'),
                this.getJson(`discover/movie?with_genres=${currentGenre.id}&sort_by=popularity.desc`).catch(() => ({ results: [] }))
            ]);
            
            // Sector 2: Alexandria's specials, using verified TMDB IDs.
            const chronicleIds = [1402, 62286, 94305, 194583, 211684, 206586];
            const specialsData = await Promise.all(chronicleIds.map(id => 
                this.getJson('tv/' + id)
                .catch(() => null)
            )).then(results => results.filter(Boolean));

            if (token !== this._renderToken) return;

            const featured = mData.results?.[0];
            const last = this.state.history?.[0];
            const lastId = Number.parseInt(last?.id, 10);
            const lastOk = last && Number.isInteger(lastId) && lastId > 0 && (last.type === 'movie' || last.type === 'tv');
            const lastSeason = Math.max(1, Number.parseInt(last?.season, 10) || 1);
            const lastEpisode = Math.max(1, Number.parseInt(last?.episode, 10) || 1);
            const resumeHash = lastOk
                ? (last.type === 'tv'
                    ? `#tv/${lastId}/s/${lastSeason}/e/${lastEpisode}`
                    : `#movie/${lastId}`)
                : '';

            if (!featured) throw new Error("No featured content found.");

            this.main.innerHTML = `
                <section class="home-view">
                    <div class="hero-featured" style="--hero-image: url('${this.imageUrl(featured.backdrop_path, 'original')}')">
                        <div class="featured-content">
                            <span class="trending-badge">#1 TRENDING TODAY</span>
                            <h1>${this.escapeHtml(featured.title)}</h1>
                            <p>${this.escapeHtml(featured.overview || 'No overview is available yet.')}</p>
                            <button class="btn-primary" onclick="Alexandria.playContent(${Number(featured.id)}, 'movie')">WATCH NOW</button>
                        </div>
                        ${lastOk ? `<div class="resume-widget" role="link" tabindex="0" data-resume-hash="${this.escapeHtml(resumeHash)}" onclick="window.location.hash = this.dataset.resumeHash">
                            <div class="resume-content"><span class="resume-label">CONTINUE WATCHING</span><h4>${this.escapeHtml(last.title || 'Untitled')}</h4><p>${last.progress > 5 ? `Resume at ${this.formatTime(last.progress)}` : 'Resume playback'}</p></div>
                        </div>` : ''}
                    </div>
                    <div id="continue-watching-section"></div>
                    <div id="because-you-watched-section"></div>
                    <div id="priority-archive-section"></div>
                    <div class="view-section">
                        <div class="genre-dropdown-wrapper" id="genre-dropdown-wrapper">
                            <button type="button" class="genre-dropdown-trigger" onclick="Alexandria.toggleGenreMenu(event)">
                                <span class="genre-red-bar">|</span>
                                <span id="current-genre-title">${this.escapeHtml(currentGenre.name)}</span>
                                <svg class="genre-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>
                            <div class="genre-dropdown-popover">
                                ${this.GENRES.map(g => `
                                    <div class="genre-popover-item ${g.id === currentGenre.id ? 'active' : ''}" data-genre-id="${g.id}" onclick="Alexandria.selectGenre(${g.id})">
                                        <span class="genre-popover-text">${this.escapeHtml(g.name)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="carousel-container">
                            <button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button>
                            <div class="carousel-wrapper"><div class="carousel-grid" id="genre-explorer-grid"></div></div>
                            <button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button>
                        </div>
                    </div>
                    <div class="view-section"><h3>ALEXANDRIA'S SPECIALS</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="alexandria-specials"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Trending Movies</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="trending-movies"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Trending TV Shows</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="trending-tv"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>RELEASING THIS WEEK</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="airing-week-grid"><div class="placeholder-msg"><span class="pulse-dot"></span> SCANNING AIRTIMES...</div></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                </section>`;
            
            this.renderHistory();
            this.renderBecauseYouWatched();
            this.renderWatchlist();
            this.renderResults(genreData.results, 'genre-explorer-grid');
            this.renderResults(specialsData, 'alexandria-specials');
            this.renderResults(mData.results, 'trending-movies');
            this.renderResults(tData.results, 'trending-tv');
            this.renderAiringThisWeek();
        } catch (error) {
            console.error("Alexandria Protocol: Home Scout Failed -", error);
            if (token === this._renderToken) this.renderError('The archive is out of range', error.message, 'home');
        }
    },

    renderWatchlist() {
        const container = document.getElementById('priority-archive-section');
        if (!container) return;
        
        if (this.state.watchlist.length > 0) {
            container.innerHTML = `<div class="view-section"><h3>MY WATCHLIST</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="watchlist-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>`;
            this.renderResults(this.state.watchlist, 'watchlist-results');
        } else {
            container.innerHTML = '<div class="view-section"><h3>MY WATCHLIST</h3><div class="placeholder-msg">Your watchlist is empty. Save movies and TV shows here to watch later.</div></div>';
        }
    },

    renderHistory() {
        const container = document.getElementById('continue-watching-section');
        if (!container) return;
        
        if (this.state.history && this.state.history.length > 0) {
            container.innerHTML = `<div class="view-section"><h3>CONTINUE WATCHING</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="history-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>`;
            this.renderResults(this.state.history, 'history-results', true);
        } else {
            container.innerHTML = '';
        }
    },

    async renderBecauseYouWatched() {
        const container = document.getElementById('because-you-watched-section');
        if (!container || !this.state.history || !this.state.history.length) {
            if (container) container.innerHTML = '';
            return;
        }

        const seeds = (this.state.history || [])
            .filter(h => h && (h.type === 'movie' || h.type === 'tv') && h.id != null)
            .slice(0, 2);
        if (!seeds.length) {
            container.innerHTML = '';
            return;
        }

        const token = this._renderToken;
        const blockKeys = new Set();
        (this.state.history || []).forEach(h => {
            if (h && h.id != null && h.type) blockKeys.add(String(h.id) + '_' + h.type);
        });
        (this.state.watchlist || []).forEach(w => {
            if (w && w.id != null && w.type) blockKeys.add(String(w.id) + '_' + w.type);
        });

        const collected = [];
        const seen = new Set();
        for (const seed of seeds) {
            let data = null;
            try {
                data = await this.getJson(seed.type + '/' + seed.id + '/recommendations');
            } catch (error) {
                data = null;
            }
            if (token !== this._renderToken) return;

            const results = (data && data.results) || [];
            for (const item of results) {
                if (!item || !item.poster_path) continue;
                const type = item.media_type === 'tv' || item.media_type === 'movie'
                    ? item.media_type
                    : (item.name && !item.title ? 'tv' : 'movie');
                const key = String(item.id) + '_' + type;
                if (blockKeys.has(key) || seen.has(key)) continue;
                seen.add(key);
                collected.push({ ...item, type });
            }
            if (collected.length >= 14) break;
        }
        if (token !== this._renderToken) return;

        const capped = collected.slice(0, 14);
        if (!capped.length) {
            container.innerHTML = '';
            return;
        }

        const seedTitle = seeds[0].title || seeds[0].name || 'YOUR HISTORY';
        container.innerHTML = `<div class="view-section"><h3>BECAUSE YOU WATCHED ${this.escapeHtml(seedTitle)}</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="because-you-watched-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>`;
        this.renderResults(capped, 'because-you-watched-results');
    },

    localISODate(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    // TMDB's tv/on_the_air is popularity-ordered, so page 1 alone misses most
    // of the week's real airings. Pull a few pages and resolve each show's
    // next_episode_to_air (cached by getJson) for the true air date + episode.
    async fetchAiringThisWeek(limit = 24) {
        try {
            const today = new Date();
            const minIso = this.localISODate(today);
            const maxIso = this.localISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7));
            const seen = new Set();
            const tvShows = [];
            const tvPages = await Promise.all([1, 2, 3].map(p => this.getJson('tv/on_the_air?page=' + p).catch(() => null)));
            for (const page of tvPages) {
                for (const s of (page?.results || [])) {
                    if (s && s.id && !seen.has(s.id)) { seen.add(s.id); tvShows.push(s); }
                }
            }
            const tvRows = await this.mapWithConcurrency(tvShows, 6, async s => {
                try {
                    const detail = await this.getJson('tv/' + s.id);
                    const next = detail.next_episode_to_air;
                    if (!next || !next.air_date) return null;
                    if (next.air_date < minIso || next.air_date > maxIso) return null;
                    return {
                        id: s.id,
                        type: 'tv',
                        name: s.name || detail.name || 'Untitled',
                        poster_path: detail.poster_path || s.poster_path,
                        air_date: next.air_date,
                        season: next.season_number,
                        episode: next.episode_number
                    };
                } catch {
                    return null;
                }
            });
            // Theatrical releases this week — the row was TV-only before.
            const movieRows = [];
            try {
                const movieData = await this.getJson(`discover/movie?sort_by=popularity.desc&with_release_type=2|3&primary_release_date.gte=${minIso}&primary_release_date.lte=${maxIso}`);
                for (const m of (movieData.results || []).slice(0, 10)) {
                    if (!m || !m.id || !m.release_date) continue;
                    movieRows.push({
                        id: m.id,
                        type: 'movie',
                        name: m.title || m.name || 'Untitled',
                        poster_path: m.poster_path,
                        air_date: m.release_date
                    });
                }
            } catch { /* movies are a bonus; TV is the core row */ }
            return [...tvRows, ...movieRows]
                .filter(Boolean)
                .sort((a, b) => a.air_date < b.air_date ? -1 : 1)
                .slice(0, limit);
        } catch {
            return [];
        }
    },

    async renderAiringThisWeek() {
        const token = this._renderToken;
        const grid = document.getElementById('airing-week-grid');
        if (!grid) return;
        const rows = await this.fetchAiringThisWeek();
        if (token !== this._renderToken || !grid.isConnected) return;
        if (!rows.length) {
            grid.innerHTML = '<div class="placeholder-msg">No confirmed airings this week.</div>';
            return;
        }
        const fmt = iso => {
            const d = new Date(iso + 'T12:00:00');
            return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()] + ' ' + ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()] + ' ' + d.getDate();
        };
        const todayIso = this.localISODate(new Date());
        grid.innerHTML = rows.map(r => {
            const safeId = this.escapeHtml(String(r.id));
            const safeTitle = this.escapeHtml(r.name);
            const poster = this.imageUrl(r.poster_path, 'w185');
            const isToday = r.air_date === todayIso;
            const isMovie = r.type === 'movie';
            const epLabel = isMovie ? '' : `<span class="airing-card-ep">S${r.season ?? 1} · E${r.episode}</span>`;
            return `
                <a class="airing-card" href="#details/${isMovie ? 'movie' : 'tv'}/${safeId}">
                    ${poster ? `<img class="airing-card-poster" src="${poster}" alt="${safeTitle} poster" loading="lazy" decoding="async">` : '<div class="poster-placeholder" role="img" aria-label="No poster available"><span>A</span><small>NO POSTER</small></div>'}
                    <span class="airing-card-badge ${isToday ? 'today' : ''}">${isToday ? 'TONIGHT' : fmt(r.air_date)}</span>
                    <span class="airing-card-title">${safeTitle}</span>
                    ${epLabel}
                </a>`;
        }).join('');
    },

    removeFromHistory(id, type) {
        if (id == null) return;
        const targetId = String(id);
        this.state.history = (this.state.history || []).filter(item => {
            const idMatch = String(item.id) === targetId;
            const typeMatch = !type || item.type === type || item.media_type === type;
            return !(idMatch && typeMatch);
        });
        this.writeLocalList('alexandria_history', this.state.history);
        this.renderHistory();
        if (this.state.view === 'history') {
            this.renderHistoryPage();
        }
        this.showToast('Removed from continue watching');
    },

    async renderFiltered(type) {
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg">LOADING SECTORS...</div>';
        try {
            const [popData, topData, actData, horData, sciData] = await Promise.all([
                this.getJson(type + '/popular'),
                this.getJson(type + '/top_rated'),
                this.getJson('discover/' + type + '?with_genres=' + (type === 'movie' ? '28' : '10759')),
                this.getJson('discover/' + type + '?with_genres=27'),
                this.getJson('discover/' + type + '?with_genres=878')
            ]);
            if (token !== this._renderToken) return;

            const featured = popData.results?.[0];
            const heroBackdrop = featured?.backdrop_path ? this.imageUrl(featured.backdrop_path, 'original') : '';
            const isMovie = type === 'movie';

            this.main.innerHTML = `
                <section class="filtered-view">
                    <div class="hero-featured" style="--hero-image: url('${heroBackdrop}')">
                        <div class="featured-content">
                            <span class="trending-badge">${isMovie ? 'FEATURED MOVIE' : 'FEATURED SHOW'}</span>
                            <h1>${this.escapeHtml(featured ? (featured.title || featured.name) : (isMovie ? 'MOVIES' : 'TV SHOWS'))}</h1>
                            <p>${this.escapeHtml(featured?.overview || 'Explore popular movies and TV shows.')}</p>
                            <div class="category-hero-actions">
                                ${featured ? `<button class="btn-primary" onclick="Alexandria.playContent(${featured.id}, '${type}')"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> WATCH NOW</button>
                                <button class="btn-secondary" onclick="window.location.hash = '#details/${type}/${featured.id}'">DETAILS</button>` : ''}
                            </div>
                        </div>
                        <div class="sector-widget">
                            <div class="sector-widget-content">
                                <span class="sector-label">${isMovie ? 'POPULAR MOVIES' : 'POPULAR SHOWS'}</span>
                                <h4>${isMovie ? 'Browse Movies' : 'Browse TV Shows'}</h4>
                                <p>${isMovie ? 'Blockbusters, Classics & Indies' : 'Full Seasons & Popular Series'}</p>
                            </div>
                        </div>
                    </div>
                    <div class="view-section"><h3>Popular Now</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="pop-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Top Rated</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="top-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Action & Adventure</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="action-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Horror Archives</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="horror-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Sci-Fi & Fantasy</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="sci-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                </section>`;
            
            this.renderResults(popData.results, 'pop-results');
            this.renderResults(topData.results, 'top-results');
            this.renderResults(actData.results, 'action-results');
            this.renderResults(horData.results, 'horror-results');
            this.renderResults(sciData.results, 'sci-results');
        } catch (error) {
            console.error("Alexandria Protocol: Filter Scout Failed -", error);
            if (token === this._renderToken) this.renderError('This section could not load', error.message, this.state.view);
        }
    },

    async renderAnime() {
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg">SCANNING ANIME FREQUENCIES...</div>';
        try {
            const [sData, seData, fData, dData] = await Promise.all([
                this.getJson('discover/tv?with_genres=16&with_keywords=210024&sort_by=popularity.desc'),
                this.getJson('discover/tv?with_genres=16&with_keywords=210024&vote_average.gte=8'),
                this.getJson('discover/tv?with_genres=16,14&with_keywords=210024'),
                this.getJson('discover/tv?with_genres=16,18&with_keywords=210024')
            ]);
            if (token !== this._renderToken) return;

            const featured = sData.results?.[0];
            const heroBackdrop = featured?.backdrop_path ? this.imageUrl(featured.backdrop_path, 'original') : '';

            this.main.innerHTML = `
                <section class="filtered-view">
                    <div class="hero-featured" style="--hero-image: url('${heroBackdrop}')">
                        <div class="featured-content">
                            <span class="trending-badge">FEATURED ANIME</span>
                            <h1>${this.escapeHtml(featured ? (featured.name || featured.title) : 'ANIME VAULT')}</h1>
                            <p>${this.escapeHtml(featured?.overview || 'Explore Japanese animation, fantasy sagas, and action series.')}</p>
                            <div class="category-hero-actions">
                                ${featured ? `<button class="btn-primary" onclick="Alexandria.playContent(${featured.id}, 'tv')"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> WATCH NOW</button>
                                <button class="btn-secondary" onclick="window.location.hash = '#details/tv/${featured.id}'">DETAILS</button>` : ''}
                            </div>
                        </div>
                        <div class="sector-widget">
                            <div class="sector-widget-content">
                                <span class="sector-label">ANIME VAULT</span>
                                <h4>Browse Anime</h4>
                                <p>Subbed & Dubbed Series</p>
                            </div>
                        </div>
                    </div>
                    <div class="view-section"><h3>Trending Anime</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="anime-trending"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Top Rated Masterpieces</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="anime-top"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Epic Fantasy Anime</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="anime-fantasy"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Intense Drama Anime</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="anime-drama"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                </section>`;
            
            this.renderResults(sData.results, 'anime-trending');
            this.renderResults(seData.results, 'anime-top');
            this.renderResults(fData.results, 'anime-fantasy');
            this.renderResults(dData.results, 'anime-drama');
        } catch (error) {
            console.error("Alexandria Protocol: Anime Scout Failed -", error);
            if (token === this._renderToken) this.renderError('Anime frequencies are unavailable', error.message, 'anime');
        }
    },


    async renderFranchises() {
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING FRANCHISE ARCHIVES...</div>';

        const franchises = [
            { name: 'Marvel Cinematic Universe', movieIds: [1726, 1724, 10138, 10195, 1771, 24428, 68721, 76338, 100402, 118340, 99861, 102899, 271110, 284052, 283995, 315635, 284053, 284054, 299536, 363088, 299537, 299534, 429617, 497698, 566525, 524434, 634649, 453395, 616037, 505642, 640146, 447365, 609681, 533535], accent: '#e23636', subtitle: 'The Infinity Saga & Beyond', genre: 'Superhero' },
            { name: 'Transformers', movieIds: [1858, 8373, 38356, 91314, 335988, 424783, 667538, 698687], accent: '#0070f3', subtitle: 'More Than Meets the Eye', genre: 'Action' },
            { name: 'Star Wars', collectionId: 10, accent: '#FFE81F', subtitle: 'A Galaxy Far, Far Away', genre: 'Sci-Fi' },
            { name: 'Harry Potter', collectionId: 1241, accent: '#946B2D', subtitle: 'The Wizarding World', genre: 'Fantasy' },
            { name: 'The Lord of the Rings', collectionId: 119, accent: '#C9A84C', subtitle: 'One Ring to Rule Them All', genre: 'Fantasy' },
            { name: 'DC Extended Universe', movieIds: [49521, 209112, 297761, 297762, 141052, 297802, 287947, 460465, 464052, 791373, 436969, 436270, 594767, 298618, 565770, 572802], accent: '#0078D7', subtitle: 'Gods Among Us', genre: 'Superhero' },
            { name: 'The Walking Dead Universe', tvIds: [1402, 62286, 94305, 194583, 211684, 206586], accent: '#4a7c3f', subtitle: 'Fight the Dead. Fear the Living.', isTv: true, genre: 'Horror' },
            { name: 'Fast & Furious', collectionId: 9485, accent: '#FF6B00', subtitle: 'Family. No Matter What.', genre: 'Action' },
            { name: 'Jurassic Park', collectionId: 328, accent: '#2E8B57', subtitle: 'Life Finds a Way', genre: 'Sci-Fi' },
            { name: 'The Hunger Games', collectionId: 131635, accent: '#C4151C', subtitle: 'May The Odds Be Ever In Your Favor', genre: 'Sci-Fi' },
            { name: 'Pirates of the Caribbean', collectionId: 295, accent: '#8B6914', subtitle: 'Not All Treasure Is Silver and Gold', genre: 'Adventure' },
            { name: 'The Conjuring Universe', collectionId: 313086, accent: '#7a1f1f', subtitle: 'Based on the True Case Files of the Warrens', genre: 'Horror' },
            { name: 'Saw', collectionId: 656, accent: '#8d9aa6', subtitle: 'Live or Die, Make Your Choice', genre: 'Horror' },
            { name: 'Scream', collectionId: 2602, accent: '#ff1744', subtitle: "What's Your Favorite Scary Movie?", genre: 'Horror' },
            { name: 'Halloween', collectionId: 91361, accent: '#ff8f00', subtitle: 'The Night He Came Home', genre: 'Horror' },
            { name: 'Friday the 13th', collectionId: 9735, accent: '#1b5e20', subtitle: 'Welcome to Crystal Lake', genre: 'Horror' },
            { name: 'A Nightmare on Elm Street', collectionId: 8581, accent: '#8e24aa', subtitle: "One, Two, Freddy's Coming for You", genre: 'Horror' },
            { name: 'The Evil Dead', collectionId: 1960, accent: '#795548', subtitle: 'Dead by Dawn', genre: 'Horror' },
            { name: 'Alien', collectionId: 8091, accent: '#00c853', subtitle: 'In Space No One Can Hear You Scream', genre: 'Sci-Fi' },
            { name: 'Predator', collectionId: 399, accent: '#ffb300', subtitle: 'If It Bleeds, We Can Kill It', genre: 'Sci-Fi' },
            { name: 'Final Destination', collectionId: 8864, accent: '#546e7a', subtitle: "You Can't Cheat Death", genre: 'Horror' },
            { name: 'Paranormal Activity', collectionId: 41437, accent: '#283593', subtitle: 'What Happens When You Sleep?', genre: 'Horror' },
            { name: 'Insidious', collectionId: 228446, accent: '#d32f2f', subtitle: "It's Not the House That's Haunted", genre: 'Horror' },
            { name: 'The Matrix', collectionId: 2344, accent: '#00e676', subtitle: 'There Is No Spoon', genre: 'Sci-Fi' },
            { name: 'Mission: Impossible', collectionId: 87359, accent: '#1e88e5', subtitle: 'Your Mission, Should You Choose to Accept It', genre: 'Action' },
            // --- added with the genre/sort pass ---
            { name: 'John Wick', collectionId: 404609, accent: '#e5c27e', subtitle: 'With Pencil. With a Fucking Pencil.', genre: 'Action' },
            { name: 'James Bond', collectionId: 645, accent: '#aeb6bf', subtitle: 'Licensed to Kill', genre: 'Action' },
            { name: 'Indiana Jones', collectionId: 84, accent: '#8b5a2b', subtitle: 'Snakes. Why Did It Have to Be Snakes?', genre: 'Adventure' },
            { name: 'Dune', collectionId: 726871, accent: '#d4a33c', subtitle: 'Fear Is the Mind-Killer', genre: 'Sci-Fi' },
            { name: 'Mad Max', collectionId: 8945, accent: '#e0662e', subtitle: 'Witness Me!', genre: 'Action' },
            { name: 'Breaking Bad Universe', tvIds: [1396, 60059], accent: '#1b7f3a', subtitle: 'I Am the One Who Knocks', isTv: true, genre: 'Crime' },
            { name: 'The Witcher', tvIds: [71912, 106541], accent: '#8e6b3f', subtitle: 'Toss a Coin to Your Witcher', isTv: true, genre: 'Fantasy' },
            { name: 'The Boys', tvIds: [76479, 205715], accent: '#4a4a6a', subtitle: 'Fuck the Seven. Fuck Homelander.', isTv: true, genre: 'Superhero' }
        ];

        try {
            const FRANCHISE_CACHE_KEY = 'alexandria_franchise_cache_v5';
            let cached = null;
            try {
                cached = this.readStorageJson(sessionStorage, FRANCHISE_CACHE_KEY, null);
            } catch {
                cached = null;
            }

            const fetchCollection = async (franchise) => {
                if (franchise.tvIds || franchise.isTv) {
                    const results = await this.mapWithConcurrency(franchise.tvIds || [], 6, async (id) => {
                        try {
                            const data = await this.getJson('tv/' + id);
                            return { ...data, media_type: 'tv' };
                        } catch { return null; }
                    });
                    return { ...franchise, items: results.filter(Boolean) };
                }
                if (franchise.movieIds) {
                    const results = await this.mapWithConcurrency(franchise.movieIds, 6, async (id) => {
                        try {
                            const data = await this.getJson('movie/' + id);
                            return { ...data, media_type: 'movie' };
                        } catch { return null; }
                    });
                    const sorted = results.filter(Boolean).sort(
                        (a, b) => new Date(a.release_date || '9999') - new Date(b.release_date || '9999')
                    );
                    return { ...franchise, items: sorted };
                }
                try {
                    const data = await this.getJson('collection/' + franchise.collectionId);
                    const sorted = (data.parts || []).sort(
                        (a, b) => new Date(a.release_date || '9999') - new Date(b.release_date || '9999')
                    );
                    return { ...franchise, items: sorted };
                } catch {
                    return { ...franchise, items: [] };
                }
            };

            const results = (cached?.at && Date.now() - cached.at < 15 * 60 * 1000 && Array.isArray(cached.results) && cached.results.length)
                ? cached.results
                : await Promise.all(franchises.map(fetchCollection));

            if (!(cached?.at && Date.now() - cached.at < 15 * 60 * 1000 && Array.isArray(cached.results) && cached.results.length)) {
                try {
                    sessionStorage.setItem(FRANCHISE_CACHE_KEY, JSON.stringify({ at: Date.now(), results }));
                } catch { /* quota */ }
            }

            if (token !== this._renderToken) return;
            if (!results.some(franchise => franchise.items.length)) {
                throw new Error('No franchise collections were returned.');
            }

            this.state.franchiseResults = results;
            this.renderFranchiseGrid(results);
        } catch (error) {
            console.error("Alexandria: Franchise Archive Load Failed -", error);
            if (token === this._renderToken) this.renderError('Franchise archives are unavailable', error.message, 'franchises');
        }
    },

    renderFranchiseGrid(results) {
        const genre = this.state.franchiseGenre || 'All';
        const sort = this.state.franchiseSort || 'az';
        const genres = ['All'].concat([...new Set(results.filter(f => f.items.length && f.genre).map(f => f.genre))]);
        let visible = results.filter(f => f.items.length && (genre === 'All' || f.genre === genre));
        visible = visible.slice().sort((a, b) => a.name.localeCompare(b.name));
        if (sort === 'za') visible.reverse();
        else if (sort === 'count') visible.sort((a, b) => b.items.length - a.items.length);

        this.main.innerHTML = `
                <section class="filtered-view franchise-section">
                    <div class="franchise-page-header">
                        <h2>FRANCHISE ARCHIVES</h2>
                        <p style="color:var(--text-muted);font-family:var(--font-display);letter-spacing:2px">CINEMATIC UNIVERSES & LEGENDARY SAGAS</p>
                    </div>
                    <div class="franchise-toolbar">
                        <div class="franchise-chips" role="group" aria-label="Filter franchises by genre">
                            ${genres.map(g => `<button type="button" class="franchise-chip${g === genre ? ' active' : ''}" onclick="Alexandria.setFranchiseGenre('${this.escapeHtml(g)}')">${this.escapeHtml(g)}</button>`).join('')}
                        </div>
                        <label class="franchise-sort">
                            <span class="sr-only">Sort franchises</span>
                            <select onchange="Alexandria.setFranchiseSort(this.value)">
                                <option value="az"${sort === 'az' ? ' selected' : ''}>A &rarr; Z</option>
                                <option value="za"${sort === 'za' ? ' selected' : ''}>Z &rarr; A</option>
                                <option value="count"${sort === 'count' ? ' selected' : ''}>Most Titles</option>
                            </select>
                        </label>
                    </div>
                    <div class="franchise-grid">
                    ${visible.map((f, i) => {
                        if (!f.items.length) return '';
                        const poster = this.imageUrl(f.items[0].poster_path, 'w342');
                        const safeName = this.escapeHtml(f.name);
                        return `
                    <article class="franchise-tile">
                        <div class="franchise-tile-cover">
                            <button class="franchise-tile-toggle" type="button" aria-expanded="false" aria-controls="franchise-panel-${i}" onclick="Alexandria.toggleFranchise(this)">
                                ${poster ? `<img class="franchise-tile-poster" src="${poster}" alt="${safeName}" loading="lazy" decoding="async">` : `<div class="franchise-tile-placeholder" aria-hidden="true"><span>A</span></div>`}
                                <span class="franchise-tile-scrim" aria-hidden="true"></span>
                                <span class="franchise-tile-count">${f.items.length}</span>
                                ${f.genre ? `<span class="franchise-tile-genre">${this.escapeHtml(f.genre)}</span>` : ''}
                                <span class="franchise-tile-name">${safeName}</span>
                            </button>
                            <button class="franchise-tile-arrow" type="button" aria-expanded="false" aria-label="Expand ${safeName}" onclick="Alexandria.toggleFranchise(this)">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        </div>
                        <div class="franchise-tile-panel" id="franchise-panel-${i}">
                            <div class="franchise-panel-header">
                                <span class="franchise-panel-bar" style="background:${f.accent}" aria-hidden="true"></span>
                                <span class="franchise-panel-name">${safeName}</span>
                                <span class="franchise-panel-quote">&ldquo;${this.escapeHtml(f.subtitle)}&rdquo;</span>
                                <button class="franchise-panel-close" type="button" aria-label="Collapse ${safeName}" onclick="Alexandria.toggleFranchise(this)">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                            <div class="franchise-deck">
                                <div class="franchise-deck-scroller">
                                    <div class="franchise-deck-first" id="franchise-first-${i}"></div>
                                    <div class="franchise-deck-rest" id="franchise-rest-${i}"></div>
                                </div>
                            </div>
                        </div>
                    </article>`; }).join('')}
                    </div>
                </section>`;

        visible.forEach((f, i) => {
            if (f.items.length > 0) {
                this.renderResults([f.items[0]], `franchise-first-${i}`);
                if (f.items.length > 1) {
                    this.renderResults(f.items.slice(1), `franchise-rest-${i}`);
                }
            }
        });
    },

    setFranchiseGenre(genre) {
        // Clicking the active chip again clears the filter back to All.
        this.state.franchiseGenre = this.state.franchiseGenre === genre ? 'All' : genre;
        if (this.state.franchiseResults) this.renderFranchiseGrid(this.state.franchiseResults);
    },

    setFranchiseSort(value) {
        this.state.franchiseSort = value;
        if (this.state.franchiseResults) this.renderFranchiseGrid(this.state.franchiseResults);
    },

    toggleFranchise(btn) {
        const tile = btn.closest('.franchise-tile');
        if (!tile) return;
        // Clicking the already-open tile collapses it.
        if (tile.classList.contains('open')) {
            this.setFranchiseOpen(tile, false);
            return;
        }
        // Enforce a cap so the grid never gets visually cluttered: close the
        // oldest-open tiles to make room before expanding the new one.
        const openTiles = Array.from(tile.parentElement.querySelectorAll('.franchise-tile.open'));
        const MAX_OPEN = 2;
        while (openTiles.length >= MAX_OPEN) {
            this.setFranchiseOpen(openTiles.shift(), false);
        }
        this.setFranchiseOpen(tile, true);
    },
    setFranchiseOpen(tile, open) {
        tile.classList.toggle('open', open);
        // Pull the expanded tile to the top row; cleared when it collapses.
        tile.style.order = open ? '-1' : '';
        tile.querySelectorAll('[aria-expanded]').forEach(el => el.setAttribute('aria-expanded', String(open)));
        const rest = tile.querySelector('.franchise-deck-rest');
        if (rest) {
            // Measure the natural width of the hidden cards so the slide-out is
            // smooth and exact for any franchise size.
            rest.style.width = open ? `${rest.scrollWidth}px` : '0px';
        }
    },


    renderSearch() {
        const discoverPanel = this.state.searchFilter === 'person' ? `
                    <div class="placeholder-msg" style="padding: 0.5rem 0; min-height: 0;">Search actors, directors, and creators above.</div>
                ` : `
                    <div class="discover-panel minimalist-discover">
                        <div class="filter-group">
                            <label class="sr-only" for="discover-genre">Genre</label>
                            <select id="discover-genre" class="compact-select" onchange="Alexandria.executeDiscover()">
                                ${this.genreOptionsHtml()}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label class="sr-only" for="discover-sort">Sort By</label>
                            <select id="discover-sort" class="compact-select" onchange="Alexandria.executeDiscover()">
                                <option value="popularity.desc">Most Popular</option>
                                <option value="vote_average.desc">Highest Rated</option>
                                <option value="${this.state.searchFilter === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc'}">Newest Releases</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label class="sr-only" for="discover-year">Year</label>
                            <input type="number" id="discover-year" class="compact-input" placeholder="Year (e.g. 2024)" min="1900" max="2030" onchange="Alexandria.executeDiscover()">
                        </div>
                        <div class="filter-group">
                            <label class="sr-only" for="discover-rating">Minimum Rating</label>
                            <select id="discover-rating" class="compact-select" onchange="Alexandria.executeDiscover()">
                                <option value="0">ANY</option>
                                <option value="5">5+ STARS</option>
                                <option value="6">6+ STARS</option>
                                <option value="7">7+ STARS</option>
                                <option value="8">8+ STARS</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label class="sr-only" for="discover-votes">Minimum Votes</label>
                            <select id="discover-votes" class="compact-select" onchange="Alexandria.executeDiscover()">
                                <option value="0">ANY VOTES</option>
                                <option value="100">100+ VOTES</option>
                                <option value="200">200+ VOTES</option>
                                <option value="500">500+ VOTES</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label class="sr-only" for="discover-runtime">Max Runtime</label>
                            <input type="number" id="discover-runtime" class="compact-input" placeholder="MAX MIN" min="30" max="400" onchange="Alexandria.executeDiscover()">
                        </div>
                        <div class="filter-group">
                            <button type="button" class="roulette-btn" onclick="Alexandria.openRouletteModal()">Roulette</button>
                        </div>
                    </div>
                `;

        this.main.innerHTML = `
            <section class="search-view modern-search">
                <div class="search-header-sticky">
                    <div class="search-input-container">
                        <svg class="search-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <label class="sr-only" for="tmdb-search">Search titles, actors, genres</label>
                        <input type="search" id="tmdb-search" placeholder="Search titles, actors, genres..." autocomplete="off">
                        <button class="clear-search" id="clear-search-btn" type="button" aria-label="Clear search" style="display:none" onclick="document.getElementById('tmdb-search').value=''; Alexandria.handleSearchInput();">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div class="search-toolbar-row">
                        <div class="search-filters" aria-label="Search type">
                            <button class="filter-btn ${this.state.searchFilter === 'multi' ? 'active' : ''}" type="button" aria-pressed="${this.state.searchFilter === 'multi'}" onclick="Alexandria.setSearchFilter('multi')">All</button>
                            <button class="filter-btn ${this.state.searchFilter === 'movie' ? 'active' : ''}" type="button" aria-pressed="${this.state.searchFilter === 'movie'}" onclick="Alexandria.setSearchFilter('movie')">Movies</button>
                            <button class="filter-btn ${this.state.searchFilter === 'tv' ? 'active' : ''}" type="button" aria-pressed="${this.state.searchFilter === 'tv'}" onclick="Alexandria.setSearchFilter('tv')">TV Shows</button>
                            <button class="filter-btn ${this.state.searchFilter === 'person' ? 'active' : ''}" type="button" aria-pressed="${this.state.searchFilter === 'person'}" onclick="Alexandria.setSearchFilter('person')">People</button>
                        </div>
                        <div id="search-discover" class="search-discover">${discoverPanel}</div>
                    </div>
                </div>
                <div class="results-grid" id="search-results"></div>
            </section>
        `;
        
        const searchInput = document.getElementById('tmdb-search');
        searchInput.placeholder = this.state.searchFilter === 'person'
            ? 'Search actors, directors, creators...'
            : 'Search titles, actors, genres...';
        searchInput.addEventListener('input', () => this.handleSearchInput());
        
        if (this.state.searchQuery) {
            searchInput.value = this.state.searchQuery;
            document.getElementById('clear-search-btn').style.display = 'block';
            this.setDiscoverVisible(false);
            this.executeSearch(this.state.searchQuery);
        } else {
            setTimeout(() => searchInput.focus(), 100);
            this.setDiscoverVisible(true);
            if (this.state.searchFilter !== 'person') {
                setTimeout(() => this.executeDiscover(), 150);
            }
        }
    },

    setDiscoverVisible(visible) {
        const discover = document.getElementById('search-discover');
        if (discover) discover.hidden = !visible;
    },

    handleSearchInput() {
        const queryField = document.getElementById('tmdb-search');
        const clearBtn = document.getElementById('clear-search-btn');
        const query = queryField.value;

        clearBtn.style.display = query.trim() ? 'block' : 'none';

        if (this.state.searchTimeout) clearTimeout(this.state.searchTimeout);

        if (!query.trim()) {
            this.state.searchQuery = '';
            this.setDiscoverVisible(true);
            const container = document.getElementById('search-results');
            if (container) container.innerHTML = '';
            if (this.state.searchFilter !== 'person') {
                this.executeDiscover();
            }
        } else {
            this.state.searchQuery = query;
            this.setDiscoverVisible(false);
            this.state.searchTimeout = setTimeout(() => {
                this.executeSearch(query);
            }, 500);
        }
    },

    setSearchFilter(filter) {
        this.state.searchFilter = filter;
        this.renderSearch();
    },

    async executeDiscover() {
        if (this.state.searchFilter === 'person') {
            const container = document.getElementById('search-results');
            if (container) container.innerHTML = '';
            this.setDiscoverVisible(true);
            return;
        }
        const container = document.getElementById('search-results');
        if (!container) return;
        const requestId = (this._searchRequestId || 0) + 1;
        this._searchRequestId = requestId;

        const genre = document.getElementById('discover-genre')?.value;
        const sort = document.getElementById('discover-sort')?.value || 'popularity.desc';
        const year = document.getElementById('discover-year')?.value;
        const rating = Number(document.getElementById('discover-rating')?.value) || 0;
        const votes = Number(document.getElementById('discover-votes')?.value) || 0;
        const runtime = document.getElementById('discover-runtime')?.value;
        const type = this.state.searchFilter === 'tv' ? 'tv' : 'movie';

        this.setDiscoverVisible(true);
        container.innerHTML = '<div class="search-loading"><div class="elegant-spinner"></div></div>';

        try {
            const params = [`sort_by=${sort}`];
            if (genre) params.push(`with_genres=${genre}`);
            if (year) params.push(type === 'movie' ? `primary_release_year=${year}` : `first_air_date_year=${year}`);
            if (rating > 0) params.push(`vote_average.gte=${rating}`);
            const minVotes = Math.max(votes, sort.includes('vote_average') ? 200 : 0);
            if (minVotes > 0) params.push(`vote_count.gte=${minVotes}`);
            if (type === 'movie' && runtime) params.push(`with_runtime.lte=${runtime}`);
            let endpoint = `discover/${type}?${params.join('&')}`;
            if (endpoint.length > 480) {
                for (const prefix of ['with_runtime', 'vote_count']) {
                    if (endpoint.length <= 480) break;
                    if (params[params.length - 1].startsWith(prefix)) {
                        params.pop();
                        endpoint = `discover/${type}?${params.join('&')}`;
                    }
                }
            }

            const data = await this.getJson(endpoint);
            if (requestId !== this._searchRequestId || !document.body.contains(container)) return;

            const results = data.results || [];
            results.forEach(r => r.media_type = type);

            container.innerHTML = '';
            this.renderResults(results, 'search-results');
        } catch (e) {
            console.error("Alexandria Protocol: Discover Failed -", e);
            if (requestId === this._searchRequestId && document.body.contains(container)) {
                container.innerHTML = '<div class="placeholder-msg">DISCOVER SIGNAL INTERRUPTED.</div>';
            }
        }
    },

    async surpriseMe() {
        this.openRouletteModal();
    },

    openRouletteModal() {
        let modal = document.getElementById('roulette-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'roulette-modal';
            modal.className = 'roulette-modal-overlay';
            modal.setAttribute('hidden', '');
            modal.onclick = (event) => { if (event.target === modal) this.closeRouletteModal(); };
            modal.innerHTML = `
                <div class="roulette-modal-card">
                    <button class="auth-close-btn" type="button" onclick="Alexandria.closeRouletteModal()">✕</button>
                    <div id="roulette-modal-body"></div>
                </div>`;
            document.body.appendChild(modal);
        }
        modal.removeAttribute('hidden');
        this.renderRouletteModal();
    },

    closeRouletteModal() {
        const modal = document.getElementById('roulette-modal');
        if (modal) modal.setAttribute('hidden', '');
    },

    renderRouletteModal() {
        const body = document.getElementById('roulette-modal-body');
        if (!body) return;
        const r = this.state.roulette = this.state.roulette || { type: 'movie', genre: '', rating: 0, votes: 0, runtime: '', yearFrom: '', yearTo: '' };
        const genres = r.type === 'tv' ? this._tvGenres : this._movieGenres;
        if (r.genre && !genres.some(([value]) => String(value) === String(r.genre))) r.genre = '';
        const ratingOptions = [[0, 'ANY'], [5, '5+ STARS'], [6, '6+ STARS'], [7, '7+ STARS'], [8, '8+ STARS']];
        const genreOptions = genres.map(([value, label]) => `<option value="${value}" ${String(value) === String(r.genre) ? 'selected' : ''}>${label}</option>`).join('');
        const ratingOptionsHtml = ratingOptions.map(([value, label]) => `<option value="${value}" ${Number(value) === Number(r.rating) ? 'selected' : ''}>${label}</option>`).join('');

        body.innerHTML = `
            <h2 class="roulette-title">Roulette</h2>
            <div class="roulette-type-toggle">
                <button type="button" class="roulette-type-btn ${r.type === 'movie' ? 'active' : ''}" onclick="Alexandria.setRouletteType('movie')">MOVIE</button>
                <button type="button" class="roulette-type-btn ${r.type === 'tv' ? 'active' : ''}" onclick="Alexandria.setRouletteType('tv')">TV</button>
            </div>
            <div class="roulette-controls">
                <div>
                    <label class="roulette-label" for="roulette-genre">Genre</label>
                    <select id="roulette-genre" class="compact-select roulette-control">${genreOptions}</select>
                </div>
                <div>
                    <label class="roulette-label" for="roulette-rating">Min Rating</label>
                    <select id="roulette-rating" class="compact-select roulette-control">${ratingOptionsHtml}</select>
                </div>
                <div>
                    <label class="roulette-label" for="roulette-year-from">Year From</label>
                    <input type="number" id="roulette-year-from" class="compact-input roulette-control" min="1900" max="2030" placeholder="ANY" value="${this.escapeHtml(String(r.yearFrom || ''))}">
                </div>
                <div>
                    <label class="roulette-label" for="roulette-year-to">Year To</label>
                    <input type="number" id="roulette-year-to" class="compact-input roulette-control" min="1900" max="2030" placeholder="ANY" value="${this.escapeHtml(String(r.yearTo || ''))}">
                </div>
                ${r.type === 'movie' ? `
                <div>
                    <label class="roulette-label" for="roulette-runtime">Max Runtime</label>
                    <input type="number" id="roulette-runtime" class="compact-input roulette-control" min="30" max="400" placeholder="MAX MIN" value="${this.escapeHtml(String(r.runtime || ''))}">
                </div>` : ''}
            </div>
            <button type="button" class="roulette-spin-btn" onclick="Alexandria.spinRoulette()">SPIN THE WHEEL</button>
            <div id="roulette-result"></div>
        `;
    },

    setRouletteType(t) {
        const r = this.state.roulette = this.state.roulette || { type: 'movie', genre: '', rating: 0, votes: 0, runtime: '', yearFrom: '', yearTo: '' };
        r.type = t === 'tv' ? 'tv' : 'movie';
        this._rouletteSpinId = (this._rouletteSpinId || 0) + 1;
        this.renderRouletteModal();
    },

    async spinRoulette() {
        const r = this.state.roulette = this.state.roulette || { type: 'movie', genre: '', rating: 0, votes: 0, runtime: '', yearFrom: '', yearTo: '' };
        const read = id => document.getElementById(id)?.value || '';
        r.genre = read('roulette-genre');
        r.rating = Number(read('roulette-rating')) || 0;
        r.runtime = read('roulette-runtime');
        r.yearFrom = read('roulette-year-from');
        r.yearTo = read('roulette-year-to');
        const type = r.type;

        this._rouletteSpinId = (this._rouletteSpinId || 0) + 1;
        const spin = this._rouletteSpinId;

        const result = document.getElementById('roulette-result');
        if (result) result.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span>SPINNING THE WHEEL...</div>';

        const params = [`sort_by=popularity.desc`, `page=${1 + Math.floor(Math.random() * 15)}`];
        if (r.genre) params.push(`with_genres=${r.genre}`);
        if (r.rating > 0) params.push(`vote_average.gte=${r.rating}`);
        if (r.votes > 0) params.push(`vote_count.gte=${r.votes}`);
        if (type === 'movie' && r.runtime) params.push(`with_runtime.lte=${r.runtime}`);
        if (r.yearFrom) params.push(type === 'movie' ? `primary_release_date.gte=${r.yearFrom}-01-01` : `first_air_date.gte=${r.yearFrom}-01-01`);
        if (r.yearTo) params.push(type === 'movie' ? `primary_release_date.lte=${r.yearTo}-12-31` : `first_air_date.lte=${r.yearTo}-12-31`);
        let endpoint = `discover/${type}?${params.join('&')}`;
        if (endpoint.length > 480 && params[params.length - 1]?.includes('_date.lte=')) {
            params.pop();
            endpoint = `discover/${type}?${params.join('&')}`;
        }

        try {
            const data = await this.getJson(endpoint, { noCache: true });
            const pool = (data.results || []).filter(item => item.id && item.poster_path);
            if (!pool.length) throw new Error('No matches found.');
            const pick = pool[Math.floor(Math.random() * pool.length)];
            const resultEl = document.getElementById('roulette-result');
            if (spin !== this._rouletteSpinId || !resultEl) return;
            const title = pick.title || pick.name || 'Untitled';
            const year = (pick.release_date || pick.first_air_date || '').slice(0, 4);
            const ratingText = Number(pick.vote_average || 0).toFixed(1);
            const poster = this.imageUrl(pick.poster_path, 'w342');
            const overview = (pick.overview || '').slice(0, 240);
            const watchItem = { id: pick.id, type: type, title: title, poster_path: pick.poster_path || '' };
            resultEl.innerHTML = `
                <div class="roulette-result">
                    <img class="roulette-result-poster" src="${this.escapeHtml(poster)}" alt="${this.escapeHtml(title)} poster" loading="lazy">
                    <div class="roulette-result-info">
                        <span class="roulette-rating-badge">★ ${ratingText}</span>
                        <h3>${this.escapeHtml(title)}</h3>
                        ${year ? `<p class="roulette-result-meta">${this.escapeHtml(year)}</p>` : ''}
                        <p class="roulette-result-overview">${this.escapeHtml(overview)}</p>
                        <div class="roulette-result-btns">
                            <button type="button" class="btn-primary" onclick="Alexandria.closeRouletteModal(); window.location.hash = '#details/${type}/${pick.id}'">PLAY NOW</button>
                            <button type="button" class="btn-secondary" onclick="Alexandria.toggleWatchlist(${this.escapeHtml(JSON.stringify(watchItem))})">WATCHLIST</button>
                            <button type="button" class="btn-secondary" onclick="Alexandria.spinRoulette()">SPIN AGAIN</button>
                        </div>
                    </div>
                </div>`;
        } catch (error) {
            const resultEl = document.getElementById('roulette-result');
            if (spin === this._rouletteSpinId && resultEl) {
                resultEl.innerHTML = `
                    <div class="placeholder-msg">WHEEL JAMMED — TRY AGAIN</div>
                    <button type="button" class="roulette-retry-btn" onclick="Alexandria.spinRoulette()">RETRY</button>`;
            }
        }
    },

    async executeSearch(query) {
        if (!query) return;
        const container = document.getElementById('search-results');
        if (!container) return;
        const requestId = (this._searchRequestId || 0) + 1;
        this._searchRequestId = requestId;
        this.setDiscoverVisible(false);
        container.innerHTML = '<div class="search-loading"><div class="elegant-spinner"></div></div>';

        try {
            const filter = this.state.searchFilter || 'multi';
            const endpoint = `search/${filter}?query=${encodeURIComponent(query)}`;
            const data = await this.getJson(endpoint);
            if (requestId !== this._searchRequestId || !document.body.contains(container)) return;
            const results = data.results || [];

            if (filter === 'person') {
                if (!results.length) {
                    container.innerHTML = `<div class="placeholder-msg">NO PEOPLE FOUND FOR "${this.escapeHtml(query.toUpperCase())}".</div>`;
                    return;
                }
                container.innerHTML = results.map(person => `
                    <article class="movie-card person-result-card" data-id="${Number(person.id)}" data-type="person" role="link" tabindex="0">
                        <div class="poster-wrapper">
                            ${this.imageUrl(person.profile_path, 'w185')
                                ? `<img src="${this.imageUrl(person.profile_path, 'w185')}" alt="${this.escapeHtml(person.name)}" loading="lazy" decoding="async">`
                                : `<div class="poster-placeholder" role="img" aria-label="No photo"><span>A</span><small>NO PHOTO</small></div>`}
                        </div>
                        <div class="card-info">
                            <h3><a class="card-title-link" href="#person/${Number(person.id)}">${this.escapeHtml(person.name || 'Unknown')}</a></h3>
                            <p class="person-known-for-line">${this.escapeHtml(person.known_for_department || 'Talent')}</p>
                        </div>
                    </article>
                `).join('');
                return;
            }

            const filteredResults = results.filter(item => item.media_type !== 'person');

            if (filteredResults.length === 0) {
                 container.innerHTML = `<div class="placeholder-msg">NO ARCHIVE RECORDS FOUND FOR "${this.escapeHtml(query.toUpperCase())}".</div>`;
                 return;
            }

            container.innerHTML = '';
            this.renderResults(filteredResults, 'search-results');
        } catch (e) {
            console.error("Alexandria Protocol: Search Scanner Failed -", e);
            if (requestId === this._searchRequestId && document.body.contains(container)) {
                container.innerHTML = '<div class="inline-error" role="alert">SEARCH SIGNAL INTERRUPTED. <button type="button" data-search-retry>TRY AGAIN</button></div>';
            }
        }
    },

    renderResults(results, containerId, isHistoryRow = false, opts = null) {
        const container = document.getElementById(containerId);
        if (!container || !results) return;
        const wlMode = !!(opts && opts.watchlistMode);

        if (results.length === 0) {
            container.innerHTML = '<div class="placeholder-msg">NO SUPPLIES OR SURVIVORS FOUND.</div>';
            return;
        }

        container.innerHTML = results.map(item => {
            const title = item.title || item.name || 'Untitled';
            const safeTitle = this.escapeHtml(title);
            const itemIdStr = String(item.id);
            const safeItemId = this.escapeHtml(itemIdStr);
            const poster = this.imageUrl(item.poster_path);
            const type = item.media_type === 'tv' || item.media_type === 'movie'
                ? item.media_type
                : (item.type === 'tv' || item.type === 'movie' ? item.type : (item.name && !item.title ? 'tv' : 'movie'));
            const inWatchlist = (this.state.watchlist || []).some(i => String(i.id) === itemIdStr && i.type === type);
            const isAnime = item.isAnime || (item.origin_country && item.origin_country.includes('JP') && item.genre_ids && item.genre_ids.includes(16));
            const wlStatus = wlMode ? (item.status || 'want') : '';
            const watchedCount = wlMode && type === 'tv'
                ? Object.keys(this.state.watchedEpisodes || {}).filter(k => k.startsWith(itemIdStr + '_s')).length
                : 0;

            const badgeHtml = wlMode
                ? (wlStatus === 'watched'
                    ? `<div class="watched-badge">${type === 'tv' ? 'COMPLETE' : 'WATCHED'}</div>`
                    : wlStatus === 'watching' && watchedCount > 0
                        ? `<div class="progress-badge">${watchedCount} EPS SEEN</div>`
                        : (isAnime ? '<div class="anime-badge">SUB/DUB</div>' : ''))
                : (isHistoryRow && type === 'tv' && item.season && item.episode
                    ? `<div class="continue-badge">S${item.season}:E${item.episode}</div>`
                    : (isAnime ? '<div class="anime-badge">SUB/DUB</div>' : ''));

            const dataAttributes = isHistoryRow && type === 'tv' 
                ? `data-season="${item.season}" data-episode="${item.episode}"` 
                : '';
            const target = isHistoryRow && type === 'tv' && item.season && item.episode
                ? `#tv/${safeItemId}/s/${Number(item.season)}/e/${Number(item.episode)}`
                : isHistoryRow && type === 'movie'
                    ? `#movie/${safeItemId}`
                    : `#details/${type}/${safeItemId}`;
            const trailerAttrs = (type === 'movie' || type === 'tv')
                ? ` data-trailer="${safeItemId}" data-trailer-type="${type}"`
                : '';

            return `
                <article class="movie-card" data-id="${safeItemId}" data-type="${type}" data-title="${safeTitle}" data-is-anime="${isAnime}" ${dataAttributes}>
                    <div class="poster-wrapper"${trailerAttrs}>
                        ${poster ? `<img src="${poster}" alt="${safeTitle} poster" loading="lazy" decoding="async">` : `<div class="poster-placeholder" role="img" aria-label="No poster available"><span>A</span><small>NO POSTER</small></div>`}
                        <div class="card-overlay">
                            ${badgeHtml}
                            ${isHistoryRow ? `
                                <button class="remove-history-btn" type="button" aria-label="Remove from continue watching" title="Remove from continue watching" onclick="event.stopPropagation(); event.preventDefault(); Alexandria.removeFromHistory('${safeItemId}', '${type}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            ` : ''}
                            <a class="card-open" href="${target}" aria-label="View ${safeTitle}">
                                <svg class="overlay-play" aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            </a>
                            <button class="log-btn ${inWatchlist ? 'active' : ''}" type="button" aria-label="${inWatchlist ? 'Remove from' : 'Add to'} watchlist" aria-pressed="${inWatchlist}" data-id="${safeItemId}" data-type="${type}" data-title="${safeTitle}" data-poster="${this.escapeHtml(item.poster_path || '')}">
                                ${inWatchlist ? '✓' : '+'}
                            </button>
                            ${wlMode ? `
                                <button class="mark-btn" type="button" aria-label="${wlStatus === 'watched' ? 'Back to queue' : wlStatus === 'watching' ? 'Mark complete' : 'Mark watched'}" title="${wlStatus === 'watched' ? 'Back to queue' : wlStatus === 'watching' ? 'Mark complete' : 'Mark watched'}"
                                    onclick="event.stopPropagation(); event.preventDefault(); Alexandria.setWatchStatus('${safeItemId}', '${type}', '${wlStatus === 'watched' ? 'want' : 'watched'}')">${wlStatus === 'watched' ? '↩' : wlStatus === 'watching' ? '★' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'}</button>
                            ` : ''}
                            ${wlMode && type === 'tv' ? `
                                <button class="ep-toggle-btn" type="button" aria-expanded="false" onclick="event.stopPropagation(); event.preventDefault(); Alexandria.toggleEpPanel('${safeItemId}', this)">EPISODES ▾</button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="card-info">
                        <h3><a class="card-title-link" href="${target}">${safeTitle}</a></h3>
                    </div>
                    <div class="ep-panel" data-panel-show="${safeItemId}" hidden></div>
                </article>`;
        }).join('');
    },

    loadTrailerPreview(w) {
        if (!this._trailerCache) this._trailerCache = {};
        if (this._trailerInflight == null) this._trailerInflight = 0;
        const id = w.dataset.trailer, type = w.dataset.trailerType;
        const cacheKey = type + '_' + id;
        if (this._trailerCache[cacheKey] === false) return;
        if (typeof this._trailerCache[cacheKey] === 'string') {
            w.insertAdjacentHTML('beforeend', trailerFrame(this._trailerCache[cacheKey]));
            return;
        }
        if (this._trailerInflight >= 2) return;
        this._trailerInflight++;
        this.getJson(type + '/' + id + '/videos').then(data => {
            this._trailerInflight--;
            const list = (data.videos && data.videos.results) || data.results || [];
            const v = list.find(x => x.site === 'YouTube' && (x.type === 'Trailer' || x.type === 'Teaser') && x.key && x.key.length >= 6 && x.key.length <= 20 && /^[a-zA-Z0-9_-]+$/.test(x.key));
            this._trailerCache[cacheKey] = v ? v.key : false;
            if (v && w.isConnected && !w.querySelector('.trailer-preview')) w.insertAdjacentHTML('beforeend', trailerFrame(v.key));
        }).catch(() => { this._trailerInflight--; });

        function trailerFrame(key) {
            return '<iframe class="trailer-preview" src="https://www.youtube-nocookie.com/embed/' + key + '?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1" allow="autoplay; encrypted-media" loading="lazy" tabindex="-1" sandbox="allow-scripts allow-same-origin allow-presentation allow-fullscreen"></iframe>';
        }
    },



    scrollCarousel(btn, amount) {
        const wrapper = btn.parentElement.querySelector('.carousel-wrapper');
        if (wrapper) wrapper.scrollBy({left: amount, behavior: 'smooth'});
    },

    toggleBio() {
        const bio = document.getElementById('person-bio');
        const btn = document.getElementById('bio-toggle');
        if (!bio || !btn) return;
        bio.classList.toggle('person-bio-collapsed');
        btn.textContent = bio.classList.contains('person-bio-collapsed') ? 'Read More' : 'Read Less';
    },

    createWatchParty(id, type) {
        if (!this.state.authUser) {
            this.showToast('Please sign in or create an account to start a Watch Party.');
            this.toggleAuthModal(true, 'signup');
            return;
        }
        const roomId = Math.random().toString(36).substring(2, 8);
        this.writeStorage(sessionStorage, 'alexandria_party_creator_' + roomId, '1');
        if (type === 'tv') {
            const saved = this.state.history.find(h => String(h.id) === String(id) && h.type === 'tv');
            const season = Math.max(1, Number.parseInt(saved?.season, 10) || Number.parseInt(this.state.activeContent?.season, 10) || 1);
            const episode = Math.max(1, Number.parseInt(saved?.episode, 10) || Number.parseInt(this.state.activeContent?.episode, 10) || 1);
            window.location.hash = `#party/${roomId}/${type}/${id}/s/${season}/e/${episode}`;
        } else {
            window.location.hash = `#party/${roomId}/${type}/${id}`;
        }
    },

    playContent(id, type, isAnime = false) {
        if (type === 'movie') {
            window.location.hash = `#movie/${id}`;
            return;
        }
        const saved = this.state.history.find(h => String(h.id) === String(id) && h.type === 'tv');
        const season = Math.max(1, Number.parseInt(saved?.season, 10) || 1);
        const episode = Math.max(1, Number.parseInt(saved?.episode, 10) || 1);
        window.location.hash = `#tv/${id}/s/${season}/e/${episode}`;
    },

    async renderDetails() {
        const { id, type } = this.state.activeContent;
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg">DECRYPTING ARCHIVE...</div>';
        
        try {
            const endpoint = `${type}/${id}?append_to_response=credits,aggregate_credits,similar,videos`;
            const data = await this.getJson(endpoint);
            if (token !== this._renderToken) return;
            
            const title = data.title || data.name;
            this.state.detailsTitle = title;
            this.state.detailsPoster = data.poster_path;
            const year = (data.release_date || data.first_air_date || '').split('-')[0];
            const runtime = data.runtime ? `${Math.floor(data.runtime/60)}h ${data.runtime%60}m` : (data.episode_run_time?.[0] ? `${data.episode_run_time[0]}m` : '');
            const tmdbScore = data.vote_average ? data.vote_average.toFixed(1) : null;
            const genres = (data.genres || []).map(g => g.name).join(' • ');
            const backdrop = this.imageUrl(data.backdrop_path, 'original');
            const poster = this.imageUrl(data.poster_path);
            
            const inWatchlist = this.state.watchlist.some(i => String(i.id) === String(id) && i.type === type);
            const wlEntry = this.state.watchlist.find(i => String(i.id) === String(id) && i.type === type);
            const wlStatus = wlEntry ? (wlEntry.status || 'want') : 'want';

            const trailer = data.videos?.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer' && /^[\w-]{6,20}$/.test(v.key));

            // Curate similar titles: exclude the current title, drop poster-less
            // entries, cap the carousel. If TMDB has nothing similar, fall back
            // to a genre-based discovery scan so the section is never empty.
            let similarItems = (data.similar?.results || [])
                .filter(i => i && Number(i.id) !== Number(id) && i.poster_path)
                .slice(0, 20);
            let similarHeading = 'SIMILAR TITLES';
            if (!similarItems.length && data.genres?.length) {
                const genreDiscover = await this.getJson(
                    `discover/${type}?with_genres=${data.genres[0].id}&sort_by=popularity.desc`
                ).catch(() => ({ results: [] }));
                if (token !== this._renderToken) return;
                similarItems = (genreDiscover.results || [])
                    .filter(i => i && Number(i.id) !== Number(id) && i.poster_path)
                    .slice(0, 20);
                similarHeading = 'MORE LIKE THIS';
            }
            
            const castData = data.credits?.cast?.length ? data.credits.cast : (data.aggregate_credits?.cast || []);
            const castHtml = castData.slice(0, 15).map(c => `
                <article class="cast-card" role="link" tabindex="0" onclick="window.location.hash = '#person/${Number(c.id)}'" aria-label="View ${this.escapeHtml(c.name)}">
                    ${this.imageUrl(c.profile_path, 'w185') ? `<img src="${this.imageUrl(c.profile_path, 'w185')}" alt="${this.escapeHtml(c.name)}" loading="lazy" decoding="async">` : '<div class="cast-placeholder" aria-hidden="true">A</div>'}
                    <div class="cast-info">
                        <div class="cast-name">${this.escapeHtml(c.name)}</div>
                        <div class="cast-role">${this.escapeHtml(c.character || c.roles?.[0]?.character || 'Cast')}</div>
                    </div>
                </article>
            `).join('') || '<div class="placeholder-msg">NO CAST DATA</div>';

            this.main.innerHTML = `
                <section class="details-layout">
                    <div class="hero-details" style="--details-image: url('${backdrop}')">
                        <div class="details-content-wrapper">
                            <div class="details-poster">${poster ? `<img src="${poster}" alt="${this.escapeHtml(title)} poster">` : '<div class="poster-placeholder detail-placeholder"><span>A</span><small>NO POSTER</small></div>'}</div>
                            <div class="details-info">
                                <h1>${this.escapeHtml(title)} ${year ? `<span class="year-span">(${this.escapeHtml(year)})</span>` : ''}</h1>
                                <div class="details-meta">
                                    ${this.ratingsHtml(tmdbScore)}
                                    <span class="avg-badge" id="details-avg-badge" hidden></span>
                                    ${runtime ? `<span>${this.escapeHtml(runtime)}</span>` : ''}
                                    ${genres ? `<span>${this.escapeHtml(genres)}</span>` : ''}
                                </div>
                                <p class="details-overview">${this.escapeHtml(data.overview || 'No overview is available yet.')}</p>
                                <div class="details-actions">
                                    <button class="btn-primary play-btn" onclick="Alexandria.playContent(${id}, '${type}')">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> WATCH NOW
                                    </button>
                                    <button class="btn-secondary play-btn" onclick="Alexandria.createWatchParty(${id}, '${type}')" style="margin-left: 10px;">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> WATCH PARTY
                                    </button>
                                    <button class="btn-secondary" type="button" data-share-title="${this.escapeHtml(title)}" onclick="Alexandria.shareCurrent(this.dataset.shareTitle)" style="margin-left: 10px;">SHARE</button>
                                    <button class="btn-secondary" type="button" style="margin-left: 10px;" onclick="Alexandria.addToListModal(${Number(id)}, '${type}')">ADD TO LIST</button>
                                    <button class="icon-btn log-btn ${inWatchlist ? 'active' : ''}" type="button" aria-label="${inWatchlist ? 'Remove from' : 'Add to'} watchlist" aria-pressed="${inWatchlist}" data-id="${Number(id)}" data-type="${type}" data-title="${this.escapeHtml(title)}" data-poster="${this.escapeHtml(data.poster_path || '')}">
                                        ${inWatchlist ? '✓' : '+'}
                                    </button>
                                    ${inWatchlist ? `
                                    <button id="watch-status-btn" class="btn-secondary" type="button" style="margin-left: 10px;" onclick="Alexandria.setWatchStatus(${id}, '${type}', '${wlStatus === 'watched' ? 'want' : 'watched'}')">${wlStatus === 'watched' ? 'BACK TO QUEUE' : wlStatus === 'watching' ? 'MARK COMPLETE' : 'MARK WATCHED'}</button>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="view-section">
                        <h3>TOP CAST</h3>
                        <div class="carousel-container">
                            <button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button>
                            <div class="carousel-wrapper"><div class="cast-grid">${castHtml}</div></div>
                            <button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button>
                        </div>
                    </div>

                    ${trailer ? `
                    <div class="view-section details-trailer-section">
                        <h3>OFFICIAL TRAILER</h3>
                        <div class="trailer-container">
                            <iframe src="https://www.youtube-nocookie.com/embed/${trailer.key}?controls=1&modestbranding=1&rel=0" title="${this.escapeHtml(title)} official trailer" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-fullscreen"></iframe>
                        </div>
                    </div>` : ''}

                    ${similarItems.length ? `
                    <div class="view-section">
                        <h3>${similarHeading}</h3>
                        <div class="carousel-container">
                            <button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button>
                            <div class="carousel-wrapper"><div class="carousel-grid" id="similar-results"></div></div>
                            <button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button>
                        </div>
                    </div>` : ''}

                    <section id="community-section"></section>
                </section>
            `;
            
            if (similarItems.length) {
                similarItems.forEach(item => {
                    if (!item.media_type) item.media_type = type;
                });
                this.renderResults(similarItems, 'similar-results');
            }
            this.renderCommunitySection(type, id);
        } catch(e) {
            console.error("Alexandria Protocol: Details Render Failed", e);
            if (token === this._renderToken) this.renderError('This title could not be decrypted', e.message, 'details');
        }
    },

    async renderPerson() {
        const { id } = this.state.activeContent;
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg">LOCATING DOSSIER...</div>';
        
        try {
            const endpoint = `person/${id}?append_to_response=combined_credits,external_ids`;
            const data = await this.getJson(endpoint);
            if (token !== this._renderToken) return;
            
            const photo = this.imageUrl(data.profile_path, 'h632');

            // Calculate age
            let ageStr = '';
            if (data.birthday) {
                const birth = new Date(data.birthday);
                const end = data.deathday ? new Date(data.deathday) : new Date();
                let age = end.getFullYear() - birth.getFullYear();
                const m = end.getMonth() - birth.getMonth();
                if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age--;
                ageStr = data.deathday ? `Died: ${this.escapeHtml(data.deathday)} (age ${age})` : `Age: ${age}`;
            }

            // Build bio with expand/collapse for long bios
            const rawBio = data.biography || '';
            const bioHtml = this.escapeHtml(rawBio).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
            const longBio = rawBio.length > 600;
            const bioSection = longBio
                ? `<div class="person-bio person-bio-collapsed" id="person-bio">${bioHtml}</div>
                   <button class="bio-toggle" id="bio-toggle" onclick="Alexandria.toggleBio()">Read More</button>`
                : `<div class="person-bio">${bioHtml || 'No biography available.'}</div>`;

            // Categorize credits
            const seenCast = new Set();
            const castCredits = (data.combined_credits?.cast || [])
                .filter(c => {
                    if (!c.poster_path) return false;
                    if (seenCast.has(c.id)) return false;
                    seenCast.add(c.id);
                    return true;
                })
                .sort((a, b) => b.popularity - a.popularity);
            const crewCredits = (data.combined_credits?.crew || [])
                .filter(c => c.poster_path && ['Director', 'Executive Producer', 'Producer', 'Writer', 'Screenplay', 'Creator'].includes(c.job))
                .sort((a, b) => b.popularity - a.popularity);
            // Deduplicate crew by id+job
            const seenCrew = new Set();
            const uniqueCrew = crewCredits.filter(c => {
                const key = `${c.id}-${c.job}`;
                if (seenCrew.has(key)) return false;
                seenCrew.add(key);
                return true;
            });

            // Known For = top 10 most popular across cast + crew, deduplicated
            const seenKnown = new Set();
            const knownFor = [...castCredits, ...uniqueCrew]
                .sort((a, b) => b.popularity - a.popularity)
                .filter(c => { if (seenKnown.has(c.id)) return false; seenKnown.add(c.id); return true; })
                .slice(0, 12);

            // Acting credits chronologically (newest first)
            const actingCredits = castCredits
                .sort((a, b) => new Date(b.release_date || b.first_air_date || '0') - new Date(a.release_date || a.first_air_date || '0'))
                .slice(0, 50);

            this.main.innerHTML = `
                <section class="person-layout">
                    <div class="person-header">
                        ${photo ? `<img src="${photo}" alt="${this.escapeHtml(data.name)}" class="person-photo">` : '<div class="person-photo person-placeholder" aria-hidden="true">A</div>'}
                        <div class="person-info">
                            <h1>${this.escapeHtml(data.name)}</h1>
                            <div class="person-meta">
                                <span>${this.escapeHtml(data.known_for_department || '')}</span>
                                ${data.birthday ? `<span>Born: ${this.escapeHtml(data.birthday)}</span>` : ''}
                                ${ageStr ? `<span>${ageStr}</span>` : ''}
                                ${data.place_of_birth ? `<span>${this.escapeHtml(data.place_of_birth)}</span>` : ''}
                            </div>
                            ${bioSection}
                        </div>
                    </div>
                    
                    ${knownFor.length ? `
                    <div class="view-section">
                        <h3>KNOWN FOR</h3>
                        <div class="carousel-container">
                            <button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button>
                            <div class="carousel-wrapper"><div class="carousel-grid" id="person-known-for"></div></div>
                            <button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button>
                        </div>
                    </div>` : ''}

                    ${actingCredits.length ? `
                    <div class="view-section person-credits-section">
                        <h3>ACTING (${actingCredits.length})</h3>
                        <div class="person-credits-grid" id="person-acting"></div>
                    </div>` : ''}

                    ${uniqueCrew.length ? `
                    <div class="view-section person-credits-section">
                        <h3>DIRECTING & PRODUCING (${uniqueCrew.length})</h3>
                        <div class="person-credits-grid" id="person-crew"></div>
                    </div>` : ''}
                </section>
            `;
            
            if (knownFor.length) this.renderResults(knownFor, 'person-known-for');
            if (actingCredits.length) this.renderResults(actingCredits, 'person-acting');
            if (uniqueCrew.length) this.renderResults(uniqueCrew, 'person-crew');
        } catch(e) {
            console.error("Alexandria Protocol: Person Render Failed", e);
            if (token === this._renderToken) this.renderError('This dossier is unavailable', e.message, 'person');
        }
    },

    // #region Community profiles
    avatarHtml(profile, sizePx = 32) {
        const preset = this.AVATAR_PRESETS.find(p => p.id === profile?.avatar_id);
        const px = Math.max(16, Number(sizePx) || 32);
        if (preset?.img) {
            const src = this.imageUrl(preset.img, 'w185') || '';
            return `<span class="alexandria-avatar" style="width:${px}px;height:${px}px;"><img src="${src}" alt="" loading="lazy" decoding="async"></span>`;
        }
        const content = preset
            ? preset.emoji
            : (profile?.nickname || profile?.username || profile?.email || '?').charAt(0).toUpperCase();
        return `<span class="alexandria-avatar" style="width:${px}px;height:${px}px;font-size:${Math.round(px * 0.5)}px;">${this.escapeHtml(content)}</span>`;
    },

    timeago(iso) {
        if (!iso) return '';
        const then = new Date(iso).getTime();
        if (!Number.isFinite(then)) return '';
        const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
        if (sec < 60) return 'just now';
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min}m ago`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr}h ago`;
        const day = Math.floor(hr / 24);
        if (day < 7) return `${day}d ago`;
        const wk = Math.floor(day / 7);
        if (wk < 5) return `${wk}w ago`;
        const d = new Date(then);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    },

    async fetchProfile(uid) {
        if (!uid) return null;
        this._profileCache = this._profileCache || {};
        if (this._profileCache[uid]) return this._profileCache[uid];
        if (!this.supabase) return null;
        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .select('id, username, username_lower, nickname, bio, fav_genres, avatar_id, created_at')
                .eq('id', uid)
                .maybeSingle();
            if (error && error.code !== 'PGRST116') console.warn("Supabase profile fetch:", error);
            if (data) this._profileCache[uid] = data;
            return data || null;
        } catch {
            return null;
        }
    },

    logActivity(kind, opts = {}) {
        if (!this.supabase || !this.state.authUser) return;
        const { contentId, contentType, title, posterPath, meta } = opts;
        this.supabase.from('activity').insert({
            user_id: this.state.authUser.id,
            kind,
            content_id: contentId ?? null,
            content_type: contentType ?? null,
            title: title ?? null,
            poster_path: posterPath ?? null,
            meta: meta ?? null
        }).then().catch(() => {});
    },

    pruneOldActivity() {
        if (!this.supabase || !this.supabase.from) return;
        // Keep stats-critical rows (watching/rated/reviewed feed the watch
        // hours, streaks, and heatmap); drop everything else after 24h so the
        // community feed stays fresh without losing anyone's numbers.
        const cutoff = new Date(Date.now() - 86400000).toISOString();
        this.supabase
            .from('activity')
            .delete()
            .lt('created_at', cutoff)
            .not('kind', 'in', '("watching","rated","reviewed")')
            .then(res => {
                if (res && res.error) console.warn("Alexandria Protocol: Activity prune failed", res.error);
            })
            .catch(() => {});
    },

    async renderProfile(uid) {
        const targetUid = uid || this.state.activeProfileId;
        if (!targetUid) {
            this.renderError('This profile is unavailable', 'No user id was supplied.', 'home');
            return;
        }
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING PROFILE...</div>';

        const safeQuery = promise => Promise.resolve(promise).catch(() => ({ data: [] }));

        try {
            const me = this.state.authUser?.id;
            const [profile, activityRes, ratingsRes, listsRes] = await Promise.all([
                this.fetchProfile(targetUid),
                this.supabase ? safeQuery(this.supabase.from('activity').select('*').eq('user_id', targetUid).gte('created_at', new Date(Date.now() - 86400000).toISOString()).order('created_at', { ascending: false }).limit(20)) : Promise.resolve({ data: [] }),
                this.supabase ? safeQuery(this.supabase.from('ratings').select('*').eq('user_id', targetUid).order('created_at', { ascending: false }).limit(20)) : Promise.resolve({ data: [] }),
                this.supabase ? safeQuery(this.supabase.from('movie_night_lists').select('*').eq('owner_id', targetUid).order('created_at', { ascending: false })) : Promise.resolve({ data: [] })
            ]);
            if (token !== this._renderToken) return;

            const [followersRes, followingRes, myFollowRes] = this.supabase
                ? await Promise.all([
                    safeQuery(this.supabase.from('follows').select('follower_id').eq('followee_id', targetUid)),
                    safeQuery(this.supabase.from('follows').select('followee_id').eq('follower_id', targetUid)),
                    (me && me !== targetUid)
                        ? Promise.resolve(this.supabase.from('follows').select('follower_id').eq('follower_id', me).eq('followee_id', targetUid).maybeSingle()).catch(() => ({ data: null }))
                        : Promise.resolve({ data: null })
                ])
                : [{ data: [] }, { data: [] }, { data: null }];
            if (token !== this._renderToken) return;

            if (!profile) {
                this.main.innerHTML = '<div class="placeholder-msg">This profile could not be found.</div>';
                return;
            }

            const activity = activityRes.data || [];
            const ratings = ratingsRes.data || [];
            const lists = listsRes.data || [];
            const followers = (followersRes.data || []).length;
            const following = (followingRes.data || []).length;
            const isFollowing = Boolean(myFollowRes.data);

            this.state.profileData = { profile, activity, ratings, lists, followers, following, isFollowing };

            const displayName = profile.nickname || profile.username || 'Member';
            const isMe = Boolean(me && me === targetUid);
            const followBtn = (me && !isMe)
                ? `<button type="button" id="profile-follow-btn" class="follow-btn ${isFollowing ? 'following' : ''}" onclick="Alexandria.toggleFollow('${this.escapeHtml(targetUid)}')">${isFollowing ? 'FOLLOWING' : 'FOLLOW'}</button>`
                : '';
            const editBtn = isMe
                ? '<button type="button" class="btn-secondary" onclick="Alexandria.editProfileModal(true)">EDIT PROFILE</button>'
                : '';
            const genreChips = (profile.fav_genres || '')
                .split(',').map(s => s.trim()).filter(Boolean)
                .map(gid => {
                    const g = this.GENRES.find(genre => String(genre.id) === gid);
                    return g ? `<span class="genre-chip">${this.escapeHtml(g.name)}</span>` : '';
                }).join('');
            const tab = ['reviews', 'lists'].includes(this.state.profileTab) ? this.state.profileTab : 'activity';
            this.state.profileTab = tab;

            this.main.innerHTML = `
                <section class="profile-page">
                    <div class="profile-hero">
                        ${this.avatarHtml(profile, 96)}
                        <div class="profile-hero-info">
                            <h1>${this.escapeHtml(displayName)}</h1>
                            ${profile.username ? `<p class="profile-handle">@${this.escapeHtml(profile.username)}</p>` : ''}
                            ${profile.bio ? `<p class="profile-bio">${this.escapeHtml(profile.bio)}</p>` : ''}
                            <div class="profile-stats">
                                <span class="profile-stat"><strong>${activity.length}</strong>Activity</span>
                                <span class="profile-stat"><strong>${ratings.length}</strong>Reviews</span>
                                <span class="profile-stat"><strong>${lists.length}</strong>Lists</span>
                                <span class="profile-stat"><strong id="profile-followers-count">${followers}</strong>Followers</span>
                                <span class="profile-stat"><strong>${following}</strong>Following</span>
                            </div>
                            ${genreChips ? `<div class="profile-genres">${genreChips}</div>` : ''}
                        </div>
                        <div class="profile-hero-actions">
                            ${followBtn}
                            ${editBtn}
                        </div>
                    </div>
                    <div class="profile-pulse" id="profile-pulse">
                        <div class="placeholder-msg pulse-loading"><span class="pulse-dot"></span> CALCULATING WATCH STATS...</div>
                    </div>
                    <div class="profile-tabs">
                        <button type="button" class="profile-tab ${tab === 'activity' ? 'active' : ''}" data-tab="activity" onclick="Alexandria.setProfileTab('activity')">ACTIVITY</button>
                        <button type="button" class="profile-tab ${tab === 'reviews' ? 'active' : ''}" data-tab="reviews" onclick="Alexandria.setProfileTab('reviews')">REVIEWS</button>
                        <button type="button" class="profile-tab ${tab === 'lists' ? 'active' : ''}" data-tab="lists" onclick="Alexandria.setProfileTab('lists')">LISTS</button>
                    </div>
                    <div id="profile-section"></div>
                </section>
            `;
            this.renderProfileSection();
            this.renderProfilePulse(targetUid);
        } catch (e) {
            console.error("Alexandria Protocol: Profile Render Failed", e);
            if (token === this._renderToken) this.renderError('This profile is unavailable', e.message || 'Something went wrong.', 'profile');
        }
    },

    // Pulse — watch-time stats, streaks, heatmap and badges. All derived
    // from public activity/ratings/comments/lists, so anyone can view them.
    async renderProfilePulse(uid) {
        const container = document.getElementById('profile-pulse');
        if (!container) return;
        if (!this.supabase) { container.innerHTML = ''; return; }
        const token = this._renderToken;
        const safeQuery = promise => Promise.resolve(promise).catch(() => ({ data: [] }));
        try {
            const [actRes, ratingRes, commentRes] = await Promise.all([
                safeQuery(this.supabase.from('activity').select('kind, content_id, content_type, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(1000)),
                safeQuery(this.supabase.from('ratings').select('rating').eq('user_id', uid).limit(1000)),
                safeQuery(this.supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', uid))
            ]);
            if (token !== this._renderToken) return;

            const activity = (actRes.data || []).filter(a => a.kind && a.created_at);
            const ratings = ratingRes.data || [];
            const commentCount = Number(commentRes.count) || 0;

            // Day buckets, per-title watch counts, badges input
            const dayCounts = {};
            const dayKeys = [];
            const perTitle = {};
            const tvPerDay = {};
            const moviePerDay = {};
            let nightOwl = false;
            for (const a of activity) {
                const d = this.localDayKey(a.created_at);
                if (!d) continue;
                if (!(d in dayCounts)) dayKeys.push(d);
                dayCounts[d] = (dayCounts[d] || 0) + 1;
                if (a.kind === 'watching') {
                    if (a.content_type === 'tv') tvPerDay[d] = (tvPerDay[d] || 0) + 1;
                    else if (a.content_type === 'movie') moviePerDay[d] = (moviePerDay[d] || 0) + 1;
                    if (a.content_id != null && (a.content_type === 'movie' || a.content_type === 'tv')) {
                        const k = a.content_type + '_' + a.content_id;
                        perTitle[k] = (perTitle[k] || 0) + 1;
                    }
                    const h = new Date(a.created_at).getHours();
                    if (h < 5) nightOwl = true;
                }
            }
            dayKeys.sort();

            // Streaks
            const daySet = new Set(dayKeys);
            const today = this.todayKey();
            let longest = 0, run = 0, prev = null;
            for (const k of dayKeys) {
                run = (prev && this.dayKeyOffset(prev, 1) === k) ? run + 1 : 1;
                if (run > longest) longest = run;
                prev = k;
            }
            let current = 0;
            let cursor = daySet.has(today) ? today : this.dayKeyOffset(today, -1);
            while (daySet.has(cursor)) { current++; cursor = this.dayKeyOffset(cursor, -1); }

            // Approx hours: per watch event, movie runtime / avg episode runtime
            let hours = 0;
            const titleKeys = Object.keys(perTitle);
            if (titleKeys.length > 0) {
                const targets = titleKeys.map(k => {
                    const i = k.indexOf('_');
                    return { key: k, type: k.slice(0, i), id: Number(k.slice(i + 1)) };
                });
                await this.mapWithConcurrency(targets, 4, async t => {
                    const rt = await this.runtimeFor(t.type, t.id);
                    hours += (rt / 60) * perTitle[t.key];
                });
            }
            if (token !== this._renderToken) return;

            const episodes = Object.values(tvPerDay).reduce((s, n) => s + n, 0);
            const titles = titleKeys.length;

            // Heatmap: 16 weeks x 7 days ending today
            const heatStart = new Date();
            heatStart.setDate(heatStart.getDate() - 111);
            heatStart.setHours(0, 0, 0, 0);
            const heatCells = [];
            for (let i = 0; i < 112; i++) {
                const dt = new Date(heatStart);
                dt.setDate(heatStart.getDate() + i);
                const k = this.localDayKey(dt);
                const count = dayCounts[k] || 0;
                const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
                heatCells.push(`<span class="pulse-heat-cell heat-${level}" title="${k} — ${count} event${count === 1 ? '' : 's'}"></span>`);
            }
            let heatHtml = '';
            for (let c = 0; c < 16; c++) {
                heatHtml += `<div class="pulse-heat-col">${heatCells.slice(c * 7, c * 7 + 7).join('')}</div>`;
            }

            // Badges
            const { lists = [], followers = 0, following = 0 } = this.state.profileData || {};
            const maxTvDay = Object.keys(tvPerDay).length ? Math.max(...Object.values(tvPerDay)) : 0;
            const maxMovieDay = Object.keys(moviePerDay).length ? Math.max(...Object.values(moviePerDay)) : 0;
            const icon = p => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
            const badges = [];
            if (titles > 0) badges.push(['FIRST BLOOD', 'Watched your first title', icon('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>')]);
            if (maxTvDay >= 5) badges.push(['BINGE LORD', '5+ episodes in a single day', icon('<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>')]);
            if (maxMovieDay >= 3) badges.push(['MARATHON MAN', '3+ movies in a single day', icon('<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line>')]);
            if (nightOwl) badges.push(['NIGHT OWL', 'Watching after midnight', icon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>')]);
            if (ratings.length >= 5) badges.push(['CRITIC', '5+ ratings given', icon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>')]);
            if (commentCount >= 10) badges.push(['TALKER', '10+ comments posted', icon('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>')]);
            if (longest >= 7) badges.push(['ON FIRE', '7-day watch streak', icon('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>')]);
            if (longest >= 30) badges.push(['UNSTOPPABLE', '30-day watch streak', icon('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>')]);
            if (lists.length >= 3) badges.push(['CURATOR', '3+ lists created', icon('<polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>')]);
            if (followers + following >= 3) badges.push(['CONNECTED', '3+ followers or following', icon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>')]);

            const hoursText = hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1);
            container.innerHTML = `
                <div class="pulse-stats-grid">
                    <div class="pulse-stat-card"><span class="pulse-stat-value">${hoursText}</span><span class="pulse-stat-label">HRS WATCHED <span class="pulse-stat-sub">APPROX</span></span></div>
                    <div class="pulse-stat-card"><span class="pulse-stat-value">${episodes}</span><span class="pulse-stat-label">EPISODES</span></div>
                    <div class="pulse-stat-card"><span class="pulse-stat-value">${titles}</span><span class="pulse-stat-label">TITLES</span></div>
                    <div class="pulse-stat-card"><span class="pulse-stat-value">${current}</span><span class="pulse-stat-label">DAY STREAK${longest > current ? ` <span class="pulse-stat-sub">LONGEST ${longest}</span>` : ''}</span></div>
                </div>
                <div class="pulse-heat-wrap">
                    <div class="pulse-heatmap">${heatHtml}</div>
                    <div class="pulse-heat-legend">LESS <span class="pulse-heat-cell heat-1"></span><span class="pulse-heat-cell heat-2"></span><span class="pulse-heat-cell heat-3"></span><span class="pulse-heat-cell heat-4"></span> MORE</div>
                </div>
                ${badges.length ? `<div class="pulse-badges"><span class="pulse-badge-title">BADGES</span>${badges.map(([name, desc, badgeIcon]) => `<span class="pulse-badge" data-desc="${this.escapeHtml(desc)}">${badgeIcon}${this.escapeHtml(name)}</span>`).join('')}</div>` : '<p class="pulse-empty">Start watching to earn badges.</p>'}
            `;
        } catch (e) {
            console.warn("Alexandria Protocol: Pulse stats failed", e);
            if (token === this._renderToken) container.innerHTML = '';
        }
    },

    localDayKey(dateOrIso) {
        const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
        if (isNaN(d.getTime())) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    dayKeyOffset(key, delta) {
        const [y, m, d] = key.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() + delta);
        return this.localDayKey(dt);
    },

    todayKey() {
        return this.localDayKey(new Date());
    },

    async runtimeFor(type, id) {
        const k = type + '_' + id;
        if (!this._runtimeCache) this._runtimeCache = {};
        if (this._runtimeCache[k] !== undefined) return this._runtimeCache[k];
        try {
            const data = await this.getJson(type + '/' + id);
            let rt = 0;
            if (type === 'movie') rt = Number(data?.runtime) || 0;
            else if (type === 'tv') {
                rt = (Array.isArray(data?.episode_run_time) && Number(data?.episode_run_time[0]))
                    ? Number(data.episode_run_time[0]) : 45;
            }
            this._runtimeCache[k] = rt;
            return rt;
        } catch {
            this._runtimeCache[k] = type === 'tv' ? 45 : 0;
            return this._runtimeCache[k];
        }
    },

    setProfileTab(tab) {
        if (!['activity', 'reviews', 'lists'].includes(tab)) tab = 'activity';
        this.state.profileTab = tab;
        document.querySelectorAll('.profile-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        this.renderProfileSection();
    },

    renderProfileSection() {
        const container = document.getElementById('profile-section');
        const data = this.state.profileData;
        if (!container || !data) return;
        const { profile, activity, ratings, lists } = data;
        const targetUid = this.state.activeProfileId || profile.id;
        const displayName = profile.nickname || profile.username || 'Member';
        const avatar = size => `<a class="profile-avatar-link" href="#profile/${this.escapeHtml(targetUid)}">${this.avatarHtml(profile, size)}</a>`;
        const nameLink = `<a href="#profile/${this.escapeHtml(targetUid)}">${this.escapeHtml(displayName)}</a>`;
        const titleLink = item => (item.content_id && (item.content_type === 'movie' || item.content_type === 'tv'))
            ? `<a href="#details/${this.escapeHtml(item.content_type)}/${this.escapeHtml(item.content_id)}">${this.escapeHtml(item.title || 'this title')}</a>`
            : (item.title ? this.escapeHtml(item.title) : '');

        if (this.state.profileTab === 'reviews') {
            container.innerHTML = ratings.length ? ratings.map(r => {
                const n = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
                const stars = '★'.repeat(n) + '☆'.repeat(5 - n);
                return `
                    <div class="profile-section-item">
                        ${avatar(36)}
                        <div class="profile-section-body">
                            <div class="profile-section-line">
                                ${nameLink}
                                <span class="profile-verb">reviewed</span>
                                ${titleLink(r)}
                            </div>
                            <div class="profile-review-stars">${stars}</div>
                            ${r.review ? `<p class="profile-review-text">${r.spoiler ? this.spoilerHtml(this.escapeHtml(r.review)) : this.escapeHtml(r.review)}</p>` : ''}
                        </div>
                        <span class="profile-timeago">${this.timeago(r.created_at)}</span>
                    </div>
                `;
            }).join('') : '<div class="profile-empty">No reviews yet.</div>';
            return;
        }

        if (this.state.profileTab === 'lists') {
            container.innerHTML = lists.length ? lists.map(l => `
                <div class="profile-section-item">
                    ${avatar(36)}
                    <div class="profile-section-body">
                        <div class="profile-section-line">
                            <span class="profile-verb">list</span>
                            <a href="#list/${this.escapeHtml(l.id)}">${this.escapeHtml(l.title || 'Untitled list')}</a>
                        </div>
                        ${l.description ? `<p class="profile-list-desc">${this.escapeHtml(l.description)}</p>` : ''}
                    </div>
                    <span class="profile-timeago">${this.timeago(l.created_at)}</span>
                </div>
            `).join('') : '<div class="profile-empty">No lists yet.</div>';
            return;
        }

        const verbs = {
            watching: 'started watching',
            rated: 'rated',
            reviewed: 'wrote a review of',
            watchlist: 'added to watchlist',
            list_created: 'created the list',
            list_added: 'added a title to a list',
            followed: 'started following someone',
            comment: 'commented on'
        };
        container.innerHTML = activity.length ? activity.map(a => {
            const verb = verbs[a.kind] || 'was active on';
            return `
                <div class="profile-section-item">
                    ${avatar(36)}
                    <div class="profile-section-body">
                        <div class="profile-section-line">
                            ${nameLink}
                            <span class="profile-verb">${verb}</span>
                            ${titleLink(a)}
                        </div>
                    </div>
                    <span class="profile-timeago">${this.timeago(a.created_at)}</span>
                </div>
            `;
        }).join('') : '<div class="profile-empty">No activity yet.</div>';
    },

    async toggleFollow(uid) {
        if (!uid) return;
        if (!this.supabase || !this.state.authUser) {
            this.toggleAuthModal(true, 'login');
            this.showToast('Sign in to follow');
            return;
        }
        const me = this.state.authUser.id;
        if (me === uid) return;
        try {
            const { data: existing } = await this.supabase
                .from('follows')
                .select('follower_id')
                .eq('follower_id', me)
                .eq('followee_id', uid)
                .maybeSingle();
            const nowFollowing = !existing;
            if (existing) {
                await this.supabase.from('follows').delete().eq('follower_id', me).eq('followee_id', uid);
            } else {
                await this.supabase.from('follows').insert({ follower_id: me, followee_id: uid });
            }
            if (nowFollowing) {
                this.logActivity('followed', { meta: JSON.stringify({ followee: uid }) });
            }
            const btn = document.getElementById('profile-follow-btn');
            if (btn) {
                btn.textContent = nowFollowing ? 'FOLLOWING' : 'FOLLOW';
                btn.classList.toggle('following', nowFollowing);
            }
            const countEl = document.getElementById('profile-followers-count');
            if (countEl) {
                const current = Number(countEl.textContent) || 0;
                countEl.textContent = String(current + (nowFollowing ? 1 : -1));
            }
            this.showToast(nowFollowing ? 'Following' : 'Unfollowed');
        } catch (err) {
            console.warn('Follow toggle failed:', err);
            this.showToast('Could not update follow status');
        }
    },

    async renderCommunity() {
        this.state.communityTab = this.state.communityTab || 'all';
        const token = this._renderToken;
        const tab = this.state.communityTab;

        this.main.innerHTML = `
            <section class="filtered-view community-view">
                <div class="view-section">
                    <h3>COMMUNITY</h3>
                    <div class="feed-tabs">
                        <button type="button" class="feed-tab ${tab === 'all' ? 'active' : ''}" data-tab="all" aria-pressed="${tab === 'all'}" onclick="Alexandria.setCommunityTab('all')">ALL</button>
                        <button type="button" class="feed-tab ${tab === 'following' ? 'active' : ''}" data-tab="following" aria-pressed="${tab === 'following'}" onclick="Alexandria.setCommunityTab('following')">FOLLOWING</button>
                    </div>
                </div>
                <div class="leaderboard-section">
                    <h3>TOP WATCHERS THIS WEEK</h3>
                    <div id="leaderboard-list"><div class="placeholder-msg"><span class="pulse-dot"></span> LOADING LEADERBOARD...</div></div>
                </div>
                <div id="feed-list"><div class="placeholder-msg"><span class="pulse-dot"></span> LOADING COMMUNITY FEED...</div></div>
            </section>
        `;

        this.initFeedRealtime();
        this.renderLeaderboard();
        await this.fetchFeed();
        if (token !== this._renderToken) return;
    },

    async renderLeaderboard() {
        const container = document.getElementById('leaderboard-list');
        if (!container || !this.supabase) return;
        const token = this._renderToken;
        const safeQuery = promise => Promise.resolve(promise).catch(() => ({ data: [] }));
        try {
            const since = new Date(Date.now() - 7 * 86400000).toISOString();
            const res = await safeQuery(this.supabase
                .from('activity')
                .select('user_id, kind, content_type')
                .gte('created_at', since)
                .order('created_at', { ascending: false })
                .limit(2000));
            if (token !== this._renderToken) return;

            const tally = {};
            (res.data || []).forEach(a => {
                if (a.kind !== 'watching' || !a.user_id) return;
                if (a.content_type !== 'movie' && a.content_type !== 'tv') return;
                tally[a.user_id] = (tally[a.user_id] || 0) + 1;
            });
            const ranked = Object.entries(tally)
                .map(([uid, score]) => ({ uid, score }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);
            if (token !== this._renderToken) return;

            if (ranked.length === 0) {
                container.innerHTML = '<div class="feed-empty">No watches logged this week yet. Be the first!</div>';
                return;
            }
            await Promise.all(ranked.map(r => this.fetchProfile(r.uid)));
            if (token !== this._renderToken) return;

            const max = ranked[0].score;
            const me = this.state.authUser?.id;
            container.innerHTML = ranked.map((r, i) => {
                const p = this._profileCache?.[r.uid] || null;
                const name = p ? (p.nickname || p.username || 'Member') : 'Member';
                const isMe = me === r.uid;
                return `
                    <a class="leaderboard-row ${isMe ? 'is-me' : ''}" href="#profile/${this.escapeHtml(r.uid)}">
                        <span class="leaderboard-rank">${i + 1}</span>
                        ${this.avatarHtml(p, 36)}
                        <span class="leaderboard-name">${this.escapeHtml(name)}${isMe ? ' <em>(you)</em>' : ''}</span>
                        <span class="leaderboard-count"><strong>${r.score}</strong> watch${r.score === 1 ? '' : 'es'}</span>
                        <span class="leaderboard-bar"><span class="leaderboard-bar-fill" style="width:${Math.max(6, Math.round(r.score / max * 100))}%"></span></span>
                    </a>`;
            }).join('');
        } catch (e) {
            console.warn("Alexandria Protocol: Leaderboard failed", e);
            if (token === this._renderToken) container.innerHTML = '<div class="feed-empty">Leaderboard unavailable right now.</div>';
        }
    },

    setCommunityTab(tab) {
        if (!['all', 'following'].includes(tab)) tab = 'all';
        this.state.communityTab = tab;
        document.querySelectorAll('.feed-tab').forEach(btn => {
            const active = btn.dataset.tab === tab;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
        this.fetchFeed();
    },

    async fetchFeed() {
        const container = document.getElementById('feed-list');
        if (!container) return;
        const tab = this.state.communityTab || 'all';
        container.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING COMMUNITY FEED...</div>';

        if (!this.supabase) {
            container.innerHTML = '<div class="feed-empty">The community feed is unavailable right now.</div>';
            return;
        }

        const safeQuery = promise => Promise.resolve(promise).catch(() => ({ data: [] }));
        const since = new Date(Date.now() - 86400000).toISOString();
        try {
            let rows = [];
            if (tab === 'all') {
                const res = await safeQuery(this.supabase.from('activity').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(60));
                rows = res.data || [];
            } else {
                const me = this.state.authUser?.id;
                if (!me) {
                    container.innerHTML = `
                        <div class="feed-empty">
                            <p>Sign in to follow people</p>
                            <button type="button" class="btn-primary" onclick="Alexandria.toggleAuthModal(true, 'login')">SIGN IN</button>
                        </div>`;
                    return;
                }
                const followsRes = await safeQuery(this.supabase.from('follows').select('followee_id').eq('follower_id', me));
                const ids = Array.from(new Set((followsRes.data || []).map(f => f.followee_id).filter(Boolean)));
                this._followingIds = ids;
                if (ids.length === 0) {
                    container.innerHTML = '<div class="feed-empty">You are not following anyone yet. Visit a profile and hit FOLLOW.</div>';
                    return;
                }
                const res = await safeQuery(this.supabase.from('activity').select('*').in('user_id', ids).gte('created_at', since).order('created_at', { ascending: false }).limit(60));
                rows = res.data || [];
            }

            const distinctUsers = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));
            await Promise.all(distinctUsers.map(uid => this.fetchProfile(uid)));

            if (document.getElementById('feed-list') !== container) return;
            if (this.state.communityTab !== tab) return;
            container.innerHTML = rows.length
                ? rows.map(row => this.feedItemHtml(row)).join('')
                : '<div class="feed-empty">No activity yet.</div>';
        } catch (err) {
            console.warn('Community feed fetch failed:', err);
            container.innerHTML = '<div class="feed-empty">Could not load the community feed.</div>';
        }
    },

    feedItemHtml(row) {
        const profile = this._profileCache?.[row.user_id] || null;
        const displayName = profile ? (profile.nickname || profile.username || 'Member') : 'Member';
        const verbs = {
            watching: 'started watching',
            rated: 'rated',
            reviewed: 'wrote a review of',
            watchlist: 'added to watchlist',
            list_created: 'created the list',
            list_added: 'added a title to a list',
            followed: 'started following someone',
            comment: 'commented on'
        };
        const verb = verbs[row.kind] || 'was active on';
        const titleHtml = (row.content_id && (row.content_type === 'movie' || row.content_type === 'tv'))
            ? `<a class="feed-item-title" href="#details/${this.escapeHtml(row.content_type)}/${this.escapeHtml(row.content_id)}">${this.escapeHtml(row.title || 'this title')}</a>`
            : (row.title ? `<span class="feed-item-title">${this.escapeHtml(row.title)}</span>` : '');
        const poster = (row.content_type === 'movie' || row.content_type === 'tv') && row.poster_path
            ? `<img class="feed-poster-thumb" src="${this.imageUrl(row.poster_path, 'w92')}" alt="" loading="lazy" decoding="async">`
            : '';
        return `
            <div class="feed-item">
                <a class="feed-item-avatar" href="#profile/${this.escapeHtml(row.user_id)}" aria-label="${this.escapeHtml(displayName)}">${this.avatarHtml(profile, 40)}</a>
                <div class="feed-item-body">
                    <div class="feed-item-line">
                        <a class="feed-item-user" href="#profile/${this.escapeHtml(row.user_id)}">${this.escapeHtml(displayName)}</a>
                        <span class="profile-verb">${this.escapeHtml(verb)}</span>
                        ${titleHtml}
                    </div>
                    <span class="feed-item-time">${this.escapeHtml(this.timeago(row.created_at))}</span>
                </div>
                ${poster}
            </div>`;
    },

    initFeedRealtime() {
        if (!this.supabase) return;
        if (this.feedChannel) {
            this.supabase.removeChannel(this.feedChannel);
            this.feedChannel = null;
        }
        this.feedChannel = this.supabase.channel('community_feed');
        this.feedChannel
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, async (payload) => {
                if (this.state.view !== 'community') return;
                const row = payload.new;
                if (!row || !row.user_id) return;
                if (this.state.communityTab === 'following' && !(Array.isArray(this._followingIds) && this._followingIds.includes(row.user_id))) return;
                await this.fetchProfile(row.user_id);
                if (this.state.view !== 'community') return;
                const list = document.getElementById('feed-list');
                if (!list) return;
                const empty = list.querySelector('.feed-empty');
                if (empty) empty.remove();
                list.insertAdjacentHTML('afterbegin', this.feedItemHtml(row));
                while (list.children.length > 60) list.removeChild(list.lastElementChild);
            })
            .subscribe();
    },

    editProfileModal(open) {
        let modal = document.getElementById('profile-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'profile-modal';
            modal.className = 'profile-modal-overlay';
            modal.setAttribute('hidden', '');
            modal.innerHTML = `
                <div class="profile-modal-card">
                    <button class="auth-close-btn" type="button" aria-label="Close" onclick="Alexandria.editProfileModal(false)">✕</button>
                    <h3 class="profile-modal-title">EDIT PROFILE</h3>
                    <div class="auth-field">
                        <label>Username (@)</label>
                        <input type="text" id="profile-username-input" placeholder="Your unique @ handle" minlength="3" maxlength="20" autocomplete="off">
                    </div>
                    <div class="auth-field">
                        <label>Nickname</label>
                        <input type="text" id="profile-nickname-input" placeholder="Your display name" maxlength="40">
                    </div>
                    <div class="auth-field">
                        <label>Bio</label>
                        <textarea id="profile-bio-input" rows="4" placeholder="Tell the archive about yourself" maxlength="500"></textarea>
                    </div>
                    <span class="profile-modal-label">Avatar</span>
                    <div class="avatar-picker" id="avatar-picker"></div>
                    <span class="profile-modal-label">Favorite Genres</span>
                    <div class="genre-picker" id="genre-picker"></div>
                    <div class="profile-modal-actions">
                        <button type="button" class="btn-secondary" onclick="Alexandria.editProfileModal(false)">CANCEL</button>
                        <button type="button" class="btn-primary" onclick="Alexandria.saveProfile()">SAVE</button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', e => { if (e.target === modal) this.editProfileModal(false); });
            document.body.appendChild(modal);
        }
        const show = open !== undefined ? Boolean(open) : modal.hasAttribute('hidden');
        if (show) {
            modal.removeAttribute('hidden');
            this.prefillProfileModal();
        } else {
            modal.setAttribute('hidden', '');
        }
    },

    async prefillProfileModal() {
        const me = this.state.authUser?.id;
        if (!me) return;
        const nicknameInput = document.getElementById('profile-nickname-input');
        if (nicknameInput) {
            nicknameInput.value = this.state.authUser?.user_metadata?.username
                || sessionStorage.getItem('alexandria_nickname')
                || localStorage.getItem('alexandria_username')
                || '';
        }
        const profile = await this.fetchProfile(me);
        const modal = document.getElementById('profile-modal');
        if (!profile || !modal || modal.hasAttribute('hidden')) return;
        const usernameInput = document.getElementById('profile-username-input');
        if (usernameInput) usernameInput.value = profile.username || '';
        if (nicknameInput && profile.nickname) nicknameInput.value = profile.nickname;
        const bioInput = document.getElementById('profile-bio-input');
        if (bioInput) bioInput.value = profile.bio || '';
        this.state.profileAvatarSelection = profile.avatar_id || 'python';
        const picker = document.getElementById('avatar-picker');
        if (picker) {
            picker.innerHTML = this.AVATAR_PRESETS.map((p, i) => {
                const prev = this.AVATAR_PRESETS[i - 1];
                const label = p.group && prev?.group !== p.group
                    ? `<span class="avatar-picker-label">${this.escapeHtml(p.group)}</span>`
                    : '';
                const body = p.img
                    ? `<img src="${this.imageUrl(p.img, 'w185')}" alt="" loading="lazy" decoding="async">`
                    : p.emoji;
                return `${label}<button type="button" class="avatar-picker-btn ${profile.avatar_id === p.id ? 'selected' : ''}" data-avatar="${p.id}" aria-label="${p.id}" onclick="Alexandria.selectProfileAvatar('${p.id}', this)">${body}</button>`;
            }).join('');
        }
        this.state.profileGenreSelection = new Set(
            (profile.fav_genres || '').split(',').map(s => s.trim()).filter(Boolean)
        );
        const genrePicker = document.getElementById('genre-picker');
        if (genrePicker) {
            genrePicker.innerHTML = this.GENRES.map(g => `
                <button type="button" class="genre-chip genre-chip-btn ${this.state.profileGenreSelection.has(String(g.id)) ? 'selected' : ''}" data-genre="${g.id}" onclick="Alexandria.toggleProfileGenre(${g.id}, this)">${this.escapeHtml(g.name)}</button>
            `).join('');
        }
    },

    selectProfileAvatar(id, btn) {
        this.state.profileAvatarSelection = id;
        document.querySelectorAll('.avatar-picker-btn').forEach(b => b.classList.toggle('selected', b === btn));
    },

    toggleProfileGenre(genreId, btn) {
        const set = this.state.profileGenreSelection || new Set();
        const key = String(genreId);
        if (set.has(key)) set.delete(key); else set.add(key);
        this.state.profileGenreSelection = set;
        if (btn) btn.classList.toggle('selected', set.has(key));
    },

    async saveProfile() {
        const me = this.state.authUser?.id;
        if (!me) return;
        const username = (document.getElementById('profile-username-input')?.value || '').trim();
        const nickname = (document.getElementById('profile-nickname-input')?.value || '').trim();
        const bio = (document.getElementById('profile-bio-input')?.value || '').trim();
        if (!username) {
            this.showToast('Username (@handle) is required');
            return;
        }
        if (username.length < 3 || username.length > 20) {
            this.showToast('Username must be 3-20 characters');
            return;
        }
        if (!nickname) {
            this.showToast('Nickname is required');
            return;
        }
        if (!this.supabase) {
            this.showToast('Supabase cloud required for profiles.');
            return;
        }
        const usernameLower = username.toLowerCase();
        const profile = await this.fetchProfile(me).catch(() => null);
        const usernameChanged = !profile || (profile.username || '').toLowerCase() !== usernameLower;
        if (usernameChanged) {
            const isUnique = await this.checkUsernameUnique(username, me);
            if (!isUnique) {
                this.showToast(`@${username} is already taken. Try another.`);
                document.getElementById('profile-username-input')?.focus();
                return;
            }
        }
        const genres = this.state.profileGenreSelection ? [...this.state.profileGenreSelection] : [];
        const avatarId = this.state.profileAvatarSelection || 'python';
        try {
            await this.supabase.from('profiles').update({
                username,
                username_lower: usernameLower,
                nickname,
                bio,
                fav_genres: genres.join(','),
                avatar_id: avatarId
            }).eq('id', me);
            if (usernameChanged) {
                try {
                    await this.supabase.auth.updateUser({ data: { username } });
                } catch { /* metadata sync is best-effort */ }
                localStorage.setItem('alexandria_username', username);
            }
            sessionStorage.setItem('alexandria_nickname', nickname);
            this._profileCache = this._profileCache || {};
            delete this._profileCache[me];
            this.showToast('Profile saved');
            this.editProfileModal(false);
            this.updateAuthUI();
            if (this.state.view === 'profile') {
                this.state.profileTab = 'activity';
                this.renderProfile();
            }
        } catch (err) {
            console.warn('Profile save failed:', err);
            // 23505 = unique_violation: someone grabbed this @ between our
            // uniqueness check and the update (DB constraint is the backstop).
            if (err && (err.code === '23505' || /duplicate key/.test(err.message || ''))) {
                this.showToast(`@${username} is already taken. Try another.`);
                document.getElementById('profile-username-input')?.focus();
            } else {
                this.showToast('Could not save profile');
            }
        }
    },
    // #endregion

    async renderPlayer() {
        const { id, type, season, episode, isAnime } = this.state.activeContent;
        if (!this.servers[this.state.activeServer]) this.state.activeServer = 0;
        const server = this.servers[this.state.activeServer];
        const embedUrl = this.buildEmbedUrl(this.state.activeServer);

        this._triedServers = new Set([this.state.activeServer]);
        this._serverHealthy = false;
        this._currentSeasonEpisodes = [];

        this.main.innerHTML = `
            <section class="player-page-container">
                <div class="player-stage-grid ${type === 'tv' ? 'has-sidebar' : 'no-sidebar'}">
                    <div class="player-main">
                        <div class="server-controls">
                            <label class="server-label" for="server-selector">SERVER <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></label>
                            <select id="server-selector" class="server-select-dropdown" onchange="Alexandria.handleServerChange(this.value)">
                                ${this.servers.map((s, i) => `<option value="${i}" ${i === this.state.activeServer ? 'selected' : ''}>${s.name}</option>`).join('')}
                            </select>
                            <button type="button" class="btn-secondary server-next-btn" onclick="Alexandria.failoverToNextServer(true)" title="Try the next mirror">NEXT SERVER</button>
                            <span id="server-status" class="server-status" aria-live="polite">Connecting to ${this.escapeHtml(server.name)}…</span>
                        </div>
                        <div class="player-frame-container">
                            <iframe id="video-iframe" title="Alexandria video player" src="${embedUrl}" width="100%" height="100%" scrolling="no" ${this.playerIframeFlags()}></iframe>
                        </div>
                    </div>
                    ${type === 'tv' ? `
                        <div class="episode-sidebar">
                            <div class="sidebar-top">
                                <h3 id="sidebar-title">DATA LINK</h3>
                                <div class="season-picker" id="season-picker">
                                    <button type="button" id="season-selector-btn" class="season-select" aria-haspopup="listbox" aria-expanded="false" aria-controls="season-menu" onclick="Alexandria.toggleSeasonMenu(event)">SEASON 1</button>
                                    <ul id="season-menu" class="season-menu" role="listbox" hidden></ul>
                                </div>
                            </div>
                            <div class="episode-list" id="sidebar-episodes">
                                <div class="placeholder-msg">DECRYPTING EPISODES...</div>
                            </div>
                        </div>` : ''}
                </div>
                <div class="player-below-stage">
                    <section class="comments-section-container" id="comments-section-container"></section>
                </div>
            </section>`;

        this.bindSoloPlayerEvents();
        this.prepareResumeSeek();
        this.armFailoverWatch(server);
        this.scheduleEmbedTheme(document.getElementById('video-iframe'));
        this.renderComments();

        if (type === 'sports') {
            const ev = this.SPORTS_EVENTS.find(e => e.id === id) || this.SPORTS_EVENTS[0];
            this.addToHistory({
                id: ev.id,
                type: 'sports',
                title: ev.title,
                poster_path: ev.backdrop,
                season: 1,
                episode: 1,
                isAnime: false,
                progress: 0
            });
            return;
        }

        try {
            const data = await this.getJson(type + '/' + id);
            const title = type === 'movie' ? data.title : data.name;
            if (title) {
                const existing = this.state.history.find(h => String(h.id) === String(id) && h.type === type);
                const keepProgress = type === 'tv'
                    && Number(existing?.season) === Number(season)
                    && Number(existing?.episode) === Number(episode)
                    ? (existing?.progress || 0)
                    : (type === 'movie' ? (existing?.progress || 0) : 0);
                this.addToHistory({
                    id, type, title, poster_path: data.poster_path, season, episode, isAnime,
                    progress: keepProgress
                });
            }
            if (type === 'tv') {
                this.populateSeasonSelector(data, season);
                await this.loadEpisodes(id, season);
            }
        } catch (e) {
            console.error("Alexandria: Player metadata failed", e);
            if (type === 'tv') {
                await this.initSeasonSelector(id, season);
                await this.loadEpisodes(id, season);
            }
        }
    },

    setServerStatus(message) {
        const el = document.getElementById('server-status');
        if (el) el.textContent = message;
    },

    clearFailoverWatch() {
        if (this._failoverTimer) {
            clearTimeout(this._failoverTimer);
            this._failoverTimer = null;
        }
    },

    armFailoverWatch(server) {
        this.clearFailoverWatch();
        this._serverHealthy = false;
        this._failoverGraceUsed = false;
        const name = server?.name || 'server';
        this.setServerStatus(`Connecting to ${name}…`);

        const iframe = document.getElementById('video-iframe');
        if (iframe) {
            iframe.addEventListener('load', () => {
                if (this.state.view !== 'player' || this._serverHealthy) return;
                this._failoverGraceUsed = true;
                this.setServerStatus(`Loaded · ${name} · use NEXT if blank`);
            }, { once: true });
        }

        // Auto-failover disabled. It was yanking working Alexandria streams mid-watch
        // whenever EmbedMaster skipped postMessage "ready". Manual NEXT SERVER only.
    },

    markServerHealthy() {
        if (this._serverHealthy) return;
        this._serverHealthy = true;
        this.clearFailoverWatch();
        const server = this.servers[this.state.activeServer];
        this.setServerStatus(server ? `Live · ${server.name}` : 'Live');
    },

    failoverToNextServer(manual = false) {
        if (this.state.view !== 'player') return;
        if (!this._triedServers) this._triedServers = new Set([this.state.activeServer]);

        const total = this.servers.length;
        if (total < 2) {
            this.setServerStatus('No backup servers configured.');
            return;
        }

        // Auto-timeout stays on EmbedMaster mirrors only (supportsApi).
        // Manual NEXT SERVER can still hop to VidSrc / EmbedSU.
        const preferApiOnly = !manual;
        let next = (this.state.activeServer + 1) % total;
        let hops = 0;
        while (hops < total) {
            const candidate = this.servers[next];
            const allowed = !preferApiOnly || candidate?.supportsApi;
            if (allowed && !this._triedServers.has(next)) break;
            next = (next + 1) % total;
            hops += 1;
        }

        const nextServer = this.servers[next];
        const nextAllowed = !preferApiOnly || nextServer?.supportsApi;
        if (!nextAllowed || this._triedServers.has(next) || hops >= total) {
            this.clearFailoverWatch();
            if (preferApiOnly) {
                this.setServerStatus('EmbedMaster mirrors timed out. Pick a server manually.');
                this.showToast('Alexandria / EmbedMaster timed out. Use NEXT SERVER or pick a mirror.');
            } else {
                this.setServerStatus('All servers tried. Pick one manually.');
                this.showToast('All mirrors were tried. Choose a server from the list.');
            }
            this._triedServers = new Set();
            return;
        }

        const label = nextServer?.name || `Server ${next + 1}`;
        this.showToast(manual ? `Switching to ${label}…` : `${this.servers[this.state.activeServer]?.name || 'Server'} timed out. Trying ${label}…`);
        this.applyServer(next, { resetTried: false });
    },

    normalizeServerIndex(value) {
        const idx = Number.parseInt(value, 10);
        if (!Number.isInteger(idx) || !this.servers[idx]) return null;
        return idx;
    },

    // Host + guest must share the exact same embed URL for a given content + serverIndex.
    buildEmbedUrl(serverIndex = this.state.activeServer, content = this.state.activeContent) {
        const idx = this.normalizeServerIndex(serverIndex);
        const server = this.servers[idx != null ? idx : this.state.activeServer];
        if (!server || content?.id == null) return '';
        const { id, type, season, episode } = content;
        return type === 'movie'
            ? server.getMovie(id)
            : server.getTv(id, season || 1, episode || 1);
    },

    applyServer(serverIndex, { resetTried = true } = {}) {
        const idx = this.normalizeServerIndex(serverIndex);
        if (idx == null) return;
        serverIndex = idx;

        // Watch Party play/pause sync needs EmbedMaster postMessage API.
        if (this.state.view === 'party' && !this.servers[serverIndex].supportsApi) {
            this.showToast('That mirror can’t sync in Watch Party. Use Alexandria or EmbedMaster.');
            const selector = document.getElementById('party-server-selector') || document.getElementById('server-selector');
            if (selector) selector.value = String(this.state.activeServer);
            return;
        }

        this.state.activeServer = serverIndex;
        try {
            localStorage.setItem('alexandria_activeServer', String(serverIndex));
        } catch { /* ignore */ }

        if (resetTried) this._triedServers = new Set([serverIndex]);
        else this._triedServers?.add(serverIndex);

        const server = this.servers[this.state.activeServer];
        const embedUrl = this.buildEmbedUrl(serverIndex);

        const selector = document.getElementById('server-selector');
        if (selector) selector.value = String(serverIndex);
        const partySelector = document.getElementById('party-server-selector');
        if (partySelector) partySelector.value = String(serverIndex);

        const iframe = document.getElementById('video-iframe') || document.getElementById('embedmaster_iframe');
        if (this.state.view === 'party') {
            this._partyFrameReloading = true;
            this._partyEmbedHealthy = false;
        }
        if (iframe) iframe.src = embedUrl;

        if (this.state.view === 'player') {
            this.prepareResumeSeek();
            this.armFailoverWatch(server);
        } else if (this.state.view === 'party') {
            this.onPartyServerSwitched(server);
        } else {
            this.setServerStatus(`Using ${server.name}`);
        }
    },

    handlePartyServerChange(newServerIndex) {
        if (!this.isHost) return;
        const serverIndex = this.normalizeServerIndex(newServerIndex);
        if (serverIndex == null) return;
        this.applyServer(serverIndex, { resetTried: true });
    },

    onPartyServerSwitched(server) {
        const frame = document.getElementById('embedmaster_iframe');
        this._suppressHostBroadcastUntil = Date.now() + 2800;
        this._partyTimeStallCount = 0;
        this._partyFrameReloading = true;
        this._partyEmbedHealthy = false;
        if (!this.isHost) this._partyGuestUnlocked = false;
        this.bindPartyFrame(frame);
        this.scheduleEmbedTheme(frame);
        this.armPartyEmbedWatch();
        this.updatePartyRoleUI();
        // #region agent log
        this._dbg('E', 'script.js:onPartyServerSwitched', 'server switch', {
            serverName: server?.name,
            embedSrc: frame?.src || '',
            referrerPolicy: frame?.referrerPolicy || frame?.getAttribute?.('referrerpolicy') || null,
            activeServer: this.state.activeServer,
            contentId: this.state.activeContent?.id,
            contentType: this.state.activeContent?.type
        });
        // #endregion
        // Broadcast new serverIndex immediately so guests rebuild the same embed URL.
        if (this.isHost && this.partyChannel) {
            this.broadcastPartyContent();
            this.appendChatMessage('System', `Host switched server to ${server?.name || 'another mirror'}. Re-syncing…`);
            this.scheduleHostPartyResync();
        } else {
            this.appendChatMessage('System', 'Player reloading — hit Play Now if sync stalls.');
            this.scheduleGuestPartyResync();
        }
    },

    clearPartyEmbedWatch() {
        if (this._partyEmbedWatchTimer) {
            clearTimeout(this._partyEmbedWatchTimer);
            this._partyEmbedWatchTimer = null;
        }
    },

    armPartyEmbedWatch() {
        this.clearPartyEmbedWatch();
        this._partyEmbedHealthy = false;
        this._partyEmbedWatchTimer = setTimeout(() => {
            if (this.state.view !== 'party' || this._partyEmbedHealthy) return;
            const name = this.servers[this.state.activeServer]?.name || 'Server';
            this._suppressHostBroadcastUntil = 0;
            this._partyFrameReloading = false;
            // #region agent log
            const frame = document.getElementById('embedmaster_iframe');
            this._dbg('E', 'script.js:armPartyEmbedWatch', 'embed load timeout', {
                serverName: name,
                embedSrc: frame?.src || '',
                referrerPolicy: frame?.referrerPolicy || frame?.getAttribute?.('referrerpolicy') || null
            });
            // #endregion
            this.showToast(`${name} didn’t load. Switch server — sync stays connected.`);
            this.appendChatMessage('System', `${name} timed out. Pick another mirror to recover.`);
        }, 12000);
    },

    markPartyEmbedHealthy() {
        if (this._partyEmbedHealthy) return;
        this._partyEmbedHealthy = true;
        this.clearPartyEmbedWatch();
        // #region agent log
        const frame = document.getElementById('embedmaster_iframe');
        this._dbg('E', 'script.js:markPartyEmbedHealthy', 'embed healthy/ready', {
            embedSrc: frame?.src || '',
            referrerPolicy: frame?.referrerPolicy || frame?.getAttribute?.('referrerpolicy') || null
        });
        // #endregion
    },

    clearHostPartyResyncTimers() {
        if (this._partyHostResyncTimers?.length) {
            this._partyHostResyncTimers.forEach(clearTimeout);
        }
        this._partyHostResyncTimers = [];
        if (this._partyReadyResyncTimer) {
            clearTimeout(this._partyReadyResyncTimer);
            this._partyReadyResyncTimer = null;
        }
        if (this._partyFrameLoadTimer) {
            clearTimeout(this._partyFrameLoadTimer);
            this._partyFrameLoadTimer = null;
        }
    },

    clearGuestPartyResyncTimers() {
        if (this._partyGuestResyncTimers?.length) {
            this._partyGuestResyncTimers.forEach(clearTimeout);
        }
        this._partyGuestResyncTimers = [];
    },

    scheduleHostPartyResync() {
        if (this.state.view !== 'party' || !this.isHost || !this.partyChannel) return;
        const now = Date.now();
        // Repeated ready/load echoes were stacking a dozen force syncs — that was
        // the "constantly syncing" hammer. Collapse them into one calm burst.
        if (this._lastHostResyncAt && now - this._lastHostResyncAt < 1500) return;
        this._lastHostResyncAt = now;
        this.clearHostPartyResyncTimers();
        const delays = [600, 2200];
        this._partyHostResyncTimers = delays.map((ms) => setTimeout(async () => {
            if (this.state.view !== 'party' || !this.isHost || !this.partyChannel) return;
            this._suppressHostBroadcastUntil = 0;
            this._partyFrameReloading = false;
            const time = ms >= 1000
                ? await this.resolveHostTime()
                : this.getHostPlaybackTime();
            const action = this.isPartyPaused()
                ? 'pause'
                : (this._partyLastAction === 'pause' ? 'pause' : 'play');
            this.sendPlayerSync(action, time, { force: true, noSeek: time < 5 });
            this.tickPartyClock();
        }, ms));
    },

    scheduleGuestPartyResync() {
        if (this.state.view !== 'party' || this.isHost) return;
        this.clearGuestPartyResyncTimers();
        const delays = [900, 2200, 4500];
        this._partyGuestResyncTimers = delays.map((ms) => setTimeout(() => {
            if (this.state.view !== 'party' || this.isHost) return;
            const pending = this._pendingPartySync;
            if (!pending) return;
            this._partyFrameReloading = false;
            this.applyRemotePlayerAction(pending.action, pending.time, {
                force: true,
                clock: pending.clock,
                noSeek: (pending.time || 0) < 5
            });
        }, ms));
    },

    bindPartyFrame(frame) {
        if (!frame) return;
        // Always re-attach: iframe nodes are recreated on renderParty, and src swaps need a live load hook.
        if (frame._partyLoadHandler) {
            frame.removeEventListener('load', frame._partyLoadHandler);
        }
        frame._partyLoadHandler = () => this.onPartyFrameLoad();
        frame.addEventListener('load', frame._partyLoadHandler);
        frame.dataset.partyBound = '1';
    },

    onPartyFrameLoad() {
        if (this.state.view !== 'party') return;
        const frame = document.getElementById('embedmaster_iframe');
        this.scheduleEmbedTheme(frame);

        if (!this.isHost) {
            this._partyGuestUnlocked = false;
            this.updatePartyRoleUI();
            this.scheduleGuestPartyResync();
            return;
        }

        // New mirror finished loading — push current play/pause + time to guests.
        this.scheduleHostPartyResync();
    },

    resyncPartyAfterPlayerReady() {
        this.markPartyEmbedHealthy();
        if (this.state.view !== 'party' || !this.isHost || !this.partyChannel) return;
        this._partyFrameReloading = false;
        this.scheduleHostPartyResync();
    },

    formatTime(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    },

    getSavedProgress() {
        const { id, type, season, episode } = this.state.activeContent;
        const item = this.state.history.find(h => String(h.id) === String(id) && h.type === type);
        if (!item || typeof item.progress !== 'number') return 0;
        if (item.progress < 5) return 0;
        if (type === 'tv') {
            if (Number(item.season) !== Number(season) || Number(item.episode) !== Number(episode)) return 0;
        }
        return item.progress;
    },

    prepareResumeSeek() {
        this._resumeSeekDone = false;
        this._pendingResumeTime = this.getSavedProgress();
        this._resumeIgnoreUntil = 0;
        if (this._pendingResumeTime > 0) {
            this.setServerStatus(`Will resume at ${this.formatTime(this._pendingResumeTime)}`);
        }
    },

    tryResumeSeek() {
        if (this._resumeSeekDone || this.state.view !== 'player') return;
        const server = this.servers[this.state.activeServer];
        if (!server?.supportsApi) {
            this._resumeSeekDone = true;
            return;
        }
        const time = this._pendingResumeTime || this.getSavedProgress();
        if (!time || time < 5) {
            this._resumeSeekDone = true;
            return;
        }
        const frame = document.getElementById('video-iframe');
        if (!frame?.contentWindow) return;

        this.postToEmbed(frame, 'seek', time);
        this._resumeSeekDone = true;
        this._resumeIgnoreUntil = Date.now() + 2500;
        this._pendingResumeTime = 0;
        this.showToast(`Resumed at ${this.formatTime(time)}`);
        this.setServerStatus(`Live · ${server.name} · ${this.formatTime(time)}`);
    },

    persistProgress(t, force = false) {
        if (typeof t !== 'number' || Number.isNaN(t)) return;
        if (!force && Date.now() < this._resumeIgnoreUntil) return;
        if (!force && Date.now() - this._lastProgressWrite < this._PROGRESS_WRITE_MS) return;

        const { id, type, season, episode } = this.state.activeContent;
        const existing = this.state.history.find(h => String(h.id) === String(id) && h.type === type);
        if (!existing) return;
        existing.progress = t;
        existing.season = season;
        existing.episode = episode;
        this._lastProgressWrite = Date.now();
        this.writeLocalList('alexandria_history', this.state.history);
    },

    async advanceEpisode() {
        const { id, season, episode } = this.state.activeContent;
        // Finishing an episode logs it automatically.
        this.markEpisodeWatched(id, season, episode, true);
        const eps = this._currentSeasonEpisodes || [];
        const numbers = eps.map(e => e.episode_number).filter(n => Number.isFinite(n));
        const maxEp = numbers.length ? Math.max(...numbers) : episode;

        if (episode < maxEp) {
            window.location.hash = `#tv/${id}/s/${season || 1}/e/${episode + 1}`;
            return;
        }

        try {
            const show = await this.getJson('tv/' + id);
            const seasons = (show.seasons || []).filter(s => s.season_number > 0);
            const nextSeason = seasons.find(s => s.season_number === (season || 1) + 1);
            if (nextSeason) {
                this.showToast(`Season ${season} complete. Loading season ${nextSeason.season_number}…`);
                window.location.hash = `#tv/${id}/s/${nextSeason.season_number}/e/1`;
                return;
            }
        } catch { /* ignore */ }

        this.showToast('End of available episodes.');
        this.persistProgress(0, true);
    },

    bindSoloPlayerEvents() {
        if (this._soloEmbedListener) return;
        this._soloEmbedListener = (event) => {
            if (this.state.view !== 'player') return;
            const data = event.data;
            if (!data || typeof data !== 'object') return;

            const originOk = this.isTrustedEmbedOrigin(event.origin);
            const looksLikeEmbedMaster = data.source === 'embedmaster_player';
            // Private player sometimes posts from a sibling host; still accept its payload.
            const looksLikePlayerJs = originOk && data.answer !== undefined;
            if (!looksLikeEmbedMaster && !looksLikePlayerJs) return;

            this.markServerHealthy();
            if (!looksLikeEmbedMaster) return;

            if (data.event === 'ready') {
                this.themeEmbedPlayer(document.getElementById('video-iframe'));
                this.tryResumeSeek();
            } else if (!this._resumeSeekDone && this._pendingResumeTime > 0 && (data.event === 'play' || data.event === 'time')) {
                this.tryResumeSeek();
            }

            if (data.event === 'time' || data.event === 'seek' || data.event === 'timeupdate' || data.event === 'play' || data.event === 'pause') {
                const t = data.info?.time;
                if (typeof t === 'number' && this._resumeSeekDone) {
                    this.persistProgress(t, data.event === 'pause' || data.event === 'seek');
                }
            }

            if (data.event === 'finish' || data.event === 'ended' || data.event === 'complete') {
                if (this.state.activeContent.type === 'tv') this.advanceEpisode();
            }
        };
        window.addEventListener('message', this._soloEmbedListener);
    },

    populateSeasonSelector(data, activeSeason) {
        const btn = document.getElementById('season-selector-btn');
        const menu = document.getElementById('season-menu');
        if (!btn || !menu || !data?.seasons) return;

        const seasons = data.seasons.filter(s => s.season_number > 0);
        const active = Number(activeSeason) || seasons[0]?.season_number || 1;
        btn.textContent = `SEASON ${active}`;
        btn.setAttribute('aria-expanded', 'false');
        menu.hidden = true;
        menu.innerHTML = seasons.map(s => `
            <li role="option" class="season-menu-item${s.season_number == active ? ' is-active' : ''}"
                data-season="${s.season_number}"
                aria-selected="${s.season_number == active ? 'true' : 'false'}"
                tabindex="-1"
                onclick="Alexandria.handleSeasonChange(${s.season_number})">
                SEASON ${s.season_number}
            </li>`).join('');

        const title = document.getElementById('sidebar-title');
        if (title && data.name) title.textContent = data.name.toUpperCase();
    },

    toggleSeasonMenu(event) {
        event?.stopPropagation?.();
        const btn = document.getElementById('season-selector-btn');
        const menu = document.getElementById('season-menu');
        if (!btn || !menu) return;
        const open = menu.hidden;
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            const close = (e) => {
                if (e.target.closest?.('#season-picker')) return;
                menu.hidden = true;
                btn.setAttribute('aria-expanded', 'false');
                document.removeEventListener('click', close);
            };
            setTimeout(() => document.addEventListener('click', close), 0);
        }
    },

    async initSeasonSelector(id, activeSeason) {
        try {
            const data = await this.getJson('tv/' + id);
            this.populateSeasonSelector(data, activeSeason);
        } catch (e) {
            console.error("Alexandria Protocol: Season Init Failed -", e);
            const title = document.getElementById('sidebar-title');
            if (title) title.textContent = 'EPISODE DATA UNAVAILABLE';
        }
    },

    handleSeasonChange(newSeason) {
        const season = Number.parseInt(newSeason, 10);
        if (!Number.isInteger(season) || season < 1) return;
        const menu = document.getElementById('season-menu');
        const btn = document.getElementById('season-selector-btn');
        if (menu) menu.hidden = true;
        if (btn) btn.setAttribute('aria-expanded', 'false');
        window.location.hash = `#tv/${this.state.activeContent.id}/s/${season}/e/1`;
    },

    handleServerChange(newServerIndex) {
        const serverIndex = this.normalizeServerIndex(newServerIndex);
        if (serverIndex == null) return;
        this.applyServer(serverIndex, { resetTried: true });
    },

    async loadEpisodes(id, season) {
        try {
            const data = await this.getJson('tv/' + id + '/season/' + season);
            const container = document.getElementById('sidebar-episodes');
            if (!container) return;
            this._currentSeasonEpisodes = data.episodes || [];

            container.innerHTML = this._currentSeasonEpisodes.map(ep => {
                const watched = !!this.state.watchedEpisodes[`${id}_s${season}e${ep.episode_number}`];
                const still = ep.still_path ? this.imageUrl(ep.still_path, 'w300') : '';
                const overview = ep.overview ? this.escapeHtml(ep.overview) : 'No description on file.';
                return `
                <div class="episode-item ${this.state.activeContent.episode == ep.episode_number ? 'active' : ''}" role="link" tabindex="0"
                     aria-label="Episode ${ep.episode_number}: ${this.escapeHtml(ep.name || 'Untitled episode')}"
                     onclick="window.location.hash = '#tv/${id}/s/${season}/e/${ep.episode_number}'">
                    <div class="ep-card-media">
                        ${still ? `<img src="${still}" alt="" loading="lazy" decoding="async">` : '<div class="ep-card-fallback" aria-hidden="true"></div>'}
                        <span class="ep-num">EP ${ep.episode_number}</span>
                        <div class="ep-card-overlay">
                            <span class="ep-name">${this.escapeHtml(ep.name || 'Untitled episode')}</span>
                            <span class="ep-overview">${overview}</span>
                        </div>
                    </div>
                    <button class="ep-watched-btn ${watched ? 'active' : ''}" type="button" title="Mark episode watched" aria-label="Mark episode ${ep.episode_number} watched" aria-pressed="${watched}"
                        data-show="${id}" data-season="${season}" data-episode="${ep.episode_number}"
                        onclick="event.stopPropagation(); event.preventDefault(); Alexandria.markEpisodeWatched(${id}, ${season}, ${ep.episode_number}, !this.classList.contains('active'))">✓</button>
                </div>`;
            }).join('');
            if (this.state.view === 'player') {
                this.renderComments();
            }
        } catch (error) {
            console.error("Alexandria: Failed to load episodes", error);
            const container = document.getElementById('sidebar-episodes');
            if (container) container.innerHTML = '<div class="placeholder-msg">EPISODES UNREACHABLE</div>';
        }
    },

    // Comments Engine Methods
    // series=true: series-wide key ("tv_123") for the details page; the player
    // keeps per-episode keys ("tv_123_s2_e5") so episode comments stay scoped.
    getCommentKey(content = this.state.activeContent, series = false) {
        const { id, type, season, episode } = content || {};
        if (!id || !type) return null;
        if (type === 'tv' && !series) {
            const s = season || 1;
            const e = episode || 1;
            return `tv_${id}_s${s}_e${e}`;
        }
        if (type === 'tv') return `tv_${id}`;
        return `movie_${id}`;
    },

    // Re-render whichever community surface is on screen (details merged section or player comments).
    refreshCommunity() {
        const { type, id } = this.state.activeContent || {};
        if (this.state.view === 'details' && type && id) {
            this.renderCommunitySection(type, id);
        } else {
            this.renderComments();
        }
    },

    getComments(commentKey, series = false) {
        if (!commentKey) return Promise.resolve([]);
        const localComments = () => {
            try {
                const allComments = this.readStorageJson(localStorage, 'alexandria_comments', {}) || {};
                if (!series) return allComments[commentKey] || [];
                // Series view: gather the series key plus every per-episode key under it.
                const prefix = commentKey + '_';
                const out = [];
                for (const [k, v] of Object.entries(allComments)) {
                    if (k === commentKey || k.startsWith(prefix)) {
                        if (Array.isArray(v)) out.push(...v);
                    }
                }
                return out;
            } catch {
                return [];
            }
        };
        if (!this.supabase) return Promise.resolve(localComments());
        let query = this.supabase
            .from('comments')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
        if (series) {
            query = query.or(`comment_key.eq.${commentKey},comment_key.like.${commentKey}_%`);
        } else {
            query = query.eq('comment_key', commentKey);
        }
        return query
            .then(({ data, error }) => {
                if (error) throw error;
                const rows = (data || []).map(row => ({
                    id: row.id,
                    author: row.author,
                    text: row.content,
                    createdAt: row.created_at,
                    userId: row.user_id,
                    isMine: row.user_id === this.state.authUser?.id,
                    spoiler: !!row.spoiler
                }));
                // Pull any pre-auth localStorage comments up into the cloud once.
                this.migrateLocalComments(commentKey).catch(() => {});
                return rows;
            })
            .catch(e => {
                console.warn("Alexandria: Cloud comments unavailable, using local", e);
                return localComments();
            });
    },

    async migrateLocalComments(key) {
        if (!this.supabase || !this.state.authUser || !key) return;
        if (this._migratedCommentKeys.has(key)) return;
        this._migratedCommentKeys.add(key);
        let entries = [];
        try {
            const all = this.readStorageJson(localStorage, 'alexandria_comments', {}) || {};
            entries = Array.isArray(all[key]) ? all[key].filter(e => e && e.text) : [];
        } catch {
            return;
        }
        if (!entries.length) return;
        const userId = this.state.authUser.id;
        let failed = false;
        for (const entry of entries) {
            try {
                const { error } = await this.supabase.from('comments').insert({
                    comment_key: key,
                    author: entry.author || 'Member',
                    content: entry.text,
                    user_id: userId,
                    spoiler: !!entry.spoiler
                });
                if (error) failed = true;
            } catch {
                failed = true;
            }
        }
        if (!failed) {
            try {
                const all = this.readStorageJson(localStorage, 'alexandria_comments', {}) || {};
                if (all[key]) {
                    delete all[key];
                    localStorage.setItem('alexandria_comments', JSON.stringify(all));
                }
            } catch { /* swallow */ }
        }
    },

    async saveComment(commentKey, commentObj) {
        if (!commentKey || !commentObj) return null;
        if (this.supabase && this.state.authUser) {
            try {
                const { data, error } = await this.supabase
                    .from('comments')
                    .insert({
                        comment_key: commentKey,
                        author: commentObj.author,
                        content: commentObj.text,
                        user_id: this.state.authUser.id,
                        spoiler: !!commentObj.spoiler
                    })
                    .select();
                if (!error && data && data.length) {
                    const row = data[0];
                    return {
                        id: row.id,
                        author: row.author,
                        text: row.content,
                        createdAt: row.created_at,
                        userId: row.user_id,
                        isMine: true,
                        cloud: true,
                        spoiler: !!row.spoiler
                    };
                }
            } catch (e) {
                console.warn("Alexandria: Cloud comment insert failed, using local", e);
            }
        }
        try {
            const allComments = this.readStorageJson(localStorage, 'alexandria_comments', {}) || {};
            if (!allComments[commentKey]) allComments[commentKey] = [];
            allComments[commentKey].unshift(commentObj);
            localStorage.setItem('alexandria_comments', JSON.stringify(allComments));
        } catch (e) {
            console.error("Alexandria: Failed to save comment", e);
        }
        return commentObj;
    },

    async deleteComment(commentKey, commentId) {
        if (!commentKey || !commentId) return;
        const isLegacyLocal = String(commentId).startsWith('c_');
        if (isLegacyLocal || !this.supabase || !this.state.authUser) {
            try {
                const allComments = this.readStorageJson(localStorage, 'alexandria_comments', {}) || {};
                if (allComments[commentKey]) {
                    allComments[commentKey] = allComments[commentKey].filter(c => c.id !== commentId);
                    localStorage.setItem('alexandria_comments', JSON.stringify(allComments));
                }
            } catch (e) {
                console.error("Alexandria: Failed to delete comment", e);
            }
        } else {
            try {
                const { error } = await this.supabase.from('comments').delete().eq('id', commentId);
                if (error) throw error;
            } catch (e) {
                console.warn("Alexandria: Cloud comment delete failed", e);
                this.showToast('Could not delete comment');
                return;
            }
        }
        this.refreshCommunity();
        this.showToast('Comment deleted');
    },

    async addComment() {
        if (!this.state.authUser) {
            this.showToast('Please sign in or create an account to post comments.');
            this.toggleAuthModal(true, 'signup');
            return;
        }
        const input = document.getElementById('comment-input');
        const text = input?.value?.trim();
        if (!text) return;

        const content = this.state.activeContent;
        const key = this.getCommentKey(content);
        if (!key) return;

        const u = this.state.authUser;
        const nickname = u.user_metadata?.username || u.email?.split('@')[0] || sessionStorage.getItem('alexandria_nickname') || 'Member';

        const spoilerBox = document.getElementById('comment-spoiler');
        const commentObj = {
            id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            key,
            author: nickname,
            text,
            createdAt: new Date().toISOString(),
            isMine: true,
            spoiler: spoilerBox ? spoilerBox.checked : false
        };

        let cloudPosted = false;
        let savedLocally = false;
        try {
            if (this.supabase) {
                await this.migrateLocalComments(key);
                const profile = await this.fetchProfile(u.id);
                const saved = await this.saveComment(key, { ...commentObj, author: profile?.nickname || nickname });
                cloudPosted = !!(saved && saved.cloud);
                savedLocally = !cloudPosted; // saveComment already fell back to localStorage
            }
        } catch (e) {
            console.warn("Alexandria: Cloud comment post failed", e);
        }
        if (!cloudPosted && !savedLocally) {
            this.saveComment(key, commentObj);
        }

        input.value = '';
        this.refreshCommunity();
        this.showToast('Comment posted!');

        if (cloudPosted) {
            const tvMatch = /^tv_([0-9]+)/.exec(key);
            const movieMatch = /^movie_([0-9]+)/.exec(key);
            const match = tvMatch || movieMatch;
            this.logActivity('comment', {
                contentId: match ? parseInt(match[1], 10) : null,
                contentType: tvMatch ? 'tv' : (movieMatch ? 'movie' : null),
                title: this.state.detailsTitle || this.state.activeContent?.title || '',
                meta: JSON.stringify({ commentKey: key })
            });
        }
    },

    editNickname() {
        const current = sessionStorage.getItem('alexandria_nickname') || 'Guest';
        const name = prompt('Change your display nickname:', current);
        if (name && name.trim()) {
            const clean = name.trim().slice(0, 24);
            sessionStorage.setItem('alexandria_nickname', clean);
            localStorage.setItem('alexandria_username', clean);
            this.refreshCommunity();
            this.showToast(`Nickname updated to "${clean}"`);
        }
    },

    async renderComments(opts = {}) {
        const container = document.getElementById('comments-section-container');
        if (!container) return;

        const content = this.state.activeContent;
        if (!content || !content.id) {
            container.innerHTML = '';
            this.teardownCommentsRealtime();
            return;
        }

        const key = this.getCommentKey(content);
        if (!key) {
            container.innerHTML = '';
            this.teardownCommentsRealtime();
            return;
        }

        this.setupCommentsRealtime(key);

        const token = this._renderToken;
        if (!opts.quiet) {
            container.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING COMMENTS...</div>';
        }
        const draft = opts.quiet ? this.captureCommentDraft() : null;

        const comments = await this.getComments(key);
        if (token !== this._renderToken) return;

        const uids = [...new Set((comments || []).map(c => c.userId).filter(Boolean))];
        const profiles = await Promise.all(uids.map(uid => this.fetchProfile(uid).catch(() => null)));
        if (token !== this._renderToken) return;
        const profileById = {};
        uids.forEach((uid, i) => { if (profiles[i]) profileById[uid] = profiles[i]; });

        const me = this.state.authUser?.id;
        const myProfile = me ? await this.fetchProfile(me).catch(() => null) : null;
        if (token !== this._renderToken) return;

        const isLoggedIn = !!this.state.authUser;
        const nickname = myProfile?.nickname
            || this.state.authUser?.user_metadata?.username
            || sessionStorage.getItem('alexandria_nickname')
            || 'Member';
        const scopeBadge = content.type === 'tv'
            ? `S${content.season || 1}:E${content.episode || 1}`
            : 'MOVIE';

        const safeKey = this.escapeHtml(key);
        const rowsHtml = comments.length > 0 ? comments.map(c => {
            const profile = c.userId ? profileById[c.userId] : null;
            const authorName = profile ? (profile.nickname || profile.username || c.author || 'Member') : (c.author || 'Member');
            const initial = (c.author || 'G').charAt(0).toUpperCase();
            const safeId = this.escapeHtml(c.id);
            const avatar = c.userId && profile
                ? `<a class="comment-avatar-link" href="#profile/${this.escapeHtml(c.userId)}" aria-label="${this.escapeHtml(authorName)}">${this.avatarHtml(profile, 38)}</a>`
                : `<div class="comment-avatar" aria-hidden="true">${initial}</div>`;
            const authorNode = c.userId
                ? `<a class="comment-author comment-author-link" href="#profile/${this.escapeHtml(c.userId)}">${this.escapeHtml(authorName)}</a>`
                : `<span class="comment-author">${this.escapeHtml(authorName)}</span>`;
            return `
                <div class="comment-card">
                    ${avatar}
                    <div class="comment-body">
                        <div class="comment-meta">
                            ${authorNode}
                            <span class="comment-time">${this.escapeHtml(this.timeago(c.createdAt))}</span>
                            ${c.isMine ? `
                                <button type="button" class="comment-delete-btn" aria-label="Delete comment" title="Delete comment" data-key="${safeKey}" data-id="${safeId}" onclick="Alexandria.deleteComment('${safeKey}', '${safeId}')">✕</button>
                            ` : ''}
                        </div>
                        <p class="comment-text">${c.spoiler ? this.spoilerHtml(this.escapeHtml(c.text)) : this.escapeHtml(c.text)}</p>
                    </div>
                </div>
            `;
        }).join('') : `
            <div class="placeholder-msg comments-empty">No comments yet. Be the first to start the discussion for ${scopeBadge}!</div>
        `;

        container.innerHTML = `
            <div class="comments-widget">
                <div class="comments-header">
                    <h3>DISCUSSION & REVIEWS (${comments.length}) <span class="comments-scope-badge">${scopeBadge}</span></h3>
                    ${isLoggedIn ? `
                        <div class="comments-user-badge">
                            ${this.avatarHtml(myProfile, 28)}
                            <span>Posting as <strong>${this.escapeHtml(nickname)}</strong></span>
                            <button type="button" class="btn-text-link" onclick="Alexandria.editNickname()">CHANGE</button>
                        </div>
                    ` : ''}
                </div>

                ${isLoggedIn ? `
                    <div class="comments-composer">
                        <textarea id="comment-input" placeholder="Share your thoughts on this episode or movie..." maxlength="500" rows="3"></textarea>
                        <div class="comments-composer-footer">
                            <label class="spoiler-toggle" title="Blurs the comment until someone clicks it">
                                <input type="checkbox" id="comment-spoiler">
                                <span class="spoiler-toggle-text">Spoiler</span>
                            </label>
                            <span class="char-count">Up to 500 characters</span>
                            <button type="button" class="btn-primary" onclick="Alexandria.addComment()">POST COMMENT</button>
                        </div>
                    </div>
                ` : `
                    <div class="comments-locked-banner">
                        <div class="comments-locked-content">
                            <span class="comments-locked-icon">🔒</span>
                            <div class="comments-locked-text">
                                <strong>Join the Discussion</strong>
                                <p>Sign in or create a free account to post comments on this ${content.type === 'tv' ? 'episode' : 'movie'}.</p>
                            </div>
                        </div>
                        <button type="button" class="btn-primary" onclick="Alexandria.toggleAuthModal(true, 'signup')">CREATE ACCOUNT / SIGN IN</button>
                    </div>
                `}

                <div class="comments-list">
                    ${rowsHtml}
                </div>
            </div>
        `;
        if (draft) this.restoreCommentDraft(draft);
    },

    setupCommentsRealtime(key) {
        if (!this.supabase || !key) return;
        if (this._commentsChannelKey === key && this.commentsChannel) return;
        if (this.commentsChannel) {
            this.supabase.removeChannel(this.commentsChannel);
            this.commentsChannel = null;
        }
        this.commentsChannel = this.supabase.channel('comments_' + key);
        this.commentsChannel
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'comments',
                filter: 'comment_key=eq.' + key
            }, payload => {
                if (payload.new && payload.new.user_id !== this.state.authUser?.id) {
                    const { type, id } = this.state.activeContent || {};
                    if (this.state.view === 'details' && type && id) {
                        this.renderCommunitySection(type, id, { quiet: true });
                    } else {
                        this.renderComments({ quiet: true });
                    }
                }
            })
            .subscribe();
        this._commentsChannelKey = key;
    },

    teardownCommentsRealtime() {
        if (this.commentsChannel && this.supabase) {
            this.supabase.removeChannel(this.commentsChannel);
        }
        this.commentsChannel = null;
        this._commentsChannelKey = null;
    },

    // Cipher — spoiler tags. text is expected to be already escaped.
    spoilerHtml(text) {
        return `<span class="spoiler-block" tabindex="0" role="button" aria-label="Spoiler — click to reveal" title="Spoiler — click to reveal" onclick="Alexandria.revealSpoiler(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();Alexandria.revealSpoiler(this)}"><span class="spoiler-chip">SPOILER</span><span class="spoiler-blur">${text}</span></span>`;
    },

    revealSpoiler(el) {
        const block = el.closest('.spoiler-block');
        if (!block) return;
        const revealed = block.classList.toggle('revealed');
        block.setAttribute('aria-label', revealed ? 'Spoiler revealed' : 'Spoiler — click to reveal');
        if (revealed) block.removeAttribute('title');
    },

    captureCommentDraft(inputId = 'comment-input') {
        const input = document.getElementById(inputId);
        if (!input) return null;
        return {
            value: input.value,
            start: input.selectionStart,
            end: input.selectionEnd,
            focused: document.activeElement === input
        };
    },

    restoreCommentDraft(draft, inputId = 'comment-input') {
        if (!draft) return;
        const input = document.getElementById(inputId);
        if (!input) return;
        input.value = draft.value;
        try { input.setSelectionRange(draft.start, draft.end); } catch { /* ignore */ }
        if (draft.focused) input.focus();
    },

    // Community Ratings & Reviews Engine
    async renderCommunitySection(type, id, opts = {}) {
        const container = document.getElementById('community-section');
        if (!container) return;
        const token = this._renderToken;
        if (!opts.quiet) {
            container.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING COMMUNITY...</div>';
        }
        const reviewDraft = opts.quiet ? this.captureCommentDraft('review-input') : null;

        let rows = [];
        let ownRow = null;
        if (this.supabase) {
            try {
                const { data } = await this.supabase
                    .from('ratings')
                    .select('*')
                    .eq('content_id', Number(id))
                    .eq('content_type', type)
                    .order('created_at', { ascending: false })
                    .limit(50);
                if (token !== this._renderToken) return;
                rows = data || [];
                ownRow = rows.find(r => r.user_id === this.state.authUser?.id) || null;
                this.state._ownRatingRow = ownRow || null;
            } catch (e) {
                console.warn("Alexandria: Ratings fetch failed", e);
            }
        }
        if (token !== this._renderToken) return;

        const key = this.getCommentKey(this.state.activeContent, true);
        this.setupCommentsRealtime(key);

        const comments = key ? await this.getComments(key, true) : [];
        if (token !== this._renderToken) return;

        const profileById = {};
        if (this.supabase) {
            const uids = [...new Set([
                ...rows.map(r => r.user_id).filter(Boolean),
                ...(comments || []).map(c => c.userId).filter(Boolean)
            ])];
            const profiles = await Promise.all(uids.map(uid => this.fetchProfile(uid).catch(() => null)));
            uids.forEach((uid, i) => { if (profiles[i]) profileById[uid] = profiles[i]; });
        }
        if (token !== this._renderToken) return;

        const avg = rows.length ? rows.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / rows.length : 0;

        const badge = document.getElementById('details-avg-badge');
        if (badge) {
            if (rows.length) {
                badge.textContent = 'COMMUNITY ★ ' + avg.toFixed(1);
                badge.removeAttribute('hidden');
            } else {
                badge.setAttribute('hidden', '');
            }
        }

        const displayName = uid => {
            const p = profileById[uid];
            return p ? (p.nickname || p.username || 'Member') : 'Member';
        };
        const nameNode = uid => {
            const name = displayName(uid);
            return uid
                ? `<a class="review-author" href="#profile/${this.escapeHtml(uid)}">${this.escapeHtml(name)}</a>`
                : `<span class="review-author">${this.escapeHtml(name)}</span>`;
        };

        if (!opts.quiet) {
            this.state._ratingDraft = Math.max(0, Math.min(5, Math.round(Number(ownRow?.rating) || 0)));
        }
        const ownReview = this.state._suppressReviewPrefill ? '' : (ownRow?.review || '');
        if (this.state._suppressReviewPrefill) this.state._suppressReviewPrefill = false;

        const composer = this.state.authUser ? `
            <div class="ratings-composer" id="ratings-composer">
                <div class="rate-stars-row">
                    ${Array.from({ length: 5 }, (_, i) => i + 1).map(n => `
                        <span class="rate-star ${n <= this.state._ratingDraft ? 'filled' : ''}" data-rating="${n}" onclick="Alexandria.setRatingDraft(${n})" role="button" tabindex="0" aria-label="Rate ${n} of 5">${n <= this.state._ratingDraft ? '★' : '☆'}</span>
                    `).join('')}
                </div>
                <textarea id="review-input" placeholder="Write your review or comment..." maxlength="1000" rows="4">${this.escapeHtml(ownReview)}</textarea>
                <div class="ratings-composer-footer">
                    <label class="spoiler-toggle" title="Blurs the review until someone clicks it">
                        <input type="checkbox" id="review-spoiler" ${ownRow?.spoiler ? 'checked' : ''}>
                        <span class="spoiler-toggle-text">Spoiler</span>
                    </label>
                    <button type="button" class="btn-primary" onclick="Alexandria.submitRating('${type}', ${id})">${ownRow ? 'UPDATE REVIEW' : 'SUBMIT'}</button>
                    ${ownRow ? `<button type="button" class="btn-secondary" onclick="Alexandria.deleteRating('${ownRow.id}')">DELETE MY REVIEW</button>` : ''}
                </div>
            </div>
        ` : `
            <div class="ratings-locked-banner">
                <span class="ratings-locked-text">SIGN IN to rate and review this title.</span>
                <button type="button" class="btn-primary" onclick="Alexandria.toggleAuthModal(true, 'signup')">SIGN IN / CREATE ACCOUNT</button>
            </div>
        `;

        const safeKey = this.escapeHtml(key || '');
        const ratingEntries = rows.map(r => {
            const n = Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0)));
            const isMine = Boolean(this.state.authUser && r.user_id === this.state.authUser.id);
            return {
                ts: new Date(r.created_at || 0).getTime(),
                html: `
                <div class="review-card">
                    ${r.user_id ? `<a class="review-avatar-link" href="#profile/${this.escapeHtml(r.user_id)}">${this.avatarHtml(profileById[r.user_id], 36)}</a>` : this.avatarHtml(null, 36)}
                    <div class="review-body">
                        <div class="review-meta">
                            ${nameNode(r.user_id)}
                            <span class="review-stars" aria-label="Rated ${n} of 5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>
                            <span class="review-time">${this.escapeHtml(this.timeago(r.created_at))}</span>
                        </div>
                        ${r.review ? `<p class="review-text">${r.spoiler ? this.spoilerHtml(this.escapeHtml(r.review)) : this.escapeHtml(r.review)}</p>` : ''}
                    </div>
                    ${isMine ? `
                        <div class="review-actions">
                            <button type="button" class="btn-text-link" onclick="Alexandria.deleteRating('${r.id}')">DELETE</button>
                        </div>
                    ` : ''}
                </div>
            `};
        });

        const commentEntries = (comments || []).map(c => {
            const profile = c.userId ? profileById[c.userId] : null;
            const authorName = profile ? (profile.nickname || profile.username || c.author || 'Member') : (c.author || 'Member');
            const initial = (c.author || 'G').charAt(0).toUpperCase();
            const safeId = this.escapeHtml(c.id);
            const avatar = c.userId && profile
                ? `<a class="comment-avatar-link" href="#profile/${this.escapeHtml(c.userId)}" aria-label="${this.escapeHtml(authorName)}">${this.avatarHtml(profile, 38)}</a>`
                : `<div class="comment-avatar" aria-hidden="true">${initial}</div>`;
            const authorNode = c.userId
                ? `<a class="comment-author comment-author-link" href="#profile/${this.escapeHtml(c.userId)}">${this.escapeHtml(authorName)}</a>`
                : `<span class="comment-author">${this.escapeHtml(authorName)}</span>`;
            return {
                ts: new Date(c.createdAt || 0).getTime(),
                html: `
                <div class="comment-card">
                    ${avatar}
                    <div class="comment-body">
                        <div class="comment-meta">
                            ${authorNode}
                            <span class="comment-time">${this.escapeHtml(this.timeago(c.createdAt))}</span>
                            ${c.isMine ? `
                                <button type="button" class="comment-delete-btn" aria-label="Delete comment" title="Delete comment" data-key="${safeKey}" data-id="${safeId}" onclick="Alexandria.deleteComment('${safeKey}', '${safeId}')">✕</button>
                            ` : ''}
                        </div>
                        <p class="comment-text">${c.spoiler ? this.spoilerHtml(this.escapeHtml(c.text)) : this.escapeHtml(c.text)}</p>
                    </div>
                </div>
            `};
        });

        const mergedHtml = [...ratingEntries, ...commentEntries]
            .sort((a, b) => b.ts - a.ts)
            .map(e => e.html)
            .join('');

        const scopeBadge = type === 'tv' ? 'SERIES' : 'MOVIE';

        container.innerHTML = `
            <div class="community-section">
                <div class="ratings-header">
                    <h3>COMMUNITY <span class="comments-scope-badge">${scopeBadge}</span></h3>
                    <span class="ratings-average">${rows.length ? `★ ${avg.toFixed(1)} · ${rows.length} RATING${rows.length === 1 ? '' : 'S'}` : 'NO RATINGS YET — be the first'}</span>
                </div>
                ${composer}
                <div class="community-list">
                    ${mergedHtml || '<div class="placeholder-msg comments-empty">No ratings or comments yet. Be the first to rate and start the discussion!</div>'}
                </div>
            </div>
        `;
        if (reviewDraft) this.restoreCommentDraft(reviewDraft, 'review-input');
    },

    setRatingDraft(n, scrollToComposer = false) {
        const val = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
        this.state._ratingDraft = (this.state._ratingDraft === val) ? 0 : val;
        document.querySelectorAll('.rate-star').forEach(star => {
            const rating = Number(star.dataset.rating);
            star.classList.toggle('filled', rating <= this.state._ratingDraft);
            star.textContent = rating <= this.state._ratingDraft ? '★' : '☆';
        });
        if (scrollToComposer) {
            const composer = document.getElementById('ratings-composer');
            if (composer) composer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    async submitRating(type, id) {
        const rating = this.state._ratingDraft;
        if (!rating || rating < 1) {
            this.showToast('Pick a star rating first');
            return;
        }
        if (!this.supabase || !this.state.authUser) {
            this.showToast('Please sign in or create an account to rate titles.');
            this.toggleAuthModal(true, 'signup');
            return;
        }
        const input = document.getElementById('review-input');
        const review = (input?.value || '').trim();
        const spoilerBox = document.getElementById('review-spoiler');
        const spoiler = spoilerBox ? spoilerBox.checked : false;
        const existing = this.state._ownRatingRow;
        try {
            const { error } = await this.supabase.from('ratings').upsert({
                user_id: this.state.authUser.id,
                content_id: Number(id),
                content_type: type,
                rating,
                review,
                spoiler,
                created_at: existing ? existing.created_at : new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,content_id,content_type' });
            if (error) {
                this.showToast('Could not save your rating.');
                return;
            }
        } catch {
            this.showToast('Could not save your rating.');
            return;
        }

        // Post the review text as a comment in the same submission.
        // Reviews are series-wide for TV, so use the series key (not the player's per-episode key).
        if (review) {
            const key = this.getCommentKey(this.state.activeContent, true);
            if (key) {
                try {
                    await this.migrateLocalComments(key);
                    const u = this.state.authUser;
                    const nickname = u.user_metadata?.username || u.email?.split('@')[0] || sessionStorage.getItem('alexandria_nickname') || 'Member';
                    const profile = await this.fetchProfile(u.id).catch(() => null);
                    await this.saveComment(key, { author: profile?.nickname || nickname, text: review, spoiler });
                } catch (e) {
                    console.warn("Alexandria: Comment insert after review failed", e);
                }
            }
        }

        this.showToast(review ? 'Review posted!' : 'Rating saved!');
        if (input) input.value = '';
        this.state._suppressReviewPrefill = true;
        this.renderCommunitySection(type, id);
        this.logActivity(review ? 'reviewed' : 'rated', {
            contentId: id,
            contentType: type,
            title: this.state.detailsTitle,
            posterPath: this.state.detailsPoster,
            meta: JSON.stringify({ rating })
        });
    },

    async deleteRating(rowId) {
        if (!this.supabase || !this.state.authUser) return;
        try {
            const { error } = await this.supabase.from('ratings').delete().eq('id', rowId);
            if (error) {
                this.showToast('Could not delete your review.');
                return;
            }
        } catch {
            this.showToast('Could not delete your review.');
            return;
        }
        this.showToast('Review deleted');
        this.state._ratingDraft = 0;
        const { id, type } = this.state.activeContent;
        this.renderCommunitySection(type, id);
    },

    // User Auth & Unique Username Engine
    toggleAuthModal(open, tab = 'login') {
        const modal = document.getElementById('auth-modal');
        if (!modal) return;
        const show = open !== undefined ? Boolean(open) : modal.hasAttribute('hidden');
        if (show) {
            modal.removeAttribute('hidden');
            this.renderAuthModal(tab);
        } else {
            modal.setAttribute('hidden', '');
        }
    },

    toggleAccountMenu() {
        this.closeChangelogMenu();
        const menu = document.getElementById('account-menu');
        if (!menu) return;
        if (!menu.hasAttribute('hidden')) {
            this.closeAccountMenu();
            return;
        }
        const signedIn = Boolean(this.state.authUser);
        menu.innerHTML = `
            <a href="#community" class="account-menu-item" onclick="Alexandria.closeAccountMenu()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                Community
            </a>
            ${signedIn ? `
                <button type="button" class="account-menu-item" onclick="Alexandria.closeAccountMenu(); window.location.hash = '#profile/${this.escapeHtml(this.state.authUser.id)}'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    My Profile
                </button>
            ` : ''}
            <div class="account-menu-divider"></div>
            ${signedIn
                ? `<button type="button" class="account-menu-item" onclick="Alexandria.signOut()">Sign Out</button>`
                : `<button type="button" class="account-menu-item" onclick="Alexandria.closeAccountMenu(); Alexandria.toggleAuthModal(true, 'login')">Sign In / Create Account</button>`}
        `;
        menu.removeAttribute('hidden');
    },

    closeAccountMenu() {
        const menu = document.getElementById('account-menu');
        if (menu) menu.setAttribute('hidden', '');
    },

    // ============ WHAT'S NEW — changelog bell ============
    CHANGELOG: [
        {
            key: 'v1.7',
            date: 'Aug 20, 2026',
            title: 'Sharper Similar, Tighter Franchises, Fresh Feeds',
            items: [
                'Similar titles now skip the title you are already on, drop poster-less stragglers, and fall back to a MORE LIKE THIS genre scan when TMDB comes up empty',
                'Franchises page trimmed to real franchises — single-show stragglers like Lost are gone; filter by genre and sort A→Z, Z→A, or by title count',
                'New avatar sets from Suits, Lost, Breaking Bad, and Reacher in the profile picker',
                'Community feed shows only the last 24h — stale comments and list events clear out on their own while watch hours, streaks, and heatmaps stay untouched',
                'Player hardened: backup servers when Premium dies, embed pop-up and tab-hijack blocking, and Firefox/Safari stream fixes'
            ]
        },
        {
            key: 'v1.6',
            date: 'Aug 19, 2026',
            title: 'Cross-Device Sync & Mobile',
            items: [
                'Episode progress now syncs across devices — your "up next" and watched marks follow you everywhere',
                'TV player fixed on phones',
                'Cleaner mobile browsing: shorter heroes, less clutter, swipeable filters'
            ]
        },
        {
            key: 'v1.5',
            date: 'Aug 18, 2026',
            title: 'Pulse, Cipher & The Leaderboard',
            items: [
                'Profile watch stats: hours watched, episodes, day streaks, and a 16-week activity heatmap',
                '10 earnable badges — hover any badge to see how you earned it',
                'Weekly top-5 leaderboard of the most active watchers',
                'Spoiler tags blur comments and reviews until you tap them',
                'Walking Dead actor avatars (Rick, Daryl, Michonne, Glenn, Maggie, Carol, Negan)'
            ]
        },
        {
            key: 'v1.4',
            title: 'The Community Era',
            items: [
                'Profiles with avatars, bios, and follows',
                'Live activity feed with a following filter',
                'Ratings, reviews, and upgraded comments with profiles',
                'Shared movie night lists for planning with friends'
            ]
        },
        {
            key: 'v1.3',
            title: 'Player',
            items: [
                'Episode grid cards with hover previews in the sidebar',
                'Fixes for long TV seasons'
            ]
        },
        {
            key: 'v1.2',
            title: 'Discovery',
            items: [
                'Advanced search filters and a roulette mode that picks for you',
                'Trailer previews on hover',
                'Because-You-Watched recommendations',
                'Releasing This Week row on the homepage'
            ]
        },
        {
            key: 'v1.1',
            title: 'Watchlist & Franchises',
            items: [
                'Watchlist statuses: TO WATCH, WATCHING, WATCHED',
                'Per-episode tracking for TV shows',
                'Expandable franchise collections — 14 new universes added'
            ]
        }
    ],

    updateChangelogDot() {
        const dot = document.getElementById('changelog-dot');
        if (!dot) return;
        const latest = this.CHANGELOG[0];
        const seen = localStorage.getItem('alexandria_changelog_seen');
        dot.hidden = !(latest && seen !== latest.key);
    },

    toggleChangelogMenu() {
        this.closeAccountMenu();
        const menu = document.getElementById('changelog-menu');
        if (!menu) return;
        if (!menu.hasAttribute('hidden')) {
            this.closeChangelogMenu();
            return;
        }
        // "NEW" badge only while the latest release is unread — same state the dot tracks.
        const latestSeen = localStorage.getItem('alexandria_changelog_seen');
        menu.innerHTML = `
            <div class="changelog-menu-head">
                <h3>What's New</h3>
                <span class="changelog-date">${this.escapeHtml(this.CHANGELOG[0].date || '')}</span>
            </div>
        ` + this.CHANGELOG.map((entry, i) => `
            <div class="changelog-entry">
                <div class="changelog-entry-head">
                    <span class="changelog-version">${this.escapeHtml(entry.key)}${i === 0 && latestSeen !== entry.key ? ' <em class="changelog-new">NEW</em>' : ''}</span>
                    ${entry.date ? `<span class="changelog-date">${this.escapeHtml(entry.date)}</span>` : ''}
                </div>
                <h4 class="changelog-title">${this.escapeHtml(entry.title)}</h4>
                <ul class="changelog-items">
                    ${entry.items.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}
                </ul>
            </div>
        `).join('');
        menu.removeAttribute('hidden');
        // Opening marks the latest release as seen.
        const latest = this.CHANGELOG[0];
        if (latest) localStorage.setItem('alexandria_changelog_seen', latest.key);
        this.updateChangelogDot();
    },

    closeChangelogMenu() {
        const menu = document.getElementById('changelog-menu');
        if (menu) menu.setAttribute('hidden', '');
    },

    signOut() {
        this.closeAccountMenu();
        this.handleSignOut();
    },

    renderAuthModal(tab = 'login') {
        const body = document.getElementById('auth-modal-body');
        if (!body) return;

        if (this.state.authUser) {
            const u = this.state.authUser;
            const name = u.user_metadata?.username || u.email || 'User';
            const initial = name.charAt(0).toUpperCase();
            const profileHash = '#profile/' + encodeURIComponent(u.id);
            body.innerHTML = `
                <div class="auth-profile-card">
                    <div class="auth-profile-avatar">${this.escapeHtml(initial)}</div>
                    <div class="auth-profile-info">
                        <h3>${this.escapeHtml(name)}</h3>
                        <p>${this.escapeHtml(u.email || 'Verified Account')}</p>
                    </div>
                    <button type="button" class="btn-primary" style="width: 100%; margin-top: 1rem;" onclick="Alexandria.toggleAuthModal(false); window.location.hash = '${profileHash}'">VIEW PROFILE</button>
                    <button type="button" class="btn-secondary" style="width: 100%; margin-top: 0.5rem;" onclick="Alexandria.editProfileModal(true)">EDIT PROFILE</button>
                    <button type="button" class="btn-secondary" style="width: 100%; margin-top: 0.5rem;" onclick="Alexandria.handleSignOut()">LOG OUT</button>
                </div>
            `;
            return;
        }

        body.innerHTML = `
            <div class="auth-tabs">
                <button type="button" class="auth-tab-btn ${tab === 'login' ? 'active' : ''}" onclick="Alexandria.renderAuthModal('login')">SIGN IN</button>
                <button type="button" class="auth-tab-btn ${tab === 'signup' ? 'active' : ''}" onclick="Alexandria.renderAuthModal('signup')">CREATE ACCOUNT</button>
            </div>

            ${tab === 'login' ? `
                <form class="auth-form" onsubmit="Alexandria.handleSignIn(event)">
                    <div class="auth-field">
                        <label>Email Address</label>
                        <input type="email" id="auth-email" placeholder="name@example.com" required>
                    </div>
                    <div class="auth-field">
                        <label>Password</label>
                        <input type="password" id="auth-password" placeholder="••••••••" required>
                    </div>
                    <button type="submit" class="btn-primary" style="width: 100%; margin-top: 0.5rem;">SIGN IN</button>
                </form>
            ` : `
                <form class="auth-form" onsubmit="Alexandria.handleSignUp(event)">
                    <div class="auth-field">
                        <label>Unique Username</label>
                        <input type="text" id="auth-username" placeholder="Pick a unique handle" required minlength="3" maxlength="20">
                    </div>
                    <div class="auth-field">
                        <label>Email Address</label>
                        <input type="email" id="auth-email" placeholder="name@example.com" required>
                    </div>
                    <div class="auth-field">
                        <label>Password</label>
                        <input type="password" id="auth-password" placeholder="Min 6 characters" required minlength="6">
                    </div>
                    <button type="submit" class="btn-primary" style="width: 100%; margin-top: 0.5rem;">CREATE ACCOUNT</button>
                </form>
            `}
        `;
    },

    async checkUsernameUnique(username, excludeId = null) {
        const clean = username.trim().toLowerCase();
        if (!this.supabase) {
            const usedNames = this.readStorageJson(localStorage, 'alexandria_claimed_usernames', []) || [];
            return !usedNames.includes(clean);
        }
        try {
            let query = this.supabase
                .from('profiles')
                .select('username')
                .eq('username_lower', clean);
            if (excludeId) query = query.neq('id', excludeId);
            const { data, error } = await query.maybeSingle();
            if (error && error.code !== 'PGRST116') console.warn("Supabase username check:", error);
            return !data;
        } catch {
            return true;
        }
    },

    async handleSignUp(e) {
        if (e) e.preventDefault();
        const usernameInput = document.getElementById('auth-username');
        const emailInput = document.getElementById('auth-email');
        const passwordInput = document.getElementById('auth-password');

        const username = usernameInput?.value?.trim();
        const email = emailInput?.value?.trim();
        const password = passwordInput?.value;

        if (!username || !email || !password) return;

        const isUnique = await this.checkUsernameUnique(username);
        if (!isUnique) {
            this.showToast(`Username "${username}" is already taken! Try another.`);
            usernameInput.focus();
            return;
        }

        if (this.supabase) {
            try {
                const redirectUrl = window.location.origin + window.location.pathname;
                const { data, error } = await this.supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: redirectUrl,
                        data: { username }
                    }
                });

                if (error) {
                    this.showToast(`Sign up failed: ${error.message}`);
                    return;
                }

                if (data?.session && data?.user) {
                    // Email verification disabled or auto-confirmed
                    await this.ensureUserProfile(data.user, username);
                    sessionStorage.setItem('alexandria_nickname', username);
                    localStorage.setItem('alexandria_username', username);
                    this.state.authUser = data.user;
                    this.updateAuthUI();
                    this.toggleAuthModal(false);
                    this.showToast(`Account created! Welcome, ${username}.`);
                } else if (data?.user) {
                    // Email verification required by Supabase settings
                    this.toggleAuthModal(false);
                    this.showToast("Account created! Please check your email to verify your account.");
                }
            } catch (err) {
                console.error("Sign up error:", err);
                this.showToast("Registration error. Check network connection.");
            }
        } else {
            const usedNames = this.readStorageJson(localStorage, 'alexandria_claimed_usernames', []) || [];
            usedNames.push(username.toLowerCase());
            localStorage.setItem('alexandria_claimed_usernames', JSON.stringify(usedNames));
            sessionStorage.setItem('alexandria_nickname', username);
            localStorage.setItem('alexandria_username', username);
            this.updateAuthUI();
            this.toggleAuthModal(false);
            this.showToast(`Profile saved! Hello, ${username}.`);
        }
    },

    async handleSignIn(e) {
        if (e) e.preventDefault();
        const emailInput = document.getElementById('auth-email');
        const passwordInput = document.getElementById('auth-password');
        const email = emailInput?.value?.trim();
        const password = passwordInput?.value;

        if (!email || !password) return;

        if (this.supabase) {
            try {
                const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
                if (error) {
                    this.showToast(`Sign in failed: ${error.message}`);
                    return;
                }
                const username = data.user?.user_metadata?.username || email.split('@')[0];
                // Self-heal: users who signed up under email verification have no
                // profile row (signup returned no session, so the client could not
                // insert one). Ensure it exists now that we have a session.
                await this.ensureUserProfile(data.user, username);
                sessionStorage.setItem('alexandria_nickname', username);
                localStorage.setItem('alexandria_username', username);
                this.state.authUser = data.user;
                this.updateAuthUI();
                this.toggleAuthModal(false);
                this.showToast(`Welcome back, ${username}!`);
            } catch (err) {
                console.error("Sign in error:", err);
                this.showToast("Sign in failed. Check credentials.");
            }
        } else {
            this.showToast("Supabase cloud required for authentication.");
        }
    },

    async handleSignOut() {
        if (this.supabase) {
            await this.supabase.auth.signOut();
        }
        this.state.authUser = null;
        sessionStorage.removeItem('alexandria_nickname');
        localStorage.removeItem('alexandria_username');
        this.updateAuthUI();
        this.toggleAuthModal(false);
        if (this.state.view === 'details' || this.state.view === 'player') {
            this.refreshCommunity();
        }
        this.showToast("Logged out successfully.");
    },

    updateAuthUI() {
        const btnLabel = document.getElementById('auth-btn-label');
        if (!btnLabel) return;

        if (this.state.authUser) {
            const fallback = this.state.authUser.user_metadata?.username
                || sessionStorage.getItem('alexandria_nickname')
                || localStorage.getItem('alexandria_username')
                || this.state.authUser.email?.split('@')[0]
                || 'Account';
            btnLabel.textContent = fallback;
            this.fetchProfile(this.state.authUser.id).then(profile => {
                const current = document.getElementById('auth-btn-label');
                if (current && this.state.authUser && profile?.nickname) {
                    current.textContent = profile.nickname;
                }
            }).catch(() => {});
        } else {
            btnLabel.textContent = 'Account';
        }
    },

    async ensureUserProfile(user, preferredUsername) {
        if (!this.supabase || !user) return;
        const base = preferredUsername || user.user_metadata?.username || user.email?.split('@')[0] || 'User';
        for (let attempt = 0; attempt < 3; attempt++) {
            const username = attempt === 0 ? base : `${base}${attempt + 1}`;
            try {
                await this.supabase.from('profiles').upsert({
                    id: user.id,
                    username,
                    username_lower: username.toLowerCase(),
                    nickname: username,
                    created_at: new Date().toISOString()
                }, { onConflict: 'id' });
                return;
            } catch (err) {
                // 23505 = unique_violation: this @ is taken (someone raced the
                // signup). Retry with a numbered suffix rather than silently
                // failing to create the profile.
                const isDuplicate = err && (err.code === '23505' || /duplicate key/.test(err.message || ''));
                if (!isDuplicate) {
                    console.warn("Profile sync note:", err);
                    return;
                }
            }
        }
    },

    async bindAuthListeners() {
        if (!this.supabase) return;
        try {
            const { data } = await this.supabase.auth.getSession();
            if (data?.session?.user) {
                this.state.authUser = data.session.user;
                const username = data.session.user.user_metadata?.username || data.session.user.email?.split('@')[0];
                if (username) {
                    sessionStorage.setItem('alexandria_nickname', username);
                    localStorage.setItem('alexandria_username', username);
                }
                this.ensureUserProfile(data.session.user, username);
            } else {
                this.state.authUser = null;
            }
        } catch (err) {
            console.warn("Session restore note:", err);
            this.state.authUser = null;
        }

        this.updateAuthUI();

        this.supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                this.state.authUser = session.user;
                const username = session.user.user_metadata?.username || session.user.email?.split('@')[0];
                if (username) {
                    sessionStorage.setItem('alexandria_nickname', username);
                    localStorage.setItem('alexandria_username', username);
                }
                this.ensureUserProfile(session.user, username);
                if (event === 'SIGNED_IN') {
                    this.showToast(`Welcome back, ${username || 'user'}!`);
                }
            } else {
                this.state.authUser = null;
                sessionStorage.removeItem('alexandria_nickname');
                localStorage.removeItem('alexandria_username');
            }
            this.updateAuthUI();
            await this.syncFromCloud();
            if (this.state.view === 'details' || this.state.view === 'player') {
                this.refreshCommunity();
            }
        });
    },

    async renderParty() {
        if (!this.state.authUser) {
            this.showToast('Watch Party requires an account. Please sign in or create an account.');
            window.location.hash = '#home';
            this.toggleAuthModal(true, 'signup');
            return;
        }
        const { id, type, season, episode } = this.state.activeContent;
        const roomId = this.state.partyRoomId;
        const sameRoom = this.partyChannel && this.state.partyRoomId === roomId;

        // Prefer an API-capable EmbedMaster mirror so play/pause can sync.
        if (!this.servers[this.state.activeServer]?.supportsApi) {
            const alexIdx = this.servers.findIndex(s => s.name === 'Alexandria' && s.supportsApi);
            this.state.activeServer = alexIdx !== -1 ? alexIdx : Math.max(0, this.servers.findIndex(s => s.supportsApi));
        }
        const embedUrl = this.buildEmbedUrl(this.state.activeServer);
        const apiServerOptions = this.servers
            .map((s, i) => ({ ...s, index: i }))
            .filter(s => s.supportsApi)
            .map(s => `<option value="${s.index}" ${s.index === this.state.activeServer ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>`)
            .join('');

        // Creator is host immediately — don't wait for presence (fixes play/pause never broadcasting).
        const isCreator = sessionStorage.getItem('alexandria_party_creator_' + roomId) === '1';
        this.isHost = isCreator || this.isHost;

        const roleLabel = this.isHost ? 'Host' : 'Guest';
        const roleClass = this.isHost ? 'party-role is-host' : 'party-role';

        this.main.innerHTML = `
            <section class="party-layout">
                <div class="party-stage">
                    <header class="party-topbar">
                        <h2 class="party-title">${this.escapeHtml(roomId)}</h2>
                        <span id="party-role-badge" class="${roleClass}">${roleLabel}</span>
                        <span id="party-users-count" class="party-users">1 here</span>
                        <label class="party-server-label">Server
                            <select id="party-server-selector" ${this.isHost ? '' : 'disabled'} onchange="Alexandria.handlePartyServerChange(this.value)">
                                ${apiServerOptions}
                            </select>
                        </label>
                        <button type="button" id="party-sync-clock" class="party-clock" title="Click to set sync time (e.g. 16:57)" onclick="Alexandria.partyEditSyncClock()" style="display: ${this.isHost ? 'inline-flex' : 'none'};">0:00</button>
                        <button type="button" id="party-guest-sync" class="party-sync-link" onclick="Alexandria.partyGuestSync()" style="display: ${this.isHost ? 'none' : 'inline-flex'};">Sync</button>
                        <span id="party-sync-clock-guest" class="party-clock party-clock--static" style="display: ${this.isHost ? 'none' : 'inline-flex'};">0:00</span>
                        <button type="button" class="btn-secondary party-invite" onclick="Alexandria.copyPartyLink()">Invite</button>
                    </header>

                    <div class="party-screen">
                        <iframe id="embedmaster_iframe" title="Watch Party" src="${embedUrl}" ${this.playerIframeFlags()}></iframe>
                        <div id="party-spectate-veil" class="party-hint" style="display: ${this.isHost ? 'none' : 'block'};">
                            Hit <strong>Play Now</strong> in the player, then Sync if needed
                        </div>
                    </div>

                    ${type === 'tv' ? `
                    <div class="party-episodes-wrap">
                        <div class="party-episode-bar">
                            <label>Season
                                <select id="party-season-selector" ${this.isHost ? '' : 'disabled'} onchange="Alexandria.partyChangeSeason(this.value)"></select>
                            </label>
                            <span id="party-ep-label" class="party-ep-now">S${season} · E${episode}</span>
                        </div>
                        <div id="party-episodes" class="party-episodes"></div>
                    </div>
                    ` : ''}
                </div>

                <aside class="party-rail">
                    <div class="party-rail-head">People</div>
                    <div class="party-people" id="party-people">
                        <div class="party-person"><span class="party-person-dot" aria-hidden="true"></span><span class="party-person-name">You</span><span class="party-person-tag party-person-tag--you">YOU</span></div>
                    </div>
                    <div class="party-rail-head">Chat</div>
                    <div class="party-chat-messages" id="party-chat-messages">
                        <div class="party-chat-msg system">You’re in.</div>
                    </div>
                    <div class="party-chat-compose">
                        <input type="text" id="party-chat-input" placeholder="Message…" maxlength="280" onkeypress="if(event.key === 'Enter') Alexandria.sendPartyChatMessage()">
                        <button type="button" class="btn-primary" onclick="Alexandria.sendPartyChatMessage()">Send</button>
                    </div>
                </aside>
            </section>`;

        if (!this.readStorage(sessionStorage, 'alexandria_nickname')) {
            let nickname = '';
            try {
                nickname = prompt('Enter a nickname for the Watch Party:') || '';
            } catch {
                nickname = '';
            }
            if (!nickname.trim()) nickname = 'Guest_' + Math.floor(Math.random() * 1000);
            this.writeStorage(sessionStorage, 'alexandria_nickname', nickname.trim().slice(0, 24));
        }
        if (!this.readStorage(sessionStorage, 'alexandria_party_uid')) {
            this.writeStorage(
                sessionStorage,
                'alexandria_party_uid',
                (typeof crypto !== 'undefined' && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : `uid_${Date.now()}_${Math.random().toString(36).slice(2)}`
            );
        }

        if (type === 'tv') {
            this.initPartyEpisodeUI(id, season, episode);
        }

        const partyFrame = document.getElementById('embedmaster_iframe');
        this.bindPartyFrame(partyFrame);
        this.scheduleEmbedTheme(partyFrame);

        if (sameRoom) {
            this.updatePartyRoleUI();
            return;
        }
        this.initPartySync(roomId);
    },

    async initPartyEpisodeUI(id, activeSeason, activeEpisode) {
        try {
            const show = await this.getJson('tv/' + id);
            const selector = document.getElementById('party-season-selector');
            if (selector && show?.seasons) {
                selector.innerHTML = show.seasons
                    .filter(s => s.season_number > 0)
                    .map(s => `<option value="${s.season_number}" ${s.season_number == activeSeason ? 'selected' : ''}>Season ${s.season_number}</option>`)
                    .join('');
                selector.disabled = !this.isHost;
            }
            await this.loadPartyEpisodes(id, activeSeason, activeEpisode);
        } catch (e) {
            console.error('Alexandria Protocol: Party episode UI failed -', e);
        }
    },

    async loadPartyEpisodes(id, season, activeEpisode) {
        this._partyEpisodesLoadedKey = `${id}|${season || 1}|${activeEpisode || 1}`;
        try {
            const data = await this.getJson('tv/' + id + '/season/' + season);
            const container = document.getElementById('party-episodes');
            if (!container) return;
            this._currentSeasonEpisodes = data.episodes || [];
            const canPick = this.isHost;
            container.innerHTML = this._currentSeasonEpisodes.map(ep => `
                <div class="episode-item ${activeEpisode == ep.episode_number ? 'active' : ''}" role="button" tabindex="0"
                     ${canPick ? `onclick="Alexandria.partySelectEpisode(${ep.episode_number})"` : 'style="cursor:default;opacity:0.7"'}>
                    <span class="ep-num">EP ${ep.episode_number}</span>
                    <span class="ep-name">${this.escapeHtml(ep.name || 'Untitled')}</span>
                </div>`).join('');
        } catch (e) {
            const container = document.getElementById('party-episodes');
            if (container) container.innerHTML = '<div class="placeholder-msg">Episodes unavailable.</div>';
        }
    },

    partyChangeSeason(newSeason) {
        if (!this.isHost) return;
        const season = Number.parseInt(newSeason, 10);
        if (!Number.isInteger(season) || season < 1) return;
        this.partySetContent({ season, episode: 1 });
    },

    partySelectEpisode(episode) {
        if (!this.isHost) return;
        const ep = Number.parseInt(episode, 10);
        if (!Number.isInteger(ep) || ep < 1) return;
        this.partySetContent({ episode: ep });
    },

    partySetContent({ season, episode } = {}) {
        if (!this.isHost || !this.partyChannel) return;
        const content = this.state.activeContent;
        if (season != null) content.season = season;
        if (episode != null) content.episode = episode;

        const { id, type } = content;
        const s = content.season || 1;
        const e = content.episode || 1;
        const frame = document.getElementById('embedmaster_iframe');
        if (frame && type === 'tv') {
            this._partyFrameReloading = true;
            frame.src = this.buildEmbedUrl(this.state.activeServer, content);
            this.bindPartyFrame(frame);
            this.armPartyEmbedWatch();
            this.scheduleHostPartyResync();
        }

        const hash = type === 'tv'
            ? `#party/${this.state.partyRoomId}/${type}/${id}/s/${s}/e/${e}`
            : `#party/${this.state.partyRoomId}/${type}/${id}`;
        history.replaceState(null, '', hash);

        const label = document.getElementById('party-ep-label');
        if (label) label.textContent = `S${s} · E${e}`;
        if (type === 'tv') this.loadPartyEpisodes(id, s, e);

        this.broadcastPartyContent();
        this.appendChatMessage('System', `Host switched to S${s}E${e}`);
    },

    broadcastPartyContent() {
        if (!this.partyChannel || !this.isHost) return;
        const { id, type, season, episode } = this.state.activeContent;
        const raw = Number(this._partyLastTime) || 0;
        this.partyChannel.send({
            type: 'broadcast',
            event: 'content_sync',
            payload: {
                type,
                id,
                season: season || 1,
                episode: episode || 1,
                serverIndex: Number(this.state.activeServer),
                time: raw,
                clock: raw,
                paused: this.isPartyPaused()
            }
        });
    },

    applyPartyContent(payload) {
        if (!payload || this.isHost) return;
        const { type, id, season, episode, time, paused, serverIndex } = payload;
        if (!type || !id) return;

        // Coerce — Realtime payloads sometimes arrive with stringified numbers.
        const idx = this.normalizeServerIndex(serverIndex);
        const serverChanged = idx != null
            && this.servers[idx]?.supportsApi
            && idx !== Number(this.state.activeServer);

        if (serverChanged) {
            this.state.activeServer = idx;
            const partySelector = document.getElementById('party-server-selector');
            if (partySelector) partySelector.value = String(idx);
        }

        const prev = this.state.activeContent;
        const changed = serverChanged
            || prev.type !== type || String(prev.id) !== String(id)
            || Number(prev.season) !== Number(season || 1)
            || Number(prev.episode) !== Number(episode || 1);

        this.state.activeContent = {
            ...prev,
            type,
            id,
            season: season || 1,
            episode: episode || 1
        };

        if (changed) {
            this._partyGuestUnlocked = false;
            this._partyFrameReloading = true;
            this._partyEmbedHealthy = false;
            const frame = document.getElementById('embedmaster_iframe');
            if (frame) {
                const nextUrl = this.buildEmbedUrl(this.state.activeServer, this.state.activeContent);
                // Force a reload even if the browser thinks the URL is unchanged.
                if (frame.src === nextUrl) frame.src = 'about:blank';
                frame.src = nextUrl;
                this.bindPartyFrame(frame);
                this.scheduleEmbedTheme(frame);
                this.armPartyEmbedWatch();
            }
            const hash = type === 'tv'
                ? `#party/${this.state.partyRoomId}/${type}/${id}/s/${season || 1}/e/${episode || 1}`
                : `#party/${this.state.partyRoomId}/${type}/${id}`;
            history.replaceState(null, '', hash);

            const label = document.getElementById('party-ep-label');
            if (label) label.textContent = `S${season || 1} · E${episode || 1}`;
            if (type === 'tv') {
                const sel = document.getElementById('party-season-selector');
                if (sel) sel.value = String(season || 1);
                this.loadPartyEpisodes(id, season || 1, episode || 1);
            }
            this.appendChatMessage('System', serverChanged
                ? 'Host switched server — reloading the same mirror…'
                : `Host switched to ${type === 'tv' ? `S${season || 1}E${episode || 1}` : 'a new title'}`);
            this.updatePartyRoleUI();
        }

        const nextAction = paused ? 'pause' : 'play';
        this._partyRemotePaused = !!paused;
        // content_sync sends raw host time (no seek lead).
        const t = this.normalizePlayerTime(time);
        const clock = payload.clock != null ? this.normalizePlayerTime(payload.clock) : t;
        this._pendingPartySync = { action: nextAction, time: t, clock, paused: !!paused, at: Date.now() };
        if (changed) {
            this.scheduleGuestPartyResync();
        } else if (this._partyGuestUnlocked && !this._partyFrameReloading) {
            setTimeout(() => this.applyRemotePlayerAction(nextAction, t, { force: true, clock }), 800);
        }
    },

    updatePartyRoleUI() {
        const badge = document.getElementById('party-role-badge');
        const veil = document.getElementById('party-spectate-veil');
        const seasonSel = document.getElementById('party-season-selector');
        const hostClock = document.getElementById('party-sync-clock');
        const guestSync = document.getElementById('party-guest-sync');
        const guestClock = document.getElementById('party-sync-clock-guest');

        if (badge) {
            badge.className = 'party-role';
            if (this.isHost) {
                badge.textContent = 'Host';
                badge.classList.add('is-host');
            } else if (this._partyGuestUnlocked) {
                badge.textContent = 'Synced';
                badge.classList.add('is-synced');
            } else {
                badge.textContent = 'Guest';
            }
        }
        if (veil) {
            veil.style.display = this.isHost ? 'none' : 'block';
            veil.innerHTML = this._partyGuestUnlocked
                ? 'Following host'
                : 'Hit <strong>Play Now</strong> in the player, then Sync if needed';
        }
        if (seasonSel) seasonSel.disabled = !this.isHost;
        const partyServerSel = document.getElementById('party-server-selector');
        if (partyServerSel) {
            partyServerSel.disabled = !this.isHost;
            partyServerSel.value = String(this.state.activeServer);
        }
        if (hostClock) hostClock.style.display = this.isHost ? 'inline-flex' : 'none';
        if (guestSync) guestSync.style.display = this.isHost ? 'none' : 'inline-flex';
        if (guestClock) guestClock.style.display = this.isHost ? 'none' : 'inline-flex';

        const { id, type, season, episode } = this.state.activeContent;
        if (type === 'tv' && id) {
            const key = `${id}|${season || 1}|${episode || 1}`;
            if (this._partyEpisodesLoadedKey !== key) {
                this._partyEpisodesLoadedKey = key;
                this.loadPartyEpisodes(id, season, episode);
            }
        }
    },

    renderPartyPeople(hostKey) {
        const container = document.getElementById('party-people');
        if (!container || !this.partyChannel) return;
        const uid = sessionStorage.getItem('alexandria_party_uid');
        const state = this.partyChannel.presenceState();
        const keys = Object.keys(state);
        const rows = keys.map((key) => {
            const p = state[key]?.[0];
            const name = p?.nickname || 'Guest';
            const isHost = key === hostKey;
            const isYou = key === uid;
            return `<div class="party-person">
                <span class="party-person-dot${isHost ? ' is-host' : ''}" aria-hidden="true"></span>
                <span class="party-person-name">${this.escapeHtml(name)}</span>
                ${isHost ? '<span class="party-person-tag">HOST</span>' : ''}
                ${isYou && !isHost ? '<span class="party-person-tag party-person-tag--you">YOU</span>' : ''}
            </div>`;
        }).join('');
        container.innerHTML = rows || '<div class="party-person"><span class="party-person-name">Just you</span></div>';
    },

    partyHostCommand(action) {
        if (!this.isHost) return;
        // Collect the best player timestamp BEFORE pausing (pause often stops time events).
        this.collectHostTime(action === 'pause' ? 1000 : 700).then((time) => {
            const frame = document.getElementById('embedmaster_iframe');
            this._suppressHostBroadcastUntil = Date.now() + 1500;

            const safeTime = typeof time === 'number' ? time : 0;
            // Never seek the room to ~0 while the host is clearly mid-watch.
            const canSeekRoom = safeTime >= 5;

            if (action === 'play') {
                this.postToEmbed(frame, 'play');
                this.setPartyPaused(false);
                this._partyLastTimeAt = Date.now();
                this.sendPlayerSync('play', canSeekRoom ? safeTime : this.getHostPlaybackTime(), {
                    force: true,
                    noSeek: !canSeekRoom
                });
            } else if (action === 'pause') {
                this.postToEmbed(frame, 'pause');
                this.setPartyPaused(true);
                if (canSeekRoom) this.notePartyTime(safeTime);
                this.sendPlayerSync('pause', canSeekRoom ? safeTime : this.getHostPlaybackTime(), {
                    force: true,
                    noSeek: !canSeekRoom
                });
            }

            const stamp = this.formatTime(Math.floor(canSeekRoom ? safeTime : this.getHostPlaybackTime()));
            this.showToast(`${action === 'play' ? 'Play' : 'Pause'} @ ${stamp}`);
            if (!canSeekRoom) {
                this.showToast('Sync time looks wrong — click the clock and type what the player shows (e.g. 16:57)');
            }
            this.tickPartyClock();
        });
    },

    partyEditSyncClock() {
        if (!this.isHost) return;
        const current = this.formatTime(Math.floor(this.getHostPlaybackTime() || 0));
        let raw = '';
        try {
            raw = prompt('Enter the time showing on the player (e.g. 16:57 or 1:05:30):', current) || '';
        } catch {
            return;
        }
        const seconds = this.parseTimestampInput(raw);
        if (seconds == null) {
            this.showToast('Could not read that time');
            return;
        }
        this.notePartyTime(seconds, { force: true });
        this.tickPartyClock();
        if (this.isHost && this.partyChannel) {
            const action = this.isPartyPaused() ? 'pause' : 'sync';
            this.sendPlayerSync(action, seconds, { force: true });
        }
        this.showToast(`Sync position set to ${this.formatTime(Math.floor(seconds))}`);
    },

    parseTimestampInput(value) {
        if (value == null) return null;
        const text = String(value).trim();
        if (!text) return null;
        if (/^\d+(\.\d+)?$/.test(text)) {
            const n = Number(text);
            return Number.isFinite(n) && n >= 0 ? n : null;
        }
        const parts = text.split(':').map(p => Number(p));
        if (parts.length < 2 || parts.length > 3 || parts.some(p => !Number.isFinite(p) || p < 0)) return null;
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    },

    partyGuestSync() {
        if (this.isHost) return;
        this._partyGuestUnlocked = true;
        this.updatePartyRoleUI();

        const frame = document.getElementById('embedmaster_iframe');
        this.postToEmbed(frame, 'play');

        if (this.partyChannel) {
            const fromUid = sessionStorage.getItem('alexandria_party_uid');
            this.partyChannel.send({
                type: 'broadcast',
                event: 'sync_request',
                payload: { fromUid }
            });
        }

        const pending = this._pendingPartySync;
        if (pending && pending.time >= 1) {
            this.applyRemotePlayerAction(pending.action, pending.time, {
                force: true,
                clock: pending.clock
            });
            this.showToast(`Syncing @ ${this.formatTime(Math.floor(pending.clock ?? pending.time))}…`);
        } else {
            this.showToast('Asking host for timestamp…');
        }
    },

    normalizePlayerTime(t) {
        let n = typeof t === 'number' ? t : Number(t);
        if (!Number.isFinite(n) || n < 0) return 0;
        // Some builds report milliseconds.
        if (n > 36000) n = n / 1000;
        return n;
    },

    notePartyTime(t, opts = {}) {
        const n = this.normalizePlayerTime(t);
        if (!Number.isFinite(n) || n < 0) return false;

        // Critical: never let 0:00 poll replies wipe a real mid-movie clock.
        const known = Number(this._partyLastTime) || 0;
        if (n < 1 && known >= 1 && !opts.force) {
            // #region agent log
            this._dbg('B', 'script.js:notePartyTime', 'reject near-zero wipe', { n, known, force: !!opts.force });
            // #endregion
            return false;
        }

        // Reject absurd forward jumps (duration / buffer mistaken as currentTime).
        if (!opts.force && known >= 5) {
            const elapsed = (!this.isPartyPaused() && this._partyLastTimeAt)
                ? (Date.now() - this._partyLastTimeAt) / 1000
                : 0;
            if (n > known + elapsed + 12) {
                // #region agent log
                this._dbg('B', 'script.js:notePartyTime', 'reject absurd jump', { n, known, elapsed, force: !!opts.force });
                // #endregion
                return false;
            }
        }

        this._partyLastTime = n;
        // Only refresh the wall-clock anchor while actually playing.
        if (!this.isPartyPaused()) this._partyLastTimeAt = Date.now();
        this.tickPartyClock();
        return true;
    },

    isPartyPaused() {
        if (this.isHost) {
            return this._partyPaused === true || this._partyLastAction === 'pause';
        }
        return this._partyRemotePaused === true
            || this._pendingPartySync?.action === 'pause'
            || this._pendingPartySync?.paused === true;
    },

    setPartyPaused(paused, opts = {}) {
        const next = !!paused;
        this._partyPaused = next;
        if (next) {
            this._partyLastAction = 'pause';
            this._partyPausedViaStall = !!opts.viaStall;
            this._partyLastTimeAt = Date.now();
        } else {
            this._partyPausedViaStall = false;
            if (this._partyLastAction === 'pause' || !this._partyLastAction) {
                this._partyLastAction = 'play';
            }
            this._partyLastTimeAt = Date.now();
        }
    },

    getHostPlaybackTime() {
        let t = Number(this._partyLastTime) || 0;
        // Frozen while paused — do not invent progress from wall time.
        if (!this.isPartyPaused() && this._partyLastTimeAt) {
            t += (Date.now() - this._partyLastTimeAt) / 1000;
        }
        return Math.max(0, t);
    },

    tickPartyClock() {
        const hostEl = document.getElementById('party-sync-clock');
        const guestEl = document.getElementById('party-sync-clock-guest');
        let t;
        if (this.isHost) {
            t = this.getHostPlaybackTime();
        } else {
            const pending = this._pendingPartySync;
            // Prefer clock (raw host time) — never the seek-lead time.
            t = Number(pending?.clock);
            if (!Number.isFinite(t)) {
                t = Number(pending?.time) || 0;
                if (pending && pending.action !== 'pause' && !pending.paused) {
                    t = Math.max(0, t - this._PARTY_SYNC_LEAD_SEC);
                }
            }
            if (pending && !this.isPartyPaused() && pending.at) {
                t += (Date.now() - pending.at) / 1000;
            }
        }
        const label = this.formatTime(Math.floor(Math.max(0, t || 0)));
        if (hostEl) hostEl.textContent = label;
        if (guestEl) guestEl.textContent = label;
        // #region agent log
        const now = Date.now();
        if (!this._dbgLastClockLog || now - this._dbgLastClockLog > 2000) {
            this._dbgLastClockLog = now;
            const pending = this._pendingPartySync;
            this._dbg('A', 'script.js:tickPartyClock', 'clock tick', {
                displaySec: Math.floor(t || 0),
                label,
                lastTime: this._partyLastTime,
                lastTimeAtAgeMs: this._partyLastTimeAt ? now - this._partyLastTimeAt : null,
                pendingClock: pending?.clock,
                pendingTime: pending?.time,
                pendingAction: pending?.action,
                lead: this._PARTY_SYNC_LEAD_SEC
            });
        }
        // #endregion
    },

    harvestEmbedTimes(data, depth = 0, out = [], keyHint = '') {
        if (depth > 6 || data == null) return out;
        if (typeof data === 'number' && Number.isFinite(data)) {
            const n = this.normalizePlayerTime(data);
            // Skip tiny / absurd values; duration-like huge jumps filtered later.
            if (n >= 1 && n < 43200) out.push({ t: n, key: keyHint });
            return out;
        }
        if (typeof data === 'string') {
            const asNum = Number(data);
            if (Number.isFinite(asNum)) return this.harvestEmbedTimes(asNum, depth + 1, out, keyHint);
            try { return this.harvestEmbedTimes(JSON.parse(data), depth + 1, out, keyHint); } catch { return out; }
        }
        if (typeof data !== 'object') return out;

        // Prefer playhead keys; avoid duration/buffer fields.
        for (const [key, value] of Object.entries(data)) {
            if (/duration|buffered|seekable|length|total/i.test(key)) continue;
            if (/^(time|currentTime|current|position|seconds|sec|answer)$/i.test(key)
                || (/time|current|position/i.test(key) && !/duration|buffer/i.test(key))) {
                this.harvestEmbedTimes(value, depth + 1, out, key);
            } else if (value && typeof value === 'object') {
                this.harvestEmbedTimes(value, depth + 1, out, keyHint);
            }
        }
        return out;
    },

    pickBestEmbedTime(samples) {
        if (!samples?.length) return null;
        const times = samples.map(s => (typeof s === 'number' ? s : s.t)).filter(t => Number.isFinite(t));
        if (!times.length) return null;

        const known = Number(this._partyLastTime) || 0;
        if (known >= 5) {
            const near = times.filter(t => Math.abs(t - known) <= 90);
            if (near.length) {
                return near.reduce((a, b) => (Math.abs(a - known) <= Math.abs(b - known) ? a : b));
            }
        }

        // Prefer explicit playhead keys over generic "answer"/nested junk.
        const preferred = samples.filter(s => s && /^(time|currentTime|current|position)$/i.test(s.key || ''));
        if (preferred.length) {
            const pts = preferred.map(s => s.t).filter(Number.isFinite).sort((a, b) => a - b);
            if (pts.length) return pts[Math.floor(pts.length / 2)];
        }

        // Median avoids grabbing an outlier duration that slipped through.
        const sorted = [...times].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    },

    ingestEmbedTimePayload(data) {
        // PlayerJS paused replies: { answer: true/false } paired with recent paused request,
        // or explicit paused fields in EmbedMaster payloads.
        if (data && typeof data === 'object') {
            const pausedHint = data.paused ?? data.isPaused ?? data.data?.paused;
            if (typeof pausedHint === 'boolean' && this.isHost) {
                this.setPartyPaused(pausedHint);
            }
            // PlayerJS often returns { api: 'paused', answer: true }
            if ((data.api === 'paused' || data.api === 'getPaused') && typeof data.answer === 'boolean') {
                if (this.isHost) this.setPartyPaused(data.answer);
            }
            // Standard PlayerJS getter replies: { event: 'getPaused', value/answer: bool }
            if (data.event === 'getPaused' || data.event === 'paused') {
                const v = typeof data.value === 'boolean' ? data.value : (typeof data.answer === 'boolean' ? data.answer : undefined);
                if (typeof v === 'boolean' && this.isHost) this.setPartyPaused(v);
            }
        }

        const samples = this.harvestEmbedTimes(data);
        const best = this.pickBestEmbedTime(samples);
        // #region agent log
        const _nowIngest = Date.now();
        if (samples.length && (!this._dbgLastIngestLog || _nowIngest - this._dbgLastIngestLog > 2500)) {
            this._dbgLastIngestLog = _nowIngest;
            this._dbg('A', 'script.js:ingestEmbedTimePayload', 'embed time harvest', {
                sampleCount: samples.length,
                samples: samples.slice(0, 8),
                best,
                prev: this._partyLastTime,
                api: data?.api,
                event: data?.event,
                source: data?.source
            });
        }
        // #endregion
        if (best != null && best >= 1) {
            const prev = Number(this._partyLastTime) || 0;
            this.notePartyTime(best);

            // Stall detection: same stamp repeatedly mid-watch ⇒ player is paused
            // (some shows like Z Nation never fire a pause event).
            if (prev >= 5 && Math.abs(best - prev) < 0.4) {
                this._partyTimeStallCount = (this._partyTimeStallCount || 0) + 1;
                if (this._partyTimeStallCount >= 2) this.setPartyPaused(true, { viaStall: true });
            } else if (best > prev + 0.6) {
                this._partyTimeStallCount = 0;
                // Only auto-resume the clock if pause was inferred from a stall.
                if (this._partyPausedViaStall) this.setPartyPaused(false);
            }
            return best;
        }
        return null;
    },

    // PlayerJS time REQUEST only — never send EmbedMaster command "time"
    // (that can be treated like seek/set and zero the clock).
    requestPlayerTime(frame) {
        if (!frame?.contentWindow) return;
        const win = frame.contentWindow;
        // Standard PlayerJS getter — needs the `context` field or a strict
        // player ignores it. `time`/`getTime`/bare `{api:...}` all returned nothing.
        win.postMessage({ context: 'player.js', version: '0.0.10', method: 'getCurrentTime', listener: 'alexandria_time' }, '*');
        win.postMessage({ api: 'getCurrentTime' }, '*');
        win.postMessage({ method: 'getCurrentTime' }, '*');
    },

    requestPlayerPaused(frame) {
        if (!frame?.contentWindow) return;
        const win = frame.contentWindow;
        win.postMessage({ context: 'player.js', version: '0.0.10', method: 'getPaused', listener: 'alexandria_paused' }, '*');
        win.postMessage({ api: 'getPaused' }, '*');
        win.postMessage({ method: 'getPaused' }, '*');
    },

    // PlayerJS only fires events after the parent subscribes (except play/pause,
    // which EmbedMaster emits on its own). Subscribe so `timeupdate`/`progress`
    // actually fire — without them the host clock never gets a real timestamp.
    subscribeToPlayerEvents(frame) {
        if (!frame?.contentWindow) return;
        const win = frame.contentWindow;
        const events = ['timeupdate', 'progress', 'play', 'pause', 'seek', 'ended'];
        for (const name of events) {
            win.postMessage({ context: 'player.js', version: '0.0.10', method: 'addEventListener', value: name }, '*');
            win.postMessage({ api: 'addEventListener', set: name }, '*');
        }
    },

    collectHostTime(ms = 900) {
        return new Promise((resolve) => {
            const frame = document.getElementById('embedmaster_iframe');
            let best = this.getHostPlaybackTime();

            const onMsg = (event) => {
                const originOk = this.isTrustedEmbedOrigin(event.origin);
                const em = event.data?.source === 'embedmaster_player';
                const pjs = event.data?.answer !== undefined;
                if (!originOk && !em && !pjs) return;
                const got = this.ingestEmbedTimePayload(event.data);
                if (typeof got === 'number' && got > best) best = got;
            };

            window.addEventListener('message', onMsg);
            const iv = setInterval(() => this.requestPlayerTime(frame), 120);
            this.requestPlayerTime(frame);

            setTimeout(() => {
                clearInterval(iv);
                window.removeEventListener('message', onMsg);
                if (best >= 1) this.notePartyTime(best);
                resolve(best);
            }, ms);
        });
    },

    queryEmbedTime(timeoutMs = 700) {
        return this.collectHostTime(timeoutMs).then((t) => (t >= 1 ? t : null));
    },

    async resolveHostTime() {
        const estimated = this.getHostPlaybackTime();
        const polled = await this.collectHostTime(800);
        if (typeof polled === 'number' && polled >= 5) {
            if (polled >= estimated - 2) return polled;
        }
        return estimated >= 1 ? estimated : (polled || 0);
    },

    // Try to recolor EmbedMaster/PlayerJS UI (play button etc.) to Alexandria red.
    themeEmbedPlayer(frame) {
        if (!frame?.contentWindow) return;
        const win = frame.contentWindow;
        const red = '#8a0303';
        for (const key of ['color1', 'color2', 'color3']) {
            win.postMessage({ api: key, set: red }, '*');
            win.postMessage({ source: 'embedmaster_player_command', command: key, value: red }, '*');
        }
    },

    scheduleEmbedTheme(frame) {
        if (!frame) return;
        const paint = () => {
            this.themeEmbedPlayer(frame);
            this.subscribeToPlayerEvents(frame);
        };
        paint();
        setTimeout(paint, 400);
        setTimeout(paint, 1200);
        setTimeout(paint, 2500);
        frame.addEventListener('load', paint, { once: true });
    },

    postToEmbed(frame, command, value) {
        if (!frame?.contentWindow) return;
        if (command === 'time' && value === undefined) {
            this.requestPlayerTime(frame);
            return;
        }
        const win = frame.contentWindow;

        const em = { source: 'embedmaster_player_command', command };
        if (value !== undefined) em.value = value;
        win.postMessage(em, '*');

        // PlayerJS iframe API uses api + set (not value).
        const pjs = { api: command };
        if (value !== undefined) pjs.set = value;
        win.postMessage(pjs, '*');
    },

    applyRemotePlayerAction(action, time, opts = {}) {
        const frame = document.getElementById('embedmaster_iframe');
        if (!frame?.contentWindow) return;

        this._partyGuestUnlocked = true;
        const t = this.normalizePlayerTime(time);
        const lead = this._PARTY_SYNC_LEAD_SEC;
        const clock = typeof opts.clock === 'number'
            ? this.normalizePlayerTime(opts.clock)
            : (action === 'pause' ? t : Math.max(0, t - lead));
        this._pendingPartySync = {
            action,
            time: t,
            clock,
            paused: action === 'pause',
            at: Date.now()
        };
        if (action === 'pause') this._partyRemotePaused = true;
        if (action === 'play') this._partyRemotePaused = false;

        const force = !!opts.force;
        const noSeek = !!opts.noSeek;
        const now = Date.now();
        const last = this._lastAppliedPartySync;
        // Skip spam that re-triggers EmbedMaster buffering / loading loops.
        if (!force && last && last.action === action && (now - last.at) < 2500) {
            if (Math.abs((last.time || 0) - t) < 3) return;
        }
        if (this._applyingRemoteSync && !force) return;

        this._lastAppliedPartySync = { action, time: t, at: now };
        this.updatePartyRoleUI();

        this._applyingRemoteSync = true;
        const finish = () => {
            clearTimeout(this._partyApplyLockTimer);
            this._partyApplyLockTimer = setTimeout(() => {
                this._applyingRemoteSync = false;
                // Flush the newest host sync that arrived while we were locked.
                if (this.isHost || this.state.view !== 'party') return;
                const pending = this._pendingPartySync;
                const last = this._lastAppliedPartySync;
                if (!pending || !pending.action) return;
                if (last && last.action === pending.action && Math.abs((last.time || 0) - (pending.time || 0)) < 0.5) {
                    return;
                }
                this.applyRemotePlayerAction(pending.action, pending.time, {
                    force: true,
                    clock: pending.clock
                });
            }, 800);
        };

        const seekTo = Math.max(0, Math.floor(t));
        // Never seek to ~0 on a bad stamp — that yeets guests back to the intro.
        const shouldSeek = !noSeek
            && seekTo >= 5
            && (force || !last || Math.abs((last.time || 0) - t) >= 1.25);

        const run = (cmd) => {
            if (shouldSeek) {
                this.postToEmbed(frame, 'seek', seekTo);
                setTimeout(() => {
                    this.postToEmbed(frame, cmd);
                    finish();
                }, 120);
            } else {
                this.postToEmbed(frame, cmd);
                finish();
            }
        };

        if (action === 'play') {
            run('play');
        } else if (action === 'pause') {
            run('pause');
        } else if (action === 'seek') {
            if (shouldSeek) this.postToEmbed(frame, 'seek', seekTo);
            finish();
        } else if (action === 'sync') {
            run(this._partyRemotePaused ? 'pause' : 'play');
        } else {
            finish();
        }
    },

    parseEmbedPlayerEvent(raw) {
        let data = raw;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch { return null; }
        }
        if (!data || typeof data !== 'object') return null;

        const asNum = (v) => {
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
            return undefined;
        };

        // PlayerJS request replies: { event: 'time', answer: 12.5 }
        if (data.event && data.answer !== undefined && data.source !== 'embedmaster_player') {
            const ev = String(data.event).toLowerCase();
            const answer = data.answer;
            const time = asNum(answer) ?? asNum(answer?.time);
            return { event: ev, time };
        }

        let eventName = data.event || null;
        const trustedSource = data.source === 'embedmaster_player';
        if (!trustedSource && !eventName) return null;
        if (!eventName) return null;

        eventName = String(eventName).toLowerCase();
        if (eventName === 'userplay' || eventName === 'playing' || eventName === 'resume') eventName = 'play';
        if (eventName === 'userpause' || eventName === 'paused' || eventName === 'stop') eventName = 'pause';
        if (eventName === 'userseek' || eventName === 'seeked') eventName = 'seek';
        if (eventName === 'start') eventName = 'play';

        const info = data.info;
        const val = data.value;
        const time = asNum(info)
            ?? asNum(info?.time)
            ?? asNum(info?.seconds)
            ?? asNum(info?.currentTime)
            ?? asNum(data.time)
            ?? asNum(data.data)
            ?? asNum(data.data?.time)
            ?? asNum(val)
            ?? asNum(val?.time)
            ?? asNum(val?.seconds)
            ?? asNum(val?.currentTime)
            ?? asNum(data.answer);

        return { event: eventName, time };
    },

    sendPlayerSync(action, time, opts = {}) {
        if (!this.partyChannel || !this.isHost) return;
        let t = this.normalizePlayerTime(typeof time === 'number' ? time : this.getHostPlaybackTime());
        const force = !!opts.force;
        const noSeek = !!opts.noSeek;
        const now = Date.now();
        const rawBeforeLead = t;

        // Play/sync: aim guests slightly ahead so the ~1s lag feels matched.
        if (!noSeek && (action === 'play' || (action === 'sync' && !opts.paused))) {
            t += this._PARTY_SYNC_LEAD_SEC;
        }
        // #region agent log
        this._dbg('D', 'script.js:sendPlayerSync', 'host broadcast', {
            action, rawBeforeLead, seekTime: t, force, noSeek, leadApplied: t !== rawBeforeLead
        });
        // #endregion

        // Debounce duplicate host broadcasts (player echoes + presence noise).
        if (!force && this._lastSentPartySync) {
            const last = this._lastSentPartySync;
            if (last.action === action && (now - last.at) < 1200 && Math.abs((last.time || 0) - t) < 2) {
                return;
            }
        }

        this._lastSentPartySync = { action, time: t, at: now };
        this._partyLastAction = action;
        this.setPartyPaused(action === 'pause');
        // Store the real host time (without lead) for the local clock.
        const raw = this.normalizePlayerTime(typeof time === 'number' ? time : this.getHostPlaybackTime());
        if (raw >= 1) this.notePartyTime(raw);
        if (action === 'play') this._partyLastTimeAt = Date.now();

        this.partyChannel.send({
            type: 'broadcast',
            event: 'player_sync',
            payload: {
                action,
                time: t,
                clock: raw,
                paused: action === 'pause',
                force,
                noSeek,
                at: Date.now()
            }
        });
    },

    initPartySync(roomId) {
        if (!this.supabase) {
            this.showToast('Supabase is not configured. Watch Party requires cloud sync.');
            return;
        }

        this.teardownParty();
        this.state.partyRoomId = roomId;

        const nickname = sessionStorage.getItem('alexandria_nickname');
        const uid = sessionStorage.getItem('alexandria_party_uid');
        const isCreator = sessionStorage.getItem('alexandria_party_creator_' + roomId) === '1';

        // Host immediately if you created the room — presence only re-elects if creator leaves.
        this.isHost = isCreator;
        this.notifiedHost = false;
        this._partyGuestHinted = false;
        this._partyLastAction = null;
        this._partyLastTime = 0;
        this._partyLastTimeAt = 0;
        this._partyPaused = false;
        this._partyPausedViaStall = false;
        this._partyTimeStallCount = 0;
        this._lastHostHeartbeat = 0;
        this._partyRemotePaused = false;
        this._partyGuestUnlocked = isCreator;
        this._pendingPartySync = null;
        this._lastAppliedPartySync = null;
        this._lastSentPartySync = null;
        this._suppressHostBroadcastUntil = 0;
        this._partyFrameReloading = false;
        this._partyEmbedHealthy = false;
        this._partyEpisodesLoadedKey = null;
        this.clearPartyEmbedWatch();
        this.clearHostPartyResyncTimers();
        this.clearGuestPartyResyncTimers();

        this.partyChannel = this.supabase.channel(`party_${roomId}`, {
            config: { presence: { key: uid } }
        });

        this.partyChannel
            .on('presence', { event: 'sync' }, () => {
                const state = this.partyChannel.presenceState();
                const users = Object.keys(state);
                const countEl = document.getElementById('party-users-count');
                if (countEl) {
                    countEl.textContent = `${users.length} here`;
                }

                if (users.length === 0) return;

                let hostKey = null;
                let earliestTime = Infinity;

                for (const key of users) {
                    const p = state[key]?.[0];
                    if (p?.isCreator) {
                        hostKey = key;
                        break;
                    }
                }

                if (!hostKey) {
                    for (const key of users) {
                        const p = state[key]?.[0];
                        if (p?.online_at) {
                            const time = new Date(p.online_at).getTime();
                            if (time < earliestTime) {
                                earliestTime = time;
                                hostKey = key;
                            }
                        }
                    }
                }
                if (!hostKey) hostKey = users[0];

                this.renderPartyPeople(hostKey);

                const wasHost = this.isHost;
                // Room creator stays host while present; otherwise earliest joiner.
                this.isHost = isCreator ? true : (hostKey === uid);
                if (this.isHost) this._partyGuestUnlocked = true;

                this.updatePartyRoleUI();

                // Guest promoted to host (creator left): seed our clock from the
                // last sync we received, then poll our own embed for the live stamp.
                if (this.isHost && !wasHost) {
                    const pending = this._pendingPartySync;
                    if (!(Number(this._partyLastTime) >= 1) && pending && typeof pending.time === 'number' && pending.time >= 1) {
                        this._partyLastTime = pending.time;
                        this._partyLastTimeAt = Date.now();
                        this.setPartyPaused(!!pending.paused || pending.action === 'pause');
                    }
                    this.notifiedHost = true;
                    this.appendChatMessage('System', 'You’re the host now — friends follow you.');
                    this.scheduleHostPartyResync();
                }

                if (this.isHost && !this.notifiedHost) {
                    this.notifiedHost = true;
                    this.appendChatMessage('System', 'You’re the host — use the player controls. Friends follow you.');
                } else if (!this.isHost && wasHost) {
                    this.appendChatMessage('System', 'Host left — new host elected.');
                } else if (!this.isHost && !this._partyGuestHinted) {
                    this._partyGuestHinted = true;
                    this.appendChatMessage('System', 'Hit Play Now in the player, then Sync if you’re off.');
                }

                if (this.isHost) {
                    // Only push content metadata on presence — not seek spam (that caused loading loops).
                    clearTimeout(this._partyPresenceResyncTimer);
                    this._partyPresenceResyncTimer = setTimeout(() => {
                        if (!this.isHost || !this.partyChannel) return;
                        this.broadcastPartyContent();
                    }, 500);
                }
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                if (this.state.view !== 'party' || !this.partyChannel) return;
                const name = newPresences?.[0]?.nickname;
                if (name && key !== uid) this.appendChatMessage('System', `${name} joined`);
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                if (this.state.view !== 'party' || !this.partyChannel) return;
                const name = leftPresences?.[0]?.nickname;
                if (name && key !== uid) this.appendChatMessage('System', `${name} left`);
            })
            .on('broadcast', { event: 'player_sync' }, (payload) => {
                if (this.isHost) return;
                const { action, time, paused, force, noSeek, clock } = payload.payload || {};
                if (typeof paused === 'boolean') this._partyRemotePaused = paused;
                if (action === 'pause') this._partyRemotePaused = true;
                if (action === 'play') this._partyRemotePaused = false;
                const t = typeof time === 'number' ? this.normalizePlayerTime(time) : 0;
                const lead = this._PARTY_SYNC_LEAD_SEC;
                const clockVal = typeof clock === 'number'
                    ? this.normalizePlayerTime(clock)
                    : (action === 'pause' ? t : Math.max(0, t - lead));
                this._pendingPartySync = {
                    action,
                    time: t,
                    clock: clockVal,
                    paused: this._partyRemotePaused,
                    at: Date.now()
                };
                this.tickPartyClock();
                // Queue while applying or reloading — finish() / ready flush will catch up.
                if (this._applyingRemoteSync || this._partyFrameReloading) return;
                this.applyRemotePlayerAction(action, time, {
                    force: !!force,
                    noSeek: !!noSeek,
                    clock: clockVal
                });
            })
            .on('broadcast', { event: 'sync_request' }, async (payload) => {
                if (!this.isHost) return;
                const fromUid = payload.payload?.fromUid;
                if (fromUid && fromUid === uid) return;
                this.broadcastPartyContent();
                const action = this._partyLastAction || 'play';
                const time = await this.resolveHostTime();
                this.sendPlayerSync(action, time, { force: true });
            })
            .on('broadcast', { event: 'content_sync' }, (payload) => {
                if (this.isHost) return;
                this.applyPartyContent(payload.payload);
            })
            .on('broadcast', { event: 'chat_msg' }, (payload) => {
                const { sender, msg, fromUid } = payload.payload;
                if (fromUid === uid) return;
                this.appendChatMessage(sender, msg);
            })
            .on('system', { event: 'reconnected' }, () => {
                if (this.state.view !== 'party' || !this.partyChannel) return;
                this.appendChatMessage('System', 'Reconnected — re-syncing…');
                if (this.isHost) {
                    this.scheduleHostPartyResync();
                } else {
                    this.partyChannel.send({ type: 'broadcast', event: 'sync_request', payload: { fromUid: uid } });
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.partyChannel.track({
                        online_at: new Date().toISOString(),
                        nickname,
                        isCreator
                    });
                    if (this.isHost) {
                        this.broadcastPartyContent();
                    }
                }
            });

        if (!this._embedListener) {
            this._embedListener = this.handleEmbedMasterMessage.bind(this);
            window.addEventListener('message', this._embedListener);
        }

        // Smooth UI clock (~4fps); separate from slower poll/heartbeat.
        if (this._partyClockTimer) clearInterval(this._partyClockTimer);
        this._partyClockTimer = setInterval(() => {
            if (this.state.view !== 'party') return;
            this.tickPartyClock();
        }, 250);

        // Host: poll time + pause state, heartbeat sync for stubborn embeds.
        if (this._partySyncTimer) clearInterval(this._partySyncTimer);
        this._partySyncTimer = setInterval(() => {
            if (this.state.view !== 'party') return;
            if (!this.isHost) return;
            const frame = document.getElementById('embedmaster_iframe');
            this.requestPlayerTime(frame);
            this.requestPlayerPaused(frame);

            // Periodic soft sync so guests stay lined up even when play/pause
            // events never fire (seen on some titles like Z Nation).
            if (!this.isPartyPaused()) {
                if (this._partyFrameReloading) return;
                if (Date.now() < (this._suppressHostBroadcastUntil || 0)) return;
                const now = Date.now();
                const t = this.getHostPlaybackTime();
                if (t >= 5 && (!this._lastHostHeartbeat || now - this._lastHostHeartbeat > 4000)) {
                    this._lastHostHeartbeat = now;
                    this.sendPlayerSync('sync', t, { force: false });
                }
            }
        }, 2000);

        this.updatePartyRoleUI();
    },

    handleEmbedMasterMessage(event) {
        if (this.state.view !== 'party' || !this.partyChannel) return;

        const originOk = this.isTrustedEmbedOrigin(event.origin);
        if (!originOk) return;

        // Always harvest timestamps from any player traffic — don’t depend on one event shape.
        if (this.isHost) {
            this.ingestEmbedTimePayload(event.data);
        }

        const parsed = this.parseEmbedPlayerEvent(event.data);
        if (!parsed) return;

        const { event: ev, time } = parsed;

        if (ev === 'ready' || ev === 'init' || ev === 'start') {
            this.markPartyEmbedHealthy();
            const readyFrame = document.getElementById('embedmaster_iframe');
            this.themeEmbedPlayer(readyFrame);
            this.subscribeToPlayerEvents(readyFrame);
            if (this.isHost) this.resyncPartyAfterPlayerReady();
        }

        // Guests: unlock + flush queued host sync when the player actually starts talking.
        if (!this.isHost) {
            if (this._applyingRemoteSync) return;
            if (ev === 'ready' || ev === 'play' || ev === 'time' || ev === 'timeupdate' || ev === 'click') {
                this.markPartyEmbedHealthy();
                const wasLocked = !this._partyGuestUnlocked;
                const wasReloading = !!this._partyFrameReloading;
                this._partyGuestUnlocked = true;
                this._partyFrameReloading = false;
                if (wasLocked) {
                    this.updatePartyRoleUI();
                    this.appendChatMessage('System', 'Player unlocked — syncing with host.');
                }
                // Only flush on unlock/reload — re-applying on every echoed
                // `play`/`timeupdate` from our own seek was the sync loop.
                if (this._pendingPartySync && (wasLocked || wasReloading)) {
                    const pending = this._pendingPartySync;
                    clearTimeout(this._partyGuestFlushTimer);
                    this._partyGuestFlushTimer = setTimeout(() => {
                        this.applyRemotePlayerAction(pending.action, pending.time, {
                            force: true,
                            clock: pending.clock,
                            noSeek: (pending.time || 0) < 5
                        });
                    }, (wasLocked || wasReloading) ? 400 : 0);
                }
            }
            return;
        }

        if (ev === 'play' || ev === 'time' || ev === 'timeupdate') {
            this.markPartyEmbedHealthy();
        }

        if (this._applyingRemoteSync) return;
        if (Date.now() < (this._suppressHostBroadcastUntil || 0)) return;

        if (typeof time === 'number' && time >= 1) {
            this.notePartyTime(time);
        }

        if (ev === 'play' || ev === 'pause') {
            this.setPartyPaused(ev === 'pause');

            // Prefer the player's reported time; fall back to our running clock.
            const fromEvent = (typeof time === 'number' && time >= 5) ? this.normalizePlayerTime(time) : null;
            const stamp = fromEvent ?? this.getHostPlaybackTime();
            this.sendPlayerSync(ev, stamp, {
                force: true,
                noSeek: stamp < 5
            });
            this.tickPartyClock();
        } else if (ev === 'seek' || ev === 'userseek') {
            const stamp = (typeof time === 'number' && time >= 5)
                ? this.normalizePlayerTime(time)
                : this.getHostPlaybackTime();
            if (stamp >= 5) this.sendPlayerSync('seek', stamp, { force: true });
            this.tickPartyClock();
        }
    },

    sendPartyChatMessage() {
        const input = document.getElementById('party-chat-input');
        const msg = input.value.trim();
        if (!msg || !this.partyChannel) return;

        const nickname = sessionStorage.getItem('alexandria_nickname');
        const fromUid = sessionStorage.getItem('alexandria_party_uid');

        this.partyChannel.send({
            type: 'broadcast',
            event: 'chat_msg',
            payload: { sender: nickname, msg, fromUid }
        });

        this.appendChatMessage(nickname, msg);
        input.value = '';
    },

    appendChatMessage(sender, msg) {
        const container = document.getElementById('party-chat-messages');
        if (!container) return;
        const div = document.createElement('div');
        if (sender === 'System') {
            div.className = 'party-chat-msg system';
            div.textContent = msg;
        } else {
            div.className = 'party-chat-msg';
            div.innerHTML = `<strong>${this.escapeHtml(sender)}</strong> ${this.escapeHtml(msg)}`;
        }
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    async copyPartyLink() {
        const url = window.location.href;
        if (await this.copyText(url)) this.showToast('Invite link copied to clipboard!');
        else this.showToast('Could not copy link. Copy from the address bar.');
    },

    async renderList() {
        const listId = this.state.activeListId;
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING LIST...</div>';
        if (!this.supabase) {
            if (token === this._renderToken) this.renderError('Lists unavailable', 'Supabase cloud is required for shared lists.', 'home');
            return;
        }
        try {
            const { data: list } = await this.supabase
                .from('movie_night_lists')
                .select('*')
                .eq('id', listId)
                .maybeSingle();
            if (token !== this._renderToken) return;
            if (!list) {
                this.renderError('LIST NOT FOUND', 'It may have been deleted.', 'home');
                return;
            }
            const owner = await this.fetchProfile(list.owner_id);
            if (token !== this._renderToken) return;
            this._listRow = list;
            this._listOwnerId = list.owner_id;
            const me = this.state.authUser?.id;
            const isOwner = Boolean(me && me === list.owner_id);
            const ownerName = owner ? (owner.nickname || owner.username || 'Member') : 'Member';

            this.main.innerHTML = `
                <section class="list-page">
                    <div class="list-hero">
                        <div class="list-hero-info">
                            <h1>${this.escapeHtml(list.title || 'Untitled list')}</h1>
                            ${list.description ? `<p class="list-desc">${this.escapeHtml(list.description)}</p>` : ''}
                            <div class="list-owner-line">
                                <a class="list-owner-link" href="#profile/${this.escapeHtml(list.owner_id)}">${this.avatarHtml(owner, 30)} <span>${this.escapeHtml(ownerName)}</span></a>
                            </div>
                        </div>
                        <div class="list-hero-actions">
                            <button type="button" class="btn-secondary" onclick="Alexandria.copyListLink()">COPY LINK</button>
                            ${isOwner ? `
                            <button type="button" class="btn-secondary" onclick="Alexandria.editListMode()">EDIT</button>
                            <button type="button" class="btn-secondary list-delete-btn" onclick="Alexandria.deleteCurrentList()">DELETE LIST</button>` : ''}
                        </div>
                    </div>
                    <section class="list-add-box">
                        ${this.state.authUser ? `
                        <div class="list-add-search-wrap">
                            <input type="text" id="list-add-search" placeholder="Search movies & shows to add…" autocomplete="off" aria-label="Search titles to add">
                            <div class="list-add-results" id="list-add-results" hidden></div>
                        </div>` : `
                        <div class="list-guest-hint">SIGN IN to add titles to this list.</div>`}
                    </section>
                    <div class="list-items" id="list-items">
                        <div class="placeholder-msg"><span class="pulse-dot"></span> LOADING TITLES...</div>
                    </div>
                </section>
            `;

            const input = document.getElementById('list-add-search');
            if (input) {
                input.addEventListener('input', () => {
                    clearTimeout(this._listSearchTimer);
                    const q = input.value;
                    this._listSearchTimer = setTimeout(() => this.searchListAdd(q), 400);
                });
            }
            this.initListRealtime(listId);
            this.renderListItems();
        } catch (e) {
            console.error("Alexandria Protocol: List Render Failed", e);
            if (token === this._renderToken) this.renderError('This list could not be loaded', e.message || 'Something went wrong.', 'home');
        }
    },

    initListRealtime(listId) {
        if (!this.supabase) return;
        if (this.listChannel) {
            this.supabase.removeChannel(this.listChannel);
            this.listChannel = null;
        }
        const channelName = 'list_' + String(listId).replace(/[^a-zA-Z0-9_-]/g, '_');
        this.listChannel = this.supabase.channel(channelName);
        this.listChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'movie_night_items', filter: 'list_id=eq.' + listId }, () => {
                if (this.state.view !== 'list') return;
                clearTimeout(this._listRefreshTimer);
                this._listRefreshTimer = setTimeout(() => this.renderListItems(), 300);
            })
            .subscribe();
    },

    renderListItems() {
        const container = document.getElementById('list-items');
        if (!container || !this.supabase) return;
        const listId = this.state.activeListId;
        const me = this.state.authUser?.id;
        const token = this._renderToken;
        this.supabase.from('movie_night_items')
            .select('*')
            .eq('list_id', listId)
            .order('created_at', { ascending: true })
            .then(async ({ data: items }) => {
                if (token !== this._renderToken) return;
                const rows = Array.isArray(items) ? items : [];
                const adderUids = [...new Set(rows.map(i => i.added_by).filter(Boolean))];
                const adders = {};
                await Promise.all(adderUids.map(uid => this.fetchProfile(uid).then(p => { if (p) adders[uid] = p; }).catch(() => {})));
                if (token !== this._renderToken) return;
                const current = document.getElementById('list-items');
                if (!current) return;
                if (!rows.length) {
                    current.innerHTML = '<div class="list-empty">No titles on this list yet.</div>';
                    return;
                }
                current.innerHTML = rows.map(item => {
                    const poster = this.imageUrl(item.poster_path, 'w342');
                    const adder = adders[item.added_by];
                    const adderName = adder ? (adder.nickname || adder.username || 'Member') : 'Member';
                    const canRemove = Boolean(me && (item.added_by === me || this._listOwnerId === me));
                    return `
                    <article class="list-item-card">
                        <a class="list-item-poster" href="#details/${this.escapeHtml(item.content_type)}/${Number(item.content_id)}" aria-label="${this.escapeHtml(item.title || 'this title')}">
                            ${poster ? `<img src="${poster}" alt="${this.escapeHtml(item.title || '')}" loading="lazy" decoding="async">` : '<span class="list-item-poster-ph" aria-hidden="true">A</span>'}
                        </a>
                        <div class="list-item-body">
                            <a class="list-item-title" href="#details/${this.escapeHtml(item.content_type)}/${Number(item.content_id)}">${this.escapeHtml(item.title || 'Untitled')}</a>
                            <span class="list-item-meta">${this.escapeHtml(item.content_type === 'tv' ? 'TV' : 'MOVIE')}</span>
                            <span class="list-item-added">
                                <a href="#profile/${this.escapeHtml(item.added_by || '')}">${this.avatarHtml(adder, 22)} ${this.escapeHtml(adderName)}</a>
                                · ${this.timeago(item.created_at)}
                            </span>
                        </div>
                        ${canRemove ? `<button type="button" class="list-item-remove" aria-label="Remove from list" onclick="Alexandria.removeListItem('${this.escapeHtml(item.id)}')">✕</button>` : ''}
                    </article>`;
                }).join('');
            })
            .catch(() => {
                if (token !== this._renderToken) return;
                const current = document.getElementById('list-items');
                if (current) current.innerHTML = '<div class="list-empty">Could not load list items.</div>';
            });
    },

    async searchListAdd(q) {
        const query = String(q || '').trim();
        const box = document.getElementById('list-add-results');
        if (!box) return;
        if (query.length < 2) {
            box.hidden = true;
            box.innerHTML = '';
            return;
        }
        const seq = (this._listSearchSeq = (this._listSearchSeq || 0) + 1);
        try {
            const data = await this.getJson('search/multi?query=' + encodeURIComponent(query));
            if (seq !== this._listSearchSeq) return;
            const current = document.getElementById('list-add-results');
            if (!current) return;
            const results = (data.results || [])
                .filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && r.id)
                .slice(0, 6);
            if (!results.length) {
                current.innerHTML = '<div class="list-add-empty">No titles found.</div>';
                current.hidden = false;
                return;
            }
            this._listSearchResults = results;
            current.innerHTML = results.map((r, i) => {
                const rTitle = r.title || r.name || 'Untitled';
                const year = (r.release_date || r.first_air_date || '').slice(0, 4);
                const poster = this.imageUrl(r.poster_path, 'w92');
                return `
                <button type="button" class="list-add-result" onclick="Alexandria.addListItemFromSearch(${i})">
                    ${poster ? `<img src="${poster}" alt="" loading="lazy" decoding="async">` : '<span class="list-add-result-ph" aria-hidden="true">A</span>'}
                    <span class="list-add-result-info">
                        <span class="list-add-result-title">${this.escapeHtml(rTitle)}</span>
                        <span class="list-add-result-meta">${r.media_type === 'tv' ? 'TV' : 'MOVIE'}${year ? ' • ' + this.escapeHtml(year) : ''}</span>
                    </span>
                </button>`;
            }).join('');
            current.hidden = false;
        } catch {
            if (seq !== this._listSearchSeq) return;
            const current = document.getElementById('list-add-results');
            if (!current) return;
            current.innerHTML = '<div class="list-add-empty">Search failed. Try again.</div>';
            current.hidden = false;
        }
    },

    addListItemFromSearch(idx) {
        const r = this._listSearchResults && this._listSearchResults[idx];
        if (!r) return;
        this.addListItem(
            this.state.activeListId,
            r.media_type,
            Number(r.id),
            r.title || r.name || 'Untitled',
            r.poster_path || ''
        );
    },

    async addListItem(listId, type, id, title, poster) {
        const numId = Number(id);
        if (!this.supabase || !this.state.authUser) {
            this.toggleAuthModal(true, 'login');
            this.showToast('Sign in to add titles');
            return;
        }
        if (!listId || !type || !Number.isInteger(numId) || numId < 1) return;
        try {
            const { data: existing } = await this.supabase
                .from('movie_night_items')
                .select('id')
                .eq('list_id', listId)
                .eq('content_id', numId)
                .eq('content_type', type)
                .maybeSingle();
            if (existing) {
                this.showToast('Already on this list');
                return;
            }
            await this.supabase.from('movie_night_items').insert({
                list_id: listId,
                content_id: numId,
                content_type: type,
                title: title || '',
                poster_path: poster || null,
                added_by: this.state.authUser.id
            });
            const input = document.getElementById('list-add-search');
            if (input) input.value = '';
            const box = document.getElementById('list-add-results');
            if (box) { box.hidden = true; box.innerHTML = ''; }
            this.showToast('Added');
            this.renderListItems();
            this.logActivity('list_added', {
                contentId: numId,
                contentType: type,
                title: title || null,
                posterPath: poster || null,
                meta: JSON.stringify({ listId })
            });
        } catch {
            this.showToast('Could not add that title');
        }
    },

    async removeListItem(itemId) {
        if (!this.supabase || !this.state.authUser || !itemId) return;
        try {
            await this.supabase.from('movie_night_items').delete().eq('id', itemId);
            this.showToast('Removed from list');
            this.renderListItems();
        } catch {
            this.showToast('Could not remove that title');
        }
    },

    async copyListLink() {
        const url = window.location.href;
        if (await this.copyText(url)) this.showToast('Link copied');
        else this.showToast('Copy the address bar URL');
    },

    editListMode() {
        const hero = document.querySelector('.list-hero-info');
        const list = this._listRow;
        if (!hero || !list) return;
        hero.innerHTML = `
            <div class="auth-field">
                <label>List title</label>
                <input type="text" id="list-edit-title" maxlength="120" value="${this.escapeHtml(list.title || '')}">
            </div>
            <div class="auth-field">
                <label>Description</label>
                <textarea id="list-edit-desc" rows="3" maxlength="500">${this.escapeHtml(list.description || '')}</textarea>
            </div>
            <div class="profile-modal-actions">
                <button type="button" class="btn-secondary" onclick="Alexandria.renderList()">CANCEL</button>
                <button type="button" class="btn-primary" onclick="Alexandria.saveListEdit()">SAVE</button>
            </div>
        `;
    },

    async saveListEdit() {
        const titleInput = document.getElementById('list-edit-title');
        if (!titleInput || !this.supabase) return;
        const title = titleInput.value.trim();
        if (!title) {
            this.showToast('Title is required');
            return;
        }
        const descInput = document.getElementById('list-edit-desc');
        try {
            await this.supabase.from('movie_night_lists')
                .update({
                    title,
                    description: descInput ? descInput.value.trim() : '',
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.state.activeListId);
            this.showToast('List updated');
            this.renderList();
        } catch {
            this.showToast('Could not save changes');
        }
    },

    async deleteCurrentList() {
        const listId = this.state.activeListId;
        if (!this.supabase || !listId) return;
        try {
            await this.supabase.from('movie_night_lists').delete().eq('id', listId);
            this.showToast('List deleted');
            window.location.hash = '#home';
        } catch {
            this.showToast('Could not delete the list');
        }
    },

    async addToListModal(id, type) {
        if (!this.supabase || !this.state.authUser) {
            this.toggleAuthModal(true, 'login');
            this.showToast('Sign in to add titles to lists');
            return;
        }
        const me = this.state.authUser.id;
        let modal = document.getElementById('list-picker-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'list-picker-modal';
            modal.className = 'list-picker-modal-overlay';
            modal.setAttribute('hidden', '');
            modal.innerHTML = `
                <div class="list-picker-modal-card">
                    <button class="auth-close-btn" type="button" aria-label="Close" onclick="Alexandria.closeListPicker()">✕</button>
                    <h3 class="profile-modal-title">ADD TO LIST</h3>
                    <div id="list-picker-lists"><div class="list-picker-empty">Loading your lists…</div></div>
                    <span class="profile-modal-label">NEW LIST</span>
                    <div class="auth-field">
                        <input type="text" id="list-picker-new-title" placeholder="List title" maxlength="120">
                    </div>
                    <div class="profile-modal-actions">
                        <button type="button" class="btn-primary" onclick="Alexandria.createListFromPicker()">CREATE</button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', e => { if (e.target === modal) this.closeListPicker(); });
            document.body.appendChild(modal);
        }
        this._pickerItem = { id, type, title: this.state.detailsTitle, poster: this.state.detailsPoster || null };
        modal.removeAttribute('hidden');
        try {
            const { data: lists } = await this.supabase
                .from('movie_night_lists')
                .select('*')
                .eq('owner_id', me)
                .order('created_at', { ascending: false });
            const container = document.getElementById('list-picker-lists');
            if (!container) return;
            container.innerHTML = (Array.isArray(lists) && lists.length)
                ? lists.map(l => `
                    <div class="list-picker-row">
                        <div class="list-picker-row-info">
                            <span class="list-picker-row-title">${this.escapeHtml(l.title || 'Untitled list')}</span>
                            ${l.description ? `<span class="list-picker-row-desc">${this.escapeHtml(l.description)}</span>` : ''}
                        </div>
                        <button type="button" class="btn-secondary" onclick="Alexandria.pickListAdd('${this.escapeHtml(l.id)}')">ADD</button>
                    </div>`).join('')
                : '<div class="list-picker-empty">No lists yet</div>';
        } catch {
            const container = document.getElementById('list-picker-lists');
            if (container) container.innerHTML = '<div class="list-picker-empty">Could not load your lists.</div>';
        }
    },

    closeListPicker() {
        const modal = document.getElementById('list-picker-modal');
        if (modal) modal.setAttribute('hidden', '');
        this._pickerItem = null;
    },

    pickListAdd(listId) {
        const item = this._pickerItem;
        if (!item) return;
        this.closeListPicker();
        this.addListItem(listId, item.type, item.id, item.title, item.poster);
    },

    async createListFromPicker() {
        const input = document.getElementById('list-picker-new-title');
        const item = this._pickerItem;
        if (!input || !item || !this.supabase || !this.state.authUser) return;
        const title = input.value.trim();
        if (!title) {
            this.showToast('List title is required');
            return;
        }
        try {
            const { data: list } = await this.supabase.from('movie_night_lists')
                .insert({ owner_id: this.state.authUser.id, title, description: '' })
                .select()
                .maybeSingle();
            if (!list) {
                this.showToast('Could not create the list');
                return;
            }
            this.logActivity('list_created', { meta: JSON.stringify({ listId: list.id, listTitle: title }) });
            await this.addListItem(list.id, item.type, item.id, item.title, item.poster);
            this.closeListPicker();
        } catch {
            this.showToast('Could not create the list');
        }
    },

    showToast(message) {
        const existing = document.querySelector('.alexandria-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'alexandria-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3000);
    }
};

Alexandria.init();

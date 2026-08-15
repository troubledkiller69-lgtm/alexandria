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
        partyRoomId: null
    },

    servers: [
        {
            name: 'Alexandria',
            supportsApi: true,
            getMovie: id => `https://embedmaster.link/9gis39azyhxlvq5t/movie/${id}`,
            getTv: (id, s, e) => `https://embedmaster.link/9gis39azyhxlvq5t/tv/${id}/${s}/${e}`
        }
    ],

    sportsServers: [
        {
            name: 'YouTube Live Sports Feed',
            supportsApi: false,
            getStream: id => id.startsWith('http') ? id : `https://www.youtube.com/embed/${id}?autoplay=1`
        },
        {
            name: 'Custom Live Stream URL',
            supportsApi: false,
            getStream: id => id.startsWith('http') ? id : `https://www.youtube.com/embed/${id}?autoplay=1`
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

    escapeHtml(value = '') {
        return String(value).replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[character]);
    },

    // #region agent log
    _dbg(hypothesisId, location, message, data = {}) {
        try {
            if (localStorage.getItem('alexandria_debug') !== '1') return;
        } catch {
            return;
        }
        const payload = {
            sessionId: '31a370',
            runId: this._dbgRunId || 'pre-fix',
            hypothesisId,
            location,
            message,
            data: {
                ...data,
                isHost: !!this.isHost,
                view: this.state?.view,
                activeServer: this.state?.activeServer,
                serverName: this.servers?.[this.state?.activeServer]?.name,
                paused: !!this.isPartyPaused?.(),
                lastTime: this._partyLastTime,
                lastAction: this._partyLastAction,
                pageOrigin: typeof location !== 'undefined' ? location.origin : null
            },
            timestamp: Date.now()
        };
        try { console.debug('[alexandria-dbg]', hypothesisId, message, payload.data); } catch { /* ignore */ }
        const body = JSON.stringify(payload);
        try {
            fetch('/__dbg', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '31a370' },
                body
            }).catch(() => {});
        } catch { /* ignore */ }
        fetch('http://127.0.0.1:7625/ingest/4863abd6-2c9c-4516-9266-070a34aec91f', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '31a370' },
            body
        }).catch(() => {});
    },
    // #endregion

    isTrustedEmbedOrigin(origin) {
        try {
            const host = new URL(origin).hostname;
            return host === 'embedmaster.link' || host.endsWith('.embedmaster.link') ||
                   host.includes('embdmstrplayer.com') ||
                   host.includes('vidlink.pro') || host.includes('vidsrc') ||
                   host.includes('autoembed') || host.includes('embed.su');
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
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
            }
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

    async init() {
        console.log("Alexandria Protocol: Initializing Handshake...");
        this.bindSecurityGuard();
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
        
        this.bindEvents();
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
        a.click();
        URL.revokeObjectURL(url);
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
        try {
            await navigator.clipboard.writeText(url);
            this.showToast('Link copied.');
        } catch {
            this.showToast('Could not share this link.');
        }
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
        } else {
            const allowedViews = new Set(['home', 'movies', 'tv', 'anime', 'sports', 'franchises', 'search', 'history', 'watchlist']);
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

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && sidebar?.classList.contains('open')) toggleSidebar(false);
            if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.cast-card, .episode-item, .resume-widget, .person-result-card')) {
                event.preventDefault();
                event.target.click();
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

    async syncFromCloud() {
        try {
            this.state.watchlist = JSON.parse(localStorage.getItem('alexandria_watchlist')) || [];
            this.state.history = JSON.parse(localStorage.getItem('alexandria_history')) || [];
        } catch {
            this.state.watchlist = [];
            this.state.history = [];
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

        if (this.state.view === 'home') this.renderWatchlist();
    },

    async addToHistory(item) {
        this.state.history = this.state.history.filter(i => !(String(i.id) === String(item.id) && i.type === item.type));
        this.state.history.unshift(item);
        if (this.state.history.length > 20) this.state.history.pop();
        this.writeLocalList('alexandria_history', this.state.history);
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

        // Main View Routing
        if (this.state.view === 'home') this.renderHome();
        else if (this.state.view === 'movies') this.renderFiltered('movie');
        else if (this.state.view === 'tv') this.renderFiltered('tv');
        else if (this.state.view === 'anime') this.renderAnime();
        else if (this.state.view === 'sports') this.renderSports();
        else if (this.state.view === 'franchises') this.renderFranchises();
        else if (this.state.view === 'search') this.renderSearch();
        else if (this.state.view === 'history') this.renderHistoryPage();
        else if (this.state.view === 'watchlist') this.renderWatchlistPage();
        else if (this.state.view === 'player') this.renderPlayer();
        else if (this.state.view === 'details') this.renderDetails();
        else if (this.state.view === 'person') this.renderPerson();
        else if (this.state.view === 'party') this.renderParty();
        
        else {
            this.state.view = 'home';
            this.renderHome();
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

    renderWatchlistPage() {
        const watchlist = this.state.watchlist || [];
        const featured = watchlist[0];
        const heroBackdrop = featured?.backdrop_path ? this.imageUrl(featured.backdrop_path, 'original') : (featured?.poster_path ? this.imageUrl(featured.poster_path, 'original') : '');

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
                                <button class="btn-secondary" onclick="window.location.hash = '#details/${featured.type || 'movie'}/${featured.id}'">DETAILS</button>
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
                <div class="view-section">
                    <h3>Saved Titles</h3>
                    ${watchlist.length > 0 ? `
                        <div class="results-grid" id="watchlist-page-grid"></div>
                    ` : `
                        <div class="placeholder-msg">Your watchlist is empty. Add titles to save them for later.</div>
                    `}
                </div>
            </section>
        `;
        if (watchlist.length > 0) {
            this.renderResults(watchlist, 'watchlist-page-grid');
        }
    },

    SPORTS_EVENTS: [
        {
            id: 'jfKfPfyJRdk',
            league: 'NBA',
            title: 'Boston Celtics vs. Dallas Mavericks',
            category: 'Basketball',
            status: 'LIVE NOW',
            time: 'Q4 • 3:45',
            backdrop: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=1200&auto=format&fit=crop',
            overview: 'Game 5 of the NBA Finals. Celtics look to secure the championship trophy at home.'
        },
        {
            id: 'L_LUpnjgPso',
            league: 'UFC',
            title: 'UFC 305: Main Fight Card',
            category: 'MMA',
            status: 'LIVE NOW',
            time: 'Main Event',
            backdrop: 'https://images.unsplash.com/photo-1517649763962-0c623266fec0?q=80&w=1200&auto=format&fit=crop',
            overview: 'World Championship Title Fight live from the arena. Full 5-round main event.'
        },
        {
            id: '3JZ_D3ELwOQ',
            league: 'WNBA',
            title: 'Indiana Fever vs. New York Liberty',
            category: 'Basketball',
            status: 'UPCOMING',
            time: '8:00 PM ET',
            backdrop: 'https://images.unsplash.com/photo-1519766304817-4f37bda74a29?q=80&w=1200&auto=format&fit=crop',
            overview: 'Eastern Conference rivalry showdown featuring top draft picks and All-Star starters.'
        },
        {
            id: '2Vv-BfVoq4g',
            league: 'MLB',
            title: 'New York Yankees vs. Los Angeles Dodgers',
            category: 'Baseball',
            status: 'UPCOMING',
            time: '7:05 PM ET',
            backdrop: 'https://images.unsplash.com/photo-1562077772-3bd90403f7f0?q=80&w=1200&auto=format&fit=crop',
            overview: 'Interleague marquee series at Yankee Stadium. Ace starting pitchers taking the mound.'
        },
        {
            id: 'fJ9rUzIMcZQ',
            league: 'NFL',
            title: 'Kansas City Chiefs vs. San Francisco 49ers',
            category: 'Football',
            status: 'UPCOMING',
            time: '8:15 PM ET',
            backdrop: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?q=80&w=1200&auto=format&fit=crop',
            overview: 'Super Bowl rematch under the Monday Night Football lights.'
        },
        {
            id: 'YZ4gJ8dO10E',
            league: 'Soccer',
            title: 'Real Madrid vs. Barcelona',
            category: 'Soccer',
            status: 'UPCOMING',
            time: 'Tomorrow • 3:00 PM ET',
            backdrop: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=1200&auto=format&fit=crop',
            overview: 'El Clasico derby showdown. World-class talent battle for Spanish league supremacy.'
        }
    ],

    renderSports(activeFilter = 'all') {
        const events = this.SPORTS_EVENTS;
        const filtered = activeFilter === 'all'
            ? events
            : events.filter(e => e.league.toLowerCase() === activeFilter.toLowerCase());

        const featured = events[0];

        this.main.innerHTML = `
            <section class="filtered-view">
                <div class="hero-featured" style="--hero-image: url('${featured.backdrop}')">
                    <div class="featured-content">
                        <span class="trending-badge">${featured.status}</span>
                        <h1>${this.escapeHtml(featured.title)}</h1>
                        <p>${this.escapeHtml(featured.overview)}</p>
                        <div class="category-hero-actions">
                            <button class="btn-primary" onclick="Alexandria.playSportsEvent('${featured.id}')">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> WATCH LIVE
                            </button>
                        </div>
                    </div>
                    <div class="sector-widget">
                        <div class="sector-widget-content">
                            <span class="sector-label">LIVE SPORTS</span>
                            <h4>NBA, WNBA, MLB & UFC</h4>
                            <p>Live streams & match coverage</p>
                        </div>
                    </div>
                </div>
                <div class="view-section">
                    <h3>Live & Upcoming Events</h3>
                    <div class="sports-filter-bar">
                        ${['all', 'nba', 'wnba', 'mlb', 'ufc', 'nfl', 'soccer'].map(l => `
                            <button class="filter-btn ${activeFilter === l ? 'active' : ''}" type="button" onclick="Alexandria.renderSports('${l}')">${l.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    <div class="sports-grid">
                        ${filtered.map(e => `
                            <div class="sports-card">
                                <div class="sports-card-thumb" style="background-image: url('${e.backdrop}')">
                                    <div class="sports-card-overlay"></div>
                                    <span class="sports-live-tag ${e.status === 'LIVE NOW' ? '' : 'upcoming'}">${e.status}</span>
                                    <span class="sports-league-tag">${e.league}</span>
                                </div>
                                <div class="sports-card-body">
                                    <h4>${this.escapeHtml(e.title)}</h4>
                                    <p>${this.escapeHtml(e.overview)}</p>
                                    <div class="sports-card-footer">
                                        <span class="sports-card-time">${e.time}</span>
                                        <button class="btn-primary" style="padding: 0.4rem 0.85rem; font-size: 0.8rem;" onclick="Alexandria.playSportsEvent('${e.id}')">WATCH LIVE</button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </section>
        `;
    },

    playSportsEvent(eventId) {
        const ev = this.SPORTS_EVENTS.find(e => e.id === eventId) || this.SPORTS_EVENTS[0];
        this.state.activeContent = { id: ev.id, type: 'sports', title: ev.title, season: 1, episode: 1 };
        this.setView('player');
    },

    loadCustomSportsStream() {
        const input = document.getElementById('custom-stream-input');
        const url = input?.value?.trim();
        if (!url) return;
        const iframe = document.getElementById('video-iframe');
        if (iframe) {
            iframe.src = url;
            this.showToast('Loading custom stream URL...');
        }
    },

    async renderHome() {
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING SECTORS...</div>';
        
        try {
            const currentGenre = this.GENRES.find(g => g.id === (this.state.activeGenreId || 35)) || this.GENRES[0];

            // Sector 1: Core Content Scans
            const [mData, tData, nData, aData, uData, genreData] = await Promise.all([
                this.getJson('trending/movie/day'),
                this.getJson('trending/tv/day'),
                this.getJson('discover/movie?with_watch_providers=8&watch_region=US'),
                this.getJson('discover/movie?with_genres=28'),
                this.getJson('movie/upcoming'),
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
                    <div class="view-section"><h3>Netflix Originals</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="netflix-hits"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Trending TV Shows</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="trending-tv"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Upcoming Missions</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="upcoming-hits"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Action Archives</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="action-hits"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                </section>`;
            
            this.renderHistory();
            this.renderWatchlist();
            this.renderResults(genreData.results, 'genre-explorer-grid');
            this.renderResults(specialsData, 'alexandria-specials');
            this.renderResults(mData.results, 'trending-movies');
            this.renderResults(tData.results, 'trending-tv');
            this.renderResults(nData.results, 'netflix-hits');
            this.renderResults(aData.results, 'action-hits');
            this.renderResults(uData.results, 'upcoming-hits');
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
            { name: 'Marvel Cinematic Universe', movieIds: [1726, 1724, 10138, 10195, 1771, 24428, 68721, 76338, 100402, 118340, 99861, 102899, 271110, 284052, 283995, 315635, 284053, 284054, 299536, 363088, 299537, 299534, 429617, 497698, 566525, 524434, 634649, 453395, 616037, 505642, 640146, 447365, 609681, 533535], accent: '#e23636', subtitle: 'The Infinity Saga & Beyond' },
            { name: 'Star Wars', collectionId: 10, accent: '#FFE81F', subtitle: 'A Galaxy Far, Far Away' },
            { name: 'Harry Potter', collectionId: 1241, accent: '#946B2D', subtitle: 'The Wizarding World' },
            { name: 'The Lord of the Rings', collectionId: 119, accent: '#C9A84C', subtitle: 'One Ring to Rule Them All' },
            { name: 'DC Extended Universe', movieIds: [49521, 209112, 297761, 297762, 141052, 297802, 287947, 460465, 464052, 791373, 436969, 436270, 594767, 298618, 565770, 572802], accent: '#0078D7', subtitle: 'Gods Among Us' },
            { name: 'The Walking Dead Universe', tvIds: [1402, 62286, 94305, 194583, 211684, 206586], accent: '#4a7c3f', subtitle: 'Fight the Dead. Fear the Living.', isTv: true },
            { name: 'Fast & Furious', collectionId: 9485, accent: '#FF6B00', subtitle: 'Family. No Matter What.' },
            { name: 'Jurassic Park', collectionId: 328, accent: '#2E8B57', subtitle: 'Life Finds a Way' },
            { name: 'The Hunger Games', collectionId: 131635, accent: '#C4151C', subtitle: 'May The Odds Be Ever In Your Favor' },
            { name: 'Pirates of the Caribbean', collectionId: 295, accent: '#8B6914', subtitle: 'Not All Treasure Is Silver and Gold' }
        ];

        try {
            const FRANCHISE_CACHE_KEY = 'alexandria_franchise_cache_v1';
            let cached = null;
            try {
                cached = JSON.parse(sessionStorage.getItem(FRANCHISE_CACHE_KEY));
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

            this.main.innerHTML = `
                <section class="filtered-view franchise-section">
                    <div class="franchise-page-header">
                        <h2>FRANCHISE ARCHIVES</h2>
                        <p style="color:var(--text-muted);font-family:var(--font-display);letter-spacing:2px">CINEMATIC UNIVERSES & LEGENDARY SAGAS</p>
                    </div>
                    ${results.map((f, i) => f.items.length > 0 ? `
                    <div class="view-section">
                        <h3 style="display:flex;align-items:center;gap:10px">
                            <span style="color:${f.accent}">${f.name}</span>
                            <span style="font-size:0.7rem;color:var(--text-muted);font-weight:300;letter-spacing:0.1em;text-transform:uppercase;margin-left:6px">${f.subtitle}</span>
                        </h3>
                        <div class="carousel-container">
                            <button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button>
                            <div class="carousel-wrapper"><div class="carousel-grid" id="franchise-${i}"></div></div>
                            <button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button>
                        </div>
                    </div>` : '').join('')}
                </section>`;

            results.forEach((f, i) => {
                if (f.items.length > 0) {
                    this.renderResults(f.items, `franchise-${i}`);
                }
            });
        } catch (error) {
            console.error("Alexandria: Franchise Archive Load Failed -", error);
            if (token === this._renderToken) this.renderError('Franchise archives are unavailable', error.message, 'franchises');
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
                            <button type="button" class="compact-btn" onclick="Alexandria.surpriseMe()">Surprise Me</button>
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
        const type = this.state.searchFilter === 'tv' ? 'tv' : 'movie';

        this.setDiscoverVisible(true);
        container.innerHTML = '<div class="search-loading"><div class="elegant-spinner"></div></div>';

        try {
            let endpoint = `discover/${type}?sort_by=${sort}`;
            if (genre) endpoint += `&with_genres=${genre}`;
            if (year) {
                if (type === 'movie') endpoint += `&primary_release_year=${year}`;
                else endpoint += `&first_air_date_year=${year}`;
            }
            if (sort.includes('vote_average')) endpoint += `&vote_count.gte=200`;

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
        const type = this.state.searchFilter === 'tv' ? 'tv' : 'movie';
        const page = Math.floor(Math.random() * 10) + 1;
        try {
            const data = await this.getJson(`discover/${type}?sort_by=popularity.desc&page=${page}`, { noCache: true });
            const pool = (data.results || []).filter(r => r.id);
            if (!pool.length) throw new Error('No titles found.');
            const pick = pool[Math.floor(Math.random() * pool.length)];
            window.location.hash = `#details/${type}/${pick.id}`;
        } catch (error) {
            this.showToast(error.message || 'Surprise failed.');
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

    renderResults(results, containerId, isHistoryRow = false) {
        const container = document.getElementById(containerId);
        if (!container || !results) return;

        if (results.length === 0) {
            container.innerHTML = '<div class="placeholder-msg">NO SUPPLIES OR SURVIVORS FOUND.</div>';
            return;
        }

        container.innerHTML = results.map(item => {
            const title = item.title || item.name || 'Untitled';
            const safeTitle = this.escapeHtml(title);
            const poster = this.imageUrl(item.poster_path);
            const type = item.media_type === 'tv' || item.media_type === 'movie'
                ? item.media_type
                : (item.type === 'tv' || item.type === 'movie' ? item.type : (item.name && !item.title ? 'tv' : 'movie'));
            const inWatchlist = this.state.watchlist.some(i => String(i.id) === String(item.id) && i.type === type);
            const isAnime = item.isAnime || (item.origin_country && item.origin_country.includes('JP') && item.genre_ids && item.genre_ids.includes(16));
            
            const badgeHtml = isHistoryRow && type === 'tv' && item.season && item.episode
                ? `<div class="continue-badge">S${item.season}:E${item.episode}</div>`
                : (isAnime ? '<div class="anime-badge">SUB/DUB</div>' : '');

            const dataAttributes = isHistoryRow && type === 'tv' 
                ? `data-season="${item.season}" data-episode="${item.episode}"` 
                : '';
            const target = isHistoryRow && type === 'tv' && item.season && item.episode
                ? `#tv/${Number(item.id)}/s/${Number(item.season)}/e/${Number(item.episode)}`
                : isHistoryRow && type === 'movie'
                    ? `#movie/${Number(item.id)}`
                    : `#details/${type}/${Number(item.id)}`;

            return `
                <article class="movie-card" data-id="${Number(item.id)}" data-type="${type}" data-title="${safeTitle}" data-is-anime="${isAnime}" ${dataAttributes}>
                    <div class="poster-wrapper">
                        ${poster ? `<img src="${poster}" alt="${safeTitle} poster" loading="lazy" decoding="async">` : `<div class="poster-placeholder" role="img" aria-label="No poster available"><span>A</span><small>NO POSTER</small></div>`}
                        <div class="card-overlay">
                            ${badgeHtml}
                            <a class="card-open" href="${target}" aria-label="View ${safeTitle}">
                                <svg class="overlay-play" aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            </a>
                            <button class="log-btn ${inWatchlist ? 'active' : ''}" type="button" aria-label="${inWatchlist ? 'Remove from' : 'Add to'} watchlist" aria-pressed="${inWatchlist}" data-id="${Number(item.id)}" data-type="${type}" data-title="${safeTitle}" data-poster="${this.escapeHtml(item.poster_path || '')}">
                                ${inWatchlist ? '✓' : '+'}
                            </button>
                        </div>
                    </div>
                    <div class="card-info">
                        <h3><a class="card-title-link" href="${target}">${safeTitle}</a></h3>
                    </div>
                </article>`;
        }).join('');
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
        const roomId = Math.random().toString(36).substring(2, 8);
        sessionStorage.setItem('alexandria_party_creator_' + roomId, '1');
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
            const year = (data.release_date || data.first_air_date || '').split('-')[0];
            const runtime = data.runtime ? `${Math.floor(data.runtime/60)}h ${data.runtime%60}m` : (data.episode_run_time?.[0] ? `${data.episode_run_time[0]}m` : '');
            const tmdbScore = data.vote_average ? data.vote_average.toFixed(1) : null;
            const genres = (data.genres || []).map(g => g.name).join(' • ');
            const backdrop = this.imageUrl(data.backdrop_path, 'original');
            const poster = this.imageUrl(data.poster_path);
            
            const inWatchlist = this.state.watchlist.some(i => String(i.id) === String(id) && i.type === type);
            
            const trailer = data.videos?.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer' && /^[\w-]{6,20}$/.test(v.key));
            
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
                                    <button class="icon-btn log-btn ${inWatchlist ? 'active' : ''}" type="button" aria-label="${inWatchlist ? 'Remove from' : 'Add to'} watchlist" aria-pressed="${inWatchlist}" data-id="${Number(id)}" data-type="${type}" data-title="${this.escapeHtml(title)}" data-poster="${this.escapeHtml(data.poster_path || '')}">
                                        ${inWatchlist ? '✓' : '+'}
                                    </button>
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
                            <iframe src="https://www.youtube-nocookie.com/embed/${trailer.key}?controls=1&modestbranding=1&rel=0" title="${this.escapeHtml(title)} official trailer" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>
                        </div>
                    </div>` : ''}

                    ${data.similar?.results?.length ? `
                    <div class="view-section">
                        <h3>SIMILAR TITLES</h3>
                        <div class="carousel-container">
                            <button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button>
                            <div class="carousel-wrapper"><div class="carousel-grid" id="similar-results"></div></div>
                            <button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button>
                        </div>
                    </div>` : ''}
                </section>
            `;
            
            if (data.similar?.results?.length) {
                data.similar.results.forEach(item => {
                    if (!item.media_type) item.media_type = type;
                });
                this.renderResults(data.similar.results, 'similar-results');
            }
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

    async renderPlayer() {
        const { id, type, season, episode, isAnime } = this.state.activeContent;
        const serverList = type === 'sports' ? this.sportsServers : this.servers;
        if (!serverList[this.state.activeServer]) this.state.activeServer = 0;
        const server = serverList[this.state.activeServer];
        const embedUrl = this.buildEmbedUrl(this.state.activeServer);

        this._triedServers = new Set([this.state.activeServer]);
        this._serverHealthy = false;
        this._currentSeasonEpisodes = [];

        this.main.innerHTML = `
            <section class="player-layout">
                <div class="player-main">
                    <div class="server-controls" style="flex-wrap:wrap;">
                        <label class="server-label" for="server-selector">SERVER <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></label>
                        <select id="server-selector" class="server-select-dropdown" onchange="Alexandria.handleServerChange(this.value)">
                            ${serverList.map((s, i) => `<option value="${i}" ${i === this.state.activeServer ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                        <span id="server-status" class="server-status" aria-live="polite">Connecting to ${this.escapeHtml(server.name)}…</span>
                        ${type === 'sports' ? `
                            <div class="custom-stream-bar" style="display:flex; gap:0.5rem; width:100%; margin-top:0.5rem;">
                                <input type="text" id="custom-stream-input" class="compact-input" placeholder="Paste custom live stream URL or embed link..." style="flex:1;">
                                <button class="btn-primary" type="button" style="padding:0.45rem 1rem; font-size:0.8rem;" onclick="Alexandria.loadCustomSportsStream()">PLAY STREAM</button>
                            </div>
                        ` : ''}
                    </div>
                    <div class="player-frame-container">
                        <iframe id="video-iframe" title="Alexandria video player" src="${embedUrl}" width="100%" height="100%" scrolling="no" allowfullscreen allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *" referrerpolicy="strict-origin-when-cross-origin"></iframe>
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
            </section>`;

        this.bindSoloPlayerEvents();
        this.prepareResumeSeek();
        this.armFailoverWatch(server);
        this.scheduleEmbedTheme(document.getElementById('video-iframe'));

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
        const { id, type, season, episode } = content || {};
        if (type === 'sports') {
            const list = this.sportsServers || [];
            const idx = (Number.isInteger(Number(serverIndex)) && list[Number(serverIndex)]) ? Number(serverIndex) : 0;
            return list[idx] ? list[idx].getStream(id || 'jfKfPfyJRdk') : `https://www.youtube.com/embed/${id || 'jfKfPfyJRdk'}?autoplay=1`;
        }
        const idx = this.normalizeServerIndex(serverIndex);
        const server = this.servers[idx != null ? idx : this.state.activeServer];
        if (!server || id == null) return '';
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
        this.clearHostPartyResyncTimers();
        // ready + load can be flaky after a mirror swap — hammer a few force syncs.
        const delays = [450, 1000, 3000, 5000];
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

            container.innerHTML = this._currentSeasonEpisodes.map(ep => `
                <div class="episode-item ${this.state.activeContent.episode == ep.episode_number ? 'active' : ''}" role="link" tabindex="0"
                     onclick="window.location.hash = '#tv/${id}/s/${season}/e/${ep.episode_number}'">
                    <span class="ep-num">EP ${ep.episode_number}</span>
                    <span class="ep-name">${this.escapeHtml(ep.name || 'Untitled episode')}</span>
                </div>`).join('');
        } catch (e) {
            console.error("Alexandria Protocol: Episode Load Failed -", e);
            const container = document.getElementById('sidebar-episodes');
            if (container) container.innerHTML = '<div class="placeholder-msg">EPISODES COULD NOT BE LOADED.</div>';
        }
    },



    async renderParty() {
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
                        <iframe id="embedmaster_iframe" title="Watch Party" src="${embedUrl}" allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
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

        if (!sessionStorage.getItem('alexandria_nickname')) {
            let nickname = '';
            try {
                nickname = prompt('Enter a nickname for the Watch Party:') || '';
            } catch {
                nickname = '';
            }
            if (!nickname.trim()) nickname = 'Guest_' + Math.floor(Math.random() * 1000);
            sessionStorage.setItem('alexandria_nickname', nickname.trim().slice(0, 24));
        }
        if (!sessionStorage.getItem('alexandria_party_uid')) {
            sessionStorage.setItem(
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
        win.postMessage({ api: 'time' }, '*');
        win.postMessage({ api: 'getTime' }, '*');
        win.postMessage({ source: 'embedmaster_player_command', command: 'getTime' }, '*');
    },

    requestPlayerPaused(frame) {
        if (!frame?.contentWindow) return;
        const win = frame.contentWindow;
        win.postMessage({ api: 'paused' }, '*');
        win.postMessage({ api: 'getPaused' }, '*');
        win.postMessage({ source: 'embedmaster_player_command', command: 'paused' }, '*');
        win.postMessage({ source: 'embedmaster_player_command', command: 'getPaused' }, '*');
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
        const paint = () => this.themeEmbedPlayer(frame);
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
        const time = asNum(info)
            ?? asNum(info?.time)
            ?? asNum(data.time)
            ?? asNum(data.data)
            ?? asNum(data.data?.time)
            ?? asNum(data.value)
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

                const wasHost = this.isHost;
                // Room creator stays host while present; otherwise earliest joiner.
                this.isHost = isCreator ? true : (hostKey === uid);
                if (this.isHost) this._partyGuestUnlocked = true;

                this.updatePartyRoleUI();

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
        const looksLikeEmbedMaster = event.data?.source === 'embedmaster_player';
        const looksLikePlayerJsReply = event.data?.answer !== undefined;
        if (!originOk && !looksLikeEmbedMaster && !looksLikePlayerJsReply) return;

        // Always harvest timestamps from any player traffic — don’t depend on one event shape.
        if (this.isHost) {
            this.ingestEmbedTimePayload(event.data);
        }

        const parsed = this.parseEmbedPlayerEvent(event.data);
        if (!parsed) return;

        const { event: ev, time } = parsed;

        if (ev === 'ready' || ev === 'init' || ev === 'start') {
            this.markPartyEmbedHealthy();
            this.themeEmbedPlayer(document.getElementById('embedmaster_iframe'));
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
                if (this._pendingPartySync) {
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
        try {
            await navigator.clipboard.writeText(url);
            this.showToast('Invite link copied to clipboard!');
        } catch {
            try {
                const input = document.createElement('input');
                input.value = url;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                input.remove();
                this.showToast('Invite link copied to clipboard!');
            } catch {
                this.showToast('Could not copy link. Copy from the address bar.');
            }
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

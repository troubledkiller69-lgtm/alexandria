const Alexandria = {
    state: {
        view: 'home', // home, movies, tv, anime, search, player
        user: null,
        clickCount: 0,
        searchTimeout: null,
        trendingData: null,
        activeContent: { id: null, type: 'movie', season: 1, episode: 1 },
        searchQuery: '',
        searchFilter: 'multi',
        activeServer: 0,
        watchlist: [],
        history: []
    },

    servers: [
        { name: "Alexandria", getMovie: id => `https://embedmaster.link/9gis39azyhxlvq5t/movie/${id}`, getTv: (id, s, e) => `https://embedmaster.link/9gis39azyhxlvq5t/tv/${id}/${s}/${e}` }
    ],

    supabase: null,
    _renderToken: 0,

    escapeHtml(value = '') {
        return String(value).replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[character]);
    },

    imageUrl(path, size = 'w500') {
        if (typeof path === 'string' && /^https:\/\/image\.tmdb\.org\/t\/p\/[a-zA-Z0-9]+\/[a-zA-Z0-9._/-]+$/.test(path)) return path;
        return typeof path === 'string' && /^\/[a-zA-Z0-9._/-]+$/.test(path)
            ? `https://image.tmdb.org/t/p/${size}${path}`
            : '';
    },

    async getJson(endpoint, options = {}) {
        const response = await fetch(`/api/proxy?endpoint=${encodeURIComponent(endpoint)}`, options);
        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error('The archive returned an unreadable response.');
        }
        if (!response.ok || data?.success === false || data?.error) {
            throw new Error(data?.status_message || data?.error || `Archive request failed (${response.status}).`);
        }
        return data;
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

    async init() {
        console.log("Alexandria Protocol: Initializing Handshake...");
        this.main = document.getElementById('content');
        
        // Start loading sequence immediately
        const loadingPromise = this.simulateLoading();

        await this.syncFromCloud();

        // Authentication is optional; local watchlists work without Supabase.
        this.initNetwork().catch(e => {
            console.error("Alexandria Protocol: Background Init Failed -", e);
        });

        // Wait for loading bar to finish
        await loadingPromise;
        
        this.bindEvents();
        window.addEventListener('hashchange', () => this.handleRouting());
        this.handleRouting();
    },

    async initNetwork() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // Increased to 10s

        try {
            const configRes = await fetch('/api/config', { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!configRes.ok) throw new Error(`Configuration unavailable (${configRes.status})`);
            const config = await configRes.json();
            
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                console.info("Alexandria Protocol: Cloud sync is not configured; using local mode.");
                this.updateSyncIndicator('GUEST');
                return;
            }

            if (!window.supabase?.createClient) throw new Error('Account service failed to load.');
            this.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
            
            this.supabase.auth.onAuthStateChange(async (event, session) => {
                console.log("Alexandria Protocol: Auth Event -", event);
                const prevUser = this.state.user;
                this.state.user = session?.user || null;
                this.updateSyncIndicator(this.state.user ? 'SYNCED' : 'OFFLINE');
                
                if (event === 'SIGNED_IN' && !prevUser) {
                    await this.syncFromCloud();
                    this.setView('home');
                } else if (event === 'SIGNED_OUT') {
                    await this.syncFromCloud();
                    this.setView('home');
                }
                this.render();
            });

            const { data: { session } } = await this.supabase.auth.getSession();
            if (session) {
                this.state.user = session.user;
                this.updateSyncIndicator('SYNCED');
                await this.syncFromCloud();
                if (this.state.view === 'auth') this.setView('home');
            } else {
                if (this.state.view === 'auth') this.state.view = 'home';
                this.updateSyncIndicator('GUEST');
            }
        } catch (e) {
            console.error("Alexandria Protocol: Handshake Failure -", e);
            this.updateSyncIndicator('OFFLINE');
        }
    },

    updateSyncIndicator(status) {
        const dot = document.querySelector('.status-dot');
        const text = document.querySelector('.status-text');
        if (!dot || !text) return;
        
        if (status === 'SYNCED') {
            dot.style.background = '#10b981';
            dot.style.boxShadow = '0 0 10px #10b981';
            text.textContent = 'ARCHIVE SYNCED';
        } else if (status === 'OFFLINE') {
            dot.style.background = '#ef4444';
            dot.style.boxShadow = '0 0 10px #ef4444';
            text.textContent = 'SYNC OFFLINE';
        } else if (status === 'GUEST') {
            dot.style.background = '#f59e0b';
            dot.style.boxShadow = '0 0 10px #f59e0b';
            text.textContent = 'LOCAL MODE';
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
                if (progress > 60 && progress < 90) statusText.textContent = "SYNCING CLOUD DATA...";
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
            const allowedViews = new Set(['home', 'movies', 'tv', 'anime', '420', 'franchises', 'search']);
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
            if (sidebar) sidebar.inert = !willOpen;
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

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && sidebar?.classList.contains('open')) toggleSidebar(false);
            if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.cast-card, .episode-item, .resume-widget')) {
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
            const authTrigger = e.target.id === 'auth-trigger' || e.target.closest('#auth-trigger');
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
            }
            } else {
                const card = e.target.classList.contains('movie-card') ? e.target : e.target.closest('.movie-card');
                if (card) {
                    const isAnime = card.dataset.isAnime === 'true';
                    const season = parseInt(card.dataset.season);
                    const episode = parseInt(card.dataset.episode);
                    
                    if (season && episode) {
                        window.location.hash = `#tv/${card.dataset.id}/s/${season}/e/${episode}`;
                    } else {
                        window.location.hash = `#details/${card.dataset.type}/${card.dataset.id}`;
                    }
                }
            }
        });

    },

    setView(view) {
        this.state.view = view;
        this._renderToken += 1;
        if (this._autoNextTimer) { clearInterval(this._autoNextTimer); this._autoNextTimer = null; }
        this.render();
        window.scrollTo({ top: 0, behavior: 'auto' });
    },

    async handleAuth(e, type) {
        e.preventDefault();
        if (!this.supabase) {
            this.showToast('Cloud accounts are not configured. Your lists are still saved on this device.');
            return;
        }
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        let avatar = 'python';
        if (type === 'signup') {
            const selected = document.querySelector('input[name="avatar"]:checked');
            if (selected) avatar = selected.value;
        }

        const btn = e.currentTarget.querySelector('button[type="submit"]');
        btn.textContent = "VERIFYING...";
        btn.disabled = true;

        try {
            const { data, error } = type === 'login' 
                ? await this.supabase.auth.signInWithPassword({ email, password })
                : await this.supabase.auth.signUp({ email, password });
            
            if (error) throw error;
            
            if (type === 'signup' && data.user) {
                // Create profile with avatar
                const { error: profileError } = await this.supabase
                    .from('profiles')
                    .upsert({ id: data.user.id, email, avatar_id: avatar }, { onConflict: 'id' });
                
                if (profileError) console.error("Profile creation error:", profileError);
                alert("Security Credentials Created! Please check email for verification.");
                window.location.hash = '#login';
            } else if (type === 'login' && data.user) {
                this.state.user = data.user;
                await this.syncFromCloud();
                this.setView('home');
            }
        } catch (error) {
            alert("Archive Error: " + error.message);
            btn.textContent = type === 'login' ? "ACCESS ARCHIVE" : "CREATE CREDENTIALS";
            btn.disabled = false;
        }
    },

    async syncFromCloud() {
        if (!this.state.user) {
            try {
                this.state.watchlist = JSON.parse(localStorage.getItem('alexandria_watchlist')) || [];
                this.state.history = JSON.parse(localStorage.getItem('alexandria_history')) || [];
            } catch (e) {
                this.state.watchlist = [];
                this.state.history = [];
            }
            return;
        }
        const [wRes, hRes, pRes] = await Promise.all([
            this.supabase.from('survival_cache').select('*').order('added_at', { ascending: false }),
            this.supabase.from('history').select('*').order('created_at', { ascending: false }).limit(10),
            this.supabase.from('profiles').select('avatar_id').eq('id', this.state.user.id).single()
        ]);
        this.state.watchlist = wRes.data?.map(i => ({ id: String(i.tmdb_id), type: i.media_type, title: i.title, poster_path: i.poster_path })) || [];
        
        if (pRes.data?.avatar_id) {
            this.state.avatar = pRes.data.avatar_id;
            this.updateAvatarUI();
        }

        let localHistory = [];
        try { localHistory = JSON.parse(localStorage.getItem('alexandria_history')) || []; } catch { /* ignore invalid local data */ }
        this.state.history = hRes.data?.map(i => {
            const local = localHistory.find(lh => String(lh.id) === String(i.content_id) && lh.type === i.type);
            return {
                id: String(i.content_id), type: i.type, title: i.title, poster_path: i.poster_path,
                season: local?.season || 1, episode: local?.episode || 1, isAnime: local?.isAnime || false
            };
        }) || [];
    },

    updateAvatarUI() {
        const authBtn = document.getElementById('auth-trigger');
        if (!authBtn || !this.state.avatar) return;
        
        const avatarMap = {
            'rick': 'https://image.tmdb.org/t/p/w185/yVrGBtHXFMYYjjybMIRBMNatF1c.jpg',
            'michonne': 'https://image.tmdb.org/t/p/w185/xNHWHlcJfiibWWMJGJDOPMRaOYl.jpg',
            'daryl': 'https://image.tmdb.org/t/p/w185/khMla0oVIVIpMIIVLMqBCMqXXaJ.jpg',
            'negan': 'https://image.tmdb.org/t/p/w185/bVMBBwVoPn35OmS1JpCCz2cOSqz.jpg',
            'carl': 'https://image.tmdb.org/t/p/w185/7LECqLCy1sHHxE9OcGYSmfeXrmW.jpg'
        };
        
        const imgUrl = avatarMap[this.state.avatar];
        if (imgUrl) {
            authBtn.innerHTML = `<img src="${imgUrl}" alt="${this.state.avatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;">`;
        } else {
            authBtn.innerHTML = `<span style="font-size: 1.2rem;">👤</span>`;
        }
        authBtn.style.border = '1px solid var(--accent-primary)';
        authBtn.style.background = 'rgba(138, 3, 3, 0.1)';
        authBtn.style.borderRadius = '50%';
        authBtn.style.padding = '2px';
    },

    async toggleWatchlist(item) {
        const itemId = String(item.id);
        const index = this.state.watchlist.findIndex(i => String(i.id) === itemId && i.type === item.type);
        
        // Find all buttons for this item in the DOM and update them immediately
        document.querySelectorAll(`.log-btn[data-id="${itemId}"][data-type="${item.type}"]`).forEach(btn => {
            const isActive = btn.classList.contains('active');
            btn.classList.toggle('active');
            btn.textContent = isActive ? '+' : '✓';
            btn.setAttribute('aria-pressed', String(!isActive));
            btn.setAttribute('aria-label', isActive ? 'Add to watchlist' : 'Remove from watchlist');
        });

        if (index === -1) {
            this.state.watchlist.unshift(item);
            if (this.state.user) {
                await this.supabase.from('survival_cache').insert({ user_id: this.state.user.id, tmdb_id: itemId, media_type: item.type, title: item.title, poster_path: item.poster_path });
            }
        } else {
            this.state.watchlist.splice(index, 1);
            if (this.state.user) {
                await this.supabase.from('survival_cache').delete().match({ user_id: this.state.user.id, tmdb_id: itemId, media_type: item.type });
            }
        }
        
        this.writeLocalList('alexandria_watchlist', this.state.watchlist);
        this.showToast(index === -1 ? 'Added to your watchlist.' : 'Removed from your watchlist.');
        
        // If we are in the Home view, we only need to update the Watchlist row, not re-fetch everything
        if (this.state.view === 'home') this.renderWatchlist();
    },

    async addToHistory(item) {
        this.state.history = this.state.history.filter(i => !(String(i.id) === String(item.id) && i.type === item.type));
        this.state.history.unshift(item);
        if (this.state.history.length > 20) this.state.history.pop();
        
        // Always save to localStorage to preserve season/episode data
        this.writeLocalList('alexandria_history', this.state.history);
        
        if (this.state.user) {
            try {
                // Remove existing to prevent duplicates
                await this.supabase.from('history').delete().match({ user_id: this.state.user.id, content_id: item.id, type: item.type });
                // Only insert known columns to prevent schema errors
                await this.supabase.from('history').insert({ user_id: this.state.user.id, content_id: item.id, type: item.type, title: item.title, poster_path: item.poster_path });
            } catch(e) { console.error('Alexandria: History Sync Error', e); }
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

        // Main View Routing
        if (this.state.view === 'home') this.renderHome();
        else if (this.state.view === 'movies') this.renderFiltered('movie');
        else if (this.state.view === 'tv') this.renderFiltered('tv');
        else if (this.state.view === 'anime') this.renderAnime();
        else if (this.state.view === 'franchises') this.renderFranchises();
        else if (this.state.view === 'search') this.renderSearch();
        else if (this.state.view === 'player') this.renderPlayer();
        else if (this.state.view === 'details') this.renderDetails();
        else if (this.state.view === 'person') this.renderPerson();
        
        else {
            this.state.view = 'home';
            this.renderHome();
        }
    },

    renderAuth() {
        // Prevent re-rendering if already on auth screen (unless forced)
        if (this.main.querySelector('.auth-card') && !this.main.querySelector('[onsubmit*="signup"]')) return;

        const card = this.main.querySelector('.auth-card');
        const token = this._renderToken;
        if (card) card.classList.add('switching');
        
        setTimeout(() => {
            if (token !== this._renderToken) return;
            this.main.innerHTML = `
                <section class="auth-view">
                    <div class="auth-card">
                        <div class="safe-zone-stamp large">A</div>
                        <h2>ALEXANDRIA</h2>
                        <p class="auth-subtitle">SECURITY CLEARANCE REQUIRED</p>
                        <form onsubmit="Alexandria.handleAuth(event, 'login')">
                            <div class="input-group">
                                <label for="auth-email">SURVIVOR EMAIL</label>
                                <input type="email" id="auth-email" required autocomplete="email" placeholder="IDENTIFICATION CODE">
                            </div>
                            <div class="input-group">
                                <label for="auth-password">ACCESS PASSKEY</label>
                                <input type="password" id="auth-password" required autocomplete="current-password" minlength="6" placeholder="SECURE KEY">
                            </div>
                            <button type="submit" class="btn-primary full">ACCESS ARCHIVE</button>
                        </form>
                        <div class="auth-footer">
                            <p>NEW TO THE SAFE ZONE? <a href="#signup">REQUEST ACCESS</a></p>
                            <p style="margin-top: 1rem;"><a href="#home" style="color: var(--text-secondary); border-color: transparent;">RETURN TO ARCHIVE</a></p>
                        </div>
                    </div>
                </section>`;
        }, card ? 300 : 0);
    },

    renderSignup() {
        const card = this.main.querySelector('.auth-card');
        const token = this._renderToken;
        if (card) card.classList.add('switching');
        
        setTimeout(() => {
            if (token !== this._renderToken) return;
            this.main.innerHTML = `
                <section class="auth-view">
                    <div class="auth-card">
                        <div class="safe-zone-stamp large">A</div>
                        <h2>JOIN ARCHIVE</h2>
                        <p class="auth-subtitle">ESTABLISH NEW CREDENTIALS</p>
                        <form onsubmit="Alexandria.handleAuth(event, 'signup')">
                            <div class="input-group">
                                <label for="auth-email">SURVIVOR EMAIL</label>
                                <input type="email" id="auth-email" required autocomplete="email" placeholder="ASSIGN EMAIL">
                            </div>
                            <div class="input-group">
                                <label for="auth-password">ACCESS PASSKEY</label>
                                <input type="password" id="auth-password" required autocomplete="new-password" minlength="6" placeholder="CREATE KEY">
                            </div>
                            <div class="input-group">
                                <label>CHOOSE YOUR SURVIVOR</label>
                                <div class="avatar-selector">
                                    <label class="avatar-option">
                                        <input type="radio" name="avatar" value="rick" checked>
                                        <span class="avatar-icon" title="Rick Grimes"><img src="https://image.tmdb.org/t/p/w185/yVrGBtHXFMYYjjybMIRBMNatF1c.jpg" alt="Rick"></span>
                                    </label>
                                    <label class="avatar-option">
                                        <input type="radio" name="avatar" value="michonne">
                                        <span class="avatar-icon" title="Michonne"><img src="https://image.tmdb.org/t/p/w185/xNHWHlcJfiibWWMJGJDOPMRaOYl.jpg" alt="Michonne"></span>
                                    </label>
                                    <label class="avatar-option">
                                        <input type="radio" name="avatar" value="daryl">
                                        <span class="avatar-icon" title="Daryl Dixon"><img src="https://image.tmdb.org/t/p/w185/khMla0oVIVIpMIIVLMqBCMqXXaJ.jpg" alt="Daryl"></span>
                                    </label>
                                    <label class="avatar-option">
                                        <input type="radio" name="avatar" value="negan">
                                        <span class="avatar-icon" title="Negan"><img src="https://image.tmdb.org/t/p/w185/bVMBBwVoPn35OmS1JpCCz2cOSqz.jpg" alt="Negan"></span>
                                    </label>
                                    <label class="avatar-option">
                                        <input type="radio" name="avatar" value="carl">
                                        <span class="avatar-icon" title="Carl Grimes"><img src="https://image.tmdb.org/t/p/w185/7LECqLCy1sHHxE9OcGYSmfeXrmW.jpg" alt="Carl"></span>
                                    </label>
                                </div>
                            </div>
                            <button type="submit" class="btn-primary full">CREATE CREDENTIALS</button>
                        </form>
                        <div class="auth-footer">
                            <p>ALREADY A SURVIVOR? <a href="#login">LOG IN</a></p>
                            <p style="margin-top: 1rem;"><a href="#home" style="color: var(--text-secondary); border-color: transparent;">RETURN TO ARCHIVE</a></p>
                        </div>
                    </div>
                </section>`;
        }, card ? 300 : 0);
    },

    async renderHome() {
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING SECTORS...</div>';
        
        try {
            // Sector 1: Core Content Scans
            const [mData, tData, nData, aData, uData] = await Promise.all([
                this.getJson('trending/movie/day'),
                this.getJson('trending/tv/day'),
                this.getJson('discover/movie?with_watch_providers=8&watch_region=US'),
                this.getJson('discover/movie?with_genres=28'),
                this.getJson('movie/upcoming')
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

            if (!featured) throw new Error("No featured content found.");

            this.main.innerHTML = `
                <section class="home-view">
                    <div class="hero-featured" style="--hero-image: url('${this.imageUrl(featured.backdrop_path, 'original')}')">
                        <div class="featured-content">
                            <span class="trending-badge">#1 TRENDING TODAY</span>
                            <h1>${this.escapeHtml(featured.title)}</h1>
                            <p>${this.escapeHtml(featured.overview || 'No overview is available yet.')}</p>
                            <button class="btn-primary" onclick="Alexandria.playContent(${featured.id}, 'movie')">WATCH NOW</button>
                        </div>
                        ${last ? `<div class="resume-widget" role="link" tabindex="0" onclick="window.location.hash = '${last.type === 'tv' ? `#tv/${last.id}/s/${last.season || 1}/e/${last.episode || 1}` : `#movie/${last.id}`}'">
                            <div class="resume-content"><span class="resume-label">CONTINUE WATCHING</span><h4>${this.escapeHtml(last.title)}</h4><p>Resume playback</p></div>
                        </div>` : ''}
                    </div>
                    <div id="continue-watching-section"></div>
                    <div id="priority-archive-section"></div>
                    <div class="view-section"><h3>ALEXANDRIA'S SPECIALS</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="alexandria-specials"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Trending Movies</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="trending-movies"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Netflix Originals</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="netflix-hits"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Trending TV Shows</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="trending-tv"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Upcoming Missions</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="upcoming-hits"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>Action Archives</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="action-hits"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                </section>`;
            
            this.renderHistory();
            this.renderWatchlist();
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
            container.innerHTML = `<div class="view-section"><h3>SURVIVAL CACHE</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="watchlist-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>`;
            this.renderResults(this.state.watchlist, 'watchlist-results');
        } else {
            container.innerHTML = '<div class="view-section"><h3>SURVIVAL CACHE</h3><div class="placeholder-msg">Your cache is empty. Time to scavenge for new supplies.</div></div>';
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
        this.main.innerHTML = '<div class="placeholder-msg">SCANNING SECTORS...</div>';
        try {
            const [popData, topData, actData, horData, sciData] = await Promise.all([
                this.getJson(type + '/popular'),
                this.getJson(type + '/top_rated'),
                this.getJson('discover/' + type + '?with_genres=' + (type === 'movie' ? '28' : '10759')),
                this.getJson('discover/' + type + '?with_genres=27'),
                this.getJson('discover/' + type + '?with_genres=878')
            ]);
            if (token !== this._renderToken) return;

            this.main.innerHTML = `
                <section class="filtered-view">
                    <div class="view-header"><h2>${type === 'movie' ? 'Movies' : 'TV Shows'}</h2></div>
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

            this.main.innerHTML = `
                <section class="filtered-view">
                    <div class="view-header"><h2>Anime Hub</h2></div>
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
            { name: 'Marvel Cinematic Universe', collectionId: 86311, accent: '#e23636', subtitle: 'The Infinity Saga & Beyond' },
            { name: 'Star Wars', collectionId: 10, accent: '#FFE81F', subtitle: 'A Galaxy Far, Far Away' },
            { name: 'Harry Potter', collectionId: 1241, accent: '#946B2D', subtitle: 'The Wizarding World' },
            { name: 'The Lord of the Rings', collectionId: 119, accent: '#C9A84C', subtitle: 'One Ring to Rule Them All' },
            { name: 'The Dark Knight Trilogy', collectionId: 114, accent: '#0078D7', subtitle: 'Gods Among Us' },
            { name: 'The Walking Dead Universe', tvIds: [1402, 62286, 94305, 194583, 211684, 206586], accent: '#4a7c3f', subtitle: 'Fight the Dead. Fear the Living.', isTv: true },
            { name: 'Fast & Furious', collectionId: 9485, accent: '#FF6B00', subtitle: 'Family. No Matter What.' },
            { name: 'Jurassic Park', collectionId: 328, accent: '#2E8B57', subtitle: 'Life Finds a Way' },
            { name: 'The Hunger Games', collectionId: 131635, accent: '#C4151C', subtitle: 'May The Odds Be Ever In Your Favor' },
            { name: 'Pirates of the Caribbean', collectionId: 295, accent: '#8B6914', subtitle: 'Not All Treasure Is Silver and Gold' }
        ];

        try {
            const fetchCollection = async (franchise) => {
                if (franchise.isTv) {
                    // Fetch TV shows by individual ID
                    const results = await Promise.all(franchise.tvIds.map(async id => {
                        try {
                            const data = await this.getJson('tv/' + id);
                            return { ...data, media_type: 'tv' };
                        } catch { return null; }
                    }));
                    return { ...franchise, items: results.filter(Boolean) };
                }
                try {
                    const data = await this.getJson('collection/' + franchise.collectionId);
                    // Sort by release date (chronological)
                    const sorted = (data.parts || []).sort((a, b) => new Date(a.release_date || '9999') - new Date(b.release_date || '9999'));
                    return { ...franchise, items: sorted };
                } catch { return { ...franchise, items: [] }; }
            };

            const results = await Promise.all(franchises.map(fetchCollection));
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
        this.main.innerHTML = `
            <section class="search-view modern-search">
                <div class="search-header-sticky">
                    <div class="search-input-container">
                        <svg class="search-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <label class="sr-only" for="tmdb-search">Search movies and TV shows</label>
                        <input type="search" id="tmdb-search" placeholder="What are you looking for, survivor?" autocomplete="off">
                        <button class="clear-search" id="clear-search-btn" type="button" aria-label="Clear search" style="display:none" onclick="document.getElementById('tmdb-search').value=''; Alexandria.handleSearchInput();">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div class="search-filters" aria-label="Search type">
                        <button class="filter-btn ${this.state.searchFilter === 'multi' ? 'active' : ''}" type="button" aria-pressed="${this.state.searchFilter === 'multi'}" onclick="Alexandria.setSearchFilter('multi')">All</button>
                        <button class="filter-btn ${this.state.searchFilter === 'movie' ? 'active' : ''}" type="button" aria-pressed="${this.state.searchFilter === 'movie'}" onclick="Alexandria.setSearchFilter('movie')">Movies</button>
                        <button class="filter-btn ${this.state.searchFilter === 'tv' ? 'active' : ''}" type="button" aria-pressed="${this.state.searchFilter === 'tv'}" onclick="Alexandria.setSearchFilter('tv')">TV Shows</button>
                    </div>
                </div>
                <div class="results-grid" id="search-results">
                    <div class="search-empty-state">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <h3>Find your next favorite</h3>
                        <p>Search by title to explore the archive.</p>
                    </div>
                </div>
            </section>
        `;
        
        const searchInput = document.getElementById('tmdb-search');
        searchInput.addEventListener('input', () => this.handleSearchInput());
        
        if (this.state.searchQuery) {
            searchInput.value = this.state.searchQuery;
            document.getElementById('clear-search-btn').style.display = 'block';
            this.executeSearch(this.state.searchQuery);
        } else {
            // Focus input if empty
            setTimeout(() => searchInput.focus(), 100);
        }
    },

    handleSearchInput() {
        const queryField = document.getElementById('tmdb-search');
        const clearBtn = document.getElementById('clear-search-btn');
        const query = queryField.value;
        
        clearBtn.style.display = query.trim() ? 'block' : 'none';
        
        if (this.state.searchTimeout) clearTimeout(this.state.searchTimeout);
        
        if (!query.trim()) {
            this.state.searchQuery = '';
            document.getElementById('search-results').innerHTML = `
                <div class="search-empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <h3>Find your next favorite</h3>
                    <p>Search by title to explore the archive.</p>
                </div>`;
            history.replaceState(null, null, '#search');
            return;
        }

        this.state.searchTimeout = setTimeout(() => {
            this.state.searchQuery = query.trim();
            history.replaceState(null, null, `#search/${encodeURIComponent(query.trim())}`);
            this.executeSearch(query.trim());
        }, 500); // 500ms debounce
    },

    setSearchFilter(filter) {
        this.state.searchFilter = filter;
        this.renderSearch();
    },

    async executeSearch(query) {
        if (!query) return;
        const container = document.getElementById('search-results');
        if (!container) return;
        const requestId = (this._searchRequestId || 0) + 1;
        this._searchRequestId = requestId;
        container.innerHTML = '<div class="search-loading"><div class="elegant-spinner"></div></div>';
        
        try {
            const filter = this.state.searchFilter || 'multi';
            const endpoint = `search/${filter}?query=${encodeURIComponent(query)}`;
            const data = await this.getJson(endpoint);
            if (requestId !== this._searchRequestId || !document.body.contains(container)) return;
            const results = data.results || [];
            
            // Filter out people if multi search returns them
            const filteredResults = results.filter(item => item.media_type !== 'person');
            
            if (filteredResults.length === 0) {
                 container.innerHTML = `<div class="placeholder-msg">NO ARCHIVE RECORDS FOUND FOR "${this.escapeHtml(query.toUpperCase())}".</div>`;
                 return;
            }
            
            // Clear inner HTML specifically and let renderResults inject
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
                : (item.name && !item.title ? 'tv' : 'movie');
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
                : `#details/${type}/${Number(item.id)}`;

            return `
                <article class="movie-card" data-id="${Number(item.id)}" data-type="${type}" data-title="${safeTitle}" data-is-anime="${isAnime}" ${dataAttributes}>
                    <div class="poster-wrapper">
                        ${poster ? `<img src="${poster}" alt="${safeTitle} poster" loading="lazy" decoding="async">` : `<div class="poster-placeholder" role="img" aria-label="No poster available"><span>A</span><small>NO POSTER</small></div>`}
                        <div class="card-overlay">
                            ${badgeHtml}
                            <a class="card-open" href="${target}" aria-label="View ${safeTitle}">
                                <svg class="overlay-play" aria-hidden="true" width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
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

    playContent(id, type, isAnime = false) {
        if (type === 'movie') {
            window.location.hash = `#movie/${id}`;
        } else {
            window.location.hash = `#tv/${id}/s/1/e/1`;
        }
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
            const rating = data.vote_average ? data.vote_average.toFixed(1) : 'NR';
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
                                    <span class="rating">⭐ ${rating}</span>
                                    ${runtime ? `<span>${this.escapeHtml(runtime)}</span>` : ''}
                                    ${genres ? `<span>${this.escapeHtml(genres)}</span>` : ''}
                                </div>
                                <p class="details-overview">${this.escapeHtml(data.overview || 'No overview is available yet.')}</p>
                                <div class="details-actions">
                                    <button class="btn-primary play-btn" onclick="Alexandria.playContent(${id}, '${type}')">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> WATCH NOW
                                    </button>
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
            const endpoint = `person/${id}?append_to_response=combined_credits`;
            const data = await this.getJson(endpoint);
            if (token !== this._renderToken) return;
            
            const photo = this.imageUrl(data.profile_path, 'h632');
            
            this.main.innerHTML = `
                <section class="person-layout">
                    <div class="person-header">
                        ${photo ? `<img src="${photo}" alt="${this.escapeHtml(data.name)}" class="person-photo">` : '<div class="person-photo person-placeholder" aria-hidden="true">A</div>'}
                        <div class="person-info">
                            <h1>${this.escapeHtml(data.name)}</h1>
                            <div class="person-meta">
                                <span>${this.escapeHtml(data.known_for_department || '')}</span>
                                <span>${data.birthday ? `Born: ${this.escapeHtml(data.birthday)}` : ''}</span>
                                <span>${this.escapeHtml(data.place_of_birth || '')}</span>
                            </div>
                            <div class="person-bio">${this.escapeHtml(data.biography || 'No biography available.').replace(/\n\n/g, '<br><br>')}</div>
                        </div>
                    </div>
                    
                    <div class="view-section">
                        <h3>KNOWN FOR</h3>
                        <div class="person-credits-grid" id="person-credits"></div>
                    </div>
                </section>
            `;
            
            if (data.combined_credits?.cast?.length) {
                const sorted = data.combined_credits.cast.sort((a,b) => b.popularity - a.popularity).slice(0, 40);
                // Temporarily disable the "Continue Watching" tracking styling by using a standard render
                this.renderResults(sorted, 'person-credits');
            }
        } catch(e) {
            console.error("Alexandria Protocol: Person Render Failed", e);
            if (token === this._renderToken) this.renderError('This dossier is unavailable', e.message, 'person');
        }
    },

    async renderPlayer() {
        const { id, type, season, episode, isAnime } = this.state.activeContent;
        const server = this.servers[this.state.activeServer];

        let embedUrl = type === 'movie' ? server.getMovie(id) : server.getTv(id, season, episode);

        this.main.innerHTML = `
            <section class="player-layout">
                <div class="player-main">
                    <div class="server-controls">
                        <label class="server-label" for="server-selector">SERVER <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></label>
                        <select id="server-selector" class="server-select-dropdown" onchange="Alexandria.handleServerChange(this.value)">
                            ${this.servers.map((s, i) => `<option value="${i}" ${i === this.state.activeServer ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="player-frame-container">
                        <iframe id="video-iframe" title="Alexandria video player" src="${embedUrl}" width="100%" height="100%" scrolling="no" referrerpolicy="no-referrer" allow="autoplay; fullscreen; encrypted-media; picture-in-picture"></iframe>

                    </div>
                </div>
                ${type === 'tv' ? `
                    <div class="episode-sidebar">
                        <div class="sidebar-top">
                            <h3 id="sidebar-title">DATA LINK</h3>
                            <label class="sr-only" for="season-selector">Season</label>
                            <select id="season-selector" class="season-select" onchange="Alexandria.handleSeasonChange(this.value)"></select>
                        </div>
                        <div class="episode-list" id="sidebar-episodes">
                            <div class="placeholder-msg">DECRYPTING EPISODES...</div>
                        </div>
                    </div>` : ''}
            </section>`;

        this.getJson(type + '/' + id).then(data => {
            const title = type === 'movie' ? data.title : data.name;
            if (title) this.addToHistory({ id, type, title, poster_path: data.poster_path, season, episode, isAnime });
        }).catch(e => console.error("Alexandria: History Metadata Fetch Failed", e));
        
        if (type === 'tv') {
            await this.initSeasonSelector(id, season);
            await this.loadEpisodes(id, season);
        }
    },

    async initSeasonSelector(id, activeSeason) {
        try {
            const data = await this.getJson('tv/' + id);
            const selector = document.getElementById('season-selector');
            if (!selector) return;

            selector.innerHTML = data.seasons
                .filter(s => s.season_number > 0)
                .map(s => `<option value="${s.season_number}" ${s.season_number == activeSeason ? 'selected' : ''}>SEASON ${s.season_number}</option>`)
                .join('');
            
            document.getElementById('sidebar-title').textContent = data.name.toUpperCase();
        } catch (e) {
            console.error("Alexandria Protocol: Season Init Failed -", e);
            const title = document.getElementById('sidebar-title');
            if (title) title.textContent = 'EPISODE DATA UNAVAILABLE';
        }
    },

    handleSeasonChange(newSeason) {
        const season = Number.parseInt(newSeason, 10);
        if (!Number.isInteger(season) || season < 1) return;
        window.location.hash = `#tv/${this.state.activeContent.id}/s/${season}/e/1`;
    },

    handleServerChange(newServerIndex) {
        const serverIndex = Number.parseInt(newServerIndex, 10);
        if (!Number.isInteger(serverIndex) || !this.servers[serverIndex]) return;
        this.state.activeServer = serverIndex;
        const { id, type, season, episode } = this.state.activeContent;
        const server = this.servers[this.state.activeServer];
        const embedUrl = type === 'movie' ? server.getMovie(id) : server.getTv(id, season, episode);
        
        const iframe = document.getElementById('video-iframe');
        if (iframe) iframe.src = embedUrl;
    },

    async loadEpisodes(id, season) {
        try {
            const data = await this.getJson('tv/' + id + '/season/' + season);
            const container = document.getElementById('sidebar-episodes');
            if (!container) return;
            
            container.innerHTML = data.episodes.map(ep => `
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

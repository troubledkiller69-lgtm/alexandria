const Alexandria = {
    state: {
        view: 'home', // home, movies, tv, anime, search, player, auth
        user: null,
        clickCount: 0,
        searchTimeout: null,
        trendingData: null,
        activeContent: { id: null, type: 'movie', season: 1, episode: 1 },
        autoNext: true,
        watchlist: [],
        history: []
    },

    supabase: null,

    async init() {
        console.log("Alexandria Protocol: Initializing Handshake...");
        this.main = document.getElementById('content');
        
        try {
            const configRes = await fetch('/api/config');
            const config = await configRes.json();
            
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                console.error("Alexandria Protocol: Security Keys Missing. Check Vercel Env Vars.");
            }

            this.supabase = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
            console.log("Alexandria Protocol: Gateway Connected.");
            
            this.supabase.auth.onAuthStateChange(async (event, session) => {
                console.log("Alexandria Protocol: Auth Event -", event);
                this.state.user = session?.user || null;
                if (event === 'SIGNED_IN') {
                    await this.syncFromCloud();
                    this.setView('home');
                } else if (event === 'SIGNED_OUT') {
                    this.state.watchlist = [];
                    this.state.history = [];
                    this.setView('auth');
                }
                this.render();
            });

            const { data: { session } } = await this.supabase.auth.getSession();
            if (session) {
                console.log("Alexandria Protocol: Session Restored.");
                this.state.user = session.user;
                await this.syncFromCloud();
            } else {
                console.log("Alexandria Protocol: No Active Session. Redirecting to Entrance.");
                this.state.view = 'auth';
            }
        } catch (e) {
            console.error("Alexandria Protocol: Secure Handshake Failed -", e);
        }

        this.bindEvents();
        await this.simulateLoading();
        this.render();
        
        window.addEventListener('hashchange', () => this.handleRouting());
        this.handleRouting();
    },

    simulateLoading() {
        return new Promise((resolve) => {
            const progressFill = document.querySelector('#loading-screen .progress-fill');
            const statusText = document.querySelector('#loading-screen .loader-status');
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 15;
                if (progress > 100) progress = 100;
                if (progressFill) progressFill.style.width = `${progress}%`;
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
            }, 200);
        });
    },

    handleRouting() {
        const hash = window.location.hash || '#home';
        const view = hash.replace('#', '');
        this.setView(view);
    },

    bindEvents() {
        // Logo secret click
        const logo = document.querySelector('.watchtower h1');
        logo?.addEventListener('click', () => {
            this.state.clickCount++;
            if (this.state.clickCount >= 5) {
                this.setView('admin');
                this.state.clickCount = 0;
            }
        });

        // Global click listener
        document.addEventListener('click', async (e) => {
            const logBtn = e.target.classList.contains('log-btn') ? e.target : e.target.closest('.log-btn');
            if (logBtn) {
                e.stopPropagation();
                const item = {
                    id: logBtn.dataset.id,
                    type: logBtn.dataset.type,
                    title: logBtn.dataset.title,
                    poster_path: logBtn.dataset.poster.replace('https://image.tmdb.org/t/p/w500', '')
                };
                await this.toggleWatchlist(item);
            }

            if (e.target.id === 'search-trigger') this.setView('search');
            
            const card = e.target.classList.contains('movie-card') ? e.target : e.target.closest('.movie-card');
            if (card) {
                this.playContent(card.dataset.id, card.dataset.type, card.dataset.isAnime === 'true');
            }
        });
    },

    setView(view) {
        this.state.view = view;
        this.render();
    },

    async handleAuth(e, type) {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const btn = e.target.querySelector('button');
        btn.textContent = "VERIFYING...";
        btn.disabled = true;

        try {
            const { error } = type === 'login' 
                ? await this.supabase.auth.signInWithPassword({ email, password })
                : await this.supabase.auth.signUp({ email, password });
            if (error) throw error;
            if (type === 'signup') alert("Check email for verification!");
        } catch (error) {
            alert("Error: " + error.message);
            btn.textContent = type === 'login' ? "ACCESS ARCHIVE" : "CREATE CREDENTIALS";
            btn.disabled = false;
        }
    },

    async syncFromCloud() {
        if (!this.state.user) return;
        const [wRes, hRes] = await Promise.all([
            this.supabase.from('watchlist').select('*').order('created_at', { ascending: false }),
            this.supabase.from('history').select('*').order('created_at', { ascending: false }).limit(10)
        ]);
        this.state.watchlist = wRes.data?.map(i => ({ id: i.content_id, type: i.type, title: i.title, poster_path: i.poster_path })) || [];
        this.state.history = hRes.data?.map(i => ({ id: i.content_id, type: i.type, title: i.title, poster_path: i.poster_path })) || [];
    },

    async toggleWatchlist(item) {
        if (!this.state.user) return;
        const index = this.state.watchlist.findIndex(i => i.id == item.id);
        if (index === -1) {
            this.state.watchlist.unshift(item);
            await this.supabase.from('watchlist').insert({ user_id: this.state.user.id, content_id: item.id, type: item.type, title: item.title, poster_path: item.poster_path });
        } else {
            this.state.watchlist.splice(index, 1);
            await this.supabase.from('watchlist').delete().match({ user_id: this.state.user.id, content_id: item.id });
        }
        this.render();
    },

    async addToHistory(item) {
        if (!this.state.user) return;
        this.state.history = this.state.history.filter(i => i.id != item.id);
        this.state.history.unshift(item);
        await this.supabase.from('history').insert({ user_id: this.state.user.id, content_id: item.id, type: item.type, title: item.title, poster_path: item.poster_path });
    },

    render() {
        if (!this.state.user && this.state.view !== 'auth') return this.renderAuth();
        
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${this.state.view}`);
        });

        if (this.state.view === 'home') this.renderHome();
        else if (this.state.view === 'movies') this.renderFiltered('movie');
        else if (this.state.view === 'tv') this.renderFiltered('tv');
        else if (this.state.view === 'anime') this.renderAnime();
        else if (this.state.view === 'search') this.renderSearch();
        else if (this.state.view === 'player') this.renderPlayer();
        else if (this.state.view === 'auth') this.renderAuth();
    },

    renderAuth() {
        this.main.innerHTML = `
            <section class="auth-view">
                <div class="auth-card">
                    <div class="safe-zone-stamp large">A</div>
                    <h2>ALEXANDRIA</h2>
                    <p class="auth-subtitle">SECURITY CLEARANCE REQUIRED</p>
                    <form onsubmit="Alexandria.handleAuth(event, 'login')">
                        <div class="input-group">
                            <label>SURVIVOR EMAIL</label>
                            <input type="email" id="auth-email" required placeholder="IDENTIFICATION CODE">
                        </div>
                        <div class="input-group">
                            <label>ACCESS PASSKEY</label>
                            <input type="password" id="auth-password" required placeholder="SECURE KEY">
                        </div>
                        <button type="submit" class="btn-primary full">ACCESS ARCHIVE</button>
                    </form>
                    <div class="auth-footer">
                        <p>NEW TO THE SAFE ZONE? <a href="#" onclick="Alexandria.renderSignup(); return false;">REQUEST ACCESS</a></p>
                    </div>
                </div>
            </section>`;
    },

    renderSignup() {
        this.main.innerHTML = `
            <section class="auth-view">
                <div class="auth-card">
                    <div class="safe-zone-stamp large">A</div>
                    <h2>JOIN ARCHIVE</h2>
                    <p class="auth-subtitle">ESTABLISH NEW CREDENTIALS</p>
                    <form onsubmit="Alexandria.handleAuth(event, 'signup')">
                        <div class="input-group">
                            <label>SURVIVOR EMAIL</label>
                            <input type="email" id="auth-email" required placeholder="ASSIGN EMAIL">
                        </div>
                        <div class="input-group">
                            <label>ACCESS PASSKEY</label>
                            <input type="password" id="auth-password" required placeholder="CREATE KEY">
                        </div>
                        <button type="submit" class="btn-primary full">CREATE CREDENTIALS</button>
                    </form>
                    <div class="auth-footer">
                        <p>ALREADY A SURVIVOR? <a href="#" onclick="Alexandria.renderAuth(); return false;">LOG IN</a></p>
                    </div>
                </div>
            </section>`;
    },

    async renderHome() {
        const [mRes, tRes, nRes, hRes, aRes] = await Promise.all([
            fetch(`/api/proxy?endpoint=trending/movie/day`),
            fetch(`/api/proxy?endpoint=trending/tv/day`),
            fetch(`/api/proxy?endpoint=discover/movie?with_networks=213`),
            fetch(`/api/proxy?endpoint=discover/movie?with_networks=49`),
            fetch(`/api/proxy?endpoint=discover/movie?with_genres=28`)
        ]);
        const mData = await mRes.json();
        const tData = await tRes.json();
        const nData = await nRes.json();
        const hData = await hRes.json();
        const aData = await aRes.json();
        
        const featured = mData.results[0];
        const last = this.state.history[0];

        this.main.innerHTML = `
            <section class="home-view">
                <div class="hero-featured" style="background-image: linear-gradient(0deg, var(--bg-color) 0%, rgba(0,0,0,0.3) 100%), url('https://image.tmdb.org/t/p/original${featured.backdrop_path}')">
                    <div class="featured-content">
                        <span class="trending-badge">#1 TRENDING TODAY</span>
                        <h2>${featured.title}</h2>
                        <p>${featured.overview}</p>
                        <button class="btn-primary" onclick="Alexandria.playContent(${featured.id}, 'movie')">WATCH NOW</button>
                    </div>
                    ${last ? `<div class="resume-widget" onclick="Alexandria.playContent(${last.id}, '${last.type}')">
                        <div class="resume-content"><span class="resume-label">RESUMING...</span><h4>${last.title}</h4><p>CLICK TO RESUME</p></div>
                    </div>` : ''}
                </div>
                ${this.state.watchlist.length > 0 ? `<div class="view-section"><h3>PRIORITY ARCHIVE</h3><div class="carousel-wrapper"><div class="carousel-grid" id="watchlist-results"></div></div></div>` : ''}
                <div class="view-section"><h3>Trending Movies</h3><div class="carousel-wrapper"><div class="carousel-grid" id="trending-movies"></div></div></div>
                <div class="view-section"><h3>Trending TV Shows</h3><div class="carousel-wrapper"><div class="carousel-grid" id="trending-tv"></div></div></div>
            </section>`;
        
        if (this.state.watchlist.length > 0) this.renderResults(this.state.watchlist, 'watchlist-results');
        this.renderResults(mData.results, 'trending-movies');
        this.renderResults(tData.results, 'trending-tv');
    },

    async renderFiltered(type) {
        const [popRes, topRes] = await Promise.all([
            fetch(`/api/proxy?endpoint=${type}/popular`),
            fetch(`/api/proxy?endpoint=${type}/top_rated`)
        ]);
        const popData = await popRes.json();
        const topData = await topRes.json();
        this.main.innerHTML = `<section class="filtered-view"><div class="view-header"><h2>${type === 'movie' ? 'Movies' : 'TV Shows'}</h2></div><div class="view-section"><h3>Popular</h3><div class="carousel-wrapper"><div class="carousel-grid" id="pop-results"></div></div></div><div class="view-section"><h3>Top Rated</h3><div class="carousel-wrapper"><div class="carousel-grid" id="top-results"></div></div></div></section>`;
        this.renderResults(popData.results, 'pop-results');
        this.renderResults(topData.results, 'top-results');
    },

    async renderAnime() {
        const [shonenRes, seinenRes] = await Promise.all([
            fetch(`/api/proxy?endpoint=discover/tv?with_genres=16&with_keywords=210024&sort_by=popularity.desc`),
            fetch(`/api/proxy?endpoint=discover/tv?with_genres=16&with_keywords=210024&vote_average.gte=8`)
        ]);
        const sData = await shonenRes.json();
        const seData = await seinenRes.json();
        this.main.innerHTML = `<section class="filtered-view"><div class="view-header"><h2>Anime Hub</h2></div><div class="view-section"><h3>Trending</h3><div class="carousel-wrapper"><div class="carousel-grid" id="anime-trending"></div></div></div><div class="view-section"><h3>Top Rated</h3><div class="carousel-wrapper"><div class="carousel-grid" id="anime-top"></div></div></div></section>`;
        this.renderResults(sData.results, 'anime-trending');
        this.renderResults(seData.results, 'anime-top');
    },

    renderSearch() {
        this.main.innerHTML = `<section class="supply-run"><div class="search-hero"><h2>ARCHIVE SEARCH</h2><p>FIND YOUR NEXT TITLE</p></div><div class="search-box"><div class="input-wrapper"><input type="text" id="tmdb-search" placeholder="SEARCH TITLES..."><div class="scan-line"></div></div><button class="btn-primary" onclick="Alexandria.handleSearch()">ACCESS</button></div><div class="results-grid" id="search-results"></div></section>`;
        document.getElementById('tmdb-search').addEventListener('keyup', (e) => { if (e.key === 'Enter') this.handleSearch(); });
    },

    async handleSearch() {
        const query = document.getElementById('tmdb-search').value;
        if (!query) return;
        const container = document.getElementById('search-results');
        container.innerHTML = '<div class="placeholder-msg">LOCATING...</div>';
        const res = await fetch(`/api/proxy?endpoint=search/multi?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        this.renderResults(data.results, 'search-results');
    },

    renderResults(results, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = results.map(item => {
            const type = item.media_type || (item.title ? 'movie' : 'tv');
            const title = item.title || item.name;
            const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750?text=NO+IMAGE';
            const inWatchlist = this.state.watchlist.some(i => i.id == item.id);
            return `
                <div class="movie-card" data-id="${item.id}" data-type="${type}">
                    <div class="poster-wrapper">
                        <img src="${poster}">
                        <div class="card-overlay">
                            <button class="log-btn ${inWatchlist ? 'active' : ''}" data-id="${item.id}" data-type="${type}" data-title="${title}" data-poster="${poster}">
                                ${inWatchlist ? '📑' : '🔖'}
                            </button>
                        </div>
                    </div>
                    <div class="movie-info"><h3>${title}</h3></div>
                </div>`;
        }).join('');
    },

    playContent(id, type) {
        this.state.activeContent = { id, type, season: 1, episode: 1 };
        this.setView('player');
    },

    async renderPlayer() {
        const { id, type, season, episode } = this.state.activeContent;
        const embedUrl = type === 'movie' 
            ? `https://www.vidking.net/embed/movie/${id}`
            : `https://www.vidking.net/embed/tv/${id}/${season}/${episode}`;

        this.main.innerHTML = `
            <section class="screening-room">
                <div class="player-container">
                    <iframe src="${embedUrl}" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>
                </div>
                ${type === 'tv' ? `<div class="episode-sidebar"><h3 id="sidebar-title">EPISODES</h3><div class="episode-list" id="sidebar-episodes"></div></div>` : ''}
            </section>`;
        
        if (type === 'tv') this.loadEpisodes(id, season);
    },

    async loadEpisodes(id, season) {
        const res = await fetch(`/api/proxy?endpoint=tv/${id}/season/${season}`);
        const data = await res.json();
        const container = document.getElementById('sidebar-episodes');
        if (!container) return;
        container.innerHTML = data.episodes.map(ep => `
            <div class="episode-item ${this.state.activeContent.episode == ep.episode_number ? 'active' : ''}" onclick="Alexandria.state.activeContent.episode = ${ep.episode_number}; Alexandria.renderPlayer();">
                <span>EP ${ep.episode_number}: ${ep.name}</span>
            </div>`).join('');
    }
};

Alexandria.init();

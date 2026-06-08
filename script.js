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
        
        // Start loading sequence immediately
        const loadingPromise = this.simulateLoading();

        // Run network initialization in the background - DO NOT AWAIT
        this.initNetwork().catch(e => {
            console.error("Alexandria Protocol: Background Init Failed -", e);
            this.state.view = 'auth';
        });

        // Wait for loading bar to finish
        await loadingPromise;
        
        this.bindEvents();
        this.render(); // Render immediately once animation is done
        
        window.addEventListener('hashchange', () => this.handleRouting());
        this.handleRouting();
    },

    async initNetwork() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // Increased to 10s

        try {
            const configRes = await fetch('/api/config', { signal: controller.signal });
            clearTimeout(timeoutId);
            const config = await configRes.json();
            
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                console.error("Alexandria Protocol: Security Keys Missing.");
                this.state.view = 'home';
                return;
            }

            this.supabase = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
            
            this.supabase.auth.onAuthStateChange(async (event, session) => {
                console.log("Alexandria Protocol: Auth Event -", event);
                const prevUser = this.state.user;
                this.state.user = session?.user || null;
                this.updateSyncIndicator(this.state.user ? 'SYNCED' : 'OFFLINE');
                
                if (event === 'SIGNED_IN' && !prevUser) {
                    await this.syncFromCloud();
                    this.setView('home');
                } else if (event === 'SIGNED_OUT') {
                    this.state.watchlist = [];
                    this.state.history = [];
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
            if (this.state.view === 'auth') this.state.view = 'home';
            this.updateSyncIndicator('OFFLINE');
        } finally {
            this.render();
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
        } else {
            dot.style.background = '#f59e0b';
            dot.style.boxShadow = '0 0 10px #f59e0b';
            text.textContent = 'ESTABLISHING...';
        }
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
        const logo = document.querySelector('.sidebar-brand h1');
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
            const searchTrigger = e.target.id === 'search-trigger' || e.target.closest('#search-trigger');
            const authTrigger = e.target.id === 'auth-trigger' || e.target.closest('#auth-trigger');

            if (logBtn) {
                e.preventDefault();
                const item = {
                    id: logBtn.dataset.id,
                    type: logBtn.dataset.type,
                    title: logBtn.dataset.title,
                    poster_path: logBtn.dataset.poster.replace('https://image.tmdb.org/t/p/w500', '')
                };
                await this.toggleWatchlist(item);
            } else if (searchTrigger) {
                this.setView('search');
            } else if (authTrigger) {
                this.setView('auth');
            } else {
                const card = e.target.classList.contains('movie-card') ? e.target : e.target.closest('.movie-card');
                if (card) {
                    const isAnime = card.dataset.isAnime === 'true';
                    this.playContent(card.dataset.id, card.dataset.type, isAnime);
                }
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
            const { data, error } = type === 'login' 
                ? await this.supabase.auth.signInWithPassword({ email, password })
                : await this.supabase.auth.signUp({ email, password });
            if (error) throw error;
            
            if (type === 'login' && data.user) {
                this.state.user = data.user;
                await this.syncFromCloud();
                this.setView('home');
            } else if (type === 'signup') {
                alert("Check email for verification!");
            }
        } catch (error) {
            alert("Error: " + error.message);
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
        const [wRes, hRes] = await Promise.all([
            this.supabase.from('watchlist').select('*').order('created_at', { ascending: false }),
            this.supabase.from('history').select('*').order('created_at', { ascending: false }).limit(10)
        ]);
        this.state.watchlist = wRes.data?.map(i => ({ id: String(i.content_id), type: i.type, title: i.title, poster_path: i.poster_path })) || [];
        this.state.history = hRes.data?.map(i => ({ id: String(i.content_id), type: i.type, title: i.title, poster_path: i.poster_path })) || [];
    },

    async toggleWatchlist(item) {
        const itemId = String(item.id);
        const index = this.state.watchlist.findIndex(i => String(i.id) === itemId);
        
        // Find all buttons for this item in the DOM and update them immediately
        document.querySelectorAll(`.log-btn[data-id="${itemId}"]`).forEach(btn => {
            const isActive = btn.classList.contains('active');
            btn.classList.toggle('active');
            btn.innerHTML = isActive ? '🔖' : '📑';
        });

        if (index === -1) {
            this.state.watchlist.unshift(item);
            if (this.state.user) {
                await this.supabase.from('watchlist').insert({ user_id: this.state.user.id, content_id: itemId, type: item.type, title: item.title, poster_path: item.poster_path });
            }
        } else {
            this.state.watchlist.splice(index, 1);
            if (this.state.user) {
                await this.supabase.from('watchlist').delete().match({ user_id: this.state.user.id, content_id: itemId });
            }
        }
        
        if (!this.state.user) {
            localStorage.setItem('alexandria_watchlist', JSON.stringify(this.state.watchlist));
        }
        
        // If we are in the Home view, we only need to update the Watchlist row, not re-fetch everything
        if (this.state.view === 'home') this.renderWatchlist();
    },

    async addToHistory(item) {
        this.state.history = this.state.history.filter(i => i.id != item.id);
        this.state.history.unshift(item);
        
        if (this.state.user) {
            await this.supabase.from('history').insert({ user_id: this.state.user.id, content_id: item.id, type: item.type, title: item.title, poster_path: item.poster_path });
        } else {
            localStorage.setItem('alexandria_history', JSON.stringify(this.state.history));
        }
    },

    render() {
        if (!this.main) this.main = document.getElementById('content');
        if (!this.main) return;
        
        // Update Nav Link Active States
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${this.state.view}`);
        });

        // Main View Routing
        if (this.state.view === 'home') this.renderHome();
        else if (this.state.view === 'movies') this.renderFiltered('movie');
        else if (this.state.view === 'tv') this.renderFiltered('tv');
        else if (this.state.view === 'anime') this.renderAnime();
        else if (this.state.view === '420') this.render420();
        else if (this.state.view === 'search') this.renderSearch();
        else if (this.state.view === 'player') this.renderPlayer();
        else if (this.state.view === 'auth') this.renderAuth();
    },

    renderAuth() {
        // Prevent re-rendering if already on auth screen (unless forced)
        if (this.main.querySelector('.auth-card') && !this.main.querySelector('[onsubmit*="signup"]')) return;

        const card = this.main.querySelector('.auth-card');
        if (card) card.classList.add('switching');
        
        setTimeout(() => {
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
                            <p style="margin-top: 1rem;"><a href="#" onclick="Alexandria.setView('home'); return false;" style="color: var(--text-secondary); border-color: transparent;">RETURN TO ARCHIVE</a></p>
                        </div>
                    </div>
                </section>`;
        }, card ? 300 : 0);
    },

    renderSignup() {
        const card = this.main.querySelector('.auth-card');
        if (card) card.classList.add('switching');
        
        setTimeout(() => {
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
                            <p style="margin-top: 1rem;"><a href="#" onclick="Alexandria.setView('home'); return false;" style="color: var(--text-secondary); border-color: transparent;">RETURN TO ARCHIVE</a></p>
                        </div>
                    </div>
                </section>`;
        }, card ? 300 : 0);
    },

    async renderHome() {
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING SECTORS...</div>';
        
        try {
            // Sector 1: Core Content Scans
            const [mRes, tRes, nRes, aRes, uRes] = await Promise.all([
                fetch(`/api/proxy?endpoint=${encodeURIComponent('trending/movie/day')}`),
                fetch(`/api/proxy?endpoint=${encodeURIComponent('trending/tv/day')}`),
                fetch(`/api/proxy?endpoint=${encodeURIComponent('discover/movie?with_watch_providers=8&watch_region=US')}`),
                fetch(`/api/proxy?endpoint=${encodeURIComponent('discover/movie?with_genres=28')}`),
                fetch(`/api/proxy?endpoint=${encodeURIComponent('movie/upcoming')}`)
            ]);
            
            const mData = await mRes.json();
            const tData = await tRes.json();
            const nData = await nRes.json();
            const aData = await aRes.json();
            const uData = await uRes.json();
            
            // Sector 2: Alexandria's Specials — VERIFIED TMDB IDs (tested live 2026-05-16)
            const chronicleIds = [1402, 62286, 94305, 194583, 211684, 206586];
            const specialsData = await Promise.all(chronicleIds.map(id => 
                fetch(`/api/proxy?endpoint=${encodeURIComponent('tv/' + id)}`)
                .then(r => r.json())
                .catch(() => null)
            )).then(results => results.filter(Boolean));

            const featured = mData.results?.[0];
            const last = this.state.history?.[0];

            if (!featured) throw new Error("No featured content found.");

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
                    <div id="priority-archive-section"></div>
                    <div class="view-section"><h3>ALEXANDRIA'S SPECIALS</h3><div class="carousel-wrapper"><div class="carousel-grid" id="alexandria-specials"></div></div></div>
                    <div class="view-section"><h3>Trending Movies</h3><div class="carousel-wrapper"><div class="carousel-grid" id="trending-movies"></div></div></div>
                    <div class="view-section"><h3>Netflix Originals</h3><div class="carousel-wrapper"><div class="carousel-grid" id="netflix-hits"></div></div></div>
                    <div class="view-section"><h3>Trending TV Shows</h3><div class="carousel-wrapper"><div class="carousel-grid" id="trending-tv"></div></div></div>
                    <div class="view-section"><h3>Upcoming Missions</h3><div class="carousel-wrapper"><div class="carousel-grid" id="upcoming-hits"></div></div></div>
                    <div class="view-section"><h3>Action Archives</h3><div class="carousel-wrapper"><div class="carousel-grid" id="action-hits"></div></div></div>
                </section>`;
            
            this.renderWatchlist();
            this.renderResults(specialsData, 'alexandria-specials');
            this.renderResults(mData.results, 'trending-movies');
            this.renderResults(tData.results, 'trending-tv');
            this.renderResults(nData.results, 'netflix-hits');
            this.renderResults(aData.results, 'action-hits');
            this.renderResults(uData.results, 'upcoming-hits');
        } catch (error) {
            console.error("Alexandria Protocol: Home Scout Failed -", error);
            this.main.innerHTML = '<div class="placeholder-msg">SECTOR SCAN FAILED. CHECK SIGNAL.</div>';
        }
    },

    renderWatchlist() {
        const container = document.getElementById('priority-archive-section');
        if (!container) return;
        
        if (this.state.watchlist.length > 0) {
            container.innerHTML = `<div class="view-section"><h3>PRIORITY ARCHIVE</h3><div class="carousel-wrapper"><div class="carousel-grid" id="watchlist-results"></div></div></div>`;
            this.renderResults(this.state.watchlist, 'watchlist-results');
        } else {
            container.innerHTML = '';
        }
    },

    async renderFiltered(type) {
        this.main.innerHTML = '<div class="placeholder-msg">SCANNING SECTORS...</div>';
        try {
            const [popRes, topRes, actRes, horRes, sciRes] = await Promise.all([
                fetch(`/api/proxy?endpoint=${encodeURIComponent(type + '/popular')}`),
                fetch(`/api/proxy?endpoint=${encodeURIComponent(type + '/top_rated')}`),
                fetch(`/api/proxy?endpoint=${encodeURIComponent('discover/' + type + '?with_genres=' + (type === 'movie' ? '28' : '10759'))}`),
                fetch(`/api/proxy?endpoint=${encodeURIComponent('discover/' + type + '?with_genres=27')}`),
                fetch(`/api/proxy?endpoint=${encodeURIComponent('discover/' + type + '?with_genres=878')}`)
            ]);
            const popData = await popRes.json();
            const topData = await topRes.json();
            const actData = await actRes.json();
            const horData = await horRes.json();
            const sciData = await sciRes.json();

            this.main.innerHTML = `
                <section class="filtered-view">
                    <div class="view-header"><h2>${type === 'movie' ? 'Movies' : 'TV Shows'}</h2></div>
                    <div class="view-section"><h3>Popular Now</h3><div class="carousel-wrapper"><div class="carousel-grid" id="pop-results"></div></div></div>
                    <div class="view-section"><h3>Top Rated</h3><div class="carousel-wrapper"><div class="carousel-grid" id="top-results"></div></div></div>
                    <div class="view-section"><h3>Action & Adventure</h3><div class="carousel-wrapper"><div class="carousel-grid" id="action-results"></div></div></div>
                    <div class="view-section"><h3>Horror Archives</h3><div class="carousel-wrapper"><div class="carousel-grid" id="horror-results"></div></div></div>
                    <div class="view-section"><h3>Sci-Fi & Fantasy</h3><div class="carousel-wrapper"><div class="carousel-grid" id="sci-results"></div></div></div>
                </section>`;
            
            this.renderResults(popData.results, 'pop-results');
            this.renderResults(topData.results, 'top-results');
            this.renderResults(actData.results, 'action-results');
            this.renderResults(horData.results, 'horror-results');
            this.renderResults(sciData.results, 'sci-results');
        } catch (error) {
            console.error("Alexandria Protocol: Filter Scout Failed -", error);
        }
    },

    async renderAnime() {
        this.main.innerHTML = '<div class="placeholder-msg">SCANNING ANIME FREQUENCIES...</div>';
        try {
            const [shonenRes, seinenRes, fantasyRes, dramaRes] = await Promise.all([
                fetch(`/api/proxy?endpoint=${encodeURIComponent('discover/tv?with_genres=16&with_keywords=210024&sort_by=popularity.desc')}`),
                fetch(`/api/proxy?endpoint=${encodeURIComponent('discover/tv?with_genres=16&with_keywords=210024&vote_average.gte=8')}`),
                fetch(`/api/proxy?endpoint=${encodeURIComponent('discover/tv?with_genres=16&with_keywords=210024&with_genres=14')}`),
                fetch(`/api/proxy?endpoint=${encodeURIComponent('discover/tv?with_genres=16&with_keywords=210024&with_genres=18')}`)
            ]);
            const sData = await shonenRes.json();
            const seData = await seinenRes.json();
            const fData = await fantasyRes.json();
            const dData = await dramaRes.json();

            this.main.innerHTML = `
                <section class="filtered-view">
                    <div class="view-header"><h2>Anime Hub</h2></div>
                    <div class="view-section"><h3>Trending Anime</h3><div class="carousel-wrapper"><div class="carousel-grid" id="anime-trending"></div></div></div>
                    <div class="view-section"><h3>Top Rated Masterpieces</h3><div class="carousel-wrapper"><div class="carousel-grid" id="anime-top"></div></div></div>
                    <div class="view-section"><h3>Epic Fantasy Anime</h3><div class="carousel-wrapper"><div class="carousel-grid" id="anime-fantasy"></div></div></div>
                    <div class="view-section"><h3>Intense Drama Anime</h3><div class="carousel-wrapper"><div class="carousel-grid" id="anime-drama"></div></div></div>
                </section>`;
            
            this.renderResults(sData.results, 'anime-trending');
            this.renderResults(seData.results, 'anime-top');
            this.renderResults(fData.results, 'anime-fantasy');
            this.renderResults(dData.results, 'anime-drama');
        } catch (error) {
            console.error("Alexandria Protocol: Anime Scout Failed -", error);
        }
    },

    async render420() {
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot" style="background:#10b981;box-shadow:0 0 15px #10b981"></span> SCANNING ELEVATED FREQUENCIES...</div>';
        
        // Massive curated catalog. We randomize and pick 15 per category on load to ensure infinite variation and avoid API limits.
        const catalog = {
            'classics':  ['Half Baked', 'Up in Smoke', "Cheech and Chong's Next Movie", 'Friday', 'Dazed and Confused', 'Fast Times at Ridgemont High', 'How High', 'The Big Lebowski', 'Fear and Loathing in Las Vegas', 'Easy Rider', 'Next Friday', 'Friday After Next', 'Nice Dreams', 'Things Are Tough All Over', 'Still Smokin', 'The Breakfast Club', 'Caddyshack', 'Animal House', 'Reefer Madness', 'Bongwater', 'Detroit Rock City', 'PCU', 'Kids', 'The Wash', 'How High 2', 'Soul Plane', "Don't Be a Menace to South Central While Drinking Your Juice in the Hood", 'Half Baked: Totally High', 'Rolling Papers', 'Super High Me'],
            'modern':    ['Pineapple Express', 'Harold & Kumar Go to White Castle', "Grandma's Boy", 'Super Troopers', 'Mac & Devin Go to High School', 'Smiley Face', 'Ted', 'Your Highness', 'Jay and Silent Bob Strike Back', 'This Is the End', 'Harold & Kumar Escape from Guantanamo Bay', 'A Very Harold & Kumar 3D Christmas', 'Knocked Up', 'Neighbors', 'Sausage Party', '21 Jump Street', '22 Jump Street', 'Ted 2', 'Popstar: Never Stop Never Stopping', 'Blockers', 'Project X', 'Good Boys', 'The Night Before', 'Neighbors 2: Sorority Rising', 'Mike and Dave Need Wedding Dates', "We're the Millers", 'Role Models', 'Hot Tub Time Machine', 'The Interview', 'Game Over, Man!'],
            'trippy':    ['Enter the Void', 'Waking Life', 'A Scanner Darkly', 'Pink Floyd: The Wall', 'Yellow Submarine', 'Heavy Metal', 'The Holy Mountain', 'Fantastic Planet', 'Paprika', 'Altered States', 'Midsommar', 'Annihilation', 'Eraserhead', 'El Topo', 'Naked Lunch', '2001: A Space Odyssey', 'Koyaanisqatsi', 'Samsara', 'Spider-Man: Into the Spider-Verse', 'The Matrix', 'Inception', 'Blade Runner 2049', 'Donnie Darko', 'Mulholland Drive', 'Requiem for a Dream', 'The Neon Demon', 'Climax', 'Mandy', 'Color Out of Space', 'Suspiria'],
            'chill':     ['Clerks', 'Mallrats', 'Slacker', 'Empire Records', 'The Beach Bum', 'Everybody Wants Some!!', 'Mid90s', 'Inherent Vice', 'Adventureland', 'The Sandlot', 'Stand by Me', 'Almost Famous', 'High Fidelity', "Ferris Bueller's Day Off", "Wayne's World 2", 'Clerks II', 'Chasing Amy', 'Super 8', 'Boyhood', 'Lady Bird', 'Eighth Grade', 'Booksmart', 'Juno', 'Little Miss Sunshine', 'The Perks of Being a Wallflower', 'Submarine', 'Ghost World', 'Lost in Translation', 'Her', 'Garden State'],
            'cult':      ['Superbad', 'Step Brothers', 'Tenacious D in The Pick of Destiny', 'Tropic Thunder', "Dude, Where's My Car?", "Bill & Ted's Excellent Adventure", 'Bio-Dome', 'Clueless', "Wayne's World", 'Napoleon Dynamite', 'Office Space', 'The Room', 'Rocky Horror Picture Show', 'Scott Pilgrim vs. the World', 'Shaun of the Dead', 'Hot Fuzz', 'Idiocracy', 'Spaceballs', 'Galaxy Quest', 'Army of Darkness', 'Evil Dead II', 'Monty Python and the Holy Grail', 'The Princess Bride', 'Labyrinth', 'The Dark Crystal', 'Willy Wonka & the Chocolate Factory', 'Ghostbusters', 'Back to the Future', 'Beetlejuice', 'Edward Scissorhands']
        };

        try {
            // Search all movies in parallel — one TMDB search per title
            const searchMovie = (title) => 
                fetch(`/api/proxy?endpoint=${encodeURIComponent('search/movie?query=' + encodeURIComponent(title))}`)
                .then(r => r.json())
                .then(d => d.results?.[0] || null)
                .catch(() => null);

            // Helper to shuffle and pick 15 random titles per category
            const getRandomSubset = (arr, num) => arr.sort(() => 0.5 - Math.random()).slice(0, num);

            const [classics, modern, trippy, chill, cult] = await Promise.all(
                Object.values(catalog).map(titles => 
                    Promise.all(getRandomSubset(titles, 15).map(searchMovie)).then(r => r.filter(Boolean))
                )
            );

            this.main.innerHTML = `
                <section class="filtered-view vip-section">
                    <div class="vip-420-header">
                        <h2>420 ZONE</h2>
                        <p style="color:var(--text-muted);font-family:var(--font-display);letter-spacing:2px">ELEVATED FREQUENCIES</p>
                    </div>
                    <div class="view-section"><h3 style="color:var(--accent-emerald)">Stoner Classics</h3><div class="carousel-wrapper"><div class="carousel-grid" id="420-classics"></div></div></div>
                    <div class="view-section"><h3 style="color:var(--accent-emerald)">Modern Hits</h3><div class="carousel-wrapper"><div class="carousel-grid" id="420-modern"></div></div></div>
                    <div class="view-section"><h3 style="color:var(--accent-emerald)">Trippy & Surreal</h3><div class="carousel-wrapper"><div class="carousel-grid" id="420-trippy"></div></div></div>
                    <div class="view-section"><h3 style="color:var(--accent-emerald)">Chill Vibes</h3><div class="carousel-wrapper"><div class="carousel-grid" id="420-chill"></div></div></div>
                    <div class="view-section"><h3 style="color:var(--accent-emerald)">Cult Favorites</h3><div class="carousel-wrapper"><div class="carousel-grid" id="420-cult"></div></div></div>
                </section>`;
            
            this.renderResults(classics, '420-classics');
            this.renderResults(modern, '420-modern');
            this.renderResults(trippy, '420-trippy');
            this.renderResults(chill, '420-chill');
            this.renderResults(cult, '420-cult');
        } catch (error) {
            console.error("Alexandria Protocol: 420 Zone Failed -", error);
            this.main.innerHTML = '<div class="placeholder-msg">ELEVATED SIGNAL LOST. TRY AGAIN.</div>';
        }
    },

    renderSearch() {
        this.main.innerHTML = `<section class="search-view"><div class="search-header"><h2>ARCHIVE SEARCH</h2><p>FIND YOUR NEXT TITLE</p></div><div class="search-box"><div class="input-wrapper" style="flex-grow:1"><input type="text" id="tmdb-search" placeholder="SEARCH TITLES..." style="width:100%"></div><button class="btn-primary" onclick="Alexandria.handleSearch()">ACCESS</button></div><div class="results-grid" id="search-results"></div></section>`;
        document.getElementById('tmdb-search').addEventListener('keyup', (e) => { if (e.key === 'Enter') this.handleSearch(); });
    },

    async handleSearch() {
        const queryField = document.getElementById('tmdb-search');
        const query = queryField.value.trim();
        if (!query) return;
        const container = document.getElementById('search-results');
        container.innerHTML = '<div class="placeholder-msg">LOCATING...</div>';
        
        try {
            // Signal Tunneling V2: Triple-Encoded for maximum security through the proxy
            const endpoint = `search/multi?query=${encodeURIComponent(query)}`;
            const res = await fetch(`/api/proxy?endpoint=${encodeURIComponent(endpoint)}`);
            
            if (!res.ok) throw new Error("Signal Blocked");
            
            const data = await res.json();
            this.renderResults(data.results || [], 'search-results');
        } catch (e) {
            console.error("Alexandria Protocol: Search Scanner Failed -", e);
            container.innerHTML = '<div class="placeholder-msg">SEARCH SIGNAL INTERRUPTED - PERIMETER CHECK REQUIRED.</div>';
        }
    },

    renderResults(results, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!results || results.length === 0) {
            container.innerHTML = '<div class="placeholder-msg">NO ARCHIVE RECORDS FOUND.</div>';
            return;
        }
        container.innerHTML = results.map(item => {
            const type = item.media_type || (item.title ? 'movie' : 'tv');
            const title = item.title || item.name;
            const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750?text=NO+IMAGE';
            const inWatchlist = this.state.watchlist.some(i => String(i.id) === String(item.id));

            // Check if it's SPECIFICALLY Anime (16 = Animation, origin Japan)
            const isAnime = item.genre_ids && item.genre_ids.includes(16) && 
                           (item.original_language === 'ja' || (item.origin_country && item.origin_country.includes('JP')));
            
            const badgeHtml = isAnime ? '<div class="anime-badge">SUB/DUB</div>' : '';

            return `
                <div class="movie-card" data-id="${item.id}" data-type="${type}" data-is-anime="${isAnime}">
                    <div class="poster-wrapper">
                        <img src="${poster}">
                        <div class="card-overlay">
                            ${badgeHtml}
                            <button class="log-btn ${inWatchlist ? 'active' : ''}" data-id="${item.id}" data-type="${type}" data-title="${title}" data-poster="${poster}">
                                ${inWatchlist ? '📑' : '🔖'}
                            </button>
                        </div>
                    </div>
                    <div class="movie-info"><h3>${title}</h3></div>
                </div>`;
        }).join('');
    },

    playContent(id, type, isAnime = false) {
        this.state.activeContent = { id, type, isAnime, season: 1, episode: 1 };
        this.setView('player');
    },

    async renderPlayer() {
        const { id, type, season, episode, isAnime } = this.state.activeContent;
        
        let embedUrl;
        if (isAnime) {
            // Anime Provider: vidsrc.cc (Excellent Sub/Dub)
            embedUrl = type === 'movie' 
                ? `https://vidsrc.cc/v2/embed/movie/${id}`
                : `https://vidsrc.cc/v2/embed/tv/${id}/${season}/${episode}`;
        } else {
            // General Provider: embed.su (Highly reliable)
            embedUrl = type === 'movie' 
                ? `https://embed.su/embed/movie/${id}`
                : `https://embed.su/embed/tv/${id}/${season}/${episode}`;
        }

        this.main.innerHTML = `
            <section class="player-layout">
                <div class="player-main">
                    <div class="player-frame-container">
                        <iframe src="${embedUrl}" width="100%" height="100%" frameborder="0" scrolling="no" allowfullscreen referrerpolicy="no-referrer" allow="autoplay; fullscreen; encrypted-media; picture-in-picture"></iframe>
                    </div>
                </div>
                ${type === 'tv' ? `
                    <div class="episode-sidebar">
                        <div class="sidebar-top">
                            <h3 id="sidebar-title">DATA LINK</h3>
                            <select id="season-selector" class="season-select" onchange="Alexandria.handleSeasonChange(this.value)"></select>
                        </div>
                        <div class="episode-list" id="sidebar-episodes">
                            <div class="placeholder-msg">DECRYPTING EPISODES...</div>
                        </div>
                    </div>` : ''}
            </section>`;
        
        if (type === 'tv') {
            await this.initSeasonSelector(id, season);
            await this.loadEpisodes(id, season);
        }
    },

    async initSeasonSelector(id, activeSeason) {
        try {
            const res = await fetch(`/api/proxy?endpoint=${encodeURIComponent('tv/' + id)}`);
            const data = await res.json();
            const selector = document.getElementById('season-selector');
            if (!selector) return;

            selector.innerHTML = data.seasons
                .filter(s => s.season_number > 0)
                .map(s => `<option value="${s.season_number}" ${s.season_number == activeSeason ? 'selected' : ''}>SEASON ${s.season_number}</option>`)
                .join('');
            
            document.getElementById('sidebar-title').textContent = data.name.toUpperCase();
        } catch (e) {
            console.error("Alexandria Protocol: Season Init Failed -", e);
        }
    },

    handleSeasonChange(newSeason) {
        this.state.activeContent.season = parseInt(newSeason);
        this.state.activeContent.episode = 1;
        this.renderPlayer();
    },

    async loadEpisodes(id, season) {
        try {
            const res = await fetch(`/api/proxy?endpoint=${encodeURIComponent('tv/' + id + '/season/' + season)}`);
            const data = await res.json();
            const container = document.getElementById('sidebar-episodes');
            if (!container) return;
            
            container.innerHTML = data.episodes.map(ep => `
                <div class="episode-item ${this.state.activeContent.episode == ep.episode_number ? 'active' : ''}" 
                     onclick="Alexandria.state.activeContent.episode = ${ep.episode_number}; Alexandria.renderPlayer();">
                    <span class="ep-num">EP ${ep.episode_number}</span>
                    <span class="ep-name">${ep.name}</span>
                </div>`).join('');
        } catch (e) {
            console.error("Alexandria Protocol: Episode Load Failed -", e);
        }
    }
};

Alexandria.init();

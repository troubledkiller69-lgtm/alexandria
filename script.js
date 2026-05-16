const Alexandria = {
    state: {
        view: 'home', // home, movies, tv, search, player, admin
        pendingUsers: [],
        clickCount: 0,
        searchTimeout: null,
        trendingData: null,
        activeContent: { id: null, type: 'movie', season: 1, episode: 1 },
        autoNext: true,
        watchlist: JSON.parse(localStorage.getItem('alexandria_watchlist')) || [],
        history: JSON.parse(localStorage.getItem('alexandria_history')) || []
    },

    async init() {
        this.main = document.getElementById('content');
        this.bindEvents();
        
        // Start functional loading sequence
        await this.simulateLoading();
        
        this.render();
        
        window.addEventListener('hashchange', () => {
            this.handleRouting();
        });
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
                
                // Optional: Update status text based on progress
                if (progress > 30 && progress < 60) statusText.textContent = "STABILIZING ARCHIVE...";
                if (progress > 60 && progress < 90) statusText.textContent = "SYNCING RECENT TRANSMISSIONS...";
                if (progress >= 90) statusText.textContent = "GATES OPENING...";

                if (progress >= 100) {
                    clearInterval(interval);
                    setTimeout(() => {
                        const loader = document.getElementById('loading-screen');
                        const app = document.getElementById('app');
                        if (loader) loader.classList.add('hidden');
                        if (app) app.classList.remove('hidden');
                        resolve();
                    }, 500);
                }
            }, 200);
        });
    },

    cacheDom() {
        this.app = document.getElementById('app');
        this.main = document.getElementById('content');
    },

    handleRouting() {
        const hash = window.location.hash || '#home';
        const view = hash.replace('#', '');
        this.setView(view);
    },

    bindEvents() {
        // Logo secret click
        const logo = document.querySelector('.watchtower h1');
        logo.addEventListener('click', () => {
            this.state.clickCount++;
            if (this.state.clickCount >= 5) {
                this.setView('admin');
                this.state.clickCount = 0;
            }
        });

        // Toggle Watchlist from Results
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('log-btn') || e.target.closest('.log-btn')) {
                e.stopPropagation();
                const btn = e.target.classList.contains('log-btn') ? e.target : e.target.closest('.log-btn');
                const id = btn.dataset.id;
                const type = btn.dataset.type;
                const title = btn.dataset.title;
                const poster = btn.dataset.poster;
                const rating = btn.dataset.rating;
                const year = btn.dataset.year;
                this.toggleWatchlist({ id, type, title, poster, rating, year });
            }
        });

        // Global listener for dynamic buttons
        document.addEventListener('click', (e) => {
            if (e.target.id === 'search-trigger') {
                this.setView('search');
            }
            if (e.target.id === 'search-btn') {
                this.searchSupplies();
            }
            if (e.target.classList.contains('movie-card') || e.target.closest('.movie-card')) {
                const card = e.target.classList.contains('movie-card') ? e.target : e.target.closest('.movie-card');
                const id = card.dataset.id;
                const type = card.dataset.type || 'movie';
                const isAnime = card.dataset.isAnime === 'true';
                this.playContent(id, type, isAnime);
            }
            if (e.target.classList.contains('approve-btn')) {
                const id = parseInt(e.target.dataset.id);
                this.approveUser(id);
            }
        });
    },

    setView(view) {
        this.state.view = view;
        this.render();
    },

    handleLogin() {
        const btn = document.querySelector('.btn-primary');
        btn.textContent = "CHECKING GATES...";
        btn.style.opacity = "0.5";
        
        setTimeout(() => {
            this.state.isApproved = true;
            this.setView('search');
        }, 1500);
    },

    render() {
        this.updateNav();
        if (this.state.view === 'home') {
            this.renderHome();
        } else if (this.state.view === 'movies') {
            this.renderFiltered('movie');
        } else if (this.state.view === 'tv') {
            this.renderFiltered('tv');
        } else if (this.state.view === 'anime') {
            this.renderAnime();
        } else if (this.state.view === 'search') {
            this.renderSearch();
        } else if (this.state.view === 'player') {
            this.renderPlayer();
        } else if (this.state.view === 'admin') {
            this.renderAdmin();
        }
    },

    updateNav() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${this.state.view}`);
        });
    },

    toggleWatchlist(item) {
        const index = this.state.watchlist.findIndex(i => i.id == item.id);
        if (index === -1) {
            this.state.watchlist.unshift(item);
        } else {
            this.state.watchlist.splice(index, 1);
        }
        localStorage.setItem('alexandria_watchlist', JSON.stringify(this.state.watchlist));
        this.render();
    },

    addToHistory(item) {
        // Keep only unique items, move last watched to top
        this.state.history = this.state.history.filter(i => i.id != item.id);
        this.state.history.unshift(item);
        if (this.state.history.length > 10) this.state.history.pop();
        localStorage.setItem('alexandria_history', JSON.stringify(this.state.history));
    },

    async renderHome() {
        try {
            // Fetch All Data first
            const [mRes, tRes, nRes, hRes, aRes] = await Promise.all([
                fetch(`/api/proxy?endpoint=trending/movie/day`),
                fetch(`/api/proxy?endpoint=trending/tv/day`),
                fetch(`/api/proxy?endpoint=discover/movie?with_networks=213`), // Netflix
                fetch(`/api/proxy?endpoint=discover/movie?with_networks=49`),  // HBO
                fetch(`/api/proxy?endpoint=discover/movie?with_genres=28`)    // Action
            ]);
            
            const mData = await mRes.json();
            const tData = await tRes.json();
            const nData = await nRes.json();
            const hData = await hRes.json();
            const aData = await aRes.json();
            
            const featured = mData.results[0];
            const backdrop = `https://image.tmdb.org/t/p/original${featured.backdrop_path}`;

            let watchlistHtml = '';
            if (this.state.watchlist.length > 0) {
                watchlistHtml = `
                    <div class="view-section priority-archive">
                        <div class="section-header">
                            <h3><span class="pulse-dot"></span> PRIORITY ARCHIVE</h3>
                            <p class="section-tagline">YOUR SAVED TITLES</p>
                        </div>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="watchlist-results"></div>
                        </div>
                    </div>
                `;
            }

            let historyHtml = '';
            if (this.state.history.length > 0) {
                const last = this.state.history[0];
                historyHtml = `
                    <div class="resume-widget" onclick="Alexandria.playContent(${last.id}, '${last.type}')">
                        <div class="resume-content">
                            <span class="resume-label">RESUMING...</span>
                            <h4>${last.title}</h4>
                            <p>CLICK TO RESUME WATCHING</p>
                        </div>
                    </div>
                `;
            }

            this.main.innerHTML = `
                <section class="home-view">
                    <div class="hero-featured" style="background-image: linear-gradient(0deg, var(--bg-color) 0%, rgba(0,0,0,0.3) 100%), url('${backdrop}')">
                        <div class="featured-content">
                            <span class="trending-badge">#1 TRENDING TODAY</span>
                            <h2>${featured.title}</h2>
                            <p>${featured.overview}</p>
                            <button class="btn-primary" onclick="Alexandria.playContent(${featured.id}, 'movie')">WATCH NOW</button>
                        </div>
                        ${historyHtml}
                    </div>
                    
                    ${watchlistHtml}

                    <div class="view-section">
                        <h3>Trending Movies</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="trending-movies"></div>
                        </div>
                    </div>

                    <div class="view-section">
                        <h3>Netflix Originals</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="netflix-hits"></div>
                        </div>
                    </div>

                    <div class="view-section">
                        <h3>HBO Hits</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="hbo-hits"></div>
                        </div>
                    </div>

                    <div class="view-section">
                        <h3>Action Packed</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="action-hits"></div>
                        </div>
                    </div>

                    <div class="view-section">
                        <h3>Trending TV Shows</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="trending-tv"></div>
                        </div>
                    </div>
                </section>
            `;
            
            if (this.state.watchlist.length > 0) {
                this.renderResults(this.state.watchlist, 'watchlist-results');
            }
            this.renderResults(mData.results, 'trending-movies');
            this.renderResults(tData.results, 'trending-tv');
            this.renderResults(nData.results, 'netflix-hits');
            this.renderResults(hData.results, 'hbo-hits');
            this.renderResults(aData.results, 'action-hits');
        } catch (error) {
            console.error("Home scout failed:", error);
            this.main.innerHTML = '<div class="placeholder-msg">COMMUNICATION LOST. CHECK YOUR TMDB KEY.</div>';
        }
    },

    async renderFiltered(type) {
        const title = type === 'movie' ? 'Movies' : 'TV Shows';
        try {
            const [popRes, topRes, newRes] = await Promise.all([
                fetch(`/api/proxy?endpoint=${type}/popular`),
                fetch(`/api/proxy?endpoint=${type}/top_rated`),
                fetch(`/api/proxy?endpoint=${type}/${type === 'movie' ? 'now_playing' : 'on_the_air'}`)
            ]);
            
            const popData = await popRes.json();
            const topData = await topRes.json();
            const newData = await newRes.json();

            this.main.innerHTML = `
                <section class="filtered-view">
                    <div class="view-header" style="padding-left: 4rem;">
                        <h2 style="font-size: 3.5rem;">${title}</h2>
                    </div>
                    
                    <div class="view-section">
                        <h3>Popular Now</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="pop-results"></div>
                        </div>
                    </div>

                    <div class="view-section">
                        <h3>Top Rated</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="top-results"></div>
                        </div>
                    </div>

                    <div class="view-section">
                        <h3>New Releases</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="new-results"></div>
                        </div>
                    </div>
                </section>
            `;
            
            this.renderResults(popData.results, 'pop-results');
            this.renderResults(topData.results, 'top-results');
            this.renderResults(newData.results, 'new-results');
        } catch (error) {
            console.error("Filter scout failed:", error);
        }
    },

    async renderAnime() {
        try {
            const [shonenRes, seinenRes, trendingRes] = await Promise.all([
                fetch(`/api/proxy?endpoint=discover/tv?with_genres=16&with_keywords=210024&sort_by=popularity.desc`),
                fetch(`/api/proxy?endpoint=discover/tv?with_genres=16&with_keywords=210024&vote_average.gte=8`),
                fetch(`/api/proxy?endpoint=discover/tv?with_genres=16&with_keywords=210024&first_air_date.gte=2024-01-01`)
            ]);
            
            const sData = await shonenRes.json();
            const seData = await seinenRes.json();
            const tData = await trendingRes.json();

            this.main.innerHTML = `
                <section class="filtered-view">
                    <div class="view-header" style="padding-left: 4rem;">
                        <h2 style="font-size: 3.5rem;">Anime Hub</h2>
                    </div>
                    
                    <div class="view-section">
                        <h3>Trending Anime</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="anime-trending"></div>
                        </div>
                    </div>

                    <div class="view-section">
                        <h3>New Seasonal Releases (Sub & Dub)</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="anime-new"></div>
                        </div>
                    </div>

                    <div class="view-section">
                        <h3>Top Rated Masterpieces</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="anime-top"></div>
                        </div>
                    </div>
                </section>
            `;
            
            this.renderResults(tData.results, 'anime-trending');
            this.renderResults(seData.results, 'anime-top');
            this.renderResults(sData.results, 'anime-new');
        } catch (error) {
            console.error("Anime scout failed:", error);
        }
    },

    renderSearch() {
        this.main.innerHTML = `
            <section class="supply-run simplified-search">
                <div class="search-hero">
                    <h2>ARCHIVE SEARCH</h2>
                    <p>FIND YOUR NEXT TITLE</p>
                </div>
                <div class="search-box">
                    <div class="input-wrapper">
                        <input type="text" id="tmdb-search" placeholder="SEARCH TITLES..." autocomplete="off">
                        <div class="scan-line"></div>
                    </div>
                    <button class="btn-primary" onclick="Alexandria.handleSearch()">ACCESS</button>
                </div>
                <div class="results-grid" id="search-results" style="margin-top: 4rem;"></div>
            </section>
        `;
        
        // Add Enter key listener
        setTimeout(() => {
            const input = document.getElementById('tmdb-search');
            if (input) {
                input.focus();
                input.addEventListener('keyup', (e) => {
                    if (e.key === 'Enter') this.handleSearch();
                });
            }
        }, 100);
    },

    async handleSearch() {
        const input = document.getElementById('tmdb-search');
        if (!input) return;
        const query = input.value;
        if (!query) return;
        
        const resultsContainer = document.getElementById('search-results');
        resultsContainer.innerHTML = `
            <div class="placeholder-msg">
                <span class="pulse-dot"></span> LOCATING TITLES...
            </div>
        `;

        try {
            const response = await fetch(`/api/proxy?endpoint=search/multi?query=${encodeURIComponent(query)}`);
            const data = await response.json();
            this.renderResults(data.results, 'search-results');
        } catch (error) {
            console.error("Search failed:", error);
            if (resultsContainer) resultsContainer.innerHTML = '<div class="placeholder-msg">Search failed. Check connection.</div>';
        }
    },

    renderResults(results, containerId = 'results') {
        const resultsContainer = document.getElementById(containerId);
        if (!resultsContainer) return;
        
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<div class="placeholder-msg">NOTHING FOUND. THE WORLD IS EMPTY.</div>';
            return;
        }

        resultsContainer.innerHTML = results.map(item => {
            const type = item.media_type || (item.title ? 'movie' : 'tv');
            if (type !== 'movie' && type !== 'tv') return '';
            
            // Handle both TMDB API items and our saved Watchlist items
            const title = item.title || item.name;
            const poster = item.poster || (item.poster_path 
                ? `https://image.tmdb.org/t/p/w500${item.poster_path}` 
                : 'https://via.placeholder.com/500x750?text=NO+IMAGE');
            
            const rating = item.vote_average ? item.vote_average.toFixed(1) : (item.rating || 'N/A');
            const releaseDate = item.release_date || item.first_air_date || item.year || 'Unknown Archive';

            // Check if it's SPECIFICALLY Anime
            const isAnime = item.genre_ids && item.genre_ids.includes(16) && 
                           (item.original_language === 'ja' || (item.origin_country && item.origin_country.includes('JP')));
            
            const inWatchlist = this.state.watchlist.some(i => i.id == item.id);
            
            return `
                <div class="movie-card" data-id="${item.id}" data-type="${type}" data-is-anime="${isAnime}">
                    <div class="poster-wrapper">
                        <img src="${poster}" alt="${title}" onerror="this.src='https://via.placeholder.com/500x750?text=SIGNAL+LOST'">
                        <div class="card-overlay">
                            <div class="card-actions">
                                <button class="log-btn ${inWatchlist ? 'active' : ''}" 
                                        data-id="${item.id}" 
                                        data-type="${type}" 
                                        data-title="${title}" 
                                        data-poster="${poster}"
                                        data-rating="${rating}"
                                        data-year="${releaseDate}">
                                    ${inWatchlist ? '📑' : '🔖'}
                                </button>
                                <span class="card-rating">⭐ ${rating}</span>
                            </div>
                        </div>
                    </div>
                    <div class="movie-info">
                        <h3>${title}</h3>
                        <p>${releaseDate}</p>
                    </div>
                </div>
            `;
        }).join('');
    },

    playContent(tmdbId, type = 'movie', isAnime = false) {
        this.fetchDetails(tmdbId, type, isAnime);
    },

    async fetchDetails(id, type, isAnimeFlag = false) {
        try {
            const response = await fetch(`/api/proxy?endpoint=${type}/${id}`);
            const data = await response.json();
            // Store the anime flag for the player
            data.isAnimeFlag = isAnimeFlag;
            this.showModal(data, type);
        } catch (error) {
            console.error("Details scout failed:", error);
        }
    },

    showModal(data, type) {
        const title = data.title || data.name;
        const poster = data.poster_path 
            ? `https://image.tmdb.org/t/p/w500${data.poster_path}` 
            : 'https://via.placeholder.com/500x750?text=NO+IMAGE';
        const backdrop = data.backdrop_path 
            ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` 
            : '';

        const genres = data.genres ? data.genres.map(g => g.name).join(' • ') : '';
        const year = (data.release_date || data.first_air_date || '').split('-')[0];

        const modalHtml = `
            <div id="movie-modal" class="modal-overlay">
                <div class="modal-content" style="background-image: linear-gradient(to right, rgba(0,0,0,0.95) 30%, transparent 100%), url('${backdrop}')">
                    <button class="modal-close">&times;</button>
                    <div class="modal-details">
                        <img src="${poster}" class="modal-poster">
                        <div class="modal-text">
                            <h2>${title}</h2>
                            <div class="modal-meta">
                                <span class="rating-star">★</span>
                                <span class="rating-value">${data.vote_average.toFixed(1)}</span>
                                <span class="dot">•</span>
                                <span class="year">${year}</span>
                                <span class="dot">•</span>
                                <span class="genres">${genres}</span>
                            </div>
                            <p class="overview">${data.overview}</p>
                            <button class="btn-primary" id="final-play-btn" data-id="${data.id}" data-type="${type}">WATCH NOW</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Modal Events
        document.querySelector('.modal-close').onclick = () => document.getElementById('movie-modal').remove();
        document.getElementById('final-play-btn').onclick = (e) => {
            const { id, type } = e.target.dataset;
            // Refined anime check for modal data
            const isAnime = data.isAnimeFlag || 
                           (data.genres && data.genres.some(g => g.id === 16) && 
                           (data.original_language === 'ja' || (data.origin_country && data.origin_country.includes('JP'))));
            
            this.state.activeContent = { 
                id, 
                type, 
                isAnime,
                season: type === 'tv' ? 1 : undefined, 
                episode: type === 'tv' ? 1 : undefined 
            };
            this.addToHistory({ 
                id, 
                type, 
                title, 
                poster, 
                rating: data.vote_average.toFixed(1), 
                year: year 
            });
            document.getElementById('movie-modal').remove();
            this.setView('player');
        };
    },

    async renderPlayer() {
        // Ensure defaults if missing
        if (this.state.activeContent.type === 'tv') {
            this.state.activeContent.season = this.state.activeContent.season || 1;
            this.state.activeContent.episode = this.state.activeContent.episode || 1;
        }

        const { id, type, season, episode } = this.state.activeContent;
        
        // Selective Provider Logic
        // Anime (detected via state or genre, for now we check if we're in anime view or use a more robust check)
        const isAnime = this.state.view === 'anime' || (this.state.activeContent.isAnime);
        
        // Back to original VidKing frequency for everything
        const embedUrl = type === 'movie' 
            ? `https://www.vidking.net/embed/movie/${id}`
            : `https://www.vidking.net/embed/tv/${id}/${season}/${episode}`;

        this.main.innerHTML = `
            <section class="screening-room elite-layout">
                <div class="player-main">
                    <div class="player-header">
                        <button class="icon-btn" onclick="Alexandria.handleRouting()">← BACK</button>
                        <div class="auto-next-wrap">
                            <span>AUTO NEXT</span>
                            <label class="switch">
                                <input type="checkbox" id="auto-next-chk" ${this.state.autoNext ? 'checked' : ''} onchange="Alexandria.toggleAutoNext(this.checked)">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="player-container">
                        <div id="signal-loader" class="hidden">
                            <div class="loader-content">
                                <p class="loader-status">STABILIZING...</p>
                                <div class="progress-bar"><div class="progress-fill"></div></div>
                            </div>
                        </div>
                        <iframe 
                            id="player-frame" 
                            src="${embedUrl}" 
                            width="100%" 
                            height="100%" 
                            frameborder="0" 
                            scrolling="no"
                            allowfullscreen
                            referrerpolicy="origin"
                            allow="autoplay; fullscreen; encrypted-media; picture-in-picture">
                        </iframe>
                    </div>
                </div>
                
                ${type === 'tv' ? `
                    <div class="episode-sidebar">
                        <div class="sidebar-header">
                            <h3 id="sidebar-season-title">SEASON ${season}</h3>
                            <select id="season-select" onchange="Alexandria.changeSeason(this.value)">
                                <option value="${season}">Season ${season}</option>
                            </select>
                        </div>
                        <div class="episode-list" id="sidebar-episodes">
                            <div class="placeholder-msg">Loading episodes...</div>
                        </div>
                    </div>
                ` : ''}
            </section>
        `;

        if (type === 'tv') {
            this.fetchShowDetails(id);
            this.loadEpisodes(id, season);
            this.preFetchNextEpisode();
        }
    },

    async preFetchNextEpisode() {
        const { id, season, episode } = this.state.activeContent;
        const nextEp = episode + 1;
        try {
            const response = await fetch(`/api/proxy?endpoint=tv/${id}/season/${season}/episode/${nextEp}`);
            if (response.ok) {
                console.log(`Pre-fetched metadata for Episode ${nextEp}`);
            }
        } catch (e) {
            // End of season or error
        }
    },

    async fetchShowDetails(id) {
        try {
            const res = await fetch(`/api/proxy?endpoint=tv/${id}`);
            const data = await res.json();
            const select = document.getElementById('season-select');
            if (!select) return;

            select.innerHTML = data.seasons
                .filter(s => s.season_number > 0)
                .map(s => `<option value="${s.season_number}" ${this.state.activeContent.season == s.season_number ? 'selected' : ''}>Season ${s.season_number}</option>`)
                .join('');
        } catch (e) {
            console.error("Show detail scout failed:", e);
        }
    },

    async loadEpisodes(id, season) {
        const episodeList = document.getElementById('sidebar-episodes');
        const seasonTitle = document.getElementById('sidebar-season-title');
        
        try {
            const response = await fetch(`/api/proxy?endpoint=tv/${id}/season/${season}`);
            const data = await response.json();
            const container = document.getElementById('sidebar-episodes');
            if (!container) return;

            container.innerHTML = data.episodes.map(ep => `
                <div class="episode-item ${this.state.activeContent.episode == ep.episode_number ? 'active' : ''}" 
                     onclick="Alexandria.changeEpisode('episode', ${ep.episode_number})">
                    <div class="ep-thumb">
                        <img src="${ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : 'https://via.placeholder.com/300x170?text=EPISODE'}">
                        ${this.state.activeContent.episode == ep.episode_number ? '<div class="playing-tag">WATCHING</div>' : ''}
                    </div>
                    <div class="ep-info">
                        <span class="ep-num">EPISODE ${ep.episode_number}</span>
                        <span class="ep-title">${ep.name}</span>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            console.error("Season scout failed:", e);
        }
    },

    changeSeason(s) {
        this.state.activeContent.season = parseInt(s);
        this.state.activeContent.episode = 1;
        this.renderPlayer();
    },

    changeEpisode(field, value) {
        this.state.activeContent[field] = parseInt(value);
        this.renderPlayer();
    },

    changeEpisode(field, value) {
        const val = Math.max(1, parseInt(value));
        this.state.activeContent[field] = val;
        this.renderPlayer();
    },

    toggleAutoNext(checked) {
        this.state.autoNext = checked;
    },

    renderAdmin() {
        this.main.innerHTML = `
            <section class="watchtower-admin">
                <h2>WATCHTOWER CONTROL</h2>
                <p>Manage the survivors at the gate.</p>
                <div class="user-list">
                    ${this.state.pendingUsers.map(user => `
                        <div class="user-row ${user.status}">
                            <span>${user.name}</span>
                            <div class="user-actions">
                                ${user.status === 'pending' 
                                    ? `<button class="btn-primary approve-btn" data-id="${user.id}">LET IN</button>` 
                                    : `<span class="status-approved">INSIDE THE WALLS</span>`}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top: 2rem;">
                    <button class="btn-secondary" onclick="Alexandria.setView('landing')">BACK TO GATES</button>
                </div>
            </section>
        `;
    },

    approveUser(id) {
        const user = this.state.pendingUsers.find(u => u.id === id);
        if (user) {
            user.status = 'approved';
            this.render();
        }
    }
};

Alexandria.init();

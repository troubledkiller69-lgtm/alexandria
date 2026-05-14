const Alexandria = {
    state: {
        view: 'home', // home, movies, tv, search, player, admin
        tmdbApiKey: '1674b87b5b127b3c4a5d81846fed3a41', // LO's Key
        pendingUsers: [],
        clickCount: 0,
        searchTimeout: null,
        trendingData: null,
        activeContent: { id: null, type: 'movie', season: 1, episode: 1 },
        autoNext: true
    },

    init() {
        console.log("Alexandria Protocol Initialized...");
        this.cacheDom();
        this.bindEvents();
        window.addEventListener('hashchange', () => this.handleRouting());
        this.handleRouting();
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
                this.playContent(id, type);
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

    async renderHome() {
        try {
            // Fetch All Data first
            const [mRes, tRes, netflixRes, hboRes, actionRes] = await Promise.all([
                fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${this.state.tmdbApiKey}`),
                fetch(`https://api.themoviedb.org/3/trending/tv/week?api_key=${this.state.tmdbApiKey}`),
                fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${this.state.tmdbApiKey}&with_watch_providers=8&watch_region=US`),
                fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${this.state.tmdbApiKey}&with_companies=3268`),
                fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${this.state.tmdbApiKey}&with_genres=28`)
            ]);
            
            const mData = await mRes.json();
            const tData = await tRes.json();
            const nData = await netflixRes.json();
            const hData = await hboRes.json();
            const aData = await actionRes.json();
            
            const featured = mData.results[0];
            const backdrop = `https://image.tmdb.org/t/p/original${featured.backdrop_path}`;

            this.main.innerHTML = `
                <section class="home-view">
                    <div class="hero-featured" style="background-image: linear-gradient(0deg, var(--bg-color) 0%, rgba(0,0,0,0.3) 100%), url('${backdrop}')">
                        <div class="featured-content">
                            <span class="trending-badge">#1 TRENDING TODAY</span>
                            <h2>${featured.title}</h2>
                            <p>${featured.overview}</p>
                            <button class="btn-primary" onclick="Alexandria.playContent(${featured.id}, 'movie')">WATCH NOW</button>
                        </div>
                    </div>
                    
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
                fetch(`https://api.themoviedb.org/3/${type}/popular?api_key=${this.state.tmdbApiKey}`),
                fetch(`https://api.themoviedb.org/3/${type}/top_rated?api_key=${this.state.tmdbApiKey}`),
                fetch(`https://api.themoviedb.org/3/${type}/${type === 'movie' ? 'now_playing' : 'on_the_air'}?api_key=${this.state.tmdbApiKey}`)
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
                fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${this.state.tmdbApiKey}&with_genres=16&with_keywords=210024&sort_by=popularity.desc`),
                fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${this.state.tmdbApiKey}&with_genres=16&with_keywords=210024&vote_average.gte=8`),
                fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${this.state.tmdbApiKey}&with_genres=16&with_keywords=210024&first_air_date.gte=2024-01-01`)
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
                        <h3>Top Rated Classics</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="anime-top"></div>
                        </div>
                    </div>

                    <div class="view-section">
                        <h3>New Seasonal Releases</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="anime-new"></div>
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
                    <h2>Search Archive</h2>
                    <p>Enter title, actor, or genre</p>
                </div>
                <div class="search-box">
                    <input type="text" id="tmdb-search" placeholder="Type here..." autocomplete="off">
                    <button class="btn-primary" onclick="Alexandria.handleSearch()">SEARCH</button>
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
        resultsContainer.innerHTML = '<div class="placeholder-msg">Searching archives...</div>';

        try {
            const response = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${this.state.tmdbApiKey}&query=${encodeURIComponent(query)}`);
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
            const title = item.title || item.name;
            const poster = item.poster_path 
                ? `https://image.tmdb.org/t/p/w500${item.poster_path}` 
                : 'https://via.placeholder.com/500x750?text=NO+IMAGE';
            
            return `
                <div class="movie-card" data-id="${item.id}" data-type="${type}">
                    <div class="poster-wrapper">
                        <img src="${poster}" alt="${title}">
                        <div class="card-overlay">
                            <span class="card-rating">⭐ ${item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}</span>
                        </div>
                    </div>
                    <div class="movie-info">
                        <h3>${title}</h3>
                        <p>${item.release_date || item.first_air_date || 'Unknown'}</p>
                    </div>
                </div>
            `;
        }).join('');
    },

    playContent(tmdbId, type = 'movie') {
        this.fetchDetails(tmdbId, type);
    },

    async fetchDetails(id, type) {
        try {
            const response = await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${this.state.tmdbApiKey}`);
            const data = await response.json();
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
            this.state.activeContent = { id: e.target.dataset.id, type: e.target.dataset.type };
            document.getElementById('movie-modal').remove();
            this.setView('player');
        };
    },

    renderPlayer() {
        const { id, type, season, episode } = this.state.activeContent;
        const embedUrl = type === 'movie' 
            ? `https://www.vidking.net/embed/movie/${id}`
            : `https://www.vidking.net/embed/tv/${id}/${season}/${episode}`;

        this.main.innerHTML = `
            <section class="screening-room">
                <div class="player-container">
                    <iframe 
                        id="player-frame"
                        src="${embedUrl}" 
                        width="100%" 
                        height="600" 
                        frameborder="0" 
                        allowfullscreen>
                    </iframe>
                </div>
                
                <div class="player-controls">
                    ${type === 'tv' ? `
                        <div class="episode-selector">
                            <div class="selector-group">
                                <label>SEASON</label>
                                <input type="number" value="${season}" min="1" onchange="Alexandria.changeEpisode('season', this.value)">
                            </div>
                            <div class="selector-group">
                                <label>EPISODE</label>
                                <input type="number" value="${episode}" min="1" onchange="Alexandria.changeEpisode('episode', this.value)">
                            </div>
                            <div class="nav-buttons">
                                <button class="btn-secondary" onclick="Alexandria.changeEpisode('episode', ${episode - 1})">PREV</button>
                                <button class="btn-primary" onclick="Alexandria.changeEpisode('episode', ${episode + 1})">NEXT</button>
                            </div>
                            <div class="auto-next-toggle">
                                <label class="switch">
                                    <input type="checkbox" ${this.state.autoNext ? 'checked' : ''} onchange="Alexandria.toggleAutoNext(this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <span>AUTO NEXT</span>
                            </div>
                        </div>
                    ` : ''}
                    <button class="btn-secondary back-btn" onclick="Alexandria.handleRouting()">BACK TO ARCHIVES</button>
                </div>
            </section>
        `;
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

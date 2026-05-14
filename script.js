const Alexandria = {
    state: {
        view: 'home', // home, movies, tv, search, player, admin
        tmdbApiKey: '1674b87b5b127b3c4a5d81846fed3a41', // LO's Key
        pendingUsers: [],
        clickCount: 0,
        searchTimeout: null,
        trendingData: null,
        activeContent: { id: null, type: 'movie' }
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
            const [mRes, tRes] = await Promise.all([
                fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${this.state.tmdbApiKey}`),
                fetch(`https://api.themoviedb.org/3/trending/tv/week?api_key=${this.state.tmdbApiKey}`)
            ]);
            const mData = await mRes.json();
            const tData = await tRes.json();
            
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
                        <h3>Trending TV Shows</h3>
                        <div class="carousel-wrapper">
                            <div class="carousel-grid" id="trending-tv"></div>
                        </div>
                    </div>
                </section>
            `;
            
            this.renderResults(mData.results, 'trending-movies');
            this.renderResults(tData.results, 'trending-tv');
        } catch (error) {
            console.error("Home scout failed:", error);
            this.main.innerHTML = '<div class="placeholder-msg">COMMUNICATION LOST. CHECK YOUR TMDB KEY.</div>';
        }
    },

    async renderFiltered(type) {
        const title = type === 'movie' ? 'Movies' : 'TV Shows';
        this.main.innerHTML = `
            <section class="filtered-view">
                <div class="view-header">
                    <h2>${title}</h2>
                </div>
                <div class="results-grid" id="filtered-results">
                    <div class="placeholder-msg">GATHERING ${title.toUpperCase()}...</div>
                </div>
            </section>
        `;

        try {
            const response = await fetch(`https://api.themoviedb.org/3/trending/${type}/week?api_key=${this.state.tmdbApiKey}`);
            const data = await response.json();
            this.renderResults(data.results, 'filtered-results');
        } catch (error) {
            console.error("Filter scout failed:", error);
        }
    },

    renderSearch() {
        this.main.innerHTML = `
            <section class="supply-run">
                <div class="search-bar">
                    <input type="text" id="tmdb-search" placeholder="Search for supplies (movies/shows)...">
                    <button class="btn-primary" id="search-btn">SEARCH</button>
                </div>
                <div class="results-grid" id="results">
                    <div class="placeholder-msg">
                        <p>The archives are ready. Enter a search term above.</p>
                        <p style="font-size: 0.8rem; margin-top: 1rem; color: #666;">(Note: You'll need to plug in your TMDB API key in script.js to see real results!)</p>
                    </div>
                </div>
            </section>
        `;
        
        // Add real-time search (debounce)
        setTimeout(() => {
            const input = document.getElementById('tmdb-search');
            if (input) {
                input.addEventListener('input', (e) => {
                    clearTimeout(this.state.searchTimeout);
                    this.state.searchTimeout = setTimeout(() => this.searchSupplies(), 500);
                });
            }
        }, 100);
    },

    async searchSupplies() {
        const input = document.getElementById('tmdb-search');
        if (!input) return;
        const query = input.value;
        const resultsContainer = document.getElementById('results');
        
        if (!query) return;

        resultsContainer.innerHTML = '<div class="placeholder-msg">SCOUTING THE WASTELAND...</div>';

        try {
            const response = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${this.state.tmdbApiKey}&query=${encodeURIComponent(query)}`);
            const data = await response.json();
            this.renderResults(data.results, 'results');
        } catch (error) {
            console.error("Scout failed:", error);
            resultsContainer.innerHTML = '<div class="placeholder-msg">COMMUNICATION LOST. CHECK YOUR KEY.</div>';
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

        const modalHtml = `
            <div id="movie-modal" class="modal-overlay">
                <div class="modal-content" style="background-image: linear-gradient(to right, rgba(0,0,0,0.9) 30%, transparent 100%), url('${backdrop}')">
                    <button class="modal-close">&times;</button>
                    <div class="modal-details">
                        <img src="${poster}" class="modal-poster">
                        <div class="modal-text">
                            <h2>${title}</h2>
                            <div class="modal-meta">
                                <span class="rating">⭐ ${data.vote_average.toFixed(1)}</span>
                                <span class="date">${data.release_date || data.first_air_date}</span>
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
        const { id, type } = this.state.activeContent;
        const embedUrl = type === 'movie' 
            ? `https://www.vidking.net/embed/movie/${id}`
            : `https://www.vidking.net/embed/tv/${id}/1/1`;

        this.main.innerHTML = `
            <section class="screening-room">
                <div class="player-container">
                    <iframe 
                        src="${embedUrl}" 
                        width="100%" 
                        height="600" 
                        frameborder="0" 
                        allowfullscreen 
                        sandbox="allow-forms allow-scripts allow-pointer-lock allow-same-origin allow-top-navigation">
                    </iframe>
                </div>
                <div class="player-controls">
                    <button class="btn-secondary" onclick="Alexandria.handleRouting()">BACK TO ARCHIVES</button>
                </div>
            </section>
        `;
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

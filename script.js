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
        this.main.innerHTML = `
            <section class="home-view">
                <div class="hero-minimal">
                    <h2>Welcome back to Alexandria.</h2>
                    <p>Trending stories across the world.</p>
                </div>
                <div class="results-grid" id="home-trending">
                    <div class="placeholder-msg">SCANNING FOR TRENDS...</div>
                </div>
            </section>
        `;
        
        try {
            const response = await fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${this.state.tmdbApiKey}`);
            const data = await response.json();
            this.renderResults(data.results, 'home-trending');
        } catch (error) {
            console.error("Home scout failed:", error);
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
        
        // Add specific search styles dynamically if needed
        this.injectSearchStyles();
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
                    <img src="${poster}" alt="${title}">
                    <div class="movie-info">
                        <h3>${title}</h3>
                        <p>${item.release_date || item.first_air_date || 'Unknown Date'}</p>
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
        this.injectModalStyles();
    },

    renderPlayer() {
        const { id, type } = this.state.activeContent;
        const embedUrl = type === 'movie' 
            ? `https://www.vidking.net/embed/movie/${id}`
            : `https://www.vidking.net/embed/tv/${id}/1/1`;

        this.main.innerHTML = `
            <section class="screening-room">
                <div class="player-container">
                    <iframe src="${embedUrl}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>
                </div>
                <div class="player-controls">
                    <button class="btn-secondary" onclick="Alexandria.setView('search')">BACK TO ARCHIVES</button>
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
        this.injectAdminStyles();
    },

    approveUser(id) {
        const user = this.state.pendingUsers.find(u => u.id === id);
        if (user) {
            user.status = 'approved';
            this.render();
        }
    },

    injectAdminStyles() {
        if (document.getElementById('admin-styles')) return;
        const style = document.createElement('style');
        style.id = 'admin-styles';
        style.innerHTML = `
            .watchtower-admin { padding: 4rem; max-width: 1000px; margin: 0 auto; }
            .watchtower-admin h2 { font-size: 2.5rem; margin-bottom: 2rem; }
            .user-list { margin-top: 2rem; background: var(--card-bg); border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); }
            .user-row { 
                display: flex; justify-content: space-between; align-items: center; 
                padding: 1.5rem 2rem; border-bottom: 1px solid var(--border-color); 
            }
            .user-row:last-child { border-bottom: none; }
            .user-row span { font-weight: 500; font-size: 1.1rem; }
            .status-approved { color: var(--accent-ice); font-weight: 600; font-size: 0.9rem; text-shadow: 0 0 10px rgba(0, 242, 255, 0.3); }
            .approve-btn { padding: 0.6rem 1.2rem; font-size: 0.9rem; border-radius: 6px; }
        `;
        document.head.appendChild(style);
    },

    injectSearchStyles() {
        if (document.getElementById('search-styles')) return;
        const style = document.createElement('style');
        style.id = 'search-styles';
        style.innerHTML = `
            .supply-run { padding: 4rem; max-width: 1400px; margin: 0 auto; }
            .search-bar { display: flex; gap: 1rem; margin-bottom: 4rem; max-width: 800px; }
            #tmdb-search { 
                flex: 1; padding: 1.2rem 1.5rem; background: var(--card-bg); border: 1px solid var(--border-color); 
                color: #fff; font-family: 'Inter', sans-serif; font-size: 1.1rem; border-radius: 12px;
                transition: all 0.2s ease;
            }
            #tmdb-search:focus { outline: none; border-color: var(--accent-ice); box-shadow: 0 0 15px rgba(0, 242, 255, 0.2); }
            .results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 2.5rem; }
            .movie-card { 
                cursor: pointer; 
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
            }
            .movie-card:hover { transform: translateY(-8px); filter: drop-shadow(0 0 10px rgba(0, 242, 255, 0.3)); }
            .movie-card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 12px; border: 1px solid transparent; transition: border-color 0.3s ease; }
            .movie-card:hover img { border-color: var(--accent-ice); }
            .movie-info { padding: 1rem 0; }
            .movie-info h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .movie-info p { font-size: 0.9rem; color: var(--text-secondary); }
            .placeholder-msg { grid-column: 1 / -1; text-align: center; padding: 6rem; color: var(--text-secondary); font-size: 1.2rem; }
            .screening-room { padding: 2rem 4rem; }
            .player-container { background: #000; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            .player-controls { margin-top: 3rem; text-align: left; }
        `;
        document.head.appendChild(style);
    },

    injectModalStyles() {
        if (document.getElementById('modal-styles')) return;
        const style = document.createElement('style');
        style.id = 'modal-styles';
        style.innerHTML = `
            .modal-overlay { 
                position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(0,0,0,0.9); z-index: 1000; display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(8px); animation: fadeIn 0.3s ease;
            }
            .modal-content { 
                width: 90%; max-width: 1000px; height: 600px; background-size: cover; background-position: center;
                border-radius: 20px; position: relative; border: 1px solid var(--border-color); overflow: hidden;
            }
            .modal-close { 
                position: absolute; top: 20px; right: 20px; background: none; border: none; 
                color: #fff; font-size: 2rem; cursor: pointer; z-index: 10;
            }
            .modal-details { display: flex; padding: 4rem; gap: 3rem; align-items: center; height: 100%; }
            .modal-poster { width: 300px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .modal-text { flex: 1; }
            .modal-text h2 { font-size: 3rem; margin-bottom: 1rem; }
            .modal-meta { display: flex; gap: 1.5rem; margin-bottom: 1.5rem; font-weight: 600; color: var(--accent-ice); }
            .overview { font-size: 1.1rem; color: var(--text-secondary); margin-bottom: 2.5rem; line-height: 1.6; max-width: 500px; }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            .movie-card { animation: slideUp 0.4s ease forwards; opacity: 0; }
            .movie-card:nth-child(1) { animation-delay: 0.1s; }
            .movie-card:nth-child(2) { animation-delay: 0.15s; }
            .movie-card:nth-child(3) { animation-delay: 0.2s; }
        `;
        document.head.appendChild(style);
    },

    injectHomeStyles() {
        // Shared with main CSS for now
    },

    injectFilteredStyles() {
        // Shared with main CSS for now
    }
};

Alexandria.init();

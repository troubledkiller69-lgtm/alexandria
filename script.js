const Alexandria = {
    state: {
        view: 'landing', // landing, search, player, admin
        isApproved: false,
        currentUser: null,
        tmdbApiKey: '1674b87b5b127b3c4a5d81846fed3a41', // LO's Key
        pendingUsers: [
            { id: 1, name: 'Daryl D.', status: 'pending' },
            { id: 2, name: 'Carol P.', status: 'pending' },
            { id: 3, name: 'Negan S.', status: 'pending' }
        ],
        clickCount: 0
    },

    init() {
        console.log("Alexandria Protocol Initialized...");
        this.cacheDom();
        this.bindEvents();
        this.render();
    },

    cacheDom() {
        this.app = document.getElementById('app');
        this.main = document.getElementById('content');
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
            if (e.target.classList.contains('btn-primary') && this.state.view === 'landing') {
                this.handleLogin();
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
        if (this.state.view === 'landing') {
            this.renderLanding();
        } else if (this.state.view === 'search') {
            this.renderSearch();
        } else if (this.state.view === 'player') {
            this.renderPlayer();
        } else if (this.state.view === 'admin') {
            this.renderAdmin();
        }
    },

    renderLanding() {
        this.main.innerHTML = `
            <section class="hero">
                <div class="hero-overlay"></div>
                <div class="hero-content">
                    <h2>WELCOME TO THE SAFE ZONE.</h2>
                    <p>Enter the gates to access the archives. Only approved survivors may pass.</p>
                    <div class="auth-buttons">
                        <button class="btn-primary">LOGIN</button>
                        <button class="btn-secondary">REGISTER</button>
                    </div>
                </div>
            </section>
        `;
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
        
        // Add search listener for Enter key
        setTimeout(() => {
            const input = document.getElementById('tmdb-search');
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.searchSupplies();
                });
            }
        }, 100);
        
        // Add specific search styles dynamically if needed
        this.injectSearchStyles();
    },

    async searchSupplies() {
        const query = document.getElementById('tmdb-search').value;
        const resultsContainer = document.getElementById('results');
        
        if (!query) return;

        resultsContainer.innerHTML = '<div class="placeholder-msg">SCOUTING THE WASTELAND...</div>';

        try {
            const response = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${this.state.tmdbApiKey}&query=${encodeURIComponent(query)}`);
            const data = await response.json();
            this.renderResults(data.results);
        } catch (error) {
            console.error("Scout failed:", error);
            resultsContainer.innerHTML = '<div class="placeholder-msg">COMMUNICATION LOST. CHECK YOUR KEY.</div>';
        }
    },

    renderResults(results) {
        const resultsContainer = document.getElementById('results');
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<div class="placeholder-msg">NOTHING FOUND. THE WORLD IS EMPTY.</div>';
            return;
        }

        resultsContainer.innerHTML = results.map(item => {
            if (item.media_type !== 'movie' && item.media_type !== 'tv') return '';
            const title = item.title || item.name;
            const poster = item.poster_path 
                ? `https://image.tmdb.org/t/p/w500${item.poster_path}` 
                : 'https://via.placeholder.com/500x750?text=NO+IMAGE';
            
            return `
                <div class="movie-card" data-id="${item.id}" data-type="${item.media_type}">
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
        this.state.activeContent = { id: tmdbId, type: type };
        this.setView('player');
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
            .status-approved { color: #10b981; font-weight: 600; font-size: 0.9rem; }
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
                transition: border-color 0.2s ease;
            }
            #tmdb-search:focus { outline: none; border-color: var(--accent-red); }
            .results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 2.5rem; }
            .movie-card { 
                cursor: pointer; 
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
            }
            .movie-card:hover { transform: translateY(-8px); }
            .movie-card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 12px; box-shadow: 0 10px 20px rgba(0,0,0,0.3); }
            .movie-info { padding: 1rem 0; }
            .movie-info h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .movie-info p { font-size: 0.9rem; color: var(--text-secondary); }
            .placeholder-msg { grid-column: 1 / -1; text-align: center; padding: 6rem; color: var(--text-secondary); font-size: 1.2rem; }
            .screening-room { padding: 2rem 4rem; }
            .player-container { background: #000; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            .player-controls { margin-top: 3rem; text-align: left; }
        `;
        document.head.appendChild(style);
    }
};

Alexandria.init();

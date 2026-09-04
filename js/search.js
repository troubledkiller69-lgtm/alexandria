export const search = {
    renderSearch() {
        const discoverPanel = this.state.searchFilter === 'person' ? '' : `
                    <div id="discover-panel" class="discover-panel minimalist-discover" hidden>
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
                        <div id="search-history" class="search-history-dropdown" hidden></div>
                    </div>
                    <div class="search-toolbar-row">
                        <div class="search-filters" aria-label="Search type">
                            <button class="filter-btn ${this.state.searchFilter === 'multi' ? 'active' : ''}" type="button" aria-pressed="${this.state.searchFilter === 'multi'}" onclick="Alexandria.setSearchFilter('multi')">All</button>
                            <button class="filter-btn ${this.state.searchFilter === 'movie' ? 'active' : ''}" type="button" aria-pressed="${this.state.searchFilter === 'movie'}" onclick="Alexandria.setSearchFilter('movie')">Movies</button>
                            <button class="filter-btn ${this.state.searchFilter === 'tv' ? 'active' : ''}" type="button" aria-pressed="${this.state.searchFilter === 'tv'}" onclick="Alexandria.setSearchFilter('tv')">TV Shows</button>
                            <button class="filter-btn ${this.state.searchFilter === 'person' ? 'active' : ''}" type="button" aria-pressed="${this.state.searchFilter === 'person'}" onclick="Alexandria.setSearchFilter('person')">People</button>
                        </div>
                        <div class="search-toolbar-actions">
                            ${this.state.searchFilter === 'person' ? `
                                <span class="discover-person-hint">Search actors, directors, and creators above.</span>
                            ` : `
                                <button type="button" class="filter-btn discover-toggle" id="discover-toggle-btn" aria-expanded="false" aria-controls="discover-panel" onclick="Alexandria.toggleDiscoverPanel()">FILTERS</button>
                                <span id="discover-active-count" class="discover-active-count" hidden></span>
                            `}
                            <button type="button" class="roulette-btn" onclick="Alexandria.openRouletteModal()">Roulette</button>
                        </div>
                    </div>
                    <div id="search-discover" class="search-discover">${discoverPanel}</div>
                </div>
                <div id="search-context-label" class="search-context-label" hidden></div>
                <div class="results-grid" id="search-results"></div>
            </section>
        `;
        
        const searchInput = document.getElementById('tmdb-search');
        searchInput.placeholder = this.state.searchFilter === 'person'
            ? 'Search actors, directors, creators...'
            : 'Search titles, actors, genres...';
        searchInput.addEventListener('input', () => this.handleSearchInput());
        searchInput.addEventListener('focus', () => {
            if (!searchInput.value.trim() && !this.state.searchQuery) {
                this.renderSearchHistory();
                const dropdown = document.getElementById('search-history');
                if (dropdown && dropdown.children.length) dropdown.removeAttribute('hidden');
            }
        });
        searchInput.addEventListener('blur', (e) => {
            const dropdown = document.getElementById('search-history');
            if (dropdown && dropdown.contains(e.relatedTarget)) return;
            setTimeout(() => {
                const current = document.getElementById('search-history');
                if (current && !current.contains(document.activeElement)) current.setAttribute('hidden', '');
            }, 200);
        });
        
        if (this.state.searchQuery) {
            searchInput.value = this.state.searchQuery;
            document.getElementById('clear-search-btn').style.display = 'block';
            this.setDiscoverVisible(false);
            this.executeSearch(this.state.searchQuery);
        } else {
            setTimeout(() => searchInput.focus(), 100);
            this.setDiscoverVisible(true);
            this.renderSearchHistory();
            if (this.state.searchFilter !== 'person') {
                setTimeout(() => this.executeDiscover(), 150);
            }
        }
    },

    getSearchHistory() {
        try {
            const h = JSON.parse(localStorage.getItem('alexandria_search_history') || '[]');
            return Array.isArray(h) ? h.slice(0, 10) : [];
        } catch {
            return [];
        }
    },

    pushSearchHistory(query) {
        const q = String(query || '').trim();
        if (!q) return;
        let h = this.getSearchHistory().filter(x => x.toLowerCase() !== q.toLowerCase());
        h.unshift(q);
        if (h.length > 10) h = h.slice(0, 10);
        try { localStorage.setItem('alexandria_search_history', JSON.stringify(h)); } catch { /* ignore */ }
    },

    removeSearchHistory(term) {
        const h = this.getSearchHistory().filter(x => x !== term);
        try { localStorage.setItem('alexandria_search_history', JSON.stringify(h)); } catch { /* ignore */ }
        this.renderSearchHistory();
    },

    clearSearchHistory() {
        try { localStorage.removeItem('alexandria_search_history'); } catch { /* ignore */ }
        this.renderSearchHistory();
    },

    renderSearchHistory() {
        const container = document.getElementById('search-history');
        if (!container) return;
        const h = this.getSearchHistory();
        if (!h.length) {
            container.setAttribute('hidden', '');
            container.innerHTML = '';
            return;
        }
        container.removeAttribute('hidden');
        container.innerHTML = `
            <span class="search-history-title">RECENT SEARCHES</span>
            ${h.slice(0, 5).map(t => `
                <button type="button" class="search-history-chip" onclick="Alexandria.runSearchFromHistory('${this.escapeHtml(t)}')">
                    <span>${this.escapeHtml(t)}</span>
                    <span class="search-history-x" onclick="event.stopPropagation(); Alexandria.removeSearchHistory('${this.escapeHtml(t)}')" aria-label="Remove ${this.escapeHtml(t)}">✕</span>
                </button>
            `).join('')}
            <button type="button" class="search-history-clear" onclick="Alexandria.clearSearchHistory()">CLEAR</button>`;
    },

    toggleDiscoverPanel() {
        const panel = document.getElementById('discover-panel');
        const btn = document.getElementById('discover-toggle-btn');
        if (!panel) return;
        const open = panel.hidden;
        panel.hidden = !open;
        if (btn) btn.setAttribute('aria-expanded', String(open));
        this.refreshDiscoverCount();
    },

    refreshDiscoverCount() {
        const genre = document.getElementById('discover-genre')?.value || '';
        const sort = document.getElementById('discover-sort')?.value || 'popularity.desc';
        const year = document.getElementById('discover-year')?.value || '';
        const rating = document.getElementById('discover-rating')?.value || '0';
        const votes = document.getElementById('discover-votes')?.value || '0';
        const runtime = document.getElementById('discover-runtime')?.value || '';
        let n = 0;
        if (genre) n += 1;
        if (sort && sort !== 'popularity.desc') n += 1;
        if (year) n += 1;
        if (rating && rating !== '0') n += 1;
        if (votes && votes !== '0') n += 1;
        if (runtime) n += 1;
        const el = document.getElementById('discover-active-count');
        const btn = document.getElementById('discover-toggle-btn');
        if (el) {
            el.textContent = n ? `${n} ACTIVE` : '';
            el.hidden = !n;
        }
        if (btn) btn.textContent = n ? `FILTERS (${n})` : 'FILTERS';
    },

    runSearchFromHistory(term) {
        const input = document.getElementById('tmdb-search');
        if (input) input.value = term;
        this.state.searchQuery = term;
        const clearBtn = document.getElementById('clear-search-btn');
        if (clearBtn) clearBtn.style.display = 'block';
        this.setDiscoverVisible(false);
        document.getElementById('search-history')?.setAttribute('hidden', '');
        this.executeSearch(term);
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
            this.renderSearchHistory();
            const container = document.getElementById('search-results');
            if (container) container.innerHTML = '';
            if (this.state.searchFilter !== 'person') {
                this.executeDiscover();
            }
        } else {
            this.state.searchQuery = query;
            this.setDiscoverVisible(false);
            const hist = document.getElementById('search-history');
            if (hist) hist.setAttribute('hidden', '');
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
        this.refreshDiscoverCount();
        const label = document.getElementById('search-context-label');
        if (label && !this.state.searchQuery) {
            label.textContent = 'TRENDING NOW';
            label.removeAttribute('hidden');
        }
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
        const r = this.state.roulette = this.state.roulette || { type: 'movie', genre: '', rating: 0, votes: 0, runtime: '', yearFrom: '', yearTo: '', source: 'movie' };
        if (!['movie', 'tv', 'watchlist'].includes(r.source)) r.source = 'movie';
        const genres = r.type === 'tv' ? this._tvGenres : this._movieGenres;
        if (r.genre && !genres.some(([value]) => String(value) === String(r.genre))) r.genre = '';
        const ratingOptions = [[0, 'ANY'], [5, '5+ STARS'], [6, '6+ STARS'], [7, '7+ STARS'], [8, '8+ STARS']];
        const genreOptions = genres.map(([value, label]) => `<option value="${value}" ${String(value) === String(r.genre) ? 'selected' : ''}>${label}</option>`).join('');
        const ratingOptionsHtml = ratingOptions.map(([value, label]) => `<option value="${value}" ${Number(value) === Number(r.rating) ? 'selected' : ''}>${label}</option>`).join('');
        const poolSize = this.state.watchlist.filter(i => (i.status || 'want') !== 'watched').length;

        body.innerHTML = `
            <h2 class="roulette-title">Roulette</h2>
            <div class="roulette-type-toggle">
                <button type="button" class="roulette-type-btn ${r.source === 'movie' ? 'active' : ''}" onclick="Alexandria.setRouletteSource('movie')">MOVIE</button>
                <button type="button" class="roulette-type-btn ${r.source === 'tv' ? 'active' : ''}" onclick="Alexandria.setRouletteSource('tv')">TV</button>
                <button type="button" class="roulette-type-btn ${r.source === 'watchlist' ? 'active' : ''}" onclick="Alexandria.setRouletteSource('watchlist')">WATCHLIST (${poolSize})</button>
            </div>
            ${r.source !== 'watchlist' ? `
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
            </div>` : '<p class="roulette-watchlist-hint">Spins only titles queued on your watchlist.</p>'}
            <button type="button" class="roulette-spin-btn" onclick="Alexandria.spinRoulette()">SPIN THE WHEEL</button>
            <div id="roulette-result"></div>
        `;
    },

    setRouletteSource(source) {
        const r = this.state.roulette = this.state.roulette || { type: 'movie', genre: '', rating: 0, votes: 0, runtime: '', yearFrom: '', yearTo: '', source: 'movie' };
        r.source = ['movie', 'tv', 'watchlist'].includes(source) ? source : 'movie';
        this._rouletteSpinId = (this._rouletteSpinId || 0) + 1;
        this.renderRouletteModal();
    },

    spinWatchlistRoulette(spin) {
        const pool = this.state.watchlist.filter(i => i && i.id != null && (i.status || 'want') !== 'watched');
        const resultEl = document.getElementById('roulette-result');
        if (!pool.length) {
            if (resultEl) resultEl.innerHTML = `
                <div class="placeholder-msg">YOUR QUEUE IS EMPTY — ADD SOME TITLES FIRST</div>`;
            return;
        }
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const title = pick.title || 'Untitled';
        const poster = this.imageUrl(pick.poster_path, 'w342');
        const statusLabel = (pick.status || 'want') === 'watching' ? 'WATCHING' : 'QUEUED';
        if (resultEl) {
            resultEl.innerHTML = `
                <div class="roulette-result">
                    ${poster ? `<img class="roulette-result-poster" src="${this.escapeHtml(poster)}" alt="${this.escapeHtml(title)} poster" loading="lazy">` : ''}
                    <div class="roulette-result-info">
                        <span class="roulette-rating-badge">${statusLabel} · ${String(pick.type || 'movie').toUpperCase()}</span>
                        <h3>${this.escapeHtml(title)}</h3>
                        <div class="roulette-result-btns">
                            <button type="button" class="btn-primary" onclick="Alexandria.closeRouletteModal(); window.location.hash = '#details/${this.escapeHtml(pick.type)}/${Number(pick.id)}'">OPEN TITLE</button>
                            <button type="button" class="btn-secondary" onclick="Alexandria.spinRoulette()">SPIN AGAIN</button>
                        </div>
                    </div>
                </div>`;
        }
    },

    async spinRoulette() {
        const r = this.state.roulette = this.state.roulette || { type: 'movie', genre: '', rating: 0, votes: 0, runtime: '', yearFrom: '', yearTo: '', source: 'movie' };

        this._rouletteSpinId = (this._rouletteSpinId || 0) + 1;
        const spin = this._rouletteSpinId;

        if (r.source === 'watchlist') {
            this.spinWatchlistRoulette(spin);
            return;
        }

        const read = id => document.getElementById(id)?.value || '';
        r.genre = read('roulette-genre');
        r.rating = Number(read('roulette-rating')) || 0;
        r.runtime = read('roulette-runtime');
        r.yearFrom = read('roulette-year-from');
        r.yearTo = read('roulette-year-to');
        const type = r.type;

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
        const label = document.getElementById('search-context-label');
        if (label) {
            label.textContent = `RESULTS FOR "${String(query).toUpperCase().slice(0, 40)}"`;
            label.removeAttribute('hidden');
        }
        container.innerHTML = '<div class="search-loading"><div class="elegant-spinner"></div></div>';

        try {
            const filter = this.state.searchFilter || 'multi';
            const endpoint = `search/${filter}?query=${encodeURIComponent(query)}`;
            const data = await this.getJson(endpoint);
            if (requestId !== this._searchRequestId || !document.body.contains(container)) return;
            this.pushSearchHistory(query);
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
                        ${isHistoryRow && Number(item.progress) >= 5 ? `
                            <div class="resume-strip" aria-label="In progress"><span class="resume-strip-label">RESUME ${this.formatTime(item.progress)}</span></div>
                        ` : ''}
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
            w.classList.add('trailer-playing');
            return;
        }
        if (this._trailerInflight >= 2) return;
        this._trailerInflight++;
        this.getJson(type + '/' + id + '/videos').then(data => {
            this._trailerInflight--;
            const list = (data.videos && data.videos.results) || data.results || [];
            const v = list.find(x => x.site === 'YouTube' && (x.type === 'Trailer' || x.type === 'Teaser') && x.key && x.key.length >= 6 && x.key.length <= 20 && /^[a-zA-Z0-9_-]+$/.test(x.key));
            this._trailerCache[cacheKey] = v ? v.key : false;
            if (v && w.isConnected && w.matches(':hover') && !w.querySelector('.trailer-preview')) {
                w.insertAdjacentHTML('beforeend', trailerFrame(v.key));
                w.classList.add('trailer-playing');
            }
        }).catch(() => { this._trailerInflight--; });

        function trailerFrame(key) {
            return '<iframe class="trailer-preview" src="https://www.youtube-nocookie.com/embed/' + key + '?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1" allow="autoplay; encrypted-media" loading="lazy" tabindex="-1" sandbox="allow-scripts allow-same-origin allow-presentation allow-fullscreen"></iframe>';
        }
    },



    scrollCarousel(btn, amount) {
        // Home rows scroll their .carousel-wrapper; the franchise deck is
        // itself the scroll container, so its arrows scroll the deck element.
        const parent = btn.parentElement;
        const holder = parent.querySelector('.carousel-wrapper')
            || parent.querySelector('.franchise-deck')
            || (parent.classList.contains('franchise-deck') ? parent : null);
        if (holder) holder.scrollBy({left: amount, behavior: 'smooth'});
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

};

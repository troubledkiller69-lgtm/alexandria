export const home = {
    async renderHome() {
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING SECTORS...</div>';
        
        try {
            const currentGenre = this.GENRES.find(g => g.id === (this.state.activeGenreId || 35)) || this.GENRES[0];

            // Sector 1: Core Content Scans
            const [mData, tData, genreData] = await Promise.all([
                this.getJson('trending/movie/day'),
                this.getJson('trending/tv/day'),
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
                    <div id="because-you-watched-section"></div>
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
                    <div class="view-section"><h3>Trending TV Shows</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="trending-tv"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                    <div class="view-section"><h3>RELEASING THIS WEEK</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="airing-week-grid"><div class="placeholder-msg"><span class="pulse-dot"></span> SCANNING AIRTIMES...</div></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>
                </section>`;
            
            this.renderHistory();
            this.renderBecauseYouWatched();
            this.renderWatchlist();
            this.renderResults(genreData.results, 'genre-explorer-grid');
            this.renderResults(specialsData, 'alexandria-specials');
            this.renderResults(mData.results, 'trending-movies');
            this.renderResults(tData.results, 'trending-tv');
            this.renderAiringThisWeek();
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

    async renderBecauseYouWatched() {
        const container = document.getElementById('because-you-watched-section');
        if (!container || !this.state.history || !this.state.history.length) {
            if (container) container.innerHTML = '';
            return;
        }

        const seeds = (this.state.history || [])
            .filter(h => h && (h.type === 'movie' || h.type === 'tv') && h.id != null)
            .slice(0, 2);
        if (!seeds.length) {
            container.innerHTML = '';
            return;
        }

        const token = this._renderToken;
        const blockKeys = new Set();
        (this.state.history || []).forEach(h => {
            if (h && h.id != null && h.type) blockKeys.add(String(h.id) + '_' + h.type);
        });
        (this.state.watchlist || []).forEach(w => {
            if (w && w.id != null && w.type) blockKeys.add(String(w.id) + '_' + w.type);
        });

        const collected = [];
        const seen = new Set();
        for (const seed of seeds) {
            let data = null;
            try {
                data = await this.getJson(seed.type + '/' + seed.id + '/recommendations');
            } catch (error) {
                data = null;
            }
            if (token !== this._renderToken) return;

            const results = (data && data.results) || [];
            for (const item of results) {
                if (!item || !item.poster_path) continue;
                const type = item.media_type === 'tv' || item.media_type === 'movie'
                    ? item.media_type
                    : (item.name && !item.title ? 'tv' : 'movie');
                const key = String(item.id) + '_' + type;
                if (blockKeys.has(key) || seen.has(key)) continue;
                seen.add(key);
                collected.push({ ...item, type });
            }
            if (collected.length >= 14) break;
        }
        if (token !== this._renderToken) return;

        const capped = collected.slice(0, 14);
        if (!capped.length) {
            container.innerHTML = '';
            return;
        }

        const seedTitle = seeds[0].title || seeds[0].name || 'YOUR HISTORY';
        container.innerHTML = `<div class="view-section"><h3>BECAUSE YOU WATCHED ${this.escapeHtml(seedTitle)}</h3><div class="carousel-container"><button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button><div class="carousel-wrapper"><div class="carousel-grid" id="because-you-watched-results"></div></div><button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button></div></div>`;
        this.renderResults(capped, 'because-you-watched-results');
    },

    localISODate(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    // TMDB's tv/on_the_air is popularity-ordered, so page 1 alone misses most
    // of the week's real airings. Pull a few pages and resolve each show's
    // next_episode_to_air (cached by getJson) for the true air date + episode.
    async fetchAiringThisWeek(limit = 24) {
        try {
            const today = new Date();
            const minIso = this.localISODate(today);
            const maxIso = this.localISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7));
            const seen = new Set();
            const tvShows = [];
            const tvPages = await Promise.all([1, 2, 3].map(p => this.getJson('tv/on_the_air?page=' + p).catch(() => null)));
            for (const page of tvPages) {
                for (const s of (page?.results || [])) {
                    if (s && s.id && !seen.has(s.id)) { seen.add(s.id); tvShows.push(s); }
                }
            }
            const tvRows = await this.mapWithConcurrency(tvShows, 6, async s => {
                try {
                    const detail = await this.getJson('tv/' + s.id);
                    const next = detail.next_episode_to_air;
                    if (!next || !next.air_date) return null;
                    if (next.air_date < minIso || next.air_date > maxIso) return null;
                    return {
                        id: s.id,
                        type: 'tv',
                        name: s.name || detail.name || 'Untitled',
                        poster_path: detail.poster_path || s.poster_path,
                        air_date: next.air_date,
                        season: next.season_number,
                        episode: next.episode_number
                    };
                } catch {
                    return null;
                }
            });
            // Theatrical releases this week — the row was TV-only before.
            const movieRows = [];
            try {
                const movieData = await this.getJson(`discover/movie?sort_by=popularity.desc&with_release_type=2|3&primary_release_date.gte=${minIso}&primary_release_date.lte=${maxIso}`);
                for (const m of (movieData.results || []).slice(0, 10)) {
                    if (!m || !m.id || !m.release_date) continue;
                    movieRows.push({
                        id: m.id,
                        type: 'movie',
                        name: m.title || m.name || 'Untitled',
                        poster_path: m.poster_path,
                        air_date: m.release_date
                    });
                }
            } catch { /* movies are a bonus; TV is the core row */ }
            return [...tvRows, ...movieRows]
                .filter(Boolean)
                .sort((a, b) => a.air_date < b.air_date ? -1 : 1)
                .slice(0, limit);
        } catch {
            return [];
        }
    },

    async renderAiringThisWeek() {
        const token = this._renderToken;
        const grid = document.getElementById('airing-week-grid');
        if (!grid) return;
        const rows = await this.fetchAiringThisWeek();
        if (token !== this._renderToken || !grid.isConnected) return;
        if (!rows.length) {
            grid.innerHTML = '<div class="placeholder-msg">No confirmed airings this week.</div>';
            return;
        }
        const fmt = iso => {
            const d = new Date(iso + 'T12:00:00');
            return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()] + ' ' + ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()] + ' ' + d.getDate();
        };
        const todayIso = this.localISODate(new Date());
        grid.innerHTML = rows.map(r => {
            const safeId = this.escapeHtml(String(r.id));
            const safeTitle = this.escapeHtml(r.name);
            const poster = this.imageUrl(r.poster_path, 'w185');
            const isToday = r.air_date === todayIso;
            const isMovie = r.type === 'movie';
            const epLabel = isMovie ? '' : `<span class="airing-card-ep">S${r.season ?? 1} · E${r.episode}</span>`;
            return `
                <a class="airing-card" href="#details/${isMovie ? 'movie' : 'tv'}/${safeId}">
                    ${poster ? `<img class="airing-card-poster" src="${poster}" alt="${safeTitle} poster" loading="lazy" decoding="async">` : '<div class="poster-placeholder" role="img" aria-label="No poster available"><span>A</span><small>NO POSTER</small></div>'}
                    <span class="airing-card-badge ${isToday ? 'today' : ''}">${isToday ? 'TONIGHT' : fmt(r.air_date)}</span>
                    <span class="airing-card-title">${safeTitle}</span>
                    ${epLabel}
                </a>`;
        }).join('');
    },

    removeFromHistory(id, type) {
        if (id == null) return;
        const targetId = String(id);
        this.state.history = (this.state.history || []).filter(item => {
            const idMatch = String(item.id) === targetId;
            const typeMatch = !type || item.type === type || item.media_type === type;
            return !(idMatch && typeMatch);
        });
        this.writeLocalList('alexandria_history', this.state.history);
        this.renderHistory();
        if (this.state.view === 'history') {
            this.renderHistoryPage();
        }
        this.showToast('Removed from continue watching');
    },

};

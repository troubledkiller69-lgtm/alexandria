export const views = {
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

        // Main View Routing. Views render asynchronously; return the promise
        // so callers and tests can await completion (navigate() ignores it).
        if (this.state.view === 'home') return this.renderHome();
        else if (this.state.view === 'movies') return this.renderFiltered('movie');
        else if (this.state.view === 'tv') return this.renderFiltered('tv');
        else if (this.state.view === 'anime') return this.renderAnime();
        else if (this.state.view === 'franchises') return this.renderFranchises();
        else if (this.state.view === 'search') return this.renderSearch();
        else if (this.state.view === 'history') return this.renderHistoryPage();
        else if (this.state.view === 'watchlist') return this.renderWatchlistPage();
        else if (this.state.view === 'player') return this.renderPlayer();
        else if (this.state.view === 'details') return this.renderDetails();
        else if (this.state.view === 'person') return this.renderPerson();
        else if (this.state.view === 'profile') return this.renderProfile();
        else if (this.state.view === 'community') return this.renderCommunity();
        else if (this.state.view === 'party') return this.renderParty();
        else if (this.state.view === 'list') return this.renderList();

        else {
            this.state.view = 'home';
            return this.renderHome();
        }
    },
    GENRES: [
        { id: 35, name: 'Comedy' },
        { id: 28, name: 'Action' },
        { id: 18, name: 'Drama' },
        { id: 27, name: 'Horror' },
        { id: 10749, name: 'Romance' },
        { id: 12, name: 'Adventure' },
        { id: 878, name: 'Science Fiction' },
        { id: 53, name: 'Thriller' },
        { id: 16, name: 'Animation' },
        { id: 80, name: 'Crime' },
        { id: 14, name: 'Fantasy' },
        { id: 9648, name: 'Mystery' },
        { id: 99, name: 'Documentary' },
        { id: 10751, name: 'Family' },
        { id: 36, name: 'History' },
        { id: 10402, name: 'Music' },
        { id: 10752, name: 'War' },
        { id: 37, name: 'Western' }
    ],

    toggleGenreMenu(e) {
        if (e) e.stopPropagation();
        const wrapper = document.getElementById('genre-dropdown-wrapper');
        if (wrapper) wrapper.classList.toggle('open');
    },

    async selectGenre(genreId) {
        const genre = this.GENRES.find(g => g.id === genreId) || this.GENRES[0];
        this.state.activeGenreId = genre.id;
        
        const wrapper = document.getElementById('genre-dropdown-wrapper');
        if (wrapper) wrapper.classList.remove('open');

        const titleEl = document.getElementById('current-genre-title');
        if (titleEl) titleEl.textContent = genre.name;

        document.querySelectorAll('.genre-popover-item').forEach(item => {
            if (Number(item.dataset.genreId) === genre.id) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        const grid = document.getElementById('genre-explorer-grid');
        if (grid) {
            grid.innerHTML = '<div class="placeholder-msg">Loading ' + this.escapeHtml(genre.name) + '...</div>';
            try {
                const data = await this.getJson(`discover/movie?with_genres=${genre.id}&sort_by=popularity.desc`);
                this.renderResults(data.results, 'genre-explorer-grid');
            } catch (err) {
                console.error("Genre fetch failed:", err);
                grid.innerHTML = '<div class="placeholder-msg">Failed to load titles</div>';
            }
        }
    },

    renderHistoryPage() {
        const history = this.state.history || [];
        const featured = history[0];
        const heroBackdrop = featured?.backdrop_path ? this.imageUrl(featured.backdrop_path, 'original') : (featured?.poster_path ? this.imageUrl(featured.poster_path, 'original') : '');

        this.main.innerHTML = `
            <section class="filtered-view">
                <div class="hero-featured" style="--hero-image: url('${heroBackdrop}')">
                    <div class="featured-content">
                        <span class="trending-badge">LAST WATCHED</span>
                        <h1>${this.escapeHtml(featured ? (featured.title || featured.name) : 'WATCH HISTORY')}</h1>
                        <p>${this.escapeHtml(featured?.overview || 'Your playback history across movies and television series.')}</p>
                        <div class="category-hero-actions">
                            ${featured ? `
                                <button class="btn-primary" onclick="Alexandria.playContent(${featured.id}, '${featured.type || 'movie'}', ${featured.season || 1}, ${featured.episode || 1})">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> RESUME PLAYBACK
                                </button>
                            ` : ''}
                            ${history.length > 0 ? `
                                <button class="btn-secondary" onclick="Alexandria.clearWatchHistory()">CLEAR HISTORY</button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="sector-widget">
                        <div class="sector-widget-content">
                            <span class="sector-label">WATCH HISTORY</span>
                            <h4>${history.length} ${history.length === 1 ? 'Title' : 'Titles'} Logged</h4>
                            <p>Recent playback history</p>
                        </div>
                    </div>
                </div>
                <div class="view-section">
                    <h3>Watch History Archive</h3>
                    ${history.length > 0 ? `
                        <div class="results-grid" id="history-page-grid"></div>
                    ` : `
                        <div class="placeholder-msg">Your watch history is empty. Titles you watch will appear here.</div>
                    `}
                </div>
            </section>
        `;
        if (history.length > 0) {
            this.renderResults(history, 'history-page-grid', true);
        }
    },

    clearWatchHistory() {
        this.state.history = [];
        this.writeLocalList('alexandria_history', []);
        this.renderHistoryPage();
        this.showToast('Watch history cleared.');
    },

    async setWatchStatus(id, type, status) {
        const item = this.state.watchlist.find(i => String(i.id) === String(id) && i.type === type);
        if (!item) return;
        item.status = status;
        item.watched_at = status === 'watched' ? new Date().toISOString() : null;
        this.writeLocalList('alexandria_watchlist', this.state.watchlist);

        if (this.supabase && this.state.authUser && String(id).match(/^\d+$/)) {
            this.supabase.from('survival_cache').upsert({
                user_id: this.state.authUser.id,
                tmdb_id: Number(id),
                media_type: type,
                title: item.title,
                poster_path: item.poster_path,
                status: status,
                watched_at: item.watched_at
            }, { onConflict: 'user_id, tmdb_id, media_type' }).then();
        }

        this.showToast(status === 'watched' ? 'Marked as watched.' : status === 'watching' ? 'Moved to watching.' : 'Back in the queue.');
        if (this.state.view === 'watchlist') {
            this.renderWatchlistPage();
        } else if (this.state.view === 'details') {
            this.renderDetails();
        }
    },

    async markEpisodeWatched(id, season, episode, watched = true) {
        const key = `${id}_s${season}e${episode}`;
        if (watched) {
            this.state.watchedEpisodes[key] = true;
        } else {
            delete this.state.watchedEpisodes[key];
        }
        this.writeLocalList('alexandria_watched_episodes', this.state.watchedEpisodes);

        if (this.supabase && this.state.authUser && String(id).match(/^\d+$/)) {
            if (watched) {
                this.supabase.from('watched_episodes').upsert({
                    user_id: this.state.authUser.id,
                    tmdb_id: Number(id),
                    season: Number(season),
                    episode: Number(episode)
                }, { onConflict: 'user_id, tmdb_id, season, episode' }).then();
            } else {
                this.supabase.from('watched_episodes')
                    .delete()
                    .eq('user_id', this.state.authUser.id)
                    .eq('tmdb_id', Number(id))
                    .eq('season', Number(season))
                    .eq('episode', Number(episode))
                    .then();
            }
        }

        // Sync every toggle for this episode across the page (sidebar rows + watchlist panels).
        document.querySelectorAll(`[data-show="${id}"][data-season="${season}"][data-episode="${episode}"]`).forEach(btn => {
            btn.classList.toggle('active', watched);
            btn.setAttribute('aria-pressed', String(watched));
        });

        // First episode logged promotes a queued show to watching.
        if (watched) {
            const item = this.state.watchlist.find(i => String(i.id) === String(id) && i.type === 'tv');
            if (item && item.status === 'want') {
                item.status = 'watching';
                this.writeLocalList('alexandria_watchlist', this.state.watchlist);
                if (this.supabase && this.state.authUser) {
                    this.supabase.from('survival_cache').upsert({
                        user_id: this.state.authUser.id,
                        tmdb_id: Number(id),
                        media_type: 'tv',
                        title: item.title,
                        poster_path: item.poster_path,
                        status: 'watching'
                    }, { onConflict: 'user_id, tmdb_id, media_type' }).then();
                }
            }
        }
        if (this.state.view === 'watchlist') {
            // Keep any expanded episode panels open across the re-render.
            const openPanels = [...document.querySelectorAll('.ep-panel:not([hidden])')].map(p => p.dataset.panelShow);
            this.renderWatchlistPage();
            openPanels.forEach(pid => this.toggleEpPanel(pid));
        }
    },

    clearWatchlistPage() {
        this.state.watchlist = [];
        this.writeLocalList('alexandria_watchlist', []);
        if (this.supabase && this.state.authUser) {
            this.supabase.from('survival_cache').delete().eq('user_id', this.state.authUser.id).then();
        }
        this.renderWatchlistPage();
        this.showToast('Watchlist cleared. Episode progress is kept.');
    },

    async surpriseMeWatchlist() {
        const queue = this.state.watchlist.filter(w => w.status !== 'watched');
        if (!queue.length) {
            this.showToast('Nothing in the queue. Add titles to surprise yourself.');
            return;
        }
        const pick = queue[Math.floor(Math.random() * queue.length)];
        if (pick.type === 'movie') {
            window.location.hash = `#movie/${pick.id}`;
            return;
        }
        // TV: jump to the next unwatched episode of the season you left off on, else s1e1.
        const saved = this.state.history.find(h => String(h.id) === String(pick.id) && h.type === 'tv');
        let s = Math.max(1, Number.parseInt(saved?.season, 10) || 1);
        let e = Math.max(1, Number.parseInt(saved?.episode, 10) || 1);
        try {
            const seasonData = await this.getJson(`tv/${pick.id}/season/${s}`);
            const eps = (seasonData.episodes || []).map(x => x.episode_number).filter(n => Number.isFinite(n));
            const firstUnwatched = eps.find(n => !this.state.watchedEpisodes[`${pick.id}_s${s}e${n}`]);
            if (firstUnwatched) {
                e = firstUnwatched;
            } else {
                const show = await this.getJson('tv/' + pick.id);
                const next = (show.seasons || []).find(x => x.season_number === s + 1);
                if (next) {
                    s = next.season_number;
                    e = 1;
                }
            }
        } catch { /* fall back to the saved spot */ }
        window.location.hash = `#tv/${pick.id}/s/${s}/e/${e}`;
    },

    renderWatchlistPage() {
        const watchlist = this.state.watchlist || [];
        const filter = this.state.watchlistFilter || 'all';
        const sort = this.state.watchlistSort || 'recent';

        const applySort = list => {
            const arr = [...list];
            if (sort === 'title') {
                arr.sort((a, b) => String(a.title || a.name || '').localeCompare(String(b.title || b.name || '')));
            } else if (sort === 'watched') {
                arr.sort((a, b) => String(b.watched_at || '').localeCompare(String(a.watched_at || '')));
            }
            return arr;
        };

        const filtered = applySort(watchlist.filter(w => {
            if (filter === 'want') return (w.status || 'want') === 'want';
            if (filter === 'watching') return (w.status || 'want') === 'watching';
            if (filter === 'watched') return (w.status || 'want') === 'watched';
            if (filter === 'movie') return w.type === 'movie';
            if (filter === 'tv') return w.type === 'tv';
            return true;
        }));

        const queue = applySort(watchlist.filter(w => (w.status || 'want') === 'want'));
        const watching = applySort(watchlist.filter(w => (w.status || 'want') === 'watching'));
        const watched = applySort(watchlist.filter(w => (w.status || 'want') === 'watched'));

        const featured = queue[0] || watching[0] || watched[0] || watchlist[0];
        const heroBackdrop = featured?.backdrop_path ? this.imageUrl(featured.backdrop_path, 'original') : (featured?.poster_path ? this.imageUrl(featured.poster_path, 'original') : '');
        const filterActive = filter !== 'all';

        const pill = (val, label) => `<button class="filter-btn ${filter === val ? 'active' : ''}" type="button" aria-pressed="${filter === val}" onclick="Alexandria.setWatchlistFilter('${val}')">${label}</button>`;

        this.main.innerHTML = `
            <section class="filtered-view">
                <div class="hero-featured" style="--hero-image: url('${heroBackdrop}')">
                    <div class="featured-content">
                        <span class="trending-badge">SAVED WATCHLIST</span>
                        <h1>${this.escapeHtml(featured ? (featured.title || featured.name) : 'MY WATCHLIST')}</h1>
                        <p>${this.escapeHtml(featured?.overview || 'Your saved collection of movies and television series.')}</p>
                        <div class="category-hero-actions">
                            ${featured ? `
                                <button class="btn-primary" onclick="Alexandria.playContent(${featured.id}, '${featured.type || 'movie'}')">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> WATCH NOW
                                </button>
                                <button class="btn-secondary wl-details-btn" onclick="window.location.hash = '#details/${featured.type || 'movie'}/${featured.id}'">DETAILS</button>
                            ` : ''}
                            ${watchlist.length > 0 ? `
                                <button class="btn-secondary" onclick="Alexandria.clearWatchlistPage()">CLEAR WATCHLIST</button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="sector-widget">
                        <div class="sector-widget-content">
                            <span class="sector-label">MY WATCHLIST</span>
                            <h4>${watchlist.length} ${watchlist.length === 1 ? 'Title' : 'Titles'} Saved</h4>
                            <p>Personal bookmarked titles</p>
                        </div>
                    </div>
                </div>
                ${watchlist.length > 0 ? `
                <div class="watchlist-toolbar">
                    <div class="watchlist-toolbar-filters">
                        ${pill('all', 'ALL')}
                        ${pill('want', 'TO WATCH')}
                        ${pill('watching', 'WATCHING')}
                        ${pill('watched', 'WATCHED')}
                        ${pill('movie', 'MOVIES')}
                        ${pill('tv', 'TV')}
                    </div>
                    <div class="watchlist-toolbar-actions">
                        <select id="watchlist-sort" class="compact-select" aria-label="Sort watchlist" onchange="Alexandria.setWatchlistSort(this.value)">
                            <option value="recent" ${sort === 'recent' ? 'selected' : ''}>RECENTLY ADDED</option>
                            <option value="title" ${sort === 'title' ? 'selected' : ''}>TITLE A-Z</option>
                            <option value="watched" ${sort === 'watched' ? 'selected' : ''}>WATCHED DATE</option>
                        </select>
                        <button class="compact-btn" type="button" onclick="Alexandria.surpriseMeWatchlist()">SURPRISE ME</button>
                    </div>
                </div>
                ` : ''}
                ${filterActive ? `
                <div class="view-section">
                    <h3>${filter === 'want' ? 'TO WATCH' : filter === 'watching' ? 'WATCHING' : filter === 'watched' ? 'WATCHED' : filter === 'movie' ? 'MOVIES' : 'TV SHOWS'}</h3>
                    ${filtered.length > 0 ? `<div class="results-grid" id="watchlist-page-grid"></div>` : '<div class="placeholder-msg">Nothing in this sector of the archive yet.</div>'}
                </div>
                ` : `
                <div class="view-section">
                    <h3>UP NEXT</h3>
                    ${queue.length > 0 ? `<div class="results-grid" id="wl-grid-queue"></div>` : '<div class="placeholder-msg">Your queue is empty. Add titles to save them for later.</div>'}
                </div>
                ${watching.length > 0 ? `
                <div class="view-section">
                    <h3>WATCHING</h3>
                    <div class="results-grid" id="wl-grid-watching"></div>
                </div>` : ''}
                ${watched.length > 0 ? `
                <div class="view-section">
                    <h3>WATCHED</h3>
                    <div class="results-grid" id="wl-grid-watched"></div>
                </div>` : ''}
                `}
                ${watchlist.length === 0 ? `
                <div class="view-section">
                    <div class="placeholder-msg">Your watchlist is empty. Add titles to save them for later.</div>
                </div>` : ''}
            </section>
        `;

        if (filterActive) {
            if (filtered.length > 0) this.renderResults(filtered, 'watchlist-page-grid', false, { watchlistMode: true });
        } else {
            if (queue.length > 0) this.renderResults(queue, 'wl-grid-queue', false, { watchlistMode: true });
            if (watching.length > 0) this.renderResults(watching, 'wl-grid-watching', false, { watchlistMode: true });
            if (watched.length > 0) this.renderResults(watched, 'wl-grid-watched', false, { watchlistMode: true });
        }
    },

    setWatchlistFilter(val) {
        this.state.watchlistFilter = val;
        this.renderWatchlistPage();
    },

    setWatchlistSort(val) {
        this.state.watchlistSort = val;
        this.renderWatchlistPage();
    },

    async toggleEpPanel(id, btnArg) {
        const card = btnArg ? btnArg.closest('.movie-card') : document.querySelector(`.movie-card[data-id="${id}"]`);
        const btn = btnArg || (card ? card.querySelector('.ep-toggle-btn') : null);
        const panel = card ? card.querySelector('.ep-panel') : null;
        if (!panel) return;
        if (!panel.hidden) {
            panel.hidden = true;
            if (btn) {
                btn.classList.remove('active');
                btn.setAttribute('aria-expanded', 'false');
            }
            return;
        }
        panel.hidden = false;
        if (btn) {
            btn.classList.add('active');
            btn.setAttribute('aria-expanded', 'true');
        }
        if (panel.dataset.loaded) return;
        panel.dataset.loaded = '1';
        const token = this._renderToken;
        try {
            const show = await this.getJson('tv/' + id);
            const seasons = (show.seasons || []).filter(s => s.season_number > 0);
            const seasonData = await this.mapWithConcurrency(seasons, 3, s =>
                this.getJson(`tv/${id}/season/${s.season_number}`).catch(() => null));
            if (token !== this._renderToken || panel.hidden) return;
            panel.innerHTML = seasons.map((s, i) => {
                const eps = (seasonData[i]?.episodes || []).filter(e => Number.isFinite(e.episode_number));
                return `
                <div class="ep-panel-season">
                    <span class="ep-panel-season-name">SEASON ${s.season_number}</span>
                    ${eps.length ? eps.map(e => {
                        const watched = !!this.state.watchedEpisodes[`${id}_s${s.season_number}e${e.episode_number}`];
                        return `
                        <div class="ep-panel-item ${watched ? 'watched' : ''}">
                            <span class="ep-panel-num">EP ${e.episode_number}</span>
                            <a class="ep-panel-name" href="#tv/${id}/s/${s.season_number}/e/${e.episode_number}">${this.escapeHtml(e.name || 'Untitled episode')}</a>
                            <button class="ep-watched-btn ${watched ? 'active' : ''}" type="button" aria-label="Mark episode ${e.episode_number} watched" aria-pressed="${watched}"
                                data-show="${id}" data-season="${s.season_number}" data-episode="${e.episode_number}"
                                onclick="event.stopPropagation(); event.preventDefault(); Alexandria.markEpisodeWatched(${id}, ${s.season_number}, ${e.episode_number}, !this.classList.contains('active'))">✓</button>
                        </div>`;
                    }).join('') : '<div class="ep-panel-item"><span class="ep-panel-name">No episodes listed.</span></div>'}
                </div>`;
            }).join('');
        } catch {
            panel.innerHTML = '<div class="placeholder-msg">EPISODES UNREACHABLE</div>';
        }
    },



};

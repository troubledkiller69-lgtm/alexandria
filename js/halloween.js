export const halloween = {
    async renderHalloween() {
        if (!this.main) this.main = document.getElementById('content');
        if (!this.main) return;

        this.main.innerHTML = `
            <section class="halloween-page">
                <header class="halloween-header">
                    <div class="halloween-badge">🎃 OCTOBER HORROR CALENDAR</div>
                    <h1>31 Days of Horror</h1>
                    <p class="halloween-sub">One movie per night. Watch them all if you survive.</p>
                    <div class="halloween-progress" id="halloween-progress">
                        <span class="halloween-progress-text">0 / 31 watched</span>
                        <div class="halloween-progress-bar"><div class="halloween-progress-fill" style="width: 0%"></div></div>
                    </div>
                </header>
                <div class="halloween-grid" id="halloween-grid"></div>
            </section>
        `;

        const movies = await this.fetchHalloweenMovies();
        this.renderHalloweenGrid(movies);
        this.updateHalloweenProgress(movies);
    },

    async fetchHalloweenMovies() {
        const token = this._renderToken;
        const toDay = (m, i) => ({
            id: m.id,
            title: m.title || m.name,
            poster_path: m.poster_path,
            release_date: m.release_date || m.first_air_date,
            vote_average: m.vote_average,
            overview: m.overview || '',
            day: i + 1,
        });
        try {
            // getJson encodes the endpoint itself; two pages for variety.
            const [p1, p2] = await Promise.all([
                this.getJson('discover/movie?with_genres=27&sort_by=popularity.desc&vote_average.gte=5&vote_count.gte=100&page=1&include_adult=false&language=en-US'),
                this.getJson('discover/movie?with_genres=27&sort_by=popularity.desc&vote_average.gte=5&vote_count.gte=100&page=2&include_adult=false&language=en-US'),
            ]);
            if (token !== this._renderToken) return [];
            const seen = new Set();
            const picks = [];
            for (const m of [...(p1?.results || []), ...(p2?.results || [])]) {
                if (picks.length >= 31 || !m || seen.has(m.id)) continue;
                if (!m.poster_path || !m.release_date) continue;
                if (!(m.genre_ids || []).includes(27)) continue;
                seen.add(m.id);
                picks.push(m);
            }
            if (picks.length) return picks.slice(0, 31).map(toDay);
        } catch { /* fall through to franchise fallback */ }
        try {
            return await this.getFallbackHalloweenMovies(token);
        } catch {
            return [];
        }
    },

    // Offline-proof fallback: horror franchise collections already curated
    // in-repo (franchise-data.js). Resolved live so posters/ratings are real.
    async getFallbackHalloweenMovies(token) {
        const horrorCollections = [91361, 9735, 8581, 656, 2602, 313086, 1960, 8864, 228446, 41437];
        const perFranchise = await this.mapWithConcurrency(horrorCollections, 3, async (cid) => {
            try {
                const data = await this.getJson('collection/' + cid);
                return (data?.parts || [])
                    .filter(p => p && p.poster_path && p.release_date)
                    .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
                    .slice(0, 4);
            } catch {
                return [];
            }
        });
        if (token !== undefined && token !== this._renderToken) return [];
        // Round-robin across franchises so days alternate killers, ghosts, dolls.
        const picks = [];
        const seen = new Set();
        for (let round = 0; round < 4 && picks.length < 31; round++) {
            for (const group of perFranchise) {
                const m = group[round];
                if (m && !seen.has(m.id)) {
                    seen.add(m.id);
                    picks.push(m);
                    if (picks.length >= 31) break;
                }
            }
        }
        return picks.map((m, i) => ({
            id: m.id,
            title: m.title,
            poster_path: m.poster_path,
            release_date: m.release_date,
            vote_average: m.vote_average,
            overview: m.overview || '',
            day: i + 1,
        }));
    },

    renderHalloweenGrid(movies) {
        const grid = document.getElementById('halloween-grid');
        if (!grid) return;
        if (!movies.length) {
            grid.innerHTML = '<div class="placeholder-msg">THE CRYPT IS EMPTY — CHECK YOUR CONNECTION. <button type="button" class="btn-quiet" data-retry-view="halloween">RETRY</button></div>';
            return;
        }
        const watched = new Set((this.state.history || []).filter(h => h.type === 'movie').map(h => String(h.id)));

        grid.innerHTML = movies.map(m => {
            const isWatched = watched.has(String(m.id));
            const poster = m.poster_path ? this.imageUrl(m.poster_path, 'w342') : '';
            const rating = m.vote_average ? m.vote_average.toFixed(1) : '—';
            const year = m.release_date ? m.release_date.slice(0, 4) : '';
            return `
                <article class="halloween-card ${isWatched ? 'watched' : ''}" data-id="${m.id}" data-type="movie">
                    <div class="halloween-card-day">${m.day}</div>
                    <div class="halloween-card-poster">
                        ${poster ? `<img src="${poster}" alt="${this.escapeHtml(m.title)}" loading="lazy" decoding="async">` : '<div class="halloween-poster-placeholder">🎃</div>'}
                        ${isWatched ? '<div class="halloween-watched-overlay"><span class="halloween-watched-icon">✓</span><span>WATCHED</span></div>' : ''}
                    </div>
                    <div class="halloween-card-info">
                        <h3 class="halloween-card-title">${this.escapeHtml(m.title)}</h3>
                        <div class="halloween-card-meta">
                            <span class="halloween-rating">${rating} ★</span>
                            <span class="halloween-year">${year}</span>
                        </div>
                        <button type="button" class="halloween-log-btn" data-id="${m.id}" data-type="movie" data-title="${this.escapeHtml(m.title)}" data-poster="${m.poster_path || ''}" data-score="${rating}" aria-label="${isWatched ? 'Mark as unwatched' : 'Mark as watched'}">
                            ${isWatched ? '✓ Watched' : 'Mark Watched'}
                        </button>
                    </div>
                </article>
            `;
        }).join('');

        grid.querySelectorAll('.halloween-log-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = Number(btn.dataset.id);
                const type = btn.dataset.type;
                const title = btn.dataset.title;
                const poster = btn.dataset.poster;
                const score = Number(btn.dataset.score);
                const already = btn.classList.contains('watched');
                if (already) {
                    await this.removeFromWatchlist({ id, type });
                    btn.textContent = 'Mark Watched';
                    btn.classList.remove('watched');
                    const card = btn.closest('.halloween-card');
                    card.classList.remove('watched');
                    const overlay = card.querySelector('.halloween-watched-overlay');
                    if (overlay) overlay.remove();
                } else {
                    await this.addToWatchlist({ id, type, title, poster_path: poster });
                    btn.textContent = '✓ Watched';
                    btn.classList.add('watched');
                    const card = btn.closest('.halloween-card');
                    card.classList.add('watched');
                    const posterDiv = card.querySelector('.halloween-card-poster');
                    if (posterDiv && !posterDiv.querySelector('.halloween-watched-overlay')) {
                        posterDiv.insertAdjacentHTML('beforeend', '<div class="halloween-watched-overlay"><span class="halloween-watched-icon">✓</span><span>WATCHED</span></div>');
                    }
                }
                this.updateHalloweenProgress(this.getHalloweenMovies());
            });
        });

        grid.querySelectorAll('.halloween-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.halloween-log-btn')) return;
                const id = card.dataset.id;
                const type = card.dataset.type;
                window.location.hash = `#details/${type}/${id}`;
            });
        });
    },

    getHalloweenMovies() {
        const grid = document.getElementById('halloween-grid');
        if (!grid) return [];
        return Array.from(grid.querySelectorAll('.halloween-card')).map(card => ({
            id: Number(card.dataset.id),
            type: card.dataset.type,
            watched: card.classList.contains('watched'),
        }));
    },

    updateHalloweenProgress(movies) {
        const text = document.querySelector('.halloween-progress-text');
        const fill = document.querySelector('.halloween-progress-fill');
        if (!text || !fill) return;
        const watched = movies.filter(m => m.watched).length;
        const total = movies.length || 31;
        text.textContent = `${watched} / ${total} watched`;
        fill.style.width = `${Math.round((watched / total) * 100)}%`;
    },
};
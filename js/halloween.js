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
            franchise: typeof m.franchise === 'string' ? m.franchise : '',
        });

        // Major horror franchise collection IDs from TMDB
        const franchiseCollections = [
            { id: 91361, name: 'Halloween' },           // Halloween franchise
            { id: 9735, name: 'Friday the 13th' },      // Friday the 13th franchise
            { id: 8581, name: 'A Nightmare on Elm Street' }, // Nightmare on Elm Street
            { id: 656, name: 'Scream' },                 // Scream franchise
            { id: 2602, name: 'The Texas Chainsaw Massacre' }, // Texas Chainsaw
            { id: 313086, name: 'Child\'s Play' },      // Child's Play / Chucky
            { id: 1960, name: 'Hellraiser' },            // Hellraiser
            { id: 8864, name: 'The Conjuring' },         // Conjuring Universe
            { id: 228446, name: 'Insidious' },           // Insidious
            { id: 41437, name: 'Evil Dead' },            // Evil Dead
        ];

        try {
            // Fetch all movies from each franchise collection
            const franchiseMovies = await this.mapWithConcurrency(franchiseCollections, 3, async (fc) => {
                try {
                    const data = await this.getJson('collection/' + fc.id);
                    const parts = (data?.parts || [])
                        .filter(p => p && p.poster_path && p.release_date)
                        .sort((a, b) => {
                            // Sort by release date (oldest first)
                            const da = new Date(a.release_date || 0).getTime();
                            const db = new Date(b.release_date || 0).getTime();
                            return da - db;
                        });
                    return { franchise: fc.name, movies: parts };
                } catch {
                    return { franchise: fc.name, movies: [] };
                }
            });

            if (token !== this._renderToken) return [];

            // Round-robin pick one from each franchise to get variety across the month
            const picks = [];
            const seen = new Set();
            for (let round = 0; round < 5 && picks.length < 31; round++) {
                for (const fm of franchiseMovies) {
                    const m = fm.movies[round];
                    if (m && !seen.has(m.id)) {
                        seen.add(m.id);
                        picks.push({ ...m, franchise: fm.franchise });
                        if (picks.length >= 31) break;
                    }
                }
            }

            // If still short, fill with more from largest franchises
            if (picks.length < 31) {
                for (const fm of franchiseMovies) {
                    for (const m of fm.movies) {
                        if (picks.length >= 31 || !m || seen.has(m.id)) continue;
                        seen.add(m.id);
                        picks.push({ ...m, franchise: fm.franchise });
                    }
                    if (picks.length >= 31) break;
                }
            }

            if (picks.length) return picks.slice(0, 31).map((m, i) => toDay(m, i));
        } catch { /* fall through */ }

        // Ultimate fallback: static curated list with known TMDB IDs
        const fallback = [
            { id: 781, franchise: 'Halloween' },           // Halloween (1978)
            { id: 4488, franchise: 'Friday the 13th' },    // Friday the 13th (1980)
            { id: 118, franchise: 'A Nightmare on Elm Street' }, // Nightmare (1984)
            { id: 4232, franchise: 'Halloween' },          // Halloween II (1981)
            { id: 9923, franchise: 'Friday the 13th' },    // Friday 13th Part 2 (1981)
            { id: 1053, franchise: 'A Nightmare on Elm Street' }, // Nightmare 2 (1985)
            { id: 10554, franchise: 'Halloween' },         // Halloween III (1982)
            { id: 9924, franchise: 'Friday the 13th' },    // Friday 13th Part 3 (1982)
            { id: 733, franchise: 'A Nightmare on Elm Street' }, // Nightmare 3 (1987)
            { id: 11452, franchise: 'Halloween' },         // Halloween 4 (1988)
            { id: 10646, franchise: 'Friday the 13th' },   // Friday 13th Part 4 (1984)
            { id: 1381, franchise: 'A Nightmare on Elm Street' }, // Nightmare 4 (1988)
            { id: 11652, franchise: 'Halloween' },         // Halloween 5 (1989)
            { id: 10647, franchise: 'Friday the 13th' },   // Friday 13th Part 5 (1985)
            { id: 1382, franchise: 'A Nightmare on Elm Street' }, // Nightmare 5 (1989)
            { id: 11469, franchise: 'Scream' },            // Scream (1996)
            { id: 27953, franchise: 'Scream' },            // Scream 2 (1997)
            { id: 4233, franchise: 'Halloween' },          // Halloween 6 (1995)
            { id: 10648, franchise: 'Friday the 13th' },   // Friday 13th Part 6 (1986)
            { id: 1383, franchise: 'A Nightmare on Elm Street' }, // Nightmare 6 (1991)
            { id: 11474, franchise: 'Halloween' },         // H20 (1998)
            { id: 10649, franchise: 'Friday the 13th' },   // Friday 13th Part 7 (1988)
            { id: 2642, franchise: 'The Texas Chainsaw Massacre' }, // TCM (1974)
            { id: 942, franchise: 'Child\'s Play' },       // Child's Play (1988)
            { id: 757, franchise: 'Hellraiser' },          // Hellraiser (1987)
            { id: 4234, franchise: 'Halloween' },          // Halloween Resurrection (2002)
            { id: 10650, franchise: 'Friday the 13th' },   // Jason X (2001)
            { id: 41438, franchise: 'Evil Dead' },         // Evil Dead (1981)
            { id: 10836, franchise: 'Evil Dead' },         // Evil Dead II (1987)
            { id: 11485, franchise: 'Halloween' },         // Halloween (2007 remake)
            { id: 345349, franchise: 'Halloween' },        // Halloween (2018)
        ];

        try {
            const resolved = await this.mapWithConcurrency(fallback, 4, async (m) => {
                try {
                    const data = await this.getJson('movie/' + m.id);
                    if (data && data.poster_path && data.release_date) {
                        return { ...data, franchise: m.franchise };
                    }
                    return null;
                } catch {
                    return null;
                }
            });
            if (token !== this._renderToken) return [];
            const picks = resolved.filter(m => m && !seen.has(m.id)).map(m => ({ ...m, franchise: m.franchise }));
            if (picks.length) return picks.slice(0, 31).map(toDay);
        } catch { /* give up */ }

        return [];
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
            let poster = '';
            try {
                const rawPoster = m.poster_path;
                if (rawPoster) {
                    const url = this.imageUrl(rawPoster, 'w342');
                    poster = typeof url === 'string' ? url : '';
                }
            } catch { poster = ''; }
            if (typeof poster !== 'string' || !poster.startsWith('http')) poster = '';
            
            let franchise = '';
            try {
                franchise = m.franchise ? String(m.franchise) : '';
            } catch { franchise = ''; }
            if (typeof franchise !== 'string') franchise = '';
            
            const rating = m.vote_average ? m.vote_average.toFixed(1) : '—';
            const year = m.release_date ? m.release_date.slice(0, 4) : '';

            return `
                <article class="halloween-card ${isWatched ? 'watched' : ''}" data-id="${m.id}" data-type="movie">
                    <div class="halloween-card-day">${m.day}</div>
                    <div class="halloween-card-poster">
                        ${poster ? `<img src="${poster}" alt="${this.escapeHtml(m.title)}" loading="lazy" decoding="async">` : '<div class="halloween-poster-placeholder">🎃</div>'}
                        ${franchise ? `<div class="halloween-tag">${this.escapeHtml(franchise)}</div>` : ''}
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
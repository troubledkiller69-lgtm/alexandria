export const halloween = {
    async renderHalloween() {
        if (!this.main) this.main = document.getElementById('content');
        if (!this.main) return;

        const year = new Date().getFullYear();

        this.main.innerHTML = `
            <section class="halloween-page">
                <div class="hw-moon" aria-hidden="true"></div>
                <div class="hw-fog" aria-hidden="true"></div>
                <header class="halloween-header">
                    <div class="halloween-badge"><span class="hw-pip" aria-hidden="true"></span>October horror calendar</div>
                    <h1>31 Days of Horror</h1>
                    <p class="hw-month">October ${year}</p>
                    <p class="halloween-sub">One movie per night. Watch them all if you survive.</p>
                    <p class="halloween-countdown" id="halloween-countdown"></p>
                    <div class="halloween-progress" id="halloween-progress">
                        <span class="halloween-progress-text">0 / 31 watched</span>
                        <div class="halloween-progress-bar"><div class="halloween-progress-fill" style="width: 0%"></div></div>
                    </div>
                </header>
                <div class="hw-weekdays" aria-hidden="true">
                    <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                </div>
                <div class="halloween-grid hw-cal" id="halloween-grid"></div>
                <p class="hw-legend">Tap the lantern to log a night. Tap the cell for details.</p>
            </section>
        `;

        const movies = await this.fetchHalloweenMovies();
        this.renderHalloweenGrid(movies);
        this.updateHalloweenProgress(movies);
        this.updateHalloweenCountdown();
        this.spotlightTonight();
    },

    spotlightTonight() {
        if (new Date().getMonth() !== 9) return;
        const card = document.querySelector(`.halloween-card[data-day="${new Date().getDate()}"]`);
        if (!card) return;
        card.classList.add('tonight');
        try { card.scrollIntoView({ block: 'center' }); } catch { /* ignore */ }
    },

    updateHalloweenCountdown() {
        const el = document.getElementById('halloween-countdown');
        if (!el) return;
        const now = new Date();
        const year = now.getFullYear();
        const dayStart = new Date(year, 9, 31);
        const dayEnd = new Date(year, 9, 31, 23, 59, 59);
        if (now >= dayStart && now <= dayEnd) {
            el.textContent = 'It\'s Halloween night. No excuses.';
            return;
        }
        // Count to the next 31 October: this year's if it has not started, otherwise next year's.
        const target = now < dayStart ? dayStart : new Date(year + 1, 9, 31);
        const days = Math.ceil((target - now) / 86400000);
        el.textContent = days === 1 ? '1 night until Halloween.' : `${days} nights until Halloween.`;
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

        const seen = new Set();
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
        const now = new Date();
        const inOctober = now.getMonth() === 9;
        const today = now.getDate();
        // Monday-first offset so Oct 1 lands on its real weekday.
        const lead = (new Date(now.getFullYear(), 9, 1).getDay() + 6) % 7;
        const watched = this.halloweenWatchedIds();

        const blanks = '<span class="cal-blank" aria-hidden="true"></span>'.repeat(lead);

        grid.innerHTML = blanks + movies.map(m => {
            const isWatched = watched.has(String(m.id));
            const missed = inOctober && !isWatched && m.day < today;
            const finale = m.day === 31;
            let poster = '';
            try {
                const rawPoster = m.poster_path;
                if (rawPoster) {
                    const url = this.imageUrl(rawPoster, 'w342');
                    poster = typeof url === 'string' ? url : '';
                }
            } catch { poster = ''; }
            if (typeof poster !== 'string' || !poster.startsWith('http')) poster = '';

            const rating = m.vote_average ? m.vote_average.toFixed(1) : '—';
            const year = m.release_date ? m.release_date.slice(0, 4) : '';

            return `
                <article class="halloween-card cal-cell${isWatched ? ' watched' : ''}${missed ? ' missed' : ''}${finale ? ' finale' : ''}" data-id="${m.id}" data-type="movie" data-day="${m.day}">
                    <div class="cal-poster">
                        ${poster ? `<img src="${poster}" alt="" loading="lazy" decoding="async">` : '<div class="halloween-poster-placeholder" aria-hidden="true"></div>'}
                    </div>
                    <div class="cal-shade" aria-hidden="true"></div>
                    <span class="cal-date">${m.day}</span>
                    <button type="button" class="cal-check${isWatched ? ' watched' : ''}" data-id="${m.id}" data-type="movie" data-title="${this.escapeHtml(m.title)}" data-poster="${this.escapeHtml(m.poster_path || '')}" aria-label="${isWatched ? 'Mark Oct ' + m.day + ' as unwatched' : 'Log Oct ' + m.day + ' as watched'}">✓</button>
                    ${isWatched ? '<div class="halloween-watched-overlay"><span class="halloween-watched-icon">✓</span><span>WATCHED</span></div>' : ''}
                    ${finale ? '<span class="cal-finale">Halloween night</span>' : ''}
                    <div class="cal-meta">
                        <h3 class="cal-title">${this.escapeHtml(m.title)}</h3>
                        <span class="cal-sub">${rating} ★ · ${year}</span>
                    </div>
                </article>
            `;
        }).join('');

        grid.querySelectorAll('.cal-check').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = Number(btn.dataset.id);
                const type = btn.dataset.type;
                const title = btn.dataset.title;
                const poster = btn.dataset.poster;
                const already = btn.classList.contains('watched');
                if (already) {
                    await this.setWatchStatus(id, type, 'want');
                    this.state.history = (this.state.history || []).filter(h => !(String(h.id) === String(id) && h.type === type));
                    this.writeLocalList('alexandria_history', this.state.history);
                    btn.classList.remove('watched');
                    const card = btn.closest('.halloween-card');
                    card.classList.remove('watched');
                    const overlay = card.querySelector('.halloween-watched-overlay');
                    if (overlay) overlay.remove();
                } else {
                    const inLibrary = (this.state.watchlist || []).some(w => String(w.id) === String(id) && w.type === type);
                    if (!inLibrary) {
                        const movie = movies.find(m => String(m.id) === String(id)) || {};
                        await this.toggleWatchlist({ id: String(id), type, title, poster_path: poster, year: String(movie.release_date || '').slice(0, 4), score: Number(movie.vote_average) || 0 });
                    }
                    await this.setWatchStatus(id, type, 'watched');
                    btn.classList.add('watched');
                    const card = btn.closest('.halloween-card');
                    card.classList.add('watched');
                    card.classList.remove('missed');
                    if (!card.querySelector('.halloween-watched-overlay')) {
                        card.insertAdjacentHTML('beforeend', '<div class="halloween-watched-overlay"><span class="halloween-watched-icon">✓</span><span>WATCHED</span></div>');
                    }
                }
                this.updateHalloweenProgress(this.getHalloweenMovies());
            });
        });

        grid.querySelectorAll('.halloween-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.cal-check')) return;
                const id = card.dataset.id;
                const type = card.dataset.type;
                window.location.hash = `#details/${type}/${id}`;
            });
        });
    },

    halloweenWatchedIds() {
        return new Set((this.state.watchlist || []).filter(w => w.type === 'movie' && w.status === 'watched').map(w => String(w.id)));
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

    updateHalloweenProgress() {
        const text = document.querySelector('.halloween-progress-text');
        const fill = document.querySelector('.halloween-progress-fill');
        if (!text || !fill) return;
        const movies = this.getHalloweenMovies();
        const watchedIds = this.halloweenWatchedIds();
        const watched = movies.filter(m => watchedIds.has(String(m.id))).length;
        const total = movies.length || 31;
        text.textContent = `${watched} / ${total} watched`;
        fill.style.width = `${Math.round((watched / total) * 100)}%`;
    },
};
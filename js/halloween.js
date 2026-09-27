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
        try {
            const res = await this.getJson('api/proxy?endpoint=discover/movie&with_genres=27&sort_by=popularity.desc&page=1&include_adult=false&language=en-US');
            if (token !== this._renderToken) return [];
            const all = (res?.results || []).filter(m => m.poster_path && m.release_date);
            const pool = all.slice(0, 62);
            const picked = [];
            const used = new Set();
            for (const m of pool) {
                if (picked.length >= 31) break;
                const key = m.id;
                if (!used.has(key)) {
                    used.add(key);
                    picked.push(m);
                }
            }
            return picked.slice(0, 31).map((m, i) => ({
                id: m.id,
                title: m.title,
                poster_path: m.poster_path,
                release_date: m.release_date,
                vote_average: m.vote_average,
                overview: m.overview,
                day: i + 1,
            }));
        } catch {
            return this.getFallbackHalloweenMovies();
        }
    },

    getFallbackHalloweenMovies() {
        const fallback = [
            { id: 278, title: 'The Shining', poster_path: '/nlh8xAC5puXKfDgv3b4wVXpO6tl.jpg', release_date: '1980-05-23', vote_average: 8.4 },
            { id: 102651, title: 'The Exorcist', poster_path: '/zA6LNA0L6nB7GyK1eAqCB6Ub7Ve.jpg', release_date: '1973-12-26', vote_average: 8.0 },
            { id: 348, title: 'Alien', poster_path: '/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg', release_date: '1979-05-25', vote_average: 8.1 },
            { id: 345, title: 'The Thing', poster_path: '/pWz3xHxVrAqN2m5g6K7n9Lq4tY.jpg', release_date: '1982-06-25', vote_average: 8.2 },
            { id: 177572, title: 'Hereditary', poster_path: '/1k3D37vd5LSaL7ZB39M7IJUR9mZ.jpg', release_date: '2018-06-08', vote_average: 7.3 },
            { id: 490315, title: 'The Witch', poster_path: '/ynDOHbce54D1lFzMji5U5pHg1rF.jpg', release_date: '2015-01-27', vote_average: 7.0 },
            { id: 393731, title: 'Midsommar', poster_path: '/5cD5c2bQxnD4PnH6K1j7Q8n9LrM.jpg', release_date: '2019-07-03', vote_average: 7.1 },
            { id: 157336, title: 'Get Out', poster_path: '/kJz8n7m6Q5w4R3t2Y1u0I9o8P7.jpg', release_date: '2017-02-24', vote_average: 7.7 },
            { id: 274854, title: 'The Conjuring', poster_path: '/fId77VqJrJlX5kV6M7N8B9c0X1Y2.jpg', release_date: '2013-07-19', vote_average: 7.5 },
            { id: 341674, title: 'It Follows', poster_path: '/g8Y9J0K1L2M3N4O5P6Q7R8S9T0.jpg', release_date: '2014-03-14', vote_average: 6.8 },
            { id: 147532, title: 'The Babadook', poster_path: '/aB9C8D7E6F5G4H3I2J1K0L9M8.jpg', release_date: '2014-05-22', vote_average: 6.8 },
            { id: 94871, title: 'The Ring', poster_path: '/zY9X8W7V6U5T4S3R2Q1P0O9N8.jpg', release_date: '2002-10-18', vote_average: 7.1 },
            { id: 419704, title: 'Smile', poster_path: '/1A2B3C4D5E6F7G8H9I0J1K2L3.jpg', release_date: '2022-09-30', vote_average: 6.7 },
            { id: 574, title: 'The Silence of the Lambs', poster_path: '/rplLJ2hPcOQmkFhTqUte0MkEaO2.jpg', release_date: '1991-01-30', vote_average: 8.6 },
            { id: 9804, title: 'Scream', poster_path: '/n0lQ5kV6M7N8B9c0X1Y2Z3A4B5.jpg', release_date: '1996-12-20', vote_average: 7.4 },
            { id: 421, title: 'Psycho', poster_path: '/kGzFkGYs7hP5v8b7n6m5l4k3j2h1.jpg', release_date: '1960-06-16', vote_average: 8.5 },
            { id: 364, title: 'The Texas Chain Saw Massacre', poster_path: '/oK5L4J3H2G1F0E9D8C7B6A5Z4.jpg', release_date: '1974-10-01', vote_average: 7.5 },
            { id: 522, title: 'The Omen', poster_path: '/z9Y8X7W6V5U4T3S2R1Q0P9O8N.jpg', release_date: '1976-06-25', vote_average: 7.4 },
            { id: 12155, title: 'The Descent', poster_path: '/a1B2C3D4E5F6G7H8I9J0K1L2M3.jpg', release_date: '2005-07-08', vote_average: 7.2 },
            { id: 333484, title: 'It', poster_path: '/x9Y8Z7A6B5C4D3E2F1G0H9I8J7.jpg', release_date: '2017-09-08', vote_average: 7.3 },
            { id: 238, title: 'The Godfather', poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', release_date: '1972-03-14', vote_average: 8.7 },
            { id: 414906, title: 'The Batman', poster_path: '/74xTEgt7R36Fpooo50r9T25onhq.jpg', release_date: '2022-03-01', vote_average: 7.8 },
            { id: 475557, title: 'Barbarian', poster_path: '/r5S4T3U2V1W0X9Y8Z7A6B5C4D3.jpg', release_date: '2022-09-09', vote_average: 7.0 },
            { id: 460465, title: 'M3GAN', poster_path: '/7vV8K9J0H1G2F3E4D5C6B7A8N9.jpg', release_date: '2023-01-06', vote_average: 6.7 },
            { id: 76341, title: 'Mad Max: Fury Road', poster_path: '/kNw8L9M0N1B2V3C4X5Z6A7S8D9.jpg', release_date: '2015-05-15', vote_average: 8.1 },
            { id: 299536, title: 'Avengers: Infinity War', poster_path: '/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg', release_date: '2018-04-27', vote_average: 8.4 },
            { id: 155, title: 'The Dark Knight', poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg', release_date: '2008-07-18', vote_average: 9.0 },
            { id: 603, title: 'The Matrix', poster_path: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', release_date: '1999-03-31', vote_average: 8.7 },
            { id: 497, title: 'The Green Mile', poster_path: '/8VG8fDNiy50H4FkW2yOIa4RxOPf.jpg', release_date: '1999-12-10', vote_average: 8.5 },
            { id: 27205, title: 'Inception', poster_path: '/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg', release_date: '2010-07-15', vote_average: 8.8 },
            { id: 122, title: 'The Lord of the Rings', poster_path: '/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg', release_date: '2001-12-19', vote_average: 8.8 },
            { id: 424, title: "Schindler's List", poster_path: '/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg', release_date: '1993-11-30', vote_average: 8.9 },
        ];
        return fallback.slice(0, 31).map((m, i) => ({
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
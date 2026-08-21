export const franchises = {
    async renderFranchises() {
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING FRANCHISE ARCHIVES...</div>';

        const franchises = [
            { name: 'Marvel Cinematic Universe', movieIds: [1726, 1724, 10138, 10195, 1771, 24428, 68721, 76338, 100402, 118340, 99861, 102899, 271110, 284052, 283995, 315635, 284053, 284054, 299536, 363088, 299537, 299534, 429617, 497698, 566525, 524434, 634649, 453395, 616037, 505642, 640146, 447365, 609681, 533535], accent: '#e23636', subtitle: 'The Infinity Saga & Beyond', genre: 'Superhero' },
            { name: 'Transformers', movieIds: [1858, 8373, 38356, 91314, 335988, 424783, 667538, 698687], accent: '#0070f3', subtitle: 'More Than Meets the Eye', genre: 'Action' },
            { name: 'Star Wars', collectionId: 10, accent: '#FFE81F', subtitle: 'A Galaxy Far, Far Away', genre: 'Sci-Fi' },
            { name: 'Harry Potter', collectionId: 1241, accent: '#946B2D', subtitle: 'The Wizarding World', genre: 'Fantasy' },
            { name: 'The Lord of the Rings', collectionId: 119, accent: '#C9A84C', subtitle: 'One Ring to Rule Them All', genre: 'Fantasy' },
            { name: 'DC Extended Universe', movieIds: [49521, 209112, 297761, 297762, 141052, 297802, 287947, 460465, 464052, 791373, 436969, 436270, 594767, 298618, 565770, 572802], accent: '#0078D7', subtitle: 'Gods Among Us', genre: 'Superhero' },
            { name: 'The Walking Dead Universe', tvIds: [1402, 62286, 94305, 194583, 211684, 206586], accent: '#4a7c3f', subtitle: 'Fight the Dead. Fear the Living.', isTv: true, genre: 'Horror' },
            { name: 'Fast & Furious', collectionId: 9485, accent: '#FF6B00', subtitle: 'Family. No Matter What.', genre: 'Action' },
            { name: 'Jurassic Park', collectionId: 328, accent: '#2E8B57', subtitle: 'Life Finds a Way', genre: 'Sci-Fi' },
            { name: 'The Hunger Games', collectionId: 131635, accent: '#C4151C', subtitle: 'May The Odds Be Ever In Your Favor', genre: 'Sci-Fi' },
            { name: 'Pirates of the Caribbean', collectionId: 295, accent: '#8B6914', subtitle: 'Not All Treasure Is Silver and Gold', genre: 'Adventure' },
            { name: 'The Conjuring Universe', collectionId: 313086, accent: '#7a1f1f', subtitle: 'Based on the True Case Files of the Warrens', genre: 'Horror' },
            { name: 'Saw', collectionId: 656, accent: '#8d9aa6', subtitle: 'Live or Die, Make Your Choice', genre: 'Horror' },
            { name: 'Scream', collectionId: 2602, accent: '#ff1744', subtitle: "What's Your Favorite Scary Movie?", genre: 'Horror' },
            { name: 'Halloween', collectionId: 91361, accent: '#ff8f00', subtitle: 'The Night He Came Home', genre: 'Horror' },
            { name: 'Friday the 13th', collectionId: 9735, accent: '#1b5e20', subtitle: 'Welcome to Crystal Lake', genre: 'Horror' },
            { name: 'A Nightmare on Elm Street', collectionId: 8581, accent: '#8e24aa', subtitle: "One, Two, Freddy's Coming for You", genre: 'Horror' },
            { name: 'The Evil Dead', collectionId: 1960, accent: '#795548', subtitle: 'Dead by Dawn', genre: 'Horror' },
            { name: 'Alien', collectionId: 8091, accent: '#00c853', subtitle: 'In Space No One Can Hear You Scream', genre: 'Sci-Fi' },
            { name: 'Predator', collectionId: 399, accent: '#ffb300', subtitle: 'If It Bleeds, We Can Kill It', genre: 'Sci-Fi' },
            { name: 'Final Destination', collectionId: 8864, accent: '#546e7a', subtitle: "You Can't Cheat Death", genre: 'Horror' },
            { name: 'Paranormal Activity', collectionId: 41437, accent: '#283593', subtitle: 'What Happens When You Sleep?', genre: 'Horror' },
            { name: 'Insidious', collectionId: 228446, accent: '#d32f2f', subtitle: "It's Not the House That's Haunted", genre: 'Horror' },
            { name: 'The Matrix', collectionId: 2344, accent: '#00e676', subtitle: 'There Is No Spoon', genre: 'Sci-Fi' },
            { name: 'Mission: Impossible', collectionId: 87359, accent: '#1e88e5', subtitle: 'Your Mission, Should You Choose to Accept It', genre: 'Action' },
            // --- added with the genre/sort pass ---
            { name: 'John Wick', collectionId: 404609, accent: '#e5c27e', subtitle: 'With Pencil. With a Fucking Pencil.', genre: 'Action' },
            { name: 'James Bond', collectionId: 645, accent: '#aeb6bf', subtitle: 'Licensed to Kill', genre: 'Action' },
            { name: 'Indiana Jones', collectionId: 84, accent: '#8b5a2b', subtitle: 'Snakes. Why Did It Have to Be Snakes?', genre: 'Adventure' },
            { name: 'Dune', collectionId: 726871, accent: '#d4a33c', subtitle: 'Fear Is the Mind-Killer', genre: 'Sci-Fi' },
            { name: 'Mad Max', collectionId: 8945, accent: '#e0662e', subtitle: 'Witness Me!', genre: 'Action' },
            { name: 'Breaking Bad Universe', tvIds: [1396, 60059], accent: '#1b7f3a', subtitle: 'I Am the One Who Knocks', isTv: true, genre: 'Crime' },
            { name: 'The Witcher', tvIds: [71912, 106541], accent: '#8e6b3f', subtitle: 'Toss a Coin to Your Witcher', isTv: true, genre: 'Fantasy' },
            { name: 'The Boys', tvIds: [76479, 205715], accent: '#4a4a6a', subtitle: 'Fuck the Seven. Fuck Homelander.', isTv: true, genre: 'Superhero' }
        ];

        try {
            const FRANCHISE_CACHE_KEY = 'alexandria_franchise_cache_v5';
            let cached = null;
            try {
                cached = this.readStorageJson(sessionStorage, FRANCHISE_CACHE_KEY, null);
            } catch {
                cached = null;
            }

            const fetchCollection = async (franchise) => {
                if (franchise.tvIds || franchise.isTv) {
                    const results = await this.mapWithConcurrency(franchise.tvIds || [], 6, async (id) => {
                        try {
                            const data = await this.getJson('tv/' + id);
                            return { ...data, media_type: 'tv' };
                        } catch { return null; }
                    });
                    return { ...franchise, items: results.filter(Boolean) };
                }
                if (franchise.movieIds) {
                    const results = await this.mapWithConcurrency(franchise.movieIds, 6, async (id) => {
                        try {
                            const data = await this.getJson('movie/' + id);
                            return { ...data, media_type: 'movie' };
                        } catch { return null; }
                    });
                    const sorted = results.filter(Boolean).sort(
                        (a, b) => new Date(a.release_date || '9999') - new Date(b.release_date || '9999')
                    );
                    return { ...franchise, items: sorted };
                }
                try {
                    const data = await this.getJson('collection/' + franchise.collectionId);
                    const sorted = (data.parts || []).sort(
                        (a, b) => new Date(a.release_date || '9999') - new Date(b.release_date || '9999')
                    );
                    return { ...franchise, items: sorted };
                } catch {
                    return { ...franchise, items: [] };
                }
            };

            const results = (cached?.at && Date.now() - cached.at < 15 * 60 * 1000 && Array.isArray(cached.results) && cached.results.length)
                ? cached.results
                : await Promise.all(franchises.map(fetchCollection));

            if (!(cached?.at && Date.now() - cached.at < 15 * 60 * 1000 && Array.isArray(cached.results) && cached.results.length)) {
                try {
                    sessionStorage.setItem(FRANCHISE_CACHE_KEY, JSON.stringify({ at: Date.now(), results }));
                } catch { /* quota */ }
            }

            if (token !== this._renderToken) return;
            if (!results.some(franchise => franchise.items.length)) {
                throw new Error('No franchise collections were returned.');
            }

            this.state.franchiseResults = results;
            this.renderFranchiseGrid(results);
        } catch (error) {
            console.error("Alexandria: Franchise Archive Load Failed -", error);
            if (token === this._renderToken) this.renderError('Franchise archives are unavailable', error.message, 'franchises');
        }
    },

    renderFranchiseGrid(results) {
        const genre = this.state.franchiseGenre || 'All';
        const sort = this.state.franchiseSort || 'az';
        const query = (this.state.franchiseSearch || '').toLowerCase();
        const genres = ['All'].concat([...new Set(results.filter(f => f.items.length && f.genre).map(f => f.genre))]);
        let visible = results.filter(f => f.items.length && (genre === 'All' || f.genre === genre));
        if (query) visible = visible.filter(f => f.name.toLowerCase().includes(query));
        const sortTiles = (list) => {
            list.sort((a, b) => a.name.localeCompare(b.name));
            if (sort === 'za') list.reverse();
            else if (sort === 'count') list.sort((a, b) => b.items.length - a.items.length);
            return list;
        };
        // Stable per-franchise index so panel/deck ids stay unique across genre groups.
        const indexOf = new Map(visible.map((f, i) => [f, i]));
        const tileHtml = (f) => {
            const i = indexOf.get(f);
            if (!f.items.length) return '';
            const poster = this.imageUrl(f.items[0].poster_path, 'w342');
            const safeName = this.escapeHtml(f.name);
            return `
                    <article class="franchise-tile">
                        <div class="franchise-tile-cover">
                            <button class="franchise-tile-toggle" type="button" aria-expanded="false" aria-controls="franchise-panel-${i}" onclick="Alexandria.toggleFranchise(this)">
                                ${poster ? `<img class="franchise-tile-poster" src="${poster}" alt="${safeName}" loading="lazy" decoding="async">` : `<div class="franchise-tile-placeholder" aria-hidden="true"><span>A</span></div>`}
                                <span class="franchise-tile-scrim" aria-hidden="true"></span>
                                <span class="franchise-tile-count">${f.items.length}</span>
                                ${f.genre ? `<span class="franchise-tile-genre">${this.escapeHtml(f.genre)}</span>` : ''}
                                <span class="franchise-tile-name">${safeName}</span>
                            </button>
                            <button class="franchise-tile-arrow" type="button" aria-expanded="false" aria-label="Expand ${safeName}" onclick="Alexandria.toggleFranchise(this)">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        </div>
                        <div class="franchise-tile-panel" id="franchise-panel-${i}">
                            <div class="franchise-panel-header">
                                <span class="franchise-panel-bar" style="background:${f.accent}" aria-hidden="true"></span>
                                <span class="franchise-panel-name">${safeName}</span>
                                <span class="franchise-panel-quote">&ldquo;${this.escapeHtml(f.subtitle)}&rdquo;</span>
                                <button class="franchise-panel-close" type="button" aria-label="Collapse ${safeName}" onclick="Alexandria.toggleFranchise(this)">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                            <div class="franchise-deck-wrap">
                                <button class="carousel-arrow left" type="button" aria-label="Scroll ${safeName} titles left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button>
                                <div class="franchise-deck">
                                    <div class="franchise-deck-scroller">
                                        <div class="franchise-deck-first" id="franchise-first-${i}"></div>
                                        <div class="franchise-deck-rest" id="franchise-rest-${i}"></div>
                                    </div>
                                </div>
                                <button class="carousel-arrow right" type="button" aria-label="Scroll ${safeName} titles right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button>
                            </div>
                        </div>
                    </article>`;
        };
        // Browsing everything: group tiles under genre headings so the archive
        // reads like a table of contents; a genre filter shows one flat grid.
        const groups = [];
        if (genre === 'All') {
            genres.slice(1).forEach(g => {
                const list = sortTiles(visible.filter(f => f.genre === g));
                if (list.length) groups.push([g, list]);
            });
            if (sort === 'count') {
                groups.sort((a, b) =>
                    b[1].reduce((s, f) => s + f.items.length, 0) - a[1].reduce((s, f) => s + f.items.length, 0));
            } else if (sort === 'za') {
                groups.reverse();
            }
        } else {
            groups.push([null, sortTiles(visible)]);
        }

        this.main.innerHTML = `
                <section class="filtered-view franchise-section">
                    <div class="franchise-page-header">
                        <h2>FRANCHISE ARCHIVES</h2>
                        <p style="color:var(--text-muted);font-family:var(--font-display);letter-spacing:2px">CINEMATIC UNIVERSES & LEGENDARY SAGAS</p>
                    </div>
                    <div class="franchise-toolbar">
                        <div class="franchise-chips" role="group" aria-label="Filter franchises by genre">
                            ${genres.map(g => `<button type="button" class="franchise-chip${g === genre ? ' active' : ''}" onclick="Alexandria.setFranchiseGenre('${this.escapeHtml(g)}')">${this.escapeHtml(g)}</button>`).join('')}
                        </div>
                        <input type="search" class="franchise-search" placeholder="Search franchises..." aria-label="Search franchises" value="${this.escapeHtml(this.state.franchiseSearch || '')}" oninput="Alexandria.setFranchiseSearch(this.value)">
                        <label class="franchise-sort">
                            <span class="sr-only">Sort franchises</span>
                            <select onchange="Alexandria.setFranchiseSort(this.value)">
                                <option value="az"${sort === 'az' ? ' selected' : ''}>A &rarr; Z</option>
                                <option value="za"${sort === 'za' ? ' selected' : ''}>Z &rarr; A</option>
                                <option value="count"${sort === 'count' ? ' selected' : ''}>Most Titles</option>
                            </select>
                        </label>
                    </div>
                    ${visible.length === 0 ? '<div class="profile-empty">No franchises match that search.</div>' : groups.map(([g, list]) => `
                    ${g ? `<h3 class="franchise-group-heading">${this.escapeHtml(g)}<span>${list.length} ${list.length === 1 ? 'UNIVERSE' : 'UNIVERSES'}</span></h3>` : ''}
                    <div class="franchise-grid">
                    ${list.map(tileHtml).join('')}
                    </div>`).join('')}
                </section>`;

        visible.forEach((f, i) => {
            if (f.items.length > 0) {
                this.renderResults([f.items[0]], `franchise-first-${i}`);
                if (f.items.length > 1) {
                    this.renderResults(f.items.slice(1), `franchise-rest-${i}`);
                }
            }
        });
    },

    setFranchiseSearch(value) {
        this.state.franchiseSearch = value;
        if (this.state.franchiseResults) this.renderFranchiseGrid(this.state.franchiseResults);
    },

    setFranchiseGenre(genre) {
        // Clicking the active chip again clears the filter back to All.
        this.state.franchiseGenre = this.state.franchiseGenre === genre ? 'All' : genre;
        if (this.state.franchiseResults) this.renderFranchiseGrid(this.state.franchiseResults);
    },

    setFranchiseSort(value) {
        this.state.franchiseSort = value;
        if (this.state.franchiseResults) this.renderFranchiseGrid(this.state.franchiseResults);
    },

    toggleFranchise(btn) {
        const tile = btn.closest('.franchise-tile');
        if (!tile) return;
        // Clicking the already-open tile collapses it.
        if (tile.classList.contains('open')) {
            this.setFranchiseOpen(tile, false);
            return;
        }
        // Enforce a cap so the grid never gets visually cluttered: close the
        // oldest-open tiles to make room before expanding the new one.
        const openTiles = Array.from(tile.closest('.franchise-section').querySelectorAll('.franchise-tile.open'));
        const MAX_OPEN = 2;
        while (openTiles.length >= MAX_OPEN) {
            this.setFranchiseOpen(openTiles.shift(), false);
        }
        this.setFranchiseOpen(tile, true);
    },
    setFranchiseOpen(tile, open) {
        tile.classList.toggle('open', open);
        // Pull the expanded tile to the top row; cleared when it collapses.
        tile.style.order = open ? '-1' : '';
        tile.querySelectorAll('[aria-expanded]').forEach(el => el.setAttribute('aria-expanded', String(open)));
        const rest = tile.querySelector('.franchise-deck-rest');
        if (rest) {
            // Measure the natural width of the hidden cards so the slide-out is
            // smooth and exact for any franchise size.
            rest.style.width = open ? `${rest.scrollWidth}px` : '0px';
        }
    },


};

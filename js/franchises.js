import { FALLBACK_FRANCHISES } from './franchise-data.js';

export const franchises = {
    // Franchise definitions live in the public.franchises table (editable
    // without a deploy). The bundled FALLBACK_FRANCHISES keep the archive
    // alive when Supabase is unreachable.
    async loadFranchiseDefs() {
        try {
            if (this.supabase) {
                const { data, error } = await this.supabase
                    .from('franchises')
                    .select('name, subtitle, genre, accent, collection_id, movie_ids, tv_ids')
                    .order('sort_order');
                if (!error && Array.isArray(data) && data.length) {
                    return data.map(row => ({
                        name: row.name,
                        collectionId: row.collection_id ?? null,
                        movieIds: Array.isArray(row.movie_ids) && row.movie_ids.length ? row.movie_ids : null,
                        tvIds: Array.isArray(row.tv_ids) && row.tv_ids.length ? row.tv_ids : null,
                        isTv: Array.isArray(row.tv_ids) && row.tv_ids.length > 0,
                        accent: row.accent || '#8a0303',
                        subtitle: row.subtitle || '',
                        genre: row.genre || ''
                    }));
                }
            }
        } catch { /* fall through to bundled data */ }
        return FALLBACK_FRANCHISES.map(f => ({ ...f }));
    },

    async renderFranchises() {
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg"><span class="pulse-dot"></span> LOADING FRANCHISE ARCHIVES...</div>';

        const franchises = await this.loadFranchiseDefs();

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

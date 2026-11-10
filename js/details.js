const PERSON_CREDITS_PAGE_SIZE = 24;

function collectPersonCredits(data) {
    const credits = new Map();
    const add = (credit, role) => {
        if (!credit || !['movie', 'tv'].includes(credit.media_type) || !Number.isInteger(Number(credit.id)) || Number(credit.id) < 1) return;
        const key = `${credit.media_type}:${credit.id}`;
        if (!credits.has(key)) credits.set(key, { ...credit, roles: new Set(), jobs: new Set() });
        const item = credits.get(key);
        item.roles.add(role);
        if (role === 'acting') item.jobs.add('Acting');
        else if (credit.job) item.jobs.add(credit.job);
        if (!item.poster_path && credit.poster_path) item.poster_path = credit.poster_path;
    };
    for (const credit of data.combined_credits?.cast || []) add(credit, 'acting');
    for (const credit of data.combined_credits?.crew || []) add(credit, credit.job === 'Director' ? 'directing' : 'other');
    return [...credits.values()].sort((a, b) => {
        const dateA = a.release_date || a.first_air_date || '';
        const dateB = b.release_date || b.first_air_date || '';
        return dateB.localeCompare(dateA) || (a.title || a.name || '').localeCompare(b.title || b.name || '');
    });
}

function personKnownFor(data, curatedDirector) {
    const cast = data.combined_credits?.cast || [];
    const crew = data.combined_credits?.crew || [];
    const director = curatedDirector || data.known_for_department === 'Directing';
    const department = data.known_for_department;
    const primary = director ? crew.filter(c => c?.job === 'Director')
        : department === 'Acting' ? cast
        : crew.filter(c => c?.department === department);
    const fallback = director ? [] : [...cast, ...crew];
    const today = new Date().toISOString().slice(0, 10);
    const seen = new Set();
    const select = candidates => candidates.filter(c => {
        if (!c || !['movie', 'tv'].includes(c.media_type)
            || !['number', 'string'].includes(typeof c.id)
            || (typeof c.id === 'string' && !/^\d+$/.test(c.id))
            || !Number.isSafeInteger(Number(c.id)) || Number(c.id) < 1
            || typeof c.poster_path !== 'string' || !c.poster_path.trim()) return false;
        const date = c.media_type === 'movie' ? c.release_date : c.first_air_date;
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return false;
        const released = new Date(`${date}T00:00:00Z`);
        const character = c.character || '';
        // Round-trip dates because Date normalizes impossible days (e.g. February 30).
        // Credits expose explicit appearance labels, not a reliable universal cameo flag.
        return Number.isFinite(released.getTime()) && released.toISOString().slice(0, 10) === date
            && !(Array.isArray(c.genre_ids) && c.genre_ids.some(id => Number(id) === 10767))
            && !/\b(?:self|himself|herself|themselves|archive[\s-]+footage|cameos?|uncredited|guest[\s-]+appearances?)\b/i.test(character);
    }).sort((a, b) => (Number(b.vote_count) || 0) - (Number(a.vote_count) || 0)
        || (Number(b.popularity) || 0) - (Number(a.popularity) || 0));
    return [...select(primary), ...select(fallback)].filter(c => {
        const key = `${c.media_type}:${Number(c.id)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 12);
}

export const details = {
    async renderDetails() {
        const { id, type } = this.state.activeContent;
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg">DECRYPTING ARCHIVE...</div>';
        
        try {
            const endpoint = `${type}/${id}?append_to_response=credits,aggregate_credits,similar,recommendations,videos`;
            const data = await this.getJson(endpoint);
            if (token !== this._renderToken) return;
            
            const title = data.title || data.name;
            this.state.detailsTitle = title;
            this.state.detailsPoster = data.poster_path;
            const year = (data.release_date || data.first_air_date || '').split('-')[0];
            const runtime = data.runtime ? `${Math.floor(data.runtime/60)}h ${data.runtime%60}m` : (data.episode_run_time?.[0] ? `${data.episode_run_time[0]}m` : '');
            const tmdbScore = data.vote_average ? data.vote_average.toFixed(1) : null;
            const genres = (data.genres || []).map(g => g.name).join(' • ');
            const backdrop = this.imageUrl(data.backdrop_path, 'original');
            const poster = this.imageUrl(data.poster_path);
            
            const inWatchlist = this.state.watchlist.some(i => String(i.id) === String(id) && i.type === type);
            const wlEntry = this.state.watchlist.find(i => String(i.id) === String(id) && i.type === type);
            const wlStatus = wlEntry ? (wlEntry.status || 'want') : 'want';

            const trailer = data.videos?.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer' && /^[\w-]{6,20}$/.test(v.key));

            let imdbBadge = '';
            if (data.imdb_id && /^tt\d{5,12}$/.test(data.imdb_id)) {
                try {
                    const omdb = await fetch('/api/omdb?i=' + encodeURIComponent(data.imdb_id)).then(r => r.json());
                    if (omdb && omdb.Response === 'True' && omdb.imdbRating) {
                        imdbBadge = `<span class="avg-badge" title="IMDb rating">IMDb ${this.escapeHtml(omdb.imdbRating)}</span>`;
                    }
                } catch (e) { /* OMDb down or unconfigured, badge just stays hidden */ }
                if (token !== this._renderToken) return;
            }

            // Curate similar titles: merge both TMDB signals (recommendations
            // is behavior-based and better than the keyword-overlap similar
            // list), exclude the current title, drop poster-less entries and
            // wrong media types, then rerank by genre overlap and release-year
            // proximity so the picks actually feel related. If the pool is too
            // weak, fall back to a genre-based discovery scan.
            const genreIds = new Set((data.genres || []).map(g => Number(g.id)));
            const titleYear = Number((data.release_date || data.first_air_date || '').slice(0, 4));
            const simScore = item => {
                const shared = (item.genre_ids || []).filter(g => genreIds.has(Number(g))).length;
                const itemYear = Number((item.release_date || item.first_air_date || '').slice(0, 4));
                const delta = itemYear ? Math.abs(itemYear - titleYear) : 99;
                return shared * 3 + (delta === 0 ? 2 : delta <= 2 ? 1 : 0);
            };
            const rawPool = [...(data.recommendations?.results || []), ...(data.similar?.results || [])];
            const seen = new Set();
            let similarItems = rawPool
                .filter(i => i && Number(i.id) !== Number(id) && i.poster_path
                    && (!i.media_type || i.media_type === type))
                .filter(i => seen.has(String(i.id)) ? false : (seen.add(String(i.id)), true))
                .map(item => ({ item, score: simScore(item) }))
                .sort((a, b) => (b.score - a.score) || ((b.item.vote_count || 0) - (a.item.vote_count || 0)))
                .map(x => x.item)
                .slice(0, 20);
            let similarHeading = 'SIMILAR TITLES';
            if (similarItems.length < 6 && data.genres?.length) {
                const genreDiscover = await this.getJson(
                    `discover/${type}?with_genres=${data.genres[0].id}&sort_by=popularity.desc`
                ).catch(() => ({ results: [] }));
                if (token !== this._renderToken) return;
                similarItems = (genreDiscover.results || [])
                    .filter(i => i && Number(i.id) !== Number(id) && i.poster_path)
                    .slice(0, 20);
                similarHeading = 'MORE LIKE THIS';
            }
            
            const castData = data.credits?.cast?.length ? data.credits.cast : (data.aggregate_credits?.cast || []);
            const castHtml = castData.slice(0, 15).map(c => `
                <article class="cast-card" role="link" tabindex="0" onclick="window.location.hash = '#person/${Number(c.id)}'" aria-label="View ${this.escapeHtml(c.name)}">
                    ${this.imageUrl(c.profile_path, 'w185') ? `<img src="${this.imageUrl(c.profile_path, 'w185')}" alt="${this.escapeHtml(c.name)}" loading="lazy" decoding="async">` : '<div class="cast-placeholder" aria-hidden="true">A</div>'}
                    <div class="cast-info">
                        <div class="cast-name">${this.escapeHtml(c.name)}</div>
                        <div class="cast-role">${this.escapeHtml(c.character || c.roles?.[0]?.character || 'Cast')}</div>
                    </div>
                </article>
            `).join('') || '<div class="placeholder-msg">NO CAST DATA</div>';

            this.main.innerHTML = `
                <section class="details-layout">
                    <div class="hero-details" style="--details-image: url('${backdrop}')">
                        <div class="details-content-wrapper">
                            <div class="details-poster">${poster ? `<img src="${poster}" alt="${this.escapeHtml(title)} poster">` : '<div class="poster-placeholder detail-placeholder"><span>A</span><small>NO POSTER</small></div>'}</div>
                            <div class="details-info">
                                <h1>${this.escapeHtml(title)} ${year ? `<span class="year-span">(${this.escapeHtml(year)})</span>` : ''}</h1>
                                <div class="details-meta">
                                    ${this.ratingsHtml(tmdbScore)}
                                    ${imdbBadge}
                                    <span class="avg-badge" id="details-avg-badge" hidden></span>
                                    <span class="dub-badge" id="details-dub-badge" hidden></span>
                                    ${runtime ? `<span>${this.escapeHtml(runtime)}</span>` : ''}
                                    ${genres ? `<span>${this.escapeHtml(genres)}</span>` : ''}
                                </div>
                                <p class="details-overview">${this.escapeHtml(data.overview || 'No overview is available yet.')}</p>
                                <div class="details-actions">
                                    <button class="btn-primary btn-play" onclick="Alexandria.playContent(${id}, '${type}')">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> WATCH NOW
                                    </button>
                                    <button class="btn-secondary" onclick="Alexandria.createWatchParty(${id}, '${type}')">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> WATCH PARTY
                                    </button>
                                    <button class="btn-quiet" type="button" data-share-title="${this.escapeHtml(title)}" onclick="Alexandria.shareCurrent(this.dataset.shareTitle)">SHARE</button>
                                    <button class="btn-gold" type="button" onclick="Alexandria.addToListModal(${Number(id)}, '${type}')">ADD TO LIST</button>
                                    <button class="icon-btn log-btn ${inWatchlist ? 'active' : ''}" type="button" aria-label="${inWatchlist ? 'Remove from' : 'Add to'} watchlist" aria-pressed="${inWatchlist}" data-id="${Number(id)}" data-type="${type}" data-title="${this.escapeHtml(title)}" data-poster="${this.escapeHtml(data.poster_path || '')}" data-year="${this.escapeHtml(year || '')}" data-score="${Number(tmdbScore) || 0}">
                                        ${inWatchlist ? '✓' : '+'}
                                    </button>
                                    ${inWatchlist ? `
                                    <button id="watch-status-btn" class="btn-gold" type="button" onclick="Alexandria.setWatchStatus(${id}, '${type}', '${wlStatus === 'watched' ? 'want' : 'watched'}')">${wlStatus === 'watched' ? 'BACK TO QUEUE' : wlStatus === 'watching' ? 'MARK COMPLETE' : 'MARK WATCHED'}</button>
                                    ` : ''}
                                </div>
                                ${this.detailsTakeHtml(id, type, wlEntry, Number(tmdbScore) || 0)}
                            </div>
                        </div>
                    </div>
                    
                    <div class="view-section">
                        <h3>TOP CAST</h3>
                        <div class="carousel-container">
                            <button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button>
                            <div class="carousel-wrapper"><div class="cast-grid">${castHtml}</div></div>
                            <button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button>
                        </div>
                    </div>

                    ${trailer ? `
                    <div class="view-section details-trailer-section">
                        <h3>OFFICIAL TRAILER</h3>
                        <div class="trailer-container">
                            <iframe src="https://www.youtube-nocookie.com/embed/${trailer.key}?controls=1&modestbranding=1&rel=0" title="${this.escapeHtml(title)} official trailer" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-fullscreen"></iframe>
                        </div>
                    </div>` : ''}

                    ${similarItems.length ? `
                    <div class="view-section">
                        <h3>${similarHeading}</h3>
                        <div class="carousel-container">
                            <button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button>
                            <div class="carousel-wrapper"><div class="carousel-grid" id="similar-results"></div></div>
                            <button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button>
                        </div>
                    </div>` : ''}

                    <section id="community-section"></section>
                </section>
            `;
            
            if (similarItems.length) {
                similarItems.forEach(item => {
                    if (!item.media_type) item.media_type = type;
                });
                this.renderResults(similarItems, 'similar-results');
            }
            this.renderCommunitySection(type, id);

            // Anime dub/sub availability — probe is Japanese-animation gated,
            // resolved through the cached /api/anime bridge.
            const isJaAnime = (data.genres || []).some(g => Number(g.id) === 16)
                && data.original_language === 'ja';
            if (isJaAnime && type === 'tv') {
                const badgeEl = document.getElementById('details-dub-badge');
                if (badgeEl) {
                    badgeEl.hidden = false;
                    badgeEl.textContent = 'ANIME';
                    badgeEl.classList.add('dub-unknown');
                }
                this.resolveAnime(Number(id)).then(info => {
                    if (token !== this._renderToken) return;
                    const b = document.getElementById('details-dub-badge');
                    if (!b) return;
                    if (info.dubAvailable === true) {
                        b.textContent = 'DUB AVAILABLE';
                        b.classList.remove('dub-unknown');
                    } else if (info.dubAvailable === false) {
                        b.textContent = 'SUB ONLY';
                    } else {
                        b.textContent = 'ANIME';
                    }
                }).catch(() => {
                    if (token !== this._renderToken) return;
                    const b = document.getElementById('details-dub-badge');
                    if (b) b.hidden = true;
                });
            }
        } catch(e) {
            console.error("Alexandria Protocol: Details Render Failed", e);
            if (token === this._renderToken) this.renderError('This title could not be decrypted', e.message, 'details');
        }
    },

    async renderPerson() {
        const { id } = this.state.activeContent;
        const token = this._renderToken;
        this.main.innerHTML = '<div class="placeholder-msg">LOCATING DOSSIER...</div>';
        
        try {
            const endpoint = `person/${id}?append_to_response=combined_credits,external_ids`;
            const data = await this.getJson(endpoint);
            if (token !== this._renderToken) return;

            // Curated directors get a focused, tabbed dossier.
            // The lookup resolves to null for everyone else, so actor pages are unchanged.
            let directorEditorial = null;
            let curatedDirector = null;
            if (typeof this.getCuratedDirector === 'function') {
                const curated = await this.getCuratedDirector(id);
                if (token !== this._renderToken) return;
                if (curated) {
                    curatedDirector = curated;
                    directorEditorial = await this.buildDirectorEditorial(data, curated);
                }
            }
            if (token !== this._renderToken) return;
            
            const photo = this.imageUrl(data.profile_path, 'h632');

            // Calculate age
            let ageStr = '';
            if (data.birthday) {
                const birth = new Date(data.birthday);
                const end = data.deathday ? new Date(data.deathday) : new Date();
                let age = end.getFullYear() - birth.getFullYear();
                const m = end.getMonth() - birth.getMonth();
                if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age--;
                ageStr = data.deathday ? `Died: ${this.escapeHtml(data.deathday)} (age ${age})` : `Age: ${age}`;
            }

            // Build bio with expand/collapse for long bios
            const rawBio = data.biography || '';
            const bioHtml = this.escapeHtml(rawBio).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
            const longBio = rawBio.length > 600;
            const bioSection = directorEditorial
                ? `<details class="director-biography"><summary>Biography</summary><div class="person-bio">${bioHtml || 'No biography available.'}</div></details>`
                : longBio
                ? `<div class="person-bio person-bio-collapsed" id="person-bio">${bioHtml}</div>
                   <button class="bio-toggle" id="bio-toggle" onclick="Alexandria.toggleBio()">Read More</button>`
                : `<div class="person-bio">${bioHtml || 'No biography available.'}</div>`;

            const knownFor = personKnownFor(data, Boolean(directorEditorial));
            const credits = collectPersonCredits(data);
            const primaryRole = (Boolean(directorEditorial) || data.known_for_department === 'Directing') ? 'directing'
                : data.known_for_department === 'Acting' ? 'acting' : 'all';
            this._personCredits = { items: credits, media: 'movie', role: primaryRole, limit: PERSON_CREDITS_PAGE_SIZE };

            const knownForHtml = knownFor.length ? `
                <div class="view-section director-known-for">
                    <h3>${directorEditorial ? 'Known for' : 'KNOWN FOR'}</h3>
                    <div class="carousel-container">
                        <button class="carousel-arrow left" aria-label="Previous known titles" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button>
                        <div class="carousel-wrapper"><div class="carousel-grid" id="person-known-for"></div></div>
                        <button class="carousel-arrow right" aria-label="Next known titles" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button>
                    </div>
                </div>` : '';
            const filmographyHtml = credits.length ? `
                <section class="person-credits-section person-filmography" aria-labelledby="person-credits-heading">
                    <div class="person-filmography-heading">
                        <div><h2 id="person-credits-heading">Filmography</h2><p>${directorEditorial ? 'Directed films first. Explore every credit.' : 'Explore the complete credits from TMDB.'}</p></div>
                        <span id="person-credits-count" class="person-credits-count" aria-live="polite"></span>
                    </div>
                    <div class="person-credit-controls">
                        <div class="person-credit-tabs" role="group" aria-label="Filter credits by format">
                            <button type="button" data-credit-media="movie" onclick="Alexandria.filterPersonCredits('media', 'movie')">Movies</button>
                            <button type="button" data-credit-media="tv" onclick="Alexandria.filterPersonCredits('media', 'tv')">TV</button>
                            <button type="button" data-credit-media="all" onclick="Alexandria.filterPersonCredits('media', 'all')">All</button>
                        </div>
                        ${directorEditorial ? `
                        <label class="director-role-filter" for="person-credit-role">Role
                            <select id="person-credit-role" onchange="Alexandria.filterPersonCredits('role', this.value)">
                                <option value="directing">Directing</option>
                                <option value="acting">Acting</option>
                                <option value="other">Other work</option>
                                <option value="all">All roles</option>
                            </select>
                        </label>` : `
                        <div class="person-credit-roles" role="group" aria-label="Filter credits by role">
                            <button type="button" data-credit-role="all" onclick="Alexandria.filterPersonCredits('role', 'all')">All roles</button>
                            <button type="button" data-credit-role="acting" onclick="Alexandria.filterPersonCredits('role', 'acting')">Acting</button>
                            <button type="button" data-credit-role="directing" onclick="Alexandria.filterPersonCredits('role', 'directing')">Directing</button>
                            <button type="button" data-credit-role="other" onclick="Alexandria.filterPersonCredits('role', 'other')">Other work</button>
                        </div>`}
                    </div>
                    <div class="person-credits-grid" id="person-filmography-results"></div>
                    <p class="person-credits-empty" id="person-credits-empty" hidden>No credits in this category.</p>
                    <div class="person-credits-more"><button type="button" id="person-credits-more" onclick="Alexandria.showMorePersonCredits()" hidden>Show more</button></div>
                </section>` : '<p class="person-credits-empty">No credits are available yet.</p>';

            this.main.innerHTML = `
                <section class="person-layout${directorEditorial ? ' director-person' : ''}">
                    ${directorEditorial ? '<a class="director-back" href="#directors">Back to directors</a>' : ''}
                    <div class="person-header">
                        ${photo ? `<img src="${photo}" alt="${this.escapeHtml(data.name)}" class="person-photo">` : '<div class="person-photo person-placeholder" aria-hidden="true">A</div>'}
                        <div class="person-info">
                            <h1>${this.escapeHtml(data.name)}</h1>
                            ${curatedDirector?.tagline ? `<p class="director-person-tagline">${this.escapeHtml(curatedDirector.tagline)}</p>` : ''}
                            <div class="person-meta">
                                <span>${this.escapeHtml(data.known_for_department || '')}</span>
                                ${data.birthday ? `<span>Born: ${this.escapeHtml(data.birthday)}</span>` : ''}
                                ${ageStr ? `<span>${ageStr}</span>` : ''}
                                ${data.place_of_birth ? `<span>${this.escapeHtml(data.place_of_birth)}</span>` : ''}
                            </div>
                            ${bioSection}
                        </div>
                    </div>
                    
                    ${directorEditorial ? `
                    <div class="director-tabs" role="tablist" aria-label="Director dossier">
                        <button type="button" role="tab" id="director-tab-films" aria-controls="director-panel-films" aria-selected="true" tabindex="0" data-director-tab="films">Films</button>
                        <button type="button" role="tab" id="director-tab-highlights" aria-controls="director-panel-highlights" aria-selected="false" tabindex="-1" data-director-tab="highlights">Highlights</button>
                        <button type="button" role="tab" id="director-tab-craft" aria-controls="director-panel-craft" aria-selected="false" tabindex="-1" data-director-tab="craft">Style &amp; craft</button>
                    </div>
                    <div class="director-panel" id="director-panel-films" role="tabpanel" aria-labelledby="director-tab-films" tabindex="0">${filmographyHtml}</div>
                    <div class="director-panel" id="director-panel-highlights" role="tabpanel" aria-labelledby="director-tab-highlights" tabindex="0" hidden>${knownForHtml}${directorEditorial.highlightsHtml}</div>
                    <div class="director-panel" id="director-panel-craft" role="tabpanel" aria-labelledby="director-tab-craft" tabindex="0" hidden>${directorEditorial.craftHtml}</div>` : `${knownForHtml}${credits.length ? filmographyHtml : ''}`}
                </section>
            `;
            
            if (knownFor.length) this.renderResults(knownFor, 'person-known-for');
            if (credits.length) this.renderPersonCredits();
            if (directorEditorial) {
                const tabs = [...this.main.querySelectorAll('[data-director-tab]')];
                tabs.forEach((tab, index) => {
                    tab.addEventListener('click', () => this.selectDirectorPanel(tab.dataset.directorTab));
                    tab.addEventListener('keydown', event => {
                        let next;
                        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
                        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
                        else if (event.key === 'Home') next = 0;
                        else if (event.key === 'End') next = tabs.length - 1;
                        else return;
                        event.preventDefault();
                        this.selectDirectorPanel(tabs[next].dataset.directorTab, true);
                    });
                });
            }
        } catch(e) {
            console.error("Alexandria Protocol: Person Render Failed", e);
            if (token === this._renderToken) this.renderError('This dossier is unavailable', e.message, 'person');
        }
    },

    selectDirectorPanel(name, focus = false) {
        if (!['films', 'highlights', 'craft'].includes(name)) return;
        const tabs = this.main.querySelectorAll('[data-director-tab]');
        tabs.forEach(tab => {
            const active = tab.dataset.directorTab === name;
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            const panel = document.getElementById(tab.getAttribute('aria-controls'));
            if (panel) panel.hidden = !active;
            if (active && focus) tab.focus();
        });
    },

    filterPersonCredits(filter, value) {
        const credits = this._personCredits;
        if (!credits) return;
        if (filter === 'media' && ['movie', 'tv', 'all'].includes(value)) credits.media = value;
        else if (filter === 'role' && ['all', 'acting', 'directing', 'other'].includes(value)) credits.role = value;
        else return;
        credits.limit = PERSON_CREDITS_PAGE_SIZE;
        this.renderPersonCredits();
    },

    showMorePersonCredits() {
        if (!this._personCredits) return;
        this._personCredits.limit += PERSON_CREDITS_PAGE_SIZE;
        this.renderPersonCredits();
    },

    renderPersonCredits() {
        const state = this._personCredits;
        const grid = document.getElementById('person-filmography-results');
        if (!state || !grid) return;
        const filtered = state.items.filter(item =>
            (state.media === 'all' || item.media_type === state.media)
            && (state.role === 'all' || item.roles.has(state.role))
        );
        document.querySelectorAll('[data-credit-media]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.creditMedia === state.media));
        });
        document.querySelectorAll('[data-credit-role]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.creditRole === state.role));
        });
        const roleSelect = document.getElementById('person-credit-role');
        if (roleSelect) roleSelect.value = state.role;
        const shown = filtered.slice(0, state.limit);
        grid.hidden = !shown.length;
        if (shown.length) {
            this.renderResults(shown, 'person-filmography-results');
            grid.querySelectorAll('.movie-card').forEach((card, index) => {
                const item = shown[index];
                const meta = document.createElement('p');
                meta.className = 'person-credit-meta';
                const year = (item.release_date || item.first_air_date || '').slice(0, 4);
                meta.textContent = [year, [...item.jobs].join(', ')].filter(Boolean).join(' · ');
                card.querySelector('.card-info')?.appendChild(meta);
            });
        } else {
            grid.replaceChildren();
        }
        document.getElementById('person-credits-count').textContent = `${shown.length} of ${filtered.length} titles`;
        document.getElementById('person-credits-empty').hidden = filtered.length > 0;
        document.getElementById('person-credits-more').hidden = shown.length >= filtered.length;
    },

    // #region Community profiles
    avatarHtml(profile, sizePx = 32) {
        const preset = this.AVATAR_PRESETS.find(p => p.id === profile?.avatar_id);
        const px = Math.max(16, Number(sizePx) || 32);
        if (preset?.img) {
            const src = preset.local ? preset.img : this.imageUrl(preset.img, 'w185') || '';
            return `<span class="alexandria-avatar" style="width:${px}px;height:${px}px;"><img src="${src}" alt="" loading="lazy" decoding="async"></span>`;
        }
        const content = preset
            ? preset.emoji
            : (profile?.nickname || profile?.username || profile?.email || '?').charAt(0).toUpperCase();
        return `<span class="alexandria-avatar" style="width:${px}px;height:${px}px;font-size:${Math.round(px * 0.5)}px;">${this.escapeHtml(content)}</span>`;
    },

    timeago(iso) {
        if (!iso) return '';
        const then = new Date(iso).getTime();
        if (!Number.isFinite(then)) return '';
        const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
        if (sec < 60) return 'just now';
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min}m ago`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr}h ago`;
        const day = Math.floor(hr / 24);
        if (day < 7) return `${day}d ago`;
        const wk = Math.floor(day / 7);
        if (wk < 5) return `${wk}w ago`;
        const d = new Date(then);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    },

    parseActivityMeta(meta) {
        if (!meta || typeof meta !== 'string') return null;
        try {
            const obj = JSON.parse(meta);
            return (obj && typeof obj === 'object') ? obj : null;
        } catch {
            return null;
        }
    },

    episodeContext(row) {
        if (!row || row.content_type !== 'tv' || row.content_id == null) return null;
        const meta = this.parseActivityMeta(row.meta);
        const season = Number(meta && meta.season);
        const episode = Number(meta && meta.episode);
        if (isFinite(season) && season > 0 && isFinite(episode) && episode > 0) {
            return { season, episode };
        }
        return null;
    },

    // Your personal layer on the details page: rate inline, read your
    // review, jump to the diary. Unsaved titles get a prompt instead —
    // the + button above is the way in.
    detailsTakeHtml(id, type, wlEntry, score) {
        if (!wlEntry) {
            return `
                <div class="details-take">
                    <span class="details-take-label">YOUR TAKE</span>
                    <p class="details-take-prompt">Save it to your library to rate it and keep a diary entry.</p>
                </div>`;
        }
        const review = (wlEntry.userReview || '').trim();
        return `
            <div class="details-take">
                <span class="details-take-label">YOUR TAKE</span>
                <div class="details-take-row">
                    ${this.starsHtml(String(id), type, wlEntry.userRating, Number(score) || 0)}
                    <button class="wl-log-btn ${review ? 'has-review' : ''}" type="button" aria-label="Open diary entry" title="Open diary entry" onclick="Alexandria.openLogModal('${this.escapeHtml(String(id))}', '${this.escapeHtml(type)}')">✎</button>
                </div>
                ${review ? `<p class="details-take-review">“${this.escapeHtml(review.length > 280 ? review.slice(0, 280) + '…' : review)}”</p>` : `<p class="details-take-prompt">No review yet — tap ✎ to write one.</p>`}
            </div>`;
    },

};

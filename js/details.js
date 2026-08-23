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
                                    <button class="btn-primary play-btn" onclick="Alexandria.playContent(${id}, '${type}')">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> WATCH NOW
                                    </button>
                                    <button class="btn-secondary play-btn" onclick="Alexandria.createWatchParty(${id}, '${type}')" style="margin-left: 10px;">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> WATCH PARTY
                                    </button>
                                    <button class="btn-secondary" type="button" data-share-title="${this.escapeHtml(title)}" onclick="Alexandria.shareCurrent(this.dataset.shareTitle)" style="margin-left: 10px;">SHARE</button>
                                    <button class="btn-secondary" type="button" style="margin-left: 10px;" onclick="Alexandria.addToListModal(${Number(id)}, '${type}')">ADD TO LIST</button>
                                    <button class="icon-btn log-btn ${inWatchlist ? 'active' : ''}" type="button" aria-label="${inWatchlist ? 'Remove from' : 'Add to'} watchlist" aria-pressed="${inWatchlist}" data-id="${Number(id)}" data-type="${type}" data-title="${this.escapeHtml(title)}" data-poster="${this.escapeHtml(data.poster_path || '')}">
                                        ${inWatchlist ? '✓' : '+'}
                                    </button>
                                    ${inWatchlist ? `
                                    <button id="watch-status-btn" class="btn-secondary" type="button" style="margin-left: 10px;" onclick="Alexandria.setWatchStatus(${id}, '${type}', '${wlStatus === 'watched' ? 'want' : 'watched'}')">${wlStatus === 'watched' ? 'BACK TO QUEUE' : wlStatus === 'watching' ? 'MARK COMPLETE' : 'MARK WATCHED'}</button>
                                    ` : ''}
                                </div>
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
                this.resolveAnime(Number(id), 1, null, {
                    title: data.name || data.title || '',
                    originalTitle: data.original_name || data.original_title || '',
                    year: Number((data.first_air_date || data.release_date || '').slice(0, 4)) || null,
                    isMovie: type === 'movie'
                }).then(info => {
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
            const bioSection = longBio
                ? `<div class="person-bio person-bio-collapsed" id="person-bio">${bioHtml}</div>
                   <button class="bio-toggle" id="bio-toggle" onclick="Alexandria.toggleBio()">Read More</button>`
                : `<div class="person-bio">${bioHtml || 'No biography available.'}</div>`;

            // Categorize credits
            const seenCast = new Set();
            const castCredits = (data.combined_credits?.cast || [])
                .filter(c => {
                    if (!c.poster_path) return false;
                    if (seenCast.has(c.id)) return false;
                    seenCast.add(c.id);
                    return true;
                })
                .sort((a, b) => b.popularity - a.popularity);
            const crewCredits = (data.combined_credits?.crew || [])
                .filter(c => c.poster_path && ['Director', 'Executive Producer', 'Producer', 'Writer', 'Screenplay', 'Creator'].includes(c.job))
                .sort((a, b) => b.popularity - a.popularity);
            // Deduplicate crew by id+job
            const seenCrew = new Set();
            const uniqueCrew = crewCredits.filter(c => {
                const key = `${c.id}-${c.job}`;
                if (seenCrew.has(key)) return false;
                seenCrew.add(key);
                return true;
            });

            // Known For = top 10 most popular across cast + crew, deduplicated
            const seenKnown = new Set();
            const knownFor = [...castCredits, ...uniqueCrew]
                .sort((a, b) => b.popularity - a.popularity)
                .filter(c => { if (seenKnown.has(c.id)) return false; seenKnown.add(c.id); return true; })
                .slice(0, 12);

            // Acting credits chronologically (newest first)
            const actingCredits = castCredits
                .sort((a, b) => new Date(b.release_date || b.first_air_date || '0') - new Date(a.release_date || a.first_air_date || '0'))
                .slice(0, 50);

            this.main.innerHTML = `
                <section class="person-layout">
                    <div class="person-header">
                        ${photo ? `<img src="${photo}" alt="${this.escapeHtml(data.name)}" class="person-photo">` : '<div class="person-photo person-placeholder" aria-hidden="true">A</div>'}
                        <div class="person-info">
                            <h1>${this.escapeHtml(data.name)}</h1>
                            <div class="person-meta">
                                <span>${this.escapeHtml(data.known_for_department || '')}</span>
                                ${data.birthday ? `<span>Born: ${this.escapeHtml(data.birthday)}</span>` : ''}
                                ${ageStr ? `<span>${ageStr}</span>` : ''}
                                ${data.place_of_birth ? `<span>${this.escapeHtml(data.place_of_birth)}</span>` : ''}
                            </div>
                            ${bioSection}
                        </div>
                    </div>
                    
                    ${knownFor.length ? `
                    <div class="view-section">
                        <h3>KNOWN FOR</h3>
                        <div class="carousel-container">
                            <button class="carousel-arrow left" onclick="Alexandria.scrollCarousel(this, -800)">&#10094;</button>
                            <div class="carousel-wrapper"><div class="carousel-grid" id="person-known-for"></div></div>
                            <button class="carousel-arrow right" onclick="Alexandria.scrollCarousel(this, 800)">&#10095;</button>
                        </div>
                    </div>` : ''}

                    ${actingCredits.length ? `
                    <div class="view-section person-credits-section">
                        <h3>ACTING (${actingCredits.length})</h3>
                        <div class="person-credits-grid" id="person-acting"></div>
                    </div>` : ''}

                    ${uniqueCrew.length ? `
                    <div class="view-section person-credits-section">
                        <h3>DIRECTING & PRODUCING (${uniqueCrew.length})</h3>
                        <div class="person-credits-grid" id="person-crew"></div>
                    </div>` : ''}
                </section>
            `;
            
            if (knownFor.length) this.renderResults(knownFor, 'person-known-for');
            if (actingCredits.length) this.renderResults(actingCredits, 'person-acting');
            if (uniqueCrew.length) this.renderResults(uniqueCrew, 'person-crew');
        } catch(e) {
            console.error("Alexandria Protocol: Person Render Failed", e);
            if (token === this._renderToken) this.renderError('This dossier is unavailable', e.message, 'person');
        }
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

};

// Directors archive: a curated portrait index plus an editorial layer on the
// existing person dossier. Curated entries live in ./director-data.js and are
// loaded on demand so a missing or broken data file never blocks the app.

const RATING_PRIOR_VOTES = 500;
const BEST_FILMS_LIMIT = 8;
const PODIUM_SIZE = 3;

function initialsFor(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    const initials = parts.map(part => part[0]).join('').toUpperCase();
    return initials || 'A';
}

function asText(value, maxLength = 6000) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeUrl(value) {
    try {
        const url = new URL(String(value));
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
        return '';
    }
}

function normalizeDirectorData(raw) {
    if (!Array.isArray(raw)) return [];
    const seenDirectors = new Set();
    const directors = [];

    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const id = Number(entry.id);
        if (!Number.isInteger(id) || id < 1 || seenDirectors.has(id)) continue;
        const name = asText(entry.name, 160);
        if (!name) continue;

        const seenExamples = new Set();
        const examples = [];
        for (const example of Array.isArray(entry.examples) ? entry.examples : []) {
            if (!example || typeof example !== 'object') continue;
            const exampleId = Number(example.id);
            const title = asText(example.title, 240);
            if (!Number.isInteger(exampleId) || exampleId < 1 || !title || seenExamples.has(exampleId)) continue;
            seenExamples.add(exampleId);
            examples.push({ id: exampleId, title, note: asText(example.note, 600) });
        }

        const seenSources = new Set();
        const sources = [];
        for (const source of Array.isArray(entry.sources) ? entry.sources : []) {
            if (!source || typeof source !== 'object') continue;
            const label = asText(source.label, 200);
            const url = normalizeUrl(source.url);
            if (!label || !url || seenSources.has(url)) continue;
            seenSources.add(url);
            sources.push({ label, url });
        }

        seenDirectors.add(id);
        directors.push({
            id,
            name,
            tagline: asText(entry.tagline, 400),
            technique: asText(entry.technique, 400),
            description: asText(entry.description, 6000),
            examples,
            sources
        });
    }

    return directors;
}

function cardItem(film) {
    return {
        id: film.id,
        title: film.title,
        media_type: 'movie',
        type: 'movie',
        poster_path: film.poster_path,
        release_date: film.release_date,
        vote_average: film.vote_average,
        vote_count: film.vote_count
    };
}

export const directors = {
    _directorData: null,
    _directorDataPromise: null,
    _directorRetry: 0,
    _directorPortraits: new Map(),
    _directorBackdrops: new Map(),

    loadDirectors(force = false) {
        if (!force && this._directorData) return Promise.resolve(this._directorData);
        if (!force && this._directorDataPromise) return this._directorDataPromise;

        if (force) this._directorRetry += 1;
        const suffix = this._directorRetry ? `?retry=${this._directorRetry}` : '';
        this._directorDataPromise = import(`./director-data.js${suffix}`)
            .then(module => normalizeDirectorData(module?.DIRECTORS))
            .then(list => {
                this._directorData = list;
                this._directorDataPromise = null;
                return list;
            })
            .catch(error => {
                this._directorDataPromise = null;
                this._directorData = null;
                // Force the next attempt through a fresh module URL so a
                // failed import cached by the browser cannot wedge retries.
                this._directorRetry += 1;
                throw error;
            });

        return this._directorDataPromise;
    },

    // Resolves to null on any failure so normal actor pages never depend on
    // the curated archive being present.
    async getCuratedDirector(id) {
        try {
            const list = await this.loadDirectors();
            return list.find(director => director.id === Number(id)) || null;
        } catch (error) {
            console.warn('Alexandria: director archive unavailable -', error.message);
            return null;
        }
    },

    buildDirectorRanking(data) {
        const credits = data?.combined_credits?.crew;
        const today = new Date().toISOString().slice(0, 10);
        const seen = new Set();
        const films = [];

        for (const credit of Array.isArray(credits) ? credits : []) {
            if (!credit || credit.media_type !== 'movie' || credit.job !== 'Director') continue;
            const id = Number(credit.id);
            if (!Number.isInteger(id) || id < 1 || seen.has(id)) continue;
            const title = asText(credit.title || credit.original_title, 240);
            const releaseDate = typeof credit.release_date === 'string' ? credit.release_date.trim() : '';
            const validDate = /^\d{4}-\d{2}-\d{2}$/.test(releaseDate);
            if (!title || !validDate) continue;

            seen.add(id);
            const voteAverage = Number(credit.vote_average);
            const voteCount = Number(credit.vote_count);
            films.push({
                id,
                title,
                release_date: releaseDate,
                poster_path: typeof credit.poster_path === 'string' ? credit.poster_path : '',
                vote_average: Number.isFinite(voteAverage) ? Math.max(0, Math.min(10, voteAverage)) : 0,
                vote_count: Number.isFinite(voteCount) ? Math.max(0, Math.floor(voteCount)) : 0,
                released: releaseDate <= today
            });
        }

        const eligible = films.filter(film => film.released && film.vote_count > 0 && film.vote_average > 0);

        // A director can have a short and a feature under the same title (the
        // Whiplash short and the Whiplash feature, for instance). Keep the one
        // with the larger audience so a duplicate title never fills two slots.
        const byTitle = new Map();
        for (const film of eligible) {
            const key = film.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
            const current = byTitle.get(key);
            if (!current || film.vote_count > current.vote_count) byTitle.set(key, film);
        }
        const unique = Array.from(byTitle.values());
        const mean = unique.length
            ? unique.reduce((sum, film) => sum + film.vote_average, 0) / unique.length
            : 0;

        // Bayesian average: a high score on a handful of votes should not
        // outrank a slightly lower score backed by a large audience.
        for (const film of unique) {
            const weight = film.vote_count / (film.vote_count + RATING_PRIOR_VOTES);
            film.weighted = (weight * film.vote_average) + ((1 - weight) * mean);
        }

        const ranked = unique
            .slice()
            .sort((a, b) => b.weighted - a.weighted || b.vote_count - a.vote_count || b.release_date.localeCompare(a.release_date))
            .slice(0, BEST_FILMS_LIMIT);

        const filmography = films
            .filter(film => film.poster_path)
            .slice()
            .sort((a, b) => b.release_date.localeCompare(a.release_date) || a.title.localeCompare(b.title));

        return { ranked, filmography, mean, eligibleCount: unique.length };
    },

    // The two curated frames carry the editorial argument. A backdrop turns
    // them into film stills instead of another row of links; when TMDB has no
    // image the plate stays typographic rather than showing a broken frame.
    async resolveExampleFrames(director) {
        return Promise.all(director.examples.map(async example => {
            if (this._directorBackdrops.has(example.id)) {
                return { ...example, backdrop_path: this._directorBackdrops.get(example.id) };
            }
            try {
                const data = await this.getJson(`movie/${example.id}`);
                const path = typeof data?.backdrop_path === 'string' ? data.backdrop_path : '';
                this._directorBackdrops.set(example.id, path);
                return { ...example, backdrop_path: path };
            } catch {
                return { ...example, backdrop_path: '' };
            }
        }));
    },

    directorFramesHtml(frames) {
        return frames.map((frame, index) => {
            const backdrop = this.imageUrl(frame.backdrop_path, 'w780');
            return `
            <a class="dir-frame" href="#details/movie/${frame.id}">
                <span class="dir-frame-media">
                    ${backdrop
                        ? `<img src="${backdrop}" alt="" decoding="async">`
                        : `<span class="dir-frame-plate" aria-hidden="true">${this.escapeHtml(initialsFor(frame.title))}</span>`}
                    <span class="dir-frame-shade" aria-hidden="true"></span>
                    <span class="dir-frame-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
                </span>
                <span class="dir-frame-caption">
                    <span class="dir-frame-title">${this.escapeHtml(frame.title)}</span>
                    ${frame.note ? `<span class="dir-frame-note">${this.escapeHtml(frame.note)}</span>` : ''}
                    <span class="dir-frame-open">Open film <span aria-hidden="true">&rarr;</span></span>
                </span>
            </a>`;
        }).join('');
    },

    directorPodiumHtml(ranked) {
        const podium = ranked.slice(0, PODIUM_SIZE);
        if (!podium.length) return '';
        return `<div class="dir-podium">
            ${podium.map((film, index) => {
                const year = film.release_date.slice(0, 4);
                const poster = this.imageUrl(film.poster_path, 'w342');
                const href = `#details/movie/${film.id}`;
                return `
                <a class="dir-plate" href="${href}">
                    <span class="dir-plate-frame">
                        ${poster
                            ? `<img src="${poster}" alt="" decoding="async">`
                            : `<span class="dir-plate-fallback" aria-hidden="true">${this.escapeHtml(initialsFor(film.title))}</span>`}
                    </span>
                    <span class="dir-plate-rank" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
                    <span class="dir-plate-title">${this.escapeHtml(film.title)}</span>
                    <span class="dir-plate-meta">${year} <span aria-hidden="true">/</span> ${film.vote_average.toFixed(1)}</span>
                </a>`;
            }).join('')}
        </div>`;
    },

    directorRanksHtml(ranked) {
        const rest = ranked.slice(PODIUM_SIZE);
        if (!rest.length) return '';
        return `<ol class="dir-ranks">
            ${rest.map((film, index) => {
                const year = film.release_date.slice(0, 4);
                const href = `#details/movie/${film.id}`;
                return `
                <li class="dir-rank">
                    <span class="dir-rank-no" aria-hidden="true">${String(index + PODIUM_SIZE + 1).padStart(2, '0')}</span>
                    <a class="dir-rank-link" href="${href}">
                        <span class="dir-rank-title">${this.escapeHtml(film.title)}</span>
                        <span class="dir-rank-meta">${year} <span aria-hidden="true">/</span> ${film.vote_count.toLocaleString('en-US')} votes</span>
                    </a>
                    <span class="dir-rank-score" title="Rating weighted by vote count">${film.weighted.toFixed(1)}</span>
                </li>`;
            }).join('')}
        </ol>`;
    },

    async buildDirectorEditorial(data, director) {
        const ranking = this.buildDirectorRanking(data);
        const frames = await this.resolveExampleFrames(director);
        const canRank = ranking.ranked.length > 0;

        const sources = director.sources.length
            ? `<div class="dir-references">
                    <h4>References</h4>
                    <ol>${director.sources.map(source => `
                        <li><a href="${this.escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(source.label)}<span aria-hidden="true">&nbsp;&nearr;</span></a></li>`).join('')}
                    </ol>
                </div>`
            : '';

        const html = `
            <section class="dir-signature" aria-labelledby="director-signature-title">
                <div class="dir-signature-head">
                    <p class="dir-eyebrow"><span class="dir-eyebrow-rule" aria-hidden="true"></span>The signature</p>
                    <h2 id="director-signature-title">${this.escapeHtml(director.technique || 'A visual signature')}</h2>
                    ${director.tagline ? `<p class="dir-tagline">${this.escapeHtml(director.tagline)}</p>` : ''}
                </div>
                <div class="dir-signature-body">
                    ${director.description ? `<p class="dir-description">${this.escapeHtml(director.description)}</p>` : '<span></span>'}
                    ${sources}
                </div>
                ${frames.length ? `
                    <div class="dir-frames">
                        <p class="dir-frames-label">See it in the frame</p>
                        <div class="dir-frames-grid">${this.directorFramesHtml(frames)}</div>
                    </div>` : ''}
            </section>

            <section class="dir-best" aria-labelledby="director-best-title">
                <div class="dir-section-head">
                    <div>
                        <p class="dir-eyebrow"><span class="dir-eyebrow-rule" aria-hidden="true"></span>The essentials</p>
                        <h3 id="director-best-title">Best films</h3>
                    </div>
                    ${canRank ? `<p class="dir-method">Ranked by TMDB rating, weighted for audience size</p>` : ''}
                </div>
                ${canRank
                    ? `${this.directorPodiumHtml(ranking.ranked)}${this.directorRanksHtml(ranking.ranked)}
                       <p class="dir-method-note">
                           Each rating is pulled toward this director's ${ranking.mean.toFixed(2)} average by a
                           ${RATING_PRIOR_VOTES.toLocaleString('en-US')}-vote prior, so a small sample of high scores
                           cannot outrank a film with a large audience. Unreleased and unrated titles are excluded.
                       </p>`
                    : '<p class="dir-empty-note">No released, rated films are recorded for this director yet.</p>'}
            </section>`;

        return {
            html,
            filmography: ranking.filmography.map(cardItem)
        };
    },

    directorPortraitHtml(director, profilePath = '') {
        const image = profilePath ? this.imageUrl(profilePath, 'h632') : '';
        const fallback = `<span class="dir-card-initials" aria-hidden="true">${this.escapeHtml(initialsFor(director.name))}</span>`;
        return `<span class="dir-card-media" data-director-portrait="${director.id}">
            ${image ? `<img src="${image}" alt="" loading="lazy" decoding="async">` : fallback}
        </span>`;
    },

    // Portraits are progressive enhancement: the index renders and stays
    // usable immediately, and each plate fills in only if TMDB answers.
    async hydrateDirectorPortraits(list, token) {
        const results = await Promise.all(list.map(async director => {
            if (this._directorPortraits.has(director.id)) {
                return { id: director.id, name: director.name, path: this._directorPortraits.get(director.id) };
            }
            try {
                const data = await this.getJson(`person/${director.id}`);
                const path = typeof data?.profile_path === 'string' ? data.profile_path : '';
                this._directorPortraits.set(director.id, path);
                return { id: director.id, name: director.name, path };
            } catch {
                return { id: director.id, name: director.name, path: '' };
            }
        }));

        if (token !== this._renderToken) return;
        for (const result of results) {
            const image = this.imageUrl(result.path, 'h632');
            if (!image) continue;
            const slot = document.querySelector(`[data-director-portrait="${result.id}"]`);
            if (!slot) continue;
            const img = document.createElement('img');
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            // Keep the initials plate if the image host fails; a failed CDN
            // should degrade to the typographic fallback, not a broken icon.
            img.addEventListener('error', () => {
                const fallback = document.createElement('span');
                fallback.className = 'dir-card-initials';
                fallback.setAttribute('aria-hidden', 'true');
                fallback.textContent = initialsFor(result.name);
                slot.replaceChildren(fallback);
            }, { once: true });
            slot.replaceChildren(img);
            img.src = image;
        }
    },

    async renderDirectors() {
        const token = this._renderToken;
        this.main.innerHTML = '<div class="dir-loading"><span class="pulse-dot"></span> Opening the archive</div>';

        let list;
        try {
            list = await this.loadDirectors();
        } catch (error) {
            console.error('Alexandria: Director archive load failed -', error);
            if (token !== this._renderToken) return;
            this.renderError(
                'The director archive is unavailable',
                'The curated director index could not be loaded. Check the connection and try again.',
                'directors'
            );
            return;
        }

        if (token !== this._renderToken) return;
        if (!list.length) {
            this.renderError(
                'No directors indexed yet',
                'The director archive is empty. Curated entries will appear here once they are added.',
                'directors'
            );
            return;
        }

        const cards = list.map((director, index) => `
            <a class="dir-card" href="#person/${director.id}" aria-label="Open the ${this.escapeHtml(director.name)} dossier">
                <span class="dir-card-frame">
                    ${this.directorPortraitHtml(director)}
                    <span class="dir-card-veil" aria-hidden="true"></span>
                    <span class="dir-card-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
                    <span class="dir-card-foot">
                        <span class="dir-card-name">${this.escapeHtml(director.name)}</span>
                        ${director.technique ? `<span class="dir-card-signature">${this.escapeHtml(director.technique)}</span>` : ''}
                    </span>
                </span>
            </a>`).join('');

        this.main.innerHTML = `
            <section class="dir-index">
                <header class="dir-masthead">
                    <div>
                        <p class="dir-eyebrow"><span class="dir-eyebrow-rule" aria-hidden="true"></span>The archive</p>
                        <h1>Directors</h1>
                    </div>
                    <div class="dir-masthead-aside">
                        <p class="dir-lede">A curated index of the filmmakers whose signatures shaped the frame — and the films where you can see them.</p>
                        <p class="dir-count"><span>${String(list.length).padStart(2, '0')}</span> filmmakers</p>
                    </div>
                </header>
                <div class="dir-wall">${cards}</div>
            </section>`;

        this.hydrateDirectorPortraits(list, token).catch(() => { /* portraits are optional */ });
    }
};

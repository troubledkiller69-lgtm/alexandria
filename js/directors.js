// Directors archive: a curated gallery plus an editorial layer on top of the
// existing person dossier. Curated entries live in ./director-data.js and are
// loaded on demand so a missing or broken data file never blocks the app.

const RATING_PRIOR_VOTES = 500;
const BEST_FILMS_LIMIT = 8;
const GALLERY_EXAMPLE_LIMIT = 2;

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
        const mean = eligible.length
            ? eligible.reduce((sum, film) => sum + film.vote_average, 0) / eligible.length
            : 0;

        // Bayesian average: a high score on a handful of votes should not
        // outrank a slightly lower score backed by a large audience.
        for (const film of eligible) {
            const weight = film.vote_count / (film.vote_count + RATING_PRIOR_VOTES);
            film.weighted = (weight * film.vote_average) + ((1 - weight) * mean);
        }

        const ranked = eligible
            .slice()
            .sort((a, b) => b.weighted - a.weighted || b.vote_count - a.vote_count || b.release_date.localeCompare(a.release_date))
            .slice(0, BEST_FILMS_LIMIT);

        const filmography = films
            .slice()
            .sort((a, b) => b.release_date.localeCompare(a.release_date) || a.title.localeCompare(b.title));

        return { ranked, filmography, mean, eligibleCount: eligible.length };
    },

    directorExamplesHtml(director, limit = 0) {
        const examples = limit > 0 ? director.examples.slice(0, limit) : director.examples;
        if (!examples.length) return '';
        return examples.map(example => `
            <a class="director-example" href="#details/movie/${example.id}">
                <strong>${this.escapeHtml(example.title)}</strong>
                ${example.note ? `<span>${this.escapeHtml(example.note)}</span>` : ''}
            </a>`).join('');
    },

    directorPortraitHtml(director, profilePath = '') {
        const image = profilePath ? this.imageUrl(profilePath, 'w185') : '';
        const fallback = `<span class="director-portrait-fallback">${this.escapeHtml(initialsFor(director.name))}</span>`;
        return `<div class="director-card-portrait" data-director-portrait="${director.id}" aria-hidden="true">
            ${image
                ? `<img src="${image}" alt="" loading="lazy" decoding="async">`
                : fallback}
        </div>`;
    },

    // Portraits are progressive enhancement: the gallery renders and stays
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
            const image = this.imageUrl(result.path, 'w185');
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
                fallback.className = 'director-portrait-fallback';
                fallback.textContent = initialsFor(result.name);
                slot.replaceChildren(fallback);
            }, { once: true });
            slot.replaceChildren(img);
            img.src = image;
        }
    },

    directorRankingHtml(ranking) {
        if (!ranking.ranked.length) {
            return '<p class="director-empty-note">No released, rated films are recorded for this director yet.</p>';
        }
        return `<ol class="director-ranking">
            ${ranking.ranked.map((film, index) => {
                const year = film.release_date.slice(0, 4);
                const poster = this.imageUrl(film.poster_path, 'w185');
                const href = `#details/movie/${film.id}`;
                return `
                <li class="director-rank-row">
                    <span class="director-rank-number" aria-hidden="true">${index + 1}</span>
                    <a class="director-rank-poster" href="${href}" tabindex="-1" aria-hidden="true">
                        ${poster
                            ? `<img src="${poster}" alt="" loading="lazy" decoding="async">`
                            : '<span class="director-rank-poster-placeholder">A</span>'}
                    </a>
                    <div class="director-rank-body">
                        <h4><a href="${href}">${this.escapeHtml(film.title)}</a></h4>
                        <p class="director-rank-meta">
                            <span>${year}</span>
                            <span aria-hidden="true">·</span>
                            <span>${film.vote_average.toFixed(1)} TMDB</span>
                            <span aria-hidden="true">·</span>
                            <span>${film.vote_count.toLocaleString('en-US')} votes</span>
                        </p>
                    </div>
                    <div class="director-rank-score" title="Rating weighted by vote count">
                        <span>${film.weighted.toFixed(1)}</span>
                        <small>weighted</small>
                    </div>
                </li>`;
            }).join('')}
        </ol>`;
    },

    buildDirectorEditorial(data, director) {
        const ranking = this.buildDirectorRanking(data);
        const bestFilms = ranking.ranked.length
            ? `<section class="director-best" aria-labelledby="director-best-title">
                    <div class="director-section-head">
                        <h3 id="director-best-title">Best directed films</h3>
                        <p>Weighted rating, not raw score</p>
                    </div>
                    ${this.directorRankingHtml(ranking)}
                    <p class="director-ranking-note">
                        Each TMDB rating is pulled toward this director's ${ranking.mean.toFixed(2)} average by a
                        ${RATING_PRIOR_VOTES.toLocaleString('en-US')}-vote prior, so a small sample of high scores cannot
                        outrank a film with a large audience. Unreleased, undated and unrated titles are excluded.
                    </p>
                </section>`
            : `<section class="director-best" aria-labelledby="director-best-title">
                    <div class="director-section-head"><h3 id="director-best-title">Best directed films</h3></div>
                    <p class="director-empty-note">No released, rated films are recorded for this director yet.</p>
                </section>`;

        const sources = director.sources.length
            ? `<div class="director-sources">
                    <h4>Sources</h4>
                    <ul>${director.sources.map(source => `
                        <li><a href="${this.escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(source.label)}</a></li>`).join('')}
                    </ul>
                </div>`
            : '';

        const html = `
            <section class="director-editorial" aria-labelledby="director-signature-title">
                <div class="director-signature-column">
                    <p class="director-kicker">The signature</p>
                    <h2 id="director-signature-title">${this.escapeHtml(director.technique || 'A visual signature')}</h2>
                    ${director.tagline ? `<p class="director-editorial-tagline">${this.escapeHtml(director.tagline)}</p>` : ''}
                </div>
                <div class="director-editorial-copy">
                    ${director.description ? `<p>${this.escapeHtml(director.description)}</p>` : ''}
                    ${director.examples.length ? `
                        <div class="director-signature-films">
                            <h3>See it in the frame</h3>
                            <div class="director-example-list">${this.directorExamplesHtml(director)}</div>
                        </div>` : ''}
                    ${sources}
                </div>
            </section>
            ${bestFilms}`;

        return {
            html,
            filmography: ranking.filmography.map(cardItem)
        };
    },

    async renderDirectors() {
        const token = this._renderToken;
        this.main.innerHTML = `
            <section class="directors-view">
                <div class="placeholder-msg"><span class="pulse-dot"></span> OPENING THE DIRECTOR'S ARCHIVE...</div>
            </section>`;

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

        const filmCount = list.reduce((sum, director) => sum + director.examples.length, 0);
        const cards = list.map((director, index) => {
            const extra = director.examples.length > GALLERY_EXAMPLE_LIMIT
                ? `<span class="director-example-more">+${director.examples.length - GALLERY_EXAMPLE_LIMIT} more</span>`
                : '';
            return `
            <article class="director-card">
                <a class="director-card-main" href="#person/${director.id}" aria-label="Open the ${this.escapeHtml(director.name)} dossier">
                    <span class="director-card-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
                    ${this.directorPortraitHtml(director)}
                    <div class="director-card-copy">
                        <h2>${this.escapeHtml(director.name)}</h2>
                        ${director.tagline ? `<p class="director-card-tagline">${this.escapeHtml(director.tagline)}</p>` : ''}
                        ${director.technique ? `<p class="director-card-technique"><span>Signature</span>${this.escapeHtml(director.technique)}</p>` : ''}
                        <span class="director-card-open">Open dossier</span>
                    </div>
                </a>
                ${director.examples.length ? `
                    <div class="director-card-films">
                        <p class="director-card-films-label">Signature films</p>
                        <div class="director-example-list">${this.directorExamplesHtml(director, GALLERY_EXAMPLE_LIMIT)}${extra}</div>
                    </div>` : ''}
            </article>`;
        }).join('');

        this.main.innerHTML = `
            <section class="directors-view">
                <header class="directors-masthead">
                    <p class="director-kicker">Curated archive</p>
                    <h1>Directors</h1>
                    <p class="directors-lede">Careers read as fingerprints — the recurring frame, the cut that gives them away, and the films where the signature is unmistakable.</p>
                    <dl class="directors-stats">
                        <div><dt>Directors</dt><dd>${list.length}</dd></div>
                        <div><dt>Signature films</dt><dd>${filmCount}</dd></div>
                    </dl>
                </header>
                <div class="directors-grid">${cards}</div>
            </section>`;

        this.hydrateDirectorPortraits(list, token).catch(() => { /* portraits are optional */ });
    }
};

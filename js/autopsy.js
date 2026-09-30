export const autopsy = {
    async renderAutopsy() {
        if (!this.main) this.main = document.getElementById('content');
        if (!this.main) return;
        const token = this._renderToken;
        const rated = (this.state.watchlist || []).filter(w => (Number(w.userRating) || 0) > 0);
        const canon = [...rated]
            .filter(w => Number(w.userRating) >= 4.5)
            .sort((a, b) => (Number(b.userRating) || 0) - (Number(a.userRating) || 0)
                || (Number(b.score) || 0) - (Number(a.score) || 0))
            .slice(0, 12);
        const avg = rated.length
            ? (rated.reduce((s, w) => s + (Number(w.userRating) || 0), 0) / rated.length).toFixed(1)
            : null;

        this.main.innerHTML = `
            <section class="filtered-view">
                <div class="hero-featured">
                    <div class="featured-content">
                        <h1>Taste Autopsy</h1>
                        <p>${rated.length ? `${rated.length} rated title${rated.length === 1 ? '' : 's'} on the slab.` : 'No bodies on the slab yet.'}</p>
                    </div>
                    <div class="sector-widget">
                        <div class="sector-widget-content wl-stats">
                            <div class="wl-stat"><b>${rated.length}</b><span>RATED</span></div>
                            <div class="wl-stat"><b>${canon.length}</b><span>CANON</span></div>
                            <div class="wl-stat"><b>${avg ? `★ ${avg}` : '—'}</b><span>AVG RATING</span></div>
                        </div>
                    </div>
                </div>
                ${rated.length < 3 ? `
                <div class="view-section">
                    <div class="placeholder-msg">Not enough blood samples. Rate at least 3 titles. <a class="btn-quiet" href="#watchlist">OPEN WATCHLIST</a></div>
                </div>` : `<div id="autopsy-body">${this.autopsyBodyHtml(rated, canon, null)}</div>`}
            </section>
        `;
        if (rated.length < 3) return;

        // Enrich the canon in one call per title, then re-render. getJson caches 10min.
        let enriched = null;
        try {
            enriched = await this.mapWithConcurrency(canon, 4, async entry => {
                try {
                    const type = entry.type === 'tv' ? 'tv' : 'movie';
                    const data = await this.getJson(`${type}/${entry.id}?append_to_response=credits`);
                    return { entry, data };
                } catch { return { entry, data: null }; }
            });
        } catch { enriched = null; }
        if (token !== this._renderToken || this.state.view !== 'autopsy') return;
        const body = document.getElementById('autopsy-body');
        if (body) body.innerHTML = this.autopsyBodyHtml(rated, canon, enriched);
    },

    autopsyBodyHtml(rated, canon, enriched) {
        const verdicts = this.autopsyVerdicts(rated, canon, enriched);
        const decades = this.autopsyDecades(rated);
        const decadeMax = Math.max(0, ...Object.values(decades).map(d => d.count));
        const decadeRows = Object.values(decades)
            .sort((a, b) => a.decade - b.decade)
            .map(d => this.autopsyBarHtml(`${d.decade}s`, d.count, decadeMax)).join('');
        const spread = this.autopsySpread(rated);
        const spreadMax = Math.max(1, ...spread.map(b => b.count));
        const spreadRows = spread.map(b => this.autopsyBarHtml(b.label, b.count, spreadMax)).join('');
        const loading = !enriched;

        let genreRows = '<div class="placeholder-msg">Sampling blood…</div>';
        let directorRows = '<div class="placeholder-msg">Sampling blood…</div>';
        let runtimeHtml = '<div class="placeholder-msg">Sampling blood…</div>';
        if (enriched) {
            const genres = this.autopsyCanonGenres(enriched);
            genreRows = genres.length
                ? genres.map(g => this.autopsyBarHtml(g.name, g.count, genres[0].count)).join('')
                : '<div class="placeholder-msg">Genre samples need a connection. Local shelves still stand.</div>';
            const directors = this.autopsyCanonDirectors(enriched);
            directorRows = directors.length
                ? directors.map(d => this.autopsyBarHtml(`${d.name} — ${d.count}`, d.count, directors[0].count)).join('')
                : '<div class="placeholder-msg">Director samples need a connection. Local shelves still stand.</div>';
            runtimeHtml = this.autopsyRuntimeHtml(enriched);
        }

        return `
            <div class="view-section">
                <h3>The Verdict</h3>
                <div class="autopsy-verdicts">${verdicts.map(v => `<p>${v}</p>`).join('')}</div>
            </div>
            <div class="view-section">
                <h3>The Canon — ★4.5 and above</h3>
                ${this.autopsyCanonHtml(canon)}
            </div>
            <div class="view-section">
                <h3>Decades</h3>
                ${decadeRows ? `<div class="autopsy-bars">${decadeRows}</div>` : '<div class="placeholder-msg">Your titles carry no dates. The slab can\'t carbon-date them.</div>'}
            </div>
            <div class="view-section">
                <h3>Canon Genres</h3>
                ${loading ? genreRows : `<div class="autopsy-bars">${genreRows}</div>`}
            </div>
            <div class="view-section">
                <h3>Canon Directors</h3>
                ${loading ? directorRows : `<div class="autopsy-bars">${directorRows}</div>`}
            </div>
            <div class="view-section">
                <h3>Runtime Verdict</h3>
                ${runtimeHtml}
            </div>
            <div class="view-section">
                <h3>Rating Spread</h3>
                <div class="autopsy-bars">${spreadRows}</div>
            </div>
        `;
    },

    autopsyCanonHtml(canon) {
        if (!canon.length) return '<div class="placeholder-msg">No titles cleared ★4.5 yet. The canon shelf sits empty.</div>';
        return `<div class="autopsy-canon">${canon.map(w => {
            let poster = '';
            try {
                const url = this.imageUrl(w.poster_path, 'w154');
                poster = typeof url === 'string' ? url : '';
            } catch { poster = ''; }
            if (typeof poster !== 'string' || !poster.startsWith('http')) poster = '';
            const title = w.title || w.name || 'Untitled';
            const type = w.type === 'tv' ? 'tv' : 'movie';
            const inner = poster
                ? `<img src="${poster}" alt="${this.escapeHtml(title)} poster" loading="lazy" decoding="async">`
                : `<span class="autopsy-poster-fallback" aria-hidden="true">${this.escapeHtml(String(title).slice(0, 1).toUpperCase() || 'A')}</span>`;
            return `<a class="autopsy-canon-item" href="#details/${type}/${this.escapeHtml(String(w.id))}" title="${this.escapeHtml(title)} — ★${this.escapeHtml(String(w.userRating))}">${inner}<span class="autopsy-canon-rating">★ ${this.escapeHtml(String(w.userRating))}</span></a>`;
        }).join('')}</div>`;
    },

    autopsyBarHtml(label, count, max) {
        const pct = max > 0 ? Math.round((count / max) * 100) : 0;
        return `<div class="autopsy-row"><span class="autopsy-label">${this.escapeHtml(label)}</span><div class="halloween-progress-bar autopsy-bar"><div class="halloween-progress-fill" style="width: ${pct}%"></div></div><span class="autopsy-count">${count}</span></div>`;
    },

    autopsyDecades(rated) {
        const map = {};
        for (const w of rated) {
            const y = Number.parseInt(String(w.year || '').slice(0, 4), 10);
            if (!Number.isFinite(y)) continue;
            const decade = Math.floor(y / 10) * 10;
            if (!map[decade]) map[decade] = { decade, count: 0 };
            map[decade].count += 1;
        }
        return map;
    },

    autopsySpread(rated) {
        const buckets = [
            { label: '★ 5', count: 0, test: r => r === 5 },
            { label: '★ 4.5', count: 0, test: r => r === 4.5 },
            { label: '★ 4', count: 0, test: r => r === 4 },
            { label: '★ 3.5–3', count: 0, test: r => r === 3.5 || r === 3 },
            { label: '★ below 3', count: 0, test: r => r < 3 },
        ];
        for (const w of rated) {
            const r = Number(w.userRating) || 0;
            const hit = buckets.find(b => b.test(r)) || buckets[buckets.length - 1];
            hit.count += 1;
        }
        return buckets;
    },

    autopsyCanonGenres(enriched) {
        const counts = {};
        for (const { data } of enriched || []) {
            for (const g of data?.genres || []) {
                if (!g || typeof g.name !== 'string' || !g.name) continue;
                counts[g.name] = (counts[g.name] || 0) + 1;
            }
        }
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            .slice(0, 6);
    },

    autopsyCanonDirectors(enriched) {
        const counts = {};
        for (const { data } of enriched || []) {
            const crew = data?.credits?.crew || [];
            const dir = crew.find(c => c && c.job === 'Director' && typeof c.name === 'string' && c.name);
            if (dir) counts[dir.name] = (counts[dir.name] || 0) + 1;
        }
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            .slice(0, 5);
    },

    autopsyRuntimes(enriched) {
        const minutes = [];
        let tvCounted = 0;
        for (const { entry, data } of enriched || []) {
            if (!data) continue;
            if (entry.type === 'tv') {
                const ep = Array.isArray(data.episode_run_time) ? Number(data.episode_run_time[0]) : 0;
                if (ep > 0) { minutes.push(ep); tvCounted += 1; }
            } else {
                const rt = Number(data.runtime);
                if (rt > 0) minutes.push(rt);
            }
        }
        return { minutes, tvCounted };
    },

    autopsyRuntimeLine(enriched) {
        const { minutes, tvCounted } = this.autopsyRuntimes(enriched);
        if (!minutes.length) return null;
        const avgRt = Math.round(minutes.reduce((s, m) => s + m, 0) / minutes.length);
        const tvNote = tvCounted ? ' TV counted by episode length.' : '';
        if (avgRt >= 150) return `The canon averages ${avgRt} minutes across ${minutes.length} timed bodies.${tvNote} You commit to the long haul.`;
        if (avgRt < 105) return `The canon averages ${avgRt} minutes across ${minutes.length} timed bodies.${tvNote} Lean nights, no filler.`;
        return `The canon averages ${avgRt} minutes across ${minutes.length} timed bodies.${tvNote} Neither bloated nor starved.`;
    },

    autopsyRuntimeHtml(enriched) {
        const line = this.autopsyRuntimeLine(enriched);
        if (!line) return '<div class="placeholder-msg">No runtime data on the slab.</div>';
        return `<div class="autopsy-verdicts"><p>${this.escapeHtml(line)}</p></div>`;
    },

    autopsyVerdicts(rated, canon, enriched) {
        const lines = [];
        const ratedN = rated.length;
        const canonN = canon.length;

        // Certainty: a canon with no halves.
        if (canonN > 0) {
            const canonAvg = canon.reduce((s, w) => s + (Number(w.userRating) || 0), 0) / canonN;
            if (canonAvg === 5) lines.push(`No halves in the canon — ${canonN} titles at a flat ★5.0. Certain.`);
            else if (canonAvg >= 4.8) lines.push(`The canon averages ★${canonAvg.toFixed(1)} across ${canonN} titles — nearly unanimous.`);
        }

        // Runtime (needs enrichment).
        if (enriched) {
            const line = this.autopsyRuntimeLine(enriched);
            if (line) lines.push(line);
        }

        // Decades (local).
        const decades = Object.values(this.autopsyDecades(rated)).sort((a, b) => b.count - a.count);
        if (decades.length) {
            const top = decades[0];
            const pct = Math.round((top.count / ratedN) * 100);
            if (top.count / ratedN >= 0.4) lines.push(`You live in the ${top.decade}s — ${top.count} of ${ratedN} rated titles (${pct}%) are buried there.`);
            else lines.push(`No decade owns you — the ${top.decade}s lead with just ${top.count} of ${ratedN} (${pct}%). A drifter's shelf.`);
        }

        // Directors + genres (need enrichment).
        if (enriched) {
            const directors = this.autopsyCanonDirectors(enriched);
            if (directors.length && canonN > 0) {
                const top = directors[0];
                const safeName = this.escapeHtml(top.name);
                if (top.count >= 3) lines.push(`${safeName} has a wing in your church — ${top.count} canon titles.`);
                else lines.push(`${safeName} leads the canon with ${top.count} of ${canonN} — no single auteur runs the morgue.`);
            }
            const genres = this.autopsyCanonGenres(enriched);
            if (genres.length && canonN > 0) {
                const top = genres[0];
                const safeGenre = this.escapeHtml(top.name);
                if (top.name === 'Horror') lines.push(`Horror sits at #1 with ${top.count} canon titles. You come here to be scared.`);
                else if (top.name === 'Comedy') lines.push(`Comedy sits at #1 with ${top.count} canon titles. You come here to feel better.`);
                else lines.push(`${safeGenre} sits at #1 with ${top.count} of ${canonN} canon titles. That's your blood type.`);
            }
        }

        // The suffering middle (local).
        const threes = rated.filter(w => { const r = Number(w.userRating) || 0; return r === 3 || r === 3.5; }).length;
        const spread = this.autopsySpread(rated);
        const topBucket = [...spread].sort((a, b) => b.count - a.count)[0];
        if (threes >= 2 && (topBucket.label === '★ 3.5–3' || threes / ratedN >= 0.3)) {
            lines.push(`You finish everything, even the ones that hurt you — ${threes} titles at ★3–3.5.`);
        }

        // Selectivity + shelf average (always available, guarantee >= 3 lines).
        if (canonN > 0) {
            const pct = Math.round((canonN / ratedN) * 100);
            lines.push(`Only ${canonN} of ${ratedN} rated titles (${pct}%) made the canon. The slab is selective.`);
        } else {
            lines.push(`None of your ${ratedN} rated titles cleared ★4.5. The canon shelf sits empty.`);
        }
        const avg = ratedN ? (rated.reduce((s, w) => s + (Number(w.userRating) || 0), 0) / ratedN) : 0;
        if (avg >= 4) lines.push(`Your shelf averages ★${avg.toFixed(1)} across ${ratedN} rated titles. You hand out flowers.`);
        else if (avg < 3.5) lines.push(`Your shelf averages ★${avg.toFixed(1)} across ${ratedN} rated titles. You hand out toe tags.`);
        else lines.push(`Your shelf averages ★${avg.toFixed(1)} across ${ratedN} rated titles. Middle of the morgue.`);

        return lines.slice(0, 5);
    },
};

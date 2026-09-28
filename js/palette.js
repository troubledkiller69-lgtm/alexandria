export const palette = {
    _palOpen: false,
    _palOpener: null,
    _palReqId: 0,
    _palDebounce: null,
    _palItems: [],
    _palActive: 0,
    _palTitles: [],
    _palQuery: '',
    _palBound: false,

    _palCommands() {
        return [
            { key: 'cmd:home', label: 'Go Home', hint: 'Home', hash: '#home' },
            { key: 'cmd:watchlist', label: 'Go Watchlist', hint: 'Watchlist', hash: '#watchlist' },
            { key: 'cmd:halloween', label: 'Go Halloween Calendar', hint: 'Halloween', hash: '#halloween' },
            { key: 'cmd:community', label: 'Go Community', hint: 'Community', hash: '#community' },
            { key: 'cmd:roulette', label: 'Surprise Me', hint: 'Roulette', hash: '#roulette' }
        ];
    },

    _palFuzzy(q, target) {
        if (!q) return { score: 0, indices: [] };
        const needle = String(q).toLowerCase();
        const hay = String(target).toLowerCase();
        let score = 0;
        let hi = 0;
        const indices = [];
        let lastMatch = -2;
        for (let ni = 0; ni < needle.length; ni += 1) {
            const ch = needle[ni];
            let found = -1;
            for (let k = hi; k < hay.length; k += 1) {
                if (hay[k] === ch) { found = k; break; }
            }
            if (found === -1) return { score: -1, indices: [] };
            indices.push(found);
            score += 10;
            if (found === 0) score += 8;
            const prev = found > 0 ? hay[found - 1] : '';
            if (found === 0 || prev === ' ' || prev === '-' || prev === '_' || prev === '/' || prev === ':') score += 12;
            if (found === lastMatch + 1) score += 15;
            score -= (found - hi) * 0.5;
            lastMatch = found;
            hi = found + 1;
        }
        return { score, indices };
    },

    _palHighlight(text, indices) {
        const raw = String(text == null ? '' : text);
        const set = new Set(indices || []);
        const esc = (c) => c.replace(/[&<>'"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m]));
        let out = '';
        for (let i = 0; i < raw.length; i += 1) {
            const c = esc(raw[i]);
            out += set.has(i) ? `<mark class="palette-mark">${c}</mark>` : c;
        }
        return out;
    },

    _palReadRecent() {
        try {
            const raw = localStorage.getItem('alexandria_palette_recent');
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch { return []; }
    },

    _palScoreRecent(entry) {
        const ageDays = Math.max(0, (Date.now() - (entry.at || 0)) / 86400000);
        return (entry.count || 1) * Math.exp(-ageDays / 7);
    },

    _palRecord(entry) {
        try {
            let arr = this._palReadRecent();
            const now = Date.now();
            const ix = arr.findIndex((e) => e && e.key === entry.key);
            if (ix !== -1) {
                arr[ix] = { ...arr[ix], ...entry, count: (arr[ix].count || 1) + 1, at: now };
            } else {
                arr.unshift({ ...entry, count: 1, at: now });
            }
            arr = arr.slice(0, 12);
            localStorage.setItem('alexandria_palette_recent', JSON.stringify(arr));
        } catch { /* private mode */ }
    },

    _palYearOf(r) {
        const d = r.release_date || r.first_air_date || '';
        return typeof d === 'string' && d.length >= 4 ? d.slice(0, 4) : '';
    },

    _palThumb(path) {
        try {
            const url = path ? this.imageUrl(path, 'w92') : '';
            if (typeof url === 'string' && url.startsWith('http')) return url;
        } catch { /* ignore */ }
        return '';
    },

    initPalette() {
        if (this._palBound) return;
        this._palBound = true;
        const host = this;
        window.addEventListener('keydown', (e) => {
            try {
                if (e.isComposing || e.composed || e.keyCode === 229) return;
            } catch { /* ignore */ }
            const isK = e.key === 'k' || e.key === 'K';
            if ((e.ctrlKey || e.metaKey) && isK) {
                e.preventDefault();
                host.toggle();
            }
        });
    },

    toggle() {
        if (this._palOpen) this.closePalette();
        else this.openPalette();
    },

    openPalette() {
        this.initPalette();
        if (this._palOpen) return;
        this._palOpen = true;
        try { this._palOpener = document.activeElement; } catch { this._palOpener = null; }
        const host = this;

        const overlay = document.createElement('div');
        overlay.className = 'palette-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Command palette');
        overlay.id = 'palette-overlay';

        overlay.innerHTML = `
            <div class="palette-panel" role="document">
                <button type="button" class="palette-grip" aria-label="Close command palette"></button>
                <div class="palette-searchrow">
                    <span class="palette-prefix" aria-hidden="true">K</span>
                    <input type="text" class="palette-input" placeholder="Jump to a title or command…" autocomplete="off" spellcheck="false"
                        role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant="" aria-label="Command palette">
                    <button type="button" class="palette-esc" aria-label="Close">ESC</button>
                </div>
                <div class="palette-list" id="palette-list" role="listbox" aria-label="Results"></div>
                <div class="palette-footer" aria-hidden="true">
                    <span><kbd>Up</kbd><kbd>Down</kbd> move</span>
                    <span><kbd>Enter</kbd> open</span>
                    <span><kbd>Ctrl+Enter</kbd> play</span>
                    <span><kbd>Esc</kbd> close</span>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        this._palOverlay = overlay;
        this._palInput = overlay.querySelector('.palette-input');
        this._palList = overlay.querySelector('.palette-list');
        this._palItems = [];
        this._palActive = 0;
        this._palTitles = [];
        this._palQuery = '';

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) host.closePalette();
        });
        overlay.querySelector('.palette-grip')?.addEventListener('click', () => host.closePalette());
        overlay.querySelector('.palette-esc')?.addEventListener('click', () => host.closePalette());

        overlay.addEventListener('keydown', (e) => {
            if (['Escape', 'ArrowUp', 'ArrowDown', 'Enter', 'Home', 'End', ' '].includes(e.key) || e.key === 'f' || e.key === 'F') {
                e.stopPropagation();
            }
            if (e.key === 'Escape') { e.preventDefault(); host.closePalette(); return; }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopPropagation(); host.closePalette(); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); host._palMove(1); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); host._palMove(-1); return; }
            if (e.key === 'Home') { e.preventDefault(); host._palMove(-9999); return; }
            if (e.key === 'End') { e.preventDefault(); host._palMove(9999); return; }
            if (e.key === 'Enter') { e.preventDefault(); host._palRun(e.ctrlKey || e.metaKey); }
        });

        this._palInput.addEventListener('input', () => {
            host._palQuery = host._palInput.value || '';
            host._palActive = 0;
            host._palRenderCommands();
            clearTimeout(host._palDebounce);
            const q = host._palQuery.trim();
            if (!q) { host._palTitles = []; host._palRenderCommands(); return; }
            host._palDebounce = setTimeout(() => host._palSearch(q), 200);
        });

        this._palRenderCommands();
        this._palInput.focus();
    },

    closePalette() {
        if (!this._palOpen) return;
        this._palOpen = false;
        clearTimeout(this._palDebounce);
        this._palReqId += 1;
        try { this._palOverlay?.remove(); } catch { /* ignore */ }
        this._palOverlay = null;
        this._palInput = null;
        this._palList = null;
        this._palItems = [];
        try {
            if (this._palOpener && document.contains(this._palOpener)) this._palOpener.focus();
        } catch { /* ignore */ }
        this._palOpener = null;
    },

    _palMove(delta) {
        if (!this._palItems.length) return;
        if (delta < -100) this._palActive = 0;
        else if (delta > 100) this._palActive = this._palItems.length - 1;
        else this._palActive = (this._palActive + delta + this._palItems.length) % this._palItems.length;
        this._palPaintActive();
    },

    _palPaintActive() {
        if (!this._palList) return;
        const rows = this._palList.querySelectorAll('[role="option"]');
        rows.forEach((row, i) => {
            const on = i === this._palActive;
            row.classList.toggle('active', on);
            row.setAttribute('aria-selected', String(on));
            if (on) {
                try { this._palInput?.setAttribute('aria-activedescendant', row.id); } catch { /* ignore */ }
                try { row.scrollIntoView({ block: 'nearest' }); } catch { /* ignore */ }
            }
        });
    },

    async _palSearch(q) {
        const myId = ++this._palReqId;
        try {
            const data = await this.getJson('search/multi?query=' + encodeURIComponent(q), { noCache: true });
            if (myId !== this._palReqId || !this._palOpen) return;
            const results = (data.results || []).filter((r) => r && r.media_type !== 'person' && (r.media_type === 'movie' || r.media_type === 'tv'));
            this._palTitles = results.slice(0, 5);
        } catch {
            if (myId !== this._palReqId || !this._palOpen) return;
            this._palTitles = [];
        }
        this._palRenderCommands();
    },

    _palRenderCommands() {
        if (!this._palOpen || !this._palList) return;
        const q = (this._palQuery || '').trim();
        const esc = (s) => this.escapeHtml(String(s == null ? '' : s));
        const groups = [];

        const recents = this._palReadRecent()
            .slice()
            .sort((a, b) => this._palScoreRecent(b) - this._palScoreRecent(a));
        let recentItems = [];
        if (!q) {
            recentItems = recents.slice(0, 3).map((r) => ({ ...r, _group: 'Recent', _fuzzy: { score: 0, indices: [] } }));
        } else {
            recentItems = recents.map((r) => ({ ...r, _group: 'Recent', _fuzzy: this._palFuzzy(q, r.label || '') }))
                .filter((r) => r._fuzzy.score > 0).slice(0, 3);
        }

        let cmdMatches;
        if (!q) {
            cmdMatches = this._palCommands().map((c) => ({ kind: 'cmd', ...c, _group: 'Commands', _fuzzy: { score: 0, indices: [] } }));
        } else {
            cmdMatches = this._palCommands()
                .map((c) => ({ kind: 'cmd', ...c, _group: 'Commands', _fuzzy: this._palFuzzy(q, c.label) }))
                .filter((c) => c._fuzzy.score > 0)
                .sort((a, b) => b._fuzzy.score - a._fuzzy.score)
                .slice(0, 5);
        }

        const titleItems = (this._palTitles || []).map((r) => {
            const type = r.media_type === 'tv' ? 'tv' : 'movie';
            const title = r.title || r.name || 'Untitled';
            const year = this._palYearOf(r);
            const poster = this._palThumb(r.poster_path);
            const fuzzy = q ? this._palFuzzy(q, title) : { score: 0, indices: [] };
            return { kind: 'title', key: `title:${type}:${r.id}`, label: title, year, type, tmdbId: r.id, poster, _group: 'Titles', _fuzzy: fuzzy };
        });

        const flat = [...recentItems, ...cmdMatches, ...titleItems].slice(0, 10);
        this._palItems = flat;
        if (this._palActive >= flat.length) this._palActive = 0;

        if (!flat.length) {
            this._palList.innerHTML = `<div class="palette-empty">No reels for &ldquo;${esc(q)}&rdquo; &mdash; try a title or year.</div>`;
            try { this._palInput?.setAttribute('aria-activedescendant', ''); } catch { /* ignore */ }
            return;
        }

        let html = '';
        let lastGroup = '';
        flat.forEach((item, i) => {
            if (item._group !== lastGroup) {
                lastGroup = item._group;
                html += `<p class="palette-group" role="presentation">${esc(lastGroup)}</p>`;
            }
            const id = `palette-opt-${i}`;
            if (item.kind === 'cmd' || item._group === 'Recent' && item.kind !== 'title') {
                if (item.kind === 'title' || (item._group === 'Recent' && item.tmdbId)) {
                    html += this._palTitleRow(item, i, id, q);
                } else {
                    const label = q && item._fuzzy.indices.length ? this._palHighlight(item.label, item._fuzzy.indices) : esc(item.label);
                    html += `<div class="palette-row${i === this._palActive ? ' active' : ''}" role="option" id="${id}" aria-selected="${i === this._palActive}" data-ix="${i}">
                        <span class="palette-cmd-dot" aria-hidden="true"></span>
                        <span class="palette-cmd-label">${label}</span>
                        <span class="palette-cmd-hint">${esc(item.hint || '')}</span>
                    </div>`;
                }
            } else if (item.kind === 'title') {
                html += this._palTitleRow(item, i, id, q);
            } else {
                const label = q && item._fuzzy.indices.length ? this._palHighlight(item.label, item._fuzzy.indices) : esc(item.label);
                html += `<div class="palette-row${i === this._palActive ? ' active' : ''}" role="option" id="${id}" aria-selected="${i === this._palActive}" data-ix="${i}">
                    <span class="palette-cmd-label">${label}</span>
                </div>`;
            }
        });
        this._palList.innerHTML = html;
        this._palList.querySelectorAll('.palette-row').forEach((row) => {
            row.addEventListener('click', () => {
                this._palActive = Number(row.dataset.ix) || 0;
                this._palRun(false);
            });
            row.addEventListener('mousemove', () => {
                const ix = Number(row.dataset.ix) || 0;
                if (ix !== this._palActive) { this._palActive = ix; this._palPaintActive(); }
            });
        });
        this._palPaintActive();
    },

    _palTitleRow(item, i, id, q) {
        const esc = (s) => this.escapeHtml(String(s == null ? '' : s));
        const label = q && item._fuzzy.indices.length ? this._palHighlight(item.label, item._fuzzy.indices) : esc(item.label);
        const badge = item.type === 'tv' ? 'SERIES' : 'FILM';
        const thumb = item.poster
            ? `<img class="palette-thumb" src="${esc(item.poster)}" alt="" loading="lazy" width="40" height="60">`
            : `<span class="palette-thumb palette-thumb-fallback" aria-hidden="true">${esc((item.label || 'A').trim().charAt(0).toUpperCase() || 'A')}</span>`;
        return `<div class="palette-row palette-title-row${i === this._palActive ? ' active' : ''}" role="option" id="${id}" aria-selected="${i === this._palActive}" data-ix="${i}">
            ${thumb}
            <span class="palette-title-main"><span class="palette-title-name">${label}</span>
            <span class="palette-title-sub">${esc(item.year || '----')} <span class="palette-badge">${badge}</span></span></span>
        </div>`;
    },

    _palRun(play) {
        const item = this._palItems[this._palActive];
        if (!item) return;
        if (item.kind === 'cmd' || (item._group !== 'Titles' && !item.tmdbId && item.hash)) {
            this._palRecord({ key: item.key, kind: 'cmd', label: item.label, hint: item.hint, hash: item.hash });
            const hash = item.hash;
            this.closePalette();
            window.location.hash = hash;
            return;
        }
        const type = item.type === 'tv' ? 'tv' : 'movie';
        const id = item.tmdbId;
        const year = item.year || '';
        const poster = item.poster || '';
        this._palRecord({ key: item.key, kind: 'title', label: item.label, year, type, tmdbId: id, poster, hash: `#details/${type}/${id}` });
        this.closePalette();
        if (play) {
            window.location.hash = type === 'movie' ? `#movie/${id}` : `#tv/${id}/s/1/e/1`;
        } else {
            window.location.hash = `#details/${type}/${id}`;
        }
    }
};

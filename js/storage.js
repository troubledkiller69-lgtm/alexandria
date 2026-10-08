export const storage = {
    // Loads the library from this device, then reconciles it with the cloud when
    // signed in. Cloud reconciliation lives in js/sync.js.
    async syncFromCloud() {
        try {
            const watchlist = this.loadLocalList('alexandria_watchlist', [], Array.isArray);
            const rawHistory = this.loadLocalList('alexandria_history', [], Array.isArray);
            const episodes = this.loadLocalList('alexandria_watched_episodes', {}, v => v && typeof v === 'object' && !Array.isArray(v));

            const cleanHistory = rawHistory.filter(i => i && i.id != null && i.type !== 'sports' && String(i.id).match(/^\d+$/));
            // One entry per title (newest first). Collapses old per-episode
            // duplicates from before into a single card carrying the latest episode.
            this.state.watchlist = this.dedupeItems(watchlist).map(w => this.normalizeLibraryItem(w));
            this.state.history = this.dedupeItems(cleanHistory, { forHistory: true }).slice(0, 20);
            this.state.watchedEpisodes = episodes;
            this.writeSynced('alexandria_watchlist', this.state.watchlist);
            this.writeSynced('alexandria_history', this.state.history);
            this.writeSynced('alexandria_watched_episodes', this.state.watchedEpisodes);

            if (this.supabase && this.state.authUser) await this.syncNow({ pull: true });
        } catch (e) {
            // Never wipe in-memory state on a load error — keep what we have.
            console.warn('Alexandria: could not load your library, keeping in-memory lists', e);
        }
    },

    // Reads a saved list. If the stored text cannot be parsed or has the wrong
    // shape, the original text is kept under a backup key before falling back.
    loadLocalList(key, fallback, isValid) {
        const raw = this.readStorage(localStorage, key, null);
        if (raw == null || raw === '') return fallback;
        try {
            const parsed = JSON.parse(raw);
            if (parsed != null && isValid(parsed)) return parsed;
        } catch { /* handled below */ }
        try { localStorage.setItem(`${key}.bak-${Date.now()}`, raw); } catch { /* storage full */ }
        this.showToast('Part of your saved library could not be read. A copy was kept.');
        return fallback;
    },

    // Personal layer (Letterboxd-style): backfill defaults so items saved before
    // ratings and reviews existed still render.
    normalizeLibraryItem(w) {
        const r = Number(w.userRating);
        return {
            ...w,
            status: w.status || 'want',
            watched_at: w.watched_at || null,
            userRating: Number.isFinite(r) ? Math.min(5, Math.max(0, Math.round(r * 2) / 2)) : 0,
            userReview: typeof w.userReview === 'string' ? w.userReview : '',
            year: w.year || '',
            score: Number.isFinite(Number(w.score)) ? Number(w.score) : 0
        };
    },

    async toggleWatchlist(item) {
        const itemId = String(item.id);
        const index = this.state.watchlist.findIndex(i => String(i.id) === itemId && i.type === item.type);

        // Removing a title also deletes its rating and review, so confirm first.
        if (index !== -1) {
            const existing = this.state.watchlist[index];
            const hasPersonal = Number(existing.userRating) > 0 || String(existing.userReview || '').trim() !== '';
            if (hasPersonal && !window.confirm('Remove this title? Its rating and review will be deleted too.')) return;
        }

        document.querySelectorAll(`.log-btn[data-id="${itemId}"][data-type="${item.type}"]`).forEach(btn => {
            const isActive = btn.classList.contains('active');
            btn.classList.toggle('active');
            btn.textContent = isActive ? '+' : '✓';
            btn.setAttribute('aria-pressed', String(!isActive));
            btn.setAttribute('aria-label', isActive ? 'Add to watchlist' : 'Remove from watchlist');
        });

        if (index === -1) {
            this.state.watchlist.unshift(item);
        } else {
            this.state.watchlist.splice(index, 1);
        }

        this.writeLocalList('alexandria_watchlist', this.state.watchlist);
        this.showToast(index === -1 ? 'Added to your watchlist.' : 'Removed from your watchlist.');

        if (this.state.view === 'home') this.renderWatchlist();
        else if (this.state.view === 'watchlist') this.renderWatchlistPage();
    },

    async addToHistory(item) {
        if (!item || item.id == null || !item.type) return;
        const entry = { ...item, watchedAt: new Date().toISOString() };
        this.state.history = this.dedupeItems([entry, ...this.state.history]);
        if (this.state.history.length > 20) this.state.history.pop();
        this.writeLocalList('alexandria_history', this.state.history);

        // Refresh the Continue Watching section on home page if visible
        if (this.state.view === 'home' && typeof this.renderHistory === 'function') {
            this.renderHistory();
        }

        if (['movie', 'tv'].includes(item.type) && String(item.id).match(/^\d+$/)) {
            // Session dedupe: re-opening the same content within the window isn't a new "started watching".
            const season = item.type === 'tv' ? (Number(item.season) || 0) : null;
            const episode = item.type === 'tv' ? (Number(item.episode) || 0) : null;
            const logKey = item.type + '_' + item.id + '_s' + (season || 0) + '_e' + (episode || 0);
            const now = Date.now();
            if (!this._lastWatchLog || this._lastWatchLog.key !== logKey || now - this._lastWatchLog.ts > this._WATCH_LOG_DEDUPE_MS) {
                this._lastWatchLog = { key: logKey, ts: now };
                this.logActivity('watching', {
                    contentId: item.id,
                    contentType: item.type,
                    title: item.title,
                    posterPath: item.poster_path,
                    meta: item.type === 'tv' ? JSON.stringify({ season, episode }) : null
                });
            }
        }
    },

};

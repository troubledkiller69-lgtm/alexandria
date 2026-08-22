export const storage = {
    async syncFromCloud() {
        try {
            let localWatchlist = this.readStorageJson(localStorage, 'alexandria_watchlist', []) || [];
            let rawHistory = this.readStorageJson(localStorage, 'alexandria_history', []) || [];
            let cleanHistory = Array.isArray(rawHistory)
                ? rawHistory.filter(i => i && i.id != null && i.type !== 'sports' && String(i.id).match(/^\d+$/))
                : [];
            let localEpisodes = this.readStorageJson(localStorage, 'alexandria_watched_episodes', {}) || {};

            localWatchlist = this.dedupeItems(localWatchlist);
            cleanHistory = this.dedupeItems(cleanHistory);

            if (this.supabase && this.state.authUser) {
                const uid = this.state.authUser.id;
                try {
                    // Three independent reads — fetch them concurrently.
                const [wlRes, epRes, histRes] = await Promise.all([
                    this.supabase.from('survival_cache').select('*').eq('user_id', uid),
                    this.supabase.from('watched_episodes').select('tmdb_id, season, episode').eq('user_id', uid),
                    this.supabase.from('history').select('*').eq('user_id', uid).order('created_at', { ascending: false })
                ]);
                const dbWatchlist = wlRes.data;
                const dbEpisodes = epRes.data;
                const dbHistory = histRes.data;

                if (Array.isArray(dbWatchlist) && dbWatchlist.length > 0) {
                    const cloudList = dbWatchlist.map(w => ({
                        id: w.tmdb_id,
                        type: w.media_type,
                        title: w.title,
                        poster_path: w.poster_path,
                        status: w.status || 'want',
                        watched_at: w.watched_at || null
                    }));
                    // Local first: changes made on this device (even signed out)
                    // win over the cloud copy; fresh devices still inherit the cloud.
                    localWatchlist = this.dedupeItems([...localWatchlist, ...cloudList]);
                }

                if (Array.isArray(dbEpisodes)) {
                    dbEpisodes.forEach(ep => {
                        localEpisodes[`${ep.tmdb_id}_s${ep.season}e${ep.episode}`] = true;
                    });
                }

                if (Array.isArray(dbHistory) && dbHistory.length > 0) {
                        const cloudHist = dbHistory.map(h => ({
                            id: h.content_id,
                            type: h.type,
                            title: h.title,
                            poster_path: h.poster_path
                        }));
                        cleanHistory = this.dedupeItems([...cloudHist, ...cleanHistory]);
                    }

                    // Push local-only episode marks up so per-episode progress
                    // transfers too (same pull-only gap as the watchlist).
                    const cloudEpKeys = new Set((dbEpisodes || []).map(ep => `${ep.tmdb_id}_s${ep.season}e${ep.episode}`));
                    const epToPush = [];
                    for (const [key, val] of Object.entries(localEpisodes)) {
                        if (!val || cloudEpKeys.has(key)) continue;
                        const m = key.match(/^(\d+)_s(\d+)e(\d+)$/);
                        if (!m) continue;
                        epToPush.push({ user_id: uid, tmdb_id: Number(m[1]), season: Number(m[2]), episode: Number(m[3]) });
                    }
                    if (epToPush.length > 0) {
                        await this.supabase.from('watched_episodes').upsert(epToPush, { onConflict: 'user_id, tmdb_id, season, episode' });
                    }

                    // Push local-only items and status differences up so the
                    // watchlist transfers across devices even for titles added
                    // while signed out (they never reached the cloud before).
                    const cloudKeys = new Set((dbWatchlist || []).map(w => `${w.media_type}_${String(w.tmdb_id)}`));
                    const toPush = localWatchlist
                        .filter(i => {
                            const key = `${i.type}_${String(i.id)}`;
                            const cloudRow = (dbWatchlist || []).find(w => `${w.media_type}_${String(w.tmdb_id)}` === key);
                            return !cloudRow || cloudRow.status !== (i.status || 'want');
                        })
                        .map(i => ({
                            user_id: uid,
                            tmdb_id: Number(i.id),
                            media_type: i.type,
                            title: i.title || null,
                            poster_path: i.poster_path || null,
                            status: i.status || 'want',
                            watched_at: i.watched_at || null
                        }));
                    if (toPush.length > 0) {
                        await this.supabase.from('survival_cache').upsert(toPush, { onConflict: 'user_id, tmdb_id, media_type' });
                    }
                } catch (err) {
                    console.warn("Alexandria: Cloud sync warning:", err);
                }
            }

            this.state.watchlist = this.dedupeItems(localWatchlist);
            this.state.watchlist.forEach(w => {
                w.status = w.status || 'want';
                w.watched_at = w.watched_at || null;
            });
            this.state.history = this.dedupeItems(cleanHistory);
            this.state.watchedEpisodes = localEpisodes;
            this.writeLocalList('alexandria_watchlist', this.state.watchlist);
            this.writeLocalList('alexandria_history', this.state.history);
            this.writeLocalList('alexandria_watched_episodes', this.state.watchedEpisodes);
        } catch {
            this.state.watchlist = [];
            this.state.history = [];
            this.state.watchedEpisodes = {};
        }
    },

    async toggleWatchlist(item) {
        const itemId = String(item.id);
        const index = this.state.watchlist.findIndex(i => String(i.id) === itemId && i.type === item.type);

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

        if (this.supabase && this.state.authUser && String(item.id).match(/^\d+$/)) {
            const uid = this.state.authUser.id;
            if (index === -1) {
                this.supabase.from('survival_cache').upsert({
                    user_id: uid,
                    tmdb_id: Number(item.id),
                    media_type: item.type,
                    title: item.title,
                    poster_path: item.poster_path,
                    status: 'want'
                }, { onConflict: 'user_id, tmdb_id, media_type' }).then();
            } else {
                this.supabase.from('survival_cache')
                    .delete()
                    .eq('user_id', uid)
                    .eq('tmdb_id', Number(item.id))
                    .eq('media_type', item.type)
                    .then();
            }
        }

        if (this.state.view === 'home') this.renderWatchlist();
        else if (this.state.view === 'watchlist') this.renderWatchlistPage();
    },

    async addToHistory(item) {
        if (!item || item.id == null || !item.type) return;
        this.state.history = this.dedupeItems([item, ...this.state.history]);
        if (this.state.history.length > 20) this.state.history.pop();
        this.writeLocalList('alexandria_history', this.state.history);

        if (this.supabase && this.state.authUser && String(item.id).match(/^\d+$/)) {
            this.supabase.from('history').upsert({
                user_id: this.state.authUser.id,
                content_id: Number(item.id),
                type: item.type,
                title: item.title,
                poster_path: item.poster_path
            }, { onConflict: 'user_id, content_id, type' }).then();
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

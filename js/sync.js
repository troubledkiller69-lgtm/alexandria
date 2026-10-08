// Cross-device sync for the personal library: watchlist (with diary rating and
// review), watched episodes and Continue Watching.
//
// Four rules:
//  1. Every change made on this device is recorded in an outbox, keyed by entity
//     ("library|movie_603"). The outbox is what this device still owes the cloud.
//  2. Removals are soft. The cloud keeps a row with deleted_at set, so other
//     devices learn about the removal instead of re-adding the item.
//  3. A pull applies a cloud row only when this device has no pending change for
//     that entity. A pending change always wins, so an older snapshot can never
//     overwrite something the user just did.
//  4. The library belongs to one account at a time. Switching accounts moves the
//     previous account's data, with its outbox, into a stash. It is never pushed
//     into the new account.

const OWNER_KEY = 'alexandria_owner';
const OUTBOX_KEY = 'alexandria_outbox';
const LIBRARY_KEY = 'alexandria_watchlist';
const HISTORY_KEY = 'alexandria_history';
const EPISODES_KEY = 'alexandria_watched_episodes';
const HISTORY_CAP = 20;
const PAGE_SIZE = 1000;
const CHUNK_SIZE = 500;
const FLUSH_DELAY_MS = 1200;
const RETRY_MAX_MS = 5 * 60 * 1000;
const EPISODE_KEY_RE = /^(\d+)_s(\d+)e(\d+)$/;

const libraryKeyOf = item => (item && item.type && /^\d+$/.test(String(item.id)))
    ? `${item.type}_${Number(item.id)}`
    : null;
const episodeKeyOf = (tmdbId, season, episode) => `${tmdbId}_s${season}e${episode}`;
const libraryFingerprint = item => JSON.stringify([
    item.status || 'want', item.watched_at || null, item.title || '', item.poster_path || null,
    Number(item.userRating) || 0, String(item.userReview || '')
]);
// Progress is deliberately not part of the fingerprint: it changes every few
// seconds during playback and is pushed on pause, leave and a slow timer instead.
const historyFingerprint = item => JSON.stringify([
    item.title || '', item.poster_path || null, Number(item.season) || 0, Number(item.episode) || 0, item.watchedAt || null
]);

const STORE_BY_KEY = {
    [LIBRARY_KEY]: { name: 'library', keyOf: libraryKeyOf, fingerprint: libraryFingerprint },
    [HISTORY_KEY]: { name: 'history', keyOf: libraryKeyOf, fingerprint: historyFingerprint },
    [EPISODES_KEY]: { name: 'episodes' }
};
const STORE_BY_NAME = Object.fromEntries(
    Object.entries(STORE_BY_KEY).map(([lsKey, store]) => [store.name, { ...store, lsKey }])
);

// Index a local list (or the episodes map) as entity key -> fingerprint.
function indexStore(name, value) {
    const index = new Map();
    if (name === 'episodes') {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const [key, on] of Object.entries(value)) if (on) index.set(key, '1');
        }
        return index;
    }
    if (!Array.isArray(value)) return index;
    const { keyOf, fingerprint } = STORE_BY_NAME[name];
    for (const item of value) {
        const key = keyOf(item);
        if (key && !index.has(key)) index.set(key, fingerprint(item));
    }
    return index;
}

function unionByKey(primary, extra, keyOf) {
    const keys = new Set((primary || []).map(keyOf).filter(Boolean));
    const out = [...(primary || [])];
    for (const item of Array.isArray(extra) ? extra : []) {
        const key = keyOf(item);
        if (key && !keys.has(key)) { keys.add(key); out.push(item); }
    }
    return out;
}

export const sync = {
    // ---- outbox and snapshots ------------------------------------------------

    readOutbox() {
        const box = this.readStorageJson(localStorage, OUTBOX_KEY, null);
        return box && box.items && typeof box.items === 'object' ? box : { items: {} };
    },

    saveOutbox(box) {
        this.writeStorage(localStorage, OUTBOX_KEY, JSON.stringify(box));
    },

    addDirty(box, name, key) {
        const id = `${name}|${key}`;
        box.items[id] = (box.items[id] || 0) + 1;
    },

    // Last known fingerprints for each synced list, so a write can be diffed.
    noteSnapshot(lsKey, value) {
        const store = STORE_BY_KEY[lsKey];
        if (!store) return;
        if (!this._snapshots) this._snapshots = {};
        this._snapshots[store.name] = indexStore(store.name, value);
    },

    // Called by writeLocalList for every user-driven write, before the write
    // lands. Records each entity that was added, changed or removed.
    noteLocalWrite(lsKey, value) {
        const store = STORE_BY_KEY[lsKey];
        if (!store) return;
        if (!this._snapshots) this._snapshots = {};
        if (!this._snapshots[store.name]) {
            this._snapshots[store.name] = indexStore(store.name, this.readStorageJson(localStorage, lsKey, store.name === 'episodes' ? {} : []));
        }
        const before = this._snapshots[store.name];
        const after = indexStore(store.name, value);
        const box = this.readOutbox();
        let changed = false;
        for (const [key, fp] of after) {
            if (before.get(key) !== fp) { this.addDirty(box, store.name, key); changed = true; }
        }
        for (const key of before.keys()) {
            if (!after.has(key)) { this.addDirty(box, store.name, key); changed = true; }
        }
        this._snapshots[store.name] = after;
        if (changed) {
            this.saveOutbox(box);
            this.scheduleSync(FLUSH_DELAY_MS);
        }
    },

    // For writes that come from the cloud or from loading, not from the user.
    writeSynced(lsKey, value) {
        this.noteSnapshot(lsKey, value);
        try {
            localStorage.setItem(lsKey, JSON.stringify(value));
        } catch (error) {
            console.warn(`Alexandria: Could not save ${lsKey}.`, error);
        }
    },

    // Explicit mark for changes the diff cannot see, such as playback progress.
    markSyncDirty(name, key) {
        const box = this.readOutbox();
        this.addDirty(box, name, key);
        this.saveOutbox(box);
        this.scheduleSync(FLUSH_DELAY_MS);
    },

    // ---- scheduling ----------------------------------------------------------

    scheduleSync(delay = 0, pull = false) {
        this._pullWanted = this._pullWanted || pull;
        clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => {
            const wantPull = this._pullWanted;
            this._pullWanted = false;
            this.syncNow({ pull: wantPull });
        }, delay);
    },

    // One sync at a time. Flush first so the cloud sees this device's changes,
    // then pull what other devices did, then flush whatever the pull created.
    async syncNow({ pull = true } = {}) {
        if (!this.supabase || !this.state.authUser) return false;
        if (this._syncRunning) {
            this._syncQueued = { pull: Boolean(this._syncQueued?.pull || pull) };
            return false;
        }
        this._syncRunning = true;
        let ok = true;
        try {
            ok = await this.flushOutbox();
            if (ok && pull) ok = await this.pullFromCloud();
            if (ok && Object.keys(this.readOutbox().items).length) ok = await this.flushOutbox();
        } finally {
            this._syncRunning = false;
            const queued = this._syncQueued;
            this._syncQueued = null;
            if (queued) this.scheduleSync(0, queued.pull);
        }
        if (ok) {
            this._retryDelay = 0;
            this._syncWarned = false;
        } else {
            this._retryDelay = Math.min((this._retryDelay || 2000) * 2, RETRY_MAX_MS);
            if (!this._syncWarned) {
                this._syncWarned = true;
                this.showToast('Saved on this device. Sync will retry automatically.');
            }
            this.scheduleSync(this._retryDelay, pull);
        }
        return ok;
    },

    // ---- push ----------------------------------------------------------------

    async flushOutbox() {
        const uid = this.state.authUser?.id;
        const box = this.readOutbox();
        const ids = Object.keys(box.items);
        if (!ids.length) return true;
        // Only the account that owns this device's data may push it.
        if (!this.supabase || !uid || this.readOwner() !== uid) return true;

        const now = new Date().toISOString();
        const libraryByKey = new Map((this.state.watchlist || []).map(i => [libraryKeyOf(i), i]).filter(([k]) => k));
        const historyByKey = new Map((this.state.history || []).map(i => [libraryKeyOf(i), i]).filter(([k]) => k));
        const episodes = this.state.watchedEpisodes || {};
        const rows = { survival_cache: [], diary_entries: [], watched_episodes: [], history: [] };
        const sent = [];

        for (const id of ids) {
            const sep = id.indexOf('|');
            const name = id.slice(0, sep);
            const key = id.slice(sep + 1);
            sent.push([id, box.items[id]]);

            if (name === 'library') {
                const [type, rawId] = [key.slice(0, key.indexOf('_')), Number(key.slice(key.indexOf('_') + 1))];
                const item = libraryByKey.get(key);
                const rating = item ? Number(item.userRating) || 0 : 0;
                const review = item ? String(item.userReview || '').trim() : '';
                const live = Boolean(item);
                rows.survival_cache.push({
                    user_id: uid, tmdb_id: rawId, media_type: type,
                    title: live ? (item.title || null) : null,
                    poster_path: live ? (item.poster_path || null) : null,
                    status: live ? (item.status || 'want') : 'want',
                    watched_at: live ? (item.watched_at || null) : null,
                    deleted_at: live ? null : now
                });
                const hasDiary = live && (rating > 0 || review !== '');
                rows.diary_entries.push({
                    user_id: uid, tmdb_id: rawId, media_type: type,
                    rating: hasDiary && rating > 0 ? rating : null,
                    review: hasDiary && review !== '' ? review : null,
                    deleted_at: hasDiary ? null : now
                });
            } else if (name === 'episodes') {
                const m = key.match(EPISODE_KEY_RE);
                if (!m) continue;
                const live = Boolean(episodes[key]);
                rows.watched_episodes.push({
                    user_id: uid, tmdb_id: m[1], season: Number(m[2]), episode: Number(m[3]),
                    watched_at: now, deleted_at: live ? null : now
                });
            } else if (name === 'history') {
                const [type, rawId] = [key.slice(0, key.indexOf('_')), Number(key.slice(key.indexOf('_') + 1))];
                const item = historyByKey.get(key);
                rows.history.push(item ? {
                    user_id: uid, content_id: rawId, type,
                    title: item.title || '', poster_path: item.poster_path || null,
                    season: Number(item.season) || 0, episode: Number(item.episode) || 0,
                    progress: Number(item.progress) || 0,
                    watched_at: item.watchedAt || now, deleted_at: null
                } : {
                    user_id: uid, content_id: rawId, type, title: '', poster_path: null,
                    season: 0, episode: 0, progress: 0, watched_at: now, deleted_at: now
                });
            }
        }

        const plan = [
            ['survival_cache', rows.survival_cache, 'user_id,tmdb_id,media_type'],
            ['diary_entries', rows.diary_entries, 'user_id,tmdb_id,media_type'],
            ['watched_episodes', rows.watched_episodes, 'user_id,tmdb_id,season,episode'],
            ['history', rows.history, 'user_id,content_id,type']
        ];
        for (const [table, list, onConflict] of plan) {
            for (let i = 0; i < list.length; i += CHUNK_SIZE) {
                const { error } = await this.supabase.from(table).upsert(list.slice(i, i + CHUNK_SIZE), { onConflict });
                if (error) {
                    console.warn(`Alexandria: sync push to ${table} failed`, error);
                    return false;
                }
            }
        }

        // Clear only what was sent and is still the same version. A change made
        // during the upload bumped its version and stays queued.
        const after = this.readOutbox();
        for (const [id, version] of sent) {
            if (after.items[id] === version) delete after.items[id];
        }
        this.saveOutbox(after);
        return true;
    },

    // ---- pull ----------------------------------------------------------------

    async pullFromCloud() {
        const uid = this.state.authUser?.id;
        if (!this.supabase || !uid || this.readOwner() !== uid) return false;
        const [lib, diary, eps, hist] = await Promise.all([
            this.fetchAllRows('survival_cache', 'tmdb_id, media_type, title, poster_path, status, watched_at, deleted_at', uid),
            this.fetchAllRows('diary_entries', 'tmdb_id, media_type, rating, review, deleted_at', uid),
            this.fetchAllRows('watched_episodes', 'tmdb_id, season, episode, deleted_at', uid),
            this.fetchAllRows('history', 'content_id, type, title, poster_path, season, episode, progress, watched_at, deleted_at', uid)
        ]);
        if (!lib || !diary || !eps || !hist) return false;
        // The account may have changed while the rows were in flight.
        if (this.readOwner() !== uid) return false;
        this.applyCloudSnapshot({ lib, diary, eps, hist });
        return true;
    },

    async fetchAllRows(table, columns, uid) {
        const rows = [];
        for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await this.supabase.from(table)
                .select(columns)
                .eq('user_id', uid)
                .order('watched_at', { ascending: true, nullsFirst: true })
                .range(from, from + PAGE_SIZE - 1);
            if (error || !Array.isArray(data)) return null;
            rows.push(...data);
            if (data.length < PAGE_SIZE) return rows;
        }
    },

    // Synchronous on purpose: reads the current outbox and local state at the
    // moment of the merge, so nothing done while the rows were in flight is lost.
    applyCloudSnapshot(snapshot) {
        // Rows come from the cloud, so treat them as untrusted: ids must be numeric and
        // types must be known before they reach state or the DOM.
        const isTitleRow = r => /^\d+$/.test(String(r.tmdb_id ?? '')) && (r.media_type === 'movie' || r.media_type === 'tv');
        const isHistoryRow = r => /^\d+$/.test(String(r.content_id ?? '')) && (r.type === 'movie' || r.type === 'tv');
        const isEpisodeRow = r => /^\d+$/.test(String(r.tmdb_id ?? '')) && Number.isInteger(r.season) && Number.isInteger(r.episode);
        const lib = snapshot.lib.filter(isTitleRow);
        const diary = snapshot.diary.filter(isTitleRow);
        const eps = snapshot.eps.filter(isEpisodeRow);
        const hist = snapshot.hist.filter(isHistoryRow);
        const pending = this.readOutbox().items;
        const isPending = (name, key) => Object.prototype.hasOwnProperty.call(pending, `${name}|${key}`);
        // Entities this device has that the cloud has never seen. Pushed on the next flush.
        const unsent = [];

        // Library, with diary rating and review (the diary follows its title).
        const diaryByKey = new Map(diary.map(r => [`${r.media_type}_${Number(r.tmdb_id)}`, r]));
        const cloudByKey = new Map(lib.map(r => [`${r.media_type}_${Number(r.tmdb_id)}`, r]));
        const merged = [];
        const seen = new Set();
        for (const item of Array.isArray(this.state.watchlist) ? this.state.watchlist : []) {
            const key = libraryKeyOf(item);
            if (!key) { merged.push(item); continue; }
            if (seen.has(key)) continue;
            seen.add(key);
            if (isPending('library', key)) { merged.push(item); continue; }
            const row = cloudByKey.get(key);
            if (!row) { merged.push(item); unsent.push(['library', key]); continue; }
            if (row.deleted_at) continue;
            // A title whose diary was never pushed (rated before diaries synced) keeps its
            // local rating and review, and they go up on the next flush.
            if (!diaryByKey.has(key) && (Number(item.userRating) > 0 || String(item.userReview || '').trim() !== '')) {
                unsent.push(['library', key]);
            }
            merged.push(this.libraryItemFromRow(row, diaryByKey.get(key), item));
        }
        for (const [key, row] of cloudByKey) {
            if (seen.has(key) || row.deleted_at || isPending('library', key)) continue;
            merged.push(this.libraryItemFromRow(row, diaryByKey.get(key), null));
        }

        // Watched episodes.
        const episodes = { ...(this.state.watchedEpisodes || {}) };
        const epByKey = new Map(eps.map(r => [episodeKeyOf(r.tmdb_id, r.season, r.episode), r]));
        for (const [key, row] of epByKey) {
            if (isPending('episodes', key)) continue;
            if (row.deleted_at) delete episodes[key];
            else episodes[key] = true;
        }
        for (const key of Object.keys(episodes)) {
            if (episodes[key] && !epByKey.has(key) && !isPending('episodes', key)) unsent.push(['episodes', key]);
        }

        // Continue Watching: newest first, capped. Anything pushed past the cap is
        // a real removal and is tombstoned on the next flush.
        const histByKey = new Map(hist.map(r => [`${r.type}_${Number(r.content_id)}`, r]));
        const out = [];
        const handled = new Set();
        for (const item of Array.isArray(this.state.history) ? this.state.history : []) {
            const key = libraryKeyOf(item);
            if (!key) { out.push(item); continue; }
            if (handled.has(key)) continue;
            handled.add(key);
            if (isPending('history', key)) { out.push(item); continue; }
            const row = histByKey.get(key);
            if (!row) { out.push(item); unsent.push(['history', key]); continue; }
            if (row.deleted_at) continue;
            out.push(this.historyItemFromRow(row, item));
        }
        for (const [key, row] of histByKey) {
            if (handled.has(key) || row.deleted_at || isPending('history', key)) continue;
            out.push(this.historyItemFromRow(row, null));
        }
        out.sort((a, b) => (Date.parse(b.watchedAt) || 0) - (Date.parse(a.watchedAt) || 0));
        for (const item of out.slice(HISTORY_CAP)) {
            const key = libraryKeyOf(item);
            if (key && !isPending('history', key)) unsent.push(['history', key]);
        }
        const history = out.slice(0, HISTORY_CAP);

        this.state.watchlist = merged;
        this.state.history = history;
        this.state.watchedEpisodes = episodes;
        this.writeSynced(LIBRARY_KEY, merged);
        this.writeSynced(HISTORY_KEY, history);
        this.writeSynced(EPISODES_KEY, episodes);

        if (unsent.length) {
            const box = this.readOutbox();
            for (const [name, key] of unsent) this.addDirty(box, name, key);
            this.saveOutbox(box);
        }
        this.refreshLibraryViews();
    },

    libraryItemFromRow(row, diary, local) {
        // No diary row yet: keep whatever this device has. A deleted diary row means cleared.
        const keepLocal = !diary;
        const live = diary && !diary.deleted_at;
        return {
            ...(local || {}),
            id: Number(row.tmdb_id),
            type: row.media_type,
            title: row.title || '',
            poster_path: row.poster_path || null,
            status: row.status || 'want',
            watched_at: row.watched_at || null,
            userRating: keepLocal ? (Number(local?.userRating) || 0) : (live ? Number(diary.rating) || 0 : 0),
            userReview: keepLocal ? (local?.userReview || '') : (live ? (diary.review || '') : '')
        };
    },

    historyItemFromRow(row, local) {
        return {
            ...(local || {}),
            id: Number(row.content_id),
            type: row.type,
            title: row.title || '',
            poster_path: row.poster_path || null,
            season: Number(row.season) || 0,
            episode: Number(row.episode) || 0,
            progress: Number(row.progress) || 0,
            watchedAt: row.watched_at || null
        };
    },

    refreshLibraryViews() {
        if (this.state.view === 'home') {
            if (typeof this.renderWatchlist === 'function') this.renderWatchlist();
            if (typeof this.renderHistory === 'function') this.renderHistory();
        } else if (this.state.view === 'watchlist' && typeof this.renderWatchlistPage === 'function') {
            this.renderWatchlistPage();
        } else if (this.state.view === 'history' && typeof this.renderHistoryPage === 'function') {
            this.renderHistoryPage();
        }
    },

    // Another tab wrote one of the library lists. Take its version, but keep this
    // tab's pending changes, so a whole-list write can't erase them.
    applyStorageEvent(lsKey) {
        const store = STORE_BY_KEY[lsKey];
        if (!store) return;
        const pending = this.readOutbox().items;
        const isPending = key => Object.prototype.hasOwnProperty.call(pending, `${store.name}|${key}`);
        const incoming = this.readStorageJson(localStorage, lsKey, store.name === 'episodes' ? {} : []);
        const current = store.name === 'library' ? this.state.watchlist
            : store.name === 'history' ? this.state.history : this.state.watchedEpisodes;

        if (store.name === 'episodes') {
            const next = { ...(incoming || {}) };
            for (const key of Object.keys(current || {})) {
                if (isPending(key)) { if (current[key]) next[key] = true; else delete next[key]; }
            }
            for (const key of Object.keys(next)) {
                if (isPending(key) && !(current || {})[key]) delete next[key];
            }
            this.state.watchedEpisodes = next;
        } else {
            const list = Array.isArray(incoming) ? incoming : [];
            const currentByKey = new Map((current || []).map(i => [store.keyOf(i), i]));
            const next = [];
            const used = new Set();
            for (const item of list) {
                const key = store.keyOf(item);
                if (!key) { next.push(item); continue; }
                if (used.has(key)) continue;
                used.add(key);
                if (isPending(key)) {
                    if (currentByKey.has(key)) next.push(currentByKey.get(key));
                } else {
                    next.push(item);
                }
            }
            for (const item of current || []) {
                const key = store.keyOf(item);
                if (key && isPending(key) && !used.has(key)) { next.push(item); used.add(key); }
            }
            if (store.name === 'library') this.state.watchlist = next;
            else this.state.history = next.slice(0, HISTORY_CAP);
        }
        this.noteSnapshot(lsKey, store.name === 'library' ? this.state.watchlist
            : store.name === 'history' ? this.state.history : this.state.watchedEpisodes);
        this.refreshLibraryViews();
    },

    // ---- accounts ------------------------------------------------------------

    readOwner() {
        try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
    },

    writeOwner(uid) {
        try {
            if (uid) localStorage.setItem(OWNER_KEY, uid);
            else localStorage.removeItem(OWNER_KEY);
        } catch { /* storage blocked: sync still works for this session */ }
    },

    // Called on every auth change with the signed-in user's id, or null when
    // signed out.
    async reconcileAccount(uid) {
        const owner = this.readOwner();
        if (owner && owner !== uid) {
            this.stashLibrary(owner);
            this.clearLibrary();
        }
        if (!uid) {
            this.writeOwner(null);
            return;
        }
        const adopting = !owner;
        this.writeOwner(uid);
        const stash = this.takeStash(uid);
        if (stash) this.absorbStash(stash);
        // An anonymous library joins the account it is first signed into.
        if (adopting) this.markWholeLibraryDirty();
    },

    stashLibrary(owner) {
        const box = this.readOutbox();
        // Nothing pending means the cloud already has everything.
        if (!Object.keys(box.items).length) return;
        this.writeStorage(localStorage, `alexandria_stash_${owner}`, JSON.stringify({
            watchlist: this.state.watchlist || [],
            history: this.state.history || [],
            watchedEpisodes: this.state.watchedEpisodes || {},
            outbox: box.items
        }));
    },

    takeStash(uid) {
        const key = `alexandria_stash_${uid}`;
        const stash = this.readStorageJson(localStorage, key, null);
        if (stash) {
            try { localStorage.removeItem(key); } catch { /* ignore */ }
        }
        return stash;
    },

    absorbStash(stash) {
        this.state.watchlist = unionByKey(this.state.watchlist, stash.watchlist, libraryKeyOf);
        this.state.history = unionByKey(this.state.history, stash.history, libraryKeyOf)
            .sort((a, b) => (Date.parse(b.watchedAt) || 0) - (Date.parse(a.watchedAt) || 0))
            .slice(0, HISTORY_CAP);
        this.state.watchedEpisodes = { ...(stash.watchedEpisodes || {}), ...(this.state.watchedEpisodes || {}) };
        this.writeSynced(LIBRARY_KEY, this.state.watchlist);
        this.writeSynced(HISTORY_KEY, this.state.history);
        this.writeSynced(EPISODES_KEY, this.state.watchedEpisodes);
        const box = this.readOutbox();
        for (const [id, version] of Object.entries(stash.outbox || {})) {
            box.items[id] = Math.max(box.items[id] || 0, version);
        }
        this.saveOutbox(box);
        this.markWholeLibraryDirty();
        this.refreshLibraryViews();
    },

    clearLibrary() {
        this.state.watchlist = [];
        this.state.history = [];
        this.state.watchedEpisodes = {};
        this.writeSynced(LIBRARY_KEY, []);
        this.writeSynced(HISTORY_KEY, []);
        this.writeSynced(EPISODES_KEY, {});
        this.saveOutbox({ items: {} });
        this.refreshLibraryViews();
    },

    markWholeLibraryDirty() {
        const box = this.readOutbox();
        for (const item of this.state.watchlist || []) {
            const key = libraryKeyOf(item);
            if (key) this.addDirty(box, 'library', key);
        }
        for (const item of this.state.history || []) {
            const key = libraryKeyOf(item);
            if (key) this.addDirty(box, 'history', key);
        }
        for (const [key, on] of Object.entries(this.state.watchedEpisodes || {})) {
            if (on) this.addDirty(box, 'episodes', key);
        }
        this.saveOutbox(box);
    }
};

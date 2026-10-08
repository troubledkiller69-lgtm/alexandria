// Sync engine tests: two devices and a fake cloud, running the real js/sync.js.
// Run with: node tests/sync/sync.test.mjs
import { readFileSync } from 'node:fs';

// js/sync.js is a plain ES module with no imports, so it can load from a data: URL
// without touching the filesystem or the project's module type.
const source = readFileSync(new URL('../../js/sync.js', import.meta.url), 'utf8');
const { sync: syncMixin } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const LIB = 'alexandria_watchlist', HIST = 'alexandria_history', EPS = 'alexandria_watched_episodes';
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => { if (cond) { passed++; console.log('PASS', name); } else { failed++; console.log('FAIL', name, extra); } };

function makeCloud() {
  const tables = { survival_cache: [], diary_entries: [], watched_episodes: [], history: [] };
  const cloud = {
    tables, failNext: 0, calls: 0,
    from(table) {
      const rows = tables[table];
      const st = { filters: [], cols: null };
      const b = {
        select(cols) { st.cols = cols; return b; },
        eq(c, v) { st.filters.push([c, v]); return b; },
        order() { return b; },
        range(a, z) {
          const cols = st.cols.split(',').map(s => s.trim());
          const out = rows.filter(r => st.filters.every(([c, v]) => r[c] === v)).slice(a, z + 1)
            .map(r => Object.fromEntries(cols.map(c => [c, r[c] ?? null])));
          return Promise.resolve({ data: out, error: null });
        },
        upsert(list, { onConflict }) {
          cloud.calls++;
          if (cloud.failNext > 0) { cloud.failNext--; return Promise.resolve({ error: { message: 'network' } }); }
          const keys = onConflict.split(',').map(s => s.trim());
          for (const item of list) {
            const hit = rows.find(r => keys.every(k => String(r[k]) === String(item[k])));
            if (hit) Object.assign(hit, item); else rows.push({ ...item });
          }
          return Promise.resolve({ error: null });
        }
      };
      return b;
    }
  };
  return cloud;
}

function makeDevice(name, cloud, ls = new Map()) {
  const lsApi = { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
  const app = Object.assign({}, syncMixin, {
    state: { watchlist: [], history: [], watchedEpisodes: {}, view: 'home', authUser: null },
    supabase: cloud,
    toasts: [],
    showToast(m) { this.toasts.push(m); },
    readStorageJson(storage, key, fallback) {
      try { const raw = storage.getItem(key); if (raw == null || raw === '') return fallback; const p = JSON.parse(raw); return p == null ? fallback : p; } catch { return fallback; }
    },
    writeStorage(storage, key, value) { try { storage.setItem(key, value); return true; } catch { return false; } },
    renderWatchlist() {}, renderHistory() {}, renderWatchlistPage() {}, renderHistoryPage() {},
    scheduleSync() {}
  });
  return { name, ls, lsApi, app };
}
// Run an operation as this device: swap the global localStorage for the duration.
async function on(dev, fn) { globalThis.localStorage = dev.lsApi; return fn(dev.app); }
// A user edit: the same sequence writeLocalList performs (diff first, then write).
async function edit(dev, lsKey, value) {
  await on(dev, a => { a.noteLocalWrite(lsKey, value); localStorage.setItem(lsKey, JSON.stringify(value)); });
  if (lsKey === LIB) await on(dev, a => { a.state.watchlist = value; });
  if (lsKey === HIST) await on(dev, a => { a.state.history = value; });
  if (lsKey === EPS) await on(dev, a => { a.state.watchedEpisodes = value; });
}
async function signIn(dev, uid) {
  await on(dev, async a => { a.state.authUser = { id: uid }; await a.reconcileAccount(uid); });
}
async function signOut(dev, cloudOk = true) {
  await on(dev, async a => { if (cloudOk) await a.syncNow(); await a.reconcileAccount(null); a.state.authUser = null; });
}
async function sync(dev, pull = true) { return on(dev, a => a.syncNow({ pull })); }
const libOf = dev => dev.app.state.watchlist;
const readLS = (dev, k) => JSON.parse(dev.ls.get(k) || 'null');
const outboxSize = dev => Object.keys(JSON.parse(dev.ls.get('alexandria_outbox') || '{"items":{}}').items).length;
const find = (list, id, type) => (list || []).find(i => Number(i.id) === id && i.type === type);

// ---------------------------------------------------------------- scenarios
const U1 = 'user-1', U2 = 'user-2';
{
  const cloud = makeCloud();
  const A = makeDevice('A', cloud), B = makeDevice('B', cloud);
  await signIn(A, U1); await signIn(B, U1);

  // T1 add syncs to the other device
  await edit(A, LIB, [{ id: 603, type: 'movie', title: 'Matrix', poster_path: '/m.jpg', status: 'want' }]);
  await sync(A);
  await sync(B);
  check('T1 addition reaches the second device', !!find(libOf(B), 603, 'movie'));

  // T2 status change on B reaches A (previously reverted to "want")
  await edit(B, LIB, [{ id: 603, type: 'movie', title: 'Matrix', poster_path: '/m.jpg', status: 'watched', watched_at: '2026-10-05T10:00:00.000Z' }]);
  await sync(B);
  await sync(A);
  check('T2 status change propagates (no revert)', find(libOf(A), 603, 'movie')?.status === 'watched');
  await sync(A); await sync(B);
  check('T2b no ping-pong after both sync again', find(libOf(B), 603, 'movie')?.status === 'watched' && find(libOf(A), 603, 'movie')?.status === 'watched');

  // T3 removal propagates, and is not pushed back by the device that holds it
  await edit(A, LIB, [{ id: 603, type: 'movie', title: 'Matrix', poster_path: '/m.jpg', status: 'watched', watched_at: '2026-10-05T10:00:00.000Z' }, { id: 604, type: 'movie', title: 'Reloaded', poster_path: null, status: 'want' }]);
  await sync(A);
  await sync(B);
  await edit(A, LIB, [{ id: 603, type: 'movie', title: 'Matrix', poster_path: '/m.jpg', status: 'watched', watched_at: '2026-10-05T10:00:00.000Z' }]);
  await sync(A);
  await sync(B); await sync(A);
  check('T3 removal reaches the other device', !find(libOf(B), 604, 'movie'));
  check('T3b removed title does not come back on the original device', !find(libOf(A), 604, 'movie'));
  check('T3c cloud keeps a tombstone, not a live row', cloud.tables.survival_cache.some(r => String(r.tmdb_id) === '604' && r.deleted_at));

  // T4 offline removal survives a reload and syncs later
  await edit(B, LIB, [{ id: 603, type: 'movie', title: 'Matrix', poster_path: '/m.jpg', status: 'watched', watched_at: '2026-10-05T10:00:00.000Z' }, { id: 605, type: 'movie', title: 'Alien', poster_path: null, status: 'want' }]);
  await sync(B);
  await sync(A);
  check('T4 setup: A has 605', !!find(libOf(A), 605, 'movie'));
  await edit(A, LIB, [{ id: 603, type: 'movie', title: 'Matrix', poster_path: '/m.jpg', status: 'watched', watched_at: '2026-10-05T10:00:00.000Z' }]);
  cloud.failNext = 1;
  const okOffline = await sync(A);
  check('T4 offline sync reports failure', okOffline === false);
  check('T4 pending removal kept in outbox', outboxSize(A) > 0);
  const A2 = makeDevice('A-reloaded', cloud, A.ls);       // page reload: same storage, fresh memory
  await signIn(A2, U1);
  await on(A2, a => { a.state.watchlist = JSON.parse(A.ls.get(LIB)); });
  await sync(A2);
  await sync(B);
  check('T4 offline removal eventually reaches the other device', !find(libOf(B), 605, 'movie'));
  check('T4b outbox empty after successful sync', outboxSize(A2) === 0);

  // T5 episode marks, including un-marking
  await edit(A, EPS, { '1399_s1e1': true });
  await sync(A); await sync(B);
  check('T5 episode mark reaches other device', libOf(B) && readLS(B, EPS)?.['1399_s1e1'] === true);
  await edit(B, EPS, {});
  await sync(B); await sync(A);
  check('T5b un-marked episode is removed everywhere', !readLS(A, EPS)?.['1399_s1e1']);

  // T6 diary rating and review follow the title
  await edit(A, LIB, [{ id: 603, type: 'movie', title: 'Matrix', poster_path: '/m.jpg', status: 'watched', watched_at: '2026-10-05T10:00:00.000Z', userRating: 4.5, userReview: 'great' }]);
  await sync(A); await sync(B);
  const b603 = find(libOf(B), 603, 'movie');
  check('T6 rating and review reach other device', b603?.userRating === 4.5 && b603?.userReview === 'great', JSON.stringify(b603));
  await edit(B, LIB, [{ id: 603, type: 'movie', title: 'Matrix', poster_path: '/m.jpg', status: 'watched', watched_at: '2026-10-05T10:00:00.000Z', userRating: 0, userReview: '' }]);
  await sync(B); await sync(A);
  check('T6b cleared diary clears on other device', find(libOf(A), 603, 'movie')?.userRating === 0 && find(libOf(A), 603, 'movie')?.userReview === '');

  // T7 Continue Watching: newest episode wins, clearing history removes it everywhere
  const hist = [{ id: 1399, type: 'tv', title: 'GoT', poster_path: null, season: 2, episode: 7, progress: 300, watchedAt: '2026-10-05T12:00:00.000Z' }];
  await edit(A, HIST, hist);
  await sync(A); await sync(B);
  check('T7 continue watching reaches other device with season/episode', find(B.app.state.history, 1399, 'tv')?.season === 2 && find(B.app.state.history, 1399, 'tv')?.episode === 7);
  await edit(B, HIST, []);
  await sync(B); await sync(A);
  check('T7b clearing history on one device clears it on the other', (A.app.state.history || []).length === 0);
}

{ // T8 account isolation on a shared browser
  const cloud = makeCloud();
  const D = makeDevice('shared', cloud);
  await signIn(D, U1);
  await edit(D, LIB, [{ id: 700, type: 'movie', title: 'Secret', poster_path: null, status: 'want' }]);   // not synced yet
  await signOut(D, false);                                       // offline sign-out
  check('T8 signed-out device shows no previous library', (D.app.state.watchlist || []).length === 0);
  check('T8b previous library stashed, not left in the open', !!D.ls.get('alexandria_stash_user-1'));
  await signIn(D, U2);
  await sync(D);
  check('T8c second account never receives first account title', !cloud.tables.survival_cache.some(r => r.user_id === U2 && String(r.tmdb_id) === '700'));
  check('T8d second account sees own library only', (D.app.state.watchlist || []).length === 0);
  await signOut(D, true);
  await signIn(D, U1);
  await sync(D);
  check('T8e first account gets its pending title back when it signs in again', !!cloud.tables.survival_cache.find(r => r.user_id === U1 && String(r.tmdb_id) === '700' && !r.deleted_at));
  check('T8f stash consumed', !D.ls.get('alexandria_stash_user-1'));
}

{ // T9 anonymous library joins the account on first sign-in
  const cloud = makeCloud();
  const C = makeDevice('anon', cloud);
  await edit(C, LIB, [{ id: 800, type: 'movie', title: 'Anon pick', poster_path: null, status: 'want' }]);
  await signIn(C, U1); await sync(C);
  check('T9 anonymous title is pushed to the account', !!cloud.tables.survival_cache.find(r => r.user_id === U1 && String(r.tmdb_id) === '800' && !r.deleted_at));
}

{ // T10 history cap: adding the 21st title pops the oldest, which must tombstone on the cloud
  const cloud = makeCloud();
  const E = makeDevice('cap', cloud), F = makeDevice('cap2', cloud);
  await signIn(E, U1); await signIn(F, U1);
  const at = i => new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
  const mk = i => ({ id: 1000 + i, type: 'movie', title: 't' + i, poster_path: null, season: 0, episode: 0, progress: 0, watchedAt: at(i) });
  // Build 20 entries, newest first, and sync them.
  let list = [];
  for (let i = 0; i < 20; i++) list = [mk(i), ...list];
  await edit(E, HIST, list);
  await sync(E); await sync(F);
  // addToHistory for the 21st: unshift + pop (same as storage.js)
  const next = [mk(20), ...list];
  next.pop();
  await edit(E, HIST, next);
  await sync(E); await sync(F);
  check('T10 local history capped at 20', (F.app.state.history || []).length === 20);
  const oldest = cloud.tables.history.find(r => String(r.content_id) === '1000');
  check('T10b oldest title tombstoned in cloud (cap is a real removal)', oldest && oldest.deleted_at, JSON.stringify(oldest));
  check('T10c newest title live on cloud', cloud.tables.history.some(r => String(r.content_id) === '1020' && !r.deleted_at));
}

{ // T11 pending local change beats an older cloud row during a pull
  const cloud = makeCloud();
  const G = makeDevice('pend', cloud);
  await signIn(G, U1);
  await edit(G, LIB, [{ id: 900, type: 'movie', title: 'X', poster_path: null, status: 'want' }]);
  await sync(G);
  await edit(G, LIB, [{ id: 900, type: 'movie', title: 'X', poster_path: null, status: 'watched', watched_at: 'now' }]);  // pending, not yet pushed
  cloud.tables.survival_cache.find(r => String(r.tmdb_id) === '900').status = 'want';   // other device's stale write
  await on(G, a => a.pullFromCloud());
  check('T11 pending local status not overwritten by cloud copy', find(libOf(G), 900, 'movie')?.status === 'watched');
  await sync(G);
  check('T11b pending change then reaches cloud', cloud.tables.survival_cache.find(r => String(r.tmdb_id) === '900').status === 'watched');
}

{ // T12 retry after a failed push loses nothing
  const cloud = makeCloud();
  const H = makeDevice('retry', cloud);
  await signIn(H, U1);
  await edit(H, LIB, [{ id: 950, type: 'movie', title: 'R', poster_path: null, status: 'want' }]);
  cloud.failNext = 1;
  check('T12 first sync fails', (await sync(H)) === false);
  check('T12b second sync succeeds', (await sync(H)) === true && outboxSize(H) === 0);
  check('T12c cloud has the title', !!cloud.tables.survival_cache.find(r => String(r.tmdb_id) === '950' && !r.deleted_at));
}

{ // T13 two tabs on one browser: a whole-list write from tab 2 cannot erase tab 1's pending add
  const cloud = makeCloud();
  const ls = new Map();
  const tab1 = makeDevice('tab1', cloud, ls), tab2 = makeDevice('tab2', cloud, ls);
  await signIn(tab1, U1); await signIn(tab2, U1);
  await edit(tab1, LIB, [{ id: 960, type: 'movie', title: 'Tab1 add', poster_path: null, status: 'want' }]);
  // tab 2 never saw it and writes its own list
  await edit(tab2, LIB, [{ id: 961, type: 'movie', title: 'Tab2 add', poster_path: null, status: 'want' }]);
  await on(tab1, a => a.applyStorageEvent(LIB));
  const titles = (tab1.app.state.watchlist || []).map(i => i.id).sort();
  check('T13 tab 1 keeps its pending add after tab 2 overwrote the list', titles.includes(960) || (tab1.app.state.watchlist || []).some(i => i.id === 960), JSON.stringify(titles));
}

{ // T14 legacy rating (never pushed, library row already in cloud) survives a pull and then syncs
  const cloud = makeCloud();
  const L1 = makeDevice('legacy', cloud), L2 = makeDevice('other', cloud);
  await signIn(L1, U1); await signIn(L2, U1);
  // cloud already has the title, but no diary row (rating was local-only before)
  await edit(L1, LIB, [{ id: 970, type: 'movie', title: 'Legacy', poster_path: null, status: 'want' }]);
  await sync(L1);
  // simulate the legacy state: local rating present, cloud diary missing
  await on(L1, a => { a.state.watchlist[0].userRating = 4; a.state.watchlist[0].userReview = 'kept'; a.noteSnapshot(LIB, a.state.watchlist); });
  cloud.tables.diary_entries.length = 0;
  await sync(L1);
  check('T14 legacy rating survives a pull that has no diary row', find(libOf(L1), 970, 'movie')?.userRating === 4 && find(libOf(L1), 970, 'movie')?.userReview === 'kept');
  check('T14b legacy rating is pushed to the cloud diary', cloud.tables.diary_entries.some(r => String(r.tmdb_id) === '970' && Number(r.rating) === 4));
  await sync(L2);
  check('T14c other device receives the legacy rating', find(libOf(L2), 970, 'movie')?.userRating === 4);
}

{ // T15 a device with an empty library (fresh install, corrupt storage) must not tombstone live cloud rows
  const cloud = makeCloud();
  const seed = makeDevice('seed', cloud);
  await signIn(seed, U1);
  await edit(seed, LIB, [{ id: 980, type: 'movie', title: 'Watched elsewhere', poster_path: null, status: 'watched', watched_at: '2026-10-05T10:00:00.000Z' }]);
  await sync(seed);
  const fresh = makeDevice('fresh', cloud);
  await signIn(fresh, U1);
  await sync(fresh);
  const row = cloud.tables.survival_cache.find(r => String(r.tmdb_id) === '980');
  check('T15 empty device pulls the cloud title, not a tombstone', !!find(libOf(fresh), 980, 'movie') && row && !row.deleted_at);
  check('T15b live cloud row keeps its status', row?.status === 'watched', JSON.stringify(row));
  check('T15c empty device pushes nothing', outboxSize(fresh) === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

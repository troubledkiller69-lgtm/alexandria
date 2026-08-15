# Alexandria

A single-page movie and TV streaming interface. Zero frameworks, zero build steps -- just vanilla HTML, CSS, and JS served through Vercel's edge functions. We use TMDB for catalog metadata and artwork, Supabase for optional user accounts and realtime Watch Party sync.

## Setup

```bash
git clone https://github.com/troubledkiller69-lgtm/alexandria.git
cd alexandria
cp .env.example .env.local
```

Set `TMDB_API_KEY` in `.env.local`. That's the only required key.

```bash
npx vercel dev
```

For quick local testing without Vercel CLI, there's a Python fallback:

```bash
python debug_server.py
# http://127.0.0.1:5500
```

### Optional keys

`OMDB_API_KEY` pulls IMDb ratings onto detail pages. Free tier works fine.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` unlock user accounts, cloud-synced watchlists, comment threads, and Watch Party. Without these, everything still works -- lists just live in `localStorage` and social features stay disabled.

## Architecture

The entire client is a single object literal (`Alexandria`) in `script.js`. No router library. Hash-based navigation (`#movies`, `#tv/12345/s/2/e/3`, `#party/roomid/tv/456/s/1/e/1`) drives a `render()` dispatcher that swaps the main content area.

### API layer -- `api/`

Three Vercel serverless functions:

- `api/proxy.js` -- TMDB proxy. Injects the API key server-side so it never hits the client. Allowlisted roots: `trending`, `discover`, `movie`, `tv`, `search`, `collection`, `person`. Rate-limit retry with backoff built in.
- `api/config.js` -- Returns Supabase connection info (anon key only) to the browser at runtime.
- `api/omdb.js` -- Fetches IMDb ratings by TMDB ID lookup.

### Supabase -- `supabase/`

`schema.sql` defines four tables with RLS policies locked down per-user:

`profiles` -- username, avatar. `comments` -- per-title threads keyed by `comment_key` (e.g. `movie_12345`). `survival_cache` -- cloud watchlist. `history` -- cloud viewing history with a unique constraint on `(user_id, content_id, type)` to prevent duplicates.

Auth is Supabase email/password. Session tokens persist in `localStorage` and get restored async on page load before any view renders.

### Playback

The player embeds third-party sources via iframe. Server rotation with automatic failover -- if the primary doesn't respond within 15 seconds, it cycles to the next available mirror. Progress tracking writes back to `localStorage` (and cloud if signed in) every 5 seconds via `postMessage` from the embed.

Resume works across sessions. Open a movie, close the tab, come back a week later. It'll seek to where you left off.

### Watch Party

Realtime room sync over Supabase Presence and Broadcast channels. Host controls playback state (play, pause, seek, episode changes). Guests receive state diffs and adjust. There's a built-in chat sidebar. Requires an account.

The sync compensates for network delay with a configurable lead offset (`_PARTY_SYNC_LEAD_SEC`, currently 0.85s).

## How it works in practice

**Browsing** -- Home page loads trending content, a continue watching row (deduplicated from local + cloud history), and your watchlist. Dedicated tabs for Movies, TV, and Anime (filtered by genre 16 on the `tv` endpoint). Discover panel on each tab with genre/year/sort filters.

**Franchises** -- Curated collections (MCU, Star Wars, Transformers, LOTR, etc.) with custom accent colors and taglines. Uses a mix of TMDB collection IDs and hardcoded movie ID arrays depending on what TMDB has grouped.

**Search** -- Debounced multi-search across movies, TV, and people. Person results pull full filmographies from TMDB's combined credits endpoint.

**Player page** -- 16:9 iframe with server selection bar above, comments section below. TV shows get an episode sidebar. `postMessage` bridge handles progress reporting and embed health checks.

**Comments** -- Threaded per title. Locked behind auth. HTML-escaped, username-badged, sorted newest-first.

## Deploy

Push to Vercel. Set `TMDB_API_KEY` as an env var. Done.

For Supabase features, set `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Run `schema.sql` against your Supabase project to create the tables and policies.

The anon key is public-safe -- it's scoped to RLS-protected reads and writes only. Don't expose a service-role key.

## Security

Headers are set in `vercel.json`: HSTS with preload, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, COOP, and a restrictive Permissions-Policy.

CSP in `index.html` restricts `frame-src` to `https: blob:` and blocks `object-src` entirely. All embed origins are validated against a hardcoded allowlist in `isTrustedEmbedOrigin()` before any `postMessage` data is processed.

RLS is enforced on every Supabase table. Users can only read/write their own rows (watchlist, history). Comments are insert-only for authenticated users and publicly readable.

## File overview

```
index.html          -- Shell markup, CSP meta tag
script.js           -- Entire client application (~4200 lines)
index.css           -- All styles, dark theme, responsive breakpoints
api/proxy.js        -- TMDB proxy with rate-limit retry
api/config.js       -- Supabase config endpoint
api/omdb.js         -- IMDb ratings proxy
supabase/schema.sql -- Tables, constraints, RLS policies
vercel.json         -- Deploy config, security headers, cache rules
logo.png            -- Site logo
debug_server.py     -- Local dev server (no Vercel CLI needed)
```

## License

Not currently licensed for redistribution. Personal project.

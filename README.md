# Alexandria

A streaming archive with opinions. Movies, TV, anime, and whole franchises in one dark, fast, single-page app. No frameworks, no build step — one `index.html`, one stylesheet, and 17 ES modules under `js/` that run the whole thing.

## What's under the hood

TMDB feeds the catalog through Vercel functions, so the API key never leaves the server. A health probe (`/api/probe`) reachability-checks every mirror and tags dead ones in the server picker. Supabase handles accounts, watchlists, comments, ratings, and realtime — row-level security on every table, column-level grants so email never shows up in client reads. The player is an iframe embed with a mirror picker and a dual-protocol `postMessage` bridge (EmbedMaster plus PlayerJS) guarded by a 12-host origin allowlist. Routing is a hand-rolled hash router. `#tv/12345/s/2/e/3` parses straight into a render dispatcher.

## What it does

- Home loads trending, a continue-watching row deduped against your cloud history, your watchlist, and whatever airs this week.
- Details pages pull credits, trailers, similar titles, and IMDb scores in one pass. Similar titles get reranked by genre overlap and release-year proximity — not just keyword matches.
- 33 curated franchise archives. MCU, Star Wars, Transformers, and friends. Each one has its own accent color. Definitions live in the Supabase `franchises` table (editable without a deploy), with bundled fallback data. Search them, filter them by genre, sort them.
- Roulette. Spin a random title, filtered by type if you're picky.
- Comments per title and per episode. Spoiler tags blur until you tap. Realtime insert channel, so new comments land without a refresh.
- Star ratings plus written reviews. 1–5 scale, one per user per title.
- Watchlist with three states: want, watching, watched. Synced to the cloud, importable and exportable as JSON.
- Profiles with franchise avatar sets (including a Tekken 8 one), bios, genre tags, and follows. Each profile has a watch pulse — approximate hours, day streaks, a 16-week activity heatmap, and 10 earnable badges.
- Top Watchers This Week. A 7-day window of watching activity, rendered as a top-5 board tied to real profiles.
- Watch Party. Realtime sync over Supabase presence and broadcast. The host controls playback; guests receive state diffs with a 0.85s lead offset to absorb network jitter. Built-in chat sidebar. Works across episodes.
- Movie Night lists. Shared, collaborative. Anyone can drop titles in; only the owner or the person who added a title can remove it. Realtime.
- Community feed with a following filter. Activity, ratings, and list changes from the last 24 hours.

## What's deliberately not in here

True watch-time telemetry. The embed we use reports zero playback events, so hours are approximate — TMDB runtime credited per watch event, labeled APPROX on the profile card. We don't pretend it's exact.

## Boring but real

CSP, HSTS preload, COOP, nosniff, and a restrictive Permissions-Policy. `escapeHtml` on every piece of dynamic content. Inbound `postMessage` data is only trusted from the allowlisted embed hosts. Deploys are a git push.

Live at alexandr1a.vercel.app.

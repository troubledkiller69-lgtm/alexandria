# Alexandria

Alexandria is a vanilla HTML/CSS/JS movie and TV discovery interface backed by TMDB. Watchlists and playback history live in the browser (`localStorage`). There is no account system.

Supabase is optional and used only for Watch Party Realtime (presence + playback sync + chat).

## Run locally

```powershell
npx vercel dev
```

Copy `.env.example` to `.env.local` and set `TMDB_API_KEY`. Supabase variables are optional and only needed for Watch Party.

## Deploy

Deploy the folder to Vercel and configure `TMDB_API_KEY`. To enable Watch Party, also set `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

The Supabase anon key is returned to the browser for Realtime only. Never expose a service-role key.

## Notes

- TMDB provides catalog metadata and artwork via `/api/proxy`.
- Playback is embedded from EmbedMaster; availability varies by provider and region.
- Lists work fully offline from the browser even without Supabase.

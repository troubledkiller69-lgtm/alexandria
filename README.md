# Alexandria

Alexandria is a static movie and TV discovery interface backed by TMDB, with optional Supabase authentication and list syncing. Guest watchlists and playback history are stored locally in the browser.

## Run locally

Vercel's development server is the simplest way to run the frontend and serverless API together:

```powershell
npx vercel dev
```

Copy `.env.example` to `.env.local` and add a TMDB API key. `TMDB_API_KEY` is required for catalog data. Supabase variables are optional.

## Deploy

Deploy the folder to Vercel and configure `TMDB_API_KEY` in the project's environment variables. To enable accounts and cloud sync, also configure `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then run `supabase/schema.sql` in the Supabase SQL editor.

The Supabase anon key is intentionally returned to the browser. Row-level security in the included schema restricts each signed-in user to their own records. Never expose a Supabase service-role key.

## Notes

- TMDB provides catalog metadata and artwork.
- Embedded playback is supplied by third-party providers; availability varies by provider and region.
- Without Supabase, the account page remains optional and saved lists continue to work in local mode.

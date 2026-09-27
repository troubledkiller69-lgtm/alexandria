-- Public read watchlist: friend profiles show Watched movies/shows from
-- survival_cache, same as every other social table (profiles, follows,
-- activity, ratings, comments, lists). Writes stay owner-only and anon
-- still has no insert/update/delete (see security_lockdown migration).

drop policy if exists "Users can read watchlist" on public.survival_cache;

create policy "Public read watchlist" on public.survival_cache
  for select using (true);

-- Cross-device sync: soft deletes, server-side change times, and a private diary.
-- Every statement is idempotent, so the file can be re-run safely.
-- Client contract: js/sync.js writes these rows; see the comments there.

-- 1. Soft deletes and change times on the synced tables.
alter table public.survival_cache add column if not exists deleted_at timestamptz;
alter table public.survival_cache add column if not exists updated_at timestamptz not null default now();

alter table public.watched_episodes add column if not exists deleted_at timestamptz;
alter table public.watched_episodes add column if not exists updated_at timestamptz not null default now();

alter table public.history add column if not exists deleted_at timestamptz;
alter table public.history add column if not exists updated_at timestamptz not null default now();
alter table public.history add column if not exists watched_at timestamptz;
alter table public.history add column if not exists season integer not null default 0;
alter table public.history add column if not exists episode integer not null default 0;
alter table public.history add column if not exists progress double precision not null default 0;

-- 2. The server stamps every write, so ordering never depends on a device clock.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists survival_cache_touch_updated_at on public.survival_cache;
create trigger survival_cache_touch_updated_at before insert or update on public.survival_cache
  for each row execute function public.touch_updated_at();

drop trigger if exists watched_episodes_touch_updated_at on public.watched_episodes;
create trigger watched_episodes_touch_updated_at before insert or update on public.watched_episodes
  for each row execute function public.touch_updated_at();

drop trigger if exists history_touch_updated_at on public.history;
create trigger history_touch_updated_at before insert or update on public.history
  for each row execute function public.touch_updated_at();

-- 3. Continue Watching ordering: existing rows take their creation time.
update public.history set watched_at = created_at where watched_at is null;

-- 4. Resume position moves from watch_progress (its seconds column is cumulative watch
--    time, so it was never a valid resume position) onto the Continue Watching row.
--    Only the season and episode are carried over; progress restarts from the next play.
update public.history h
set season = w.season, episode = w.episode
from (
  select distinct on (user_id, content_id, content_type) user_id, content_id, content_type, season, episode
  from public.watch_progress
  order by user_id, content_id, content_type, updated_at desc
) w
where h.user_id = w.user_id
  and h.content_id = w.content_id
  and h.type = w.content_type
  and h.season = 0 and h.episode = 0
  and w.episode > 0;

-- 5. Diary: rating and review, private to the owner. One row per title, kept in step
--    with the title's library row by js/sync.js. Private because reviews are personal;
--    the library row stays public-read for the profile shelf, the diary does not.
create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id text not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  rating numeric(2,1) check (rating is null or (rating >= 0.5 and rating <= 5 and rating * 2 = floor(rating * 2))),
  review text check (review is null or char_length(review) <= 2000),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

alter table public.diary_entries enable row level security;

drop policy if exists "diary_entries own rows" on public.diary_entries;
create policy "diary_entries own rows" on public.diary_entries
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.diary_entries from anon;

drop trigger if exists diary_entries_touch_updated_at on public.diary_entries;
create trigger diary_entries_touch_updated_at before insert or update on public.diary_entries
  for each row execute function public.touch_updated_at();

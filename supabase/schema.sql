-- Alexandria schema — run this against your Supabase project (SQL editor) if
-- you ever need to recreate the database from scratch.
-- NOTE: live DB is managed via Supabase MCP migrations; this file mirrors
-- migrations `community_features_and_schema_sync`, `watch_time_tracking`,
-- plus the pre-existing tables.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  username_lower text,
  nickname text,
  bio text,
  fav_genres text,
  avatar_id text default 'python',
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_key
  on public.profiles (username_lower) where username_lower is not null;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  comment_key text not null,
  author text not null,
  content text not null,
  spoiler boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.survival_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id text not null,
  media_type text not null,
  title text,
  poster_path text,
  status text not null default 'want' check (status in ('want', 'watching', 'watched')),
  watched_at timestamptz,
  added_at timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id integer not null,
  type text not null check (type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  created_at timestamptz not null default now(),
  unique (user_id, content_id, type)
);

create table if not exists public.watched_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id text not null,
  season integer not null,
  episode integer not null,
  watched_at timestamptz not null default now(),
  unique (user_id, tmdb_id, season, episode)
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self_follow check (follower_id <> followee_id)
);

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  content_id integer,
  content_type text,
  title text,
  poster_path text,
  meta text,
  created_at timestamptz not null default now()
);

create index if not exists activity_created_at_idx on public.activity (created_at desc);
create index if not exists activity_user_id_idx on public.activity (user_id);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id integer not null,
  content_type text not null check (content_type in ('movie', 'tv')),
  -- 1-5 star scale (migration `ratings_scale_to_five_stars` converted
  -- legacy 1-10 values: round(rating / 2), clamped to >= 1)
  rating smallint not null check (rating between 1 and 5),
  review text,
  spoiler boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, content_id, content_type)
);

create index if not exists ratings_content_idx on public.ratings (content_id, content_type);

create table if not exists public.movie_night_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.movie_night_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.movie_night_lists(id) on delete cascade,
  content_id integer not null,
  content_type text not null check (content_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (list_id, content_id, content_type)
);

create index if not exists movie_night_items_list_idx on public.movie_night_items (list_id);

alter table public.profiles enable row level security;
alter table public.comments enable row level security;
alter table public.survival_cache enable row level security;
alter table public.history enable row level security;
alter table public.watched_episodes enable row level security;
alter table public.follows enable row level security;
alter table public.activity enable row level security;
alter table public.ratings enable row level security;
alter table public.movie_night_lists enable row level security;
alter table public.movie_night_items enable row level security;

-- profiles
-- Column-level grants keep email out of client queries entirely:
-- the "Public read profiles" policy alone would still expose it to anon clients.
revoke select, insert, update on public.profiles from anon, authenticated;
grant select (id, username, username_lower, nickname, bio, fav_genres, avatar_id, created_at)
  on public.profiles to anon, authenticated;
grant insert (id, username, username_lower, nickname, avatar_id, created_at)
  on public.profiles to authenticated;
grant update (username, username_lower, nickname, bio, fav_genres, avatar_id)
  on public.profiles to authenticated;
create policy "Public read profiles" on public.profiles for select
  using (true);
create policy "Users can manage profile" on public.profiles for all using (auth.uid() = id);

-- comments
create policy "Public read comments" on public.comments for select using (true);
create policy "Authenticated users can post comments" on public.comments
  for insert with check (auth.uid() = user_id);
create policy "Users can delete own comments" on public.comments for delete using (auth.uid() = user_id);

-- survival_cache (watchlist)
create policy "Users can read watchlist" on public.survival_cache for select using (auth.uid() = user_id);
create policy "Users can add to watchlist" on public.survival_cache for insert with check (auth.uid() = user_id);
create policy "Users can update watchlist" on public.survival_cache for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete from watchlist" on public.survival_cache for delete using (auth.uid() = user_id);

-- history
create policy "Users can read history" on public.history for select using (auth.uid() = user_id);
create policy "Users can add to history" on public.history for insert with check (auth.uid() = user_id);
create policy "Users can update history" on public.history for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete from history" on public.history for delete using (auth.uid() = user_id);

-- watched_episodes
create policy "Users can read watched episodes" on public.watched_episodes for select using (auth.uid() = user_id);
create policy "Users can add watched episodes" on public.watched_episodes for insert with check (auth.uid() = user_id);
create policy "Users can update watched episodes" on public.watched_episodes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can remove watched episodes" on public.watched_episodes for delete using (auth.uid() = user_id);

-- follows
create policy "follows public read" on public.follows for select using (true);
create policy "follows insert own" on public.follows for insert with check (auth.uid() = follower_id);
create policy "follows delete own" on public.follows for delete using (auth.uid() = follower_id);

-- activity feed
create policy "activity public read" on public.activity for select using (true);
create policy "activity insert own" on public.activity for insert with check (auth.uid() = user_id);
create policy "activity delete own" on public.activity for delete using (auth.uid() = user_id);

-- ratings
create policy "ratings public read" on public.ratings for select using (true);
create policy "ratings insert own" on public.ratings for insert with check (auth.uid() = user_id);
create policy "ratings update own" on public.ratings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ratings delete own" on public.ratings for delete using (auth.uid() = user_id);

-- movie night lists
create policy "movie_night_lists public read" on public.movie_night_lists for select using (true);
create policy "movie_night_lists insert own" on public.movie_night_lists for insert with check (auth.uid() = owner_id);
create policy "movie_night_lists update own" on public.movie_night_lists for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "movie_night_lists delete own" on public.movie_night_lists for delete using (auth.uid() = owner_id);

-- movie night items (any signed-in user can contribute to a shared list)
create policy "movie_night_items public read" on public.movie_night_items for select using (true);
create policy "movie_night_items insert any user" on public.movie_night_items for insert with check (auth.uid() = added_by);
create policy "movie_night_items delete contributor or owner" on public.movie_night_items for delete
  using (
    auth.uid() = added_by
    or auth.uid() = (select l.owner_id from public.movie_night_lists l where l.id = movie_night_items.list_id)
  );

-- Realtime: activity feed, collaborative lists, comments, ratings
alter publication supabase_realtime add table public.activity;
alter publication supabase_realtime add table public.movie_night_items;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.ratings;

-- Watch time (migration `watch_time_tracking`)
create table if not exists public.watch_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id integer not null,
  content_type text not null check (content_type in ('movie', 'tv')),
  season integer not null default 0,
  episode integer not null default 0,
  seconds double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, content_id, content_type, season, episode)
);

alter table public.watch_progress enable row level security;

create policy "watch_progress_select_own" on public.watch_progress
  for select to authenticated using (auth.uid() = user_id);
create policy "watch_progress_insert_own" on public.watch_progress
  for insert to authenticated with check (auth.uid() = user_id);
create policy "watch_progress_update_own" on public.watch_progress
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "watch_progress_delete_own" on public.watch_progress
  for delete to authenticated using (auth.uid() = user_id);

create or replace function public.add_watch_seconds(
  p_content_id integer, p_content_type text, p_season integer, p_episode integer, p_delta double precision
) returns void language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.watch_progress (user_id, content_id, content_type, season, episode, seconds)
  values (auth.uid(), p_content_id, p_content_type, coalesce(p_season, 0), coalesce(p_episode, 0), greatest(p_delta, 0))
  on conflict (user_id, content_id, content_type, season, episode)
  do update set seconds = public.watch_progress.seconds + excluded.seconds, updated_at = now();
end;
$$;

revoke execute on function public.add_watch_seconds(integer, text, integer, integer, double precision) from public;
grant execute on function public.add_watch_seconds(integer, text, integer, integer, double precision) to authenticated;

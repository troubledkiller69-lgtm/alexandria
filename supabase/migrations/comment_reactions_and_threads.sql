-- Migration: comment_reactions_and_threads
-- Run this in the Supabase SQL editor (or via MCP execute_sql) against project pwvxcwgueiuxpjtedyfl.

alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
create index if not exists comments_parent_id_idx on public.comments (parent_id);

create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('ghost', 'fire')),
  comment_key text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_reactions_comment_idx on public.comment_reactions (comment_id);
create index if not exists comment_reactions_key_idx on public.comment_reactions (comment_key);

alter table public.comment_reactions enable row level security;

create policy "comment_reactions public read" on public.comment_reactions for select using (true);
create policy "comment_reactions insert own" on public.comment_reactions for insert with check (auth.uid() = user_id);
create policy "comment_reactions delete own" on public.comment_reactions for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table public.comment_reactions;

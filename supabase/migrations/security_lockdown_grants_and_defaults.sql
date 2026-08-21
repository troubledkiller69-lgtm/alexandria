-- Migration: security_lockdown_grants_and_defaults
-- Locks down anon/authenticated grants and default privileges on the public schema.
-- Trigger function handle_new_user() keeps working: triggers run as the definer
-- regardless of the caller's EXECUTE privilege, so signups are unaffected.

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to service_role, postgres;

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, trigger, references on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, trigger on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

revoke truncate, trigger, references on all tables in schema public from anon;
revoke truncate, trigger on all tables in schema public from authenticated;

revoke insert, update, delete on public.comments from anon;
revoke insert, update, delete on public.history from anon;
revoke insert, update, delete on public.survival_cache from anon;
revoke insert, update, delete on public.watched_episodes from anon;
revoke insert, update, delete on public.activity from anon;
revoke insert, update, delete on public.ratings from anon;
revoke insert, update, delete on public.follows from anon;
revoke insert, update, delete on public.movie_night_lists from anon;
revoke insert, update, delete on public.movie_night_items from anon;
revoke insert, update, delete on public.comment_reactions from anon;
revoke insert, update, delete on public.watchlist from anon;
revoke insert, update, delete, select on public.watch_progress from anon;
revoke delete on public.profiles from anon;

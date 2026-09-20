-- Migration: handle_new_user stub
-- The lockdown migration revokes EXECUTE on this function, so it must exist
-- before that migration runs. Safe stub: creates the profile row for new signups.
-- Trigger runs as definer, so anon signups are unaffected by the EXECUTE revoke.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

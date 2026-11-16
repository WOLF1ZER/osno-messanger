-- =====================================================================
-- OSNO — let users change their @username
-- Run in the Supabase SQL editor after the init migration.
-- =====================================================================

-- Allow the username column to be updated (name / avatar_url / last_seen already are).
grant update (username) on public.profiles to authenticated;

-- Always store usernames trimmed + lowercase (format is enforced by the existing check constraint).
create or replace function public.normalize_username()
returns trigger language plpgsql as $$
begin
  new.username := lower(trim(new.username));
  return new;
end $$;

drop trigger if exists profiles_normalize_username on public.profiles;
create trigger profiles_normalize_username
  before insert or update of username on public.profiles
  for each row execute function public.normalize_username();

-- Live "is this username free?" check for the profile screen.
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select lower(trim(p_username)) ~ '^[a-z0-9_]{3,32}$'
     and not exists (
       select 1 from profiles
       where username = lower(trim(p_username)) and id <> auth.uid()
     );
$$;
grant execute on function public.username_available(text) to authenticated;

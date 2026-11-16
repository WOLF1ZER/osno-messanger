-- =====================================================================
-- OSNO — initial schema
-- Run in the Supabase SQL editor (or `supabase db push`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  name        text not null check (char_length(name) between 1 and 64),
  avatar_url  text,
  last_seen   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create table public.chats (
  id               uuid primary key default gen_random_uuid(),
  private_mode     boolean not null default false,   -- messages disappear after 24h
  last_message_at  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create table public.chat_members (
  chat_id       uuid not null references public.chats (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  pinned        boolean not null default false,
  hidden        boolean not null default false,       -- "deleted" from my list until a new message arrives
  cleared_at    timestamptz,                          -- messages before this are hidden for me
  last_read_at  timestamptz not null default now(),
  joined_at     timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create index chat_members_user_idx on public.chat_members (user_id);

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  chat_id     uuid not null references public.chats (id) on delete cascade,
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  type        text not null check (type in ('text', 'image', 'file', 'audio')),
  body        text check (char_length(body) <= 4000),  -- text, or caption for media
  file_path   text,                                    -- path inside the chat-files bucket
  file_name   text,
  file_size   bigint,
  mime_type   text,
  duration    integer,                                 -- seconds, for audio
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  constraint text_has_body check (type <> 'text' or coalesce(char_length(trim(body)), 0) > 0),
  constraint media_has_file check (type = 'text' or file_path is not null)
);
create index messages_chat_created_idx on public.messages (chat_id, created_at desc);
create index messages_expires_idx on public.messages (expires_at) where expires_at is not null;

create table public.blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.calls (
  id           uuid primary key default gen_random_uuid(),
  chat_id      uuid not null references public.chats (id) on delete cascade,
  caller_id    uuid not null references public.profiles (id) on delete cascade,
  callee_id    uuid not null references public.profiles (id) on delete cascade,
  video        boolean not null default false,
  status       text not null default 'ringing'
               check (status in ('ringing', 'active', 'ended', 'missed', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  answered_at  timestamptz,
  ended_at     timestamptz
);
create index calls_caller_idx on public.calls (caller_id, created_at desc);
create index calls_callee_idx on public.calls (callee_id, created_at desc);

-- ---------------------------------------------------------------------
-- Helper functions (security definer so RLS policies don't recurse)
-- ---------------------------------------------------------------------

create or replace function public.is_chat_member(p_chat uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from chat_members where chat_id = p_chat and user_id = auth.uid());
$$;

-- true when either side of a 1:1 chat has blocked the other
create or replace function public.chat_is_blocked(p_chat uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from chat_members me
    join chat_members other on other.chat_id = me.chat_id and other.user_id <> me.user_id
    join blocks b on (b.blocker_id = me.user_id and b.blocked_id = other.user_id)
                  or (b.blocker_id = other.user_id and b.blocked_id = me.user_id)
    where me.chat_id = p_chat and me.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- New user -> profile (name comes from sign-up metadata)
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username',
                                             split_part(new.email, '@', 1)), '[^a-zA-Z0-9_]', '', 'g'));
  candidate text;
begin
  if char_length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 24);
  candidate := base;
  while exists (select 1 from profiles where username = candidate) loop
    candidate := base || '_' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into profiles (id, username, name)
  values (new.id, candidate,
          left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 64));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Message triggers: expiry, bump chat, unhide for both members
-- ---------------------------------------------------------------------

create or replace function public.before_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select private_mode from chats where id = new.chat_id) then
    new.expires_at := now() + interval '24 hours';
  else
    new.expires_at := null;
  end if;
  return new;
end $$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.before_message_insert();

create or replace function public.after_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update chats set last_message_at = new.created_at where id = new.chat_id;
  update chat_members set hidden = false where chat_id = new.chat_id and hidden;
  update chat_members set last_read_at = new.created_at
   where chat_id = new.chat_id and user_id = new.sender_id;
  return new;
end $$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.after_message_insert();

-- ---------------------------------------------------------------------
-- RPCs used by the app
-- ---------------------------------------------------------------------

-- Open (or create) the 1:1 chat with another user. Returns the chat id.
create or replace function public.get_or_create_direct_chat(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_chat uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_other = me then raise exception 'cannot chat with yourself'; end if;
  if not exists (select 1 from profiles where id = p_other) then raise exception 'user not found'; end if;

  select a.chat_id into v_chat
  from chat_members a
  join chat_members b on b.chat_id = a.chat_id and b.user_id = p_other
  where a.user_id = me
  limit 1;

  if v_chat is null then
    insert into chats default values returning id into v_chat;
    insert into chat_members (chat_id, user_id, hidden) values
      (v_chat, me, false),
      (v_chat, p_other, true);   -- the other person sees it once a message arrives
  else
    update chat_members set hidden = false where chat_id = v_chat and user_id = me;
  end if;
  return v_chat;
end $$;

-- Everything the chat list needs in one round trip.
create or replace function public.my_chats()
returns table (
  chat_id         uuid,
  pinned          boolean,
  private_mode    boolean,
  last_message_at timestamptz,
  unread          integer,
  blocked_by_me   boolean,
  other_id        uuid,
  other_username  text,
  other_name      text,
  other_avatar    text,
  other_last_seen timestamptz,
  last_message    jsonb
) language sql stable security invoker set search_path = public as $$
  select
    c.id, m.pinned, c.private_mode, c.last_message_at,
    (select count(*)::int from messages x
      where x.chat_id = c.id and x.sender_id <> auth.uid()
        and x.created_at > m.last_read_at
        and x.created_at > coalesce(m.cleared_at, '-infinity')
        and (x.expires_at is null or x.expires_at > now())),
    exists (select 1 from blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id),
    p.id, p.username, p.name, p.avatar_url, p.last_seen,
    (select to_jsonb(x) from messages x
      where x.chat_id = c.id
        and x.created_at > coalesce(m.cleared_at, '-infinity')
        and (x.expires_at is null or x.expires_at > now())
      order by x.created_at desc limit 1)
  from chat_members m
  join chats c on c.id = m.chat_id
  join chat_members om on om.chat_id = c.id and om.user_id <> m.user_id
  join profiles p on p.id = om.user_id
  where m.user_id = auth.uid() and not m.hidden
  order by m.pinned desc, c.last_message_at desc;
$$;

create or replace function public.mark_chat_read(p_chat uuid)
returns void language sql security invoker set search_path = public as $$
  update chat_members set last_read_at = now() where chat_id = p_chat and user_id = auth.uid();
$$;

-- "Delete chat" = hide it and its history for me only.
create or replace function public.clear_chat(p_chat uuid)
returns void language sql security definer set search_path = public as $$
  update chat_members set hidden = true, cleared_at = now(), pinned = false
   where chat_id = p_chat and user_id = auth.uid();
$$;

-- Removes expired private-mode messages (scheduled with pg_cron below).
create or replace function public.purge_expired_messages()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from messages where expires_at is not null and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_expired_messages() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.chats        enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages     enable row level security;
alter table public.blocks       enable row level security;
alter table public.calls        enable row level security;

-- profiles: any signed-in user can find people; you edit only yourself
create policy "profiles: read" on public.profiles for select to authenticated using (true);
create policy "profiles: update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- chats: members only
create policy "chats: read" on public.chats for select to authenticated using (is_chat_member(id));
create policy "chats: update" on public.chats for update to authenticated
  using (is_chat_member(id)) with check (is_chat_member(id));

-- chat_members: see members of your chats, edit your own row
create policy "members: read" on public.chat_members for select to authenticated using (is_chat_member(chat_id));
create policy "members: update self" on public.chat_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- messages: members read (minus cleared / expired), send as yourself unless blocked
create policy "messages: read" on public.messages for select to authenticated using (
  (expires_at is null or expires_at > now())
  and exists (select 1 from chat_members m
              where m.chat_id = messages.chat_id and m.user_id = auth.uid()
                and messages.created_at > coalesce(m.cleared_at, '-infinity'))
);
create policy "messages: send" on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and is_chat_member(chat_id) and not chat_is_blocked(chat_id)
);
create policy "messages: delete own" on public.messages for delete to authenticated using (sender_id = auth.uid());

-- blocks: you manage your own block list
create policy "blocks: read own" on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "blocks: add" on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy "blocks: remove" on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- calls: only the two participants
create policy "calls: read" on public.calls for select to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid());
create policy "calls: start" on public.calls for insert to authenticated with check (
  caller_id = auth.uid() and caller_id <> callee_id
  and is_chat_member(chat_id)
  and exists (select 1 from chat_members m where m.chat_id = calls.chat_id and m.user_id = calls.callee_id)
  and not chat_is_blocked(chat_id)
);
create policy "calls: update" on public.calls for update to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid())
  with check (caller_id = auth.uid() or callee_id = auth.uid());

-- Only these columns may be changed from the app
revoke update on public.profiles from authenticated;
grant update (name, avatar_url, last_seen) on public.profiles to authenticated;
revoke update on public.chats from authenticated;
grant update (private_mode) on public.chats to authenticated;
revoke update on public.chat_members from authenticated;
grant update (pinned, last_read_at) on public.chat_members to authenticated;
revoke update on public.calls from authenticated;
grant update (status, answered_at, ended_at) on public.calls to authenticated;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table public.messages, public.calls, public.chats;

-- ---------------------------------------------------------------------
-- Storage buckets + policies
--   chat-files/<chat_id>/<file>   private, members only
--   avatars/<user_id>/<file>      public read, owner write
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 52428800),   -- 50 MB
       ('avatars', 'avatars', true, 5242880)            -- 5 MB
on conflict (id) do nothing;

create policy "chat-files: members read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and public.is_chat_member(((storage.foldername(name))[1])::uuid));
create policy "chat-files: members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and public.is_chat_member(((storage.foldername(name))[1])::uuid));

create policy "avatars: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- OSNO — groups (max 5 members), group calls, push notifications, mute
-- Run in the Supabase SQL editor AFTER the earlier migrations.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Groups
-- ---------------------------------------------------------------------

alter table public.chats
  add column if not exists is_group   boolean not null default false,
  add column if not exists title      text,
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

alter table public.chats drop constraint if exists chats_title_check;
alter table public.chats add constraint chats_title_check
  check (title is null or char_length(trim(title)) between 1 and 64);
alter table public.chats drop constraint if exists chats_group_has_title;
alter table public.chats add constraint chats_group_has_title check (not is_group or title is not null);

alter table public.chat_members
  add column if not exists role  text not null default 'member',
  add column if not exists muted boolean not null default false;
alter table public.chat_members drop constraint if exists chat_members_role_check;
alter table public.chat_members add constraint chat_members_role_check check (role in ('owner', 'member'));

grant update (muted) on public.chat_members to authenticated;

-- Hard limit: 5 members per chat (direct chats always have 2).
create or replace function public.enforce_member_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform 1 from chats where id = new.chat_id for update;  -- serialize concurrent adds
  if (select count(*) from chat_members where chat_id = new.chat_id) >= 5 then
    raise exception 'A group can have at most 5 members' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists chat_members_limit on public.chat_members;
create trigger chat_members_limit
  before insert on public.chat_members
  for each row execute function public.enforce_member_limit();

-- System messages ("Alex added Bob") — only the server can create them.
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check
  check (type in ('text', 'image', 'file', 'audio', 'system'));
alter table public.messages drop constraint if exists media_has_file;
alter table public.messages add constraint media_has_file
  check (type in ('text', 'system') or file_path is not null);

drop policy if exists "messages: send" on public.messages;
create policy "messages: send" on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and type <> 'system' and is_chat_member(chat_id) and not chat_is_blocked(chat_id)
);

-- Blocking only applies to 1:1 chats.
create or replace function public.chat_is_blocked(p_chat uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from chat_members me
    join chats c on c.id = me.chat_id and not c.is_group
    join chat_members other on other.chat_id = me.chat_id and other.user_id <> me.user_id
    join blocks b on (b.blocker_id = me.user_id and b.blocked_id = other.user_id)
                  or (b.blocker_id = other.user_id and b.blocked_id = me.user_id)
    where me.chat_id = p_chat and me.user_id = auth.uid()
  );
$$;

-- 1:1 lookup must ignore groups.
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
  join chats c on c.id = a.chat_id and not c.is_group
  join chat_members b on b.chat_id = a.chat_id and b.user_id = p_other
  where a.user_id = me
  limit 1;

  if v_chat is null then
    insert into chats default values returning id into v_chat;
    insert into chat_members (chat_id, user_id, hidden) values
      (v_chat, me, false),
      (v_chat, p_other, true);
  else
    update chat_members set hidden = false where chat_id = v_chat and user_id = me;
  end if;
  return v_chat;
end $$;

-- Helper: "Bob, Nora" from a list of user ids
create or replace function public.names_of(p_ids uuid[])
returns text language sql stable security definer set search_path = public as $$
  select string_agg(name, ', ' order by name) from profiles where id = any(p_ids);
$$;

create or replace function public.create_group(p_title text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_chat uuid;
  v_members uuid[];
begin
  if me is null then raise exception 'not authenticated'; end if;
  if coalesce(char_length(trim(p_title)), 0) = 0 then raise exception 'Give the group a name'; end if;

  select coalesce(array_agg(distinct x), '{}') into v_members from unnest(p_members) x where x <> me;
  if coalesce(array_length(v_members, 1), 0) = 0 then raise exception 'Add at least one person'; end if;
  if array_length(v_members, 1) > 4 then raise exception 'A group can have at most 5 members'; end if;
  if (select count(*) from profiles where id = any(v_members)) <> array_length(v_members, 1) then
    raise exception 'user not found';
  end if;
  if exists (select 1 from blocks where blocker_id = any(v_members) and blocked_id = me) then
    raise exception 'One of these people can''t be added';
  end if;

  insert into chats (is_group, title, created_by) values (true, left(trim(p_title), 64), me) returning id into v_chat;
  insert into chat_members (chat_id, user_id, role) values (v_chat, me, 'owner');
  insert into chat_members (chat_id, user_id) select v_chat, x from unnest(v_members) x;
  insert into messages (chat_id, sender_id, type, body) values (v_chat, me, 'system', 'created the group');
  return v_chat;
end $$;

create or replace function public.add_group_members(p_chat uuid, p_members uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_new uuid[];
begin
  if not exists (select 1 from chats c join chat_members m on m.chat_id = c.id
                 where c.id = p_chat and c.is_group and m.user_id = me) then
    raise exception 'not a member of this group';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_new
  from unnest(p_members) x
  where not exists (select 1 from chat_members where chat_id = p_chat and user_id = x)
    and exists (select 1 from profiles where id = x);
  if coalesce(array_length(v_new, 1), 0) = 0 then return; end if;
  if exists (select 1 from blocks where blocker_id = any(v_new) and blocked_id = me) then
    raise exception 'One of these people can''t be added';
  end if;
  insert into chat_members (chat_id, user_id) select p_chat, x from unnest(v_new) x;  -- limit trigger applies
  insert into messages (chat_id, sender_id, type, body) values (p_chat, me, 'system', 'added ' || names_of(v_new));
end $$;

create or replace function public.remove_group_member(p_chat uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not exists (select 1 from chat_members where chat_id = p_chat and user_id = me and role = 'owner') then
    raise exception 'Only the group owner can remove people';
  end if;
  if p_user = me then raise exception 'Use "Leave group" instead'; end if;
  insert into messages (chat_id, sender_id, type, body)
    values (p_chat, me, 'system', 'removed ' || coalesce(names_of(array[p_user]), 'someone'));
  delete from chat_members where chat_id = p_chat and user_id = p_user;
end $$;

create or replace function public.leave_group(p_chat uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_role text;
begin
  select m.role into v_role from chat_members m join chats c on c.id = m.chat_id
   where m.chat_id = p_chat and m.user_id = me and c.is_group;
  if v_role is null then raise exception 'not a member of this group'; end if;

  insert into messages (chat_id, sender_id, type, body) values (p_chat, me, 'system', 'left the group');
  delete from chat_members where chat_id = p_chat and user_id = me;

  if not exists (select 1 from chat_members where chat_id = p_chat) then
    delete from chats where id = p_chat;
  elsif v_role = 'owner' then
    update chat_members set role = 'owner'
     where chat_id = p_chat
       and user_id = (select user_id from chat_members where chat_id = p_chat order by joined_at limit 1);
  end if;
end $$;

create or replace function public.rename_group(p_chat uuid, p_title text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if coalesce(char_length(trim(p_title)), 0) = 0 then raise exception 'Give the group a name'; end if;
  update chats set title = left(trim(p_title), 64)
   where id = p_chat and is_group and exists (select 1 from chat_members where chat_id = p_chat and user_id = me);
  if not found then raise exception 'not a member of this group'; end if;
  insert into messages (chat_id, sender_id, type, body)
    values (p_chat, me, 'system', 'renamed the group to "' || left(trim(p_title), 64) || '"');
end $$;

-- Chat list now covers groups too (return type changed -> drop first).
drop function if exists public.my_chats();
create function public.my_chats()
returns table (
  chat_id         uuid,
  is_group        boolean,
  title           text,
  pinned          boolean,
  muted           boolean,
  private_mode    boolean,
  last_message_at timestamptz,
  unread          integer,
  blocked_by_me   boolean,
  my_role         text,
  owner_id        uuid,
  member_ids      uuid[],
  other_id        uuid,
  other_username  text,
  other_name      text,
  other_avatar    text,
  other_last_seen timestamptz,
  last_message    jsonb
) language sql stable security invoker set search_path = public as $$
  select
    c.id, c.is_group, c.title, m.pinned, m.muted, c.private_mode, c.last_message_at,
    (select count(*)::int from messages x
      where x.chat_id = c.id and x.sender_id <> auth.uid() and x.type <> 'system'
        and x.created_at > m.last_read_at
        and x.created_at > coalesce(m.cleared_at, '-infinity')
        and (x.expires_at is null or x.expires_at > now())),
    case when c.is_group then false
         else exists (select 1 from blocks b where b.blocker_id = auth.uid() and b.blocked_id = o.id) end,
    m.role,
    (select x.user_id from chat_members x where x.chat_id = c.id and x.role = 'owner' limit 1),
    (select array_agg(x.user_id order by x.joined_at) from chat_members x where x.chat_id = c.id),
    o.id, o.username, o.name, o.avatar_url, o.last_seen,
    (select to_jsonb(x) from messages x
      where x.chat_id = c.id
        and x.created_at > coalesce(m.cleared_at, '-infinity')
        and (x.expires_at is null or x.expires_at > now())
      order by x.created_at desc limit 1)
  from chat_members m
  join chats c on c.id = m.chat_id
  left join lateral (
    select p.* from chat_members om join profiles p on p.id = om.user_id
    where om.chat_id = c.id and om.user_id <> m.user_id and not c.is_group
    limit 1
  ) o on true
  where m.user_id = auth.uid() and not m.hidden
  order by m.pinned desc, c.last_message_at desc;
$$;

-- ---------------------------------------------------------------------
-- 2. Calls: group calls + who is in a call
-- ---------------------------------------------------------------------

alter table public.calls alter column callee_id drop not null;
alter table public.calls add column if not exists is_group boolean not null default false;
alter table public.calls drop constraint if exists calls_target_check;
alter table public.calls add constraint calls_target_check
  check ((is_group and callee_id is null) or (not is_group and callee_id is not null));
create index if not exists calls_chat_idx on public.calls (chat_id, created_at desc);

create table if not exists public.call_participants (
  call_id   uuid not null references public.calls (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (call_id, user_id)
);
alter table public.call_participants enable row level security;
revoke insert, update, delete on public.call_participants from authenticated, anon;

create or replace function public.can_see_call(p_call uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from calls c
    where c.id = p_call
      and (c.caller_id = auth.uid() or c.callee_id = auth.uid() or (c.is_group and is_chat_member(c.chat_id)))
  );
$$;

drop policy if exists "call_participants: read" on public.call_participants;
create policy "call_participants: read" on public.call_participants for select to authenticated
  using (can_see_call(call_id));

drop policy if exists "calls: read" on public.calls;
create policy "calls: read" on public.calls for select to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid() or (is_group and is_chat_member(chat_id)));

drop policy if exists "calls: start" on public.calls;
create policy "calls: start" on public.calls for insert to authenticated with check (
  caller_id = auth.uid()
  and is_chat_member(chat_id)
  and not chat_is_blocked(chat_id)
  and (
    (not is_group and callee_id <> caller_id
      and exists (select 1 from chats c where c.id = calls.chat_id and not c.is_group)
      and exists (select 1 from chat_members m where m.chat_id = calls.chat_id and m.user_id = calls.callee_id))
    or
    (is_group and callee_id is null
      and exists (select 1 from chats c where c.id = calls.chat_id and c.is_group))
  )
);

drop policy if exists "calls: update" on public.calls;
create policy "calls: update" on public.calls for update to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid() or (is_group and is_chat_member(chat_id)))
  with check (caller_id = auth.uid() or callee_id = auth.uid() or (is_group and is_chat_member(chat_id)));

-- The caller is in the call from the start.
create or replace function public.after_call_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into call_participants (call_id, user_id) values (new.id, new.caller_id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists calls_after_insert on public.calls;
create trigger calls_after_insert after insert on public.calls
  for each row execute function public.after_call_insert();

-- Answer / join a call (1:1 or group).
create or replace function public.join_call(p_call uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c calls;
begin
  if not can_see_call(p_call) then raise exception 'Call not found'; end if;
  select * into c from calls where id = p_call for update;
  if c.status not in ('ringing', 'active') then raise exception 'This call has ended'; end if;
  insert into call_participants (call_id, user_id) values (p_call, auth.uid())
    on conflict (call_id, user_id) do update set left_at = null, joined_at = now();
  if auth.uid() <> c.caller_id then
    update calls set status = 'active', answered_at = coalesce(answered_at, now()) where id = p_call;
  end if;
end $$;

-- Hang up / decline. 1:1 calls end for both; a group call ends when the last person leaves.
create or replace function public.leave_call(p_call uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  c calls;
  me uuid := auth.uid();
  v_status text;
begin
  if not can_see_call(p_call) then raise exception 'Call not found'; end if;
  select * into c from calls where id = p_call for update;
  update call_participants set left_at = now() where call_id = p_call and user_id = me and left_at is null;
  if c.status in ('ended', 'missed', 'declined', 'cancelled') then return c.status; end if;

  if not c.is_group then
    v_status := case when c.status = 'ringing'
                     then case when me = c.caller_id then 'cancelled' else 'declined' end
                     else 'ended' end;
  else
    if exists (select 1 from call_participants where call_id = p_call and left_at is null) then
      return c.status;          -- others are still in the group call
    end if;
    if c.status = 'ringing' and me <> c.caller_id then
      return c.status;          -- one member declined; others may still answer
    end if;
    v_status := case when c.status = 'ringing' then 'cancelled' else 'ended' end;
  end if;

  update calls set status = v_status, ended_at = now() where id = p_call;
  return v_status;
end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_participants') then
    alter publication supabase_realtime add table public.call_participants;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Push notification subscriptions (one row per device/browser)
-- ---------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke insert, update, delete on public.push_subscriptions from authenticated, anon;

drop policy if exists "push: read own" on public.push_subscriptions;
create policy "push: read own" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());

-- Save this device for the signed-in user (a device that switches account moves to the new user).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void language sql security definer set search_path = public as $$
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from anon;
revoke execute on function public.delete_push_subscription(text) from anon;

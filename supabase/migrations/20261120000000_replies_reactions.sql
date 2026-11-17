-- =====================================================================
-- OSNO — replies and reactions
-- Run in the Supabase SQL editor after the earlier migrations.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Replies: a message can quote another message from the same chat
-- ---------------------------------------------------------------------

alter table public.messages
  add column if not exists reply_to uuid references public.messages (id) on delete set null;
create index if not exists messages_reply_to_idx on public.messages (reply_to) where reply_to is not null;

-- true when p_reply is a message of chat p_chat (helper, so the policy doesn't query messages itself)
create or replace function public.reply_in_chat(p_reply uuid, p_chat uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from messages where id = p_reply and chat_id = p_chat);
$$;

drop policy if exists "messages: send" on public.messages;
create policy "messages: send" on public.messages for insert to authenticated with check (
  sender_id = auth.uid()
  and type <> 'system'
  and is_chat_member(chat_id)
  and not chat_is_blocked(chat_id)
  and (reply_to is null or reply_in_chat(reply_to, chat_id))
);

-- ---------------------------------------------------------------------
-- Reactions: one emoji per person per message (tap another to change, emoji = null to remove)
-- Rows are never deleted by users, so live updates stay private (Realtime applies the
-- security rules to inserts/updates, not to deletes).
-- ---------------------------------------------------------------------

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  chat_id    uuid not null references public.chats (id) on delete cascade,  -- filled in by the trigger
  emoji      text check (emoji is null or char_length(emoji) between 1 and 16),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_chat_idx on public.message_reactions (chat_id);

-- chat_id always comes from the message (can't be faked); reacting to system notes isn't allowed
create or replace function public.before_reaction_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_chat uuid; v_type text;
begin
  select chat_id, type into v_chat, v_type from messages where id = new.message_id;
  if v_chat is null then raise exception 'message not found'; end if;
  if v_type = 'system' then raise exception 'cannot react to this message'; end if;
  new.chat_id := v_chat;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists message_reactions_before_write on public.message_reactions;
create trigger message_reactions_before_write
  before insert or update on public.message_reactions
  for each row execute function public.before_reaction_write();

alter table public.message_reactions enable row level security;

drop policy if exists "reactions: read" on public.message_reactions;
create policy "reactions: read" on public.message_reactions for select to authenticated
  using (is_chat_member(chat_id));

drop policy if exists "reactions: add" on public.message_reactions;
create policy "reactions: add" on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and is_chat_member(chat_id) and not chat_is_blocked(chat_id));

drop policy if exists "reactions: change" on public.message_reactions;
create policy "reactions: change" on public.message_reactions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_chat_member(chat_id) and not chat_is_blocked(chat_id));

revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;
grant insert (message_id, user_id, emoji) on public.message_reactions to authenticated;
grant update (emoji) on public.message_reactions to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;

-- Set / change / remove (p_emoji = null) my reaction. Runs with the caller's own permissions,
-- so the security rules above still apply.
create or replace function public.set_reaction(p_message uuid, p_emoji text)
returns void language sql security invoker set search_path = public as $$
  insert into message_reactions (message_id, user_id, emoji)
  values (p_message, auth.uid(), nullif(trim(p_emoji), ''))
  on conflict (message_id, user_id) do update set emoji = excluded.emoji;
$$;
revoke execute on function public.set_reaction(uuid, text) from anon;

-- =====================================================================
-- OSNO — read receipts ("✓✓ Seen")
-- Run in the Supabase SQL editor after the earlier migrations.
--
-- A small dedicated table mirrors chat_members.last_read_at, so live updates only
-- share "who has read up to when" — not private member settings (mute, pin, ...).
-- =====================================================================

create table if not exists public.read_receipts (
  chat_id  uuid not null references public.chats (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  read_at  timestamptz not null,
  primary key (chat_id, user_id)
);

alter table public.read_receipts enable row level security;
revoke all on public.read_receipts from anon, authenticated;
grant select on public.read_receipts to authenticated;

drop policy if exists "receipts: read" on public.read_receipts;
create policy "receipts: read" on public.read_receipts for select to authenticated
  using (is_chat_member(chat_id));

-- keep it in sync with chat_members.last_read_at (set by mark_chat_read / sending a message)
create or replace function public.sync_read_receipt()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from read_receipts where chat_id = old.chat_id and user_id = old.user_id;
    return old;
  end if;
  insert into read_receipts (chat_id, user_id, read_at)
  values (new.chat_id, new.user_id, new.last_read_at)
  on conflict (chat_id, user_id) do update set read_at = excluded.read_at
  where read_receipts.read_at is distinct from excluded.read_at;
  return new;
end $$;

drop trigger if exists chat_members_read_receipt on public.chat_members;
create trigger chat_members_read_receipt
  after insert or update of last_read_at or delete on public.chat_members
  for each row execute function public.sync_read_receipt();

-- existing chats
insert into public.read_receipts (chat_id, user_id, read_at)
select chat_id, user_id, last_read_at from public.chat_members
on conflict (chat_id, user_id) do nothing;

do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'read_receipts') then
    alter publication supabase_realtime add table public.read_receipts;
  end if;
end $$;

-- =====================================================================
-- OSNO — group photos and video circles (round video messages, max 10 s)
-- Run in the Supabase SQL editor after the earlier migrations.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Video circles: new message type "video"
-- ---------------------------------------------------------------------
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check
  check (type in ('text', 'image', 'file', 'audio', 'video', 'system'));

-- ---------------------------------------------------------------------
-- Group photo
-- ---------------------------------------------------------------------
alter table public.chats add column if not exists avatar_url text;

-- Only the group owner (creator; passes on if they leave) may change the group photo.
create or replace function public.is_group_owner(p_chat uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from chat_members m join chats c on c.id = m.chat_id
                 where m.chat_id = p_chat and m.user_id = auth.uid() and m.role = 'owner' and c.is_group);
$$;

-- Storage: group photos live in the public "avatars" bucket under groups/<chat_id>/...
-- Only the group owner may upload / remove files there.
drop policy if exists "avatars: group members upload" on storage.objects;
drop policy if exists "avatars: group owner upload" on storage.objects;
create policy "avatars: group owner upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'groups'
    and public.is_group_owner(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "avatars: group members delete" on storage.objects;
drop policy if exists "avatars: group owner delete" on storage.objects;
create policy "avatars: group owner delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'groups'
    and public.is_group_owner(((storage.foldername(name))[2])::uuid)
  );

-- Set (url) or remove (null) the group photo. Only the owner; the url must point to this group's folder.
create or replace function public.set_group_avatar(p_chat uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not is_group_owner(p_chat) then
    raise exception 'Only the group creator can change the group photo';
  end if;
  if p_url is not null and p_url not like '%/storage/v1/object/public/avatars/groups/' || p_chat || '/%' then
    raise exception 'invalid photo';
  end if;
  update chats set avatar_url = p_url where id = p_chat;
  insert into messages (chat_id, sender_id, type, body)
  values (p_chat, me, 'system', case when p_url is null then 'removed the group photo' else 'changed the group photo' end);
end $$;
revoke execute on function public.set_group_avatar(uuid, text) from anon;

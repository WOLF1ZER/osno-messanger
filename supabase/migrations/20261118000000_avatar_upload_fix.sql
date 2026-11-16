-- =====================================================================
-- OSNO — fix "new row violates row-level security policy" on avatar upload.
-- Storage reads the uploaded row back (and upserts need SELECT + UPDATE),
-- but the avatars bucket only had INSERT/UPDATE/DELETE policies.
-- Run in the Supabase SQL editor.
-- =====================================================================

drop policy if exists "avatars: read" on storage.objects;
create policy "avatars: read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars');   -- the bucket is public anyway

-- make the update policy also check the new row stays in your folder
drop policy if exists "avatars: owner update" on storage.objects;
create policy "avatars: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

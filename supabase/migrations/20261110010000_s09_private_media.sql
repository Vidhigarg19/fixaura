-- S09: Private media, retention and deletion.
-- Creates the PRIVATE `repair-private-media` bucket and owner-only RLS policies
-- on storage.objects. ADDITIVE + idempotent; safe on live and on a fresh project.
--
-- Object path layout: `<userId>/<sessionId>/<uuid>.<ext>`
-- Ownership is enforced by matching the FIRST path segment to the caller's uid
-- (storage.foldername(name)[1] = auth.uid()::text). The bucket is never public:
-- reads happen only through short-lived signed URLs created by the owner.

-- 1) Private bucket with strict MIME + size limits (defense in depth; the client
--    validates too). 5 MB cap matches src/services/mediaService.ts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'repair-private-media',
  'repair-private-media',
  false,
  5242880, -- 5 * 1024 * 1024
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Owner-only RLS on storage.objects for this bucket. RLS is already enabled
--    on storage.objects by Supabase; we only add the policies.
drop policy if exists "repair media: owner can read" on storage.objects;
create policy "repair media: owner can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'repair-private-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "repair media: owner can insert" on storage.objects;
create policy "repair media: owner can insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'repair-private-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "repair media: owner can update" on storage.objects;
create policy "repair media: owner can update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'repair-private-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'repair-private-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "repair media: owner can delete" on storage.objects;
create policy "repair media: owner can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'repair-private-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- =============================================================================
-- Migration 0021 — private KYC storage bucket + policies
-- =============================================================================
-- KYC documents (ID, licence, selfie) are sensitive PII and must NOT live in a
-- public bucket. This creates a private `kyc` bucket and storage.objects RLS so:
--   * a driver can upload to / read only their own folder (path = <auth.uid>/...)
--   * platform admins (is_saas_admin) can read every KYC object
-- Access from the app is via short-lived signed URLs; the driver_kyc.*_url
-- columns now hold the object PATH (e.g. '<uid>/id_doc.jpg'), not a public URL.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc', 'kyc', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Admins read all KYC objects.
drop policy if exists "kyc admin read" on storage.objects;
create policy "kyc admin read" on storage.objects for select to authenticated
  using (bucket_id = 'kyc' and public.is_saas_admin());

-- Drivers read only their own folder.
drop policy if exists "kyc owner read" on storage.objects;
create policy "kyc owner read" on storage.objects for select to authenticated
  using (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);

-- Drivers upload only into their own folder.
drop policy if exists "kyc owner insert" on storage.objects;
create policy "kyc owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);

-- Drivers replace only their own objects.
drop policy if exists "kyc owner update" on storage.objects;
create policy "kyc owner update" on storage.objects for update to authenticated
  using (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);

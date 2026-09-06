-- =============================================================================
-- seed.sql — demo users for local dev / a fresh database
-- =============================================================================
--
-- WHY THIS FILE EXISTS (read before editing):
--
-- These demo users were originally created by raw INSERTs into auth.users that
-- did NOT set the GoTrue token/change string columns. Those columns then
-- defaulted to NULL. GoTrue (the auth service) scans them into non-nullable Go
-- strings, so EVERY password login failed with a 500:
--     "error finding user: sql: Scan error on column index N,
--      name \"confirmation_token\": converting NULL to string is unsupported"
--   -> surfaced in the UI as "Database error querying schema".
--
-- The fix — and the rule for seeding auth users by SQL — is:
--   ***set every *_token / email_change / phone_change column to '' (empty
--   string), NEVER leave them NULL.***
--
-- Better still, in application/tooling code create demo users through the Admin
-- API (supabase.auth.admin.createUser), which initialises all of these columns
-- correctly. This SQL seed exists for `supabase db reset` / CI where the Admin
-- API is not convenient.
--
-- This script is idempotent (ON CONFLICT DO NOTHING) and safe to re-run.
-- Demo passwords are intentionally committed — these are throwaway demo
-- accounts on a demo dataset, not real users. Rotate before any public demo.
-- =============================================================================

-- Demo credentials (email : password)
--   owner@demo.cm  : DemoOwner2026!
--   admin@demo.cm  : DemoAdmin2026!
--   driver@demo.cm : DemoDriver2026!

do $$
declare
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
  rec record;
begin
  for rec in
    select * from (values
      ('11111111-1111-1111-1111-111111111111'::uuid, 'owner@demo.cm',  'DemoOwner2026!',  'Demo Owner'),
      ('ad000000-0000-0000-0000-000000000001'::uuid, 'admin@demo.cm',  'DemoAdmin2026!',  'Platform Admin'),
      ('d1111111-1111-1111-1111-111111111111'::uuid, 'driver@demo.cm', 'DemoDriver2026!', 'Driver Demo')
    ) as t(id, email, password, full_name)
  loop
    -- auth.users: NOTE every token/change string column is '' (never NULL).
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token,
      reauthentication_token
    ) values (
      v_instance, rec.id, 'authenticated', 'authenticated', rec.email,
      crypt(rec.password, gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', rec.full_name),
      '', '',
      '', '', '',
      '', '',
      ''
    )
    on conflict (id) do nothing;

    -- auth.identities: email provider row so GoTrue's email lookup resolves.
    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      rec.id::text, rec.id,
      jsonb_build_object('sub', rec.id::text, 'email', rec.email),
      'email', now(), now(), now()
    )
    on conflict do nothing;
  end loop;
end $$;

-- public.profiles rows are created automatically by the on_auth_user_created
-- trigger (handle_new_user) on a fresh insert. On re-run the ON CONFLICT above
-- skips the insert, so the trigger does not re-fire — profiles stay intact.

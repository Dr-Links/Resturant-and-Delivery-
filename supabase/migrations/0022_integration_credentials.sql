-- =============================================================================
-- Migration 0022 — integration credentials store (Vault-encrypted)
-- =============================================================================
-- Lets platform admins manage third-party API credentials (MTN MoMo, Orange
-- Money, Google Maps, and arbitrary future integrations) from the admin
-- dashboard. Security model:
--   * Secret values are stored in Supabase Vault (encrypted at rest); the
--     settings row holds only a vault_secret_id reference, never the plaintext.
--   * Non-secret config (base URLs, currency, target env, public keys) is stored
--     inline in `value`.
--   * Admins can READ metadata (which keys exist, non-secret values, whether a
--     secret is set) but NEVER the decrypted secret — writes go through
--     SECURITY DEFINER RPCs gated on is_saas_admin(); the raw secret is never
--     returned to the client.
--   * The SERVER (service_role only) reads decrypted config via
--     get_integration_config() to actually call the third-party APIs.
-- =============================================================================

create table if not exists public.integration_providers (
  key        text primary key,
  label      text not null,
  category   text not null default 'other',
  enabled    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_settings (
  id              uuid primary key default gen_random_uuid(),
  provider_key    text not null references public.integration_providers(key) on delete cascade,
  setting_key     text not null,
  label           text,
  is_secret       boolean not null default false,
  value           text,            -- non-secret values only
  vault_secret_id uuid,            -- secret values: reference into vault.secrets
  updated_at      timestamptz not null default now(),
  unique (provider_key, setting_key)
);

alter table public.integration_providers enable row level security;
alter table public.integration_settings  enable row level security;

-- Providers: admins read / add / update (non-secret). Delete via RPC (cleans vault).
create policy iprov_admin_read   on public.integration_providers for select using (public.is_saas_admin());
create policy iprov_admin_insert on public.integration_providers for insert with check (public.is_saas_admin());
create policy iprov_admin_update on public.integration_providers for update using (public.is_saas_admin()) with check (public.is_saas_admin());

-- Settings: admins read metadata only (value is null for secrets). All writes go
-- through the vault-aware RPCs below (no insert/update/delete policy here).
create policy iset_admin_read on public.integration_settings for select using (public.is_saas_admin());

-- ── write RPCs (admin, SECURITY DEFINER) ─────────────────────────────────────

create or replace function public.admin_set_integration_setting(
  p_provider text, p_setting_key text, p_is_secret boolean, p_value text, p_label text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_existing uuid; v_secret_id uuid; v_name text;
begin
  if not public.is_saas_admin() then raise exception 'not authorized'; end if;

  insert into public.integration_providers(key, label, category)
  values (p_provider, initcap(replace(p_provider, '_', ' ')), 'other')
  on conflict (key) do nothing;

  if p_is_secret then
    v_name := 'integration:' || p_provider || ':' || p_setting_key;
    select vault_secret_id into v_existing
      from public.integration_settings
      where provider_key = p_provider and setting_key = p_setting_key;
    if v_existing is not null then
      perform vault.update_secret(v_existing, p_value, v_name, 'integration credential');
      v_secret_id := v_existing;
    else
      v_secret_id := vault.create_secret(p_value, v_name, 'integration credential');
    end if;
    insert into public.integration_settings(provider_key, setting_key, label, is_secret, value, vault_secret_id, updated_at)
    values (p_provider, p_setting_key, p_label, true, null, v_secret_id, now())
    on conflict (provider_key, setting_key) do update
      set is_secret = true, value = null, vault_secret_id = v_secret_id,
          label = coalesce(excluded.label, public.integration_settings.label), updated_at = now();
  else
    insert into public.integration_settings(provider_key, setting_key, label, is_secret, value, vault_secret_id, updated_at)
    values (p_provider, p_setting_key, p_label, false, p_value, null, now())
    on conflict (provider_key, setting_key) do update
      set is_secret = false, value = excluded.value, vault_secret_id = null,
          label = coalesce(excluded.label, public.integration_settings.label), updated_at = now();
  end if;
end $$;

create or replace function public.admin_delete_integration_setting(p_provider text, p_setting_key text)
returns void language plpgsql security definer set search_path = public as $$
declare v_secret uuid;
begin
  if not public.is_saas_admin() then raise exception 'not authorized'; end if;
  select vault_secret_id into v_secret from public.integration_settings
    where provider_key = p_provider and setting_key = p_setting_key;
  delete from public.integration_settings where provider_key = p_provider and setting_key = p_setting_key;
  if v_secret is not null then delete from vault.secrets where id = v_secret; end if;
end $$;

create or replace function public.admin_delete_provider(p_provider text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_saas_admin() then raise exception 'not authorized'; end if;
  delete from vault.secrets v using public.integration_settings s
    where s.provider_key = p_provider and s.vault_secret_id = v.id;
  delete from public.integration_providers where key = p_provider; -- cascades settings
end $$;

revoke all on function public.admin_set_integration_setting(text,text,boolean,text,text) from public;
revoke all on function public.admin_delete_integration_setting(text,text) from public;
revoke all on function public.admin_delete_provider(text) from public;
grant execute on function public.admin_set_integration_setting(text,text,boolean,text,text) to authenticated;
grant execute on function public.admin_delete_integration_setting(text,text) to authenticated;
grant execute on function public.admin_delete_provider(text) to authenticated;

-- ── server read RPC (service_role ONLY — returns decrypted secrets) ──────────

create or replace function public.get_integration_config(p_provider text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb := '{}'::jsonb; rec record;
begin
  for rec in
    select setting_key, is_secret, value, vault_secret_id
    from public.integration_settings where provider_key = p_provider
  loop
    if rec.is_secret then
      result := result || jsonb_build_object(
        rec.setting_key,
        (select decrypted_secret from vault.decrypted_secrets where id = rec.vault_secret_id));
    else
      result := result || jsonb_build_object(rec.setting_key, rec.value);
    end if;
  end loop;
  return result;
end $$;

revoke all on function public.get_integration_config(text) from public, anon, authenticated;
grant execute on function public.get_integration_config(text) to service_role;

-- ── seed known integrations (secrets left unset until the admin enters them) ──

insert into public.integration_providers(key, label, category, enabled) values
  ('mtn_momo',     'MTN Mobile Money', 'payments', false),
  ('orange_money', 'Orange Money',     'payments', false),
  ('google_maps',  'Google Maps',      'maps',     false)
on conflict (key) do nothing;

-- non-secret defaults + secret placeholders (vault_secret_id null = "not set")
insert into public.integration_settings(provider_key, setting_key, label, is_secret, value) values
  ('mtn_momo', 'MOMO_BASE_URL',   'Base URL',   false, 'https://sandbox.momodeveloper.mtn.com'),
  ('mtn_momo', 'MOMO_TARGET_ENV', 'Target env', false, 'sandbox'),
  ('mtn_momo', 'MOMO_CURRENCY',   'Currency',   false, 'XAF'),
  ('orange_money', 'ORANGE_OAUTH_URL', 'OAuth URL', false, 'https://api.orange.com/oauth/v3/token'),
  ('orange_money', 'ORANGE_BASE_URL',  'Base URL',  false, 'https://api.orange.com/orange-money-webpay/cm/v1'),
  ('orange_money', 'ORANGE_CURRENCY',  'Currency',  false, 'XAF')
on conflict (provider_key, setting_key) do nothing;

insert into public.integration_settings(provider_key, setting_key, label, is_secret, value) values
  ('mtn_momo', 'MOMO_API_USER', 'API user', true, null),
  ('mtn_momo', 'MOMO_API_KEY', 'API key', true, null),
  ('mtn_momo', 'MOMO_COLLECTION_SUBSCRIPTION_KEY', 'Collection subscription key', true, null),
  ('mtn_momo', 'MOMO_DISBURSEMENT_SUBSCRIPTION_KEY', 'Disbursement subscription key', true, null),
  ('orange_money', 'ORANGE_CLIENT_ID', 'Client ID', true, null),
  ('orange_money', 'ORANGE_CLIENT_SECRET', 'Client secret', true, null),
  ('orange_money', 'ORANGE_MERCHANT_KEY', 'Merchant key', true, null),
  ('google_maps', 'GOOGLE_MAPS_API_KEY', 'API key', true, null)
on conflict (provider_key, setting_key) do nothing;

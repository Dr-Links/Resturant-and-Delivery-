-- =============================================================================
-- Migration 0026 — 3D model generation provider slot
-- =============================================================================
-- Reserves a place in the dashboard integration store for a future AI photo→3D
-- generation service (Meshy / Luma / Kaedim / etc.). Secret left unset until the
-- owner enters it. Consumed later by the (not-yet-built) 3D-gen wiring.
-- =============================================================================

insert into public.integration_providers(key, label, category, enabled) values
  ('threed_gen', '3D model generation (AI photo→3D)', 'ai', false)
on conflict (key) do nothing;

insert into public.integration_settings(provider_key, setting_key, label, is_secret, value) values
  ('threed_gen', 'THREEDGEN_PROVIDER', 'Provider (e.g. meshy)', false, null),
  ('threed_gen', 'THREEDGEN_BASE_URL', 'Base URL', false, null)
on conflict (provider_key, setting_key) do nothing;

insert into public.integration_settings(provider_key, setting_key, label, is_secret, value) values
  ('threed_gen', 'THREEDGEN_API_KEY', 'API key', true, null)
on conflict (provider_key, setting_key) do nothing;

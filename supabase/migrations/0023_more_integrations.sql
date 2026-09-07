-- =============================================================================
-- Migration 0023 — register Anthropic, Resend, Twilio in the integration store
-- =============================================================================
-- Brings the remaining third-party keys into the dashboard-managed, Vault-backed
-- integration store (0022):
--   * anthropic  — AI assistant (read by the Next /api/ai/assistant route)
--   * resend     — email  (read by the notify-fanout edge function)
--   * twilio     — SMS    (read by the notify-fanout edge function)
-- Secrets left unset (null) until entered in /admin/integrations. Env vars /
-- Supabase secrets remain a fallback in code.
-- =============================================================================

insert into public.integration_providers(key, label, category, enabled) values
  ('anthropic', 'Anthropic (AI assistant)', 'ai',            false),
  ('resend',    'Resend (email)',           'notifications', false),
  ('twilio',    'Twilio (SMS)',             'notifications', false)
on conflict (key) do nothing;

-- non-secret defaults
insert into public.integration_settings(provider_key, setting_key, label, is_secret, value) values
  ('anthropic', 'ANTHROPIC_MODEL', 'Model', false, 'claude-sonnet-4-6'),
  ('resend',    'RESEND_FROM',     'From address', false, 'Chez Marie <onboarding@resend.dev>'),
  ('twilio',    'TWILIO_FROM',     'From number', false, null)
on conflict (provider_key, setting_key) do nothing;

-- secret placeholders (vault_secret_id null = "not set")
insert into public.integration_settings(provider_key, setting_key, label, is_secret, value) values
  ('anthropic', 'ANTHROPIC_API_KEY',   'API key',    true, null),
  ('resend',    'RESEND_API_KEY',      'API key',    true, null),
  ('twilio',    'TWILIO_ACCOUNT_SID',  'Account SID', true, null),
  ('twilio',    'TWILIO_AUTH_TOKEN',   'Auth token', true, null)
on conflict (provider_key, setting_key) do nothing;

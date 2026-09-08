-- =============================================================================
-- Migration 0028 — platform-wide 3D/AR on-off switch
-- =============================================================================
-- SaaS-admin toggle (in /admin/settings) to enable/disable the 3D/AR dish view
-- across the whole platform. Default TRUE so existing working models (e.g. the
-- Avocado Bowl) keep showing. platform_config is anon-readable (pconfig_read
-- using(true)), so the customer menu can read this flag.
-- =============================================================================

alter table public.platform_config
  add column if not exists three_d_enabled boolean not null default true;

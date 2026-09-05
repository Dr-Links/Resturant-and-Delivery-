# Security posture

## Enforced
- **RLS on every table**, verified with simulated authenticated sessions across the build:
  restaurant-to-restaurant isolation, driver KYC visible only to the driver + SaaS admin,
  delivery confirmation codes readable by the customer but never the driver, and the
  AI "propose → confirm → apply" gate (no silent menu changes).
- Guest actions go through `SECURITY DEFINER` RPCs that compute prices/permissions
  server-side (`place_order`, `create_delivery_request`, `verify_delivery_code`, …),
  so clients never write trusted fields directly.
- Internal/trigger functions are not REST-callable (grants revoked).

## Fixed in 0015
- Dropped the unused legacy `chat_messages` table.
- Pinned `search_path` on `km_between`.
- Revoked REST execute from internal/trigger functions.

## Documented / remaining (low risk)
- **Helper functions in `public`** (`is_saas_admin`, `can_access_restaurant`, …) are
  flagged by the linter as anon-executable. They return booleans only and yield `false`
  for anonymous callers, so they leak nothing. Revoking their EXECUTE breaks RLS policy
  evaluation (empirically confirmed). The clean fix is moving them to a non-exposed
  `private` schema and repointing ~40 policies — deferred as a careful, separately
  verified change.
- **Leaked-password protection**: enable HaveIBeenPwned checks in
  Supabase Auth settings (one toggle, no code).
- **`notify-fanout` edge function** runs with `verify_jwt = false` so the
  database (`pg_net`) can invoke it directly; it authenticates each call with a
  shared token in `public.app_settings` (RLS-locked, service-role only). Rotate
  the token by updating `app_settings.notify_token`.
- **`citext` in public schema**: cosmetic linter note; safe to leave.

## Operational
- Supabase provides automated daily backups (Pro plan); enable PITR if required.
- Secrets to set in Vercel: `ANTHROPIC_API_KEY` (AI), and — when integrating —
  mobile-money (MTN/Orange) and KYC-provider credentials.

# Restaurant Experience + Delivery SaaS — Plan & Status

> Source-of-truth spec, **reconstructed from the codebase** (no separate written
> plan existed — the `§`-numbers in migration comments referenced a spec that was
> never committed). This file is the canonical "what's built / what's left."
> Last updated: 2026-09-07.

## What this product is

A multi-tenant SaaS with three surfaces on one Supabase backend:

1. **Customer experience** — scan a table QR → browse a digital menu → view dishes
   in **3D/AR** → order, with live table sessions. Plus an on-demand **delivery**
   flow (send a package/food, live driver tracking).
2. **Restaurant dashboard** — menu, orders board, tables & QR, analytics
   (view→AR→cart→order funnel), feedback, AI assistant, per-restaurant deliveries.
3. **Platform admin console** — the SaaS operator: restaurants, SaaS drivers, KYC,
   deliveries, complaints, suggestions, audit, **integrations/API keys**, settings.

Plus an **Expo/React Native driver app** (`apps/driver/`) for independent drivers.

## Stack & deployment

- **Web:** Next.js 14 (App Router, TS) at repo root → **Vercel** (auto-deploys from
  `master`). Live: <https://resturant-and-delivery.vercel.app>.
- **DB/Auth/Storage:** Supabase project `ylgvwzwmgeiuyhomxvuh` (eu-west-3, Postgres 17).
- **Driver app:** Expo (`apps/driver/`) — excluded from the Next build.
- **Edge functions:** Deno (`supabase/functions/`) — excluded from the Next build.
- **Tests:** Vitest (47 unit tests). `tsconfig` type-checks everything, so non-Next
  dirs (`apps`, `supabase`) are excluded to keep `next build` green.

### Demo accounts
| Role | Email | Password | Lands on |
|------|-------|----------|----------|
| Restaurant owner | `owner@demo.cm` | `DemoOwner2026!` | `/dashboard` |
| Platform admin | `admin@demo.cm` | `DemoAmin2026!` | `/admin` |
| Driver | `driver@demo.cm` | `DemoAmin2026!` | `/driver` |

## Build status — phases (all ✅ complete)

| Phase | Scope | Migrations |
|-------|-------|-----------|
| 1 | Auth, roles, restaurants, tables + permanent QR, menu, dining sessions, orders (+ additional-order chaining), restaurant dashboard, RLS isolation | `0001`–`0004` |
| 2 | 3D/AR model upload + approve→publish lifecycle (`menu_item_3d_models`) | `0005` |
| 3 | Food analytics funnel + engagement + feedback/reviews | `0006`, `0007` |
| 4 | Restaurant-owned delivery | `0008` |
| 5 | SaaS driver marketplace: driver identity/KYC, subscriptions, delivery offers/assignments, settlement ledger, ratings, customer tracking RPC | `0009`–`0013` |
| 6 | AI assistant (confirm-before-apply; never writes menu directly) | `0014` |
| 7 | Security hardening + in-app notifications + email/SMS fan-out | `0015`, `0016`, `0018` |
| 8 | Mobile-money payments (MTN MoMo / Orange Money) + driver settlement | `0017` |

## Build status — admin console & platform (this track, all ✅ live)

- **Role-aware login redirect** — platform admins → `/admin`, everyone else → `/dashboard`.
- **Admin overview** lists restaurants + SaaS drivers; rows link to detail pages.
- **Restaurant detail** (`/admin/restaurants/[id]`) — identity, owner, feature flags,
  and real counts (tables, menu items, **orders**, **active staff**) via
  `admin_restaurant_stats` — a `SECURITY DEFINER` RPC gated on `is_saas_admin()`
  (bypasses the staff-only RLS on `orders`/`restaurant_staff`). Migration `0019`.
- **Driver detail** (`/admin/drivers/[id]`) — contact, vehicle/rating, KYC (with
  document links), subscription, and delivery stats (total/completed/earnings) via
  `admin_driver_stats`. Migration `0020`.
- **KYC documents** — stored in a **private `kyc` Storage bucket** (migration `0021`);
  drivers upload/read only their own `<uid>/` folder, admins read all; the admin page
  views them via **short-lived signed URLs** (key never exposed).
- **KYC onboarding** — the driver dashboard's "become a driver" flow uploads
  ID/licence/selfie to the private bucket and records paths on `driver_kyc`; new
  drivers are `pending` until an admin approves (closes the loop end-to-end).

## Integrations / API-key manager (✅ live) — migration `0022`

`/admin/integrations` manages third-party credentials — **MTN MoMo**, **Orange Money**
(separately + grouped), **Google Maps**, and **arbitrary custom providers**.

- **Secrets encrypted at rest in Supabase Vault**; the settings row stores only a
  `vault_secret_id`, never plaintext.
- **Write-only in the UI** — secrets show "set / not set"; raw values are never sent
  back to the browser. Writes go through `is_saas_admin()`-gated `SECURITY DEFINER`
  RPCs (`admin_set_integration_setting`, `admin_delete_integration_setting`,
  `admin_delete_provider`).
- **Server-only decryption** — `get_integration_config(provider)` is granted to
  `service_role` **only** (revoked from anon/authenticated).
- **Payments consume it** — `lib/payments/resolve.ts` (server-only) builds MTN/Orange
  credentials from the store at request time, with **env vars as fallback** (so mock
  mode keeps working until real keys are entered). Enter keys in the dashboard → live,
  no redeploy. `lib/payments/index.ts` stays sync/env for unit tests.

## Maps & geocoding (✅ live)

- **Customer live tracking** — Leaflet + OpenStreetMap tiles (**no key needed**),
  polling driver location every 5s.
- **Admin → Deliveries** — overview map plotting geocoded destinations (Leaflet/OSM).
- **Google Geocoding** — `/api/geocode` turns typed addresses into coordinates using
  the Vault-stored Maps key **server-side** (key never reaches the browser); wired
  into delivery creation so destinations get real pins. No-ops gracefully if unset.

## Payments (✅ built; mock until credentials + service key)

- Intents: `create_order_payment` (anon, server-computed amount) →
  `mark_order_payment` (service-role only, idempotent, flips `orders.payment_status`).
- Providers: MTN MoMo (collections + disbursements), Orange Money web payment, and a
  **mock** that auto-confirms after `MOCK_PAY_DELAY_MS` when no creds are set.
- Routes: `/api/pay`, `/api/pay/status`, `/api/pay/webhook/[provider]`,
  `/api/driver/settle` (accepts cookie **or** Bearer token, so the Expo app settles
  through the real gateway).

## ⏳ Remaining — configuration only (no code left)

These are secrets **you** set; the code is done and waits for them.

1. **`SUPABASE_SERVICE_ROLE_KEY` in Vercel** — the single highest-leverage unlock. It
   lets the server decrypt Vault secrets and use the service role, activating:
   payment confirmation/settlement, KYC signed-URL document viewing, and Google
   geocoding — all reading from dashboard-managed keys.
2. **Enter real payment credentials** under `/admin/integrations` (MTN and/or Orange).
   Takes effect with no redeploy.
3. **Enter the Google Maps API key** under `/admin/integrations` (restrict it in Google
   Cloud Console). Enables geocoding → accurate delivery pins.
4. **Notification secrets** (Supabase edge-function secrets, not Vercel env):
   `supabase secrets set RESEND_API_KEY … TWILIO_ACCOUNT_SID …` to take email/SMS live.

## Known gaps / future ideas (optional)

- The Expo driver app is unverified in CI (excluded from the Next build); its
  gateway-settlement change needs a device/EAS build to confirm.
- `driver_kyc.*_url` columns now hold Storage **paths**, not URLs (documented; a future
  migration could rename them to `*_path`).
- Orange **disbursement** (driver payout) is not wired — falls back to mock; only MTN
  disbursement is implemented.
- Interactive (pan/zoom) Google maps would require exposing a referrer-restricted
  browser key — deliberately not done, to keep the Maps key server-side only.

## Operational notes

- **Always verify the Vercel deployment state after pushing** — a green local command
  is not proof; the pinned Vercel build (next 14.2.35) is the source of truth.
- Local Windows `next build` can hit a Turbopack panic; validate with
  `rm -rf .next && node_modules/.bin/tsc --noEmit` and `node_modules/.bin/vitest run`.
- Demo users must be seeded via `supabase/seed.sql` (or the Admin API) — never raw
  `INSERT` into `auth.users` without setting token columns to `''`, or GoTrue login
  breaks with "Database error querying schema".

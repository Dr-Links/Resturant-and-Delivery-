# Restaurant Experience + Delivery SaaS

Monorepo-lite. The web app (customer + restaurant dashboard + admin) lives at the
repo root and deploys to Vercel. The independent-driver mobile app (Expo) will be
in `apps/driver/` (Expo). Run it with `cd apps/driver && npm install && npx expo start`.

## Stack
- Next.js 14 (App Router, TypeScript) — root
- Supabase (Postgres + Auth + RLS + Storage) — project `ylgvwzwmgeiuyhomxvuh`
- AR: Google `<model-viewer>` (glb / usdz), behind an adapter for future WebXR

## Local dev
```bash
npm install
npm run dev
```
Set env (optional; public fallbacks are baked in):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Database
Migrations in `supabase/migrations/` are already applied to the live project.
Every table has Row-Level Security; restaurant data isolation is enforced by
`SECURITY DEFINER` helper functions.

## Routes
- `/` landing
- `/t/[token]` customer table experience (scan → menu → AR → order)
- `/login` staff sign-in
- `/dashboard` overview · `/dashboard/orders` live board · `/dashboard/menu` · `/dashboard/tables`

## Phase status
Phase 1 complete: auth, roles, restaurants, tables + permanent QR, menu, dining
sessions, orders (+ additional-order chaining), restaurant dashboard. Verified
end-to-end incl. RLS data isolation.

## AI assistant (Phase 6)
Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`) in Vercel to enable the dashboard AI assistant. The confirm-before-apply gate works without it; only the language model needs the key.

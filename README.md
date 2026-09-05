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

## Payments (Phase 8)
Mobile-money checkout (MTN MoMo / Orange Money) for food orders, plus driver
settlement. See `.env.example` for all keys.

- **Mock mode (default):** with no MTN/Orange keys set, payments run end-to-end
  and auto-confirm after `MOCK_PAY_DELAY_MS`, so the flow is fully testable.
- **Confirmation requires `SUPABASE_SERVICE_ROLE_KEY`** in Vercel — `mark_order_payment`
  is service-role only, so the status/webhook routes need it to settle a payment
  and flip the order to `paid`. Opening an intent works without it.
- Flow: customer places order → `/api/pay` opens an intent (`create_order_payment`,
  amount computed server-side) → gateway collects → `/api/pay/status` (poll) or
  `/api/pay/webhook/:provider` reconciles via `mark_order_payment`.
- Driver settlement: `POST /api/driver/settle` collects owed commission by MoMo,
  then records via `settle_driver_balance`.

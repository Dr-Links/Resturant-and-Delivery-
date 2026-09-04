# SaaS Driver App (Expo / React Native)

Independent-driver mobile app for the delivery marketplace. Talks to the same
Supabase backend as the web app (project `ylgvwzwmgeiuyhomxvuh`) via the verified
RPCs: `driver_update_location`, `respond_to_offer`, `update_delivery_status`,
`verify_delivery_code`, `driver_balance`, `settle_driver_balance`.

## Run
```bash
cd apps/driver
npm install
npx expo start           # scan the QR with Expo Go, or run on a simulator
```
Optional env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
(public fallbacks are baked in).

## Flow
Sign in → toggle **Online** (starts GPS pings) → receive an **offer** →
Accept/Decline → advance status (picked up → in transit → arrived) →
enter the customer's **4-digit code** to complete → view **owed balance** and
**settle** via mobile money.

Note: accepting is blocked if the subscription is inactive or the owed balance
exceeds the platform limit (enforced server-side).

## Not deployed by Vercel
This is a native app; Vercel builds only the Next.js web app at the repo root.

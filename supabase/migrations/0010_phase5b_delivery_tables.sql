-- SaaS delivery lifecycle tables: requests, assignments, GPS tracking,
-- 4-digit confirmation codes (customer-held, driver cannot read), and proofs.
-- Applied live; full body in migration history. RLS summary:
--   delivery_requests: customer, assigned driver, offered driver, or admin
--   delivery_codes: customer + admin ONLY (never the driver)
--   tracking/proofs: customer of request, assigned driver, or admin
create type saas_delivery_status as enum ('created','searching','assigned','arriving','picked_up','in_transit','arrived','delivered','cancelled','customer_unavailable','failed','returned','admin_intervention');
create type delivery_item_type as enum ('food','package','document','grocery','other');
create type assignment_status as enum ('offered','accepted','declined','expired','cancelled');
create table public.delivery_requests ( id uuid primary key default gen_random_uuid(), customer_id uuid references public.profiles(id) on delete set null,
  pickup_address text, pickup_lat double precision, pickup_lng double precision, dest_address text, dest_lat double precision, dest_lng double precision,
  item_type delivery_item_type not null default 'package', package_info text, package_photo_url text, special_instructions text,
  distance_km numeric(8,2), price numeric(12,2) not null default 0, commission numeric(12,2) not null default 0, driver_earnings numeric(12,2) not null default 0,
  est_minutes int, status saas_delivery_status not null default 'created', assigned_driver_id uuid references public.platform_drivers(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null, order_id uuid references public.orders(id) on delete set null,
  payment_method text not null default 'cash', created_at timestamptz not null default now(), updated_at timestamptz not null default now() );
create table public.delivery_assignments ( id uuid primary key default gen_random_uuid(), request_id uuid not null references public.delivery_requests(id) on delete cascade,
  driver_id uuid not null references public.platform_drivers(id) on delete cascade, status assignment_status not null default 'offered',
  offered_at timestamptz not null default now(), responded_at timestamptz, expires_at timestamptz );
create table public.saas_delivery_tracking ( id bigint generated always as identity primary key, request_id uuid not null references public.delivery_requests(id) on delete cascade,
  driver_id uuid references public.platform_drivers(id) on delete set null, lat double precision not null, lng double precision not null, created_at timestamptz not null default now() );
create table public.delivery_codes ( id uuid primary key default gen_random_uuid(), request_id uuid not null unique references public.delivery_requests(id) on delete cascade,
  code text not null, verified boolean not null default false, verified_at timestamptz, created_at timestamptz not null default now() );
create table public.delivery_proofs ( id uuid primary key default gen_random_uuid(), request_id uuid not null references public.delivery_requests(id) on delete cascade,
  driver_id uuid references public.platform_drivers(id) on delete set null, lat double precision, lng double precision, code_ok boolean, status text, created_at timestamptz not null default now() );
-- (indexes + RLS policies applied live)

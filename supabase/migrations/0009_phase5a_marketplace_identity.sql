-- Independent-marketplace identity: customer saved addresses, platform drivers,
-- driver KYC (visible only to the driver and SaaS admin, per §50), and driver
-- subscriptions, plus review_driver_kyc() which flips a driver to active on
-- approval. Applied live; full body in migration history.
create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Home', address text not null,
  lat double precision, lng double precision, directions text,
  created_at timestamptz not null default now()
);
alter table public.customer_addresses enable row level security;
create policy addr_owner_all on public.customer_addresses for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create type platform_driver_status as enum ('pending','active','suspended','offline');
create table public.platform_drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  status platform_driver_status not null default 'pending',
  is_online boolean not null default false, vehicle text,
  cur_lat double precision, cur_lng double precision, last_ping timestamptz,
  rating_avg numeric(3,2) not null default 0, rating_count int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.platform_drivers enable row level security;
create or replace function public.owns_platform_driver(p_driver_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_drivers d where d.id = p_driver_id and d.profile_id = auth.uid());
$$;
grant execute on function public.owns_platform_driver(uuid) to public;
create policy pdrivers_self_read on public.platform_drivers for select using (profile_id = auth.uid() or public.is_saas_admin());
create policy pdrivers_self_upsert on public.platform_drivers for insert with check (profile_id = auth.uid());
create policy pdrivers_self_update on public.platform_drivers for update using (profile_id = auth.uid() or public.is_saas_admin());

create type kyc_status as enum ('submitted','approved','rejected');
create table public.driver_kyc (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.platform_drivers(id) on delete cascade,
  full_name text, id_number text, id_doc_url text, license_url text, selfie_url text,
  status kyc_status not null default 'submitted',
  reviewed_by uuid references public.profiles(id) on delete set null, reviewed_at timestamptz, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.driver_kyc enable row level security;
create policy kyc_read on public.driver_kyc for select using (public.owns_platform_driver(driver_id) or public.is_saas_admin());
create policy kyc_driver_insert on public.driver_kyc for insert with check (public.owns_platform_driver(driver_id));
create policy kyc_admin_update on public.driver_kyc for update using (public.is_saas_admin());

create type sub_status as enum ('active','inactive','past_due');
create table public.driver_subscriptions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.platform_drivers(id) on delete cascade,
  plan text not null default 'standard', status sub_status not null default 'inactive',
  started_at timestamptz, expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.driver_subscriptions enable row level security;
create policy sub_read on public.driver_subscriptions for select using (public.owns_platform_driver(driver_id) or public.is_saas_admin());
create policy sub_admin_manage on public.driver_subscriptions for all using (public.is_saas_admin()) with check (public.is_saas_admin());

-- review_driver_kyc(kyc_id, approve, notes) — admin only; activates driver on approval.

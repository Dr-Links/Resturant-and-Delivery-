-- Restaurant-owned drivers, flat/zone delivery pricing, deliveries (always tied
-- to a platform food order, so the SaaS is never involved in a restaurant
-- driver's unrelated deliveries), and restaurant-driver tracking. Applied live.
create type driver_status as enum ('active','inactive','suspended');
create type delivery_pricing_mode as enum ('flat','zones');
create type delivery_provider as enum ('restaurant','saas');
create type delivery_status as enum ('pending','assigned','picked_up','in_transit','delivered','failed','cancelled','returned');

create table public.restaurant_drivers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null, phone text, vehicle text,
  status driver_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index idx_rdrivers_rest on public.restaurant_drivers(restaurant_id, status);
create trigger trg_rdrivers_updated before update on public.restaurant_drivers for each row execute function public.set_updated_at();
alter table public.restaurant_drivers enable row level security;
create policy rdrivers_read on public.restaurant_drivers for select using (public.can_access_restaurant(restaurant_id));
create policy rdrivers_manage on public.restaurant_drivers for all using (public.can_manage_restaurant(restaurant_id)) with check (public.can_manage_restaurant(restaurant_id));

create table public.restaurant_delivery_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  mode delivery_pricing_mode not null default 'flat',
  flat_fee numeric(12,2) not null default 0,
  own_delivery_enabled boolean not null default true,
  saas_delivery_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.restaurant_delivery_settings enable row level security;
create policy rds_read on public.restaurant_delivery_settings for select using (public.can_access_restaurant(restaurant_id));
create policy rds_manage on public.restaurant_delivery_settings for all using (public.can_manage_restaurant(restaurant_id)) with check (public.can_manage_restaurant(restaurant_id));

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null, fee numeric(12,2) not null default 0, sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_zones_rest on public.delivery_zones(restaurant_id);
alter table public.delivery_zones enable row level security;
create policy zones_read on public.delivery_zones for select using (true);
create policy zones_manage on public.delivery_zones for all using (public.can_manage_restaurant(restaurant_id)) with check (public.can_manage_restaurant(restaurant_id));

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider delivery_provider not null default 'restaurant',
  driver_id uuid references public.restaurant_drivers(id) on delete set null,
  customer_name text, customer_phone text, address text,
  zone_id uuid references public.delivery_zones(id) on delete set null,
  fee numeric(12,2) not null default 0, dest_lat double precision, dest_lng double precision,
  status delivery_status not null default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index idx_deliveries_rest on public.deliveries(restaurant_id, status);
create index idx_deliveries_order on public.deliveries(order_id);
create trigger trg_deliveries_updated before update on public.deliveries for each row execute function public.set_updated_at();
alter table public.deliveries enable row level security;
create policy deliveries_read on public.deliveries for select using (public.can_access_restaurant(restaurant_id));
create policy deliveries_manage on public.deliveries for all using (public.can_manage_restaurant(restaurant_id)) with check (public.can_manage_restaurant(restaurant_id));

create table public.delivery_tracking (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  lat double precision not null, lng double precision not null,
  created_at timestamptz not null default now()
);
create index idx_dtracking_delivery on public.delivery_tracking(delivery_id, created_at);
alter table public.delivery_tracking enable row level security;
create policy dtracking_read on public.delivery_tracking for select using (exists (select 1 from public.deliveries d where d.id = delivery_id and public.can_access_restaurant(d.restaurant_id)));
create policy dtracking_manage on public.delivery_tracking for all using (exists (select 1 from public.deliveries d where d.id = delivery_id and public.can_manage_restaurant(d.restaurant_id))) with check (exists (select 1 from public.deliveries d where d.id = delivery_id and public.can_manage_restaurant(d.restaurant_id)));

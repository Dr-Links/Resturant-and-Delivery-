-- =============================================================================
-- RESTAURANT EXPERIENCE + DELIVERY SAAS
-- Migration 0001 — PHASE 1 FOUNDATION
-- =============================================================================
-- Scope (per spec §60 Phase 1 + §51/§52 data model & isolation):
--   auth/profiles, platform + restaurant roles, restaurants, staff,
--   admin access grants, dining areas, tables, permanent table QR codes,
--   dining sessions, table members (incl. guests), menu (categories, items,
--   variants, add-ons, images, 3D models, videos), orders + order items
--   (with additional-order chaining), reservations, notifications, audit log.
--
-- Row-Level Security is enabled on EVERY table. Restaurant data isolation is
-- enforced via SECURITY DEFINER helper functions. Guest/anon writes are NOT
-- allowed directly; they go through SECURITY DEFINER RPCs (see bottom) so we
-- never expose broad anonymous table access.
--
-- Design decisions documented inline with  -- DECISION:
-- =============================================================================

create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists citext;         -- case-insensitive email/slug

-- -----------------------------------------------------------------------------
-- 0. Utility: updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- 1. ENUMS
-- =============================================================================
create type restaurant_role   as enum ('owner','manager','waiter','kitchen','cashier');
create type staff_status      as enum ('invited','active','suspended','removed');
create type restaurant_status as enum ('active','suspended','closed');
create type table_status      as enum ('available','occupied','reserved','cleaning','unavailable');
create type session_status    as enum ('open','closed','abandoned');
create type payment_status    as enum ('unpaid','partial','paid','void');
create type menu_item_status  as enum ('draft','available','sold_out','hidden');
create type menu_category_kind as enum ('food','drink','dessert','other');
create type model_source      as enum ('ai_generated','uploaded');
create type model_status      as enum ('draft','preview','approved','published','rejected');
create type order_channel      as enum ('digital','waiter');
create type order_status       as enum ('pending','received','preparing','ready','served','completed','cancelled');
create type reservation_status as enum ('pending','confirmed','seated','no_show','cancelled','completed');
create type access_grant_status as enum ('requested','active','revoked','expired');

-- =============================================================================
-- 2. IDENTITY
-- =============================================================================
-- DECISION: `profiles.id` mirrors auth.users.id (standard Supabase pattern).
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  phone         text unique,
  email         citext,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- DECISION: Platform-level admin rights are granular (spec §49) and kept OUT of
-- profiles so they can't be self-granted. Rows here mean "is a SaaS admin".
create table public.platform_admins (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  permissions   jsonb not null default '{}'::jsonb,  -- granular scopes
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- 3. RESTAURANTS + STAFF + ADMIN ACCESS
-- =============================================================================
create table public.restaurants (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete restrict,
  name          text not null,
  slug          citext unique,
  status        restaurant_status not null default 'active',
  currency      text not null default 'XAF',
  timezone      text not null default 'Africa/Douala',
  -- Feature flags / settings (spec: show table activity, digital ordering, etc.)
  settings      jsonb not null default jsonb_build_object(
                  'show_table_activity', true,
                  'digital_ordering_enabled', true,
                  'kitchen_screen_enabled', false
                ),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_restaurants_owner on public.restaurants(owner_id);
create index idx_restaurants_status on public.restaurants(status);
create trigger trg_restaurants_updated before update on public.restaurants
  for each row execute function public.set_updated_at();

create table public.restaurant_staff (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  role          restaurant_role not null,
  status        staff_status not null default 'invited',
  invited_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, profile_id)
);
create index idx_staff_restaurant on public.restaurant_staff(restaurant_id);
create index idx_staff_profile on public.restaurant_staff(profile_id);
create trigger trg_staff_updated before update on public.restaurant_staff
  for each row execute function public.set_updated_at();

-- Spec §16/§49: SaaS admin access to a restaurant requires owner/manager grant,
-- is scoped, time-bound, and auditable.
create table public.restaurant_access_grants (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  admin_id      uuid not null references public.profiles(id) on delete cascade,
  scope         jsonb not null default '{}'::jsonb,
  status        access_grant_status not null default 'requested',
  granted_by    uuid references public.profiles(id),
  reason        text,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_grants_restaurant on public.restaurant_access_grants(restaurant_id);
create index idx_grants_admin on public.restaurant_access_grants(admin_id);
create trigger trg_grants_updated before update on public.restaurant_access_grants
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 4. ISOLATION HELPER FUNCTIONS (SECURITY DEFINER)
-- =============================================================================
create or replace function public.is_saas_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins pa where pa.profile_id = auth.uid());
$$;

create or replace function public.owns_restaurant(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.restaurants r
                 where r.id = rid and r.owner_id = auth.uid());
$$;

create or replace function public.has_restaurant_role(rid uuid, roles restaurant_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.restaurant_staff s
    where s.restaurant_id = rid and s.profile_id = auth.uid()
      and s.status = 'active' and s.role = any(roles)
  );
$$;

-- Any active member (owner OR any staff role) OR an admin with a live grant.
create or replace function public.can_access_restaurant(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.owns_restaurant(rid)
    or exists (select 1 from public.restaurant_staff s
               where s.restaurant_id = rid and s.profile_id = auth.uid() and s.status = 'active')
    or exists (select 1 from public.restaurant_access_grants g
               where g.restaurant_id = rid and g.admin_id = auth.uid()
                 and g.status = 'active' and (g.expires_at is null or g.expires_at > now()));
$$;

-- Owner or manager (management-tier actions).
create or replace function public.can_manage_restaurant(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.owns_restaurant(rid) or public.has_restaurant_role(rid, array['manager']::restaurant_role[]);
$$;

-- =============================================================================
-- 5. DINING AREAS, TABLES, QR CODES
-- =============================================================================
create table public.dining_areas (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index idx_areas_restaurant on public.dining_areas(restaurant_id);

create table public.tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  area_id       uuid references public.dining_areas(id) on delete set null,
  label         text not null,                 -- e.g. "12"
  seats         int not null default 2,
  status        table_status not null default 'available',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, label)
);
create index idx_tables_restaurant on public.tables(restaurant_id);
create index idx_tables_status on public.tables(restaurant_id, status);
create trigger trg_tables_updated before update on public.tables
  for each row execute function public.set_updated_at();

-- DECISION (spec §4): ONE permanent QR per table. The QR carries an opaque
-- token; it never changes per order/session.
create table public.table_qr_codes (
  id            uuid primary key default gen_random_uuid(),
  table_id      uuid not null references public.tables(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  token         text not null unique default encode(gen_random_bytes(16), 'hex'),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index idx_qr_table on public.table_qr_codes(table_id);

-- =============================================================================
-- 6. DINING SESSIONS + MEMBERS
-- =============================================================================
create sequence if not exists dining_session_code_seq start 1000;
create table public.dining_sessions (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  table_id       uuid not null references public.tables(id) on delete restrict,
  code           int not null default nextval('dining_session_code_seq'),  -- human #4582
  status         session_status not null default 'open',
  payment_status payment_status not null default 'unpaid',
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  -- table transfer/merge support (spec §7)
  transferred_from_table uuid references public.tables(id),
  merged_into_session    uuid references public.dining_sessions(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_sessions_restaurant on public.dining_sessions(restaurant_id);
create index idx_sessions_table on public.dining_sessions(table_id);
create index idx_sessions_status on public.dining_sessions(restaurant_id, status);
-- Only one open session per table at a time.
create unique index uidx_one_open_session_per_table
  on public.dining_sessions(table_id) where status = 'open';
create trigger trg_sessions_updated before update on public.dining_sessions
  for each row execute function public.set_updated_at();

-- DECISION: members may be a registered profile OR an anonymous guest
-- (guest_label + guest_token). Personal identity is never exposed to other
-- tables — see get_table_activity() RPC.
create table public.table_members (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.dining_sessions(id) on delete cascade,
  profile_id   uuid references public.profiles(id) on delete set null,
  guest_label  text,                            -- "Guest 1"
  guest_token  text,                            -- opaque, held by that device
  joined_at    timestamptz not null default now()
);
create index idx_members_session on public.table_members(session_id);
create index idx_members_profile on public.table_members(profile_id);

create or replace function public.is_session_member(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.table_members m
                 where m.session_id = sid and m.profile_id = auth.uid());
$$;

-- =============================================================================
-- 7. MENU
-- =============================================================================
create table public.menu_categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  kind          menu_category_kind not null default 'food',
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index idx_cat_restaurant on public.menu_categories(restaurant_id);

create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id   uuid references public.menu_categories(id) on delete set null,
  name          text not null,
  description   text,
  ingredients   text,
  price         numeric(12,2) not null default 0,
  status        menu_item_status not null default 'draft',
  labels        text[] not null default '{}',   -- e.g. spicy, vegan
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_items_restaurant on public.menu_items(restaurant_id);
create index idx_items_category on public.menu_items(category_id);
create index idx_items_status on public.menu_items(restaurant_id, status);
create trigger trg_items_updated before update on public.menu_items
  for each row execute function public.set_updated_at();

create table public.menu_item_variants (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.menu_items(id) on delete cascade,
  name          text not null,                  -- "Large"
  price_delta   numeric(12,2) not null default 0,
  sort_order    int not null default 0
);
create index idx_variants_item on public.menu_item_variants(item_id);

create table public.menu_item_addons (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.menu_items(id) on delete cascade,
  name          text not null,                  -- "Extra cheese"
  price         numeric(12,2) not null default 0,
  sort_order    int not null default 0
);
create index idx_addons_item on public.menu_item_addons(item_id);

create table public.menu_item_images (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.menu_items(id) on delete cascade,
  url           text not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index idx_images_item on public.menu_item_images(item_id);

-- DECISION (spec §9): AI-generated models are NEVER auto-published. Lifecycle is
-- draft/preview -> approved -> published, requiring restaurant approval.
create table public.menu_item_3d_models (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.menu_items(id) on delete cascade,
  glb_url       text,                           -- Android / WebXR
  usdz_url      text,                           -- iOS Quick Look
  poster_url    text,
  source        model_source not null,
  status        model_status not null default 'draft',
  approved_by   uuid references public.profiles(id),
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_models_item on public.menu_item_3d_models(item_id);
-- At most one published model per item.
create unique index uidx_one_published_model_per_item
  on public.menu_item_3d_models(item_id) where status = 'published';

create table public.menu_item_videos (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid references public.menu_items(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  url           text not null,
  title         text,
  created_at    timestamptz not null default now()
);
create index idx_videos_item on public.menu_item_videos(item_id);
create index idx_videos_restaurant on public.menu_item_videos(restaurant_id);

-- =============================================================================
-- 8. ORDERS
-- =============================================================================
-- DECISION (spec §12): "additional orders" are modelled as orders rows chained
-- via parent_order_id (avoids a duplicate table per the "no duplicate
-- functionality" rule). Customer UI shows the whole session; kitchen/ops sees
-- each order row separately.
create sequence if not exists order_number_seq start 1000;
create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  session_id     uuid references public.dining_sessions(id) on delete set null,
  table_id       uuid references public.tables(id) on delete set null,
  parent_order_id uuid references public.orders(id) on delete set null,
  order_number   int not null default nextval('order_number_seq'),
  placed_by      uuid references public.profiles(id),   -- null for guest/waiter
  channel        order_channel not null default 'digital',
  status         order_status not null default 'pending',
  payment_status payment_status not null default 'unpaid',
  subtotal       numeric(12,2) not null default 0,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_orders_restaurant on public.orders(restaurant_id);
create index idx_orders_session on public.orders(session_id);
create index idx_orders_status on public.orders(restaurant_id, status);
create index idx_orders_created on public.orders(created_at);
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  menu_item_id   uuid references public.menu_items(id) on delete set null,
  name_snapshot  text not null,                 -- price/name frozen at order time
  unit_price     numeric(12,2) not null default 0,
  quantity       int not null default 1,
  variant        jsonb,
  addons         jsonb not null default '[]'::jsonb,
  notes          text,
  created_at     timestamptz not null default now()
);
create index idx_order_items_order on public.order_items(order_id);

-- =============================================================================
-- 9. RESERVATIONS
-- =============================================================================
create table public.reservations (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  table_id       uuid references public.tables(id) on delete set null,
  customer_id    uuid references public.profiles(id) on delete set null,
  guest_name     text,
  guest_phone    text,
  reserved_for   timestamptz not null,
  party_size     int not null default 1,
  status         reservation_status not null default 'pending',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_res_restaurant on public.reservations(restaurant_id);
create index idx_res_time on public.reservations(restaurant_id, reserved_for);
create trigger trg_res_updated before update on public.reservations
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 10. NOTIFICATIONS + AUDIT LOG
-- =============================================================================
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  type          text not null,
  title         text,
  body          text,
  payload       jsonb not null default '{}'::jsonb,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_notif_recipient on public.notifications(recipient_id, read_at);

create table public.audit_logs (
  id            bigint generated always as identity primary key,
  actor_id      uuid references public.profiles(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  action        text not null,
  entity        text,
  entity_id     text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index idx_audit_restaurant on public.audit_logs(restaurant_id, created_at);
create index idx_audit_actor on public.audit_logs(actor_id, created_at);

-- =============================================================================
-- 11. ENABLE RLS ON EVERYTHING
-- =============================================================================
alter table public.profiles                enable row level security;
alter table public.platform_admins         enable row level security;
alter table public.restaurants             enable row level security;
alter table public.restaurant_staff        enable row level security;
alter table public.restaurant_access_grants enable row level security;
alter table public.dining_areas            enable row level security;
alter table public.tables                  enable row level security;
alter table public.table_qr_codes          enable row level security;
alter table public.dining_sessions         enable row level security;
alter table public.table_members           enable row level security;
alter table public.menu_categories         enable row level security;
alter table public.menu_items              enable row level security;
alter table public.menu_item_variants      enable row level security;
alter table public.menu_item_addons        enable row level security;
alter table public.menu_item_images        enable row level security;
alter table public.menu_item_3d_models     enable row level security;
alter table public.menu_item_videos        enable row level security;
alter table public.orders                  enable row level security;
alter table public.order_items             enable row level security;
alter table public.reservations            enable row level security;
alter table public.notifications           enable row level security;
alter table public.audit_logs              enable row level security;

-- =============================================================================
-- 12. RLS POLICIES
-- =============================================================================

-- profiles: self read/update; admins read all.
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_saas_admin());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid());
create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());

-- platform_admins: only admins can read; writes reserved for service role.
create policy admins_read on public.platform_admins
  for select using (public.is_saas_admin());

-- restaurants: public can see ACTIVE restaurants (needed for menu landing);
-- management by owner/manager/admin-with-grant.
create policy restaurants_public_read on public.restaurants
  for select using (status = 'active' or public.can_access_restaurant(id));
create policy restaurants_owner_insert on public.restaurants
  for insert with check (owner_id = auth.uid());
create policy restaurants_manage on public.restaurants
  for update using (public.can_manage_restaurant(id));

-- restaurant_staff
create policy staff_read on public.restaurant_staff
  for select using (public.can_access_restaurant(restaurant_id) or profile_id = auth.uid());
create policy staff_manage on public.restaurant_staff
  for all using (public.can_manage_restaurant(restaurant_id))
  with check (public.can_manage_restaurant(restaurant_id));

-- access grants: owner/manager manage; the admin named can see theirs.
create policy grants_read on public.restaurant_access_grants
  for select using (public.can_manage_restaurant(restaurant_id) or admin_id = auth.uid());
create policy grants_manage on public.restaurant_access_grants
  for all using (public.can_manage_restaurant(restaurant_id))
  with check (public.can_manage_restaurant(restaurant_id));

-- dining areas / tables: public read (so QR landing can show area/table);
-- staff manage.
create policy areas_read on public.dining_areas for select using (true);
create policy areas_manage on public.dining_areas
  for all using (public.can_manage_restaurant(restaurant_id))
  with check (public.can_manage_restaurant(restaurant_id));

create policy tables_read on public.tables for select using (true);
create policy tables_manage on public.tables
  for all using (public.can_manage_restaurant(restaurant_id))
  with check (public.can_manage_restaurant(restaurant_id));

create policy qr_read on public.table_qr_codes for select using (true);
create policy qr_manage on public.table_qr_codes
  for all using (public.can_manage_restaurant(restaurant_id))
  with check (public.can_manage_restaurant(restaurant_id));

-- MENU: public can read only *available/published* content; staff manage all.
create policy cat_public_read on public.menu_categories
  for select using (is_active or public.can_access_restaurant(restaurant_id));
create policy cat_manage on public.menu_categories
  for all using (public.can_manage_restaurant(restaurant_id))
  with check (public.can_manage_restaurant(restaurant_id));

create policy items_public_read on public.menu_items
  for select using (status in ('available','sold_out') or public.can_access_restaurant(restaurant_id));
create policy items_manage on public.menu_items
  for all using (public.can_manage_restaurant(restaurant_id))
  with check (public.can_manage_restaurant(restaurant_id));

-- child menu tables inherit visibility from their parent item.
create policy variants_read on public.menu_item_variants for select using (
  exists (select 1 from public.menu_items i where i.id = item_id
          and (i.status in ('available','sold_out') or public.can_access_restaurant(i.restaurant_id))));
create policy variants_manage on public.menu_item_variants for all using (
  exists (select 1 from public.menu_items i where i.id = item_id and public.can_manage_restaurant(i.restaurant_id)))
  with check (exists (select 1 from public.menu_items i where i.id = item_id and public.can_manage_restaurant(i.restaurant_id)));

create policy addons_read on public.menu_item_addons for select using (
  exists (select 1 from public.menu_items i where i.id = item_id
          and (i.status in ('available','sold_out') or public.can_access_restaurant(i.restaurant_id))));
create policy addons_manage on public.menu_item_addons for all using (
  exists (select 1 from public.menu_items i where i.id = item_id and public.can_manage_restaurant(i.restaurant_id)))
  with check (exists (select 1 from public.menu_items i where i.id = item_id and public.can_manage_restaurant(i.restaurant_id)));

create policy imgs_read on public.menu_item_images for select using (
  exists (select 1 from public.menu_items i where i.id = item_id
          and (i.status in ('available','sold_out') or public.can_access_restaurant(i.restaurant_id))));
create policy imgs_manage on public.menu_item_images for all using (
  exists (select 1 from public.menu_items i where i.id = item_id and public.can_manage_restaurant(i.restaurant_id)))
  with check (exists (select 1 from public.menu_items i where i.id = item_id and public.can_manage_restaurant(i.restaurant_id)));

-- 3D models: public sees ONLY published; staff see/manage all (approval flow).
create policy models_public_read on public.menu_item_3d_models for select using (
  status = 'published'
  or exists (select 1 from public.menu_items i where i.id = item_id and public.can_access_restaurant(i.restaurant_id)));
create policy models_manage on public.menu_item_3d_models for all using (
  exists (select 1 from public.menu_items i where i.id = item_id and public.can_manage_restaurant(i.restaurant_id)))
  with check (exists (select 1 from public.menu_items i where i.id = item_id and public.can_manage_restaurant(i.restaurant_id)));

create policy vids_public_read on public.menu_item_videos for select using (true);
create policy vids_manage on public.menu_item_videos for all using (public.can_manage_restaurant(restaurant_id))
  with check (public.can_manage_restaurant(restaurant_id));

-- ORDERS: restaurant staff see their restaurant's orders; a registered customer
-- sees orders for sessions they are a member of. (Guest order placement/reads
-- go through RPCs so we don't open anon table access.)
create policy orders_staff_read on public.orders
  for select using (public.can_access_restaurant(restaurant_id)
                    or (session_id is not null and public.is_session_member(session_id)));
create policy orders_staff_manage on public.orders
  for update using (public.can_access_restaurant(restaurant_id));
create policy orders_member_insert on public.orders
  for insert with check (
    public.can_access_restaurant(restaurant_id)
    or (session_id is not null and public.is_session_member(session_id)));

create policy order_items_read on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id
          and (public.can_access_restaurant(o.restaurant_id)
               or (o.session_id is not null and public.is_session_member(o.session_id)))));
create policy order_items_write on public.order_items for all using (
  exists (select 1 from public.orders o where o.id = order_id
          and (public.can_access_restaurant(o.restaurant_id)
               or (o.session_id is not null and public.is_session_member(o.session_id)))))
  with check (
  exists (select 1 from public.orders o where o.id = order_id
          and (public.can_access_restaurant(o.restaurant_id)
               or (o.session_id is not null and public.is_session_member(o.session_id)))));

-- dining sessions / members: staff full; registered members read their own.
create policy sessions_read on public.dining_sessions
  for select using (public.can_access_restaurant(restaurant_id) or public.is_session_member(id));
create policy sessions_manage on public.dining_sessions
  for all using (public.can_access_restaurant(restaurant_id))
  with check (public.can_access_restaurant(restaurant_id));

create policy members_read on public.table_members for select using (
  profile_id = auth.uid()
  or exists (select 1 from public.dining_sessions s where s.id = session_id and public.can_access_restaurant(s.restaurant_id)));
create policy members_manage on public.table_members for all using (
  exists (select 1 from public.dining_sessions s where s.id = session_id and public.can_access_restaurant(s.restaurant_id)))
  with check (
  exists (select 1 from public.dining_sessions s where s.id = session_id and public.can_access_restaurant(s.restaurant_id)));

-- reservations: staff manage; a registered customer sees their own.
create policy res_read on public.reservations
  for select using (public.can_access_restaurant(restaurant_id) or customer_id = auth.uid());
create policy res_manage on public.reservations
  for all using (public.can_access_restaurant(restaurant_id))
  with check (public.can_access_restaurant(restaurant_id));
create policy res_customer_insert on public.reservations
  for insert with check (customer_id = auth.uid() or public.can_access_restaurant(restaurant_id));

-- notifications: recipient only.
create policy notif_read on public.notifications for select using (recipient_id = auth.uid());
create policy notif_update on public.notifications for update using (recipient_id = auth.uid());

-- audit logs: admins, and the restaurant's owner/manager. Inserts via definer.
create policy audit_read on public.audit_logs
  for select using (public.is_saas_admin()
                    or (restaurant_id is not null and public.can_manage_restaurant(restaurant_id)));

-- =============================================================================
-- 13. GUEST/ANON RPCs (SECURITY DEFINER) — mediate no-account flows
-- =============================================================================

-- Resolve a scanned QR into restaurant + table + open session (creating a
-- session if none is open). Returns the minimum a guest device needs.
create or replace function public.resolve_table_qr(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_qr    public.table_qr_codes;
  v_table public.tables;
  v_sess  public.dining_sessions;
begin
  select * into v_qr from public.table_qr_codes where token = p_token and is_active;
  if not found then
    return jsonb_build_object('error','invalid_qr');
  end if;

  select * into v_table from public.tables where id = v_qr.table_id;

  select * into v_sess from public.dining_sessions
   where table_id = v_qr.table_id and status = 'open'
   order by opened_at desc limit 1;

  if not found then
    insert into public.dining_sessions(restaurant_id, table_id)
    values (v_qr.restaurant_id, v_qr.table_id)
    returning * into v_sess;

    update public.tables set status = 'occupied' where id = v_qr.table_id;
  end if;

  return jsonb_build_object(
    'restaurant_id', v_qr.restaurant_id,
    'table_id',      v_table.id,
    'table_label',   v_table.label,
    'session_id',    v_sess.id,
    'session_code',  v_sess.code
  );
end;
$$;

-- Spec §6: show what OTHER tables ordered — with NO personal info. This RPC is
-- the ONLY public path to cross-table activity, and only when the restaurant's
-- show_table_activity setting is on.
create or replace function public.get_table_activity(p_restaurant_id uuid)
returns table (table_label text, item_name text, qty int) language plpgsql
stable security definer set search_path = public as $$
declare
  v_show boolean;
begin
  select (settings->>'show_table_activity')::boolean into v_show
    from public.restaurants where id = p_restaurant_id;
  if not coalesce(v_show, false) then
    return;               -- feature off -> empty set, no leakage
  end if;

  return query
    select t.label, oi.name_snapshot, sum(oi.quantity)::int
    from public.orders o
    join public.tables t     on t.id = o.table_id
    join public.order_items oi on oi.order_id = o.id
    where o.restaurant_id = p_restaurant_id
      and o.status in ('received','preparing','ready','served')
      and o.created_at > now() - interval '3 hours'
    group by t.label, oi.name_snapshot
    order by t.label;
end;
$$;

grant execute on function public.resolve_table_qr(text)    to anon, authenticated;
grant execute on function public.get_table_activity(uuid)  to anon, authenticated;

-- =============================================================================
-- 14. NEW-USER PROFILE TRIGGER
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, phone, full_name)
  values (new.id, new.email, new.phone, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- END MIGRATION 0001
-- =============================================================================

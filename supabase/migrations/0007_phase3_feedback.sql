-- Reviews (restaurant + food, separate), private complaints, suggestions.
create type complaint_status as enum ('open','investigating','resolved','closed');
create type suggestion_status as enum ('received','reviewing','forwarded','closed');

create table public.food_ratings (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id uuid references public.menu_items(id) on delete set null,
  session_id uuid references public.dining_sessions(id) on delete set null,
  stars int not null check (stars between 1 and 5), comment text,
  created_at timestamptz not null default now()
);
create index idx_food_ratings_rest on public.food_ratings(restaurant_id);
create index idx_food_ratings_item on public.food_ratings(item_id);

create table public.restaurant_ratings (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  session_id uuid references public.dining_sessions(id) on delete set null,
  stars int not null check (stars between 1 and 5), comment text,
  created_at timestamptz not null default now()
);
create index idx_restaurant_ratings_rest on public.restaurant_ratings(restaurant_id);

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  session_id uuid references public.dining_sessions(id) on delete set null,
  type text not null, description text not null,
  status complaint_status not null default 'open',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index idx_complaints_status on public.complaints(status, created_at);

create table public.complaint_messages (
  id bigint generated always as identity primary key,
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  sender text not null check (sender in ('customer','admin')), body text not null,
  created_at timestamptz not null default now()
);

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  body text not null, status suggestion_status not null default 'received',
  created_at timestamptz not null default now()
);

alter table public.food_ratings enable row level security;
alter table public.restaurant_ratings enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_messages enable row level security;
alter table public.suggestions enable row level security;

create policy food_ratings_read on public.food_ratings for select using (public.can_access_restaurant(restaurant_id));
create policy restaurant_ratings_read on public.restaurant_ratings for select using (public.can_access_restaurant(restaurant_id));
create policy complaints_admin_read on public.complaints for select using (public.is_saas_admin());
create policy complaint_msgs_admin on public.complaint_messages for all using (public.is_saas_admin()) with check (public.is_saas_admin());
create policy suggestions_admin_read on public.suggestions for select using (public.is_saas_admin());

-- Submission RPCs + dashboard aggregate live in this migration (see repo history / applied DB).

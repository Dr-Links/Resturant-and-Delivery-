create table if not exists public.food_events (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id uuid references public.menu_items(id) on delete set null,
  session_id uuid references public.dining_sessions(id) on delete set null,
  event_type text not null check (event_type in ('view','ar_open','ar_interact','add_to_cart','order')),
  created_at timestamptz not null default now()
);
create index if not exists idx_food_events_rest on public.food_events(restaurant_id, created_at);
create index if not exists idx_food_events_item on public.food_events(item_id, event_type);
alter table public.food_events enable row level security;
create policy food_events_read on public.food_events for select using (public.can_access_restaurant(restaurant_id));

create or replace function public.log_food_event(p_restaurant_id uuid, p_item_id uuid, p_event text, p_session_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('view','ar_open','ar_interact','add_to_cart','order') then return; end if;
  if p_item_id is not null and not exists (select 1 from public.menu_items m where m.id=p_item_id and m.restaurant_id=p_restaurant_id) then return; end if;
  insert into public.food_events(restaurant_id, item_id, session_id, event_type) values (p_restaurant_id, p_item_id, p_session_id, p_event);
end;
$$;
grant execute on function public.log_food_event(uuid, uuid, text, uuid) to anon, authenticated;

create or replace function public.get_food_funnel(p_restaurant_id uuid, p_since timestamptz default (now() - interval '30 days'))
returns table (item_id uuid, name text, views bigint, ar_opens bigint, carts bigint, orders bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_access_restaurant(p_restaurant_id) then return; end if;
  return query
    select mi.id, mi.name,
      count(*) filter (where e.event_type='view'), count(*) filter (where e.event_type='ar_open'),
      count(*) filter (where e.event_type='add_to_cart'), count(*) filter (where e.event_type='order')
    from public.menu_items mi
    left join public.food_events e on e.item_id=mi.id and e.created_at >= p_since
    where mi.restaurant_id=p_restaurant_id
    group by mi.id, mi.name order by count(*) filter (where e.event_type='view') desc;
end;
$$;
grant execute on function public.get_food_funnel(uuid, timestamptz) to authenticated;

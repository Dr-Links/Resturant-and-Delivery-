-- =============================================================================
-- Migration 0025 — widen the table-activity window from 3h to 24h
-- =============================================================================
-- The "what other tables ordered" strip only counted the last 3 hours, so in a
-- quiet restaurant it was almost always empty. Widen to 24h ("today") so it
-- stays visible. Still gated by the show_table_activity setting; still no
-- personal info.
-- =============================================================================

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
      and o.created_at > now() - interval '24 hours'
    group by t.label, oi.name_snapshot
    order by t.label;
end;
$$;

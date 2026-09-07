-- =============================================================================
-- Migration 0019 — admin_restaurant_stats RPC
-- =============================================================================
-- Platform admins need real per-restaurant counts (orders, staff) that ordinary
-- RLS hides from them: orders (orders_staff_read) and restaurant_staff
-- (staff_read) are readable only by that restaurant's own staff, so a platform
-- admin querying them directly gets misleading zeros.
--
-- This SECURITY DEFINER function bypasses RLS to count, but is gated on
-- is_saas_admin() so ONLY platform admins receive data — any other caller gets
-- zero rows back. search_path is pinned to public to prevent injection.
-- =============================================================================

create or replace function public.admin_restaurant_stats(p_restaurant_id uuid)
returns table (
  tables_count       int,
  menu_items_count   int,
  orders_count       int,
  active_staff_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.tables t          where t.restaurant_id = p_restaurant_id),
    (select count(*)::int from public.menu_items mi      where mi.restaurant_id = p_restaurant_id),
    (select count(*)::int from public.orders o           where o.restaurant_id = p_restaurant_id),
    (select count(*)::int from public.restaurant_staff s where s.restaurant_id = p_restaurant_id and s.status = 'active')
  where public.is_saas_admin();
$$;

revoke all on function public.admin_restaurant_stats(uuid) from public;
grant execute on function public.admin_restaurant_stats(uuid) to authenticated;

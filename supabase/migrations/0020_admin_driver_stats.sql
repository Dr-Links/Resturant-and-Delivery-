-- =============================================================================
-- Migration 0020 — admin_driver_stats RPC
-- =============================================================================
-- Companion to admin_restaurant_stats (0019). Returns per-driver delivery
-- aggregates (total, completed, lifetime earnings) to platform admins,
-- bypassing delivery_requests RLS via SECURITY DEFINER but gated on
-- is_saas_admin() so only platform admins receive data. search_path pinned.
-- =============================================================================

create or replace function public.admin_driver_stats(p_driver_id uuid)
returns table (
  total_deliveries     int,
  completed_deliveries int,
  total_earnings       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.delivery_requests d
       where d.assigned_driver_id = p_driver_id),
    (select count(*)::int from public.delivery_requests d
       where d.assigned_driver_id = p_driver_id and d.status = 'delivered'),
    (select coalesce(sum(d.driver_earnings), 0) from public.delivery_requests d
       where d.assigned_driver_id = p_driver_id and d.status = 'delivered')
  where public.is_saas_admin();
$$;

revoke all on function public.admin_driver_stats(uuid) from public;
grant execute on function public.admin_driver_stats(uuid) to authenticated;

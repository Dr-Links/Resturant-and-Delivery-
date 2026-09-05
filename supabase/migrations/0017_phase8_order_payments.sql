-- =============================================================================
-- PHASE 8 — CUSTOMER ORDER PAYMENTS (money layer, §38)
-- Mobile-money (MTN MoMo / Orange Money) payment intents for food orders.
-- The gateway call itself lives in the Next.js API layer (lib/payments/*);
-- this migration owns the trusted data + state transitions:
--   * order_payments        one intent per payment attempt
--   * create_order_payment  server-computes the amount from the order (never
--                           trusts the client) and opens a pending intent
--   * mark_order_payment    terminal-state transition (service-role only);
--                           on success flips orders.payment_status = 'paid'
-- Applied live to project ylgvwzwmgeiuyhomxvuh.
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'order_payment_status') then
    create type order_payment_status as enum ('pending','processing','succeeded','failed','cancelled');
  end if;
end $$;

create table if not exists public.order_payments (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete set null,
  provider      text not null,                       -- 'mtn' | 'orange' | 'mock'
  phone         text,
  amount        numeric(12,2) not null,
  currency      text not null default 'XAF',
  status        order_payment_status not null default 'pending',
  external_ref  uuid not null unique default gen_random_uuid(),  -- our idempotency key
  provider_ref  text,                                -- gateway transaction id
  message       text,
  raw           jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_order_payments_order on public.order_payments(order_id);
create index if not exists idx_order_payments_restaurant on public.order_payments(restaurant_id, status);

drop trigger if exists trg_order_payments_updated on public.order_payments;
create trigger trg_order_payments_updated before update on public.order_payments
  for each row execute function public.set_updated_at();

alter table public.order_payments enable row level security;

-- Staff of the owning restaurant can read payments; customers reach status
-- through the server (service role), so no broad anon SELECT is granted.
drop policy if exists order_payments_read on public.order_payments;
create policy order_payments_read on public.order_payments
  for select using (public.can_access_restaurant(restaurant_id));

-- ---------------------------------------------------------------------------
-- create_order_payment: open a pending intent for an order.
-- Amount is taken from orders.subtotal server-side. Mirrors the guest-ordering
-- trust model of place_order (SECURITY DEFINER, callable by anon).
-- ---------------------------------------------------------------------------
create or replace function public.create_order_payment(
  p_order_id uuid,
  p_provider text,
  p_phone    text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_pay   public.order_payments;
begin
  if p_provider not in ('mtn','orange','mock') then
    return jsonb_build_object('error','bad_provider');
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then return jsonb_build_object('error','order_not_found'); end if;
  if v_order.payment_status = 'paid' then
    return jsonb_build_object('error','already_paid');
  end if;
  if coalesce(v_order.subtotal,0) <= 0 then
    return jsonb_build_object('error','nothing_to_pay');
  end if;

  insert into public.order_payments(restaurant_id, order_id, profile_id, provider, phone, amount, currency, status)
  values (v_order.restaurant_id, v_order.id, auth.uid(), p_provider, nullif(p_phone,''),
          v_order.subtotal, 'XAF', 'pending')
  returning * into v_pay;

  return jsonb_build_object(
    'payment_id',   v_pay.id,
    'external_ref', v_pay.external_ref,
    'amount',       v_pay.amount,
    'currency',     v_pay.currency,
    'status',       v_pay.status
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- mark_order_payment: terminal-state transition, called only by the server
-- (service role) from webhook / status reconciliation. Idempotent: it will
-- not move a payment out of a terminal state.
-- ---------------------------------------------------------------------------
create or replace function public.mark_order_payment(
  p_external_ref uuid,
  p_status       text,
  p_provider_ref text default null,
  p_message      text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare v_pay public.order_payments;
begin
  if p_status not in ('processing','succeeded','failed','cancelled') then
    return jsonb_build_object('error','bad_status');
  end if;

  select * into v_pay from public.order_payments where external_ref = p_external_ref for update;
  if not found then return jsonb_build_object('error','payment_not_found'); end if;

  -- idempotency: never leave a terminal state
  if v_pay.status in ('succeeded','failed','cancelled') then
    return jsonb_build_object('ok', true, 'status', v_pay.status, 'idempotent', true);
  end if;

  update public.order_payments
     set status = p_status::order_payment_status,
         provider_ref = coalesce(p_provider_ref, provider_ref),
         message = coalesce(p_message, message)
   where id = v_pay.id;

  if p_status = 'succeeded' then
    update public.orders set payment_status = 'paid' where id = v_pay.order_id;
  end if;

  return jsonb_build_object('ok', true, 'status', p_status, 'order_id', v_pay.order_id);
end;
$function$;

-- Grants: guests may open an intent; only the server (service role) may settle it.
revoke all on function public.create_order_payment(uuid, text, text) from public;
grant execute on function public.create_order_payment(uuid, text, text) to anon, authenticated;

revoke all on function public.mark_order_payment(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.mark_order_payment(uuid, text, text, text) to service_role;

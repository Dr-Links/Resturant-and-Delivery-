-- =============================================================================
-- Migration 0024 — Fapshi aggregator (one API for MTN + Orange)
-- =============================================================================
-- Fapshi (fapshi.com) is a Cameroon payment aggregator: a single account/API
-- covers BOTH MTN MoMo and Orange Money, auto-detecting the network from the
-- payer's phone number. Adds 'fapshi' as an accepted payment provider and
-- registers it in the dashboard integration store (Vault-backed secrets).
-- =============================================================================

-- Allow 'fapshi' when opening a payment intent (was mtn/orange/mock only).
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
  if p_provider not in ('mtn','orange','fapshi','mock') then
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

-- Register Fapshi in the integration store.
insert into public.integration_providers(key, label, category, enabled) values
  ('fapshi', 'Fapshi (MTN + Orange)', 'payments', false)
on conflict (key) do nothing;

insert into public.integration_settings(provider_key, setting_key, label, is_secret, value) values
  ('fapshi', 'FAPSHI_BASE_URL', 'Base URL', false, 'https://sandbox.fapshi.com')
on conflict (provider_key, setting_key) do nothing;

insert into public.integration_settings(provider_key, setting_key, label, is_secret, value) values
  ('fapshi', 'FAPSHI_API_USER', 'API user', true, null),
  ('fapshi', 'FAPSHI_API_KEY',  'API key',  true, null)
on conflict (provider_key, setting_key) do nothing;

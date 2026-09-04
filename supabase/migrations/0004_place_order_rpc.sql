-- Guest/authenticated order placement. Prices are computed server-side from the
-- DB, never trusted from the client.
create or replace function public.place_order(p_session_id uuid, p_items jsonb, p_channel order_channel default 'digital')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sess public.dining_sessions;
  v_order public.orders;
  v_item jsonb;
  v_menu public.menu_items;
  v_qty int;
  v_subtotal numeric(12,2) := 0;
begin
  select * into v_sess from public.dining_sessions where id = p_session_id and status = 'open';
  if not found then return jsonb_build_object('error','session_not_open'); end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then return jsonb_build_object('error','empty_order'); end if;

  insert into public.orders(restaurant_id, session_id, table_id, channel, status)
  values (v_sess.restaurant_id, v_sess.id, v_sess.table_id, p_channel, 'received')
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_menu from public.menu_items
      where id = (v_item->>'menu_item_id')::uuid and restaurant_id = v_sess.restaurant_id and status = 'available';
    if not found then continue; end if;
    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));
    insert into public.order_items(order_id, menu_item_id, name_snapshot, unit_price, quantity, notes)
    values (v_order.id, v_menu.id, v_menu.name, v_menu.price, v_qty, nullif(v_item->>'notes',''));
    v_subtotal := v_subtotal + (v_menu.price * v_qty);
  end loop;

  update public.orders set subtotal = v_subtotal where id = v_order.id;
  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'subtotal', v_subtotal);
end;
$$;
grant execute on function public.place_order(uuid, jsonb, order_channel) to anon, authenticated;

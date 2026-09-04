-- Public-read buckets for customer assets; writes limited to managing staff.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('models','models', true, 52428800, array['model/gltf-binary','application/octet-stream','model/vnd.usdz+zip','model/usd']),
  ('item-images','item-images', true, 10485760, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy "public read assets" on storage.objects for select
  using (bucket_id in ('models','item-images'));
create policy "staff upload assets" on storage.objects for insert to authenticated
  with check (bucket_id in ('models','item-images') and public.can_manage_restaurant(((storage.foldername(name))[1])::uuid));
create policy "staff update assets" on storage.objects for update to authenticated
  using (bucket_id in ('models','item-images') and public.can_manage_restaurant(((storage.foldername(name))[1])::uuid));
create policy "staff delete assets" on storage.objects for delete to authenticated
  using (bucket_id in ('models','item-images') and public.can_manage_restaurant(((storage.foldername(name))[1])::uuid));

create or replace function public.publish_item_model(p_model_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item uuid; v_rid uuid;
begin
  select m.item_id, mi.restaurant_id into v_item, v_rid
  from public.menu_item_3d_models m join public.menu_items mi on mi.id = m.item_id
  where m.id = p_model_id;
  if v_item is null then return jsonb_build_object('error','not_found'); end if;
  if not public.can_manage_restaurant(v_rid) then return jsonb_build_object('error','forbidden'); end if;
  update public.menu_item_3d_models set status='approved' where item_id=v_item and status='published' and id<>p_model_id;
  update public.menu_item_3d_models set status='published', approved_by=auth.uid(), approved_at=coalesce(approved_at,now()) where id=p_model_id;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.publish_item_model(uuid) to authenticated;

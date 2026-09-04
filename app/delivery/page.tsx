import { getServerSupabase } from '@/lib/supabase/server';
import { DeliveryAuth } from './delivery-auth';
import { DeliveryClient } from './delivery-client';

export const dynamic = 'force-dynamic';

export default async function DeliveryPage() {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <DeliveryAuth />;

  const [{ data: active }, { data: past }, { data: addresses }] = await Promise.all([
    supabase.from('delivery_requests').select('id,status,price,est_minutes,dest_address').eq('customer_id', user.id)
      .not('status', 'in', '(delivered,cancelled,failed,returned)').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('delivery_requests').select('id,status,price,dest_address,created_at,assigned_driver_id').eq('customer_id', user.id)
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('customer_addresses').select('id,label,address,lat,lng').eq('profile_id', user.id).order('created_at'),
  ]);

  return <DeliveryClient userEmail={user.email ?? ''} active={(active as any) ?? null} past={(past as any) ?? []} addresses={(addresses as any) ?? []} />;
}

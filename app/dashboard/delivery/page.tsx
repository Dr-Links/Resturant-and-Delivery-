import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';
import { DeliverySettings } from './delivery-settings';

export const dynamic = 'force-dynamic';

export default async function DeliveryPage() {
  const supabase = getServerSupabase();
  const restaurant = (await getActiveRestaurant(supabase))!;
  const [{ data: settings }, { data: zones }, { data: drivers }] = await Promise.all([
    supabase.from('restaurant_delivery_settings').select('*').eq('restaurant_id', restaurant.id).maybeSingle(),
    supabase.from('delivery_zones').select('id,name,fee,sort_order').eq('restaurant_id', restaurant.id).order('sort_order'),
    supabase.from('restaurant_drivers').select('id,name,phone,vehicle,status').eq('restaurant_id', restaurant.id).order('created_at'),
  ]);
  return (
    <DeliverySettings
      restaurantId={restaurant.id}
      currency={restaurant.currency}
      settings={(settings as any) ?? { mode: 'flat', flat_fee: 0, own_delivery_enabled: true, saas_delivery_enabled: false }}
      zones={(zones as any) ?? []}
      drivers={(drivers as any) ?? []}
    />
  );
}

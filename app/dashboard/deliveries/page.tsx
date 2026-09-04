import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';
import { DeliveriesBoard } from './deliveries-board';

export const dynamic = 'force-dynamic';

export default async function DeliveriesPage() {
  const supabase = getServerSupabase();
  const restaurant = (await getActiveRestaurant(supabase))!;
  const [{ data: deliveries }, { data: drivers }] = await Promise.all([
    supabase.from('deliveries')
      .select('id,status,fee,customer_name,customer_phone,address,provider,driver_id,order_id,zone_id,orders(order_number),delivery_zones(name),restaurant_drivers(name)')
      .eq('restaurant_id', restaurant.id).order('created_at', { ascending: false }),
    supabase.from('restaurant_drivers').select('id,name,status').eq('restaurant_id', restaurant.id).eq('status', 'active'),
  ]);
  return <DeliveriesBoard currency={restaurant.currency} initial={(deliveries as any) ?? []} drivers={(drivers as any) ?? []} />;
}

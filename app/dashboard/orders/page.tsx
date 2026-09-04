import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';
import { OrdersBoard } from './orders-board';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const supabase = getServerSupabase();
  const restaurant = (await getActiveRestaurant(supabase))!;

  const { data } = await supabase
    .from('orders')
    .select('id,order_number,status,subtotal,created_at,table_id,tables(label),order_items(name_snapshot,quantity)')
    .eq('restaurant_id', restaurant.id)
    .not('status', 'in', '(completed,cancelled)')
    .order('created_at', { ascending: true });

  return <OrdersBoard restaurantId={restaurant.id} currency={restaurant.currency} initial={(data as any) ?? []} />;
}

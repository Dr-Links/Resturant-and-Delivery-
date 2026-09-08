import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';
import { TablesQR } from './tables-qr';

export const dynamic = 'force-dynamic';

export default async function TablesPage() {
  const supabase = getServerSupabase();
  const restaurant = (await getActiveRestaurant(supabase))!;

  const { data } = await supabase
    .from('tables')
    .select('id,label,seats,status,table_qr_codes(token,is_active)')
    .eq('restaurant_id', restaurant.id)
    .order('label');

  return <TablesQR restaurantId={restaurant.id} tables={(data as any) ?? []} />;
}

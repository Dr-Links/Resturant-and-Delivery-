import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';
import { MenuManager } from './menu-manager';

export const dynamic = 'force-dynamic';

export default async function MenuPage() {
  const supabase = getServerSupabase();
  const restaurant = (await getActiveRestaurant(supabase))!;

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from('menu_categories').select('id,name').eq('restaurant_id', restaurant.id).order('sort_order'),
    supabase
      .from('menu_items')
      .select('id,name,price,status,category_id')
      .eq('restaurant_id', restaurant.id)
      .order('sort_order'),
  ]);

  return (
    <MenuManager
      currency={restaurant.currency}
      categories={(categories as any) ?? []}
      initialItems={(items as any) ?? []}
    />
  );
}

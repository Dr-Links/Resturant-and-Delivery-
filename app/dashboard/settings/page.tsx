import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';
import { SettingsToggles } from './settings-toggles';
import { RestaurantBasics } from './restaurant-basics';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = getServerSupabase();
  const restaurant = (await getActiveRestaurant(supabase))!;
  const settings = (restaurant.settings ?? {}) as Record<string, unknown>;
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('id,name,kind')
    .eq('restaurant_id', restaurant.id)
    .order('sort_order');

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <RestaurantBasics
        restaurantId={restaurant.id}
        initialName={restaurant.name}
        initialCategories={(categories as { id: string; name: string; kind: string }[]) ?? []}
      />
      <SettingsToggles restaurantId={restaurant.id} initial={settings} />
    </div>
  );
}

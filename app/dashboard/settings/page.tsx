import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';
import { SettingsToggles } from './settings-toggles';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = getServerSupabase();
  const restaurant = (await getActiveRestaurant(supabase))!;
  const settings = (restaurant.settings ?? {}) as Record<string, unknown>;
  return <SettingsToggles restaurantId={restaurant.id} initial={settings} />;
}

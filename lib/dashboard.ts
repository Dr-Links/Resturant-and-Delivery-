import type { SupabaseClient } from '@supabase/supabase-js';

export type ActiveRestaurant = {
  id: string;
  name: string;
  currency: string;
  settings: Record<string, unknown>;
};

// The restaurant the signed-in user manages: owned first, else staffed.
export async function getActiveRestaurant(
  supabase: SupabaseClient
): Promise<ActiveRestaurant | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const owned = await supabase
    .from('restaurants')
    .select('id,name,currency,settings')
    .eq('owner_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (owned.data) return owned.data as ActiveRestaurant;

  const staff = await supabase
    .from('restaurant_staff')
    .select('restaurant_id, restaurants(id,name,currency,settings)')
    .eq('profile_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  const r = (staff.data as any)?.restaurants;
  return r ? (r as ActiveRestaurant) : null;
}

import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';
import { VideosManager } from './videos-manager';

export const dynamic = 'force-dynamic';

export default async function VideosPage() {
  const supabase = getServerSupabase();
  const restaurant = (await getActiveRestaurant(supabase))!;
  const { data } = await supabase.from('menu_item_videos').select('id,url,title,created_at').eq('restaurant_id', restaurant.id).order('created_at', { ascending: false });
  return <VideosManager restaurantId={restaurant.id} initial={(data as any) ?? []} />;
}

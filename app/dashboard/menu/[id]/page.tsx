import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';
import { ModelManager } from './model-manager';
import { ImagesManager } from './images-manager';

export const dynamic = 'force-dynamic';

export default async function ItemModelPage({ params }: { params: { id: string } }) {
  const supabase = getServerSupabase();
  const restaurant = (await getActiveRestaurant(supabase))!;

  const { data: item } = await supabase
    .from('menu_items')
    .select(
      'id,name,restaurant_id,menu_item_images(id,url,sort_order),menu_item_3d_models(id,glb_url,usdz_url,poster_url,status,source,created_at)'
    )
    .eq('id', params.id)
    .eq('restaurant_id', restaurant.id)
    .maybeSingle();

  if (!item) {
    return (
      <div className="text-center py-16">
        <p className="text-muted">Item not found.</p>
        <Link href="/dashboard/menu" className="mt-3 inline-block rounded-full border border-line px-5 py-2 text-sm">
          Back to menu
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/dashboard/menu" className="text-sm text-muted hover:text-white">← Menu</Link>
      <div className="mt-3" />
      <ImagesManager
        restaurantId={restaurant.id}
        itemId={(item as any).id}
        initial={((item as any).menu_item_images ?? []) as { id: string; url: string; sort_order: number }[]}
      />
      <ModelManager restaurantId={restaurant.id} item={item as any} />
    </div>
  );
}

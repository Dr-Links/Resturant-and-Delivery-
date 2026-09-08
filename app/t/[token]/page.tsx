import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { MenuClient } from '@/components/menu-client';

export const dynamic = 'force-dynamic';
// Supabase selects are GET requests that Next's Data Cache would otherwise cache
// (that's why menu/settings edits didn't reach customers while RPC-based activity
// did). Force every fetch on this route to bypass the cache so the customer menu
// always reflects the latest owner changes.
export const fetchCache = 'force-no-store';

type ItemModel = { glb_url: string | null; usdz_url: string | null; status: string };
type ItemImage = { url: string; sort_order: number };
export type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  ingredients: string | null;
  price: number;
  labels: string[];
  menu_item_images: ItemImage[];
  menu_item_3d_models: ItemModel[];
};

export default async function TablePage({ params }: { params: { token: string } }) {
  const { data: qr } = await supabase.rpc('resolve_table_qr', { p_token: params.token });

  if (!qr || (qr as any).error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold">This QR code isn’t active</h1>
        <p className="text-muted">Ask a staff member for help, or try the demo tables.</p>
        <Link href="/" className="rounded-full bg-brand px-5 py-2.5 font-semibold text-black">Back home</Link>
      </main>
    );
  }

  const info = qr as {
    restaurant_id: string; table_id: string; table_label: string; session_id: string; session_code: number;
  };

  const [{ data: restaurant }, { data: categories }, { data: items }, { data: activity }, { data: videos }] = await Promise.all([
    supabase.from('restaurants').select('id,name,currency,settings').eq('id', info.restaurant_id).single(),
    supabase.from('menu_categories').select('id,name,kind,sort_order').eq('restaurant_id', info.restaurant_id).eq('is_active', true).order('sort_order'),
    supabase.from('menu_items')
      .select('id,category_id,name,description,ingredients,price,labels,menu_item_images(url,sort_order),menu_item_3d_models(glb_url,usdz_url,status)')
      .eq('restaurant_id', info.restaurant_id).eq('status', 'available').order('sort_order'),
    supabase.rpc('get_table_activity', { p_restaurant_id: info.restaurant_id }),
    supabase.from('menu_item_videos').select('id,url,title').eq('restaurant_id', info.restaurant_id).limit(10),
  ]);

  // Platform-wide 3D/AR switch (anon-readable). Defaults on.
  const { data: pconfig } = await supabase.from('platform_config').select('three_d_enabled').eq('id', 1).maybeSingle();

  return (
    <MenuClient
      restaurant={restaurant ?? { id: info.restaurant_id, name: 'Menu', currency: 'XAF' }}
      table={{ id: info.table_id, label: info.table_label }}
      session={{ id: info.session_id, code: info.session_code }}
      categories={categories ?? []}
      items={(items as unknown as MenuItem[]) ?? []}
      activity={(activity as { table_label: string; item_name: string; qty: number }[]) ?? []}
      videos={(videos as { id: string; url: string; title: string | null }[]) ?? []}
      socialVideoUrl={((restaurant as any)?.settings?.social_video_url as string | undefined) ?? null}
      orderingEnabled={(restaurant as any)?.settings?.digital_ordering_enabled !== false}
      threeDEnabled={(pconfig as any)?.three_d_enabled !== false}
      paymentQrUrl={((restaurant as any)?.settings?.payment_qr_url as string | undefined) ?? null}
      logoUrl={((restaurant as any)?.settings?.logo_url as string | undefined) ?? null}
    />
  );
}

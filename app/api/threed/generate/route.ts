import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, hasAdmin } from '@/lib/supabase/admin';
import { loadIntegration } from '@/lib/integrations/server';
import { threedgenConfigFrom, threedgenConfigured, startImageTo3d } from '@/lib/threedgen';

export const runtime = 'nodejs';

const Body = z.object({ itemId: z.string().uuid() });

// POST /api/threed/generate — kick off AI photo→3D for a dish's first photo.
// Returns { configured:false } when no 3D-gen key is set (graceful no-op).
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // RLS ensures the owner can only read a dish they manage.
  const { data: item } = await supabase
    .from('menu_items')
    .select('id, restaurant_id, menu_item_images(url,sort_order)')
    .eq('id', parsed.data.itemId)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const photo = [...(((item as any).menu_item_images) ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.url as string | undefined;
  if (!photo) return NextResponse.json({ error: 'no_photo' }, { status: 400 });

  if (!hasAdmin()) return NextResponse.json({ configured: false });
  const cfg = threedgenConfigFrom(await loadIntegration('threed_gen'));
  if (!threedgenConfigured(cfg)) return NextResponse.json({ configured: false });

  let taskId: string;
  try {
    taskId = await startImageTo3d(cfg, photo);
  } catch {
    return NextResponse.json({ error: 'gen_start_failed' }, { status: 502 });
  }

  const admin = getAdminSupabase();
  const { data: job } = await admin
    .from('model_gen_jobs')
    .insert({ restaurant_id: (item as any).restaurant_id, item_id: (item as any).id, provider: cfg.provider, task_id: taskId, status: 'processing' })
    .select('id')
    .single();

  return NextResponse.json({ configured: true, jobId: job?.id, status: 'processing' });
}

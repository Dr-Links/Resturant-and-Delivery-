import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, hasAdmin } from '@/lib/supabase/admin';
import { loadIntegration } from '@/lib/integrations/server';
import { threedgenConfigFrom, getGenJob } from '@/lib/threedgen';

export const runtime = 'nodejs';

const Q = z.string().uuid();

// GET /api/threed/status?jobId= — poll a generation job. On success it downloads
// the .glb, stores it on the models bucket, and creates a preview
// menu_item_3d_models row (approve→publish flow still applies). Safe to poll.
export async function GET(req: Request) {
  const parsed = Q.safeParse(new URL(req.url).searchParams.get('jobId'));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: job } = await supabase
    .from('model_gen_jobs')
    .select('id, item_id, restaurant_id, task_id, status')
    .eq('id', parsed.data)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const j = job as { id: string; item_id: string; restaurant_id: string; task_id: string; status: string };
  if (j.status === 'succeeded' || j.status === 'failed') return NextResponse.json({ status: j.status });

  if (!hasAdmin()) return NextResponse.json({ status: 'processing' });
  const admin = getAdminSupabase();
  const cfg = threedgenConfigFrom(await loadIntegration('threed_gen'));

  let result;
  try {
    result = await getGenJob(cfg, j.task_id);
  } catch {
    return NextResponse.json({ status: 'processing' });
  }

  if (result.status === 'succeeded' && result.glbUrl) {
    try {
      const r = await fetch(result.glbUrl);
      const buf = new Uint8Array(await r.arrayBuffer());
      const path = `${j.restaurant_id}/${j.item_id}/${Date.now()}-ai.glb`;
      await admin.storage.from('models').upload(path, buf, { contentType: 'model/gltf-binary', upsert: false });
      const glb = admin.storage.from('models').getPublicUrl(path).data.publicUrl;
      const { data: img } = await admin
        .from('menu_item_images').select('url,sort_order').eq('item_id', j.item_id).order('sort_order').limit(1).maybeSingle();
      await admin.from('menu_item_3d_models').insert({
        item_id: j.item_id, glb_url: glb, poster_url: (img as any)?.url ?? null, source: 'ai_generated', status: 'preview',
      });
      await admin.from('model_gen_jobs').update({ status: 'succeeded', glb_url: glb, updated_at: new Date().toISOString() }).eq('id', j.id);
      return NextResponse.json({ status: 'succeeded' });
    } catch {
      await admin.from('model_gen_jobs').update({ status: 'failed', error: 'store_failed', updated_at: new Date().toISOString() }).eq('id', j.id);
      return NextResponse.json({ status: 'failed' });
    }
  }

  if (result.status === 'failed') {
    await admin.from('model_gen_jobs').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', j.id);
    return NextResponse.json({ status: 'failed' });
  }

  return NextResponse.json({ status: 'processing', progress: result.progress ?? null });
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ARViewer } from '@/components/ar-viewer';

type Model = {
  id: string;
  glb_url: string | null;
  usdz_url: string | null;
  poster_url: string | null;
  status: string;
  source: string;
  created_at: string;
};
type Item = {
  id: string;
  name: string;
  restaurant_id: string;
  menu_item_images: { url: string; sort_order: number }[];
  menu_item_3d_models: Model[];
};

const BADGE: Record<string, string> = {
  preview: 'bg-zinc-700 text-zinc-200',
  approved: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  published: 'bg-brand/20 text-brand border border-brand/50',
  draft: 'bg-zinc-700 text-zinc-300',
  rejected: 'bg-red-500/20 text-red-300',
};

export function ModelManager({ restaurantId, item }: { restaurantId: string; item: Item }) {
  const router = useRouter();
  const supabase = createClient();
  const [glb, setGlb] = useState<File | null>(null);
  const [usdz, setUsdz] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);

  const poster = [...(item.menu_item_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null;
  const models = item.menu_item_3d_models ?? [];

  async function generate3d() {
    if (genBusy) return;
    if (!poster) { setGenMsg('Add a photo to this dish first (Photos above).'); return; }
    setGenBusy(true); setGenMsg('Starting…');
    try {
      const res = await fetch('/api/threed/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: item.id }),
      });
      const data = await res.json();
      if (data.configured === false) {
        setGenBusy(false);
        setGenMsg('Add a 3D-gen API key under Admin → Integrations (3D model generation) to enable this.');
        return;
      }
      if (!res.ok || !data.jobId) { setGenBusy(false); setGenMsg('Could not start generation. Please try again.'); return; }
      setGenMsg('Generating a 3D model from the photo… this can take a few minutes.');
      const jobId = data.jobId as string;
      const poll = async () => {
        try {
          const r = await fetch(`/api/threed/status?jobId=${jobId}`);
          const s = await r.json();
          if (s.status === 'succeeded') { setGenBusy(false); setGenMsg('Done! Review the preview below, then Approve → Publish.'); router.refresh(); return; }
          if (s.status === 'failed') { setGenBusy(false); setGenMsg('Generation failed — try a clearer, well-lit photo of the dish.'); return; }
          setGenMsg(`Generating… ${s.progress != null ? s.progress + '%' : 'in progress'}`);
          setTimeout(poll, 6000);
        } catch { setTimeout(poll, 6000); }
      };
      setTimeout(poll, 6000);
    } catch {
      setGenBusy(false); setGenMsg('Network error. Please try again.');
    }
  }

  async function uploadTo(bucket: string, file: File, kind: string) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${restaurantId}/${item.id}/${Date.now()}-${kind}-${safe}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type || (kind === 'glb' ? 'model/gltf-binary' : 'model/vnd.usdz+zip'),
      upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async function handleUpload() {
    if (!glb || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const glbUrl = await uploadTo('models', glb, 'glb');
      const usdzUrl = usdz ? await uploadTo('models', usdz, 'usdz') : null;
      const { error } = await supabase.from('menu_item_3d_models').insert({
        item_id: item.id,
        glb_url: glbUrl,
        usdz_url: usdzUrl,
        poster_url: poster,
        source: 'uploaded',
        status: 'preview',
      });
      if (error) throw error;
      setGlb(null);
      setUsdz(null);
      setMsg('Uploaded. Preview it below, then approve and publish.');
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(model: Model, status: string) {
    setBusy(true);
    await supabase.from('menu_item_3d_models').update({ status }).eq('id', model.id);
    setBusy(false);
    router.refresh();
  }

  async function publish(model: Model) {
    setBusy(true);
    const { data, error } = await supabase.rpc('publish_item_model', { p_model_id: model.id });
    setBusy(false);
    if (error || (data as any)?.error) {
      setMsg('Could not publish. You need manager/owner permission.');
      return;
    }
    router.refresh();
  }

  async function remove(model: Model) {
    if (!confirm('Delete this 3D model?')) return;
    setBusy(true);
    await supabase.from('menu_item_3d_models').delete().eq('id', model.id);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mt-2">
      <h1 className="text-2xl font-bold">{item.name}</h1>
      <p className="text-sm text-muted mb-5">3D &amp; AR models. Nothing goes live to customers until you publish it.</p>

      {/* Upload */}
      <div className="rounded-2xl border border-line bg-card p-4 mb-6">
        <p className="font-semibold mb-3">Add a 3D model</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-muted">GLB (Android / web AR) — required</span>
            <input type="file" accept=".glb,model/gltf-binary" onChange={(e) => setGlb(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
          </label>
          <label className="text-sm">
            <span className="text-muted">USDZ (iPhone AR) — optional</span>
            <input type="file" accept=".usdz,model/vnd.usdz+zip" onChange={(e) => setUsdz(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
          </label>
        </div>
        <button onClick={handleUpload} disabled={!glb || busy} className="mt-4 rounded-full bg-brand text-black px-6 py-2.5 font-semibold disabled:opacity-50">
          {busy ? 'Working…' : 'Upload model'}
        </button>
        {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
        <div className="mt-4 border-t border-line pt-3">
          <button
            onClick={generate3d}
            disabled={genBusy}
            className="rounded-full border border-brand/50 bg-brand/10 text-brand px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {genBusy ? 'Generating…' : '✨ Generate 3D from the dish photo'}
          </button>
          {genMsg && <p className="mt-2 text-xs text-muted">{genMsg}</p>}
          <p className="mt-1 text-[11px] text-muted">Uses the dish photo + your 3D-gen API key (Admin → Integrations). Same approve-before-publish flow.</p>
        </div>
      </div>

      {/* Existing models */}
      {models.length === 0 ? (
        <p className="text-muted text-sm">No 3D models yet. Upload one above.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {models
            .slice()
            .sort((a, b) => (a.status === 'published' ? -1 : 1))
            .map((m) => (
              <div key={m.id} className="rounded-2xl border border-line bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className={'rounded-full px-3 py-1 text-xs capitalize ' + (BADGE[m.status] ?? 'bg-zinc-700')}>
                    {m.status === 'published' ? 'Live to customers' : m.status}
                  </span>
                  <span className="text-xs text-muted">{m.source === 'ai_generated' ? 'AI' : 'Uploaded'}</span>
                </div>
                {m.glb_url && <ARViewer glb={m.glb_url} usdz={m.usdz_url} poster={m.poster_url} alt={item.name} />}
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.status === 'preview' && (
                    <button onClick={() => setStatus(m, 'approved')} disabled={busy} className="rounded-full border border-line px-4 py-2 text-sm">Approve</button>
                  )}
                  {m.status === 'approved' && (
                    <button onClick={() => publish(m)} disabled={busy} className="rounded-full bg-brand text-black px-4 py-2 text-sm font-semibold">Publish</button>
                  )}
                  {m.status === 'published' && (
                    <button onClick={() => setStatus(m, 'approved')} disabled={busy} className="rounded-full border border-line px-4 py-2 text-sm">Unpublish</button>
                  )}
                  <button onClick={() => remove(m)} disabled={busy} className="rounded-full border border-line px-4 py-2 text-sm text-red-300">Delete</button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

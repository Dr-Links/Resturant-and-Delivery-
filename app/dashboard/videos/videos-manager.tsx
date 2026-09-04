'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Video = { id: string; url: string; title: string | null; created_at: string };

export function VideosManager({ restaurantId, initial }: { restaurantId: string; initial: Video[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function upload() {
    if (!file || busy) return;
    setBusy(true); setMsg(null);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${restaurantId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from('videos').upload(path, file, { contentType: file.type || 'video/mp4' });
      if (upErr) throw upErr;
      const url = supabase.storage.from('videos').getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from('menu_item_videos').insert({ restaurant_id: restaurantId, url, title: title || null });
      if (error) throw error;
      setFile(null); setTitle(''); setMsg('Video published to the customer waiting screen.'); router.refresh();
    } catch (e: any) { setMsg(e?.message ?? 'Upload failed.'); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this video?')) return;
    await supabase.from('menu_item_videos').delete().eq('id', id);
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Videos</h1>
      <p className="text-sm text-muted mb-4">Shown to customers on the “order is being prepared” screen.</p>
      <div className="rounded-2xl border border-line bg-card p-4 mb-6">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="w-full rounded-xl bg-ink border border-line px-3 py-2 text-sm mb-3 outline-none focus:border-brand" />
        <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
        <button onClick={upload} disabled={!file || busy} className="mt-3 rounded-full bg-brand text-black px-6 py-2.5 font-semibold disabled:opacity-50">{busy ? 'Uploading…' : 'Upload video'}</button>
        {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
      </div>
      {initial.length === 0 ? (<p className="text-muted text-sm">No videos yet.</p>) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {initial.map((v) => (
            <div key={v.id} className="rounded-2xl border border-line bg-card overflow-hidden">
              <video src={v.url} controls className="w-full" />
              <div className="p-3 flex items-center justify-between"><p className="text-sm">{v.title ?? 'Untitled'}</p><button onClick={() => remove(v.id)} className="text-xs text-red-300">Delete</button></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

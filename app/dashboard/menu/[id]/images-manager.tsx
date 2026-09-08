'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Image = { id: string; url: string; sort_order: number };
const BUCKET = 'item-images';

export function ImagesManager({ restaurantId, itemId, initial }: { restaurantId: string; itemId: string; initial: Image[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function add(file: File) {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${restaurantId}/${itemId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (upErr) throw upErr;
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const nextOrder = initial.reduce((m, i) => Math.max(m, i.sort_order), -1) + 1;
      const { error } = await supabase.from('menu_item_images').insert({ item_id: itemId, url, sort_order: nextOrder });
      if (error) throw error;
      router.refresh();
    } catch (e) {
      setMsg((e as { message?: string })?.message ?? 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this photo?')) return;
    setBusy(true);
    await supabase.from('menu_item_images').delete().eq('id', id);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold">Photos</p>
        <label className="rounded-full bg-brand text-black px-4 py-1.5 text-sm font-semibold cursor-pointer">
          {busy ? 'Working…' : '+ Add photo'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) add(f); e.currentTarget.value = ''; }}
          />
        </label>
      </div>
      {msg && <p className="mb-2 text-sm text-red-400">{msg}</p>}
      {initial.length === 0 ? (
        <p className="text-sm text-muted">No photos yet. The first photo is used as the dish poster.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {initial.map((img) => (
            <div key={img.id} className="relative group rounded-xl overflow-hidden border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="w-full h-24 object-cover" />
              <button
                onClick={() => remove(img.id)}
                disabled={busy}
                className="absolute top-1 right-1 rounded-full bg-black/70 text-red-300 text-xs px-2 py-0.5"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

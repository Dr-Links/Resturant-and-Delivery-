'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Category = { id: string; name: string; kind: string };
const KINDS = ['food', 'drink', 'dessert', 'other'];

export function RestaurantBasics({
  restaurantId,
  initialName,
  initialCategories,
}: {
  restaurantId: string;
  initialName: string;
  initialCategories: Category[];
}) {
  const supabase = createClient();
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);
  const [cats, setCats] = useState<Category[]>(initialCategories);
  const [newCat, setNewCat] = useState('');
  const [newKind, setNewKind] = useState('food');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function saveName() {
    if (!name.trim() || savingName) return;
    setSavingName(true); setMsg(null);
    const { error } = await supabase.from('restaurants').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', restaurantId);
    setSavingName(false);
    if (error) { setMsg('Could not save the name.'); return; }
    setMsg('Saved.'); router.refresh();
  }

  async function addCat() {
    if (!newCat.trim() || busy) return;
    setBusy('add'); setMsg(null);
    const { data, error } = await supabase
      .from('menu_categories')
      .insert({ restaurant_id: restaurantId, name: newCat.trim(), kind: newKind })
      .select('id,name,kind')
      .single();
    setBusy(null);
    if (error || !data) { setMsg('Could not add the category.'); return; }
    setCats((c) => [...c, data as Category]);
    setNewCat('');
    router.refresh();
  }

  async function delCat(id: string) {
    if (!confirm('Delete this category? Dishes in it become Uncategorised.')) return;
    setBusy(id); setMsg(null);
    const { error } = await supabase.from('menu_categories').delete().eq('id', id);
    setBusy(null);
    if (error) { setMsg('Could not delete the category.'); return; }
    setCats((c) => c.filter((x) => x.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {msg && <p className="text-sm text-brand">{msg}</p>}

      {/* Restaurant name */}
      <div className="rounded-2xl border border-line bg-card p-4">
        <p className="font-medium mb-2">Restaurant name</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-[200px] rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button onClick={saveName} disabled={savingName} className="rounded-full bg-brand text-black px-5 py-2 text-sm font-semibold disabled:opacity-50">
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-muted mt-1.5">Shown to customers at the top of the menu.</p>
      </div>

      {/* Categories */}
      <div className="rounded-2xl border border-line bg-card p-4">
        <p className="font-medium mb-2">Menu categories</p>
        {cats.length === 0 ? (
          <p className="text-xs text-muted mb-3">No categories yet. Add one below.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-3">
            {cats.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm">
                {c.name} <span className="text-[10px] text-muted capitalize">{c.kind}</span>
                <button onClick={() => delCat(c.id)} disabled={busy === c.id} className="text-red-300">✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="New category (e.g. Starters)"
            className="flex-1 min-w-[160px] rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <select value={newKind} onChange={(e) => setNewKind(e.target.value)} className="rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand capitalize">
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <button onClick={addCat} disabled={busy === 'add'} className="rounded-full bg-brand text-black px-5 py-2 text-sm font-semibold disabled:opacity-50">
            {busy === 'add' ? 'Adding…' : 'Add'}
          </button>
        </div>
        <p className="text-xs text-muted mt-1.5">Deleting a category keeps its dishes — they just become Uncategorised.</p>
      </div>
    </div>
  );
}

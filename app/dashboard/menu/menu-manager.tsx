'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Item = { id: string; name: string; price: number; status: string; category_id: string | null };
type Category = { id: string; name: string };

export function MenuManager({
  restaurantId,
  currency,
  categories,
  initialItems,
}: {
  restaurantId: string;
  currency: string;
  categories: Category[];
  initialItems: Item[];
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [savingId, setSavingId] = useState<string | null>(null);
  const supabase = createClient();

  // new-item form
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addItem() {
    const p = parseFloat(price);
    if (!name.trim() || Number.isNaN(p) || p < 0) { setErr('Enter a name and a valid price.'); return; }
    setAdding(true); setErr(null);
    const { data, error } = await supabase
      .from('menu_items')
      .insert({ restaurant_id: restaurantId, name: name.trim(), price: p, category_id: categoryId || null, status: 'available' })
      .select('id,name,price,status,category_id')
      .single();
    setAdding(false);
    if (error || !data) { setErr('Could not add the item.'); return; }
    setItems((prev) => [...prev, data as Item]);
    setName(''); setPrice(''); setCategoryId('');
  }

  async function deleteItem(item: Item) {
    if (!confirm(`Delete "${item.name}"? This also removes its photos and 3D models.`)) return;
    setSavingId(item.id);
    const { error } = await supabase.from('menu_items').delete().eq('id', item.id);
    setSavingId(null);
    if (error) { setErr('Could not delete the item.'); return; }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  async function setStatus(item: Item, status: string) {
    setSavingId(item.id);
    await supabase.from('menu_items').update({ status }).eq('id', item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)));
    setSavingId(null);
  }

  async function setPrice_(item: Item, next: number) {
    if (Number.isNaN(next) || next < 0) return;
    setSavingId(item.id);
    await supabase.from('menu_items').update({ price: next }).eq('id', item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, price: next } : i)));
    setSavingId(null);
  }

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Uncategorised';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Menu</h1>

      {/* Add item */}
      <div className="rounded-2xl border border-line bg-card p-4 mb-4">
        <p className="font-semibold mb-3">Add a dish</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dish name"
            className="flex-1 min-w-[160px] rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted">{currency}</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              type="number"
              placeholder="Price"
              className="w-24 rounded-xl bg-ink border border-line px-3 py-2 text-right text-sm outline-none focus:border-brand"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={addItem}
            disabled={adding}
            className="rounded-full bg-brand text-black px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add dish'}
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </div>

      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="rounded-2xl border border-line bg-card p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[160px]">
              <p className="font-semibold">{it.name}</p>
              <p className="text-xs text-muted">{catName(it.category_id)}</p>
              <Link href={`/dashboard/menu/${it.id}`} className="text-xs text-brand hover:underline">Manage photos · 3D / AR →</Link>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{currency}</span>
              <input
                type="number"
                defaultValue={Number(it.price)}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (v !== Number(it.price)) setPrice_(it, v);
                }}
                className="w-24 rounded-xl bg-ink border border-line px-3 py-2 text-right outline-none focus:border-brand"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {(['available', 'sold_out', 'hidden'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(it, s)}
                  disabled={savingId === it.id}
                  className={
                    'rounded-full px-3 py-1.5 text-xs border ' +
                    (it.status === s ? 'bg-brand text-black border-brand' : 'border-line text-muted hover:text-white')
                  }
                >
                  {s === 'available' ? 'Available' : s === 'sold_out' ? 'Sold out' : 'Hidden'}
                </button>
              ))}
              <button
                onClick={() => deleteItem(it)}
                disabled={savingId === it.id}
                className="rounded-full px-3 py-1.5 text-xs border border-line text-red-300 hover:border-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">
        Prices and availability update the live customer menu instantly. Use{' '}
        <span className="text-white">Manage photos · 3D / AR</span> on any dish to add photos and upload GLB/USDZ models.
      </p>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';

type Item = { id: string; name: string; price: number; status: string; category_id: string | null };
type Category = { id: string; name: string };

export function MenuManager({
  currency,
  categories,
  initialItems,
}: {
  currency: string;
  categories: Category[];
  initialItems: Item[];
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [savingId, setSavingId] = useState<string | null>(null);
  const supabase = createClient();

  async function setStatus(item: Item, status: string) {
    setSavingId(item.id);
    await supabase.from('menu_items').update({ status }).eq('id', item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)));
    setSavingId(null);
  }

  async function setPrice(item: Item, price: number) {
    if (Number.isNaN(price) || price < 0) return;
    setSavingId(item.id);
    await supabase.from('menu_items').update({ price }).eq('id', item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, price } : i)));
    setSavingId(null);
  }

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Uncategorised';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Menu</h1>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="rounded-2xl border border-line bg-card p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[160px]">
              <p className="font-semibold">{it.name}</p>
              <p className="text-xs text-muted">{catName(it.category_id)}</p>
              <Link href={`/dashboard/menu/${it.id}`} className="text-xs text-brand hover:underline">Manage 3D / AR →</Link>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{currency}</span>
              <input
                type="number"
                defaultValue={Number(it.price)}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (v !== Number(it.price)) setPrice(it, v);
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
                    (it.status === s
                      ? 'bg-brand text-black border-brand'
                      : 'border-line text-muted hover:text-white')
                  }
                >
                  {s === 'available' ? 'Available' : s === 'sold_out' ? 'Sold out' : 'Hidden'}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">
        Prices and availability update the live customer menu instantly. Full item editor (photos, 3D models, variants)
        comes with the AR upload flow in Phase 2.
      </p>
    </div>
  );
}

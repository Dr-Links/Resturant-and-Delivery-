'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';

type OrderItem = { name_snapshot: string; quantity: number };
type Order = {
  id: string;
  order_number: number;
  status: string;
  subtotal: number;
  created_at: string;
  tables: { label: string } | null;
  order_items: OrderItem[];
};

const FLOW: Record<string, { next: string; label: string } | null> = {
  received: { next: 'preparing', label: 'Start preparing' },
  preparing: { next: 'ready', label: 'Mark ready' },
  ready: { next: 'served', label: 'Mark served' },
  served: { next: 'completed', label: 'Complete' },
  pending: { next: 'received', label: 'Accept' },
};

const COLUMNS = ['received', 'preparing', 'ready', 'served'];
const TITLES: Record<string, string> = {
  received: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
};

export function OrdersBoard({
  restaurantId,
  currency,
  initial,
}: {
  restaurantId: string;
  currency: string;
  initial: Order[];
}) {
  const [orders, setOrders] = useState<Order[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id,order_number,status,subtotal,created_at,table_id,tables(label),order_items(name_snapshot,quantity)')
      .eq('restaurant_id', restaurantId)
      .not('status', 'in', '(completed,cancelled)')
      .order('created_at', { ascending: true });
    if (data) setOrders(data as any);
  }, [restaurantId, supabase]);

  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function advance(o: Order) {
    const step = FLOW[o.status];
    if (!step || busy) return;
    setBusy(o.id);
    await supabase.from('orders').update({ status: step.next }).eq('id', o.id);
    setBusy(null);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Live orders</h1>
        <span className="text-xs text-muted">Auto-refreshing · {orders.length} active</span>
      </div>

      {orders.length === 0 && (
        <div className="rounded-2xl border border-line bg-card p-8 text-center text-muted">
          No active orders. New table orders appear here instantly.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const colOrders = orders.filter((o) => o.status === col || (col === 'received' && o.status === 'pending'));
          return (
            <div key={col}>
              <p className="text-xs uppercase tracking-wide text-muted mb-2">
                {TITLES[col]} · {colOrders.length}
              </p>
              <div className="space-y-2">
                {colOrders.map((o) => {
                  const step = FLOW[o.status];
                  return (
                    <div key={o.id} className="rounded-2xl border border-line bg-card p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">#{o.order_number}</p>
                        <span className="text-xs text-muted">Table {o.tables?.label ?? '—'}</span>
                      </div>
                      <ul className="mt-2 text-sm text-zinc-300 space-y-0.5">
                        {o.order_items.map((it, i) => (
                          <li key={i}>
                            {it.quantity}× {it.name_snapshot}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-sm text-brand font-semibold">{money(Number(o.subtotal), currency)}</p>
                      {step && (
                        <button
                          onClick={() => advance(o)}
                          disabled={busy === o.id}
                          className="mt-2 w-full rounded-full bg-brand text-black py-2 text-sm font-semibold disabled:opacity-60"
                        >
                          {busy === o.id ? '…' : step.label}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

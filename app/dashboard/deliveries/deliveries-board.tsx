'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';

type Delivery = {
  id: string; status: string; fee: number; customer_name: string | null; customer_phone: string | null;
  address: string | null; provider: string; driver_id: string | null; order_id: string;
  orders: { order_number: number } | null; delivery_zones: { name: string } | null; restaurant_drivers: { name: string } | null;
};
type Driver = { id: string; name: string; status: string };

const FLOW: Record<string, { next: string; label: string } | null> = {
  pending: { next: 'assigned', label: 'Mark assigned' },
  assigned: { next: 'picked_up', label: 'Picked up' },
  picked_up: { next: 'in_transit', label: 'In transit' },
  in_transit: { next: 'delivered', label: 'Delivered' },
  delivered: null, cancelled: null, failed: null, returned: null,
};

export function DeliveriesBoard({ currency, initial, drivers }: { currency: string; initial: Delivery[]; drivers: Driver[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);

  async function assign(d: Delivery, driverId: string) {
    setBusy(d.id);
    await supabase.from('deliveries').update({ driver_id: driverId || null, status: driverId ? 'assigned' : d.status }).eq('id', d.id);
    setBusy(null); router.refresh();
  }
  async function advance(d: Delivery) {
    const step = FLOW[d.status]; if (!step) return;
    setBusy(d.id);
    await supabase.from('deliveries').update({ status: step.next }).eq('id', d.id);
    setBusy(null); router.refresh();
  }
  async function cancel(d: Delivery) {
    setBusy(d.id);
    await supabase.from('deliveries').update({ status: 'cancelled' }).eq('id', d.id);
    setBusy(null); router.refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Deliveries</h1>
      <p className="text-sm text-muted mb-4">Food orders going out for delivery. Only platform food orders appear here.</p>
      {initial.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center text-muted">No deliveries yet.</div>
      ) : (
        <div className="space-y-3">
          {initial.map((d) => {
            const step = FLOW[d.status];
            const active = !['delivered', 'cancelled', 'failed', 'returned'].includes(d.status);
            return (
              <div key={d.id} className="rounded-2xl border border-line bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">Order #{d.orders?.order_number ?? '—'} · {d.customer_name ?? 'Customer'}</p>
                    <p className="text-xs text-muted">{d.address ?? '—'}{d.delivery_zones?.name ? ` · ${d.delivery_zones.name}` : ''} · {money(Number(d.fee), currency)}</p>
                  </div>
                  <span className="rounded-full border border-line px-3 py-1 text-xs capitalize">{d.status.replace('_', ' ')}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select value={d.driver_id ?? ''} onChange={(e) => assign(d, e.target.value)} disabled={busy === d.id || !active} className="rounded-xl bg-ink border border-line px-3 py-2 text-sm">
                    <option value="">Unassigned</option>
                    {drivers.map((dr) => (<option key={dr.id} value={dr.id}>{dr.name}</option>))}
                  </select>
                  {step && active && (<button onClick={() => advance(d)} disabled={busy === d.id} className="rounded-full bg-brand text-black px-4 py-2 text-sm font-semibold">{step.label}</button>)}
                  {active && (<button onClick={() => cancel(d)} disabled={busy === d.id} className="rounded-full border border-line px-4 py-2 text-sm text-red-300">Cancel</button>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { getServerSupabase } from '@/lib/supabase/server';
import { money } from '@/lib/format';
export const dynamic = 'force-dynamic';
export default async function AdminDeliveries() {
  const supabase = getServerSupabase();
  const { data } = await supabase.from('delivery_requests').select('id,status,price,item_type,dest_address,created_at').order('created_at', { ascending: false }).limit(50);
  const rows = (data as any[]) ?? [];
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Delivery requests</h1>
      {rows.length === 0 ? <p className="text-muted text-sm">No delivery requests.</p> : (
        <div className="space-y-2">{rows.map((d) => (
          <div key={d.id} className="rounded-2xl border border-line bg-card p-4 flex items-center justify-between">
            <div><p className="text-sm">{d.dest_address ?? '—'}</p><p className="text-xs text-muted capitalize">{d.item_type} · {d.status.replace('_', ' ')}</p></div>
            <span className="text-sm text-brand font-semibold">{money(Number(d.price))}</span>
          </div>
        ))}</div>
      )}
    </div>
  );
}

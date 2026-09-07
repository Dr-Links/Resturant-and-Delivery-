import { getServerSupabase } from '@/lib/supabase/server';
import { money } from '@/lib/format';
import { DeliveriesMap, type MapPoint } from './deliveries-map';
export const dynamic = 'force-dynamic';

type Row = {
  id: string; status: string; price: number; item_type: string;
  dest_address: string | null; dest_lat: number | null; dest_lng: number | null; created_at: string;
};

export default async function AdminDeliveries() {
  const supabase = getServerSupabase();
  const { data } = await supabase
    .from('delivery_requests')
    .select('id,status,price,item_type,dest_address,dest_lat,dest_lng,created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  const rows = (data as Row[]) ?? [];

  const points: MapPoint[] = rows
    .filter((r) => r.dest_lat != null && r.dest_lng != null)
    .map((r) => ({ id: r.id, lat: Number(r.dest_lat), lng: Number(r.dest_lng), label: r.dest_address ?? 'Delivery', status: r.status }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Delivery requests</h1>

      <DeliveriesMap points={points} />

      {rows.length === 0 ? (
        <p className="text-muted text-sm">No delivery requests.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((d) => (
            <div key={d.id} className="rounded-2xl border border-line bg-card p-4 flex items-center justify-between">
              <div>
                <p className="text-sm">{d.dest_address ?? '—'}</p>
                <p className="text-xs text-muted capitalize">
                  {d.item_type} · {d.status.replace('_', ' ')}
                  {d.dest_lat == null && <span className="text-amber-300"> · not mapped</span>}
                </p>
              </div>
              <span className="text-sm text-brand font-semibold">{money(Number(d.price))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

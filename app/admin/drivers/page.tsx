import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export default async function AdminDrivers() {
  const supabase = getServerSupabase();
  const { data } = await supabase.from('platform_drivers').select('id,status,is_online,vehicle,rating_avg,rating_count').order('created_at', { ascending: false });
  const rows = (data as any[]) ?? [];
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">SaaS drivers</h1>
      {rows.length === 0 ? <p className="text-muted text-sm">No drivers.</p> : (
        <div className="space-y-2">{rows.map((d) => (
          <Link key={d.id} href={`/admin/drivers/${d.id}`} className="block rounded-2xl border border-line bg-card p-4 flex items-center justify-between transition-colors hover:border-brand/60">
            <div><p className="font-semibold capitalize">{d.status} {d.is_online && <span className="text-brand text-xs">● online</span>}</p><p className="text-xs text-muted">{d.vehicle ?? '—'} · ★{d.rating_avg} ({d.rating_count})</p></div>
            <span className="text-muted text-sm">→</span>
          </Link>
        ))}</div>
      )}
    </div>
  );
}

import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

async function count(supabase: any, table: string, filter?: (q: any) => any) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count } = await q; return count ?? 0;
}

type ProfileRef = { full_name: string | null; email: string | null } | null;
type RestaurantRow = { id: string; name: string; status: string; currency: string; created_at: string; owner: ProfileRef };
type DriverRow = { id: string; status: string; is_online: boolean; vehicle: string | null; rating_avg: number; rating_count: number; created_at: string; profile: ProfileRef };

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-brand/20 text-brand border border-brand/50',
  approved: 'bg-brand/20 text-brand border border-brand/50',
  online: 'bg-brand/20 text-brand border border-brand/50',
  pending: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
  suspended: 'bg-red-500/20 text-red-300 border border-red-500/40',
  rejected: 'bg-red-500/20 text-red-300 border border-red-500/40',
};
function badge(status: string) {
  return 'rounded-full px-2.5 py-1 text-xs capitalize ' + (STATUS_BADGE[status] ?? 'bg-zinc-700 text-zinc-200');
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function who(p: ProfileRef) {
  return p?.full_name || p?.email || '—';
}

export default async function AdminOverview() {
  const supabase = getServerSupabase();
  const [restaurants, drivers, kyc, complaints, suggestions, deliveries, restaurantList, driverList] = await Promise.all([
    count(supabase, 'restaurants'), count(supabase, 'platform_drivers'),
    count(supabase, 'driver_kyc', (q: any) => q.eq('status', 'submitted')),
    count(supabase, 'complaints', (q: any) => q.eq('status', 'open')),
    count(supabase, 'suggestions'), count(supabase, 'delivery_requests'),
    supabase.from('restaurants')
      .select('id,name,status,currency,created_at, owner:profiles(full_name,email)')
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('platform_drivers')
      .select('id,status,is_online,vehicle,rating_avg,rating_count,created_at, profile:profiles(full_name,email)')
      .order('created_at', { ascending: false }).limit(20),
  ]);

  const cards = [
    { label: 'Restaurants', value: restaurants }, { label: 'SaaS drivers', value: drivers },
    { label: 'KYC pending', value: kyc }, { label: 'Open complaints', value: complaints },
    { label: 'Suggestions', value: suggestions }, { label: 'Delivery requests', value: deliveries },
  ];
  // Supabase types the to-one embed (owner/profile) as an array; at runtime it
  // is a single object, so cast through unknown.
  const rlist = (restaurantList.data as unknown as RestaurantRow[]) ?? [];
  const dlist = (driverList.data as unknown as DriverRow[]) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-4">Overview</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-2xl border border-line bg-card p-4">
              <p className="text-xs text-muted">{c.label}</p>
              <p className="mt-1 text-2xl font-bold">{c.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Restaurants */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Restaurants</h2>
          <span className="text-xs text-muted">{rlist.length} shown</span>
        </div>
        {rlist.length === 0 ? (
          <div className="rounded-2xl border border-line bg-card p-8 text-center text-muted text-sm">
            No restaurants yet. When an owner signs up and creates their restaurant, it appears here.
          </div>
        ) : (
          <div className="space-y-2">
            {rlist.map((r) => (
              <Link
                key={r.id}
                href={`/admin/restaurants/${r.id}`}
                className="block rounded-2xl border border-line bg-card p-4 transition-colors hover:border-brand/60"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{r.name}</p>
                      <span className={badge(r.status)}>{r.status}</span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">Owner: {who(r.owner)} · {r.currency} · since {fmtDate(r.created_at)}</p>
                  </div>
                  <span className="text-muted text-sm">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* SaaS drivers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">SaaS drivers</h2>
          <Link href="/admin/drivers" className="text-xs text-brand hover:underline">Manage drivers →</Link>
        </div>
        {dlist.length === 0 ? (
          <div className="rounded-2xl border border-line bg-card p-8 text-center text-muted text-sm">
            No drivers yet. Approved KYC applicants show up here as active SaaS drivers.
          </div>
        ) : (
          <div className="space-y-2">
            {dlist.map((d) => (
              <div key={d.id} className="rounded-2xl border border-line bg-card p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{who(d.profile)}</p>
                    <span className={badge(d.status)}>{d.status}</span>
                    {d.is_online && <span className="text-brand text-xs">● online</span>}
                  </div>
                  <p className="text-xs text-muted mt-0.5">{d.vehicle ?? 'No vehicle'} · ★{d.rating_avg} ({d.rating_count}) · since {fmtDate(d.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

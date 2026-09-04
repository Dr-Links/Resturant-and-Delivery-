import { getServerSupabase } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
async function count(supabase: any, table: string, filter?: (q: any) => any) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count } = await q; return count ?? 0;
}
export default async function AdminOverview() {
  const supabase = getServerSupabase();
  const [restaurants, drivers, kyc, complaints, suggestions, deliveries] = await Promise.all([
    count(supabase, 'restaurants'), count(supabase, 'platform_drivers'),
    count(supabase, 'driver_kyc', (q: any) => q.eq('status', 'submitted')),
    count(supabase, 'complaints', (q: any) => q.eq('status', 'open')),
    count(supabase, 'suggestions'), count(supabase, 'delivery_requests'),
  ]);
  const cards = [
    { label: 'Restaurants', value: restaurants }, { label: 'SaaS drivers', value: drivers },
    { label: 'KYC pending', value: kyc }, { label: 'Open complaints', value: complaints },
    { label: 'Suggestions', value: suggestions }, { label: 'Delivery requests', value: deliveries },
  ];
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((c) => (<div key={c.label} className="rounded-2xl border border-line bg-card p-4"><p className="text-xs text-muted">{c.label}</p><p className="mt-1 text-2xl font-bold">{c.value}</p></div>))}
      </div>
    </div>
  );
}

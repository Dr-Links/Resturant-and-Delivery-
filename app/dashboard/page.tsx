import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function Overview() {
  const supabase = getServerSupabase();
  const restaurant = (await getActiveRestaurant(supabase))!;
  const today = startOfToday();

  const [ordersToday, activeTables, openSessions] = await Promise.all([
    supabase
      .from('orders')
      .select('id,subtotal,status,created_at')
      .eq('restaurant_id', restaurant.id)
      .gte('created_at', today),
    supabase.from('tables').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id).eq('status', 'occupied'),
    supabase.from('dining_sessions').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id).eq('status', 'open'),
  ]);

  const orders = ordersToday.data ?? [];
  const revenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + Number(o.subtotal ?? 0), 0);

  const cards = [
    { label: "Today's orders", value: String(orders.length) },
    { label: "Today's revenue", value: money(revenue, restaurant.currency) },
    { label: 'Active tables', value: String(activeTables.count ?? 0) },
    { label: 'Open sessions', value: String(openSessions.count ?? 0) },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-line bg-card p-4">
            <p className="text-xs text-muted">{c.label}</p>
            <p className="mt-1 text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">
        Live incoming orders are on the <span className="text-white">Orders</span> tab. Food conversion and AR engagement
        are on <span className="text-white">Analytics</span>; ratings and reviews are on{' '}
        <span className="text-white">Feedback</span>.
      </p>
    </div>
  );
}

import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

type Row = { item_id: string; name: string; views: number; ar_opens: number; carts: number; orders: number };

function pct(n: number, d: number) {
  if (!d) return '—';
  return `${Math.round((n / d) * 100)}%`;
}

export default async function AnalyticsPage() {
  const supabase = getServerSupabase();
  const restaurant = (await getActiveRestaurant(supabase))!;
  const { data } = await supabase.rpc('get_food_funnel', { p_restaurant_id: restaurant.id });
  const rows = ((data as Row[]) ?? []).map((r) => ({
    ...r,
    views: Number(r.views),
    ar_opens: Number(r.ar_opens),
    carts: Number(r.carts),
    orders: Number(r.orders),
  }));

  const hasData = rows.some((r) => r.views + r.ar_opens + r.carts + r.orders > 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Food conversion</h1>
      <p className="text-sm text-muted mb-4">Last 30 days · view → AR → cart → order for each dish.</p>

      {!hasData ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center text-muted">
          No activity yet. As customers browse the menu and open dishes in AR, their journey shows up here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="text-left p-3">Dish</th>
                <th className="text-right p-3">Views</th>
                <th className="text-right p-3">AR opens</th>
                <th className="text-right p-3">Cart</th>
                <th className="text-right p-3">Orders</th>
                <th className="text-right p-3">View→Order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item_id} className="border-t border-line">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3 text-right">{r.views}</td>
                  <td className="p-3 text-right">{r.ar_opens}</td>
                  <td className="p-3 text-right">{r.carts}</td>
                  <td className="p-3 text-right text-brand font-semibold">{r.orders}</td>
                  <td className="p-3 text-right">{pct(r.orders, r.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

type Review = { id: string; kind: string; rating: number; comment: string | null; created_at: string };

function avg(rows: Review[], kind: string) {
  const r = rows.filter((x) => x.kind === kind);
  if (r.length === 0) return null;
  return (r.reduce((s, x) => s + x.rating, 0) / r.length).toFixed(1);
}

export default async function FeedbackPage() {
  const supabase = getServerSupabase();
  const restaurant = (await getActiveRestaurant(supabase))!;
  const { data } = await supabase.from('reviews').select('id,kind,rating,comment,created_at').eq('restaurant_id', restaurant.id).order('created_at', { ascending: false }).limit(50);
  const rows = (data as Review[]) ?? [];

  const cards = [
    { label: 'Restaurant', value: avg(rows, 'restaurant') },
    { label: 'Food', value: avg(rows, 'food') },
    { label: 'Delivery', value: avg(rows, 'delivery') },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Feedback</h1>
      <p className="text-sm text-muted mb-4">Ratings are kept separate — restaurant, food and delivery are never blended into one score.</p>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-line bg-card p-4 text-center">
            <p className="text-xs text-muted">{c.label}</p>
            <p className="mt-1 text-2xl font-bold">{c.value ? `${c.value}★` : '—'}</p>
          </div>
        ))}
      </div>
      {rows.filter((r) => r.comment).length === 0 ? (
        <p className="text-muted text-sm">No written reviews yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.filter((r) => r.comment).map((r) => (
            <div key={r.id} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex items-center gap-2"><span className="text-brand">{'★'.repeat(r.rating)}</span><span className="text-xs text-muted capitalize">{r.kind}</span></div>
              <p className="mt-1 text-sm">{r.comment}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">Private complaints go to platform admin only — they never appear here.</p>
    </div>
  );
}

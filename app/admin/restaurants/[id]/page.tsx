import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

type ProfileRef = { full_name: string | null; email: string | null; phone: string | null } | null;
type Restaurant = {
  id: string; name: string; status: string; slug: string | null;
  currency: string; timezone: string; created_at: string;
  settings: Record<string, unknown>; owner: ProfileRef;
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-brand/20 text-brand border border-brand/50',
  suspended: 'bg-red-500/20 text-red-300 border border-red-500/40',
};
function badge(status: string) {
  return 'rounded-full px-2.5 py-1 text-xs capitalize ' + (STATUS_BADGE[status] ?? 'bg-zinc-700 text-zinc-200');
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function flagLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function AdminRestaurantDetail({ params }: { params: { id: string } }) {
  const supabase = getServerSupabase();

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id,name,status,slug,currency,timezone,created_at,settings, owner:profiles(full_name,email,phone)')
    .eq('id', params.id)
    .maybeSingle();

  if (!restaurant) notFound();
  const r = restaurant as unknown as Restaurant;

  // Admin-readable counts only: tables (public read) + published menu items
  // (available/sold_out are public-read; orders/staff are staff-only under RLS
  // and would show misleading zeros, so they are omitted here).
  const [tables, menuItems] = await Promise.all([
    supabase.from('tables').select('id', { count: 'exact', head: true }).eq('restaurant_id', r.id),
    supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('restaurant_id', r.id),
  ]);

  const stats = [
    { label: 'Tables', value: tables.count ?? 0 },
    { label: 'Menu items (published)', value: menuItems.count ?? 0 },
  ];

  const settings = r.settings ?? {};
  const flagKeys = Object.keys(settings).filter((k) => typeof (settings as any)[k] === 'boolean');

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-xs text-brand hover:underline">← Back to overview</Link>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{r.name}</h1>
        <span className={badge(r.status)}>{r.status}</span>
      </div>

      {/* Identity + owner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="text-xs text-muted mb-2">Restaurant</p>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between gap-4"><dt className="text-muted">Slug</dt><dd>{r.slug ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Currency</dt><dd>{r.currency}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Timezone</dt><dd>{r.timezone}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Created</dt><dd>{fmtDate(r.created_at)}</dd></div>
          </dl>
        </div>
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="text-xs text-muted mb-2">Owner</p>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between gap-4"><dt className="text-muted">Name</dt><dd>{r.owner?.full_name ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Email</dt><dd>{r.owner?.email ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Phone</dt><dd>{r.owner?.phone ?? '—'}</dd></div>
          </dl>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-card p-4">
            <p className="text-xs text-muted">{s.label}</p>
            <p className="mt-1 text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Feature flags */}
      <div>
        <p className="text-sm font-semibold mb-2">Feature flags</p>
        {flagKeys.length === 0 ? (
          <p className="text-xs text-muted">No feature flags set.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {flagKeys.map((k) => {
              const on = Boolean((settings as any)[k]);
              return (
                <span key={k} className={'rounded-full px-3 py-1 text-xs border ' + (on ? 'bg-brand/20 text-brand border-brand/50' : 'border-line text-muted')}>
                  {flagLabel(k)}: {on ? 'On' : 'Off'}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

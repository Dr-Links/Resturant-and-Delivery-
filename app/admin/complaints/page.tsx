import { getServerSupabase } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export default async function AdminComplaints() {
  const supabase = getServerSupabase();
  const { data } = await supabase.from('complaints').select('id,category,description,status,created_at').order('created_at', { ascending: false });
  const rows = (data as any[]) ?? [];
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Complaints</h1>
      {rows.length === 0 ? <p className="text-muted text-sm">No complaints.</p> : (
        <div className="space-y-2">{rows.map((c) => (
          <div key={c.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex items-center justify-between"><p className="font-semibold capitalize">{c.category ?? 'General'}</p><span className="text-xs capitalize rounded-full border border-line px-3 py-1">{c.status}</span></div>
            <p className="mt-1 text-sm text-muted">{c.description}</p>
          </div>
        ))}</div>
      )}
    </div>
  );
}

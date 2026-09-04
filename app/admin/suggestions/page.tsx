import { getServerSupabase } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export default async function AdminSuggestions() {
  const supabase = getServerSupabase();
  const { data } = await supabase.from('suggestions').select('id,body,created_at').order('created_at', { ascending: false });
  const rows = (data as any[]) ?? [];
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Suggestions</h1>
      {rows.length === 0 ? <p className="text-muted text-sm">No suggestions.</p> : (
        <div className="space-y-2">{rows.map((s) => (<div key={s.id} className="rounded-2xl border border-line bg-card p-4 text-sm">{s.body}</div>))}</div>
      )}
    </div>
  );
}

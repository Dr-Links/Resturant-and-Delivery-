import { getServerSupabase } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export default async function AdminAudit() {
  const supabase = getServerSupabase();
  const { data } = await supabase.from('audit_logs').select('id,action,entity,created_at').order('created_at', { ascending: false }).limit(80);
  const rows = (data as any[]) ?? [];
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Audit log</h1>
      {rows.length === 0 ? <p className="text-muted text-sm">No audit entries.</p> : (
        <div className="space-y-1">{rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-line bg-card px-4 py-2 text-sm flex items-center justify-between">
            <span>{r.action} <span className="text-muted">· {r.entity ?? ''}</span></span>
            <span className="text-xs text-muted">{new Date(r.created_at).toLocaleString()}</span>
          </div>
        ))}</div>
      )}
    </div>
  );
}

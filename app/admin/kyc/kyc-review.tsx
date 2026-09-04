'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Kyc = { id: string; full_name: string | null; id_number: string | null; status: string; created_at: string };

export function KycReview({ initial }: { initial: Kyc[] }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Kyc[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  async function review(id: string, approve: boolean) {
    setBusy(id);
    await supabase.rpc('review_driver_kyc', { p_kyc_id: id, p_approve: approve, p_notes: approve ? 'Approved' : 'Rejected' });
    setRows((r) => r.map((x) => (x.id === id ? { ...x, status: approve ? 'approved' : 'rejected' } : x)));
    setBusy(null);
  }
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Driver KYC</h1>
      {rows.length === 0 ? <p className="text-muted text-sm">No KYC submissions.</p> : (
        <div className="space-y-2">
          {rows.map((k) => (
            <div key={k.id} className="rounded-2xl border border-line bg-card p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[160px]"><p className="font-semibold">{k.full_name ?? 'Unnamed'}</p><p className="text-xs text-muted">ID: {k.id_number ?? '—'}</p></div>
              <span className="text-xs capitalize rounded-full border border-line px-3 py-1">{k.status}</span>
              {k.status === 'submitted' && (
                <div className="flex gap-2">
                  <button onClick={() => review(k.id, true)} disabled={busy === k.id} className="rounded-full bg-brand text-black px-4 py-1.5 text-sm font-semibold">Approve</button>
                  <button onClick={() => review(k.id, false)} disabled={busy === k.id} className="rounded-full border border-line px-4 py-1.5 text-sm text-red-300">Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

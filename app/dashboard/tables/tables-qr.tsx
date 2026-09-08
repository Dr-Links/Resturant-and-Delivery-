'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import QRCode from 'qrcode';

type QR = { token: string; is_active: boolean };
type TableRow = { id: string; label: string; seats: number; status: string; table_qr_codes: QR[] };

export function TablesQR({ restaurantId, tables }: { restaurantId: string; tables: TableRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [origin, setOrigin] = useState('');
  const [dataUrls, setDataUrls] = useState<Record<string, string>>({});

  const [label, setLabel] = useState('');
  const [seats, setSeats] = useState('2');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    (async () => {
      const entries: Record<string, string> = {};
      for (const t of tables) {
        const token = t.table_qr_codes?.[0]?.token;
        if (!token) continue;
        entries[t.id] = await QRCode.toDataURL(`${origin}/t/${token}`, { width: 320, margin: 1 });
      }
      if (!cancelled) setDataUrls(entries);
    })();
    return () => { cancelled = true; };
  }, [origin, tables]);

  async function addTable() {
    if (!label.trim() || adding) return;
    setAdding(true); setErr(null);
    const { data: t, error } = await supabase
      .from('tables')
      .insert({ restaurant_id: restaurantId, label: label.trim(), seats: Number(seats) || 2 })
      .select('id')
      .single();
    if (error || !t) {
      setAdding(false);
      setErr(/duplicate|unique/i.test(error?.message ?? '') ? 'A table with that label already exists.' : 'Could not add the table.');
      return;
    }
    // One permanent QR per table (token auto-generates).
    await supabase.from('table_qr_codes').insert({ table_id: (t as { id: string }).id, restaurant_id: restaurantId });
    setAdding(false); setLabel(''); setSeats('2'); router.refresh();
  }

  async function deleteTable(id: string, lbl: string) {
    if (!confirm(`Delete table ${lbl}? Its QR code will stop working.`)) return;
    await supabase.from('tables').delete().eq('id', id);
    router.refresh();
  }

  const printOne = (lbl: string, dataUrl: string, link: string) => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(
      `<html><head><title>Table ${lbl}</title></head><body style="text-align:center;font-family:sans-serif;padding:40px">
       <h1>Table ${lbl}</h1><img src="${dataUrl}" style="width:320px;height:320px"/>
       <p style="color:#666">${link}</p></body></html>`
    );
    w.document.close(); w.focus(); w.print();
  };

  const rows = useMemo(() => tables, [tables]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Tables & QR codes</h1>
      <p className="text-sm text-muted mb-4">Each table has one permanent QR. Print it once and leave it on the table.</p>

      {/* Add table */}
      <div className="rounded-2xl border border-line bg-card p-4 mb-4 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="text-muted text-xs">Table label</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 12" className="mt-1 block w-28 rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="text-sm">
          <span className="text-muted text-xs">Seats</span>
          <input value={seats} onChange={(e) => setSeats(e.target.value)} type="number" min="1" className="mt-1 block w-20 rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <button onClick={addTable} disabled={adding} className="rounded-full bg-brand text-black px-5 py-2 text-sm font-semibold disabled:opacity-50">
          {adding ? 'Adding…' : 'Add table'}
        </button>
        {err && <p className="w-full text-sm text-red-400">{err}</p>}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted text-sm">No tables yet. Add one above.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {rows.map((t) => {
            const token = t.table_qr_codes?.[0]?.token;
            const link = token ? `${origin}/t/${token}` : '';
            const dataUrl = dataUrls[t.id];
            return (
              <div key={t.id} className="rounded-2xl border border-line bg-card p-4 text-center">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Table {t.label}</p>
                  <span className="text-xs text-muted capitalize">{t.status}</span>
                </div>
                <div className="mt-3 flex items-center justify-center">
                  {dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={dataUrl} alt={`QR for table ${t.label}`} className="w-40 h-40 rounded-lg bg-white p-1" />
                  ) : (
                    <div className="w-40 h-40 rounded-lg bg-ink border border-line flex items-center justify-center text-xs text-muted">
                      {token ? 'Generating…' : 'No QR'}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted break-all">{link}</p>
                <div className="mt-3 flex gap-2">
                  {dataUrl && <button onClick={() => printOne(t.label, dataUrl, link)} className="flex-1 rounded-full border border-line py-2 text-sm">Print</button>}
                  <button onClick={() => deleteTable(t.id, t.label)} className="rounded-full border border-line px-4 py-2 text-sm text-red-300">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

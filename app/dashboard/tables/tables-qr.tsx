'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

type QR = { token: string; is_active: boolean };
type TableRow = { id: string; label: string; seats: number; status: string; table_qr_codes: QR[] };

export function TablesQR({ tables }: { tables: TableRow[] }) {
  const [origin, setOrigin] = useState('');
  const [dataUrls, setDataUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    (async () => {
      const entries: Record<string, string> = {};
      for (const t of tables) {
        const token = t.table_qr_codes?.[0]?.token;
        if (!token) continue;
        const url = `${origin}/t/${token}`;
        entries[t.id] = await QRCode.toDataURL(url, { width: 320, margin: 1 });
      }
      if (!cancelled) setDataUrls(entries);
    })();
    return () => {
      cancelled = true;
    };
  }, [origin, tables]);

  const printOne = (label: string, dataUrl: string, link: string) => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(
      `<html><head><title>Table ${label}</title></head><body style="text-align:center;font-family:sans-serif;padding:40px">
       <h1>Table ${label}</h1><img src="${dataUrl}" style="width:320px;height:320px"/>
       <p style="color:#666">${link}</p></body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  };

  const rows = useMemo(() => tables, [tables]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Tables & QR codes</h1>
      <p className="text-sm text-muted mb-4">Each table has one permanent QR. Print it once and leave it on the table.</p>

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
              {dataUrl && (
                <button
                  onClick={() => printOne(t.label, dataUrl, link)}
                  className="mt-3 w-full rounded-full border border-line py-2 text-sm"
                >
                  Print
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

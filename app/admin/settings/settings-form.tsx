'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Config = {
  base_fee: number; per_km: number; commission_rate: number;
  cash_owed_limit: number; warn_threshold: number; offer_timeout_seconds: number;
  three_d_enabled: boolean;
};

export function SettingsForm({ initial }: { initial: Config }) {
  const supabase = createClient();
  const [c, setC] = useState<Config>({
    base_fee: Number(initial.base_fee ?? 500),
    per_km: Number(initial.per_km ?? 150),
    commission_rate: Number(initial.commission_rate ?? 0.2),
    cash_owed_limit: Number(initial.cash_owed_limit ?? 5000),
    warn_threshold: Number(initial.warn_threshold ?? 3000),
    offer_timeout_seconds: Number(initial.offer_timeout_seconds ?? 45),
    three_d_enabled: initial.three_d_enabled !== false,
  });
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof Config>(k: K, v: number) { setC((p) => ({ ...p, [k]: v })); }

  async function save() {
    setBusy(true); setErr(null);
    const { error } = await supabase.from('platform_config').update({
      base_fee: c.base_fee, per_km: c.per_km, commission_rate: c.commission_rate,
      cash_owed_limit: c.cash_owed_limit, warn_threshold: c.warn_threshold,
      offer_timeout_seconds: c.offer_timeout_seconds, three_d_enabled: c.three_d_enabled,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  const Row = ({ label, hint, value, onChange, suffix }: { label: string; hint?: string; value: number; onChange: (n: number) => void; suffix?: string }) => (
    <div className="flex items-center justify-between gap-3 border-b border-line py-3">
      <div><p className="text-sm font-medium">{label}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div>
      <div className="flex items-center gap-2">
        <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className="w-28 rounded-xl bg-ink border border-line px-3 py-2 text-right outline-none focus:border-brand" />
        {suffix && <span className="text-xs text-muted w-8">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-1">Platform settings</h1>
      <p className="text-sm text-muted mb-4">Delivery pricing and settlement rules for the marketplace. (Secret API keys live under Integrations.)</p>

      {/* Global 3D/AR feature switch */}
      <div className="rounded-2xl border border-line bg-card p-4 mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">3D / AR dish view</p>
          <p className="text-xs text-muted mt-0.5">Platform-wide. When off, customers see dish photos only (no 3D viewer) across every restaurant. Turn on to show 3D/AR where models exist.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={c.three_d_enabled}
          onClick={() => setC((p) => ({ ...p, three_d_enabled: !p.three_d_enabled }))}
          className={'relative h-7 w-12 shrink-0 rounded-full transition-colors ' + (c.three_d_enabled ? 'bg-brand' : 'bg-line')}
        >
          <span className={'absolute top-1 h-5 w-5 rounded-full bg-white transition-all ' + (c.three_d_enabled ? 'left-6' : 'left-1')} />
        </button>
      </div>

      <div className="rounded-2xl border border-line bg-card p-4">
        <Row label="Base delivery fee" hint="Charged on every delivery" value={c.base_fee} onChange={(v) => set('base_fee', v)} suffix="XAF" />
        <Row label="Per-kilometer fee" hint="Added per km of distance" value={c.per_km} onChange={(v) => set('per_km', v)} suffix="XAF" />
        <Row label="Commission rate" hint="Platform's cut of each delivery (e.g. 0.20 = 20%)" value={c.commission_rate} onChange={(v) => set('commission_rate', v)} suffix="×" />
        <Row label="Cash owed limit" hint="Driver is blocked from new jobs above this" value={c.cash_owed_limit} onChange={(v) => set('cash_owed_limit', v)} suffix="XAF" />
        <Row label="Warn threshold" hint="Warn the driver to settle above this" value={c.warn_threshold} onChange={(v) => set('warn_threshold', v)} suffix="XAF" />
        <Row label="Offer timeout" hint="Seconds before an offer moves to the next driver" value={c.offer_timeout_seconds} onChange={(v) => set('offer_timeout_seconds', v)} suffix="s" />
      </div>

      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      <button onClick={save} disabled={busy} className="mt-4 rounded-full bg-brand text-black px-6 py-2.5 font-semibold disabled:opacity-50">{saved ? 'Saved ✓' : busy ? 'Saving…' : 'Save settings'}</button>

      <div className="mt-6 rounded-2xl border border-line bg-card p-4 text-sm text-muted">
        <p className="font-semibold text-white mb-1">Preview</p>
        A {5} km delivery would cost <span className="text-brand font-semibold">{Math.round(c.base_fee + c.per_km * 5)} XAF</span> — driver keeps {Math.round((c.base_fee + c.per_km * 5) * (1 - c.commission_rate))}, platform takes {Math.round((c.base_fee + c.per_km * 5) * c.commission_rate)}.
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';

type Settings = { mode: 'flat' | 'zones'; flat_fee: number; own_delivery_enabled: boolean; saas_delivery_enabled: boolean };
type Zone = { id: string; name: string; fee: number; sort_order: number };
type Driver = { id: string; name: string; phone: string | null; vehicle: string | null; status: string };

export function DeliverySettings({ restaurantId, currency, settings, zones, drivers }: {
  restaurantId: string; currency: string; settings: Settings; zones: Zone[]; drivers: Driver[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Settings['mode']>(settings.mode);
  const [flatFee, setFlatFee] = useState<number>(Number(settings.flat_fee));
  const [own, setOwn] = useState(settings.own_delivery_enabled);
  const [saas, setSaas] = useState(settings.saas_delivery_enabled);
  const [zoneName, setZoneName] = useState(''); const [zoneFee, setZoneFee] = useState<number>(0);
  const [dName, setDName] = useState(''); const [dPhone, setDPhone] = useState(''); const [dVehicle, setDVehicle] = useState('');
  const [saved, setSaved] = useState(false);

  async function saveSettings() {
    await supabase.from('restaurant_delivery_settings').upsert({
      restaurant_id: restaurantId, mode, flat_fee: flatFee, own_delivery_enabled: own, saas_delivery_enabled: saas,
    });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  async function addZone() { if (!zoneName.trim()) return; await supabase.from('delivery_zones').insert({ restaurant_id: restaurantId, name: zoneName, fee: zoneFee, sort_order: zones.length + 1 }); setZoneName(''); setZoneFee(0); router.refresh(); }
  async function updateZoneFee(id: string, fee: number) { await supabase.from('delivery_zones').update({ fee }).eq('id', id); router.refresh(); }
  async function delZone(id: string) { await supabase.from('delivery_zones').delete().eq('id', id); router.refresh(); }
  async function addDriver() { if (!dName.trim()) return; await supabase.from('restaurant_drivers').insert({ restaurant_id: restaurantId, name: dName, phone: dPhone || null, vehicle: dVehicle || null }); setDName(''); setDPhone(''); setDVehicle(''); router.refresh(); }
  async function toggleDriver(d: Driver) { await supabase.from('restaurant_drivers').update({ status: d.status === 'active' ? 'inactive' : 'active' }).eq('id', d.id); router.refresh(); }
  async function delDriver(id: string) { if (!confirm('Remove driver?')) return; await supabase.from('restaurant_drivers').delete().eq('id', id); router.refresh(); }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Delivery</h1>
        <p className="text-sm text-muted">Your own drivers and pricing. This is separate from the SaaS delivery marketplace.</p>
      </div>

      {/* Pricing */}
      <section className="rounded-2xl border border-line bg-card p-4">
        <p className="font-semibold mb-3">Pricing</p>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode('flat')} className={'rounded-full px-4 py-2 text-sm border ' + (mode === 'flat' ? 'bg-brand text-black border-brand' : 'border-line text-muted')}>One price everywhere</button>
          <button onClick={() => setMode('zones')} className={'rounded-full px-4 py-2 text-sm border ' + (mode === 'zones' ? 'bg-brand text-black border-brand' : 'border-line text-muted')}>Price by location</button>
        </div>

        {mode === 'flat' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{currency}</span>
            <input type="number" value={flatFee} onChange={(e) => setFlatFee(parseFloat(e.target.value) || 0)} className="w-32 rounded-xl bg-ink border border-line px-3 py-2 outline-none focus:border-brand" />
            <span className="text-sm text-muted">per delivery</span>
          </div>
        ) : (
          <div className="space-y-2">
            {zones.map((z) => (
              <div key={z.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm">{z.name}</span>
                <span className="text-xs text-muted">{currency}</span>
                <input type="number" defaultValue={Number(z.fee)} onBlur={(e) => { const v = parseFloat(e.target.value); if (v !== Number(z.fee)) updateZoneFee(z.id, v); }} className="w-28 rounded-xl bg-ink border border-line px-3 py-2 text-right outline-none focus:border-brand" />
                <button onClick={() => delZone(z.id)} className="text-xs text-red-300 px-2">✕</button>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2 border-t border-line">
              <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="Zone (e.g. Molyko)" className="flex-1 rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
              <input type="number" value={zoneFee} onChange={(e) => setZoneFee(parseFloat(e.target.value) || 0)} placeholder="Fee" className="w-24 rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
              <button onClick={addZone} className="rounded-full border border-line px-4 py-2 text-sm">Add</button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} /> Offer my own drivers</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={saas} onChange={(e) => setSaas(e.target.checked)} /> Also offer SaaS drivers (Phase 5)</label>
        </div>
        <button onClick={saveSettings} className="mt-4 rounded-full bg-brand text-black px-6 py-2.5 font-semibold">{saved ? 'Saved ✓' : 'Save pricing'}</button>
      </section>

      {/* Drivers */}
      <section className="rounded-2xl border border-line bg-card p-4">
        <p className="font-semibold mb-3">My drivers</p>
        <div className="space-y-2">
          {drivers.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 border-b border-line pb-2">
              <div className="flex-1 min-w-[140px]"><p className="font-medium">{d.name}</p><p className="text-xs text-muted">{d.phone ?? '—'} · {d.vehicle ?? '—'}</p></div>
              <button onClick={() => toggleDriver(d)} className={'rounded-full px-3 py-1.5 text-xs border ' + (d.status === 'active' ? 'bg-brand/15 text-brand border-brand/40' : 'border-line text-muted')}>{d.status}</button>
              <button onClick={() => delDriver(d.id)} className="text-xs text-red-300">Remove</button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <input value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Driver name" className="flex-1 min-w-[140px] rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          <input value={dPhone} onChange={(e) => setDPhone(e.target.value)} placeholder="Phone" className="w-36 rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          <input value={dVehicle} onChange={(e) => setDVehicle(e.target.value)} placeholder="Vehicle" className="w-32 rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          <button onClick={addDriver} className="rounded-full border border-line px-4 py-2 text-sm">Add driver</button>
        </div>
      </section>
    </div>
  );
}

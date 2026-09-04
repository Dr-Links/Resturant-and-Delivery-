'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';
import { TrackingMap } from './tracking-map';

type Active = { id: string; status: string; price: number; est_minutes: number; dest_address: string | null };
type Past = { id: string; status: string; price: number; dest_address: string | null; created_at: string; assigned_driver_id: string | null };
type Address = { id: string; label: string; address: string; lat: number | null; lng: number | null };
type Tracking = {
  status: string; code: string | null; price: number; est_minutes: number;
  dest_lat: number | null; dest_lng: number | null; driver_name: string | null; driver_phone: string | null;
  driver_rating: number | null; driver_lat: number | null; driver_lng: number | null; error?: string;
};

const ITEMS = ['food', 'package', 'document', 'grocery', 'other'];
const STEPS = ['searching', 'assigned', 'arriving', 'picked_up', 'in_transit', 'arrived', 'delivered'];

export function DeliveryClient({ userEmail, active, past, addresses }: {
  userEmail: string; active: Active | null; past: Past[]; addresses: Address[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [pickup, setPickup] = useState(''); const [dest, setDest] = useState('');
  const [pLat, setPLat] = useState<number | null>(null); const [pLng, setPLng] = useState<number | null>(null);
  const [itemType, setItemType] = useState('package'); const [info, setInfo] = useState(''); const [notes, setNotes] = useState('');
  const [pay, setPay] = useState('cash'); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [rating, setRating] = useState(0); const [rated, setRated] = useState<string | null>(null);

  const loadTracking = useCallback(async () => {
    if (!active) return;
    const { data } = await supabase.rpc('get_delivery_tracking', { p_request_id: active.id });
    if (data && !(data as any).error) setTracking(data as Tracking);
  }, [active, supabase]);

  useEffect(() => { loadTracking(); const t = setInterval(loadTracking, 5000); return () => clearInterval(t); }, [loadTracking]);

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition((pos) => { setPLat(pos.coords.latitude); setPLng(pos.coords.longitude); if (!pickup) setPickup('My current location'); });
  }

  async function createRequest() {
    if (!pickup || !dest || busy) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.rpc('create_delivery_request', {
      p_pickup_address: pickup, p_pickup_lat: pLat, p_pickup_lng: pLng,
      p_dest_address: dest, p_dest_lat: null, p_dest_lng: null,
      p_item_type: itemType, p_package_info: info || null, p_package_photo_url: null,
      p_special_instructions: notes || null, p_payment_method: pay, p_restaurant_id: null, p_order_id: null,
    });
    setBusy(false);
    if (error || (data as any)?.error) { setErr('Could not create the request.'); return; }
    router.refresh();
  }

  async function signOut() { await supabase.auth.signOut(); router.refresh(); }
  async function addAddress(label: string, address: string) { if (!address) return; await supabase.from('customer_addresses').insert({ label, address }); router.refresh(); }
  async function rateDriver(reqId: string, stars: number) { await supabase.rpc('rate_driver', { p_request_id: reqId, p_rating: stars, p_review: null }); setRated(reqId); }
  async function cancelActive() { if (!active) return; await supabase.from('delivery_requests').update({ status: 'cancelled' }).eq('id', active.id); router.refresh(); }

  // ---- Active delivery view ----
  if (active) {
    const t = tracking;
    const stepIdx = t ? STEPS.indexOf(t.status) : 0;
    return (
      <main className="min-h-screen max-w-lg mx-auto px-5 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Your delivery</h1>
          <button onClick={signOut} className="text-xs text-muted">Sign out</button>
        </div>

        <TrackingMap
          driver={t?.driver_lat != null && t?.driver_lng != null ? { lat: t.driver_lat, lng: t.driver_lng } : null}
          dest={t?.dest_lat != null && t?.dest_lng != null ? { lat: t.dest_lat, lng: t.dest_lng } : null}
        />

        <div className="mt-4 rounded-2xl border border-line bg-card p-4">
          <p className="text-sm text-muted capitalize">Status: <span className="text-white font-semibold">{(t?.status ?? active.status).replace('_', ' ')}</span></p>
          <div className="mt-3 flex gap-1">
            {STEPS.slice(0, 7).map((s, i) => (<div key={s} className={'h-1.5 flex-1 rounded-full ' + (i <= stepIdx ? 'bg-brand' : 'bg-line')} />))}
          </div>
          {t?.driver_name && (
            <div className="mt-4 flex items-center justify-between">
              <div><p className="font-semibold">{t.driver_name} <span className="text-brand text-sm">{t.driver_rating ? `★${t.driver_rating}` : ''}</span></p>{t.driver_phone && <p className="text-xs text-muted">{t.driver_phone}</p>}</div>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-brand bg-brand/10 p-4 text-center">
          <p className="text-xs text-muted">Give this code to the driver on arrival</p>
          <p className="text-4xl font-bold tracking-[0.3em] text-brand mt-1">{t?.code ?? '····'}</p>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">Fee {money(active.price)} · ~{active.est_minutes} min</span>
          {['searching', 'assigned'].includes(t?.status ?? active.status) && <button onClick={cancelActive} className="text-red-300">Cancel</button>}
        </div>
      </main>
    );
  }

  // ---- New request + history ----
  return (
    <main className="min-h-screen max-w-lg mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Send a delivery</h1>
        <button onClick={signOut} className="text-xs text-muted">Sign out</button>
      </div>

      <div className="rounded-2xl border border-line bg-card p-4 space-y-3">
        <div>
          <input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Pickup address" className="w-full rounded-xl bg-ink border border-line px-4 py-3 outline-none focus:border-brand" />
          <button onClick={useMyLocation} className="mt-1 text-xs text-brand">📍 Use my current location {pLat ? '✓' : ''}</button>
        </div>
        <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Destination address" className="w-full rounded-xl bg-ink border border-line px-4 py-3 outline-none focus:border-brand" />
        {addresses.length > 0 && (
          <div className="flex flex-wrap gap-2">{addresses.map((a) => (<button key={a.id} onClick={() => setDest(a.address)} className="rounded-full border border-line px-3 py-1 text-xs">{a.label}</button>))}</div>
        )}
        <div className="flex gap-2">
          <select value={itemType} onChange={(e) => setItemType(e.target.value)} className="flex-1 rounded-xl bg-ink border border-line px-3 py-2 text-sm capitalize">
            {ITEMS.map((i) => (<option key={i} value={i}>{i}</option>))}
          </select>
          <select value={pay} onChange={(e) => setPay(e.target.value)} className="rounded-xl bg-ink border border-line px-3 py-2 text-sm">
            <option value="cash">Cash</option><option value="momo">Mobile money</option>
          </select>
        </div>
        <input value={info} onChange={(e) => setInfo(e.target.value)} placeholder="What's being sent? (optional)" className="w-full rounded-xl bg-ink border border-line px-4 py-2 text-sm outline-none focus:border-brand" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special instructions (optional)" className="w-full rounded-xl bg-ink border border-line px-4 py-2 text-sm outline-none focus:border-brand" />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button onClick={createRequest} disabled={busy || !pickup || !dest} className="w-full rounded-full bg-brand text-black py-3 font-semibold disabled:opacity-50">{busy ? 'Finding a driver…' : 'Request delivery'}</button>
      </div>

      {past.length > 0 && (
        <section className="mt-6">
          <p className="text-sm font-semibold mb-2">Recent</p>
          <div className="space-y-2">
            {past.map((p) => (
              <div key={p.id} className="rounded-2xl border border-line bg-card p-3 flex items-center justify-between">
                <div><p className="text-sm">{p.dest_address ?? 'Delivery'}</p><p className="text-xs text-muted capitalize">{p.status.replace('_', ' ')} · {money(p.price)}</p></div>
                {p.status === 'delivered' && p.assigned_driver_id && (
                  rated === p.id ? <span className="text-xs text-brand">Thanks!</span> :
                  <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => (<button key={n} onClick={() => rateDriver(p.id, n)} className="text-lg text-zinc-600 hover:text-brand">★</button>))}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-6 text-center text-xs text-muted">Signed in as {userEmail}</p>
    </main>
  );
}

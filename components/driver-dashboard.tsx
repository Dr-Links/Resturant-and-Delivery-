'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';

type Driver = { id: string; status: string; rating_avg: number | null; rating_count: number | null };
type View = 'loading' | 'signedout' | 'notdriver' | 'ready';

export function DriverDashboard() {
  const supabase = createClient();

  const [view, setView] = useState<View>('loading');
  const [driver, setDriver] = useState<Driver | null>(null);
  const [balance, setBalance] = useState(0);

  // sign-in
  const [email, setEmail] = useState('driver@demo.cm');
  const [password, setPassword] = useState('');
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // settlement
  const [provider, setProvider] = useState<'mtn' | 'orange'>('mtn');
  const [phone, setPhone] = useState('');
  const [settleBusy, setSettleBusy] = useState(false);
  const [settleMsg, setSettleMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setView('signedout'); return; }
    const { data: d } = await supabase
      .from('platform_drivers')
      .select('id, status, rating_avg, rating_count')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (!d) { setView('notdriver'); return; }
    setDriver(d as Driver);
    const { data: bal } = await supabase.rpc('driver_balance', { p_driver_id: (d as Driver).id });
    setBalance(Number(bal ?? 0));
    setView('ready');
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true); setAuthErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (error) { setAuthErr(error.message); return; }
    setView('loading');
    load();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setDriver(null);
    setView('signedout');
  }

  async function settle() {
    if (balance <= 0 || settleBusy) return;
    if (phone.trim().length < 6) { setSettleMsg('Enter your mobile money number.'); return; }
    setSettleBusy(true); setSettleMsg(null);
    try {
      const res = await fetch('/api/driver/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: balance, phone: phone.trim(), provider }),
      });
      const data = (await res.json()) as { ok?: boolean; balance?: number; error?: string; live?: boolean };
      if (!res.ok || !data.ok) {
        setSettleMsg(data.error === 'gateway_declined' ? 'Payment was declined. Try again.' : 'Could not settle. Please try again.');
        return;
      }
      setBalance(Number(data.balance ?? 0));
      setSettleMsg(data.live ? 'Settlement submitted.' : 'Settlement recorded (test mode).');
    } catch {
      setSettleMsg('Network error. Please try again.');
    } finally {
      setSettleBusy(false);
    }
  }

  if (view === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-brand" />
      </main>
    );
  }

  if (view === 'signedout') {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <form onSubmit={signIn} className="w-full max-w-sm rounded-3xl border border-line bg-card p-6">
          <h1 className="text-2xl font-bold">Driver sign in</h1>
          <p className="mt-1 text-sm text-muted">Manage deliveries and settle your balance.</p>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" className="mt-4 w-full rounded-xl bg-ink border border-line px-4 py-3 outline-none focus:border-brand" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" className="mt-3 w-full rounded-xl bg-ink border border-line px-4 py-3 outline-none focus:border-brand" />
          {authErr && <p className="mt-3 text-sm text-red-400">{authErr}</p>}
          <button type="submit" disabled={authBusy} className="mt-5 w-full rounded-full bg-brand text-black py-3 font-semibold disabled:opacity-60">{authBusy ? '…' : 'Sign in'}</button>
        </form>
      </main>
    );
  }

  if (view === 'notdriver') {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-2xl font-bold">Not a driver account</h1>
          <p className="mt-2 text-muted">This account isn’t registered as a platform driver.</p>
          <button onClick={signOut} className="mt-5 rounded-full border border-line px-5 py-2 text-sm">Sign out</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen max-w-lg mx-auto px-5 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Driver dashboard</h1>
          {driver && <p className="text-sm text-muted">★ {driver.rating_avg ?? '—'} ({driver.rating_count ?? 0}) · {driver.status}</p>}
        </div>
        <button onClick={signOut} className="text-xs text-muted">Sign out</button>
      </div>

      <section className="mt-6 rounded-2xl border border-line bg-card p-5">
        <p className="text-sm text-muted">Owed to platform</p>
        <p className="mt-1 text-4xl font-bold">{money(balance, 'XAF')}</p>

        {balance <= 0 ? (
          <p className="mt-4 text-sm text-brand">You’re all settled up. 🎉</p>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {(['mtn', 'orange'] as const).map((p) => (
                <button key={p} type="button" onClick={() => setProvider(p)}
                  className={'rounded-xl border px-4 py-3 font-semibold ' + (provider === p ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-ink')}>
                  {p === 'mtn' ? 'MTN MoMo' : 'Orange Money'}
                </button>
              ))}
            </div>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Mobile money number"
              className="w-full rounded-xl bg-ink border border-line px-4 py-3 outline-none focus:border-brand" />
            <button onClick={settle} disabled={settleBusy}
              className="w-full rounded-full bg-brand text-black py-3 font-semibold disabled:opacity-60">
              {settleBusy ? 'Processing…' : `Settle ${money(balance, 'XAF')}`}
            </button>
          </div>
        )}
        {settleMsg && <p className="mt-3 text-sm text-muted">{settleMsg}</p>}
      </section>
    </main>
  );
}

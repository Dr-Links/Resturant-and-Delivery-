'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function DeliveryAuth() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const res = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
    setBusy(false);
    if (res.error) { setErr(res.error.message); return; }
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-line bg-card p-6">
        <h1 className="text-2xl font-bold">{mode === 'in' ? 'Sign in' : 'Create account'}</h1>
        <p className="mt-1 text-sm text-muted">Send a package or order delivery.</p>
        {mode === 'up' && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="mt-4 w-full rounded-xl bg-ink border border-line px-4 py-3 outline-none focus:border-brand" />}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="mt-3 w-full rounded-xl bg-ink border border-line px-4 py-3 outline-none focus:border-brand" autoComplete="email" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="mt-3 w-full rounded-xl bg-ink border border-line px-4 py-3 outline-none focus:border-brand" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
        <button type="submit" disabled={busy} className="mt-5 w-full rounded-full bg-brand text-black py-3 font-semibold disabled:opacity-60">{busy ? '…' : mode === 'in' ? 'Sign in' : 'Sign up'}</button>
        <button type="button" onClick={() => setMode(mode === 'in' ? 'up' : 'in')} className="mt-3 w-full text-sm text-muted">{mode === 'in' ? "No account? Sign up" : 'Have an account? Sign in'}</button>
      </form>
    </main>
  );
}

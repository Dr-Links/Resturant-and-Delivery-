'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@demo.cm');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    // Route platform admins to /admin; everyone else to the restaurant dashboard.
    const userId = data.user?.id;
    let destination = '/dashboard';
    if (userId) {
      const { data: admin } = await supabase
        .from('platform_admins')
        .select('profile_id')
        .eq('profile_id', userId)
        .maybeSingle();
      if (admin) destination = '/admin';
    }
    setBusy(false);
    router.push(destination);
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={signIn} className="w-full max-w-sm rounded-3xl border border-line bg-card p-6">
        <h1 className="text-2xl font-bold">Staff sign in</h1>
        <p className="mt-1 text-sm text-muted">Owners, managers and staff.</p>

        <label className="block mt-5 text-sm text-muted">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-xl bg-ink border border-line px-4 py-3 outline-none focus:border-brand"
          placeholder="you@restaurant.cm"
          autoComplete="email"
        />

        <label className="block mt-4 text-sm text-muted">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl bg-ink border border-line px-4 py-3 outline-none focus:border-brand"
          placeholder="••••••••"
          autoComplete="current-password"
        />

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-full bg-brand text-black py-3 font-semibold disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="mt-4 text-xs text-muted">Demo owner: owner@demo.cm · password set during setup.</p>
      </form>
    </main>
  );
}

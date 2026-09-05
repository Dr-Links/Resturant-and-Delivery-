'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Phase = 'checking' | 'paid' | 'failed';

function ReturnInner() {
  const ref = useSearchParams().get('ref');
  const [phase, setPhase] = useState<Phase>('checking');

  useEffect(() => {
    if (!ref) {
      setPhase('failed');
      return;
    }
    let active = true;
    const deadline = Date.now() + 90_000;

    async function check() {
      try {
        const res = await fetch(`/api/pay/status?ref=${ref}`);
        const data = (await res.json()) as { status?: string };
        if (!active) return;
        if (data.status === 'succeeded') return setPhase('paid');
        if (data.status === 'failed' || data.status === 'cancelled') return setPhase('failed');
      } catch {
        // keep trying
      }
      if (active && Date.now() < deadline) setTimeout(check, 3000);
      else if (active) setPhase('failed');
    }
    check();
    return () => {
      active = false;
    };
  }, [ref]);

  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="text-center max-w-sm">
        {phase === 'checking' && (
          <>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-line border-t-brand" />
            <p className="mt-4 font-semibold">Confirming your payment…</p>
          </>
        )}
        {phase === 'paid' && (
          <>
            <div className="mx-auto h-14 w-14 rounded-full bg-brand/15 border border-brand flex items-center justify-center text-brand text-3xl">✓</div>
            <h1 className="mt-3 text-2xl font-bold">Payment received</h1>
            <p className="text-muted mt-1">You can return to your table screen.</p>
          </>
        )}
        {phase === 'failed' && (
          <>
            <h1 className="text-2xl font-bold">Payment not confirmed</h1>
            <p className="text-muted mt-1">If you were charged, it will reconcile shortly. Otherwise try again from your table.</p>
          </>
        )}
      </div>
    </main>
  );
}

export default function PayReturnPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <ReturnInner />
    </Suspense>
  );
}

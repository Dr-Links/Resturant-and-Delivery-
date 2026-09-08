'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { money } from '@/lib/format';

type Provider = 'mtn' | 'orange' | 'fapshi';
type Phase = 'choose' | 'processing' | 'paid' | 'failed';

// Fapshi covers both MTN + Orange with one gateway (auto-detects the network),
// so it's the default; the direct MTN/Orange options remain for direct accounts.
const PROVIDERS: { key: Provider; label: string }[] = [
  { key: 'fapshi', label: 'MTN / Orange' },
  { key: 'mtn', label: 'MTN (direct)' },
  { key: 'orange', label: 'Orange (direct)' },
];
const NEEDS_PHONE: Provider[] = ['mtn', 'fapshi'];

interface PayOrderProps {
  orderId: string;
  orderNumber: number;
  amount: number;
  currency: string;
  onPaid: () => void;
  onPayLater: () => void;
  paymentQrUrl?: string | null;
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000;

export function PayOrder({ orderId, orderNumber, amount, currency, onPaid, onPayLater, paymentQrUrl }: PayOrderProps) {
  // Scan-to-pay (static QR) works with or without the online gateway, so it's the
  // default whenever the restaurant has set a payment QR.
  const [method, setMethod] = useState<'qr' | 'momo'>(paymentQrUrl ? 'qr' : 'momo');
  const [provider, setProvider] = useState<Provider>('fapshi');
  const [phone, setPhone] = useState('');
  const [phase, setPhase] = useState<Phase>('choose');
  const [error, setError] = useState<string | null>(null);
  const externalRef = useRef<string | null>(null);
  const startedAt = useRef<number>(0);

  const poll = useCallback(async () => {
    if (!externalRef.current) return;
    if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
      setPhase('failed');
      setError('Payment timed out. Please try again.');
      return;
    }
    try {
      const res = await fetch(`/api/pay/status?ref=${externalRef.current}`);
      const data = (await res.json()) as { status?: string };
      if (data.status === 'succeeded') {
        setPhase('paid');
        return;
      }
      if (data.status === 'failed' || data.status === 'cancelled') {
        setPhase('failed');
        setError('The payment did not go through.');
        return;
      }
    } catch {
      // transient — keep polling
    }
    setTimeout(poll, POLL_INTERVAL_MS);
  }, []);

  useEffect(() => {
    if (phase === 'paid') onPaid();
  }, [phase, onPaid]);

  async function pay() {
    setError(null);
    if (NEEDS_PHONE.includes(provider) && phone.trim().length < 6) {
      setError('Enter the phone number to receive the payment prompt.');
      return;
    }
    setPhase('processing');
    try {
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, provider, phone: phone.trim() || undefined }),
      });
      const data = (await res.json()) as { externalRef?: string; redirectUrl?: string | null; error?: string };
      if (!res.ok || data.error || !data.externalRef) {
        setPhase('failed');
        setError('Could not start the payment. Please try again.');
        return;
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      externalRef.current = data.externalRef;
      startedAt.current = Date.now();
      setTimeout(poll, POLL_INTERVAL_MS);
    } catch {
      setPhase('failed');
      setError('Network error. Please try again.');
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 max-w-md mx-auto">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Pay for order #{orderNumber}</h1>
        <p className="mt-1 text-brand text-3xl font-bold">{money(amount, currency)}</p>
      </div>

      {phase === 'processing' && (
        <div className="mt-8 rounded-2xl border border-line bg-card p-6 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-line border-t-brand" />
          <p className="mt-4 font-semibold">Waiting for confirmation…</p>
          <p className="text-sm text-muted mt-1">
            {provider === 'orange' ? 'Complete the payment, then return here.' : 'Approve the prompt on your phone.'}
          </p>
        </div>
      )}

      {phase === 'paid' && (
        <div className="mt-8 rounded-2xl border border-brand bg-card p-6 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-brand/15 border border-brand flex items-center justify-center text-brand text-2xl">✓</div>
          <p className="mt-3 font-semibold">Payment received</p>
        </div>
      )}

      {(phase === 'choose' || phase === 'failed') && (
        <div className="mt-8 space-y-4">
          {/* Method tabs — only when a payment QR is configured */}
          {paymentQrUrl && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMethod('qr')}
                className={'rounded-2xl border py-3 text-sm font-semibold ' + (method === 'qr' ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-card')}>
                Scan QR to pay
              </button>
              <button type="button" onClick={() => setMethod('momo')}
                className={'rounded-2xl border py-3 text-sm font-semibold ' + (method === 'momo' ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-card')}>
                Mobile money
              </button>
            </div>
          )}

          {method === 'qr' && paymentQrUrl ? (
            <div className="rounded-2xl border border-line bg-card p-4 text-center">
              <p className="text-sm text-muted mb-2">Scan to pay {money(amount, currency)}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={paymentQrUrl} alt="Payment QR code" className="mx-auto w-56 h-56 rounded-lg bg-white p-2 object-contain" />
              <p className="text-xs text-muted mt-2">Scan with your mobile money or bank app, complete the payment, then tap below.</p>
              {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
              <button onClick={onPaid} className="mt-3 w-full rounded-full bg-brand text-black py-3 font-semibold">I&apos;ve paid</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setProvider(p.key)}
                    className={
                      'rounded-2xl border px-2 py-4 text-sm font-semibold ' +
                      (provider === p.key ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-card')
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="Mobile money number (e.g. 6XXXXXXXX)"
                className="w-full rounded-xl bg-ink border border-line px-4 py-3 outline-none focus:border-brand"
              />

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button onClick={pay} className="w-full rounded-full bg-brand text-black py-4 font-semibold">
                Pay {money(amount, currency)}
              </button>
            </>
          )}

          <button onClick={onPayLater} className="w-full rounded-full border border-line py-3 text-sm text-muted">
            Pay at the counter instead
          </button>
        </div>
      )}
    </main>
  );
}

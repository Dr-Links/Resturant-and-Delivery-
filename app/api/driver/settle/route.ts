import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase/server';
import { resolveCollectionsProvider } from '@/lib/payments/resolve';

export const runtime = 'nodejs';

const Body = z.object({
  amount: z.number().positive(),
  phone: z.string().trim().min(6).max(20),
  provider: z.enum(['mtn', 'orange']).default('mtn'),
});

// POST /api/driver/settle — a platform driver clears their owed commission by
// mobile money. We collect via the gateway, then record the settlement through
// settle_driver_balance (which authorises the caller as a driver via auth.uid()).
// NOTE: live MoMo collection is async (USSD approval). This route records the
// settlement once the gateway accepts the request; a production build should
// confirm via the provider webhook before finalising.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const { amount, phone, provider } = parsed.data;

  const supabase = getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const externalRef = randomUUID();
  const gateway = await resolveCollectionsProvider(provider);
  try {
    const init = await gateway.requestToPay({
      externalRef,
      amount,
      currency: process.env.MOMO_CURRENCY ?? 'XAF',
      phone,
      orderId: externalRef,
      description: 'Driver settlement',
    });
    if (init.status === 'failed') {
      return NextResponse.json({ error: 'gateway_declined' }, { status: 402 });
    }
  } catch {
    return NextResponse.json({ error: 'gateway_error' }, { status: 502 });
  }

  const { data, error } = await supabase.rpc('settle_driver_balance', {
    p_amount: amount,
    p_method: `momo:${provider}`,
    p_reference: externalRef,
  });
  const result = data as { ok?: boolean; balance?: number; error?: string } | null;
  if (error || !result || result.error) {
    return NextResponse.json({ error: result?.error ?? 'settle_failed' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, balance: result.balance, reference: externalRef, live: gateway.live });
}

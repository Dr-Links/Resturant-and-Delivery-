import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerAnon, getAdminSupabase, hasAdmin } from '@/lib/supabase/admin';
import { resolveCollectionsProvider } from '@/lib/payments/resolve';

export const runtime = 'nodejs';

const Body = z.object({
  orderId: z.string().uuid(),
  provider: z.enum(['mtn', 'orange', 'fapshi']),
  phone: z.string().trim().min(6).max(20).optional(),
});

// POST /api/pay — open a payment intent for an order and kick off the gateway.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const { orderId, provider, phone } = parsed.data;

  // 1) Open the intent (amount is computed server-side inside the RPC).
  const db = getServerAnon();
  const { data, error } = await db.rpc('create_order_payment', {
    p_order_id: orderId,
    p_provider: provider,
    p_phone: phone ?? null,
  });
  const intent = data as
    | { payment_id: string; external_ref: string; amount: number; currency: string; error?: string }
    | null;
  if (error || !intent || intent.error) {
    return NextResponse.json({ error: intent?.error ?? 'could_not_create_payment' }, { status: 400 });
  }

  // 2) Ask the gateway to collect (MTN pushes a USSD prompt; Orange returns a URL).
  const origin = new URL(req.url).origin;
  const gateway = await resolveCollectionsProvider(provider);
  let init;
  try {
    init = await gateway.requestToPay({
      externalRef: intent.external_ref,
      amount: Number(intent.amount),
      currency: intent.currency,
      phone,
      orderId,
      description: 'Order payment',
      returnUrl: `${origin}/pay/return?ref=${intent.external_ref}`,
      notifyUrl: `${origin}/api/pay/webhook/${provider}`,
    });
  } catch {
    if (hasAdmin()) {
      await getAdminSupabase().rpc('mark_order_payment', {
        p_external_ref: intent.external_ref,
        p_status: 'failed',
        p_provider_ref: null,
        p_message: 'gateway_error',
      });
    }
    return NextResponse.json({ error: 'gateway_error' }, { status: 502 });
  }

  // 3) Record that we've handed off to the gateway (best-effort; status route reconciles).
  if (hasAdmin()) {
    await getAdminSupabase().rpc('mark_order_payment', {
      p_external_ref: intent.external_ref,
      p_status: 'processing',
      p_provider_ref: init.providerRef ?? null,
      p_message: null,
    });
  }

  return NextResponse.json({
    paymentId: intent.payment_id,
    externalRef: intent.external_ref,
    amount: Number(intent.amount),
    currency: intent.currency,
    status: init.status,
    redirectUrl: init.redirectUrl ?? null,
    live: gateway.live,
  });
}

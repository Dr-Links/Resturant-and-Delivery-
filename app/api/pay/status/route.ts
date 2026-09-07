import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSupabase, hasAdmin } from '@/lib/supabase/admin';
import { resolveCollectionsProvider } from '@/lib/payments/resolve';
import type { ProviderName } from '@/lib/payments';

export const runtime = 'nodejs';

const Query = z.string().uuid();

// GET /api/pay/status?ref=<external_ref>
// Reads the intent, asks the gateway for the current status, and reconciles the
// DB (flipping the order to paid on success). Safe to poll from the client.
export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get('ref');
  const parsed = Query.safeParse(ref);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_ref' }, { status: 400 });

  if (!hasAdmin()) {
    // Without a service-role key we cannot read/settle server-side.
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
  }
  const admin = getAdminSupabase();

  const { data: pay } = await admin
    .from('order_payments')
    .select('external_ref, provider, provider_ref, amount, status, created_at')
    .eq('external_ref', parsed.data)
    .maybeSingle();
  if (!pay) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Already terminal — nothing to reconcile.
  if (['succeeded', 'failed', 'cancelled'].includes(pay.status)) {
    return NextResponse.json({ status: pay.status });
  }

  const gateway = await resolveCollectionsProvider(pay.provider as ProviderName);
  const ageMs = Date.now() - new Date(pay.created_at).getTime();
  let result;
  try {
    result = await gateway.getStatus({
      externalRef: pay.external_ref,
      providerRef: pay.provider_ref ?? undefined,
      amount: Number(pay.amount),
      ageMs,
    });
  } catch {
    return NextResponse.json({ status: pay.status });
  }

  if (result.status !== pay.status) {
    await admin.rpc('mark_order_payment', {
      p_external_ref: pay.external_ref,
      p_status: result.status,
      p_provider_ref: result.providerRef ?? null,
      p_message: null,
    });
  }
  return NextResponse.json({ status: result.status });
}

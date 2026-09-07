import { NextResponse } from 'next/server';
import { getAdminSupabase, hasAdmin } from '@/lib/supabase/admin';
import { resolveCollectionsProvider } from '@/lib/payments/resolve';
import type { ProviderName } from '@/lib/payments';

export const runtime = 'nodejs';

// POST /api/pay/webhook/:provider
// Gateway callback. We treat the payload only as a signal to re-query the
// authoritative status from the provider (never trust amounts/status in the
// body directly), then reconcile the DB.
export async function POST(req: Request, { params }: { params: { provider: string } }) {
  const provider = params.provider;
  if (!['mtn', 'orange'].includes(provider)) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 404 });
  }
  if (!hasAdmin()) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
  }

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Providers use different field names for our reference (external_ref / order_id).
  const ref = String(payload.externalRef ?? payload.reference ?? payload.order_id ?? payload.referenceId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(ref)) {
    return NextResponse.json({ error: 'no_reference' }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { data: pay } = await admin
    .from('order_payments')
    .select('external_ref, provider, provider_ref, amount, status, created_at')
    .eq('external_ref', ref)
    .maybeSingle();
  if (!pay) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const gateway = await resolveCollectionsProvider(pay.provider as ProviderName);
  try {
    const result = await gateway.getStatus({
      externalRef: pay.external_ref,
      providerRef: pay.provider_ref ?? undefined,
      amount: Number(pay.amount),
      ageMs: Date.now() - new Date(pay.created_at).getTime(),
    });
    await admin.rpc('mark_order_payment', {
      p_external_ref: pay.external_ref,
      p_status: result.status,
      p_provider_ref: result.providerRef ?? null,
      p_message: null,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

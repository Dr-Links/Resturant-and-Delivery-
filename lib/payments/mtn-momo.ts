// MTN Mobile Money — Collections (customer pays) and Disbursements (driver payout).
// Docs: https://momodeveloper.mtn.com/. Sandbox base: https://sandbox.momodeveloper.mtn.com
// The customer approves a USSD prompt on their phone; we poll requesttopay status.
import type {
  CollectionsProvider,
  DisbursementProvider,
  PaymentInitResult,
  PaymentInitiation,
  PaymentStatusQuery,
  PaymentStatusResult,
  Transfer,
} from './types';

const BASE = process.env.MOMO_BASE_URL ?? 'https://sandbox.momodeveloper.mtn.com';
const TARGET_ENV = process.env.MOMO_TARGET_ENV ?? 'sandbox';
const CURRENCY = process.env.MOMO_CURRENCY ?? 'XAF';
const API_USER = process.env.MOMO_API_USER ?? '';
const API_KEY = process.env.MOMO_API_KEY ?? '';

function mapStatus(s: string | undefined): PaymentStatusResult['status'] {
  switch ((s ?? '').toUpperCase()) {
    case 'SUCCESSFUL':
      return 'succeeded';
    case 'FAILED':
      return 'failed';
    case 'REJECTED':
    case 'TIMEOUT':
      return 'cancelled';
    default:
      return 'processing';
  }
}

async function token(subscriptionKey: string, product: 'collection' | 'disbursement'): Promise<string> {
  const res = await fetch(`${BASE}/${product}/token/`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${API_USER}:${API_KEY}`).toString('base64'),
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    },
  });
  if (!res.ok) throw new Error(`MTN token failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export function mtnConfigured(product: 'collection' | 'disbursement'): boolean {
  const sub =
    product === 'collection'
      ? process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY
      : process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY;
  return Boolean(API_USER && API_KEY && sub);
}

export class MtnCollections implements CollectionsProvider {
  readonly name = 'mtn' as const;
  readonly live = true;
  private sub = process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY ?? '';

  async requestToPay(p: PaymentInitiation): Promise<PaymentInitResult> {
    const access = await token(this.sub, 'collection');
    const res = await fetch(`${BASE}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'X-Reference-Id': p.externalRef,
        'X-Target-Environment': TARGET_ENV,
        'Ocp-Apim-Subscription-Key': this.sub,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: String(p.amount),
        currency: CURRENCY,
        externalId: p.orderId,
        payer: { partyIdType: 'MSISDN', partyId: (p.phone ?? '').replace(/\D/g, '') },
        payerMessage: p.description ?? 'Order payment',
        payeeNote: p.description ?? 'Order payment',
      }),
    });
    if (res.status !== 202) throw new Error(`MTN requestToPay failed: ${res.status}`);
    return { status: 'processing', providerRef: p.externalRef };
  }

  async getStatus(q: PaymentStatusQuery): Promise<PaymentStatusResult> {
    const access = await token(this.sub, 'collection');
    const res = await fetch(`${BASE}/collection/v1_0/requesttopay/${q.externalRef}`, {
      headers: {
        Authorization: `Bearer ${access}`,
        'X-Target-Environment': TARGET_ENV,
        'Ocp-Apim-Subscription-Key': this.sub,
      },
    });
    if (!res.ok) throw new Error(`MTN status failed: ${res.status}`);
    const body = (await res.json()) as { status?: string };
    return { status: mapStatus(body.status), providerRef: q.externalRef, raw: body };
  }
}

export class MtnDisbursements implements DisbursementProvider {
  readonly name = 'mtn' as const;
  readonly live = true;
  private sub = process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ?? '';

  async transfer(t: Transfer): Promise<PaymentInitResult> {
    const access = await token(this.sub, 'disbursement');
    const res = await fetch(`${BASE}/disbursement/v1_0/transfer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'X-Reference-Id': t.externalRef,
        'X-Target-Environment': TARGET_ENV,
        'Ocp-Apim-Subscription-Key': this.sub,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: String(t.amount),
        currency: t.currency,
        externalId: t.externalRef,
        payee: { partyIdType: 'MSISDN', partyId: t.phone.replace(/\D/g, '') },
        payerMessage: t.note ?? 'Driver settlement',
        payeeNote: t.note ?? 'Driver settlement',
      }),
    });
    if (res.status !== 202) throw new Error(`MTN transfer failed: ${res.status}`);
    return { status: 'processing', providerRef: t.externalRef };
  }

  async getStatus(q: PaymentStatusQuery): Promise<PaymentStatusResult> {
    const access = await token(this.sub, 'disbursement');
    const res = await fetch(`${BASE}/disbursement/v1_0/transfer/${q.externalRef}`, {
      headers: {
        Authorization: `Bearer ${access}`,
        'X-Target-Environment': TARGET_ENV,
        'Ocp-Apim-Subscription-Key': this.sub,
      },
    });
    if (!res.ok) throw new Error(`MTN transfer status failed: ${res.status}`);
    const body = (await res.json()) as { status?: string };
    return { status: mapStatus(body.status), providerRef: q.externalRef, raw: body };
  }
}

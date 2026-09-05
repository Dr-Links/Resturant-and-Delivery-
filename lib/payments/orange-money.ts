// Orange Money — Web Payment (Cameroon). Redirect-based: we create a payment,
// send the customer to Orange's hosted page, then reconcile via transactionstatus.
// Docs: https://developer.orange.com/apis/om-webpay
import type {
  CollectionsProvider,
  PaymentInitResult,
  PaymentInitiation,
  PaymentStatusQuery,
  PaymentStatusResult,
} from './types';

const OAUTH_URL = process.env.ORANGE_OAUTH_URL ?? 'https://api.orange.com/oauth/v3/token';
const BASE = process.env.ORANGE_BASE_URL ?? 'https://api.orange.com/orange-money-webpay/cm/v1';
const CLIENT_ID = process.env.ORANGE_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.ORANGE_CLIENT_SECRET ?? '';
const MERCHANT_KEY = process.env.ORANGE_MERCHANT_KEY ?? '';
const CURRENCY = process.env.ORANGE_CURRENCY ?? 'XAF';

export function orangeConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && MERCHANT_KEY);
}

function mapStatus(s: string | undefined): PaymentStatusResult['status'] {
  switch ((s ?? '').toUpperCase()) {
    case 'SUCCESS':
      return 'succeeded';
    case 'FAILED':
      return 'failed';
    case 'EXPIRED':
      return 'cancelled';
    default:
      return 'processing';
  }
}

async function token(): Promise<string> {
  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Orange token failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export class OrangeMoney implements CollectionsProvider {
  readonly name = 'orange' as const;
  readonly live = true;

  async requestToPay(p: PaymentInitiation): Promise<PaymentInitResult> {
    const access = await token();
    const res = await fetch(`${BASE}/webpayment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_key: MERCHANT_KEY,
        currency: CURRENCY,
        order_id: p.externalRef,
        amount: p.amount,
        return_url: p.returnUrl,
        cancel_url: p.returnUrl,
        notif_url: p.notifyUrl,
        lang: 'fr',
        reference: p.orderId,
      }),
    });
    if (!res.ok) throw new Error(`Orange webpayment failed: ${res.status}`);
    const body = (await res.json()) as { payment_url?: string; pay_token?: string };
    return { status: 'processing', providerRef: body.pay_token, redirectUrl: body.payment_url, raw: body };
  }

  async getStatus(q: PaymentStatusQuery): Promise<PaymentStatusResult> {
    const access = await token();
    const res = await fetch(`${BASE}/transactionstatus`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: q.externalRef, amount: q.amount, pay_token: q.providerRef }),
    });
    if (!res.ok) throw new Error(`Orange status failed: ${res.status}`);
    const body = (await res.json()) as { status?: string };
    return { status: mapStatus(body.status), providerRef: q.providerRef, raw: body };
  }
}

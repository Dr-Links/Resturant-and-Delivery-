// Orange Money — Web Payment (Cameroon). Redirect-based: we create a payment,
// send the customer to Orange's hosted page, then reconcile via transactionstatus.
// Docs: https://developer.orange.com/apis/om-webpay
//
// Config is injectable (DB integration store with env fallback); no-arg reads
// process.env so unit tests and env-only deployments keep working unchanged.
import type {
  CollectionsProvider,
  PaymentInitResult,
  PaymentInitiation,
  PaymentStatusQuery,
  PaymentStatusResult,
} from './types';

export type OrangeConfig = {
  oauthUrl: string;
  base: string;
  clientId: string;
  clientSecret: string;
  merchantKey: string;
  currency: string;
};

export function envOrangeConfig(): OrangeConfig {
  return {
    oauthUrl: process.env.ORANGE_OAUTH_URL ?? 'https://api.orange.com/oauth/v3/token',
    base: process.env.ORANGE_BASE_URL ?? 'https://api.orange.com/orange-money-webpay/cm/v1',
    clientId: process.env.ORANGE_CLIENT_ID ?? '',
    clientSecret: process.env.ORANGE_CLIENT_SECRET ?? '',
    merchantKey: process.env.ORANGE_MERCHANT_KEY ?? '',
    currency: process.env.ORANGE_CURRENCY ?? 'XAF',
  };
}

export function orangeConfigFrom(get: (key: string, fallback?: string) => string): OrangeConfig {
  return {
    oauthUrl: get('ORANGE_OAUTH_URL', 'https://api.orange.com/oauth/v3/token'),
    base: get('ORANGE_BASE_URL', 'https://api.orange.com/orange-money-webpay/cm/v1'),
    clientId: get('ORANGE_CLIENT_ID'),
    clientSecret: get('ORANGE_CLIENT_SECRET'),
    merchantKey: get('ORANGE_MERCHANT_KEY'),
    currency: get('ORANGE_CURRENCY', 'XAF'),
  };
}

export function orangeConfigured(c: OrangeConfig = envOrangeConfig()): boolean {
  return Boolean(c.clientId && c.clientSecret && c.merchantKey);
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

async function token(c: OrangeConfig): Promise<string> {
  const res = await fetch(c.oauthUrl, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64'),
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
  private c: OrangeConfig;

  constructor(config: OrangeConfig = envOrangeConfig()) {
    this.c = config;
  }

  async requestToPay(p: PaymentInitiation): Promise<PaymentInitResult> {
    const access = await token(this.c);
    const res = await fetch(`${this.c.base}/webpayment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_key: this.c.merchantKey,
        currency: this.c.currency,
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
    const access = await token(this.c);
    const res = await fetch(`${this.c.base}/transactionstatus`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: q.externalRef, amount: q.amount, pay_token: q.providerRef }),
    });
    if (!res.ok) throw new Error(`Orange status failed: ${res.status}`);
    const body = (await res.json()) as { status?: string };
    return { status: mapStatus(body.status), providerRef: q.providerRef, raw: body };
  }
}

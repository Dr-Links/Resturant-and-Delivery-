// MTN Mobile Money — Collections (customer pays) and Disbursements (driver payout).
// Docs: https://momodeveloper.mtn.com/. Sandbox base: https://sandbox.momodeveloper.mtn.com
// The customer approves a USSD prompt on their phone; we poll requesttopay status.
//
// Config is injectable: the server resolver builds it from the DB integration
// store (with env fallback). With no arg it reads process.env, so unit tests and
// env-only deployments keep working unchanged.
import type {
  CollectionsProvider,
  DisbursementProvider,
  PaymentInitResult,
  PaymentInitiation,
  PaymentStatusQuery,
  PaymentStatusResult,
  Transfer,
} from './types';

export type MtnConfig = {
  base: string;
  targetEnv: string;
  currency: string;
  apiUser: string;
  apiKey: string;
  collectionSub: string;
  disbursementSub: string;
};

export function envMtnConfig(): MtnConfig {
  return {
    base: process.env.MOMO_BASE_URL ?? 'https://sandbox.momodeveloper.mtn.com',
    targetEnv: process.env.MOMO_TARGET_ENV ?? 'sandbox',
    currency: process.env.MOMO_CURRENCY ?? 'XAF',
    apiUser: process.env.MOMO_API_USER ?? '',
    apiKey: process.env.MOMO_API_KEY ?? '',
    collectionSub: process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY ?? '',
    disbursementSub: process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ?? '',
  };
}

// Build config from a resolver (DB value → env → default).
export function mtnConfigFrom(get: (key: string, fallback?: string) => string): MtnConfig {
  return {
    base: get('MOMO_BASE_URL', 'https://sandbox.momodeveloper.mtn.com'),
    targetEnv: get('MOMO_TARGET_ENV', 'sandbox'),
    currency: get('MOMO_CURRENCY', 'XAF'),
    apiUser: get('MOMO_API_USER'),
    apiKey: get('MOMO_API_KEY'),
    collectionSub: get('MOMO_COLLECTION_SUBSCRIPTION_KEY'),
    disbursementSub: get('MOMO_DISBURSEMENT_SUBSCRIPTION_KEY'),
  };
}

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

async function token(c: MtnConfig, subscriptionKey: string, product: 'collection' | 'disbursement'): Promise<string> {
  const res = await fetch(`${c.base}/${product}/token/`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${c.apiUser}:${c.apiKey}`).toString('base64'),
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    },
  });
  if (!res.ok) throw new Error(`MTN token failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export function mtnConfigured(product: 'collection' | 'disbursement', c: MtnConfig = envMtnConfig()): boolean {
  const sub = product === 'collection' ? c.collectionSub : c.disbursementSub;
  return Boolean(c.apiUser && c.apiKey && sub);
}

export class MtnCollections implements CollectionsProvider {
  readonly name = 'mtn' as const;
  readonly live = true;
  private c: MtnConfig;

  constructor(config: MtnConfig = envMtnConfig()) {
    this.c = config;
  }

  async requestToPay(p: PaymentInitiation): Promise<PaymentInitResult> {
    const access = await token(this.c, this.c.collectionSub, 'collection');
    const res = await fetch(`${this.c.base}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'X-Reference-Id': p.externalRef,
        'X-Target-Environment': this.c.targetEnv,
        'Ocp-Apim-Subscription-Key': this.c.collectionSub,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: String(p.amount),
        currency: this.c.currency,
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
    const access = await token(this.c, this.c.collectionSub, 'collection');
    const res = await fetch(`${this.c.base}/collection/v1_0/requesttopay/${q.externalRef}`, {
      headers: {
        Authorization: `Bearer ${access}`,
        'X-Target-Environment': this.c.targetEnv,
        'Ocp-Apim-Subscription-Key': this.c.collectionSub,
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
  private c: MtnConfig;

  constructor(config: MtnConfig = envMtnConfig()) {
    this.c = config;
  }

  async transfer(t: Transfer): Promise<PaymentInitResult> {
    const access = await token(this.c, this.c.disbursementSub, 'disbursement');
    const res = await fetch(`${this.c.base}/disbursement/v1_0/transfer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'X-Reference-Id': t.externalRef,
        'X-Target-Environment': this.c.targetEnv,
        'Ocp-Apim-Subscription-Key': this.c.disbursementSub,
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
    const access = await token(this.c, this.c.disbursementSub, 'disbursement');
    const res = await fetch(`${this.c.base}/disbursement/v1_0/transfer/${q.externalRef}`, {
      headers: {
        Authorization: `Bearer ${access}`,
        'X-Target-Environment': this.c.targetEnv,
        'Ocp-Apim-Subscription-Key': this.c.disbursementSub,
      },
    });
    if (!res.ok) throw new Error(`MTN transfer status failed: ${res.status}`);
    const body = (await res.json()) as { status?: string };
    return { status: mapStatus(body.status), providerRef: q.externalRef, raw: body };
  }
}

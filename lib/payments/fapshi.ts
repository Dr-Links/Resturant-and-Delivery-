// Fapshi — Cameroon payment aggregator. A single account/API covers BOTH MTN
// MoMo and Orange Money; the network is auto-detected from the payer's phone
// (medium omitted). Docs: https://docs.fapshi.com.
//   POST /direct-pay              -> USSD push; returns { transId }
//   GET  /payment-status/:transId -> { status: CREATED|PENDING|SUCCESSFUL|FAILED|EXPIRED }
// Config is injectable (DB integration store, env fallback); no-arg reads env.
import type {
  CollectionsProvider,
  PaymentInitResult,
  PaymentInitiation,
  PaymentStatusQuery,
  PaymentStatusResult,
} from './types';

export type FapshiConfig = { base: string; apiUser: string; apiKey: string };

export function envFapshiConfig(): FapshiConfig {
  return {
    base: process.env.FAPSHI_BASE_URL ?? 'https://sandbox.fapshi.com',
    apiUser: process.env.FAPSHI_API_USER ?? '',
    apiKey: process.env.FAPSHI_API_KEY ?? '',
  };
}

export function fapshiConfigFrom(get: (key: string, fallback?: string) => string): FapshiConfig {
  return {
    base: get('FAPSHI_BASE_URL', 'https://sandbox.fapshi.com'),
    apiUser: get('FAPSHI_API_USER'),
    apiKey: get('FAPSHI_API_KEY'),
  };
}

export function fapshiConfigured(c: FapshiConfig = envFapshiConfig()): boolean {
  return Boolean(c.apiUser && c.apiKey);
}

function mapStatus(s: string | undefined): PaymentStatusResult['status'] {
  switch ((s ?? '').toUpperCase()) {
    case 'SUCCESSFUL':
      return 'succeeded';
    case 'FAILED':
      return 'failed';
    case 'EXPIRED':
      return 'cancelled';
    default:
      return 'processing'; // CREATED, PENDING
  }
}

function authHeaders(c: FapshiConfig): Record<string, string> {
  return { apiuser: c.apiUser, apikey: c.apiKey, 'Content-Type': 'application/json' };
}

export class FapshiCollections implements CollectionsProvider {
  readonly name = 'fapshi' as const;
  readonly live = true;
  private c: FapshiConfig;

  constructor(config: FapshiConfig = envFapshiConfig()) {
    this.c = config;
  }

  async requestToPay(p: PaymentInitiation): Promise<PaymentInitResult> {
    const res = await fetch(`${this.c.base}/direct-pay`, {
      method: 'POST',
      headers: authHeaders(this.c),
      body: JSON.stringify({
        amount: Math.round(p.amount),
        phone: (p.phone ?? '').replace(/\D/g, ''),
        externalId: p.orderId,
        message: p.description ?? 'Order payment',
      }),
    });
    if (!res.ok) throw new Error(`Fapshi direct-pay failed: ${res.status}`);
    const body = (await res.json()) as { transId?: string };
    return { status: 'processing', providerRef: body.transId, raw: body };
  }

  async getStatus(q: PaymentStatusQuery): Promise<PaymentStatusResult> {
    const id = q.providerRef ?? q.externalRef;
    const res = await fetch(`${this.c.base}/payment-status/${id}`, { headers: authHeaders(this.c) });
    if (!res.ok) throw new Error(`Fapshi status failed: ${res.status}`);
    const body = (await res.json()) as { status?: string };
    return { status: mapStatus(body.status), providerRef: q.providerRef, raw: body };
  }
}

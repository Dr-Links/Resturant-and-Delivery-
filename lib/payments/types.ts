// Mobile-money payment provider contracts (MTN MoMo, Orange Money, mock).
// Collections = take money from a customer. Disbursement = pay money to a driver.

export type PaymentState = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export type ProviderName = 'mtn' | 'orange' | 'fapshi' | 'mock';

export interface PaymentInitiation {
  externalRef: string; // our idempotency key (uuid), also sent to the gateway
  amount: number;
  currency: string;
  phone?: string;
  orderId: string;
  description?: string;
  returnUrl?: string; // redirect-based providers (Orange) send the payer here
  notifyUrl?: string; // gateway webhook target
}

export interface PaymentInitResult {
  status: PaymentState;
  providerRef?: string; // gateway transaction id / pay token
  redirectUrl?: string; // set by redirect-based providers
  raw?: unknown;
}

export interface PaymentStatusQuery {
  externalRef: string;
  providerRef?: string;
  amount: number;
  ageMs: number; // how long since the intent was created (drives the mock)
}

export interface PaymentStatusResult {
  status: PaymentState;
  providerRef?: string;
  raw?: unknown;
}

export interface Transfer {
  externalRef: string;
  amount: number;
  currency: string;
  phone: string;
  note?: string;
}

export interface CollectionsProvider {
  readonly name: ProviderName;
  readonly live: boolean; // false when running the mock fallback
  requestToPay(p: PaymentInitiation): Promise<PaymentInitResult>;
  getStatus(q: PaymentStatusQuery): Promise<PaymentStatusResult>;
}

export interface DisbursementProvider {
  readonly name: ProviderName;
  readonly live: boolean;
  transfer(t: Transfer): Promise<PaymentInitResult>;
  getStatus(q: PaymentStatusQuery): Promise<PaymentStatusResult>;
}

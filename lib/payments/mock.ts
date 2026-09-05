// No-credentials fallback so the whole payment flow is testable end-to-end.
// A mock payment sits in `processing` and flips to `succeeded` once it is older
// than MOCK_PAY_DELAY_MS (default 4s), simulating a customer approving the
// USSD prompt on their phone.
import type {
  CollectionsProvider,
  DisbursementProvider,
  PaymentInitResult,
  PaymentInitiation,
  PaymentStatusQuery,
  PaymentStatusResult,
  ProviderName,
  Transfer,
} from './types';

const DELAY_MS = Number(process.env.MOCK_PAY_DELAY_MS ?? 4000);

function decide(ageMs: number): PaymentStatusResult {
  return { status: ageMs >= DELAY_MS ? 'succeeded' : 'processing' };
}

export class MockProvider implements CollectionsProvider, DisbursementProvider {
  readonly live = false;
  constructor(readonly name: ProviderName) {}

  async requestToPay(p: PaymentInitiation): Promise<PaymentInitResult> {
    return { status: 'processing', providerRef: `mock-${p.externalRef}` };
  }

  async transfer(t: Transfer): Promise<PaymentInitResult> {
    // Disbursements settle immediately in the mock.
    return { status: 'succeeded', providerRef: `mock-${t.externalRef}` };
  }

  async getStatus(q: PaymentStatusQuery): Promise<PaymentStatusResult> {
    return decide(q.ageMs);
  }
}

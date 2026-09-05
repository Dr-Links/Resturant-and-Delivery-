// Provider factory. Returns the live gateway when its credentials are present,
// otherwise a mock tagged with the requested provider name so the flow stays
// testable without merchant credentials.
import { MockProvider } from './mock';
import { MtnCollections, MtnDisbursements, mtnConfigured } from './mtn-momo';
import { OrangeMoney, orangeConfigured } from './orange-money';
import type { CollectionsProvider, DisbursementProvider, ProviderName } from './types';

export function getCollectionsProvider(requested: ProviderName): CollectionsProvider {
  if (requested === 'mtn' && mtnConfigured('collection')) return new MtnCollections();
  if (requested === 'orange' && orangeConfigured()) return new OrangeMoney();
  return new MockProvider(requested);
}

export function getDisbursementProvider(requested: ProviderName): DisbursementProvider {
  if (requested === 'mtn' && mtnConfigured('disbursement')) return new MtnDisbursements();
  // Orange disbursement is not wired yet; fall back to mock for non-MTN payouts.
  return new MockProvider(requested);
}

export * from './types';

import 'server-only';
// Server-only provider resolver: builds each gateway's credentials from the DB
// integration store (Vault-decrypted secrets, env fallback) at request time, so
// credentials managed in the admin dashboard take effect live. Falls back to the
// mock provider when a gateway is not fully configured. The API routes use this
// instead of the sync env-only factory in ./index.
import { loadIntegration } from '@/lib/integrations/server';
import { MockProvider } from './mock';
import { MtnCollections, MtnDisbursements, mtnConfigured, mtnConfigFrom } from './mtn-momo';
import { OrangeMoney, orangeConfigured, orangeConfigFrom } from './orange-money';
import type { CollectionsProvider, DisbursementProvider, ProviderName } from './types';

export async function resolveCollectionsProvider(requested: ProviderName): Promise<CollectionsProvider> {
  if (requested === 'mtn') {
    const c = mtnConfigFrom(await loadIntegration('mtn_momo'));
    if (mtnConfigured('collection', c)) return new MtnCollections(c);
  }
  if (requested === 'orange') {
    const c = orangeConfigFrom(await loadIntegration('orange_money'));
    if (orangeConfigured(c)) return new OrangeMoney(c);
  }
  return new MockProvider(requested);
}

export async function resolveDisbursementProvider(requested: ProviderName): Promise<DisbursementProvider> {
  if (requested === 'mtn') {
    const c = mtnConfigFrom(await loadIntegration('mtn_momo'));
    if (mtnConfigured('disbursement', c)) return new MtnDisbursements(c);
  }
  // Orange disbursement is not wired yet; fall back to mock for non-MTN payouts.
  return new MockProvider(requested);
}

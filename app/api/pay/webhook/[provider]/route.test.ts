import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
const adminRpc = vi.fn();
const getStatus = vi.fn();
let adminPresent = true;

function fromChain() {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = maybeSingle;
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: () => ({ from: () => fromChain(), rpc: adminRpc }),
  hasAdmin: () => adminPresent,
}));
vi.mock('@/lib/payments/resolve', () => ({
  resolveCollectionsProvider: async () => ({ getStatus }),
}));

import { POST } from './route';

const REF = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const post = (body: unknown) =>
  new Request('http://localhost/api/pay/webhook/mtn', { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  adminPresent = true;
  adminRpc.mockResolvedValue({ data: { ok: true } });
});

describe('POST /api/pay/webhook/:provider', () => {
  it('404s an unknown provider', async () => {
    const res = await POST(post({}), { params: { provider: 'paypal' } });
    expect(res.status).toBe(404);
  });

  it('400s when the payload carries no usable reference', async () => {
    const res = await POST(post({ foo: 'bar' }), { params: { provider: 'mtn' } });
    expect(res.status).toBe(400);
  });

  it('reconciles the referenced payment', async () => {
    maybeSingle.mockResolvedValue({ data: { external_ref: REF, provider: 'mtn', provider_ref: 'p', status: 'processing', amount: 100, created_at: new Date().toISOString() } });
    getStatus.mockResolvedValue({ status: 'succeeded', providerRef: 'p' });
    const res = await POST(post({ referenceId: REF }), { params: { provider: 'mtn' } });
    expect(res.status).toBe(200);
    expect(adminRpc).toHaveBeenCalledWith('mark_order_payment', expect.objectContaining({ p_external_ref: REF, p_status: 'succeeded' }));
  });
});

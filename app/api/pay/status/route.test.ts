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

import { GET } from './route';

const REF = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const get = (ref?: string) => new Request(`http://localhost/api/pay/status${ref ? `?ref=${ref}` : ''}`);

beforeEach(() => {
  vi.clearAllMocks();
  adminPresent = true;
  adminRpc.mockResolvedValue({ data: { ok: true } });
});

describe('GET /api/pay/status', () => {
  it('rejects a non-uuid ref', async () => {
    const res = await GET(get('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('returns 503 when service role is not configured', async () => {
    adminPresent = false;
    const res = await GET(get(REF));
    expect(res.status).toBe(503);
  });

  it('404s an unknown payment', async () => {
    maybeSingle.mockResolvedValue({ data: null });
    const res = await GET(get(REF));
    expect(res.status).toBe(404);
  });

  it('short-circuits a terminal payment without querying the gateway', async () => {
    maybeSingle.mockResolvedValue({ data: { external_ref: REF, provider: 'mtn', status: 'succeeded', amount: 100, created_at: new Date().toISOString() } });
    const res = await GET(get(REF));
    expect((await res.json()).status).toBe('succeeded');
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('reconciles a pending payment that has now succeeded', async () => {
    maybeSingle.mockResolvedValue({ data: { external_ref: REF, provider: 'mtn', provider_ref: 'p', status: 'processing', amount: 100, created_at: new Date(Date.now() - 10_000).toISOString() } });
    getStatus.mockResolvedValue({ status: 'succeeded', providerRef: 'p' });
    const res = await GET(get(REF));
    expect((await res.json()).status).toBe('succeeded');
    expect(adminRpc).toHaveBeenCalledWith('mark_order_payment', expect.objectContaining({ p_status: 'succeeded' }));
  });
});

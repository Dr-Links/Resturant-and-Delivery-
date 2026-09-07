import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const serverRpc = vi.fn();
const requestToPay = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: () => ({ auth: { getUser }, rpc: serverRpc }),
}));
vi.mock('@/lib/payments/resolve', () => ({
  resolveCollectionsProvider: async () => ({ live: false, requestToPay }),
}));

import { POST } from './route';

const post = (body: unknown) =>
  new Request('http://localhost/api/driver/settle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'driver-1' } } });
  requestToPay.mockResolvedValue({ status: 'processing', providerRef: 'p' });
  serverRpc.mockResolvedValue({ data: { ok: true, balance: 0 }, error: null });
});

describe('POST /api/driver/settle', () => {
  it('rejects an invalid amount', async () => {
    const res = await POST(post({ amount: 0, phone: '650123456' }));
    expect(res.status).toBe(400);
  });

  it('401s an unauthenticated caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post({ amount: 500, phone: '650123456' }));
    expect(res.status).toBe(401);
  });

  it('collects via the gateway then records the settlement', async () => {
    const res = await POST(post({ amount: 500, phone: '650123456', provider: 'mtn' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, balance: 0 });
    expect(requestToPay).toHaveBeenCalledOnce();
    expect(serverRpc).toHaveBeenCalledWith('settle_driver_balance', expect.objectContaining({ p_amount: 500 }));
  });

  it('returns 402 when the gateway declines', async () => {
    requestToPay.mockResolvedValue({ status: 'failed' });
    const res = await POST(post({ amount: 500, phone: '650123456' }));
    expect(res.status).toBe(402);
    expect(serverRpc).not.toHaveBeenCalled();
  });
});

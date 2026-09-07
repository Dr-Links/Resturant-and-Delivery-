import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks (hoisted) --------------------------------------------------------
const anonRpc = vi.fn();
const adminRpc = vi.fn();
const requestToPay = vi.fn();
let adminPresent = true;

vi.mock('@/lib/supabase/admin', () => ({
  getServerAnon: () => ({ rpc: anonRpc }),
  getAdminSupabase: () => ({ rpc: adminRpc }),
  hasAdmin: () => adminPresent,
}));
vi.mock('@/lib/payments/resolve', () => ({
  resolveCollectionsProvider: async () => ({ live: false, requestToPay }),
}));

import { POST } from './route';

function post(body: unknown) {
  return new Request('http://localhost/api/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  adminPresent = true;
  anonRpc.mockResolvedValue({
    data: { payment_id: 'pay-1', external_ref: 'ref-1', amount: 1500, currency: 'XAF', status: 'pending' },
    error: null,
  });
  adminRpc.mockResolvedValue({ data: { ok: true }, error: null });
  requestToPay.mockResolvedValue({ status: 'processing', providerRef: 'prov-1' });
});

describe('POST /api/pay', () => {
  it('rejects an invalid body', async () => {
    const res = await POST(post({ provider: 'mtn' })); // missing orderId
    expect(res.status).toBe(400);
    expect(anonRpc).not.toHaveBeenCalled();
  });

  it('opens an intent and initiates the gateway', async () => {
    const res = await POST(post({ orderId: '11111111-1111-1111-1111-111111111111', provider: 'mtn', phone: '650123456' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ paymentId: 'pay-1', externalRef: 'ref-1', status: 'processing' });
    expect(anonRpc).toHaveBeenCalledWith('create_order_payment', expect.objectContaining({
      p_order_id: '11111111-1111-1111-1111-111111111111',
      p_provider: 'mtn',
    }));
    expect(requestToPay).toHaveBeenCalledOnce();
  });

  it('surfaces an RPC error (e.g. already paid) as 400', async () => {
    anonRpc.mockResolvedValue({ data: { error: 'already_paid' }, error: null });
    const res = await POST(post({ orderId: '11111111-1111-1111-1111-111111111111', provider: 'mtn' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('already_paid');
    expect(requestToPay).not.toHaveBeenCalled();
  });

  it('returns 502 and marks the intent failed when the gateway throws', async () => {
    requestToPay.mockRejectedValue(new Error('gateway down'));
    const res = await POST(post({ orderId: '11111111-1111-1111-1111-111111111111', provider: 'mtn' }));
    expect(res.status).toBe(502);
    expect(adminRpc).toHaveBeenCalledWith('mark_order_payment', expect.objectContaining({ p_status: 'failed' }));
  });
});

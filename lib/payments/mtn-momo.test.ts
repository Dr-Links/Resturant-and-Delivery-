import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MtnCollections, MtnDisbursements } from './mtn-momo';

type Body = Record<string, unknown>;
function res(body: Body, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const init = { externalRef: 'ext-42', amount: 2500, currency: 'XAF', orderId: 'order-9', phone: '+237 650-12-34-56' };

describe('MtnCollections.requestToPay', () => {
  it('fetches a token then posts requesttopay and returns processing', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ access_token: 'tok' })) // token
      .mockResolvedValueOnce(res({}, { status: 202 })); // requesttopay accepted

    const result = await new MtnCollections().requestToPay(init);

    expect(result.status).toBe('processing');
    expect(result.providerRef).toBe('ext-42');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, opts] = fetchMock.mock.calls[1];
    expect(String(url)).toContain('/collection/v1_0/requesttopay');
    expect((opts as RequestInit).headers).toMatchObject({ 'X-Reference-Id': 'ext-42' });
    const sent = JSON.parse((opts as RequestInit).body as string);
    expect(sent.amount).toBe('2500');
    expect(sent.currency).toBe('XAF');
    expect(sent.payer).toEqual({ partyIdType: 'MSISDN', partyId: '237650123456' }); // digits only
  });

  it('throws when the gateway does not accept the request', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ access_token: 'tok' }))
      .mockResolvedValueOnce(res({}, { ok: false, status: 400 }));
    await expect(new MtnCollections().requestToPay(init)).rejects.toThrow();
  });
});

describe('MtnCollections.getStatus mapping', () => {
  const cases: Array<[string, string]> = [
    ['SUCCESSFUL', 'succeeded'],
    ['FAILED', 'failed'],
    ['REJECTED', 'cancelled'],
    ['TIMEOUT', 'cancelled'],
    ['PENDING', 'processing'],
  ];
  for (const [gateway, expected] of cases) {
    it(`maps ${gateway} -> ${expected}`, async () => {
      fetchMock
        .mockResolvedValueOnce(res({ access_token: 'tok' }))
        .mockResolvedValueOnce(res({ status: gateway }));
      const r = await new MtnCollections().getStatus({ externalRef: 'ext-42', amount: 2500, ageMs: 0 });
      expect(r.status).toBe(expected);
    });
  }
});

describe('MtnDisbursements.transfer', () => {
  it('tokens against the disbursement product and returns processing on 202', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ access_token: 'tok' }))
      .mockResolvedValueOnce(res({}, { status: 202 }));
    const r = await new MtnDisbursements().transfer({ externalRef: 'x1', amount: 900, currency: 'XAF', phone: '650000000' });
    expect(r.status).toBe('processing');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/disbursement/v1_0/transfer');
  });
});

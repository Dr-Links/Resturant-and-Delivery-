import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FapshiCollections, fapshiConfigured } from './fapshi';

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

const cfg = { base: 'https://sandbox.fapshi.com', apiUser: 'u', apiKey: 'k' };
const init = { externalRef: 'ext-1', amount: 2500, currency: 'XAF', orderId: 'order-1', phone: '+237 650-12-34-56' };

describe('FapshiCollections.requestToPay', () => {
  it('posts to /direct-pay and returns processing with the transId', async () => {
    fetchMock.mockResolvedValueOnce(res({ transId: 'TX-9', message: 'ok' }));

    const result = await new FapshiCollections(cfg).requestToPay(init);

    expect(result).toEqual({ status: 'processing', providerRef: 'TX-9', raw: { transId: 'TX-9', message: 'ok' } });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sandbox.fapshi.com/direct-pay');
    expect((opts as RequestInit).method).toBe('POST');
    const sent = JSON.parse((opts as RequestInit).body as string);
    expect(sent).toMatchObject({ amount: 2500, phone: '237650123456', externalId: 'order-1' });
    expect((opts as any).headers).toMatchObject({ apiuser: 'u', apikey: 'k' });
  });

  it('throws when the gateway rejects the request', async () => {
    fetchMock.mockResolvedValueOnce(res({}, { ok: false, status: 400 }));
    await expect(new FapshiCollections(cfg).requestToPay(init)).rejects.toThrow();
  });
});

describe('FapshiCollections.getStatus', () => {
  const cases: [string, string][] = [
    ['SUCCESSFUL', 'succeeded'],
    ['FAILED', 'failed'],
    ['EXPIRED', 'cancelled'],
    ['PENDING', 'processing'],
    ['CREATED', 'processing'],
  ];
  for (const [gateway, expected] of cases) {
    it(`maps ${gateway} -> ${expected}`, async () => {
      fetchMock.mockResolvedValueOnce(res({ status: gateway }));
      const r = await new FapshiCollections(cfg).getStatus({ externalRef: 'ext-1', providerRef: 'TX-9', amount: 2500, ageMs: 0 });
      expect(r.status).toBe(expected);
      expect(fetchMock.mock.calls[0][0]).toBe('https://sandbox.fapshi.com/payment-status/TX-9');
    });
  }
});

describe('fapshiConfigured', () => {
  it('is false without credentials in the environment', () => {
    expect(fapshiConfigured()).toBe(false);
  });
  it('is true when apiUser and apiKey are present', () => {
    expect(fapshiConfigured(cfg)).toBe(true);
  });
});

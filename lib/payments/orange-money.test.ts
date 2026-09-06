import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrangeMoney, orangeConfigured } from './orange-money';

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

const init = {
  externalRef: 'ord-77',
  amount: 3000,
  currency: 'XAF',
  orderId: 'order-77',
  returnUrl: 'https://app/pay/return?ref=ord-77',
  notifyUrl: 'https://app/api/pay/webhook/orange',
};

describe('OrangeMoney.requestToPay', () => {
  it('returns a redirect URL and pay token', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ access_token: 'tok' })) // oauth
      .mockResolvedValueOnce(res({ payment_url: 'https://pay.orange/xyz', pay_token: 'PT-1' })); // webpayment

    const result = await new OrangeMoney().requestToPay(init);

    expect(result.status).toBe('processing');
    expect(result.redirectUrl).toBe('https://pay.orange/xyz');
    expect(result.providerRef).toBe('PT-1');

    const [url, opts] = fetchMock.mock.calls[1];
    expect(String(url)).toContain('/webpayment');
    const sent = JSON.parse((opts as RequestInit).body as string);
    expect(sent.order_id).toBe('ord-77');
    expect(sent.amount).toBe(3000);
  });
});

describe('OrangeMoney.getStatus mapping', () => {
  const cases: Array<[string, string]> = [
    ['SUCCESS', 'succeeded'],
    ['FAILED', 'failed'],
    ['EXPIRED', 'cancelled'],
    ['PENDING', 'processing'],
  ];
  for (const [gateway, expected] of cases) {
    it(`maps ${gateway} -> ${expected}`, async () => {
      fetchMock
        .mockResolvedValueOnce(res({ access_token: 'tok' }))
        .mockResolvedValueOnce(res({ status: gateway }));
      const r = await new OrangeMoney().getStatus({ externalRef: 'ord-77', amount: 3000, providerRef: 'PT-1', ageMs: 0 });
      expect(r.status).toBe(expected);
    });
  }
});

describe('orangeConfigured', () => {
  it('is false without credentials in the environment', () => {
    expect(orangeConfigured()).toBe(false);
  });
});

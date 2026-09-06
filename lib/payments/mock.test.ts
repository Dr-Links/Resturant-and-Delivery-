import { describe, it, expect } from 'vitest';
import { MockProvider } from './mock';

const init = { externalRef: 'ref-1', amount: 1000, currency: 'XAF', orderId: 'order-1' };

describe('MockProvider (collections)', () => {
  const p = new MockProvider('mtn');

  it('is not a live provider and keeps the requested name', () => {
    expect(p.live).toBe(false);
    expect(p.name).toBe('mtn');
  });

  it('starts a collection in processing with a mock provider ref', async () => {
    const res = await p.requestToPay(init);
    expect(res.status).toBe('processing');
    expect(res.providerRef).toBe('mock-ref-1');
  });

  it('stays processing before the delay and succeeds after it', async () => {
    const q = { externalRef: 'ref-1', amount: 1000, providerRef: 'mock-ref-1' };
    expect((await p.getStatus({ ...q, ageMs: 0 })).status).toBe('processing');
    expect((await p.getStatus({ ...q, ageMs: 3999 })).status).toBe('processing');
    expect((await p.getStatus({ ...q, ageMs: 4000 })).status).toBe('succeeded');
    expect((await p.getStatus({ ...q, ageMs: 10_000 })).status).toBe('succeeded');
  });
});

describe('MockProvider (disbursement)', () => {
  it('settles a transfer immediately', async () => {
    const p = new MockProvider('mtn');
    const res = await p.transfer({ externalRef: 'r', amount: 500, currency: 'XAF', phone: '650000000' });
    expect(res.status).toBe('succeeded');
    expect(res.providerRef).toBe('mock-r');
  });
});

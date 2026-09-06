import { describe, it, expect } from 'vitest';
import { getCollectionsProvider, getDisbursementProvider } from './index';

// The test environment has no MTN/Orange credentials, so every provider request
// must fall back to the mock while preserving the requested provider name.
describe('provider factory — no credentials configured', () => {
  it('returns a non-live collections provider tagged with the requested name', () => {
    const mtn = getCollectionsProvider('mtn');
    expect(mtn.live).toBe(false);
    expect(mtn.name).toBe('mtn');

    const orange = getCollectionsProvider('orange');
    expect(orange.live).toBe(false);
    expect(orange.name).toBe('orange');
  });

  it('returns a non-live disbursement provider', () => {
    const d = getDisbursementProvider('mtn');
    expect(d.live).toBe(false);
    expect(d.name).toBe('mtn');
  });

  it('returns the mock provider directly when requested', () => {
    expect(getCollectionsProvider('mock').name).toBe('mock');
  });
});

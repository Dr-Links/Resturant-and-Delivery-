import { describe, it, expect } from 'vitest';
import {
  alreadyDispatched,
  isAuthorized,
  planEmail,
  planSms,
  planToStatus,
  sendResultStatus,
} from './logic';

describe('notify-fanout logic — channel planning', () => {
  it('skips email when the recipient has no address', () => {
    expect(planEmail(null, true)).toBe('skip');
    expect(planEmail('', true)).toBe('skip');
    expect(planEmail(undefined, false)).toBe('skip');
  });

  it('sends email when an address and provider key are present', () => {
    expect(planEmail('a@b.cm', true)).toBe('send');
  });

  it('falls back to mock email when no provider key is set', () => {
    expect(planEmail('a@b.cm', false)).toBe('mock');
  });

  it('skips SMS without a phone; sends with phone + creds; mocks without creds', () => {
    expect(planSms(null, true)).toBe('skip');
    expect(planSms('650000000', true)).toBe('send');
    expect(planSms('650000000', false)).toBe('mock');
  });
});

describe('notify-fanout logic — idempotency', () => {
  it('is not dispatched when both channel statuses are empty', () => {
    expect(alreadyDispatched({ email_status: null, sms_status: null })).toBe(false);
    expect(alreadyDispatched({})).toBe(false);
  });

  it('is dispatched once either channel status is set', () => {
    expect(alreadyDispatched({ email_status: 'mock' })).toBe(true);
    expect(alreadyDispatched({ sms_status: 'sent' })).toBe(true);
  });
});

describe('notify-fanout logic — auth', () => {
  it('authorizes only an exact token match', () => {
    expect(isAuthorized('abc', 'abc')).toBe(true);
    expect(isAuthorized('abc', 'xyz')).toBe(false);
  });

  it('rejects when no expected token is configured', () => {
    expect(isAuthorized('abc', null)).toBe(false);
    expect(isAuthorized('', '')).toBe(false);
  });
});

describe('notify-fanout logic — status mapping', () => {
  it('maps send results to sent / failed:<code>', () => {
    expect(sendResultStatus(true, 200)).toBe('sent');
    expect(sendResultStatus(false, 500)).toBe('failed:500');
  });

  it('maps a plan to its persisted status', () => {
    expect(planToStatus('skip')).toBe('skipped');
    expect(planToStatus('mock')).toBe('mock');
    expect(planToStatus('send')).toBe('send');
  });
});

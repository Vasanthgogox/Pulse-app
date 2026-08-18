import {
  addDaysIso,
  getOrgVerificationReminderCopy,
  parseOrgTimestamp,
} from '@/features/organization/components/workspace/kyc/orgVerificationReminder.util';

describe('orgVerificationReminder.util', () => {
  it('parses ISO timestamps', () => {
    const d = parseOrgTimestamp('2026-08-10T00:00:00.000Z');
    expect(d?.toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });

  it('parses Postgres-style timestamps with a space', () => {
    const d = parseOrgTimestamp('2026-08-10 00:00:00+00');
    expect(d).not.toBeNull();
    expect(Number.isNaN(d!.getTime())).toBe(false);
  });

  it('returns null for empty or invalid created_at', () => {
    expect(parseOrgTimestamp(null)).toBeNull();
    expect(parseOrgTimestamp('')).toBeNull();
    expect(parseOrgTimestamp('not-a-date')).toBeNull();
  });

  it('addDaysIso does not throw on invalid input', () => {
    expect(addDaysIso(null, 7)).toBeNull();
    expect(addDaysIso('not-a-date', 7)).toBeNull();
  });

  it('falls back to generic copy when created_at is missing', () => {
    const copy = getOrgVerificationReminderCopy({ created_at: null });
    expect(copy.title).toBe('Verify your business');
    expect(copy.sub).toBe('Complete your business KYC to unlock full access.');
    expect(copy.overdue).toBe(false);
  });

  it('does not throw when created_at is garbage', () => {
    expect(() => getOrgVerificationReminderCopy({ created_at: 'Invalid Date' })).not.toThrow();
    const copy = getOrgVerificationReminderCopy({ created_at: 'Invalid Date' });
    expect(copy.sub).toContain('Complete your business KYC');
  });
});

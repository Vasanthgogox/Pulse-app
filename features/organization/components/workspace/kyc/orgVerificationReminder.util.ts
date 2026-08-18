import Theme from '@/constants/Theme';
import {
  daysUntilExpiry,
  getExpiryAlertLevel,
  getExpiryToneColors,
} from '@/features/compliance/utils/expiry.util';
import type { OrgVerificationBannerFields } from '@/features/organization/services/organization.service';

export const ORG_VERIFICATION_SOFT_DEADLINE_DAYS = 7;

/** Hermes/`Date` often rejects Postgres timestamps that use a space instead of `T`. */
export function parseOrgTimestamp(iso: string | null | undefined): Date | null {
  const raw = iso?.trim();
  if (!raw) return null;

  const attempts = [
    raw,
    raw.replace(' ', 'T'),
    raw.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'),
  ];
  for (const value of attempts) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function addDaysIso(iso: string | null | undefined, days: number): string | null {
  const d = parseOrgTimestamp(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export type OrgVerificationReminderCopy = {
  overdue: boolean;
  tone: { fg: string; bg: string; border: string };
  title: string;
  eyebrow: string;
  sub: string;
};

const FALLBACK_TONE = {
  fg: Theme.scoreGoodFg ?? '#1D4ED8',
  bg: Theme.scoreGoodBg ?? '#DBEAFE',
  border: 'rgba(29,78,216,0.16)',
};

export function getOrgVerificationReminderCopy(
  data: Pick<OrgVerificationBannerFields, 'created_at'>,
): OrgVerificationReminderCopy {
  const deadlineIso = addDaysIso(data.created_at, ORG_VERIFICATION_SOFT_DEADLINE_DAYS);
  const daysLeft = deadlineIso ? daysUntilExpiry(deadlineIso) : null;
  const overdue = daysLeft != null && daysLeft < 0;

  const tone = overdue
    ? getExpiryToneColors(getExpiryAlertLevel(daysLeft))
    : FALLBACK_TONE;

  const title = overdue ? 'Verification overdue' : 'Verify your business';
  const eyebrow = overdue ? 'ACTION REQUIRED' : 'GET VERIFIED';
  const sub = overdue
    ? 'Your 7-day window has passed — submit now to avoid restrictions.'
    : daysLeft != null
      ? `${Math.max(daysLeft, 0)} day${daysLeft === 1 ? '' : 's'} left to complete KYC and unlock full access.`
      : 'Complete your business KYC to unlock full access.';

  return { overdue, tone, title, eyebrow, sub };
}

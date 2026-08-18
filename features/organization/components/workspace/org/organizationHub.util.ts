import type { KycVerificationStatus, WorkspaceKyc } from '@/types/organization';

export function formatOrgHubDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return '';
  const d = new Date(iso.trim().replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function maskGstin(gstin: string | null | undefined): string | null {
  const value = gstin?.trim().toUpperCase();
  if (!value) return null;
  if (value.length < 4) return value;
  return `GSTIN ${'•'.repeat(Math.min(8, value.length - 3))}${value.slice(-3)}`;
}

export function formatOrgAddress(kyc: WorkspaceKyc | null): string | null {
  if (!kyc) return null;
  const parts = [
    kyc.address_line?.trim(),
    kyc.city?.trim(),
    kyc.state?.trim(),
    (kyc.address_pincode ?? kyc.pincode)?.trim(),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function orgHubStatusCopy(status: KycVerificationStatus): {
  kicker: string;
  body: string;
} {
  switch (status) {
    case 'verified':
      return { kicker: 'Verified business', body: '' };
    case 'pending':
      return {
        kicker: 'Verification in progress',
        body: '',
      };
    case 'rejected':
      return {
        kicker: 'Action required',
        body: 'We need you to update your verification.',
      };
    default:
      return {
        kicker: 'Verification incomplete',
        body: 'Complete your business verification.',
      };
  }
}

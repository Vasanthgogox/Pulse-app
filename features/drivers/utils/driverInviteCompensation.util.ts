import type { DriverInviteOffer } from '../services/drivers.service';

export type DriverInviteCompensation = {
  payableAmount: number | null;
  commissionPercent: number | null;
  commissionPerKm: number | null;
};

export function normalizeDriverInviteCompensation(
  offer: DriverInviteCompensation,
): DriverInviteCompensation {
  return {
    payableAmount:
      offer.payableAmount != null && offer.payableAmount > 0
        ? offer.payableAmount
        : null,
    commissionPercent:
      offer.commissionPercent != null && offer.commissionPercent > 0
        ? Math.min(100, offer.commissionPercent)
        : null,
    commissionPerKm:
      offer.commissionPerKm != null && offer.commissionPerKm > 0
        ? offer.commissionPerKm
        : null,
  };
}

export function hasDriverInviteCompensation(
  offer: DriverInviteCompensation,
): boolean {
  const normalized = normalizeDriverInviteCompensation(offer);
  return (
    normalized.payableAmount != null ||
    normalized.commissionPercent != null ||
    normalized.commissionPerKm != null
  );
}

export function validateDriverInviteCompensation(
  offer: DriverInviteCompensation,
): string | null {
  if (hasDriverInviteCompensation(offer)) return null;
  return 'Enter at least one pay term — fixed salary, commission %, or per km rate.';
}

export function toDriverInviteOffer(
  offer: DriverInviteCompensation,
): DriverInviteOffer {
  const normalized = normalizeDriverInviteCompensation(offer);
  return {
    payableAmount: normalized.payableAmount,
    commissionPercent: normalized.commissionPercent,
    commissionPerKm: normalized.commissionPerKm,
  };
}

type CompensationSource = {
  payable_amount?: number | null;
  commission_percent?: number | null;
  commission_per_km?: number | null;
};

/** Prefill reconnect invites with last-known terms (user must confirm in modal). */
export function suggestDriverInviteCompensation(
  ...sources: (CompensationSource | null | undefined)[]
): DriverInviteCompensation {
  for (const source of sources) {
    if (!source) continue;
    const payable =
      source.payable_amount != null && Number(source.payable_amount) > 0
        ? Number(source.payable_amount)
        : null;
    const commission =
      source.commission_percent != null && Number(source.commission_percent) > 0
        ? Number(source.commission_percent)
        : null;
    const perKm =
      source.commission_per_km != null && Number(source.commission_per_km) > 0
        ? Number(source.commission_per_km)
        : null;
    if (payable != null || commission != null || perKm != null) {
      return { payableAmount: payable, commissionPercent: commission, commissionPerKm: perKm };
    }
  }
  return { payableAmount: null, commissionPercent: null, commissionPerKm: null };
}

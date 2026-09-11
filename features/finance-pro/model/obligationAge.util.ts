import {
  OBLIGATION_AGE_BUCKETS,
  type ObligationAgeBucket,
} from "./financeProTypes";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

/** Pickup-age in whole days. Future / same-calendar-day pickup → 0. */
export function pickupAgeDays(
  pickupDate: string | null | undefined,
  now: Date,
): number | null {
  const d = parseDateOnly(pickupDate);
  if (!d) return null;
  const days = Math.floor((now.getTime() - d.getTime()) / MS_PER_DAY);
  return Math.max(0, days);
}

export function obligationAgeBucket(
  daysOld: number,
): ObligationAgeBucket {
  if (daysOld <= 0) return "current";
  if (daysOld <= 15) return "d1_15";
  if (daysOld <= 30) return "d16_30";
  if (daysOld <= 60) return "d31_60";
  return "d60";
}

export function emptyAgeMix(): Record<ObligationAgeBucket, number> {
  return {
    current: 0,
    d1_15: 0,
    d16_30: 0,
    d31_60: 0,
    d60: 0,
  };
}

export function isObligationAgeBucket(
  value: string | null | undefined,
): value is ObligationAgeBucket {
  return (
    typeof value === "string" &&
    (OBLIGATION_AGE_BUCKETS as readonly string[]).includes(value)
  );
}

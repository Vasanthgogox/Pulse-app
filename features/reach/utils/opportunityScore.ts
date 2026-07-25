/**
 * Opportunity priority scoring — deliberately simple heuristics for V2 so the
 * formula is explainable to fleet owners ("why 4 stars?"). The signals come
 * from get_reach_referral_inbox; an AI model can replace this function later
 * without any schema or UI change.
 */
import type { ReachReferralInboxRow } from '@/features/reach/services/driverReferrals.service';

export interface OpportunityScore {
  /** 1–5 stars shown on the card. */
  stars: number;
  /** e.g. "High confidence" / "Proven driver" / "New recommender". */
  confidence: string;
  /** Conversion rate over decided recommendations, 0–100. Null if no history. */
  successRate: number | null;
}

export function scoreOpportunity(row: ReachReferralInboxRow): OpportunityScore {
  const decided = row.driver_referrals_total;
  const successRate = decided > 0
    ? Math.round((row.driver_referrals_converted / decided) * 100)
    : null;

  let stars = 3; // neutral baseline for an unknown recommender
  if (row.driver_trips_completed >= 50) stars += 1;
  else if (row.driver_trips_completed >= 10) stars += 0.5;

  if (decided >= 3) {
    if ((successRate ?? 0) >= 60) stars += 1;
    else if ((successRate ?? 0) < 25) stars -= 1;
  }
  if (row.reason && row.reason !== 'other') stars += 0.5; // structured intent = better signal
  stars = Math.max(1, Math.min(5, Math.round(stars)));

  const confidence =
    stars >= 5
      ? 'High confidence'
      : stars === 4
        ? 'Proven driver'
        : decided === 0 && row.driver_trips_completed === 0
          ? 'New recommender'
          : stars <= 2
            ? 'Low conversion history'
            : 'Worth a look';

  return { stars, confidence, successRate };
}

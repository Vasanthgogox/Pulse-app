/**
 * Campaign Health + Smart Suggestions — Layer 4 (Intelligence), rules only.
 * Answers "is this campaign working?" instead of making the shipper read raw
 * numbers. Every rule is deliberately simple and explainable; an AI model can
 * replace this scoring later without any schema or UI change.
 *
 * Expectations are scaled by elapsed campaign time so a campaign launched an
 * hour ago isn't graded like one that has run its full duration.
 */
import type {
  ReachCampaignRow,
  ReachPlanRow,
} from '@/features/reach/services/campaigns.service';
import type { ReachDriverReferralRow } from '@/features/reach/services/driverReferrals.service';
import type { ReachCampaignMetrics } from '@/features/reach/services/analytics.service';

export type HealthRating = 'excellent' | 'good' | 'fair' | 'poor' | 'na';

export const HEALTH_RATING_LABELS: Record<HealthRating, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Needs Improvement',
  na: '—',
};

export interface CampaignHealthFactor {
  key: 'fleet_reach' | 'driver_reach' | 'conversion';
  label: string;
  rating: HealthRating;
  detail: string;
}

export interface CampaignSuggestion {
  id: string;
  title: string;
  body: string;
}

export interface CampaignHealth {
  /** 0–100. */
  score: number;
  verdict: 'Healthy' | 'Fair' | 'Needs Attention';
  factors: CampaignHealthFactor[];
  /** Remaining referral escrow (₹ / credits 1:1), null when rewards are off. */
  remainingRewardBudget: number | null;
  suggestions: CampaignSuggestion[];
}

const RATING_POINTS: Record<Exclude<HealthRating, 'na'>, number> = {
  excellent: 100,
  good: 75,
  fair: 50,
  poor: 25,
};

/** Fraction of the campaign's scheduled duration that has elapsed (0–1). */
function elapsedFraction(campaign: ReachCampaignRow): number {
  if (!campaign.published_at || !campaign.expires_at) return 1;
  const start = new Date(campaign.published_at).getTime();
  const end = new Date(campaign.expires_at).getTime();
  if (end <= start) return 1;
  return Math.min(1, Math.max(0.1, (Date.now() - start) / (end - start)));
}

function ratioRating(actual: number, expected: number): HealthRating {
  if (expected <= 0) return 'na';
  const r = actual / expected;
  if (r >= 1) return 'excellent';
  if (r >= 0.5) return 'good';
  if (r > 0) return 'fair';
  return 'poor';
}

export function computeCampaignHealth(input: {
  campaign: ReachCampaignRow;
  plan?: ReachPlanRow;
  metrics?: ReachCampaignMetrics | null;
  referrals: ReachDriverReferralRow[];
}): CampaignHealth {
  const { campaign, plan, metrics, referrals } = input;
  const elapsed = elapsedFraction(campaign);
  const impressions = metrics?.impressions ?? 0;
  const bids = metrics?.bids ?? 0;
  const hasDriverChannel = campaign.distribution_channels?.includes('driver') ?? false;

  const sent = referrals.length;
  const decided = referrals.filter((r) => r.status !== 'recommended').length;
  const converted = referrals.filter((r) => r.status === 'rewarded').length;

  // ── Fleet Reach: impressions vs the plan's promised minimum, time-scaled ──
  const expectedImpressions = (plan?.estimated_reach_min ?? 0) * elapsed;
  const fleetRating = ratioRating(impressions, expectedImpressions);
  const factors: CampaignHealthFactor[] = [
    {
      key: 'fleet_reach',
      label: 'Fleet Reach',
      rating: fleetRating,
      detail:
        fleetRating === 'na'
          ? 'No reach estimate for this plan'
          : `${impressions} impressions vs ~${Math.max(1, Math.round(expectedImpressions))} expected by now`,
    },
  ];

  // ── Driver Reach: recommendations generated (only when channel is on) ─────
  factors.push({
    key: 'driver_reach',
    label: 'Driver Reach',
    rating: !hasDriverChannel
      ? 'na'
      : sent >= 3
        ? 'excellent'
        : sent >= 1
          ? 'good'
          : elapsed < 0.35
            ? 'fair'
            : 'poor',
    detail: !hasDriverChannel
      ? 'Driver Stories are off'
      : sent === 0
        ? 'No recommendations yet'
        : `${sent} recommendation${sent === 1 ? '' : 's'} from drivers`,
  });

  // ── Opportunity Conversion: recommendations → trips, plus direct bids ─────
  const conversionRate = decided > 0 ? Math.round((converted / decided) * 100) : null;
  factors.push({
    key: 'conversion',
    label: 'Opportunity Conversion',
    rating:
      decided > 0
        ? (conversionRate ?? 0) >= 50
          ? 'excellent'
          : (conversionRate ?? 0) >= 25
            ? 'good'
            : converted > 0
              ? 'fair'
              : 'poor'
        : bids > 0
          ? 'good'
          : sent > 0
            ? 'fair'
            : 'na',
    detail:
      decided > 0
        ? `${converted} of ${decided} decided recommendations became trips (${conversionRate}%)`
        : bids > 0
          ? `${bids} direct bid${bids === 1 ? '' : 's'} received`
          : sent > 0
            ? 'Recommendations awaiting fleet owner decisions'
            : 'No bids or conversions yet',
  });

  // ── Score: average of rated factors ───────────────────────────────────────
  const rated = factors.filter((f) => f.rating !== 'na');
  const score =
    rated.length > 0
      ? Math.round(
          rated.reduce((sum, f) => sum + RATING_POINTS[f.rating as Exclude<HealthRating, 'na'>], 0) /
            rated.length,
        )
      : 50;
  const verdict: CampaignHealth['verdict'] =
    score >= 75 ? 'Healthy' : score >= 50 ? 'Fair' : 'Needs Attention';

  // ── Smart Suggestions: simple rules, active campaigns only ────────────────
  const suggestions: CampaignSuggestion[] = [];
  if (campaign.status === 'active') {
    if (!hasDriverChannel) {
      suggestions.push({
        id: 'enable_driver_stories',
        title: 'Enable Driver Stories',
        body: 'Distributing to driver feeds generates recommendations on top of direct bids — campaigns with the driver channel typically see meaningfully more opportunities.',
      });
    } else if (!campaign.driver_reward_enabled) {
      suggestions.push({
        id: 'enable_rewards',
        title: 'Add a referral reward',
        body: 'Driver Stories are on, but there is no incentive to recommend. A flat reward (e.g. ₹500) gives drivers a reason to bring this load to their fleet owner.',
      });
    } else {
      if (campaign.reward_reserved < campaign.reward_amount) {
        suggestions.push({
          id: 'budget_exhausted',
          title: 'Referral budget exhausted',
          body: 'Remaining escrow can no longer cover a reward, so new recommendations have stopped earning. Boost again with a larger Maximum Referral Budget to keep the driver network working.',
        });
      } else if (sent >= 2 && converted === 0 && decided >= 2 && campaign.reward_amount < 750) {
        suggestions.push({
          id: 'increase_reward',
          title: `Increase reward to ₹${campaign.reward_amount + 250}`,
          body: 'Recommendations are coming in but not converting. A higher reward pushes drivers to recommend loads their fleet owner will actually take.',
        });
      }
    }
    if (impressions >= 10 && bids === 0 && sent === 0) {
      suggestions.push({
        id: 'upgrade_plan',
        title: 'Upgrade to a higher tier',
        body: 'The story is being seen but not acted on. A higher plan extends duration and reach beyond your connections, putting the load in front of more fleet owners.',
      });
    }
  }

  return {
    score,
    verdict,
    factors,
    remainingRewardBudget: campaign.driver_reward_enabled ? campaign.reward_reserved : null,
    suggestions: suggestions.slice(0, 3),
  };
}

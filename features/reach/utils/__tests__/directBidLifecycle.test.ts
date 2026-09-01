import {
  compareLoadOpportunities,
  dedupeDriverReachStories,
  directBidUiBucket,
  isLoadOpportunity,
  matchesBidStatusFilter,
} from '@/features/reach/utils/directBidLifecycle';
import type { DriverReachStoryRow } from '@/features/reach/services/driverReferrals.service';

function story(
  overrides: Partial<DriverReachStoryRow> & { post_id: string; campaign_id: string },
): DriverReachStoryRow {
  return {
    campaign_org_id: 'org',
    org_name: 'Shipper',
    org_logo_url: null,
    campaign_status: 'active',
    published_at: '2026-08-01T00:00:00Z',
    posted_at: '2026-08-01T00:00:00Z',
    expires_at: null,
    source_deleted_at: null,
    snapshot_post_type: 'LOAD',
    snapshot_title: null,
    snapshot_origin: 'Delhi',
    snapshot_destination: 'Bengaluru',
    snapshot_vehicle_type: 'Container 20ft',
    snapshot_material: 'Textiles',
    snapshot_content: null,
    snapshot_rate_offer: 50000,
    driver_reward_enabled: false,
    reward_amount: 0,
    reward_available: false,
    referral_id: null,
    referral_status: null,
    referral_reward_amount: null,
    recommended_at: null,
    rewarded_at: null,
    direct_bid_status: null,
    direct_bid_amount: null,
    direct_bid_counter_amount: null,
    ...overrides,
  };
}

describe('directBidLifecycle LOADS feed', () => {
  it('dedupes multiple campaigns for the same post', () => {
    const rows = dedupeDriverReachStories([
      story({
        post_id: 'post-1',
        campaign_id: 'c1',
        published_at: '2026-08-01T00:00:00Z',
        direct_bid_status: 'accepted',
        direct_bid_amount: 50000,
      }),
      story({
        post_id: 'post-1',
        campaign_id: 'c2',
        published_at: '2026-08-02T00:00:00Z',
        direct_bid_status: 'accepted',
        direct_bid_amount: 50000,
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.campaign_id).toBe('c2');
  });

  it('prefers quoted over open when deduping', () => {
    const rows = dedupeDriverReachStories([
      story({ post_id: 'post-1', campaign_id: 'c-open', direct_bid_status: null }),
      story({
        post_id: 'post-1',
        campaign_id: 'c-quoted',
        direct_bid_status: 'pending',
        direct_bid_amount: 48000,
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(directBidUiBucket(rows[0]!)).toBe('quoted');
  });

  it('treats awarded and rewarded as non-opportunities', () => {
    expect(
      isLoadOpportunity(
        story({
          post_id: 'p',
          campaign_id: 'c',
          direct_bid_status: 'accepted',
          direct_bid_amount: 1,
        }),
      ),
    ).toBe(false);
    expect(
      isLoadOpportunity(
        story({
          post_id: 'p',
          campaign_id: 'c',
          referral_status: 'rewarded',
        }),
      ),
    ).toBe(false);
  });

  it('all filter hides awarded jobs', () => {
    const awarded = story({
      post_id: 'p',
      campaign_id: 'c',
      direct_bid_status: 'accepted',
      direct_bid_amount: 50000,
    });
    expect(matchesBidStatusFilter(awarded, 'all')).toBe(false);
    expect(
      matchesBidStatusFilter(
        story({ post_id: 'p2', campaign_id: 'c2', direct_bid_status: null }),
        'all',
      ),
    ).toBe(true);
  });

  it('hides completed-campaign and rejected history from opportunities', () => {
    expect(
      isLoadOpportunity(
        story({
          post_id: 'p',
          campaign_id: 'c',
          campaign_status: 'completed',
          direct_bid_status: null,
        }),
      ),
    ).toBe(false);
    expect(
      isLoadOpportunity(
        story({
          post_id: 'p',
          campaign_id: 'c',
          direct_bid_status: 'rejected',
        }),
      ),
    ).toBe(false);
  });

  it('sorts counter before open', () => {
    expect(
      compareLoadOpportunities(
        { bucket: 'counter', matchesFleet: false },
        { bucket: 'open', matchesFleet: true },
      ),
    ).toBeLessThan(0);
  });
});

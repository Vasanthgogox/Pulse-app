/**
 * FO / independent driver direct-bid lifecycle labels for Stories list.
 * Counter uses counter_amount (pending + counter); award uses accepted.
 */
import type { DriverReachStoryRow } from '@/features/reach/services/driverReferrals.service';
import { positiveMoneyOrNull } from '@/lib/format';

export type DirectBidUiBucket =
  | 'open'
  | 'quoted'
  | 'counter'
  | 'awarded'
  | 'rejected'
  | 'other';

export type BidStatusFilter = 'all' | 'quoted' | 'counter' | 'awarded';

export function directBidUiBucket(story: DriverReachStoryRow): DirectBidUiBucket {
  const status = story.direct_bid_status;
  if (status === 'accepted') return 'awarded';
  if (status === 'rejected') return 'rejected';
  if (status === 'pending') {
    const counter = positiveMoneyOrNull(story.direct_bid_counter_amount);
    if (counter != null) return 'counter';
    return 'quoted';
  }
  if (status == null) return 'open';
  return 'other';
}

export function matchesBidStatusFilter(
  story: DriverReachStoryRow,
  filter: BidStatusFilter,
): boolean {
  if (filter === 'all') return true;
  return directBidUiBucket(story) === filter;
}

export function bidStatusFilterLabel(filter: BidStatusFilter): string {
  switch (filter) {
    case 'quoted':
      return 'Bid submitted';
    case 'counter':
      return 'Counter received';
    case 'awarded':
      return 'Awarded';
    default:
      return 'All';
  }
}

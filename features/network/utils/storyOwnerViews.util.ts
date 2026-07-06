import type { StoryViewRow } from "@/features/network/services/story-views.service";
import type { StoryOwnerBidRow } from "@/features/network/utils/bidding/storyOwnerBids.util";

export type StoryOwnerViewRow = {
  key: string;
  orgId: string;
  orgName: string;
  viewedAt: string;
};

/**
 * Merge recorded story views with bidders who placed offers but may not have
 * a story_views row (e.g. bid via load center link without opening the story).
 */
export function buildStoryOwnerViewRows(
  views: StoryViewRow[],
  bids: StoryOwnerBidRow[],
): StoryOwnerViewRow[] {
  const bidderNameByOrg = new Map(
    bids.map((b) => [b.bidderOrgId, b.bidderName] as const),
  );
  const seen = new Set<string>();
  const rows: StoryOwnerViewRow[] = [];

  for (const view of views) {
    seen.add(view.viewer_org_id);
    const fromBid = bidderNameByOrg.get(view.viewer_org_id);
    rows.push({
      key: `view-${view.id}`,
      orgId: view.viewer_org_id,
      orgName:
        view.viewer_org_name?.trim() ||
        fromBid ||
        "Partner",
      viewedAt: view.viewed_at,
    });
  }

  for (const bid of bids) {
    if (seen.has(bid.bidderOrgId)) continue;
    seen.add(bid.bidderOrgId);
    rows.push({
      key: `bid-${bid.key}`,
      orgId: bid.bidderOrgId,
      orgName: bid.bidderName,
      viewedAt: bid.createdAt,
    });
  }

  return rows.sort(
    (a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime(),
  );
}

export function storyOwnerViewsLabel(count: number, loading: boolean): string {
  if (loading) return "…";
  if (count === 0) return "No views yet";
  if (count === 1) return "1 viewed";
  return `${count} viewed`;
}

export function toStoryViewRows(
  rows: StoryOwnerViewRow[],
  postId: string,
): StoryViewRow[] {
  return rows.map((row) => ({
    id: row.key,
    post_id: postId,
    viewer_org_id: row.orgId,
    viewer_org_name: row.orgName,
    viewer_user_id: "",
    viewed_at: row.viewedAt,
  }));
}

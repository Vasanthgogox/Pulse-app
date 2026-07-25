/** Shared formatting for campaign countdowns/status — used by BoostProgressSheet,
 * ReachCampaignCard, and ReachCampaignDetailScreen so "time remaining" never
 * drifts between the sheet and the full-screen views. */

import type { ReachCampaignRow, ReachCampaignStatus } from "@/features/reach/services/campaigns.service";

export function formatRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Ending soon";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "< 1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export type ReachCampaignStatusForDisplay = "draft" | "active" | "completed" | "cancelled";

export const CANCEL_REASON_LABEL: Record<string, string> = {
  source_deleted: "Original story deleted",
  user_cancelled: "Cancelled by org",
};

export function cancelReasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  return CANCEL_REASON_LABEL[reason] ?? reason;
}

/**
 * Trip identity for cards. The INDENT is the stable trip identity — the same
 * load re-broadcast as a new story keeps the same id. Prefers the REAL
 * operational indent code (IND001 / GGV234-IND-001 — identical to what Trips
 * and Indents screens show, via getReachCampaignsForOrg enrichment). Falls
 * back to a UUID fragment only when the indent row is no longer readable,
 * then to the post id (ad-hoc stories), then the campaign id.
 */
export function formatReachTripId(campaign: ReachCampaignRow): string {
  if (campaign.indent_display_code) {
    return `# ${campaign.indent_display_code}`;
  }
  if (campaign.snapshot_source_indent_id) {
    const raw = campaign.snapshot_source_indent_id.replace(/-/g, "").slice(0, 8).toUpperCase();
    return `# INDENT ${raw}`;
  }
  const raw = (campaign.post_id ?? campaign.id).replace(/-/g, "").slice(0, 8).toUpperCase();
  return `# TRIP ${raw}`;
}

const STATUS_RANK: Record<ReachCampaignStatus, number> = {
  active: 0,
  draft: 1,
  completed: 2,
  cancelled: 3,
};

/** Roll up a trip group's status for the collapsed badge (prefer active). */
export function rollupCampaignStatus(campaigns: ReachCampaignRow[]): ReachCampaignStatus {
  let best: ReachCampaignStatus = campaigns[0]?.status ?? "completed";
  for (const c of campaigns) {
    if (STATUS_RANK[c.status] < STATUS_RANK[best]) best = c.status;
  }
  return best;
}

/**
 * Group campaigns that boost the same trip so Home + History can show one
 * trip card with drill-down instead of duplicate identity rows. Grouping key
 * is the source INDENT when present (same load re-broadcast as different
 * posts still groups together), else the post, else solo.
 * Order preserved by first-seen campaign (already newest-first from the query).
 */
export function groupReachCampaignsByPost(campaigns: ReachCampaignRow[]): ReachCampaignRow[][] {
  const map = new Map<string, ReachCampaignRow[]>();
  const order: string[] = [];
  for (const c of campaigns) {
    const key = c.snapshot_source_indent_id
      ? `indent:${c.snapshot_source_indent_id}`
      : c.post_id
        ? `post:${c.post_id}`
        : `solo:${c.id}`;
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(c);
    } else {
      map.set(key, [c]);
      order.push(key);
    }
  }
  return order.map((k) => map.get(k)!);
}

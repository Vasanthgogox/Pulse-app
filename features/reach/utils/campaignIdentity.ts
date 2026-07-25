/**
 * Shared identity helpers for Reach studio cards / driver-feed preview.
 */
import type { ReachCampaignRow } from "@/features/reach/services/campaigns.service";
import {
  classifyStoredPostType,
  displayStoryContent,
  formatStoryDate,
} from "@/features/network/utils/storyDisplay";
import { formatReachTripId } from "@/features/reach/utils/campaignFormat";

export function getCampaignIdentity(campaign: ReachCampaignRow) {
  const postType = classifyStoredPostType(campaign.snapshot_post_type, campaign.snapshot_content);
  const isLoad = postType === "LOAD";
  const isVehicle = postType === "VEHICLE_AVAILABILITY";
  const content = displayStoryContent(campaign.snapshot_content);

  const title = isLoad
    ? campaign.snapshot_material?.trim() || "Load"
    : isVehicle
      ? "Vehicle Available"
      : content?.split("\n")[0]?.trim() || "Update";

  const route =
    isLoad && campaign.snapshot_origin && campaign.snapshot_destination
      ? `${campaign.snapshot_origin} → ${campaign.snapshot_destination}`
      : isVehicle && campaign.snapshot_origin
        ? campaign.snapshot_origin
        : null;

  const truck = campaign.snapshot_vehicle_type?.trim() || null;
  const initials = title.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "PR";
  const tripId = formatReachTripId(campaign);
  const postedLabel = campaign.snapshot_posted_at
    ? `Posted ${formatStoryDate(campaign.snapshot_posted_at)}`
    : null;

  return { title, route, truck, initials, tripId, postedLabel, postType, isLoad, isVehicle };
}

/**
 * Grow your network — discover grid/list tile (delegates to NetworkPartyProfileCard).
 */
import { NetworkPartyProfileCard } from "@/features/network/components/NetworkPartyProfileCard";
import { NETWORK_PROFILE_CARD_HEIGHT } from "@/features/network/constants/networkProfileCardLayout";

export type NetworkDiscoverProfileCardProps = {
  orgId: string;
  name: string;
  avatarSeed?: string | null;
  locationLabel: string;
  locationUnset?: boolean;
  totalTrips?: number | null;
  ratingValue?: number | null;
  mutualCount?: number;
  connectionStatus: "none" | "pending" | "approved" | string;
  isRecommended?: boolean;
  loading?: boolean;
  layout?: "grid" | "list";
  onOpenProfile?: () => void;
  onConnect?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
  onPressMutuals?: () => void;
  viewerOrgId?: string | null;
  onPressMutual?: (org: { id: string; name: string; avatar_seed: string | null }) => void;
};

export function NetworkDiscoverProfileCard({
  layout = "grid",
  orgId,
  name,
  avatarSeed,
  locationLabel,
  locationUnset = false,
  totalTrips,
  ratingValue,
  mutualCount = 0,
  connectionStatus,
  isRecommended = false,
  loading = false,
  onOpenProfile,
  onConnect,
  onCancel,
  onDismiss,
  onPressMutuals,
  viewerOrgId,
  onPressMutual,
}: NetworkDiscoverProfileCardProps) {
  return (
    <NetworkPartyProfileCard
      partyId={orgId}
      name={name}
      layout={layout}
      enlargeGridPartyOnDesktop={false}
      enlargeListPartyOnDesktop={false}
      avatarSeed={avatarSeed}
      entityType="client"
      primaryMeta={locationLabel}
      primaryMetaUnset={locationUnset}
      totalTrips={totalTrips}
      ratingValue={ratingValue}
      mutualCount={mutualCount}
      recommendedHighlight={isRecommended}
      showTopMetrics={layout === "grid"}
      showStatsRow={layout === "list"}
      primaryMetaIcon="map-pin"
      showFullProfileLink={Boolean(onOpenProfile)}
      onOpenProfile={onOpenProfile}
      connectionStatus={connectionStatus}
      loading={loading}
      onConnect={onConnect}
      onCancel={onCancel}
      onDismiss={onDismiss}
      onPressMutuals={onPressMutuals}
      viewerOrgId={viewerOrgId}
      onPressMutual={onPressMutual}
    />
  );
}

export const NETWORK_DISCOVER_CARD_FIXED_HEIGHT = NETWORK_PROFILE_CARD_HEIGHT;

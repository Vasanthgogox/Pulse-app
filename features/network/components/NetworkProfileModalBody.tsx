/**
 * Network profile modal body — hub hex hero layout (aligned with org network page).
 */
import { NetworkProfileHubHero } from "@/features/network/components/NetworkProfileHubHero";
import { View } from "react-native";

export type NetworkProfileModalNode = {
  id: string;
  name: string;
  type: "CLIENT" | "SUPPLIER" | "DRIVER";
  location: string;
  status: "CONNECTED" | "REQUEST SENT" | "LIVE";
  rating: number | null;
  mutuals: number;
  phone?: string | null;
  avatar_url?: string | null;
  avatar_seed?: string | null;
  is_integrated?: boolean;
};

export type NetworkProfileModalBodyProps = {
  node: NetworkProfileModalNode;
  /** @deprecated Modal is always compact; kept for call-site compatibility. */
  isMobile?: boolean;
  profileStatsLoading: boolean;
  totalTrips: number;
  onClose?: () => void;
};

function formatConnectionStatus(status: NetworkProfileModalNode["status"]): string {
  return status.replace(/_/g, " ");
}

function entityTypeFromRole(
  type: NetworkProfileModalNode["type"],
): "client" | "supplier" | "driver" {
  if (type === "DRIVER") return "driver";
  if (type === "SUPPLIER") return "supplier";
  return "client";
}

export function NetworkProfileModalBody({
  node,
  profileStatsLoading,
  totalTrips,
  onClose,
}: NetworkProfileModalBodyProps) {
  const connectionLabel = formatConnectionStatus(node.status);
  const ratingNum = node.rating;
  const ratingEmpty = ratingNum == null;
  const ratingValue = ratingEmpty ? "—" : ratingNum.toFixed(1);
  const tripsValue = profileStatsLoading ? "…" : String(totalTrips);
  const inApp =
    node.is_integrated ?? (node.status === "CONNECTED" || node.status === "LIVE");

  return (
    <View style={{ width: "100%", borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden" }}>
      <NetworkProfileHubHero
        name={node.name}
        roleLabel={node.type}
        location={node.location}
        phone={node.phone ?? null}
        entityType={entityTypeFromRole(node.type)}
        avatarUrl={node.avatar_url}
        avatarSeed={node.avatar_seed}
        showVerified={inApp}
        inApp={inApp}
        connectionStatus={connectionLabel}
        onClose={onClose}
        stats={[
          { value: tripsValue, label: "trips" },
          { value: ratingValue, label: "rating" },
          { value: String(node.mutuals), label: "mutuals" },
        ]}
      />
    </View>
  );
}

/**
 * Network profile modal body — invitation-hub card layout.
 */
import {
  NetworkProfileInviteHero,
  NetworkProfileInviteStats,
} from "@/features/network/components/NetworkProfileInviteHero";
import { networkProfileInviteStyles as s } from "@/features/network/components/networkProfileInvite.styles";
import * as Linking from "expo-linking";
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
};

function formatConnectionStatus(status: NetworkProfileModalNode["status"]): string {
  return status.replace(/_/g, " ");
}

function presenceLabel(status: NetworkProfileModalNode["status"]): string {
  if (status === "CONNECTED" || status === "LIVE") return "LIVE";
  return "Pending";
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
}: NetworkProfileModalBodyProps) {
  const connectionLabel = formatConnectionStatus(node.status);
  const presenceValue = presenceLabel(node.status);
  const linkLive = node.status === "CONNECTED" || node.status === "LIVE";
  const ratingNum = node.rating;
  const ratingEmpty = ratingNum == null;
  const ratingDisplay = ratingEmpty ? "No rating" : `${ratingNum.toFixed(1)}★`;
  const tripsValue = profileStatsLoading ? "…" : String(totalTrips);

  const openPhone = () => {
    if (!node.phone) return;
    const tel = node.phone.replace(/\s/g, "");
    void Linking.openURL(`tel:${tel}`);
  };

  return (
    <View style={{ width: "100%" }}>
      <NetworkProfileInviteHero
        name={node.name}
        subtitle={node.location}
        roleLabel={node.type}
        linkLabel={connectionLabel}
        linkLive={linkLive}
        ratingDisplay={ratingDisplay}
        ratingEmpty={ratingEmpty}
        entityType={entityTypeFromRole(node.type)}
        avatarUrl={node.avatar_url}
        avatarSeed={node.avatar_seed}
        showVerified={node.is_integrated ?? false}
        phone={node.phone ?? null}
        onPressPhone={node.phone ? openPhone : undefined}
        avatarSize={80}
        style={s.card}
        footer={
          <NetworkProfileInviteStats
            items={[
              { label: "AVG RATING", value: ratingEmpty ? "—" : ratingNum!.toFixed(1) },
              { label: "TRIPS", value: tripsValue },
              { label: "PRESENCE", value: presenceValue, live: linkLive },
              { label: "MUTUALS", value: String(node.mutuals) },
            ]}
          />
        }
      />
    </View>
  );
}

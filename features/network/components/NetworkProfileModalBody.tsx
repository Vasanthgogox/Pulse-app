/**
 * Network profile modal body — hub hex hero layout (aligned with org network page).
 */
import { NetworkProfileHubHero } from "@/features/network/components/NetworkProfileHubHero";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import {
  Building2,
  Globe,
  MapPin,
  ShieldCheck,
} from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

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
  /** Enriched from snapshot */
  registered_address?: string | null;
  branch_count?: number;
  sector?: string | null;
  website?: string | null;
  gstin?: string | null;
  operating_model?: string | null;
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
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
  isMobile = false,
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

  const hasEnrichedData =
    node.registered_address ||
    (node.branch_count ?? 0) > 0 ||
    node.sector ||
    node.website ||
    node.gstin ||
    node.operating_model;

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
        compact={isMobile}
        stats={[
          { value: tripsValue, label: "trips" },
          { value: ratingValue, label: "rating" },
          { value: String(node.mutuals), label: "mutuals" },
        ]}
      />

      {hasEnrichedData ? (
        <View style={s.enrichedSection}>
          {node.sector ? (
            <View style={s.enrichedRow}>
              <Building2 size={13} color={METRONIC.muted} strokeWidth={2} />
              <Text style={s.enrichedLabel}>Sector</Text>
              <Text style={s.enrichedValue}>{node.sector}</Text>
            </View>
          ) : null}
          {node.operating_model ? (
            <View style={s.enrichedRow}>
              <ShieldCheck size={13} color={METRONIC.muted} strokeWidth={2} />
              <Text style={s.enrichedLabel}>Model</Text>
              <Text style={s.enrichedValue}>{node.operating_model.replace(/_/g, " ")}</Text>
            </View>
          ) : null}
          {(node.branch_count ?? 0) > 0 ? (
            <View style={s.enrichedRow}>
              <MapPin size={13} color={METRONIC.muted} strokeWidth={2} />
              <Text style={s.enrichedLabel}>Offices</Text>
              <Text style={s.enrichedValue}>
                {node.branch_count} location{(node.branch_count ?? 0) > 1 ? "s" : ""}
              </Text>
            </View>
          ) : null}
          {node.registered_address ? (
            <View style={s.enrichedRow}>
              <MapPin size={13} color={METRONIC.muted} strokeWidth={2} />
              <Text style={s.enrichedLabel}>Address</Text>
              <Text style={[s.enrichedValue, { flex: 1 }]} numberOfLines={2}>
                {node.registered_address}
              </Text>
            </View>
          ) : null}
          {node.gstin ? (
            <View style={s.enrichedRow}>
              <ShieldCheck size={13} color={METRONIC.muted} strokeWidth={2} />
              <Text style={s.enrichedLabel}>GSTIN</Text>
              <Text style={s.enrichedValue}>{node.gstin}</Text>
            </View>
          ) : null}
          {node.website ? (
            <View style={s.enrichedRow}>
              <Globe size={13} color={METRONIC.muted} strokeWidth={2} />
              <Text style={s.enrichedLabel}>Website</Text>
              <Text style={[s.enrichedValue, { color: "#3E97FF" }]} numberOfLines={1}>
                {node.website}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  enrichedSection: {
    backgroundColor: "#FAFAFA",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: METRONIC.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  enrichedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  enrichedLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.muted,
    width: 56,
    flexShrink: 0,
    marginTop: 1,
  },
  enrichedValue: {
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.text,
    flexShrink: 1,
    lineHeight: 17,
  },
});

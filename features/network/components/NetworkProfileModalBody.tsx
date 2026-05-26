/**
 * Network profile modal body — compact layout (modal max ~420px).
 */
import { EntityAvatar } from "@/components/EntityAvatar";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";
import {
  NetworkProfileGlassPanel,
} from "@/features/network/components/NetworkProfileGlassShell";
import {
  NetworkProfileDepthIcon,
  type NetworkProfileDepthIconVariant,
} from "@/features/network/components/NetworkProfileDepthIcon";
import { NetworkProfileMetricTile } from "@/features/network/components/NetworkProfileMetricTile";
import { MapPin, Verified } from "lucide-react-native";
import * as Linking from "expo-linking";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

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

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaChip}>
      <Text style={styles.metaChipLabel}>{label}</Text>
      <Text style={styles.metaChipValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function StatCell({
  variant,
  label,
  value,
  valueTone = "default",
}: {
  variant: NetworkProfileDepthIconVariant;
  label: string;
  value: string;
  valueTone?: "default" | "live";
}) {
  return (
    <NetworkProfileMetricTile
      layout="stat"
      variant={variant}
      label={label}
      value={value}
      valueTone={valueTone}
      style={styles.statCell}
    />
  );
}

export function NetworkProfileModalBody({
  node,
  profileStatsLoading,
  totalTrips,
}: NetworkProfileModalBodyProps) {
  const connectionLabel = formatConnectionStatus(node.status);
  const presenceValue = presenceLabel(node.status);
  const ratingValue = node.rating != null ? node.rating.toFixed(1) : "New";
  const tripsValue = profileStatsLoading ? "…" : String(totalTrips);

  const openPhone = () => {
    if (!node.phone) return;
    const tel = node.phone.replace(/\s/g, "");
    void Linking.openURL(`tel:${tel}`);
  };

  return (
    <View style={styles.root}>
      <NetworkProfileGlassPanel style={styles.heroPanel}>
        <View style={styles.heroRow}>
          <View style={styles.avatarWrap}>
            <EntityAvatar
              name={node.name}
              avatarUrl={node.avatar_url}
              avatarSeed={node.avatar_seed}
              entityType={
                node.type === "DRIVER"
                  ? "driver"
                  : node.type === "SUPPLIER"
                    ? "supplier"
                    : "client"
              }
              isIntegrated={node.is_integrated ?? false}
              size={56}
              showIntegrationBadge={false}
            />
          </View>
          <View style={styles.heroTextCol}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={2}>
                {node.name.toUpperCase()}
              </Text>
              <Verified size={12} color={Theme.textSecondary} strokeWidth={2.2} />
            </View>
            <View style={styles.locationRow}>
              <MapPin size={10} color={Theme.textMuted} strokeWidth={2} />
              <Text style={styles.location} numberOfLines={2}>
                {node.location}
              </Text>
            </View>
            <View style={styles.metaChipRow}>
              <MetaChip label="Role" value={node.type} />
              <MetaChip label="Link" value={connectionLabel} />
            </View>
          </View>
        </View>
      </NetworkProfileGlassPanel>

      {node.phone ? (
        <Pressable
          onPress={openPhone}
          style={({ pressed }) => [styles.phoneStrip, pressed && { opacity: 0.88 }]}
          accessibilityRole="button"
          accessibilityLabel={`Call ${node.phone}`}
        >
          <NetworkProfileDepthIcon variant="phone" size="sm" bare />
          <View style={styles.phoneTextCol}>
            <Text style={styles.phoneLabel}>Phone</Text>
            <Text style={styles.phoneValue} numberOfLines={1}>
              {node.phone}
            </Text>
          </View>
        </Pressable>
      ) : null}

      <Text style={styles.sectionKicker}>Overview</Text>
      <View style={styles.statsGrid}>
        <StatCell variant="rating" label="Avg rating" value={ratingValue} />
        <StatCell variant="trips" label="Trips" value={tripsValue} />
        <StatCell
          variant="presence"
          label="Presence"
          value={presenceValue}
          valueTone={node.status === "CONNECTED" ? "live" : "default"}
        />
        <StatCell variant="mutuals" label="Mutuals" value={String(node.mutuals)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    gap: 8,
  },
  heroPanel: {
    width: "100%",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarWrap: {
    padding: 2,
    borderRadius: 14,
    backgroundColor: Theme.networkGlassSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.networkGlassBorder,
    flexShrink: 0,
  },
  heroTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  name: {
    flex: 1,
    minWidth: 0,
    ...FinanceTxnTypography.partyTitle,
    lineHeight: 15,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  location: {
    flex: 1,
    minWidth: 0,
    ...FinanceTxnTypography.dateLine,
    lineHeight: 12,
  },
  metaChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  metaChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 23, 42, 0.08)",
    maxWidth: "100%",
  },
  metaChipLabel: {
    ...FinanceTxnTypography.chipLabel,
    marginBottom: 1,
  },
  metaChipValue: {
    ...FinanceTxnTypography.fieldValue,
    fontWeight: "500",
    fontStyle: "normal",
    lineHeight: 12,
  },
  phoneStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    width: "100%",
  },
  phoneTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  phoneLabel: {
    ...FinanceTxnTypography.fieldLabel,
    lineHeight: 11,
  },
  phoneValue: {
    ...FinanceTxnTypography.amount,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
  },
  sectionKicker: {
    ...FinanceTxnTypography.columnTitle,
    marginTop: 2,
    marginBottom: -2,
    paddingHorizontal: 2,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 6,
    width: "100%",
  },
  statCell: {
    flexBasis: "48%",
    maxWidth: "48%",
    flexGrow: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
});

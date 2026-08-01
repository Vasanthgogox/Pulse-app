/**
 * Compact indent card for Broadcast story picker (create-post).
 */
import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import { LoadCardSpecsRow } from "@/components/LoadCardSpecsRow";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";
import { BidReceivedHammer, getIndentDisplayNumber, type IndentRow } from "@/features/indents";
import {
  giveLoadBidReceivedDisplayStatus,
  giveLoadStatusPillLabel,
  giveLoadStatusPillStyles,
} from "@/features/network/utils/loadCenter.model";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

function formatIndentCardDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d
      .toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      .toUpperCase();
  } catch {
    return "—";
  }
}

type BroadcastPickIndentCardProps = {
  load: IndentRow;
  selected: boolean;
  bidCount: number;
  onPress: () => void;
};

export function BroadcastPickIndentCard({
  load,
  selected,
  bidCount,
  onPress,
}: BroadcastPickIndentCardProps) {
  const status = (load.status || "").toLowerCase();
  const derivedStatus = giveLoadBidReceivedDisplayStatus(status, bidCount);
  const statusPill = giveLoadStatusPillStyles(derivedStatus);
  const statusLabel = giveLoadStatusPillLabel(status, bidCount);
  const vehicleDetail = load.vehicle_type || "—";
  const weightValue = Number(load.weight);
  const weightDetail =
    Number.isFinite(weightValue) && weightValue > 0 ? `${weightValue} KG` : "—";
  const loadTypeDetail = load.load_type || "—";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.loadCard,
        selected && styles.loadCardSelected,
        pressed && styles.loadCardPressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${getIndentDisplayNumber(load)} ${load.pickup_area} to ${load.drop_location}. ${selected ? "Selected" : "Select to broadcast"}`}
    >
      <View style={styles.loadCardHead}>
        <View style={styles.loadPillRow}>
          <View style={styles.loadTypePill}>
            <Text style={styles.loadTypePillText}>Give load</Text>
          </View>
          <View style={[styles.loadStatePill, statusPill.pill]}>
            <Text style={[styles.loadStatePillText, statusPill.text]}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <View style={styles.headRight}>
          {selected ? (
            <View style={styles.checkBubble}>
              <Check size={12} color={Theme.buttonPrimaryText} strokeWidth={3} />
            </View>
          ) : null}
          <Text style={styles.loadCardDate}>{formatIndentCardDate(load.pickup_date)}</Text>
        </View>
      </View>

      <LoadCardRouteRow
        origin={load.pickup_area || "—"}
        destination={load.drop_location || "—"}
        compact
      />

      <Text style={styles.loadCardId} numberOfLines={1}>
        {getIndentDisplayNumber(load)}
      </Text>

      <View style={styles.loadCardSpecsPanel}>
        <LoadCardSpecsRow
          vehicle={vehicleDetail}
          weight={weightDetail}
          loadType={loadTypeDetail}
        />
      </View>

      <View style={styles.pickerHintRow}>
        {bidCount > 0 ? (
          <BidReceivedHammer visible size={13} />
        ) : (
          <FontAwesome name="gavel" size={12} color={Theme.textMuted} />
        )}
        <Text style={styles.loadCardMetaText} numberOfLines={1}>
          {bidCount} bid{bidCount === 1 ? "" : "s"} · Tap for story
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loadCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 10,
    marginBottom: 0,
    overflow: "hidden",
  },
  loadCardSelected: {
    borderColor: Theme.primary,
    borderWidth: 1.5,
  },
  loadCardPressed: { opacity: 0.92 },
  loadCardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 6,
  },
  headRight: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  checkBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  loadCardDate: {
    ...FinanceTxnTypography.dateLine,
    fontSize: 8,
    lineHeight: 11,
  },
  loadPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    minWidth: 0,
    flexWrap: "wrap",
  },
  loadTypePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  loadTypePillText: {
    ...FinanceTxnTypography.chipLabel,
    color: Theme.textRouteCard,
    fontWeight: "600",
  },
  loadStatePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  loadStatePillText: {
    ...FinanceTxnTypography.chipLabel,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  loadCardId: {
    ...FinanceTxnTypography.tripId,
    marginBottom: 6,
    lineHeight: 11,
  },
  loadCardSpecsPanel: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    marginBottom: 6,
  },
  pickerHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  loadCardMetaText: {
    ...FinanceTxnTypography.chipLabel,
    flex: 1,
    minWidth: 0,
    color: Theme.textRouteCard,
    fontWeight: "500",
  },
});

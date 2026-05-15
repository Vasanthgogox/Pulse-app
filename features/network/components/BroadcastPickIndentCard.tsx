/**
 * GIVE LOAD card layout aligned with Load Center — used when picking an indent
 * to broadcast as a 24h story (create-post).
 */
import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import Theme from "@/constants/Theme";
import { BidReceivedHammer, getIndentDisplayNumber, type IndentRow } from "@/features/indents";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Check } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

function giveLoadStatusPillStyles(status: string): { pill: object; text: object } {
  const s = (status || "").toLowerCase();
  if (s === "awarded") {
    return {
      pill: {
        backgroundColor: Theme.positive,
        borderWidth: 1,
        borderColor: Theme.darkGreen,
      },
      text: { color: Theme.textOnPrimary },
    };
  }
  if (["completed", "closed", "cancelled", "expired"].includes(s)) {
    return {
      pill: {
        backgroundColor: Theme.surfaceGray,
        borderWidth: 1,
        borderColor: Theme.borderMedium,
      },
      text: { color: Theme.textSecondary },
    };
  }
  if (s === "quoted") {
    return {
      pill: {
        backgroundColor: Theme.screenBackground,
        borderWidth: 1,
        borderColor: Theme.textPrimaryDark,
      },
      text: { color: Theme.textPrimaryDark },
    };
  }
  return {
    pill: {
      backgroundColor: Theme.tripHubUnassignedPillBg,
      borderWidth: 1,
      borderColor: Theme.textPrimaryDark,
    },
    text: { color: Theme.textPrimaryDark },
  };
}

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
  const statusPill = giveLoadStatusPillStyles(status);
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
      <View style={[styles.loadCardOrb, { pointerEvents: "none" }]} />
      <View style={styles.loadCardHeroRow}>
        <View style={styles.loadPillRow}>
          <View style={styles.loadTypePill}>
            <Text style={styles.loadTypePillText}>GIVE LOAD</Text>
          </View>
          <View style={[styles.loadStatePill, statusPill.pill]}>
            <Text style={[styles.loadStatePillText, statusPill.text]}>
              {status.toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.heroRight}>
          {selected ? (
            <View style={styles.checkBubble}>
              <Check size={16} color="#fff" strokeWidth={3} />
            </View>
          ) : null}
          <Text style={styles.loadCardDateHero}>{formatIndentCardDate(load.pickup_date)}</Text>
        </View>
      </View>
      <LoadCardRouteRow
        origin={load.pickup_area || "—"}
        destination={load.drop_location || "—"}
      />
      <Text style={styles.loadCardIdCompact} numberOfLines={1}>
        {getIndentDisplayNumber(load)}
      </Text>
      <View style={styles.loadCardSpecsPanel}>
        <View style={styles.loadCardSpecsGrid}>
          <View style={styles.loadCardSpecsLabelsRow}>
            <View style={styles.loadCardSpecCell}>
              <Text style={styles.loadCardSpecLabel}>Vehicle</Text>
            </View>
            <View style={[styles.loadCardSpecCell, styles.loadCardSpecDivider]}>
              <Text style={styles.loadCardSpecLabel}>Load</Text>
            </View>
            <View
              style={[
                styles.loadCardSpecCell,
                styles.loadCardSpecDivider,
                styles.loadCardSpecCellRight,
              ]}
            >
              <Text style={[styles.loadCardSpecLabel, styles.loadCardSpecLabelRight]}>
                Weight
              </Text>
            </View>
          </View>
          <View style={styles.loadCardSpecsValuesRow}>
            <View style={styles.loadCardSpecCell}>
              <Text style={styles.loadCardSpecValue} numberOfLines={2}>
                {vehicleDetail}
              </Text>
            </View>
            <View style={[styles.loadCardSpecCell, styles.loadCardSpecDivider]}>
              <Text style={styles.loadCardSpecValue} numberOfLines={2}>
                {loadTypeDetail}
              </Text>
            </View>
            <View
              style={[
                styles.loadCardSpecCell,
                styles.loadCardSpecDivider,
                styles.loadCardSpecCellRight,
              ]}
            >
              <Text
                style={[styles.loadCardSpecValue, styles.loadCardSpecValueRight]}
                numberOfLines={2}
              >
                {weightDetail}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.pickerHintRow}>
        <View style={styles.bidMetaWrap}>
          <View
            style={[
              styles.bidIconCircle,
              bidCount > 0 ? styles.bidIconCircleActive : styles.bidIconCircleMuted,
            ]}
          >
            {bidCount > 0 ? (
              <BidReceivedHammer visible size={16} />
            ) : (
              <FontAwesome name="gavel" size={16} color={Theme.textMuted} />
            )}
          </View>
          <Text style={styles.loadCardMetaText} numberOfLines={1}>
            {bidCount} bid{bidCount === 1 ? "" : "s"} · Tap to use for story
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loadCard: {
    position: "relative",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 28,
    padding: 18,
    marginBottom: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3,
    overflow: "hidden",
  },
  loadCardSelected: {
    borderColor: Theme.primary,
    borderWidth: 2,
    shadowColor: Theme.primary,
    shadowOpacity: 0.12,
  },
  loadCardPressed: { opacity: 0.95 },
  loadCardOrb: {
    position: "absolute",
    top: -72,
    right: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Theme.textPrimaryDark,
    opacity: 0.04,
  },
  loadCardHeroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    zIndex: 1,
  },
  heroRight: { alignItems: "flex-end", gap: 6 },
  checkBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  loadCardDateHero: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  loadPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  loadTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.surfaceGray,
  },
  loadTypePillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.35,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  loadStatePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  loadStatePillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  loadCardIdCompact: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12,
    zIndex: 1,
  },
  loadCardSpecsPanel: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 4,
    zIndex: 1,
  },
  loadCardSpecsGrid: { gap: 6 },
  loadCardSpecsLabelsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 0,
  },
  loadCardSpecsValuesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 0,
  },
  loadCardSpecCell: { flex: 1, minWidth: 0 },
  loadCardSpecCellRight: {
    alignItems: "flex-end",
  },
  loadCardSpecDivider: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderMedium,
    paddingLeft: 10,
    marginLeft: 4,
  },
  loadCardSpecLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadCardSpecValue: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 12,
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  loadCardSpecLabelRight: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  loadCardSpecValueRight: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  pickerHintRow: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  bidMetaWrap: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  bidIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  bidIconCircleActive: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.borderLight,
  },
  bidIconCircleMuted: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderLight,
  },
  loadCardMetaText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flex: 1,
  },
});

import { EntityAvatar as PartyAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import { formatIndianVehicleNumber } from "@/lib/format";
import { formatChatPartyInboxLine } from "@/features/chat/utils/partyDisplay";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Feather } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const AVATAR_SIZE = 32;

type Props = {
  roleLabel: string;
  primaryText: string;
  variant: "driver" | "vehicle";
  /** Shown under plate on vehicle cards (tiny). */
  vehicleType?: string | null;
  ratingAvg?: number | null;
  docsIssue?: boolean;
  insightsLoading?: boolean;
  driverName?: string | null;
  driverAvatarUrl?: string | null;
  driverId?: string | null;
  showChange?: boolean;
  onChange?: () => void;
  style?: StyleProp<ViewStyle>;
  desktop?: boolean;
};

function formatDriverDisplayName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || trimmed === "Unassigned") return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Plate only — drop vehicle type / capacity joined with " · ". */
function formatVehiclePlateOnly(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || trimmed === "Pending") return trimmed;
  const platePart = trimmed.split("·")[0]?.trim() ?? trimmed;
  const formatted = formatIndianVehicleNumber(platePart).trim();
  return formatted || platePart;
}

function RatingMetaRow({
  ratingAvg,
  docsIssue,
  loading,
}: {
  ratingAvg: number | null | undefined;
  docsIssue: boolean;
  loading: boolean;
}) {
  const docIconColor = docsIssue ? Theme.destructive : Theme.textMuted;
  const hasRating = ratingAvg != null && Number.isFinite(ratingAvg);

  if (loading) {
    return (
      <View style={styles.metaRow}>
        <ActivityIndicator size="small" color={Theme.textMuted} />
      </View>
    );
  }

  if (!hasRating) {
    return (
      <View style={styles.metaRow}>
        <Text style={styles.metaText} numberOfLines={1}>
          No rating yet
        </Text>
        <Feather
          name="file-text"
          size={12}
          color={docIconColor}
          style={styles.docIcon}
        />
      </View>
    );
  }

  return (
    <View style={styles.metaRow}>
      <View style={styles.ratingRow}>
        <FontAwesome
          name="star"
          size={11}
          color={Theme.feedbackModalStarActive}
        />
        <Text style={styles.ratingValue} numberOfLines={1}>
          {ratingAvg.toFixed(1)}
        </Text>
      </View>
      <Feather
        name="file-text"
        size={12}
        color={docIconColor}
        style={styles.docIcon}
        accessibilityLabel={
          docsIssue ? "Documents missing or expired" : "Documents on file"
        }
      />
    </View>
  );
}

function VehicleTypeMetaRow({
  vehicleType,
  docsIssue,
  loading,
}: {
  vehicleType: string | null | undefined;
  docsIssue: boolean;
  loading: boolean;
}) {
  const docIconColor = docsIssue ? Theme.destructive : Theme.textMuted;
  const typeLabel = vehicleType?.trim() || null;

  if (loading) {
    return (
      <View style={styles.metaRow}>
        <ActivityIndicator size="small" color={Theme.textMuted} />
      </View>
    );
  }

  return (
    <View style={styles.metaRow}>
      {typeLabel ? (
        <Text style={styles.vehicleTypeText} numberOfLines={1}>
          {typeLabel}
        </Text>
      ) : (
        <View style={styles.vehicleTypeSpacer} />
      )}
      <Feather
        name="file-text"
        size={10}
        color={docIconColor}
        style={styles.docIcon}
        accessibilityLabel={
          docsIssue ? "Documents missing or expired" : "Documents on file"
        }
      />
    </View>
  );
}

export function ManifestRefAssetCard({
  roleLabel,
  primaryText,
  variant,
  vehicleType = null,
  ratingAvg = null,
  docsIssue = false,
  insightsLoading = false,
  driverName,
  driverAvatarUrl,
  driverId,
  showChange = false,
  onChange,
  style,
  desktop = false,
}: Props) {
  const displayPrimary =
    variant === "driver"
      ? formatDriverDisplayName(primaryText)
      : formatVehiclePlateOnly(primaryText);
  const displayVehicleType = (() => {
    if (variant !== "vehicle") return null;
    const explicit = vehicleType?.trim();
    if (explicit) return explicit;
    const trimmed = primaryText.trim();
    if (!trimmed.includes("·")) return null;
    const tail = trimmed
      .split("·")
      .slice(1)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" · ");
    return tail || null;
  })();
  const isDriver = variant === "driver";
  const displayRoleLabel =
    isDriver && displayPrimary && displayPrimary !== "—" && displayPrimary !== "Unassigned"
      ? formatChatPartyInboxLine("driver", displayPrimary) ?? roleLabel
      : roleLabel;

  return (
    <View style={[styles.card, desktop && styles.cardDesktop, style]}>
      <View style={styles.headerRow}>
        <Text style={styles.roleLabel} numberOfLines={1}>
          {displayRoleLabel}
        </Text>
        {showChange && onChange ? (
          <TouchableOpacity
            onPress={onChange}
            style={styles.changeBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Change ${roleLabel.toLowerCase()}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.changeBtnText}>Change</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.contentRow}>
        {!isDriver ? (
          <View
            style={[styles.vehicleIcon, desktop && styles.vehicleIconDesktop]}
          >
            <Feather name="truck" size={14} color={Theme.textOnPrimary} />
          </View>
        ) : null}

        <View style={styles.bodyCol}>
          <Text style={styles.primaryText} numberOfLines={1}>
            {displayPrimary}
          </Text>

          {isDriver ? (
            <RatingMetaRow
              ratingAvg={ratingAvg}
              docsIssue={docsIssue}
              loading={insightsLoading}
            />
          ) : (
            <VehicleTypeMetaRow
              vehicleType={displayVehicleType}
              docsIssue={docsIssue}
              loading={insightsLoading}
            />
          )}
        </View>

        {isDriver ? (
          <View style={styles.avatarCol}>
            <PartyAvatar
              name={driverName ?? displayPrimary}
              entityType="driver"
              size={AVATAR_SIZE}
              avatarUrl={driverAvatarUrl ?? undefined}
              avatarSeed={driverId ?? undefined}
              showIntegrationBadge={false}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 10,
    gap: 8,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 8px rgba(15, 23, 42, 0.06)",
      } as ViewStyle,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 1,
      },
    }),
  },
  cardDesktop: {
    flex: undefined,
    width: "100%",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 11,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    minHeight: 16,
  },
  roleLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.textMuted,
    lineHeight: 11,
  },
  changeBtn: {
    flexShrink: 0,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  changeBtnText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.pulseIndigo,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  bodyCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingRight: 2,
  },
  primaryText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    minHeight: 14,
    minWidth: 0,
  },
  ratingRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingValue: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
    flexShrink: 0,
  },
  metaText: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  vehicleTypeText: {
    flex: 1,
    minWidth: 0,
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.15,
    lineHeight: 9,
    marginTop: 1,
  },
  vehicleTypeSpacer: {
    flex: 1,
    minHeight: 9,
  },
  docIcon: {
    flexShrink: 0,
  },
  avatarCol: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    marginLeft: 2,
  },
  vehicleIcon: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 10,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  vehicleIconDesktop: {
    borderRadius: 10,
  },
});

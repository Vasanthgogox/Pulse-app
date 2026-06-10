/**
 * Partner profile hero — same Metronic hex layout as NetworkDesktopHubHero.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import {
  METRONIC,
  networkDesktopHubStyles as hubStyles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import {
  BadgeCheck,
  Building2,
  MapPin,
  Phone,
  X,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type NetworkProfileHubHeroStat = {
  value: string;
  label: string;
};

type Props = {
  name: string;
  roleLabel: string;
  location?: string | null;
  phone?: string | null;
  entityType: PartyEntityType;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  showVerified?: boolean;
  inApp?: boolean;
  connectionStatus?: string;
  stats: NetworkProfileHubHeroStat[];
  onClose?: () => void;
  /** Profile modal on narrow viewports — stacked meta, stat grid, lighter type. */
  compact?: boolean;
};

function roleDisplayLabel(role: string): string {
  if (role === "CLIENT") return "Client";
  if (role === "SUPPLIER") return "Supplier";
  if (role === "DRIVER") return "Driver";
  return role;
}

export function NetworkProfileHubHero({
  name,
  roleLabel,
  location,
  phone,
  entityType,
  avatarUrl,
  avatarSeed,
  showVerified = false,
  inApp = false,
  connectionStatus,
  stats,
  onClose,
  compact = false,
}: Props) {
  const locationLabel =
    location?.trim() && location.trim() !== "Not available"
      ? location.trim()
      : "Location not set";
  const phoneLabel = phone?.trim() || "No phone on file";
  const roleText = roleDisplayLabel(roleLabel);
  const avatarSize = compact ? 72 : 88;

  const metaItems = [
    {
      key: "role",
      icon: <Building2 size={14} color={METRONIC.subtle} strokeWidth={2} />,
      text: compact ? roleText : roleText.toUpperCase(),
    },
    {
      key: "location",
      icon: <MapPin size={14} color={METRONIC.subtle} strokeWidth={2} />,
      text: locationLabel,
    },
    {
      key: "phone",
      icon: <Phone size={14} color={METRONIC.subtle} strokeWidth={2} />,
      text: phoneLabel,
    },
  ] as const;

  return (
    <View style={[hubStyles.hero, compact && styles.heroCompact]}>
      <View style={hubStyles.heroHexOverlay} pointerEvents="none" />

      {onClose ? (
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, compact && styles.closeBtnCompact]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close profile"
        >
          <X size={16} color={METRONIC.muted} strokeWidth={2.2} />
        </Pressable>
      ) : null}

      <View style={[hubStyles.heroInner, compact && styles.heroInnerCompact]}>
        <View
          style={[
            hubStyles.heroAvatarPressable,
            compact && styles.heroAvatarPressableCompact,
          ]}
        >
          <View
            style={[
              hubStyles.heroAvatarRing,
              compact && styles.heroAvatarRingCompact,
            ]}
          >
            <PartyAvatar
              name={name}
              entityType={entityType}
              avatarUrl={avatarUrl}
              avatarSeed={avatarSeed}
              size={avatarSize}
              shape="circle"
            />
          </View>
        </View>

        <View style={hubStyles.heroNameRow}>
          <Text
            style={[hubStyles.heroName, compact && styles.heroNameCompact]}
            numberOfLines={2}
          >
            {name}
          </Text>
          {showVerified || inApp ? (
            <BadgeCheck
              size={compact ? 16 : 18}
              color={METRONIC.link}
              strokeWidth={2.2}
            />
          ) : null}
        </View>

        {compact ? (
          <View style={styles.metaColumn}>
            {metaItems.map((item) => (
              <View key={item.key} style={styles.metaColumnRow}>
                {item.icon}
                <Text style={styles.metaColumnText} numberOfLines={2}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={hubStyles.heroMetaRow}>
            {metaItems.map((item) => (
              <View key={item.key} style={hubStyles.heroMetaItem}>
                {item.icon}
                <Text style={hubStyles.heroMetaText} numberOfLines={1}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        )}

        {compact ? (
          <View style={styles.statsGrid}>
            {stats.map((stat, idx) => (
              <View
                key={stat.label}
                style={[
                  styles.statsGridCell,
                  idx > 0 && styles.statsGridCellBorder,
                ]}
              >
                <Text style={styles.statsGridValue}>{stat.value}</Text>
                <Text style={styles.statsGridLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={hubStyles.heroStatsRow}>
            {stats.map((stat, idx) => (
              <View key={stat.label} style={styles.statGroup}>
                <Text style={hubStyles.heroStatChip}>
                  <Text style={hubStyles.heroStatValue}>{stat.value}</Text>
                  <Text style={hubStyles.heroStatLabel}> {stat.label}</Text>
                </Text>
                {idx < stats.length - 1 ? (
                  <Text style={hubStyles.heroStatDivider}>·</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        <View style={[styles.statusRow, compact && styles.statusRowCompact]}>
          <View
            style={[
              styles.presenceTag,
              inApp ? styles.presenceTagOn : styles.presenceTagOff,
              compact && styles.presenceTagCompact,
            ]}
          >
            <View
              style={[
                styles.presenceDot,
                inApp ? styles.presenceDotOn : styles.presenceDotOff,
              ]}
            />
            <Text
              style={[
                styles.presenceText,
                compact && styles.presenceTextCompact,
                inApp ? styles.presenceTextOn : styles.presenceTextOff,
              ]}
            >
              {inApp ? "In app" : "Not in app"}
            </Text>
          </View>
          {connectionStatus ? (
            <View style={[styles.connectionTag, compact && styles.connectionTagCompact]}>
              <Text
                style={[
                  styles.connectionTagText,
                  compact && styles.connectionTagTextCompact,
                ]}
              >
                {connectionStatus}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCompact: {
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  heroInnerCompact: {
    alignItems: "stretch",
    gap: 8,
  },
  heroAvatarPressableCompact: {
    alignSelf: "center",
  },
  heroAvatarRingCompact: {
    width: 78,
    height: 78,
    borderRadius: 39,
  },
  heroNameCompact: {
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: -0.2,
    textAlign: "center",
    alignSelf: "center",
  },
  closeBtnCompact: {
    top: 10,
    right: 10,
  },
  metaColumn: {
    alignSelf: "stretch",
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  metaColumnRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  metaColumnText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "400",
    color: METRONIC.subtle,
    lineHeight: 17,
  },
  statsGrid: {
    alignSelf: "stretch",
    flexDirection: "row",
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    overflow: "hidden",
  },
  statsGridCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 2,
  },
  statsGridCellBorder: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: METRONIC.border,
  },
  statsGridValue: {
    fontSize: 15,
    fontWeight: "600",
    color: METRONIC.text,
    letterSpacing: -0.2,
  },
  statsGridLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.muted,
    textTransform: "lowercase",
  },
  statusRowCompact: {
    alignSelf: "stretch",
    justifyContent: "center",
    marginTop: 4,
  },
  presenceTagCompact: {
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  presenceTextCompact: {
    fontWeight: "600",
  },
  connectionTagCompact: {
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  connectionTagTextCompact: {
    fontWeight: "600",
    letterSpacing: 0,
    textTransform: "capitalize",
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
  },
  statGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  presenceTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  presenceTagOn: {
    backgroundColor: "rgba(80, 205, 137, 0.1)",
    borderColor: "rgba(80, 205, 137, 0.35)",
  },
  presenceTagOff: {
    backgroundColor: "#F5F8FA",
    borderColor: METRONIC.border,
  },
  presenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  presenceDotOn: {
    backgroundColor: "#50CD89",
  },
  presenceDotOff: {
    backgroundColor: METRONIC.muted,
  },
  presenceText: {
    fontSize: 11,
    fontWeight: "700",
  },
  presenceTextOn: {
    color: "#1B7F4A",
  },
  presenceTextOff: {
    color: METRONIC.subtle,
  },
  connectionTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(79, 70, 229, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.18)",
  },
  connectionTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.2,
  },
});

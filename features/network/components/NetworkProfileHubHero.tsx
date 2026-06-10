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
}: Props) {
  const locationLabel =
    location?.trim() && location.trim() !== "Not available"
      ? location.trim()
      : "Location not set";
  const phoneLabel = phone?.trim() || "No phone on file";

  return (
    <View style={hubStyles.hero}>
      <View style={hubStyles.heroHexOverlay} pointerEvents="none" />

      {onClose ? (
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close profile"
        >
          <X size={16} color={METRONIC.muted} strokeWidth={2.2} />
        </Pressable>
      ) : null}

      <View style={hubStyles.heroInner}>
        <View style={hubStyles.heroAvatarPressable}>
          <View style={hubStyles.heroAvatarRing}>
            <PartyAvatar
              name={name}
              entityType={entityType}
              avatarUrl={avatarUrl}
              avatarSeed={avatarSeed}
              size={88}
              shape="circle"
            />
          </View>
        </View>

        <View style={hubStyles.heroNameRow}>
          <Text style={hubStyles.heroName} numberOfLines={2}>
            {name}
          </Text>
          {showVerified || inApp ? (
            <BadgeCheck size={18} color={METRONIC.link} strokeWidth={2.2} />
          ) : null}
        </View>

        <View style={hubStyles.heroMetaRow}>
          <View style={hubStyles.heroMetaItem}>
            <Building2 size={14} color={METRONIC.subtle} strokeWidth={2} />
            <Text style={hubStyles.heroMetaText}>
              {roleDisplayLabel(roleLabel).toUpperCase()}
            </Text>
          </View>
          <View style={hubStyles.heroMetaItem}>
            <MapPin size={14} color={METRONIC.subtle} strokeWidth={2} />
            <Text style={hubStyles.heroMetaText} numberOfLines={1}>
              {locationLabel}
            </Text>
          </View>
          <View style={hubStyles.heroMetaItem}>
            <Phone size={14} color={METRONIC.subtle} strokeWidth={2} />
            <Text style={hubStyles.heroMetaText} numberOfLines={1}>
              {phoneLabel}
            </Text>
          </View>
        </View>

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

        <View style={styles.statusRow}>
          <View
            style={[
              styles.presenceTag,
              inApp ? styles.presenceTagOn : styles.presenceTagOff,
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
                inApp ? styles.presenceTextOn : styles.presenceTextOff,
              ]}
            >
              {inApp ? "In app" : "Not in app"}
            </Text>
          </View>
          {connectionStatus ? (
            <View style={styles.connectionTag}>
              <Text style={styles.connectionTagText}>{connectionStatus}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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

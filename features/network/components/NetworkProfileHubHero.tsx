/**
 * Partner profile hero — Metronic hex layout with solid fills and icon wells.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import {
  METRONIC,
  networkDesktopHubStyles as hubStyles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { platformShadow } from "@/lib/platformShadow";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import type { LucideIcon } from "lucide-react-native";
import {
  BadgeCheck,
  Building2,
  Calendar,
  MapPin,
  Package,
  Phone,
  Radio,
  Star,
  Truck,
  UserRound,
  Users,
  X,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

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
  /** Partner is registered on Pulse (integrated connection). */
  isSignedIn?: boolean;
  memberSinceYear?: number | null;
  connectionStatus?: string;
  stats: NetworkProfileHubHeroStat[];
  onClose?: () => void;
  /** Profile modal on narrow viewports — stacked meta, stat grid, lighter type. */
  compact?: boolean;
};

type MetaTone = "role" | "location" | "phone";
type StatTone = "trips" | "rating" | "mutuals" | "default";

const META_TONE: Record<
  MetaTone,
  { bg: string; icon: string }
> = {
  role: { bg: Theme.surface, icon: Theme.textSecondary },
  location: { bg: Theme.surface, icon: Theme.textSecondary },
  phone: { bg: Theme.surface, icon: Theme.textSecondary },
};

const STAT_TONE: Record<
  StatTone,
  { bg: string; icon: string }
> = {
  trips: { bg: Theme.surface, icon: Theme.primary },
  rating: { bg: Theme.surface, icon: Theme.warning },
  mutuals: { bg: Theme.surface, icon: Theme.darkGreen },
  default: { bg: Theme.surface, icon: METRONIC.subtle },
};

function roleDisplayLabel(role: string): string {
  if (role === "CLIENT") return "Client";
  if (role === "SUPPLIER") return "Supplier";
  if (role === "DRIVER") return "Driver";
  return role;
}

function roleIcon(entityType: PartyEntityType): LucideIcon {
  if (entityType === "client") return Building2;
  if (entityType === "supplier") return Package;
  return UserRound;
}

function statTone(label: string): StatTone {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("trip")) return "trips";
  if (normalized.includes("rating")) return "rating";
  if (normalized.includes("mutual")) return "mutuals";
  return "default";
}

function statIcon(label: string): LucideIcon {
  const tone = statTone(label);
  if (tone === "trips") return Truck;
  if (tone === "rating") return Star;
  if (tone === "mutuals") return Users;
  return Star;
}

function IconWell({
  Icon,
  tone,
  size = 14,
}: {
  Icon: LucideIcon;
  tone: MetaTone | StatTone;
  size?: number;
}) {
  const palette =
    tone === "role" || tone === "location" || tone === "phone"
      ? META_TONE[tone]
      : STAT_TONE[tone];
  return (
    <View style={[styles.iconWell, { backgroundColor: palette.bg }]}>
      <Icon size={size} color={palette.icon} strokeWidth={2.2} />
    </View>
  );
}

function MetaRow({
  icon,
  text,
  tone,
}: {
  icon: LucideIcon;
  text: string;
  tone: MetaTone;
}) {
  return (
    <View style={styles.metaRow}>
      <IconWell Icon={icon} tone={tone} />
      <Text style={styles.metaRowText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

function StatTile({
  value,
  label,
  compact,
}: {
  value: string;
  label: string;
  compact: boolean;
}) {
  const tone = statTone(label);
  const Icon = statIcon(label);
  return (
    <View style={[styles.statTile, compact && styles.statTileCompact]}>
      <IconWell Icon={Icon} tone={tone} size={13} />
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileLabel}>{label}</Text>
    </View>
  );
}

function StatusPill({
  label,
  variant,
  icon,
  compact,
}: {
  label: string;
  variant: "signedIn" | "since" | "connection";
  icon?: ReactNode;
  compact?: boolean;
}) {
  const variantStyle =
    variant === "signedIn"
      ? styles.statusPillSignedIn
      : variant === "since"
        ? styles.statusPillSince
        : styles.statusPillConnection;
  const textStyle =
    variant === "signedIn"
      ? styles.statusPillTextOnDark
      : variant === "since"
        ? styles.statusPillTextSince
        : styles.statusPillTextConnection;

  return (
    <View style={[styles.statusPill, variantStyle, compact && styles.statusPillCompact]}>
      {icon}
      <Text style={[textStyle, compact && styles.statusPillTextCompact]}>{label}</Text>
    </View>
  );
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
  isSignedIn = false,
  memberSinceYear = null,
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
  const RoleIcon = roleIcon(entityType);
  const avatarSize = compact ? 72 : 88;

  return (
    <View
      style={[
        hubStyles.hero,
        compact && styles.heroCompact,
        compact && styles.heroCompactNoPattern,
      ]}
    >
      {!compact ? (
        <View style={[hubStyles.heroHexOverlay, compact && styles.heroHexOverlayCompact]} pointerEvents="none" />
      ) : null}

      {onClose ? (
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, compact && styles.closeBtnCompact]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close profile"
        >
          <X size={15} color={METRONIC.text} strokeWidth={2.4} />
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

        <View style={[hubStyles.heroNameRow, compact && styles.heroNameRowCompact]}>
          <Text
            style={[hubStyles.heroName, compact && styles.heroNameCompact]}
            numberOfLines={2}
          >
            {name}
          </Text>
          {showVerified || isSignedIn ? (
            <BadgeCheck
              size={compact ? 16 : 18}
              color={Theme.darkGreen}
              strokeWidth={2.2}
            />
          ) : null}
        </View>

        {compact ? (
          <View style={styles.metaCard}>
            <MetaRow icon={RoleIcon} text={roleText} tone="role" />
            <View style={styles.metaDivider} />
            <MetaRow icon={MapPin} text={locationLabel} tone="location" />
            <View style={styles.metaDivider} />
            <MetaRow icon={Phone} text={phoneLabel} tone="phone" />
          </View>
        ) : (
          <View style={styles.metaCardInline}>
            <MetaRow icon={RoleIcon} text={roleText.toUpperCase()} tone="role" />
            <MetaRow icon={MapPin} text={locationLabel} tone="location" />
            <MetaRow icon={Phone} text={phoneLabel} tone="phone" />
          </View>
        )}

        {compact ? (
          <View style={styles.statsRow}>
            {stats.map((stat) => (
              <StatTile
                key={stat.label}
                value={stat.value}
                label={stat.label}
                compact
              />
            ))}
          </View>
        ) : (
          <View style={styles.statsRow}>
            {stats.map((stat) => (
              <StatTile
                key={stat.label}
                value={stat.value}
                label={stat.label}
                compact={false}
              />
            ))}
          </View>
        )}

        <View style={[styles.statusRow, compact && styles.statusRowCompact]}>
          {isSignedIn ? (
            <StatusPill
              compact={compact}
              variant="signedIn"
              label="Signed in"
              icon={<View style={styles.liveDot} />}
            />
          ) : null}
          {memberSinceYear != null ? (
            <StatusPill
              compact={compact}
              variant="since"
              label={`Since ${memberSinceYear}`}
              icon={<Calendar size={11} color={METRONIC.subtle} strokeWidth={2.4} />}
            />
          ) : null}
          {connectionStatus ? (
            <StatusPill
              compact={compact}
              variant="connection"
              label={connectionStatus}
              icon={<Radio size={11} color={Theme.textOnPrimary} strokeWidth={2.4} />}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCompact: {
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  heroCompactNoPattern: Platform.select({
    web: { backgroundImage: "none" as const },
    default: {},
  }),
  heroHexOverlayCompact: {
    backgroundColor: "transparent",
    opacity: 0,
  },
  heroInnerCompact: {
    alignItems: "stretch",
    gap: 14,
    width: "100%",
  },
  heroAvatarPressableCompact: {
    alignSelf: "center",
  },
  heroAvatarRingCompact: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: Theme.cardWhite,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
    ...platformShadow("0 4px 12px rgba(77, 54, 54, 0.08)", {
      color: Theme.primary,
      opacity: 0.08,
      radius: 12,
      offsetY: 4,
      elevation: 3,
    }),
  },
  heroNameCompact: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.4,
    textAlign: "center",
    flexShrink: 1,
    color: METRONIC.text,
  },
  heroNameRowCompact: {
    width: "100%",
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  closeBtnCompact: {
    top: 10,
    right: 10,
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    ...platformShadow("0 2px 6px rgba(15, 23, 42, 0.06)", {
      color: Theme.primary,
      opacity: 0.06,
      radius: 6,
      offsetY: 2,
      elevation: 2,
    }),
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  metaCard: {
    alignSelf: "stretch",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  metaCardInline: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    paddingVertical: 10,
  },
  metaDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginLeft: 44,
  },
  metaRowText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    color: METRONIC.text,
    lineHeight: 19,
  },
  statsRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 10,
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  statTileCompact: {
    paddingVertical: 12,
    minHeight: 88,
  },
  statTileValue: {
    fontSize: 18,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: -0.35,
    fontVariant: ["tabular-nums"],
  },
  statTileLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  statusRowCompact: {
    alignSelf: "stretch",
    justifyContent: "center",
    marginTop: 0,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPillCompact: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillSignedIn: {
    backgroundColor: Theme.darkGreen,
  },
  statusPillSince: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  statusPillConnection: {
    backgroundColor: Theme.primary,
  },
  statusPillTextOnDark: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  statusPillTextSince: {
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: 0.15,
  },
  statusPillTextConnection: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
    textTransform: "capitalize",
  },
  statusPillTextCompact: {
    fontSize: 10,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.textOnPrimary,
  },
});

/**
 * Connection cards for Network hub (reference: nested white card, grey inner band, role pills, handshake).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import {
  NETWORK_PROFILE_AVATAR_SIZE_HUB,
  NETWORK_PROFILE_AVATAR_SIZE_HUB_CAROUSEL,
  NETWORK_PROFILE_CARD_HEIGHT,
  NETWORK_PROFILE_CARD_RADIUS,
  NETWORK_PROFILE_COVER_HEIGHT,
} from "@/features/network/constants/networkProfileCardLayout";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { getInitials } from "@/lib/stringUtils";
import {
    Check,
    Send,
    ShieldCheck,
    Star,
    Users,
    Zap,
} from "lucide-react-native";
import React from "react";
import {
    Animated,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

export type HubConnectionRole = "CLIENT" | "SUPPLIER" | "DRIVER";

export type HubConnectionItem = {
  id: string;
  name: string;
  role: HubConnectionRole;
  is_integrated: boolean;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType?: PartyEntityType;
  mutualCount?: number | null;
  rating?: number | null;
  locationLabel?: string | null;
  actionLabel?: string;
  actionLoading?: boolean;
  actionDisabled?: boolean;
  totalTrips?: number | null;
};

const ROLE_STYLES: Record<
  HubConnectionRole,
  { bg: string; color: string; label: string }
> = {
  CLIENT: {
    bg: Theme.networkClientTintBg,
    color: Theme.primary,
    label: "CLIENT",
  },
  SUPPLIER: {
    bg: Theme.networkSupplierTintBg,
    color: Theme.positive,
    label: "SUPPLIER",
  },
  DRIVER: {
    bg: Theme.networkDriverTintBg,
    color: Theme.warning,
    label: "DRIVER",
  },
};

function seedColor(id: string): string {
  const tones = [Theme.textRouteCard, Theme.textPrimaryDark, Theme.primary];
  let idx = 0;
  for (let i = 0; i < id.length; i += 1)
    idx = (idx + id.charCodeAt(i)) % tones.length;
  return tones[idx];
}

function subtleAvatarBg(id: string): string {
  return id.length % 2 === 0 ? Theme.surface : Theme.surfaceGray;
}

/** Min height for horizontal hub connection row (carousel / side-scroll). Kept exported for callers & stable bundles. */
export const HUB_CAROUSEL_MIN_HEIGHT = NETWORK_PROFILE_CARD_HEIGHT;
export const HUB_CAROUSEL_CARD_WIDTH = 152;

export function HubConnectionListCard({
  item,
  onActionPress,
  onCardPress,
  layout = "grid",
}: {
  item: HubConnectionItem;
  onActionPress?: () => void;
  onCardPress?: () => void;
  /** `carousel` = fixed width for horizontal row / side-scroll. */
  layout?: "grid" | "carousel";
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const rs = ROLE_STYLES[item.role];
  const isDriver = item.role === "DRIVER";
  const canPressAction = Boolean(
    onActionPress && !item.actionDisabled && !item.actionLoading,
  );
  const mutuals = item.mutualCount ?? 0;
  const rating =
    typeof item.rating === "number" && Number.isFinite(item.rating)
      ? item.rating.toFixed(1)
      : null;
  const onIn = () =>
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  const isCarousel = layout === "carousel";

  return (
    <Pressable
      onPress={onCardPress}
      onPressIn={onIn}
      onPressOut={onOut}
      style={[styles.cardPress, isCarousel && styles.cardPressCarousel]}
    >
      <Animated.View
        style={[
          styles.cardOuter,
          isCarousel && styles.cardOuterCarousel,
          { transform: [{ scale }] },
        ]}
      >
        <View style={styles.coverBg}>
          <View style={styles.coverOrbLarge} />
          <View style={styles.coverOrbSmall} />
          <View style={styles.coverPlane} />
          <View style={styles.coverWidget}>
            {item.is_integrated ? (
              <Zap
                size={10}
                color={Theme.textPrimaryDark}
                fill={Theme.textPrimaryDark}
              />
            ) : (
              <ShieldCheck
                size={10}
                color={Theme.textSecondary}
                strokeWidth={2.2}
              />
            )}
            <Text style={styles.coverWidgetText}>
              {item.is_integrated ? "LIVE" : "INVITE"}
            </Text>
          </View>
          <View style={[styles.coverRoleChip, { backgroundColor: rs.bg }]}>
            <Text style={[styles.coverRoleText, { color: rs.color }]}>
              {rs.label}
            </Text>
          </View>
        </View>

        <View style={styles.profileBlock}>
          <View
            style={[
              styles.profileHeroRow,
              isCarousel && styles.profileHeroRowCarousel,
            ]}
          >
            <View style={[styles.profileHeroCol, styles.profileHeroColLeft]}>
              {typeof item.totalTrips === "number" && item.totalTrips >= 0 ? (
                <View style={styles.hubMetricPill}>
                  <Text style={styles.hubTripsText} numberOfLines={2}>
                    {item.totalTrips} trip{item.totalTrips === 1 ? "" : "s"}
                  </Text>
                </View>
              ) : (
                <View style={styles.profileHeroColGap} />
              )}
            </View>
            <View
              style={[
                styles.heroAvatar,
                isCarousel && styles.heroAvatarCarousel,
              ]}
            >
              <PartyAvatar
                name={item.name}
                avatarUrl={item.avatarUrl}
                avatarSeed={item.avatarSeed}
                entityType={
                  item.entityType ??
                  (isDriver
                    ? "driver"
                    : item.role === "SUPPLIER"
                      ? "supplier"
                      : "client")
                }
                size={
                  isCarousel
                    ? NETWORK_PROFILE_AVATAR_SIZE_HUB_CAROUSEL
                    : NETWORK_PROFILE_AVATAR_SIZE_HUB
                }
                borderStyle={styles.heroAvatarImage}
              />
            </View>
            <View style={[styles.profileHeroCol, styles.profileHeroColRight]}>
              <View
                style={[
                  styles.hubMetricPill,
                  styles.hubMetricPillRating,
                  !rating && styles.hubMetricPillRatingEmpty,
                ]}
              >
                {rating ? (
                  <Star
                    size={10}
                    color={Theme.driverGold}
                    fill={Theme.driverGold}
                    strokeWidth={2.2}
                  />
                ) : null}
                <Text
                  style={[
                    styles.hubRatingText,
                    !rating && styles.hubRatingTextEmpty,
                  ]}
                >
                  {rating ?? "No rating"}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.entityName} numberOfLines={1}>
            {item.name.toUpperCase()}
          </Text>
          <Text style={styles.entitySubtitle} numberOfLines={1}>
            {item.role === "CLIENT"
              ? "Shipping demand partner"
              : item.role === "SUPPLIER"
                ? "Capacity supply partner"
                : "Fleet operations member"}
          </Text>

          <View style={styles.cardMetaStack}>
            <View
              style={[styles.metaChip, mutuals > 0 && styles.metaChipStrong]}
            >
              <Users
                size={10}
                color={mutuals > 0 ? Theme.textOnPrimary : Theme.textSecondary}
                strokeWidth={2.5}
              />
              <Text
                style={[
                  styles.metaChipText,
                  mutuals > 0 && styles.metaChipTextStrong,
                ]}
                numberOfLines={1}
              >
                {mutuals > 0
                  ? `${mutuals} mutual${mutuals === 1 ? "" : "s"}`
                  : "No mutuals"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardFooter}>
          {item.is_integrated ? (
            <View style={styles.connectedStateTag}>
              <Check
                size={13}
                color={Theme.textPrimaryDark}
                strokeWidth={2.5}
              />
              <Text style={styles.connectedStateTagText}>Connected</Text>
            </View>
          ) : (
            <Pressable
              style={[
                styles.inviteBtn,
                item.actionLoading && styles.inviteBtnLoading,
              ]}
              onPress={onActionPress}
              disabled={!canPressAction}
            >
              {item.actionLoading ? (
                <LoadingIndicator size={12} color={Theme.textPrimaryDark} />
              ) : (
                <Send
                  size={12}
                  color={Theme.textPrimaryDark}
                  strokeWidth={2.4}
                />
              )}
              <Text style={styles.inviteBtnText}>
                {item.actionLabel ?? "Send invite"}
              </Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function HubConnectionGridCard({ item }: { item: HubConnectionItem }) {
  const color = seedColor(item.id);
  const avatarBg = subtleAvatarBg(item.id);
  const rs = ROLE_STYLES[item.role];
  return (
    <View style={styles.gridOuter}>
      <View style={styles.gridTopRow}>
        <View style={[styles.rolePillSm, { backgroundColor: rs.bg }]}>
          <Text style={[styles.rolePillSmText, { color: rs.color }]}>
            {rs.label}
          </Text>
        </View>
        {item.is_integrated ? (
          <View style={styles.onAppPillSm}>
            <Text style={styles.onAppPillSmText}>ON APP</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.gridInner, { borderColor: Theme.borderLight }]}>
        <View style={styles.gridAvatarWrap}>
          <View style={[styles.gridAvatar, { backgroundColor: avatarBg }]}>
            <Text style={[styles.gridAvatarTxt, { color }]}>
              {getInitials(item.name)}
            </Text>
          </View>
          <View style={styles.gridOnlineDot} />
        </View>
        <Text style={styles.gridName} numberOfLines={2}>
          {item.name.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardPress: {
    flex: 1,
    minWidth: 0,
    minHeight: NETWORK_PROFILE_CARD_HEIGHT,
  },
  cardPressCarousel: {
    width: HUB_CAROUSEL_CARD_WIDTH,
    height: HUB_CAROUSEL_MIN_HEIGHT,
    minHeight: HUB_CAROUSEL_MIN_HEIGHT,
    flex: 0,
    flexBasis: HUB_CAROUSEL_CARD_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
    marginRight: 0,
  },
  cardOuter: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderRadius: NETWORK_PROFILE_CARD_RADIUS,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.055,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
    overflow: "hidden",
  },
  cardOuterCarousel: {
    flex: 0,
    width: "100%",
    height: HUB_CAROUSEL_MIN_HEIGHT,
    minHeight: HUB_CAROUSEL_MIN_HEIGHT,
    marginBottom: 0,
  },
  coverBg: {
    height: NETWORK_PROFILE_COVER_HEIGHT,
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  coverOrbLarge: {
    position: "absolute",
    width: 132,
    height: 70,
    borderRadius: 66,
    top: -20,
    left: -28,
    backgroundColor: Theme.borderLight,
    transform: [{ rotate: "-9deg" }],
  },
  coverOrbSmall: {
    position: "absolute",
    width: 92,
    height: 54,
    borderRadius: 46,
    right: -22,
    bottom: -16,
    backgroundColor: Theme.surface,
    transform: [{ rotate: "12deg" }],
  },
  coverPlane: {
    position: "absolute",
    width: 112,
    height: 52,
    borderRadius: 14,
    right: 28,
    top: 10,
    backgroundColor: Theme.screenBackground,
    opacity: 0.58,
    transform: [{ rotate: "-8deg" }],
  },
  coverWidget: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 2,
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  coverWidgetText: {
    fontSize: 6.5,
    fontWeight: "500",
    color: Theme.textSecondary,
    letterSpacing: 0.45,
  },
  coverRoleChip: {
    position: "absolute",
    left: 8,
    top: 8,
    zIndex: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  coverRoleText: {
    fontSize: 6.5,
    fontWeight: "500",
    letterSpacing: 0.45,
    color: Theme.textPrimaryDark,
  },
  /** Trips + avatar + rating share one row; pills align to avatar mid-line. */
  profileHeroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: -22,
    paddingHorizontal: 0,
    zIndex: 5,
    gap: 2,
  },
  profileHeroRowCarousel: {
    marginTop: -20,
  },
  profileHeroCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  profileHeroColLeft: {
    alignItems: "flex-start",
  },
  profileHeroColRight: {
    alignItems: "flex-end",
  },
  profileHeroColGap: {
    minHeight: 18,
  },
  hubMetricPill: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    maxWidth: "100%",
  },
  hubMetricPillRating: {
    gap: 4,
  },
  hubMetricPillRatingEmpty: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    minHeight: 20,
  },
  hubTripsText: {
    fontSize: 7,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 9,
  },
  hubRatingText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  hubRatingTextEmpty: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMutedDemo,
    letterSpacing: -0.1,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    flexWrap: "wrap",
  },
  rolePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.networkCardBorder,
  },
  rolePillText: {
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    letterSpacing: 0.2,
  },
  onAppPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${Theme.positive}16`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  onAppPillText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.positive,
    letterSpacing: 0.5,
  },
  innerBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  avatarTxt: { fontSize: 15, fontWeight: "900", letterSpacing: -0.5 },
  onlineDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Theme.positive,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  profileBlock: {
    position: "relative",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingBottom: 2,
  },
  entityName: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
    lineHeight: 12,
    textAlign: "center",
    marginTop: 4,
  },
  entitySubtitle: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMutedDemo,
    lineHeight: 10,
    textAlign: "center",
    marginTop: 1,
    minHeight: 0,
  },
  heroAvatar: {
    width: NETWORK_PROFILE_AVATAR_SIZE_HUB + 4,
    height: NETWORK_PROFILE_AVATAR_SIZE_HUB + 4,
    borderRadius: (NETWORK_PROFILE_AVATAR_SIZE_HUB + 4) / 2,
    overflow: "hidden",
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heroAvatarCarousel: {
    width: NETWORK_PROFILE_AVATAR_SIZE_HUB_CAROUSEL + 4,
    height: NETWORK_PROFILE_AVATAR_SIZE_HUB_CAROUSEL + 4,
    borderRadius: (NETWORK_PROFILE_AVATAR_SIZE_HUB_CAROUSEL + 4) / 2,
  },
  heroAvatarImage: {
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  cardMetaStack: {
    width: "100%",
    gap: 2,
    paddingHorizontal: 6,
    marginTop: 2,
    marginBottom: 2,
    alignItems: "center",
  },
  metaChip: {
    minHeight: 16,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  metaChipStrong: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  metaChipText: {
    fontSize: 8,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textSecondary,
  },
  metaChipTextStrong: {
    color: Theme.textOnPrimary,
  },
  metricStack: {
    marginTop: 12,
  },
  metricRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.networkCardBorder,
  },
  metricLabel: {
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textMutedDemo,
    letterSpacing: 0.35,
  },
  ratingPill: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  ratingValue: {
    fontSize: 12,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  mutualCluster: {
    flexDirection: "row",
    alignItems: "center",
  },
  mutualCountPill: {
    minWidth: 24,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 3,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    paddingHorizontal: 5,
    maxWidth: 82,
  },
  mutualCountText: {
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textOnPrimary,
  },
  cardFooter: {
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
  connectedStateTag: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  connectedStateTagText: {
    fontSize: 8,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  inviteBtn: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
    minWidth: 112,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  inviteBtnLoading: {
    opacity: 0.72,
  },
  inviteBtnText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  handshakeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.positive,
    alignItems: "center",
    justifyContent: "center",
  },
  gridOuter: {
    flex: 1,
    minWidth: 0,
    padding: 4,
  },
  gridTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 4,
  },
  rolePillSm: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  rolePillSmText: { fontSize: 7, fontWeight: "600", letterSpacing: 0.25 },
  onAppPillSm: {
    backgroundColor: `${Theme.positive}14`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  onAppPillSmText: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.positive,
    letterSpacing: 0.2,
  },
  gridInner: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
  },
  gridAvatarWrap: { position: "relative", marginBottom: 6 },
  gridAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  gridAvatarTxt: {
    fontSize: 11,
    fontWeight: "400",
    letterSpacing: 0.2,
    color: "#6B7280",
  },
  gridOnlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: Theme.positive,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  gridName: {
    fontSize: 11,
    fontWeight: "500",
    color: "#475569",
    textAlign: "center",
    lineHeight: 15,
    letterSpacing: 0.1,
  },
});

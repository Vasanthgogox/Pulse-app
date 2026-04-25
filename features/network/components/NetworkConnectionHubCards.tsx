/**
 * Connection cards for Network hub (reference: nested white card, grey inner band, role pills, handshake).
 */
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import { getInitials } from "@/lib/stringUtils";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { CheckCircle2, Send, ShieldCheck, Star, Users, Zap } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";

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
  actionLabel?: string;
  actionLoading?: boolean;
  actionDisabled?: boolean;
};

const ROLE_STYLES: Record<
  HubConnectionRole,
  { bg: string; color: string; label: string }
> = {
  CLIENT: { bg: Theme.surface, color: Theme.textPrimaryDark, label: "CLIENT" },
  SUPPLIER: { bg: Theme.surface, color: Theme.textPrimaryDark, label: "SUPPLIER" },
  DRIVER: { bg: Theme.surface, color: Theme.textPrimaryDark, label: "DRIVER" },
};

function seedColor(id: string): string {
  const palette = [
    Theme.ledgerNetBarBg,
    Theme.textPrimaryDark,
    Theme.primary,
    Theme.positive,
    Theme.teslaRed,
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % palette.length;
  return palette[h];
}

export function HubConnectionListCard({
  item,
  onActionPress,
}: {
  item: HubConnectionItem;
  onActionPress?: () => void;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const rs = ROLE_STYLES[item.role];
  const isDriver = item.role === "DRIVER";
  const canPressAction = Boolean(onActionPress && !item.actionDisabled && !item.actionLoading);
  const mutuals = item.mutualCount ?? 0;
  const rating = typeof item.rating === "number" && Number.isFinite(item.rating)
    ? item.rating.toFixed(1)
    : null;
  const onIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Pressable onPressIn={onIn} onPressOut={onOut} style={styles.cardPress}>
      <Animated.View style={[styles.cardOuter, { transform: [{ scale }] }]}>
        <View style={styles.coverBg}>
          <View style={styles.coverOrbLarge} />
          <View style={styles.coverOrbSmall} />
          <View style={styles.coverPlane} />
          <View style={styles.coverWidget}>
            {item.is_integrated ? (
              <Zap size={10} color={Theme.textPrimaryDark} fill={Theme.textPrimaryDark} />
            ) : (
              <ShieldCheck size={10} color={Theme.textSecondary} strokeWidth={2.2} />
            )}
            <Text style={styles.coverWidgetText}>
              {item.is_integrated ? "LIVE" : "INVITE"}
            </Text>
          </View>
          <View style={styles.coverRoleChip}>
            <Text style={styles.coverRoleText}>{rs.label}</Text>
          </View>
          <View style={[styles.coverRatingNode, !rating && styles.coverRatingNodeEmpty]}>
            {rating ? (
              <Star size={10} color={Theme.driverGold} fill={Theme.driverGold} strokeWidth={2.2} />
            ) : null}
            <Text style={[styles.coverRatingText, !rating && styles.coverRatingTextEmpty]}>
              {rating ?? "No rating"}
            </Text>
          </View>
        </View>

        <View style={styles.profileBlock}>
          <View style={styles.heroAvatar}>
            <PartyAvatar
              name={item.name}
              avatarUrl={item.avatarUrl}
              avatarSeed={item.avatarSeed}
              entityType={item.entityType ?? (isDriver ? "driver" : item.role === "SUPPLIER" ? "supplier" : "client")}
              size={62}
              borderStyle={styles.heroAvatarImage}
            />
          </View>

          <Text style={styles.entityName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.entitySubtitle} numberOfLines={2}>
            {item.role === "CLIENT"
              ? "Shipping demand partner"
              : item.role === "SUPPLIER"
                ? "Capacity supply partner"
                : "Fleet operations member"}
          </Text>

          <View style={styles.cardMetaStack}>
            <View style={styles.metaChip}>
              <Users size={10} color={Theme.textSecondary} strokeWidth={2.4} />
              <Text style={styles.metaChipText} numberOfLines={1}>
                {mutuals > 0 ? `${mutuals} mutual${mutuals === 1 ? "" : "s"}` : "Q network"}
              </Text>
            </View>
            <View style={[styles.metaChip, item.is_integrated && styles.metaChipStrong]}>
              <Text style={[styles.metaChipText, item.is_integrated && styles.metaChipTextStrong]} numberOfLines={1}>
                {item.is_integrated ? "Operational access" : "Not in app"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardFooter}>
          {item.is_integrated ? (
            <View style={styles.joinedBtn}>
              <CheckCircle2 size={13} color={Theme.textPrimaryDark} strokeWidth={2.4} />
              <Text style={styles.joinedBtnText}>Connected</Text>
            </View>
          ) : (
            <Pressable
              style={[styles.inviteBtn, item.actionLoading && styles.inviteBtnLoading]}
              onPress={onActionPress}
              disabled={!canPressAction}
            >
              {item.actionLoading ? (
                <ActivityIndicator size={12} color={Theme.textOnPrimary} />
              ) : (
                <Send size={12} color={Theme.textOnPrimary} strokeWidth={2.4} />
              )}
              <Text style={styles.inviteBtnText}>{item.actionLabel ?? "Send invite"}</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function HubConnectionGridCard({ item }: { item: HubConnectionItem }) {
  const color = seedColor(item.id);
  const rs = ROLE_STYLES[item.role];
  return (
    <View style={styles.gridOuter}>
      <View style={styles.gridTopRow}>
        <View style={[styles.rolePillSm, { backgroundColor: rs.bg }]}>
          <Text style={[styles.rolePillSmText, { color: rs.color }]}>{rs.label}</Text>
        </View>
        {item.is_integrated ? (
          <View style={styles.onAppPillSm}>
            <Text style={styles.onAppPillSmText}>ON APP</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.gridInner, { borderColor: Theme.borderLight }]}>
        <View style={styles.gridAvatarWrap}>
          <View style={[styles.gridAvatar, { backgroundColor: color + "20" }]}>
            <Text style={[styles.gridAvatarTxt, { color }]}>{getInitials(item.name)}</Text>
          </View>
          <View style={styles.gridOnlineDot} />
        </View>
        <Text style={styles.gridName} numberOfLines={2}>
          {item.name}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardPress: {
    flex: 1,
    minWidth: 0,
  },
  cardOuter: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.055,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
    overflow: "hidden",
  },
  coverBg: {
    height: 82,
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
    transform: [{ rotate: "-10deg" }],
  },
  coverOrbSmall: {
    position: "absolute",
    width: 92,
    height: 54,
    borderRadius: 46,
    right: -22,
    bottom: -16,
    backgroundColor: Theme.surface,
    transform: [{ rotate: "14deg" }],
  },
  coverPlane: {
    position: "absolute",
    width: 112,
    height: 52,
    borderRadius: 14,
    right: 28,
    top: 10,
    backgroundColor: Theme.screenBackground,
    opacity: 0.55,
    transform: [{ rotate: "-8deg" }],
  },
  coverWidget: {
    position: "absolute",
    top: 8,
    right: 8,
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  coverWidgetText: {
    fontSize: 7,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textSecondary,
    letterSpacing: 0.7,
  },
  coverRoleChip: {
    position: "absolute",
    left: 8,
    top: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  coverRoleText: {
    fontSize: 7,
    fontWeight: "600",
    fontStyle: "italic",
    letterSpacing: 0.8,
    color: Theme.textPrimaryDark,
  },
  coverRatingNode: {
    position: "absolute",
    right: 8,
    bottom: 8,
    minHeight: 23,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  coverRatingNodeEmpty: {
    minHeight: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  coverRatingText: {
    fontSize: 10,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  coverRatingTextEmpty: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    letterSpacing: -0.1,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardPills: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
  rolePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  rolePillText: { fontSize: 8, fontWeight: "600", fontStyle: "italic", letterSpacing: 0.2 },
  onAppPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${Theme.positive}16`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  onAppPillText: { fontSize: 8, fontWeight: "900", color: Theme.positive, letterSpacing: 0.5 },
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
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  entityName: {
    fontSize: 12,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 8,
  },
  entitySubtitle: {
    fontSize: 9,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMutedDemo,
    lineHeight: 12,
    textAlign: "center",
    marginTop: 2,
    minHeight: 24,
  },
  heroAvatar: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: -31,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  heroAvatarImage: {
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  cardMetaStack: {
    width: "100%",
    gap: 6,
    marginTop: 10,
    alignItems: "center",
  },
  metaChip: {
    minHeight: 22,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 11,
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
    borderTopColor: Theme.borderLight,
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
    minHeight: 44,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
  joinedBtn: {
    minHeight: 27,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: Theme.screenBackground,
  },
  joinedBtnText: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  inviteBtn: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: Theme.buttonSecondaryBackground,
    borderWidth: 1,
    borderColor: Theme.buttonSecondaryBackground,
    minWidth: 108,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.045,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  inviteBtnLoading: {
    opacity: 0.72,
  },
  inviteBtnText: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textOnPrimary,
    letterSpacing: 0.1,
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
  rolePillSmText: { fontSize: 7, fontWeight: "900", letterSpacing: 0.4 },
  onAppPillSm: {
    backgroundColor: `${Theme.positive}14`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  onAppPillSmText: { fontSize: 7, fontWeight: "900", color: Theme.positive },
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
  },
  gridAvatarTxt: { fontSize: 14, fontWeight: "900" },
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
    fontWeight: "800",
    color: Theme.textPrimary,
    textAlign: "center",
    lineHeight: 15,
  },
});

/**
 * Your connections — Metronic user-directory tile (avatar + name + verified + handle).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import { NetworkDesktopSalesStars } from "@/features/network/components/desktop/NetworkDesktopSalesStars";
import { formatPartyContactPhone } from "@/features/network/utils/partyContactDisplay.util";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { BadgeCheck } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

function slugHandle(name: string, id: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18);
  const tail = id.replace(/-/g, "").slice(0, 6);
  return `${base || "partner"}${tail}.pulse`;
}

function roleTone(role: ConnectedOrg["role"]) {
  if (role === "CLIENT") {
    return {
      bg: Theme.networkBadgeClientBg,
      text: Theme.networkBadgeClientText,
      border: Theme.networkBadgeClientBorder,
    };
  }
  if (role === "DRIVER") {
    return {
      bg: Theme.networkBadgeDriverBg,
      text: Theme.networkBadgeDriverText,
      border: Theme.networkBadgeDriverBorder,
    };
  }
  return {
    bg: Theme.networkBadgeSupplierBg,
    text: Theme.networkBadgeSupplierText,
    border: Theme.networkBadgeSupplierBorder,
  };
}

function ratingFilledCount(rating: number | null | undefined): number {
  if (rating == null || !Number.isFinite(rating)) return 0;
  return Math.max(0, Math.min(5, Math.round(rating)));
}

function formatRating(rating: number | null | undefined): string {
  if (rating == null || !Number.isFinite(rating)) return "—";
  return rating.toFixed(1);
}

type Props = {
  item: ConnectedOrg;
  onPress?: () => void;
  onInvite?: () => void;
  actionLoading?: boolean;
};

export function NetworkDesktopConnectionCard({
  item,
  onPress,
  onInvite,
  actionLoading = false,
}: Props) {
  const entityType: PartyEntityType =
    item.role === "DRIVER" ? "driver" : item.role === "SUPPLIER" ? "supplier" : "client";
  const handle = item.phone
    ? formatPartyContactPhone(item.phone)
    : slugHandle(item.name, item.id);
  const inApp = item.is_integrated;
  const inviteDisabled = inApp || actionLoading;
  const tone = roleTone(item.role);
  const ratingValue = item.rating ?? null;
  const filledStars = ratingFilledCount(ratingValue);
  const ratingLabel = formatRating(ratingValue);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name}`}
    >
      <View style={styles.topMetaRow}>
        <View
          style={[
            styles.roleTag,
            { backgroundColor: tone.bg, borderColor: tone.border },
          ]}
        >
          <Text style={[styles.roleTagText, { color: tone.text }]}>{item.role}</Text>
        </View>
        <View style={styles.ratingWrap}>
          <NetworkDesktopSalesStars filledStars={filledStars} size={10} />
          <Text
            style={[
              styles.ratingText,
              ratingValue == null && styles.ratingTextEmpty,
            ]}
          >
            {ratingLabel}
          </Text>
        </View>
      </View>

      <View style={styles.avatarWrap}>
        <PartyAvatar
          name={item.name}
          entityType={entityType}
          avatarUrl={item.avatar_url}
          avatarSeed={item.avatar_seed}
          size={56}
          shape="circle"
        />
        {inApp ? <View style={styles.onlineDot} /> : null}
      </View>
      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        {inApp ? (
          <BadgeCheck size={14} color={Theme.primary} strokeWidth={2.2} />
        ) : null}
      </View>
      <Text style={styles.handle} numberOfLines={1}>
        {handle}
      </Text>

      <View style={styles.footerRow}>
        <View
          style={[
            styles.appTag,
            inApp ? styles.appTagOn : styles.appTagOff,
          ]}
        >
          <View
            style={[
              styles.appTagDot,
              inApp ? styles.appTagDotOn : styles.appTagDotOff,
            ]}
          />
          <Text
            style={[
              styles.appTagText,
              inApp ? styles.appTagTextOn : styles.appTagTextOff,
            ]}
          >
            {inApp ? "In app" : "Not in app"}
          </Text>
        </View>

        {inApp ? (
          <View style={[styles.actionBtn, styles.actionBtnConnected]}>
            <Text style={styles.actionBtnConnectedText}>Connected</Text>
          </View>
        ) : (
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              onInvite?.();
            }}
            disabled={inviteDisabled}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnInvite,
              inviteDisabled && styles.actionBtnDisabled,
              pressed && !inviteDisabled && styles.actionBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Invite ${item.name}`}
          >
            {actionLoading ? (
              <LoadingIndicator size="small" color={Theme.textOnPrimary} />
            ) : (
              <Text style={styles.actionBtnInviteText}>
                {item.phone?.trim() ? "Invite" : "Add phone"}
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EFF2F5",
    backgroundColor: Theme.cardWhite,
    minHeight: 188,
    gap: 5,
    ...({
      boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.05)",
    } as object),
  },
  cardPressed: {
    opacity: 0.92,
  },
  topMetaRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 2,
  },
  roleTag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleTagText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.35,
  },
  ratingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#181C32",
    minWidth: 22,
    textAlign: "right",
  },
  ratingTextEmpty: {
    color: "#A1A5B7",
  },
  avatarWrap: {
    width: 56,
    height: 56,
    position: "relative",
    marginBottom: 4,
  },
  onlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#50CD89",
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    maxWidth: "100%",
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: "#181C32",
    flexShrink: 1,
  },
  handle: {
    fontSize: 11,
    fontWeight: "500",
    color: "#A1A5B7",
    maxWidth: "100%",
    textAlign: "center",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 2,
    maxWidth: "100%",
    flexWrap: "wrap",
  },
  appTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  appTagOn: {
    backgroundColor: "rgba(80, 205, 137, 0.1)",
    borderColor: "rgba(80, 205, 137, 0.35)",
  },
  appTagOff: {
    backgroundColor: "#F5F8FA",
    borderColor: "#EFF2F5",
  },
  appTagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  appTagDotOn: {
    backgroundColor: "#50CD89",
  },
  appTagDotOff: {
    backgroundColor: "#A1A5B7",
  },
  appTagText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  appTagTextOn: {
    color: "#1B7F4A",
  },
  appTagTextOff: {
    color: "#78829D",
  },
  actionBtn: {
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
  },
  actionBtnInvite: {
    backgroundColor: Theme.primary,
  },
  actionBtnInviteText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.15,
  },
  actionBtnConnected: {
    backgroundColor: "#F5F8FA",
    borderWidth: 1,
    borderColor: "#EFF2F5",
  },
  actionBtnConnectedText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#78829D",
    letterSpacing: 0.15,
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
  actionBtnPressed: {
    opacity: 0.88,
  },
});

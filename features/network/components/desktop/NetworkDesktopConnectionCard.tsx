/**
 * Your connections — Metronic user-directory tile (avatar + name + verified + handle).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import { NetworkHubGlassBadge } from "@/features/network/components/NetworkHubGlassBadge";
import { NetworkDesktopSalesStars } from "@/features/network/components/desktop/NetworkDesktopSalesStars";
import { OrgVerificationBadges } from "@/features/network/components/OrgVerificationBadges";
import { formatPartyContactPhone } from "@/features/network/utils/partyContactDisplay.util";
import { isOrgKycVerified } from "@/features/network/utils/orgVerification.util";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { BadgeCheck, MessageCircle } from "lucide-react-native";
import { connectionCardStyles as styles } from "@/features/network/components/desktop/networkDesktopConnectionCard.styles";
import { Pressable, Text, View } from "react-native";

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

const INTEGRATED_PILL = {
  label: "INTEGRATED" as const,
  backgroundColor: Theme.networkBadgeIntegratedBg,
  gradientTop: Theme.networkBadgeIntegratedGradientTop,
  color: Theme.networkBadgeIntegratedText,
  borderColor: Theme.networkBadgeIntegratedBorder,
  highlightColor: Theme.networkBadgeIntegratedHighlight,
};

type Props = {
  item: ConnectedOrg;
  onPress?: () => void;
  onInvite?: () => void;
  onChat?: () => void;
  actionLoading?: boolean;
};

export function NetworkDesktopConnectionCard({
  item,
  onPress,
  onInvite,
  onChat,
  actionLoading = false,
}: Props) {
  const entityType: PartyEntityType =
    item.role === "DRIVER" ? "driver" : item.role === "SUPPLIER" ? "supplier" : "client";
  const handle = item.phone
    ? formatPartyContactPhone(item.phone)
    : slugHandle(item.name, item.id);
  const inApp = item.is_integrated;
  const isKycVerified = isOrgKycVerified(item);
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
        <View style={styles.topMetaLeft}>
          <View
            style={[
              styles.roleTag,
              { backgroundColor: tone.bg, borderColor: tone.border },
            ]}
          >
            <Text style={[styles.roleTagText, { color: tone.text }]}>{item.role}</Text>
          </View>
          {inApp ? (
            <NetworkHubGlassBadge pill={INTEGRATED_PILL} size="compact" />
          ) : null}
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
        {isKycVerified || inApp ? (
          <BadgeCheck size={14} color={Theme.darkGreen} strokeWidth={2.2} />
        ) : null}
      </View>
      {item.role !== "DRIVER" ? (
        <OrgVerificationBadges
          verification={item}
          compact
          style={styles.trustBadgesRow}
        />
      ) : null}
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

        {inApp && onChat ? (
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              onChat();
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnChat,
              pressed && styles.actionBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Chat with ${item.name}`}
          >
            <MessageCircle size={11} color={Theme.primary} />
            <Text style={styles.actionBtnChatText}>Chat</Text>
          </Pressable>
        ) : inApp ? (
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

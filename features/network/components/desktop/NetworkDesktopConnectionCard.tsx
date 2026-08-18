/**
 * Your connections — Metronic partner tile with business-card identity.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import { NetworkHubGlassBadge } from "@/features/network/components/NetworkHubGlassBadge";
import {
  connectionCardStyles as styles,
  growConnectionCardStyles as growStyles,
} from "@/features/network/components/desktop/networkDesktopConnectionCard.styles";
import { OrgVerificationBadges } from "@/features/network/components/OrgVerificationBadges";
import { formatPartyContactPhone } from "@/features/network/utils/partyContactDisplay.util";
import { isOrgKycVerified } from "@/features/network/utils/orgVerification.util";
import { formatConnectionRatingValue } from "@/features/network/utils/businessConnectionOffer.util";
import { firstFiniteRating } from "@/features/ratings/services/ratings.service";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { BadgeCheck, MessageCircle, Star } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

const AVATAR_SIZE = 52;

function slugHandle(name: string, id: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18);
  const tail = id.replace(/-/g, "").slice(0, 6);
  return `${base || "partner"}${tail}.pulse`;
}

function connectionLocation(item: ConnectedOrg): string | null {
  const cityState = [item.city, item.state]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ")
    .trim();
  if (cityState) return cityState;
  const direct =
    item.business_location ?? item.location ?? item.headquarters ?? null;
  const trimmed = direct?.trim();
  return trimmed ? trimmed : null;
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
  const location = connectionLocation(item);
  const inApp = item.is_integrated;
  const isKycVerified = isOrgKycVerified(item);
  const inviteDisabled = inApp || actionLoading;
  const tone = roleTone(item.role);
  const rating = firstFiniteRating(item.rating);
  const trips =
    typeof item.total_trips === "number" && item.total_trips > 0
      ? Math.floor(item.total_trips)
      : null;

  const identityStats: string[] = [];
  if (rating != null) {
    identityStats.push(formatConnectionRatingValue(rating));
  }
  if (trips != null) {
    identityStats.push(`${trips} trip${trips === 1 ? "" : "s"}`);
  }

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [
          growStyles.bizBody,
          pressed && onPress && styles.cardPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.name}`}
      >
        <View style={growStyles.bizHeader}>
          <View style={styles.topLeadRoleRow}>
            <View
              style={[
                styles.roleTag,
                { backgroundColor: tone.bg, borderColor: tone.border },
              ]}
            >
              <Text style={[styles.roleTagText, { color: tone.text }]}>
                {item.role}
              </Text>
            </View>
            {inApp ? (
              <NetworkHubGlassBadge pill={INTEGRATED_PILL} size="compact" />
            ) : null}
          </View>
        </View>

        <View style={growStyles.bizIdentity}>
          <View style={growStyles.bizAvatar}>
            <PartyAvatar
              name={item.name}
              entityType={entityType}
              avatarUrl={item.avatar_url}
              avatarSeed={item.avatar_seed}
              size={AVATAR_SIZE}
              shape="circle"
            />
            {inApp ? <View style={styles.onlineDot} /> : null}
          </View>
          <View style={growStyles.bizIdentityText}>
            <View style={growStyles.bizNameRow}>
              <Text style={growStyles.bizName} numberOfLines={1}>
                {item.name}
              </Text>
              {isKycVerified || inApp ? (
                <BadgeCheck size={14} color={Theme.darkGreen} strokeWidth={2.2} />
              ) : null}
            </View>
            {location ? (
              <Text style={growStyles.bizLocation} numberOfLines={1}>
                {location}
              </Text>
            ) : (
              <Text style={growStyles.bizLocation} numberOfLines={1}>
                {handle}
              </Text>
            )}
            {identityStats.length > 0 ? (
              <View style={growStyles.bizStatsLine}>
                {rating != null ? (
                  <Star
                    size={11}
                    color={Theme.driverGold}
                    fill={Theme.driverGold}
                    strokeWidth={0}
                  />
                ) : null}
                {identityStats.map((part, idx) => (
                  <View key={part} style={growStyles.bizStatPart}>
                    {idx > 0 ? (
                      <Text style={growStyles.bizStatDot}>·</Text>
                    ) : null}
                    <Text style={growStyles.bizStatText}>{part}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {item.role !== "DRIVER" ? (
          <OrgVerificationBadges
            verification={item}
            compact
            style={growStyles.bizTrustBadges}
          />
        ) : null}
      </Pressable>

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
            onPress={onChat}
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
            onPress={() => onInvite?.()}
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
              <LoadingIndicator size="small" color={Theme.buttonPrimaryText} />
            ) : (
              <Text style={styles.actionBtnInviteText}>
                {item.phone?.trim() ? "Invite" : "Add phone"}
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

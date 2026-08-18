/**
 * Grow your network — professional partner / business card.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { ConnectionInviteRole } from "@/features/network/components/ConnectionRoleModal";
import {
  connectionCardStyles as styles,
  growConnectionCardStyles as growStyles,
} from "@/features/network/components/desktop/networkDesktopConnectionCard.styles";
import { OrgVerificationBadges } from "@/features/network/components/OrgVerificationBadges";
import type { DiscoverOrg } from "@/features/network/services/discover.service";
import { MutualConnectionsFacepile } from "@/features/network/components/MutualConnectionsFacepile";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { isOrgKycVerified } from "@/features/network/utils/orgVerification.util";
import {
  formatConnectionExperience,
  formatConnectionRatingValue,
} from "@/features/network/utils/businessConnectionOffer.util";
import { firstFiniteRating } from "@/features/ratings/services/ratings.service";
import type { LucideIcon } from "lucide-react-native";
import { BadgeCheck, Eye, Hourglass, Route, Star, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

const AVATAR_SIZE = 52;
/** 2-up phone / tablet cells are too narrow for a 132px action + facepile. */
const COMPACT_CARD_WIDTH = 280;

function roleTone(pendingRole: ConnectionInviteRole | null | undefined) {
  if (pendingRole === "client") {
    return {
      label: "CLIENT",
      bg: Theme.networkBadgeClientBg,
      text: Theme.networkBadgeClientText,
      border: Theme.networkBadgeClientBorder,
    };
  }
  if (pendingRole === "supplier") {
    return {
      label: "SUPPLIER",
      bg: Theme.networkBadgeSupplierBg,
      text: Theme.networkBadgeSupplierText,
      border: Theme.networkBadgeSupplierBorder,
    };
  }
  return {
    label: "PARTNER",
    bg: Theme.surface,
    text: Theme.textRouteCard,
    border: Theme.borderMedium,
  };
}

function positiveCount(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

type IdentityStat = {
  key: string;
  icon: LucideIcon;
  label: string;
  tone: "trips" | "aging" | "ratings";
};

export type NetworkDesktopGrowConnectionCardProps = {
  org: Pick<
    DiscoverOrg,
    | "id"
    | "name"
    | "avatar_seed"
    | "avatar_url"
    | "connection_status"
    | "is_kyc_verified"
    | "verification_status"
    | "trip_count"
    | "rating_count"
    | "org_created_at"
    | "city"
  >;
  locationLabel: string;
  ratingValue?: number | null;
  mutualCount?: number;
  viewerOrgId?: string | null;
  onPressMutuals?: () => void;
  onPressMutual?: (org: MutualConnectionRow) => void;
  pendingRole?: ConnectionInviteRole | null;
  connecting?: boolean;
  onOpenProfile?: () => void;
  onConnect?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
};

export function NetworkDesktopGrowConnectionCard({
  org,
  locationLabel,
  ratingValue = null,
  mutualCount = 0,
  viewerOrgId = null,
  onPressMutuals,
  onPressMutual,
  pendingRole = null,
  connecting = false,
  onOpenProfile,
  onConnect,
  onCancel,
  onDismiss,
}: NetworkDesktopGrowConnectionCardProps) {
  const [cardWidth, setCardWidth] = useState(0);
  const compactActions = cardWidth > 0 && cardWidth < COMPACT_CARD_WIDTH;
  const status = String(org.connection_status ?? "none").toLowerCase();
  const isPending = status === "pending" || Boolean(pendingRole);
  const isConnected = status === "approved";
  const isKycVerified = isOrgKycVerified(org);
  const tone = roleTone(pendingRole);
  const rating = firstFiniteRating(ratingValue);
  const trips = positiveCount(org.trip_count);
  const ratingCount = positiveCount(org.rating_count);
  const mutuals = positiveCount(mutualCount);
  const tenure = org.org_created_at
    ? formatConnectionExperience(org.org_created_at)
    : null;
  const showMutualFacepile = mutuals != null && Boolean(viewerOrgId);
  const hasMutuals = mutuals != null;
  const locationOk =
    locationLabel.trim().length > 0 && locationLabel !== "Location not set";

  const identityStats: IdentityStat[] = [];
  if (trips != null) {
    identityStats.push({
      key: "trips",
      icon: Route,
      label: `${trips} trip${trips === 1 ? "" : "s"}`,
      tone: "trips",
    });
  } else if (ratingCount != null) {
    identityStats.push({
      key: "ratings",
      icon: Star,
      label: `${ratingCount} rating${ratingCount === 1 ? "" : "s"}`,
      tone: "ratings",
    });
  }
  if (tenure) {
    identityStats.push({
      key: "aging",
      icon: Hourglass,
      label: tenure === "New" ? "New" : `${tenure} aging`,
      tone: "aging",
    });
  }

  return (
    <View
      style={[styles.card, growStyles.card]}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        setCardWidth((prev) => (prev === nextWidth ? prev : nextWidth));
      }}
    >
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          style={styles.dismissBtn}
          accessibilityRole="button"
          accessibilityLabel="Dismiss suggestion"
        >
          <X size={13} color={Theme.textMuted} strokeWidth={2.2} />
        </Pressable>
      ) : null}

      <Pressable
        onPress={onOpenProfile}
        disabled={!onOpenProfile}
        style={({ pressed }) => [
          growStyles.bizBody,
          pressed && onOpenProfile && styles.cardPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${org.name}`}
      >
        <View style={growStyles.bizIdentity}>
          <View style={growStyles.bizAvatarCol}>
            <View style={growStyles.bizAvatar}>
              <PartyAvatar
                name={org.name}
                initialsColorSeed={org.id}
                organizationImageUrl={org.avatar_url}
                avatarUrl={org.avatar_url}
                avatarSeed={org.avatar_seed}
                entityType="client"
                size={AVATAR_SIZE}
                shape="circle"
              />
              {isConnected ? <View style={styles.onlineDot} /> : null}
            </View>
            <View
              style={growStyles.avatarRatingBadge}
              accessibilityRole="text"
              accessibilityLabel={
                rating != null
                  ? `${formatConnectionRatingValue(rating)} rating`
                  : "No rating"
              }
            >
              <Star
                size={rating != null ? 14 : 12}
                color={rating != null ? Theme.driverGold : Theme.textMuted}
                fill={rating != null ? Theme.driverGold : "transparent"}
                strokeWidth={rating != null ? 0 : 1.6}
              />
              <Text
                style={[
                  growStyles.avatarRatingBadgeText,
                  rating == null && growStyles.avatarRatingBadgeTextEmpty,
                ]}
                numberOfLines={1}
              >
                {rating != null ? formatConnectionRatingValue(rating) : "No rating"}
              </Text>
            </View>
          </View>

          <View style={growStyles.bizIdentityText}>
            <View style={growStyles.bizNameRow}>
              <Text style={growStyles.bizName} numberOfLines={1}>
                {org.name}
              </Text>
              {isKycVerified ? (
                <BadgeCheck size={14} color={Theme.darkGreen} strokeWidth={2.2} />
              ) : null}
            </View>
            <Text
              style={[
                growStyles.bizLocation,
                !locationOk && growStyles.bizLocationEmpty,
              ]}
              numberOfLines={1}
            >
              {locationOk ? locationLabel : "No location"}
            </Text>
            <View style={growStyles.bizTrustBadgesSlot}>
              <View
                style={[
                  styles.roleTag,
                  growStyles.roleTag,
                  { backgroundColor: tone.bg, borderColor: tone.border },
                ]}
              >
                <Text
                  style={[
                    styles.roleTagText,
                    growStyles.roleTagText,
                    { color: tone.text },
                  ]}
                >
                  {tone.label}
                </Text>
              </View>
              <OrgVerificationBadges
                verification={org}
                compact
                style={growStyles.bizTrustBadges}
              />
            </View>
            {identityStats.length > 0 ? (
              <View style={growStyles.bizStatsLine}>
                {identityStats.map((stat, idx) => {
                  const Icon = stat.icon;
                  return (
                    <View key={stat.key} style={growStyles.bizStatPart}>
                      {idx > 0 ? (
                        <Text style={growStyles.bizStatDot}>·</Text>
                      ) : null}
                      <Icon
                        size={10}
                        color={Theme.textRouteCard}
                        fill={stat.tone === "ratings" ? Theme.driverGold : "transparent"}
                        strokeWidth={1.8}
                      />
                      <Text style={growStyles.bizStatText} numberOfLines={1}>
                        {stat.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

      <View style={growStyles.footerBlock}>
        <View style={growStyles.footerSeparator} />
        <View style={growStyles.footerRow}>
          <View
            style={[
              growStyles.mutualFacepileSlot,
              compactActions && growStyles.mutualFacepileSlotCompact,
            ]}
          >
          {showMutualFacepile ? (
            <MutualConnectionsFacepile
              viewerOrgId={viewerOrgId}
              targetOrgId={org.id}
              mutualCount={mutualCount}
              faceSize={24}
              compact
              onPressMutual={onPressMutual}
              onPressViewAll={onPressMutuals}
            />
          ) : null}
          {hasMutuals && onPressMutuals ? (
            <Pressable
              onPress={onPressMutuals}
              hitSlop={8}
              style={({ pressed }) => [
                growStyles.mutualsViewBtn,
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`View mutual connections with ${org.name}`}
            >
              <Text style={growStyles.mutualsWatermark} numberOfLines={1}>
                mutuals
              </Text>
              <Eye size={13} color={Theme.textRouteCard} strokeWidth={2} />
            </Pressable>
          ) : (
            <Text
              style={growStyles.mutualsWatermark}
              numberOfLines={1}
            >
              {hasMutuals ? "mutuals" : "no mutuals"}
            </Text>
          )}
        </View>

        {isConnected ? (
          <View
            style={[
              growStyles.actionBtn,
              compactActions && growStyles.actionBtnCompact,
              growStyles.actionBtnConnected,
            ]}
          >
            <Text
              style={[
                styles.actionBtnConnectedText,
                growStyles.actionBtnConnectedText,
              ]}
            >
              Connected
            </Text>
          </View>
        ) : isPending ? (
          <Pressable
            onPress={() => onCancel?.()}
            disabled={connecting}
            style={({ pressed }) => [
              growStyles.actionBtn,
              compactActions && growStyles.actionBtnCompact,
              growStyles.actionBtnPending,
              connecting && styles.actionBtnDisabled,
              pressed && styles.actionBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Cancel request"
          >
            {connecting ? (
              <LoadingIndicator size="small" color={Theme.textMuted} />
            ) : (
              <Text
                style={[
                  styles.actionBtnPendingText,
                  growStyles.actionBtnPendingText,
                ]}
              >
                Request sent
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => onConnect?.()}
            disabled={connecting}
            style={({ pressed }) => [
              growStyles.actionBtn,
              compactActions && growStyles.actionBtnCompact,
              growStyles.actionBtnInvite,
              connecting && styles.actionBtnDisabled,
              pressed && !connecting && styles.actionBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Connect with ${org.name}`}
          >
            {connecting ? (
              <LoadingIndicator size="small" color={Theme.primary} />
            ) : (
              <Text
                style={[
                  styles.actionBtnInviteText,
                  growStyles.actionBtnInviteText,
                ]}
              >
                Connect
              </Text>
            )}
          </Pressable>
        )}
      </View>
      </View>
    </View>
  );
}

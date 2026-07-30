/**
 * Grow your network — same Metronic tile layout as Your connections.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { ConnectionInviteRole } from "@/features/network/components/ConnectionRoleModal";
import { MutualConnectionsFacepile } from "@/features/network/components/MutualConnectionsFacepile";
import {
  connectionCardStyles as styles,
  growConnectionCardStyles as growStyles,
} from "@/features/network/components/desktop/networkDesktopConnectionCard.styles";
import { NetworkDesktopSalesStars } from "@/features/network/components/desktop/NetworkDesktopSalesStars";
import { OrgVerificationBadges } from "@/features/network/components/OrgVerificationBadges";
import type { DiscoverOrg } from "@/features/network/services/discover.service";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { isOrgKycVerified } from "@/features/network/utils/orgVerification.util";
import { BadgeCheck, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

const GROW_CARD_MUTUAL_FACE_SIZE = 22;

function ratingFilledCount(rating: number | null | undefined): number {
  if (rating == null || !Number.isFinite(rating)) return 0;
  return Math.max(0, Math.min(5, Math.round(rating)));
}

function formatRating(rating: number | null | undefined): string {
  if (rating == null || !Number.isFinite(rating)) return "—";
  return rating.toFixed(1);
}

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
    bg: "#F5F6FA",
    text: "#78829D",
    border: "rgba(120, 130, 157, 0.18)",
  };
}

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
  const status = String(org.connection_status ?? "none").toLowerCase();
  const isPending = status === "pending" || Boolean(pendingRole);
  const isConnected = status === "approved";
  const isKycVerified = isOrgKycVerified(org);
  const tone = roleTone(pendingRole);
  const filledStars = ratingFilledCount(ratingValue);
  const ratingLabel = formatRating(ratingValue);

  const showStatusChip = !isConnected && !isPending && mutualCount <= 0;
  const showMutualFacepile =
    mutualCount > 0 && Boolean(viewerOrgId) && !isConnected && !isPending;

  return (
    <View style={[styles.card, growStyles.card]}>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          style={styles.dismissBtn}
          accessibilityRole="button"
          accessibilityLabel="Dismiss suggestion"
        >
          <X size={13} color="#A1A5B7" strokeWidth={2.2} />
        </Pressable>
      ) : null}

      <Pressable
        onPress={onOpenProfile}
        disabled={!onOpenProfile}
        style={({ pressed }) => [
          styles.cardBody,
          pressed && onOpenProfile && styles.cardPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${org.name}`}
      >
        <View style={styles.topMetaRow}>
          <View style={styles.topMetaLeft}>
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
          </View>
          <View style={styles.ratingWrap}>
            <NetworkDesktopSalesStars filledStars={filledStars} size={10} />
            <Text
              style={[
                styles.ratingText,
                growStyles.ratingText,
                ratingValue == null && styles.ratingTextEmpty,
              ]}
            >
              {ratingLabel}
            </Text>
          </View>
        </View>

        <View style={[styles.avatarWrap, growStyles.avatarWrap]}>
          <PartyAvatar
            name={org.name}
            initialsColorSeed={org.id}
            organizationImageUrl={org.avatar_url}
            avatarUrl={org.avatar_url}
            avatarSeed={org.avatar_seed}
            entityType="client"
            size={52}
            shape="circle"
          />
          {isConnected ? <View style={styles.onlineDot} /> : null}
        </View>

        <View style={styles.nameRow}>
          <Text style={[styles.name, growStyles.name]} numberOfLines={1}>
            {org.name}
          </Text>
          {isKycVerified || isConnected ? (
            <BadgeCheck size={13} color={Theme.darkGreen} strokeWidth={2} />
          ) : null}
        </View>

        <View style={growStyles.trustBadgesSlot}>
          <OrgVerificationBadges
            verification={org}
            compact
            style={growStyles.trustBadgesRow}
          />
        </View>

        <Text style={[styles.handle, growStyles.handle]} numberOfLines={1}>
          {locationLabel}
        </Text>
      </Pressable>

      <View
        style={[
          styles.footerRow,
          growStyles.footerRow,
          !showStatusChip && !showMutualFacepile && growStyles.footerActionOnly,
        ]}
      >
        {showMutualFacepile ? (
          <View style={growStyles.mutualFacepileSlot}>
            <MutualConnectionsFacepile
              viewerOrgId={viewerOrgId}
              targetOrgId={org.id}
              mutualCount={mutualCount}
              faceSize={GROW_CARD_MUTUAL_FACE_SIZE}
              compact
              onPressMutual={onPressMutual}
              onPressViewAll={onPressMutuals}
            />
          </View>
        ) : showStatusChip ? (
          <View style={growStyles.mutualFacepileSlot}>
            <View style={[styles.appTag, growStyles.appTag, styles.appTagOff]}>
              <View style={[styles.appTagDot, styles.appTagDotOff]} />
              <Text
                style={[
                  styles.appTagText,
                  growStyles.appTagText,
                  styles.appTagTextOff,
                ]}
              >
                Discover
              </Text>
            </View>
          </View>
        ) : (
          <View style={growStyles.mutualFacepileSlot} />
        )}

        {isConnected ? (
          <View
            style={[
              styles.actionBtn,
              growStyles.actionBtn,
              styles.actionBtnConnected,
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
              styles.actionBtn,
              growStyles.actionBtn,
              styles.actionBtnPending,
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
              styles.actionBtn,
              growStyles.actionBtn,
              styles.actionBtnInvite,
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
  );
}

/**
 * Grow your network — same Metronic tile layout as Your connections.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { ConnectionInviteRole } from "@/features/network/components/ConnectionRoleModal";
import {
  connectionCardStyles as styles,
  growConnectionCardStyles as growStyles,
} from "@/features/network/components/desktop/networkDesktopConnectionCard.styles";
import { NetworkDesktopSalesStars } from "@/features/network/components/desktop/NetworkDesktopSalesStars";
import type { DiscoverOrg } from "@/features/network/services/discover.service";
import { BadgeCheck, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

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
  org: Pick<DiscoverOrg, "id" | "name" | "avatar_seed" | "connection_status">;
  locationLabel: string;
  ratingValue?: number | null;
  mutualCount?: number;
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
  const tone = roleTone(pendingRole);
  const filledStars = ratingFilledCount(ratingValue);
  const ratingLabel = formatRating(ratingValue);

  const showStatusChip = !isConnected && !isPending;
  const statusTag =
    mutualCount > 0
      ? { label: `${mutualCount} mutual`, on: false, pending: false }
      : { label: "Discover", on: false, pending: false };

  return (
    <Pressable
      onPress={onOpenProfile}
      disabled={!onOpenProfile}
      style={({ pressed }) => [
        styles.card,
        growStyles.card,
        pressed && onOpenProfile && styles.cardPressed,
      ]}
      accessibilityLabel={`Open ${org.name}`}
    >
      {onDismiss ? (
        <Pressable
          onPress={(e) => {
            e?.stopPropagation?.();
            onDismiss();
          }}
          hitSlop={8}
          style={styles.dismissBtn}
          accessibilityLabel="Dismiss suggestion"
        >
          <X size={13} color="#A1A5B7" strokeWidth={2.2} />
        </Pressable>
      ) : null}

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
          entityType="client"
          avatarSeed={org.avatar_seed}
          size={52}
          shape="circle"
        />
        {isConnected ? <View style={styles.onlineDot} /> : null}
      </View>

      <View style={styles.nameRow}>
        <Text style={[styles.name, growStyles.name]} numberOfLines={1}>
          {org.name}
        </Text>
        {isConnected ? (
          <BadgeCheck size={13} color={Theme.primary} strokeWidth={2} />
        ) : null}
      </View>

      <Text style={[styles.handle, growStyles.handle]} numberOfLines={1}>
        {locationLabel}
      </Text>

      <View
        style={[
          styles.footerRow,
          growStyles.footerRow,
          !showStatusChip && growStyles.footerActionOnly,
        ]}
      >
        {showStatusChip ? (
          <View style={[styles.appTag, growStyles.appTag, styles.appTagOff]}>
            <View style={[styles.appTagDot, styles.appTagDotOff]} />
            <Text
              style={[
                styles.appTagText,
                growStyles.appTagText,
                styles.appTagTextOff,
              ]}
            >
              {statusTag.label}
            </Text>
          </View>
        ) : null}

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
            onPress={(e) => {
              e?.stopPropagation?.();
              onCancel?.();
            }}
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
            onPress={(e) => {
              e?.stopPropagation?.();
              onConnect?.();
            }}
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
    </Pressable>
  );
}

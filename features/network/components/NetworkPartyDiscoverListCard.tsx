/**
 * Grow your network / People you may know — list row (transaction typography).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ConnectionInviteRole } from "@/features/network/components/ConnectionRoleModal";
import { MutualConnectionsFacepile } from "@/features/network/components/MutualConnectionsFacepile";
import {
  MutedStarMetric,
  TransitNodeMetric,
} from "@/features/network/components/NetworkListCardMetrics";
import { discoverListCardStyles as styles } from "@/features/network/components/networkPartyDiscoverListCard.styles";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { Check, MapPin, UserPlus, X } from "lucide-react-native";
import {
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const DISCOVER_LIST_COMPACT_BREAKPOINT = 640;

export type NetworkPartyDiscoverListCardProps = {
  orgId: string;
  name: string;
  locationLabel: string;
  locationUnset?: boolean;
  avatarSeed?: string | null;
  totalTrips?: number | null;
  ratingValue?: number | null;
  mutualCount?: number;
  connectionStatus?: string;
  pendingRole?: ConnectionInviteRole | null;
  loading?: boolean;
  viewerOrgId?: string | null;
  onOpenProfile?: () => void;
  onConnect?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
  onPressMutuals?: () => void;
  onPressMutual?: (org: MutualConnectionRow) => void;
  /** Force compact layout (e.g. hub 2-up rows). */
  compact?: boolean;
  /** Full-width desktop split pane — horizontal row, tighter padding. */
  desktopPane?: boolean;
};

function formatRating(rating: number | null | undefined): string {
  if (rating == null || !Number.isFinite(rating)) return "—";
  return rating.toFixed(1);
}

export function NetworkPartyDiscoverListCard({
  orgId,
  name,
  locationLabel,
  locationUnset = false,
  avatarSeed,
  totalTrips,
  ratingValue,
  mutualCount = 0,
  connectionStatus = "none",
  pendingRole = null,
  loading = false,
  viewerOrgId,
  onOpenProfile,
  onConnect,
  onCancel,
  onDismiss,
  onPressMutuals,
  onPressMutual,
  compact: compactProp,
  desktopPane = false,
}: NetworkPartyDiscoverListCardProps) {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const compact =
    compactProp ?? (!desktopPane && width < DISCOVER_LIST_COMPACT_BREAKPOINT);

  const displayName = name.trim() || "—";
  const tripsDisplay =
    typeof totalTrips === "number" && totalTrips >= 0 ? String(totalTrips) : "0";
  const rating = formatRating(ratingValue ?? null);
  const status = String(connectionStatus ?? "none").toLowerCase();
  const isPending = status === "pending" || Boolean(pendingRole);
  const isConnected = status === "approved";
  const hasMutuals = mutualCount > 0 && Boolean(viewerOrgId);

  const pendingLabel =
    pendingRole === "client"
      ? t("networkDiscoverRequestSentAsClient")
      : pendingRole === "supplier"
        ? t("networkDiscoverRequestSentAsSupplier")
        : t("networkDiscoverRequestSent");

  const avatarSize = compact ? 36 : 40;

  return (
    <Pressable
      onPress={onOpenProfile}
      disabled={!onOpenProfile}
      style={({ pressed }) => [pressed && onOpenProfile && { opacity: 0.97 }]}
    >
      <View
        style={[
          styles.card,
          desktopPane && styles.cardDesktopPane,
          compact && styles.cardCompact,
        ]}
      >
        <View style={[styles.row, compact && styles.rowCompact]}>
          <View style={styles.left}>
            <View style={styles.avatarCol}>
              <View style={styles.avatarWrap}>
                <PartyAvatar
                  name={displayName}
                  initialsColorSeed={orgId}
                  avatarSeed={avatarSeed}
                  entityType="client"
                  size={avatarSize}
                />
              </View>
            </View>

            <View style={styles.identity}>
              <Text
                style={[styles.partyName, compact && styles.partyNameCompact]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <View style={styles.locationRow}>
                <MapPin size={9} color={Theme.textMuted} strokeWidth={2.2} />
                <Text
                  style={[
                    styles.locationText,
                    locationUnset && { color: Theme.textMuted, fontStyle: "italic" },
                  ]}
                  numberOfLines={1}
                >
                  {locationLabel}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.right, compact && styles.rightCompact]}>
            <View style={[styles.metricsBlock, compact && styles.metricsBlockCompact]}>
              {hasMutuals ? (
                <View style={styles.mutualsSlot}>
                  <MutualConnectionsFacepile
                    viewerOrgId={viewerOrgId!}
                    targetOrgId={orgId}
                    mutualCount={mutualCount}
                    faceSize={compact ? 18 : 20}
                    showSectionLabel={false}
                    compact
                    onPressMutual={onPressMutual}
                    onPressViewAll={onPressMutuals}
                  />
                </View>
              ) : null}
              <TransitNodeMetric count={tripsDisplay} compact />
              <MutedStarMetric rating={rating} compact />
            </View>

            <View style={styles.actionCol}>
              <View style={styles.actionRow}>
                {isConnected ? (
                  <View style={styles.statusBtn}>
                    <Check size={12} color={Theme.primary} strokeWidth={2.4} />
                    <Text style={styles.statusBtnText} numberOfLines={1}>
                      {t("networkDiscoverConnected")}
                    </Text>
                  </View>
                ) : isPending ? (
                  <Pressable
                    onPress={onCancel}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.statusBtn,
                      pressed && { opacity: 0.88 },
                    ]}
                  >
                    {loading ? (
                      <LoadingIndicator size={14} color={Theme.primary} />
                    ) : (
                      <>
                        <Check size={12} color={Theme.primary} strokeWidth={2.4} />
                        <Text style={styles.statusBtnText} numberOfLines={2}>
                          {pendingLabel}
                        </Text>
                      </>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={onConnect}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.connectBtn,
                      (pressed || loading) && { opacity: 0.9 },
                    ]}
                  >
                    {loading ? (
                      <LoadingIndicator size={14} color={Theme.primary} />
                    ) : (
                      <>
                        <UserPlus size={12} color={Theme.primary} strokeWidth={2.4} />
                        <Text style={styles.connectBtnText} numberOfLines={1}>
                          {t("networkDiscoverConnect")}
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}

                {onDismiss ? (
                  <Pressable
                    onPress={onDismiss}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.dismissBtn,
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityLabel={t("dismiss")}
                  >
                    <X size={14} color={Theme.textMuted} strokeWidth={2.4} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

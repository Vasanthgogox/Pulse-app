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
  NetworkHubMetricsInlineRow,
  TransitNodeMetric,
} from "@/features/network/components/NetworkListCardMetrics";
import { discoverListCardStyles as styles } from "@/features/network/components/networkPartyDiscoverListCard.styles";
import {
  networkHubListCardChromeStyles,
  networkHubNativeListStyles as nativeStyles,
} from "@/features/network/components/networkHubListCardChrome";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { SPLIT_STACK_BREAKPOINT } from "@/features/network/constants/networkHubGrid";
import { Check, MapPin, UserPlus, X } from "lucide-react-native";
import {
  Platform,
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
  compact?: boolean;
  desktopPane?: boolean;
  mobileGrid?: boolean;
  nativeListRow?: boolean;
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
  mobileGrid: mobileGridProp = false,
  nativeListRow: nativeListRowProp,
}: NetworkPartyDiscoverListCardProps) {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const mobileGrid = mobileGridProp === true;
  const nativeListRow =
    nativeListRowProp ??
    (!desktopPane &&
      Platform.OS !== "web" &&
      width < SPLIT_STACK_BREAKPOINT &&
      !mobileGrid);
  const compact =
    !mobileGrid &&
    !nativeListRow &&
    (compactProp ?? (!desktopPane && width < DISCOVER_LIST_COMPACT_BREAKPOINT));

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

  const avatarSize = nativeListRow ? 40 : mobileGrid ? 32 : compact ? 36 : 40;
  const metricsCompact = compact || mobileGrid || nativeListRow;
  const metricsMobile = mobileGrid || nativeListRow;
  const showStatusAction = !isConnected || !mobileGrid;

  const metricsTiles = nativeListRow ? (
    <View style={styles.nativeFooterMetrics}>
      {hasMutuals ? (
        <View style={styles.mutualsSlot}>
          <MutualConnectionsFacepile
            viewerOrgId={viewerOrgId!}
            targetOrgId={orgId}
            mutualCount={mutualCount}
            faceSize={18}
            showSectionLabel={false}
            compact
            onPressMutual={onPressMutual}
            onPressViewAll={onPressMutuals}
          />
        </View>
      ) : null}
      <NetworkHubMetricsInlineRow trips={tripsDisplay} rating={rating} />
    </View>
  ) : (
    <>
      {hasMutuals ? (
        <View style={styles.mutualsSlot}>
          <MutualConnectionsFacepile
            viewerOrgId={viewerOrgId!}
            targetOrgId={orgId}
            mutualCount={mutualCount}
            faceSize={mobileGrid ? 16 : compact ? 18 : 20}
            showSectionLabel={false}
            compact
            onPressMutual={onPressMutual}
            onPressViewAll={onPressMutuals}
          />
        </View>
      ) : null}
      <TransitNodeMetric count={tripsDisplay} compact={metricsCompact} mobile={metricsMobile} />
      <MutedStarMetric rating={rating} compact={metricsCompact} mobile={metricsMobile} />
    </>
  );

  const statusAction = showStatusAction ? (
    <View style={styles.nativeActionWrap}>
      {isConnected ? (
        <View style={[styles.statusBtn, styles.statusBtnNative]}>
          <Check size={11} color={Theme.primary} strokeWidth={2.4} />
          <Text style={[styles.statusBtnText, styles.statusBtnTextNative]} numberOfLines={1}>
            {t("networkDiscoverConnected")}
          </Text>
        </View>
      ) : isPending ? (
        <Pressable
          onPress={onCancel}
          disabled={loading}
          style={({ pressed }) => [
            styles.statusBtn,
            styles.statusBtnNative,
            pressed && { opacity: 0.88 },
          ]}
        >
          {loading ? (
            <LoadingIndicator size={14} color={Theme.primary} />
          ) : (
            <>
              <Check size={11} color={Theme.primary} strokeWidth={2.4} />
              <Text style={[styles.statusBtnText, styles.statusBtnTextNative]} numberOfLines={1}>
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
            styles.connectBtnNative,
            (pressed || loading) && { opacity: 0.9 },
          ]}
        >
          {loading ? (
            <LoadingIndicator size={14} color={Theme.primary} />
          ) : (
            <>
              <UserPlus size={11} color={Theme.primary} strokeWidth={2.4} />
              <Text style={[styles.connectBtnText, styles.connectBtnTextNative]} numberOfLines={1}>
                {t("networkDiscoverConnect")}
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  ) : null;

  if (nativeListRow) {
    return (
      <View style={nativeStyles.card}>
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            hitSlop={10}
            style={({ pressed }) => [nativeStyles.dismissBtn, pressed && { opacity: 0.85 }]}
            accessibilityLabel={t("dismiss")}
          >
            <X size={12} color={Theme.textMuted} strokeWidth={2.4} />
          </Pressable>
        ) : null}

        <Pressable
          onPress={onOpenProfile}
          disabled={!onOpenProfile}
          style={({ pressed }) => [
            nativeStyles.headerPressable,
            pressed && onOpenProfile && nativeStyles.headerPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${displayName} — ${t("networkDiscoverFullProfile")}`}
        >
          <View style={nativeStyles.avatarCol}>
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
          <View style={nativeStyles.identity}>
            <Text style={styles.partyNameNativeList} numberOfLines={2}>
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
        </Pressable>

        <View style={nativeStyles.footer}>
          <View style={nativeStyles.footerMetrics}>{metricsTiles}</View>
          {statusAction ? (
            <View style={nativeStyles.footerAction}>{statusAction}</View>
          ) : null}
        </View>
      </View>
    );
  }

  const identityBlock = (
    <>
      <View style={[styles.avatarCol, mobileGrid && styles.avatarColMobileGrid]}>
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

      <View
        style={[
          styles.identity,
          mobileGrid && styles.identityMobileGrid,
        ]}
      >
        <Text
          style={[
            styles.partyName,
            compact && styles.partyNameCompact,
            mobileGrid && styles.partyNameMobileGrid,
          ]}
          numberOfLines={mobileGrid ? 2 : 1}
        >
          {displayName}
        </Text>
        <View style={styles.locationRow}>
          <MapPin size={mobileGrid ? 8 : 9} color={Theme.textMuted} strokeWidth={2.2} />
          <Text
            style={[
              styles.locationText,
              mobileGrid && styles.locationTextMobileGrid,
              locationUnset && { color: Theme.textMuted, fontStyle: "italic" },
            ]}
            numberOfLines={1}
          >
            {locationLabel}
          </Text>
        </View>
      </View>
    </>
  );

  return (
    <View
      style={[
        styles.card,
        desktopPane && styles.cardDesktopPane,
        compact && styles.cardCompact,
        mobileGrid && networkHubListCardChromeStyles.cardMobileGrid,
      ]}
    >
      <View
        style={[
          styles.row,
          compact && styles.rowCompact,
          mobileGrid && styles.rowMobileGrid,
        ]}
      >
        <Pressable
          onPress={onOpenProfile}
          disabled={!onOpenProfile}
          style={({ pressed }) => [
            styles.left,
            mobileGrid && styles.leftMobileGrid,
            pressed && onOpenProfile && styles.leftPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${displayName} — ${t("networkDiscoverFullProfile")}`}
        >
          {identityBlock}
        </Pressable>

        <View style={[styles.right, compact && styles.rightCompact, mobileGrid && styles.rightMobileGrid]}>
          <View
            style={[
              styles.metricsBlock,
              metricsCompact && styles.metricsBlockCompact,
              mobileGrid && networkHubListCardChromeStyles.metricsBlockMobileGrid,
            ]}
          >
            {metricsTiles}
          </View>

          {statusAction ? (
            <View style={[styles.actionCol, mobileGrid && styles.actionColMobileGrid]}>
              <View style={styles.actionRow}>
                {isConnected ? (
                  <View style={[styles.statusBtn, mobileGrid && styles.statusBtnMobileGrid]}>
                    <Check size={mobileGrid ? 10 : 12} color={Theme.primary} strokeWidth={2.4} />
                    <Text
                      style={[styles.statusBtnText, mobileGrid && styles.statusBtnTextMobileGrid]}
                      numberOfLines={1}
                    >
                      {t("networkDiscoverConnected")}
                    </Text>
                  </View>
                ) : isPending ? (
                  <Pressable
                    onPress={onCancel}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.statusBtn,
                      mobileGrid && styles.statusBtnMobileGrid,
                      pressed && { opacity: 0.88 },
                    ]}
                  >
                    {loading ? (
                      <LoadingIndicator size={14} color={Theme.primary} />
                    ) : (
                      <>
                        <Check size={mobileGrid ? 10 : 12} color={Theme.primary} strokeWidth={2.4} />
                        <Text
                          style={[styles.statusBtnText, mobileGrid && styles.statusBtnTextMobileGrid]}
                          numberOfLines={mobileGrid ? 1 : 2}
                        >
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
                      mobileGrid && styles.connectBtnMobileGrid,
                      (pressed || loading) && { opacity: 0.9 },
                    ]}
                  >
                    {loading ? (
                      <LoadingIndicator size={14} color={Theme.primary} />
                    ) : (
                      <>
                        <UserPlus
                          size={mobileGrid ? 10 : 12}
                          color={Theme.primary}
                          strokeWidth={2.4}
                        />
                        <Text
                          style={[
                            styles.connectBtnText,
                            mobileGrid && styles.connectBtnTextMobileGrid,
                          ]}
                          numberOfLines={1}
                        >
                          {t("networkDiscoverConnect")}
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}

                {onDismiss && !mobileGrid ? (
                  <Pressable
                    onPress={onDismiss}
                    hitSlop={8}
                    style={({ pressed }) => [styles.dismissBtn, pressed && { opacity: 0.85 }]}
                    accessibilityLabel={t("dismiss")}
                  >
                    <X size={14} color={Theme.textMuted} strokeWidth={2.4} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

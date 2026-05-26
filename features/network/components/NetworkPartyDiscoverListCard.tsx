/**
 * Grow your network / People you may know — list row (transaction typography).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ConnectionInviteRole } from "@/features/network/components/ConnectionRoleModal";
import { NetworkHubGlassButton } from "@/features/network/components/NetworkHubGlassButton";
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

  /** Status button label stays compact ("Request sent"); the role used
   *  for the invitation is communicated by a sibling pill rendered just
   *  before the button. */
  const pendingLabel = t("networkDiscoverRequestSent");
  const pendingRoleTag =
    pendingRole === "client"
      ? t("networkDiscoverPendingRoleClient")
      : pendingRole === "supplier"
        ? t("networkDiscoverPendingRoleSupplier")
        : null;

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
            faceSize={32}
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
            faceSize={mobileGrid ? 30 : compact ? 34 : 36}
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
    <View style={[styles.nativeActionWrap, styles.actionRow]}>
      {isConnected ? (
        <NetworkHubGlassButton variant="connected" label={t("networkDiscoverConnected")} />
      ) : isPending ? (
        <>
          {pendingRoleTag ? (
            <View style={styles.pendingRolePill}>
              <Text style={styles.pendingRolePillText} numberOfLines={1}>
                {pendingRoleTag}
              </Text>
            </View>
          ) : null}
          <NetworkHubGlassButton
            variant="neutral"
            label={pendingLabel}
            size="default"
            onPress={onCancel}
            loading={loading}
            leadingIcon={<Check size={13} color={Theme.primary} strokeWidth={2.4} />}
          />
        </>
      ) : (
        <NetworkHubGlassButton
          variant="primary"
          label={t("networkDiscoverConnect")}
          size="default"
          onPress={onConnect}
          loading={loading}
          leadingIcon={<UserPlus size={13} color={Theme.primary} strokeWidth={2.4} />}
        />
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
          <View style={nativeStyles.sectionDivider} />
          <View style={nativeStyles.footerBody}>
            <View style={nativeStyles.footerMetrics}>{metricsTiles}</View>
            {statusAction ? (
              <View style={nativeStyles.footerAction}>{statusAction}</View>
            ) : null}
          </View>
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
              styles.metricsRow,
              metricsCompact && styles.metricsRowCompact,
              mobileGrid && networkHubListCardChromeStyles.metricsRowMobileGrid,
            ]}
          >
            {metricsTiles}
          </View>

          {statusAction ? (
            <View style={[styles.actionCol, mobileGrid && styles.actionColMobileGrid]}>
              <View style={styles.actionRow}>
                {isConnected ? (
                  <NetworkHubGlassButton
                    variant="connected"
                    label={t("networkDiscoverConnected")}
                    size={mobileGrid ? "compact" : "default"}
                  />
                ) : isPending ? (
                  <>
                    {pendingRoleTag ? (
                      <View style={styles.pendingRolePill}>
                        <Text style={styles.pendingRolePillText} numberOfLines={1}>
                          {pendingRoleTag}
                        </Text>
                      </View>
                    ) : null}
                    <NetworkHubGlassButton
                      variant="neutral"
                      label={pendingLabel}
                      size={mobileGrid ? "compact" : "default"}
                      onPress={onCancel}
                      loading={loading}
                      leadingIcon={
                        <Check
                          size={mobileGrid ? 11 : 13}
                          color={Theme.primary}
                          strokeWidth={2.4}
                        />
                      }
                    />
                  </>
                ) : (
                  <NetworkHubGlassButton
                    variant="primary"
                    label={t("networkDiscoverConnect")}
                    size={mobileGrid ? "compact" : "default"}
                    onPress={onConnect}
                    loading={loading}
                    leadingIcon={
                      <UserPlus
                        size={mobileGrid ? 11 : 13}
                        color={Theme.primary}
                        strokeWidth={2.4}
                      />
                    }
                  />
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

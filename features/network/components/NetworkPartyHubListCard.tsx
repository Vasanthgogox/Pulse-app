/**
 * "Your connections" list row — full-width horizontal card (reference list layout).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { PartyEntityAvatarGlow } from "@/components/PartyEntityAvatarGlow";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { NetworkHubGlassBadge } from "@/features/network/components/NetworkHubGlassBadge";
import { NetworkHubGlassButton } from "@/features/network/components/NetworkHubGlassButton";
import { MutualConnectionsFacepile } from "@/features/network/components/MutualConnectionsFacepile";
import {
  MutedStarMetric,
  NetworkHubMetricsInlineRow,
  TransitNodeMetric,
} from "@/features/network/components/NetworkListCardMetrics";
import type { NetworkPartyRolePill } from "@/features/network/components/NetworkPartyProfileCard";
import { hubListCardStyles as styles } from "@/features/network/components/networkPartyHubListCard.styles";
import {
  networkHubListCardChromeStyles,
  networkHubNativeListStyles as nativeStyles,
} from "@/features/network/components/networkHubListCardChrome";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { SPLIT_STACK_BREAKPOINT } from "@/features/network/constants/networkHubGrid";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { partyAccentFromEntityType } from "@/lib/partyEntityAccent";
import { Building2, Phone, Send } from "lucide-react-native";
import { useMemo } from "react";
import {
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const HUB_LIST_COMPACT_BREAKPOINT = 720;

export type NetworkPartyHubListCardProps = {
  partyId: string;
  name: string;
  partyType: string;
  phone: string;
  location?: string;
  avatarSeed?: string | null;
  avatarUrl?: string | null;
  entityType?: PartyEntityType;
  avatarTintBg?: string;
  rolePills: NetworkPartyRolePill[];
  totalTrips?: number | null;
  ratingValue?: number | null;
  mutualCount?: number;
  showOnline?: boolean;
  viewerOrgId?: string | null;
  onPressCard?: () => void;
  onOpenProfile?: () => void;
  onPressMutuals?: () => void;
  onPressMutual?: (org: MutualConnectionRow) => void;
  onConnectionAction?: () => void;
  connectionActionLabel?: string;
  connectionIntegrated?: boolean;
  connectionActionDisabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  mobileGrid?: boolean;
  nativeListRow?: boolean;
};

export function NetworkPartyHubListCard({
  partyId,
  name,
  partyType,
  phone,
  avatarSeed,
  avatarUrl,
  entityType = "client",
  rolePills,
  totalTrips,
  ratingValue,
  mutualCount = 0,
  showOnline = false,
  viewerOrgId,
  onPressCard,
  onOpenProfile,
  onPressMutuals,
  onPressMutual,
  onConnectionAction,
  connectionActionLabel,
  connectionIntegrated = false,
  connectionActionDisabled = false,
  loading = false,
  compact: compactProp,
  mobileGrid: mobileGridProp = false,
  nativeListRow: nativeListRowProp,
}: NetworkPartyHubListCardProps) {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const mobileGrid = mobileGridProp === true;
  const nativeListRow =
    nativeListRowProp ??
    (Platform.OS !== "web" && width < SPLIT_STACK_BREAKPOINT && !mobileGrid);
  const compact =
    !mobileGrid &&
    !nativeListRow &&
    (compactProp ?? width < HUB_LIST_COMPACT_BREAKPOINT);

  const displayName = name.trim() || "—";
  const tripsDisplay =
    typeof totalTrips === "number" && totalTrips >= 0 ? String(totalTrips) : "0";
  const rating =
    typeof ratingValue === "number" && Number.isFinite(ratingValue)
      ? ratingValue.toFixed(1)
      : "—";
  const showPhone = phone.trim().length > 0 && phone !== "NA";
  const hasMutuals = mutualCount > 0 && Boolean(viewerOrgId);

  const actionLabel = useMemo(
    () =>
      connectionActionLabel ??
      (connectionIntegrated
        ? t("networkDiscoverConnected")
        : t("networkConnectionInvite")),
    [connectionActionLabel, connectionIntegrated, t],
  );

  const avatarSize = nativeListRow ? 48 : mobileGrid ? 40 : compact ? 40 : 44;
  const metricsCompact = compact || mobileGrid || nativeListRow;
  const metricsMobile = mobileGrid || nativeListRow;

  /** Split rolePills into:
   *   - `rolePill` — the relationship category (CLIENT / SUPPLIER / DRIVER)
   *     that tells the viewer *how* they are connected to this party. Rendered
   *     inline under the party name as a small colored chip with role-specific
   *     tone (indigo / green / amber).
   *   - `integrationPill` — "INTEGRATED" status, hoisted out and floated at
   *     the card's top-right corner.
   *  The role chip lives in the identity column so it can never collide with
   *  the floating INTEGRATED badge anchored to the top-right. */
  const integrationPill = useMemo(
    () => rolePills.find((p) => p.label === "INTEGRATED") ?? null,
    [rolePills],
  );
  const rolePill = useMemo(
    () =>
      rolePills.find(
        (p) =>
          p.label === "CLIENT" ||
          p.label === "SUPPLIER" ||
          p.label === "DRIVER",
      ) ?? null,
    [rolePills],
  );
  /** CONNECTED status pill is dropped whenever the card already carries
   *  the floating INTEGRATED badge — they convey the same signal (this
   *  org is a confirmed peer). Without integration tier info to display,
   *  the status pill still mounts so the viewer has at least one explicit
   *  "you're connected" affordance. Primary CTAs (CONNECT / pending) are
   *  always rendered. Mobile-grid continues to hide the redundant pill
   *  in 2-up cells regardless. */
  const showConnectionAction =
    !connectionIntegrated || (!integrationPill && !mobileGrid);
  /** Right-aligned safety margin so the role chip never slides beneath
   *  the floating INTEGRATED badge. The new compact-size badge (~50 px
   *  wide at fontSize 6) needs much less reserved space than the prior
   *  default-size badge — 72 px clears the badge + its 12 px right
   *  inset with a small breathing buffer. */
  const integrationOffsetGuard = integrationPill ? 72 : 0;

  const metricsTiles = nativeListRow ? (
    <View style={styles.nativeFooterMetrics}>
      {hasMutuals ? (
        <View style={styles.mutualsSlot}>
          <MutualConnectionsFacepile
            viewerOrgId={viewerOrgId!}
            targetOrgId={partyId}
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
            targetOrgId={partyId}
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

  const connectionAction = showConnectionAction ? (
    <View style={styles.nativeActionWrap}>
      {connectionIntegrated ? (
        <NetworkHubGlassButton variant="connected" label={actionLabel} />
      ) : (
        <NetworkHubGlassButton
          variant="primary"
          label={actionLabel}
          onPress={onConnectionAction}
          disabled={connectionActionDisabled}
          loading={loading}
          leadingIcon={<Send size={13} color={Theme.primary} strokeWidth={2.4} />}
        />
      )}
    </View>
  ) : null;

  if (mobileGrid) {
    const avatarPressHandler = onOpenProfile ?? onPressCard;
    const gridAvatarSize = 52;
    const accent = partyAccentFromEntityType(entityType);
    return (
      <Pressable
        onPress={onPressCard}
        disabled={!onPressCard}
        style={({ pressed }) => [pressed && onPressCard && { opacity: 0.94 }]}
        accessibilityRole="button"
        accessibilityLabel={displayName}
      >
        <View
          style={[
            networkHubListCardChromeStyles.cardMobileGrid,
            styles.cardGridTile,
          ]}
        >
          <Pressable
            onPress={avatarPressHandler}
            disabled={!avatarPressHandler}
            hitSlop={6}
            style={({ pressed }) => [
              styles.gridTileAvatarCol,
              pressed && avatarPressHandler && { opacity: 0.88 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={displayName}
          >
            <PartyEntityAvatarGlow accent={accent} size={gridAvatarSize}>
              <PartyAvatar
                name={displayName}
                initialsColorSeed={partyId}
                avatarSeed={avatarSeed}
                avatarUrl={avatarUrl}
                entityType={entityType}
                size={gridAvatarSize}
              />
            </PartyEntityAvatarGlow>
            {showOnline ? (
              <View style={[styles.onlineDot, styles.gridTileOnlineDot]} />
            ) : null}
          </Pressable>
          <Text
            style={styles.partyNameMobileGrid}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {displayName}
          </Text>
        </View>
      </Pressable>
    );
  }

  if (nativeListRow) {
    const avatarPressHandler = onOpenProfile ?? onPressCard;
    return (
      <View style={nativeStyles.card}>
        {integrationPill ? (
          <View style={styles.integrationPillTopRight} pointerEvents="none">
            <NetworkHubGlassBadge pill={integrationPill} size="compact" />
          </View>
        ) : null}
        <View style={nativeStyles.headerPressable}>
          <Pressable
            onPress={avatarPressHandler}
            disabled={!avatarPressHandler}
            hitSlop={4}
            style={({ pressed }) => [
              nativeStyles.avatarCol,
              pressed && avatarPressHandler && nativeStyles.headerPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={displayName}
          >
            <View style={styles.avatarWrapNative}>
              <PartyAvatar
                name={displayName}
                initialsColorSeed={partyId}
                avatarSeed={avatarSeed}
                avatarUrl={avatarUrl}
                entityType={entityType}
                size={avatarSize}
              />
            </View>
            {showOnline ? <View style={styles.onlineDot} /> : null}
          </Pressable>

          <Pressable
            onPress={onPressCard}
            disabled={!onPressCard}
            style={({ pressed }) => [
              nativeStyles.identity,
              integrationOffsetGuard > 0 && { paddingRight: integrationOffsetGuard },
              pressed && onPressCard && nativeStyles.headerPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={displayName}
          >
            <Text style={styles.partyNameNativeList} numberOfLines={2}>
              {displayName}
            </Text>

            {showPhone ? (
              <View style={styles.phoneRow}>
                <Phone size={9} color={Theme.textMuted} strokeWidth={2.2} />
                <Text style={styles.phoneText} numberOfLines={1}>
                  {phone}
                </Text>
              </View>
            ) : null}

            {rolePill ? (
              <View style={styles.rolePillRow}>
                <View
                  style={[
                    styles.rolePillChip,
                    {
                      backgroundColor: rolePill.backgroundColor,
                      borderColor: rolePill.borderColor ?? "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[styles.rolePillChipText, { color: rolePill.color }]}
                    numberOfLines={1}
                  >
                    {rolePill.label}
                  </Text>
                </View>
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={nativeStyles.footer}>
          <View style={nativeStyles.sectionDivider} />
          <View style={nativeStyles.footerBody}>
            <View style={nativeStyles.footerMetrics}>{metricsTiles}</View>
            {connectionAction ? (
              <View style={nativeStyles.footerAction}>{connectionAction}</View>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPressCard}
      disabled={!onPressCard}
      style={({ pressed }) => [pressed && onPressCard && { opacity: 0.97 }]}
    >
      <View
        style={[
          styles.card,
          compact && styles.cardCompact,
          mobileGrid && networkHubListCardChromeStyles.cardMobileGrid,
        ]}
      >
        {integrationPill ? (
          <View style={styles.integrationPillTopRight} pointerEvents="none">
            {/* Always use the compact badge size so the corner pill peers
             *  with the role chip (DRIVER / CLIENT / SUPPLIER), which we
             *  matched to compact dimensions earlier. The default-size
             *  badge was disproportionately large for the card's current
             *  density. */}
            <NetworkHubGlassBadge pill={integrationPill} size="compact" />
          </View>
        ) : null}
        <View
          style={[
            styles.row,
            compact && styles.rowCompact,
            mobileGrid && styles.rowMobileGrid,
          ]}
        >
          <View
            style={[
              styles.left,
              compact && styles.leftCompact,
              mobileGrid && styles.leftMobileGrid,
            ]}
          >
            <Pressable
              onPress={onOpenProfile ?? onPressCard}
              disabled={!onOpenProfile && !onPressCard}
              hitSlop={4}
              style={({ pressed }) => [
                styles.avatarCol,
                mobileGrid && styles.avatarColMobileGrid,
                pressed && (onOpenProfile ?? onPressCard) && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={displayName}
            >
              <View style={styles.avatarWrap}>
                <PartyAvatar
                  name={displayName}
                  initialsColorSeed={partyId}
                  avatarSeed={avatarSeed}
                  avatarUrl={avatarUrl}
                  entityType={entityType}
                  size={avatarSize}
                />
              </View>
              {showOnline ? <View style={styles.onlineDot} /> : null}
            </Pressable>

            <View
              style={[
                styles.identity,
                mobileGrid && styles.identityMobileGrid,
                integrationOffsetGuard > 0 && { paddingRight: integrationOffsetGuard },
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

              {rolePill ? (
                <View style={styles.rolePillRow}>
                  <View
                    style={[
                      styles.rolePillChip,
                      {
                        backgroundColor: rolePill.backgroundColor,
                        borderColor: rolePill.borderColor ?? "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[styles.rolePillChipText, { color: rolePill.color }]}
                      numberOfLines={1}
                    >
                      {rolePill.label}
                    </Text>
                  </View>
                </View>
              ) : !mobileGrid && partyType.trim().length > 0 ? (
                <View style={styles.roleSubLine}>
                  <Building2 size={9} color={Theme.textMuted} strokeWidth={2.2} />
                  <Text style={styles.roleSubLineText} numberOfLines={1}>
                    {partyType}
                  </Text>
                </View>
              ) : null}

              {showPhone ? (
                <View style={styles.phoneRow}>
                  <Phone size={mobileGrid ? 8 : 9} color={Theme.textMuted} strokeWidth={2.2} />
                  <Text
                    style={[styles.phoneText, mobileGrid && styles.phoneTextMobileGrid]}
                    numberOfLines={1}
                  >
                    {phone}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

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

            {showConnectionAction ? (
              <View style={[styles.actionCol, mobileGrid && styles.actionColMobileGrid]}>
                {connectionIntegrated ? (
                  <NetworkHubGlassButton
                    variant="connected"
                    label={actionLabel}
                    size={mobileGrid ? "compact" : "default"}
                  />
                ) : (
                  <NetworkHubGlassButton
                    variant="primary"
                    label={actionLabel}
                    size={mobileGrid ? "compact" : "default"}
                    onPress={onConnectionAction}
                    disabled={connectionActionDisabled}
                    loading={loading}
                    leadingIcon={
                      <Send
                        size={mobileGrid ? 11 : 13}
                        color={Theme.primary}
                        strokeWidth={2.4}
                      />
                    }
                  />
                )}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

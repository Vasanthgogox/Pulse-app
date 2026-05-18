/**
 * "Your connections" list row — full-width horizontal card (reference list layout).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
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
import { Building2, CheckCircle2, Phone, Send, Verified } from "lucide-react-native";
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
  avatarTintBg: string;
  rolePills: NetworkPartyRolePill[];
  totalTrips?: number | null;
  ratingValue?: number | null;
  mutualCount?: number;
  showVerified?: boolean;
  showOnline?: boolean;
  viewerOrgId?: string | null;
  onPressCard?: () => void;
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
  showVerified = false,
  showOnline = false,
  viewerOrgId,
  onPressCard,
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

  const avatarSize = nativeListRow ? 40 : mobileGrid ? 32 : compact ? 36 : 40;
  const metricsCompact = compact || mobileGrid || nativeListRow;
  const metricsMobile = mobileGrid || nativeListRow;
  /** Hide redundant Connected chip only on 2-up mobile web grid; show on native + desktop. */
  const showConnectionAction = !connectionIntegrated || !mobileGrid;

  const metricsTiles = nativeListRow ? (
    <View style={styles.nativeFooterMetrics}>
      {hasMutuals ? (
        <View style={styles.mutualsSlot}>
          <MutualConnectionsFacepile
            viewerOrgId={viewerOrgId!}
            targetOrgId={partyId}
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
            targetOrgId={partyId}
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

  const connectionAction = showConnectionAction ? (
    <View style={styles.nativeActionWrap}>
      {connectionIntegrated ? (
        <Pressable
          disabled
          style={styles.connectedBtn}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <View style={styles.connectedDotOuter}>
            <View style={styles.connectedDotInner} />
          </View>
          <Text style={styles.connectedBtnText} numberOfLines={1}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={onConnectionAction}
          disabled={connectionActionDisabled || loading}
          style={({ pressed }) => [
            styles.connectedBtn,
            (pressed || loading) && { opacity: 0.88 },
            connectionActionDisabled && { opacity: 0.5 },
          ]}
        >
          {loading ? (
            <LoadingIndicator size={14} color={Theme.primary} />
          ) : (
            <>
              <Send size={12} color={Theme.primary} strokeWidth={2.4} />
              <Text style={[styles.connectedBtnText, { color: Theme.primary }]} numberOfLines={1}>
                {actionLabel}
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
        <Pressable
          onPress={onPressCard}
          disabled={!onPressCard}
          style={({ pressed }) => [
            nativeStyles.headerPressable,
            pressed && onPressCard && nativeStyles.headerPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={displayName}
        >
          <View style={nativeStyles.avatarCol}>
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
          </View>

          <View style={nativeStyles.identity}>
            <Text style={styles.partyNameNativeList} numberOfLines={2}>
              {displayName}
            </Text>

            {rolePills.length > 0 ? (
              <View style={styles.badgesRow}>
                {rolePills.map((pill) => (
                  <View
                    key={pill.label}
                    style={[styles.badge, { backgroundColor: pill.backgroundColor }]}
                  >
                    <Text style={[styles.badgeText, { color: pill.color }]}>{pill.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {showPhone ? (
              <View style={styles.phoneRow}>
                <Phone size={9} color={Theme.textMuted} strokeWidth={2.2} />
                <Text style={styles.phoneText} numberOfLines={1}>
                  {phone}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>

        <View style={nativeStyles.footer}>
          <View style={nativeStyles.footerMetrics}>{metricsTiles}</View>
          {connectionAction ? (
            <View style={nativeStyles.footerAction}>{connectionAction}</View>
          ) : null}
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
            <View style={[styles.avatarCol, mobileGrid && styles.avatarColMobileGrid]}>
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
            </View>

            <View style={[styles.identity, mobileGrid && styles.identityMobileGrid]}>
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

              {rolePills.length > 0 ? (
                <View style={[styles.badgesRow, mobileGrid && styles.badgesRowMobileGrid]}>
                  {rolePills.map((pill) => (
                    <View
                      key={pill.label}
                      style={[styles.badge, { backgroundColor: pill.backgroundColor }]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          mobileGrid && styles.badgeTextMobileGrid,
                          { color: pill.color },
                        ]}
                      >
                        {pill.label}
                      </Text>
                    </View>
                  ))}
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
                styles.metricsBlock,
                metricsCompact && styles.metricsBlockCompact,
                mobileGrid && networkHubListCardChromeStyles.metricsBlockMobileGrid,
              ]}
            >
              {metricsTiles}
            </View>

            {showConnectionAction ? (
              <View style={[styles.actionCol, mobileGrid && styles.actionColMobileGrid]}>
                {!mobileGrid ? (
                  <View style={styles.actionMetaRow}>
                    <Building2 size={9} color={Theme.textMuted} strokeWidth={2.2} />
                    <Text style={styles.roleChipText} numberOfLines={1}>
                      {partyType}
                    </Text>
                    {showVerified ? (
                      <Verified size={12} color={Theme.primary} strokeWidth={2.4} />
                    ) : (
                      <CheckCircle2 size={10} color={Theme.primary} strokeWidth={2.2} />
                    )}
                  </View>
                ) : null}

                {connectionIntegrated ? (
                  <Pressable
                    disabled
                    style={[
                      styles.connectedBtn,
                      mobileGrid && styles.connectedBtnMobileGrid,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={actionLabel}
                  >
                    <View style={styles.connectedDotOuter}>
                      <View style={styles.connectedDotInner} />
                    </View>
                    <Text
                      style={[
                        styles.connectedBtnText,
                        mobileGrid && styles.connectedBtnTextMobileGrid,
                      ]}
                      numberOfLines={1}
                    >
                      {actionLabel}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={onConnectionAction}
                    disabled={connectionActionDisabled || loading}
                    style={({ pressed }) => [
                      styles.connectedBtn,
                      mobileGrid && styles.connectedBtnMobileGrid,
                      (pressed || loading) && { opacity: 0.88 },
                      connectionActionDisabled && { opacity: 0.5 },
                    ]}
                  >
                    {loading ? (
                      <LoadingIndicator size={14} color={Theme.primary} />
                    ) : (
                      <>
                        <Send
                          size={mobileGrid ? 10 : 12}
                          color={Theme.primary}
                          strokeWidth={2.4}
                        />
                        <Text
                          style={[
                            styles.connectedBtnText,
                            mobileGrid && styles.connectedBtnTextMobileGrid,
                            { color: Theme.primary },
                          ]}
                          numberOfLines={1}
                        >
                          {actionLabel}
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

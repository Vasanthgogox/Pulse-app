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
  TransitNodeMetric,
} from "@/features/network/components/NetworkListCardMetrics";
import type { NetworkPartyRolePill } from "@/features/network/components/NetworkPartyProfileCard";
import { hubListCardStyles as styles } from "@/features/network/components/networkPartyHubListCard.styles";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { Building2, CheckCircle2, Phone, Send, Verified } from "lucide-react-native";
import { useMemo } from "react";
import {
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
  /** Force compact layout (e.g. hub 2-up rows). */
  compact?: boolean;
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
}: NetworkPartyHubListCardProps) {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const compact = compactProp ?? width < HUB_LIST_COMPACT_BREAKPOINT;

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

  const avatarSize = compact ? 36 : 40;

  return (
    <Pressable
      onPress={onPressCard}
      disabled={!onPressCard}
      style={({ pressed }) => [pressed && onPressCard && { opacity: 0.97 }]}
    >
      <View style={[styles.card, compact && styles.cardCompact]}>
        <View style={[styles.row, compact && styles.rowCompact]}>
          <View style={[styles.left, compact && styles.leftCompact]}>
            <View style={styles.avatarCol}>
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

            <View style={styles.identity}>
              <Text
                style={[styles.partyName, compact && styles.partyNameCompact]}
                numberOfLines={1}
              >
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
          </View>

          <View style={[styles.right, compact && styles.rightCompact]}>
            <View style={[styles.metricsBlock, compact && styles.metricsBlockCompact]}>
              {hasMutuals ? (
                <View style={styles.mutualsSlot}>
                  <MutualConnectionsFacepile
                    viewerOrgId={viewerOrgId!}
                    targetOrgId={partyId}
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
          </View>
        </View>
      </View>
    </Pressable>
  );
}

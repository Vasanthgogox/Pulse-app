/**
 * Live bid card — Load Detail Hub style.
 * Carrier header + amount + 3-metric footer (Target · Margin · VS Target).
 * Selection drives Counter Offer + Award Bid actions and the sticky Award footer.
 */
import { memo, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { EntityAvatar } from "@/components/EntityAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import type { IndentBidBadge } from "@/features/indents/utils/bidding/indentLiveBids.util";
import {
  bidMarginFromClient,
  buildIndentBidFooterInsight,
} from "@/features/indents/utils/bidding/indentLiveBids.util";
import {
  indentHubCardShadow,
  indentReviewHubText,
} from "@/features/indents/styles/indentReviewHubStyles";
import type { IndentBidAlertInfo } from "@/features/indents/utils/bidding/indentBidAlert.util";
import { formatINR } from "@/lib/format";

export interface IndentLiveBidCardProps {
  quote: DirectQuoteRow;
  badges?: IndentBidBadge[];
  alertInfo?: IndentBidAlertInfo | null;
  selected?: boolean;
  disabled?: boolean;
  clientPriceInr?: number;
  targetRateInr?: number;
  highestPendingAmount?: number | null;
  pendingCount?: number;
  /** True when the bidder is already an integrated partner of the viewing org */
  isConnectedPartner?: boolean;
  onPress?: () => void;
  /** Owner: open counter-offer modal for this bid */
  onCounterOffer?: () => void;
  /** Owner: award this bid directly from the card */
  onAwardBid?: () => void;
  awarding?: boolean;
}

const AVATAR_SIZE = 34;

function stripCurrencyPrefix(formatted: string): string {
  return formatted.replace(/^[^\d,.-]+/, "").trim() || formatted;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function badgeStyle(kind: IndentBidBadge["kind"]) {
  switch (kind) {
    case "recommended":
      return styles.badgeRecommended;
    case "lowest":
      return styles.badgeLowest;
    case "at_target":
      return styles.badgeTarget;
    case "awarded":
      return styles.badgeAwarded;
    default:
      return styles.badgeLowest;
  }
}

function badgeTextStyle(kind: IndentBidBadge["kind"]) {
  switch (kind) {
    case "recommended":
      return styles.badgeTextRecommended;
    case "lowest":
      return styles.badgeTextLowest;
    case "at_target":
      return styles.badgeTextTarget;
    case "awarded":
      return styles.badgeTextAwarded;
    default:
      return styles.badgeTextLowest;
  }
}

export const IndentLiveBidCard = memo(function IndentLiveBidCard({
  quote,
  badges = [],
  alertInfo = null,
  selected = false,
  disabled = false,
  clientPriceInr = 0,
  targetRateInr = 0,
  highestPendingAmount = null,
  pendingCount = 0,
  isConnectedPartner = false,
  onPress,
  onCounterOffer,
  onAwardBid,
  awarding = false,
}: IndentLiveBidCardProps) {
  const partyName =
    (quote.bidder_organization_name ?? "Supplier").trim() || "Supplier";
  const amount = Number(quote.amount ?? 0);
  const amountDisplay = stripCurrencyPrefix(formatINR(amount));
  const status = (quote.status ?? "pending").toLowerCase();
  const counterAmount =
    quote.counter_amount != null && Number(quote.counter_amount) > 0
      ? Number(quote.counter_amount)
      : null;
  const isCountered = counterAmount != null && status === "pending";
  const isAccepted = status === "accepted";
  const isRejected = status === "rejected";
  const statusLabel = isAccepted
    ? "Awarded"
    : isRejected
      ? "Rejected"
      : isCountered
        ? "Countered"
        : "Pending";
  const submitted = timeAgo(quote.created_at ?? quote.updated_at);

  const margin = useMemo(
    () => bidMarginFromClient(clientPriceInr, amount),
    [amount, clientPriceInr],
  );
  const vsTarget = targetRateInr > 0 && amount > 0 ? amount - targetRateInr : null;
  const isLowest =
    badges.some((b) => b.kind === "lowest" || b.kind === "recommended") ||
    (vsTarget != null && vsTarget <= 0);

  const footerInsight = useMemo(
    () =>
      buildIndentBidFooterInsight({
        amount,
        clientPriceInr,
        targetRateInr,
        highestPendingAmount,
        badges,
        pendingCount,
        status,
      }),
    [
      amount,
      badges,
      clientPriceInr,
      highestPendingAmount,
      pendingCount,
      status,
      targetRateInr,
    ],
  );

  const hasCardActions = Boolean(onCounterOffer || onAwardBid);
  const selectedHint =
    footerInsight?.recommendation ??
    (isLowest ? "At or below your target" : "Ready to award from footer");

  const content = (
    <View
      style={[
        styles.card,
        indentHubCardShadow as ViewStyle,
        selected && styles.cardSelected,
        disabled && styles.cardDisabled,
        isAccepted && styles.cardAwarded,
        isRejected && styles.cardRejected,
      ]}
    >
      <View style={styles.topSection}>
        <View style={styles.avatarWrap}>
          <EntityAvatar
            name={partyName}
            initialsColorSeed={quote.bidder_organization_id}
            entityType="supplier"
            size={AVATAR_SIZE}
            showIntegrationBadge={false}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.partyName} numberOfLines={1}>
              {partyName.toUpperCase()}
            </Text>
            {isConnectedPartner ? (
              <View style={styles.partnerPill}>
                <Text style={styles.partnerPillText}>Verified</Text>
              </View>
            ) : (
              <View style={[styles.partnerPill, styles.partnerPillMarket]}>
                <Text
                  style={[styles.partnerPillText, styles.partnerPillTextMarket]}
                >
                  Marketplace
                </Text>
              </View>
            )}
          </View>

          {badges.length > 0 ? (
            <View style={styles.badgeRow}>
              {badges.slice(0, 2).map((badge) => (
                <View
                  key={`${quote.id}-${badge.kind}`}
                  style={[styles.badge, badgeStyle(badge.kind)]}
                >
                  <Text style={[styles.badgeText, badgeTextStyle(badge.kind)]}>
                    {badge.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.amountCol}>
          <View style={styles.amountHero}>
            <Text style={styles.amountCurrency}>₹</Text>
            <Text style={styles.amount} numberOfLines={1}>
              {amountDisplay}
            </Text>
          </View>
          <View style={styles.statusMeta}>
            <View
              style={[
                styles.statusPill,
                isAccepted && styles.statusPillAwarded,
                isRejected && styles.statusPillRejected,
                isCountered && styles.statusPillCountered,
                status === "pending" &&
                  !isCountered &&
                  selected &&
                  styles.statusPillSelected,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  isAccepted && styles.statusTextAwarded,
                  isRejected && styles.statusTextRejected,
                  isCountered && styles.statusTextCountered,
                  status === "pending" &&
                    !isCountered &&
                    selected &&
                    styles.statusTextSelected,
                ]}
              >
                {statusLabel.toUpperCase()}
              </Text>
            </View>
            {submitted ? (
              <Text style={styles.submittedText}>{submitted}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {targetRateInr > 0 || margin || vsTarget != null ? (
        <View style={styles.metricsBar}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Target rate</Text>
            <Text style={styles.metricValue} numberOfLines={1}>
              {targetRateInr > 0
                ? `₹ ${stripCurrencyPrefix(formatINR(targetRateInr))}`
                : "—"}
            </Text>
            {isLowest && !isRejected ? (
              <View style={styles.metricHintRow}>
                <FontAwesome
                  name="check-circle"
                  size={9}
                  color={Theme.success}
                />
                <Text style={styles.metricHint} numberOfLines={1}>
                  At / below
                </Text>
              </View>
            ) : (
              <View style={styles.metricHintSpacer} />
            )}
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Net margin</Text>
            <Text
              style={[
                styles.metricValue,
                margin && margin.marginInr >= 0
                  ? styles.metricPositive
                  : styles.metricNegative,
              ]}
              numberOfLines={1}
            >
              {margin
                ? `₹ ${stripCurrencyPrefix(formatINR(margin.marginInr))} · ${margin.marginPct}%`
                : "—"}
            </Text>
            <View style={styles.metricHintSpacer} />
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Vs target</Text>
            <Text
              style={[
                styles.metricValue,
                vsTarget != null && vsTarget <= 0
                  ? styles.metricPositive
                  : styles.metricNegative,
              ]}
              numberOfLines={1}
            >
              {vsTarget == null
                ? "—"
                : vsTarget <= 0
                  ? `₹ ${stripCurrencyPrefix(formatINR(Math.abs(vsTarget)))} under`
                  : `₹ ${stripCurrencyPrefix(formatINR(vsTarget))} over`}
            </Text>
            <View style={styles.metricHintSpacer} />
          </View>
        </View>
      ) : null}

      {selected && !disabled && !isAccepted && !isRejected ? (
        hasCardActions ? (
          <View style={styles.actionStrip}>
            <View style={styles.actionLeft}>
              <FontAwesome
                name="check-circle"
                size={13}
                color={Theme.positive}
              />
              <Text style={styles.actionLeftText} numberOfLines={1}>
                {isCountered
                  ? `Counter · ₹ ${stripCurrencyPrefix(formatINR(counterAmount!))}`
                  : "Selected"}
              </Text>
            </View>
            <View style={styles.actionBtns}>
              {onCounterOffer ? (
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    onCounterOffer();
                  }}
                  activeOpacity={0.85}
                  accessibilityLabel="Counter offer"
                  hitSlop={Layout.touchTargetHitSlop}
                >
                  <Text style={styles.counterBtnText}>Counter</Text>
                </TouchableOpacity>
              ) : null}
              {onAwardBid ? (
                <TouchableOpacity
                  style={[styles.awardBtn, awarding && styles.awardBtnDisabled]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    if (!awarding) onAwardBid();
                  }}
                  activeOpacity={0.9}
                  disabled={awarding}
                  accessibilityLabel="Award bid"
                  hitSlop={Layout.touchTargetHitSlop}
                >
                  <Text style={styles.awardBtnText}>
                    {awarding ? "Awarding…" : "Award"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.selectedStrip}>
            <FontAwesome name="check-circle" size={13} color={Theme.positive} />
            <Text style={styles.selectedStripText}>{selectedHint}</Text>
          </View>
        )
      ) : null}

      {alertInfo ? (
        <View
          style={[
            styles.alertPanel,
            alertInfo.tone === "overdue" && styles.alertPanelOverdue,
            alertInfo.tone === "urgent" && styles.alertPanelUrgent,
            alertInfo.tone === "soon" && styles.alertPanelSoon,
          ]}
        >
          <FontAwesome
            name="clock-o"
            size={12}
            color={
              alertInfo.tone === "overdue"
                ? Theme.teslaRed
                : alertInfo.tone === "urgent"
                  ? Theme.warning
                  : Theme.accentGoldPressed
            }
          />
          <Text style={styles.alertText} numberOfLines={2}>
            {alertInfo.summaryLine ||
              [alertInfo.awardedAgoLabel, alertInfo.dueByLabel]
                .filter(Boolean)
                .join(" · ") ||
              "Action needed"}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.pressable,
          pressed && styles.pressablePressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.pressable}>{content}</View>;
});

const styles = StyleSheet.create({
  pressable: {
    marginBottom: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  pressablePressed: {
    opacity: 0.96,
    transform: [{ translateY: -0.5 }],
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  cardSelected: {
    borderColor: Theme.positive,
    borderWidth: 1.5,
    backgroundColor: Theme.cardWhite,
  },
  cardAwarded: {
    borderColor: Theme.accentGold,
  },
  cardRejected: {
    borderColor: Theme.borderMedium,
    opacity: 0.86,
  },
  cardDisabled: {
    opacity: 0.72,
  },
  topSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  avatarWrap: {
    width: AVATAR_SIZE + 4,
    height: AVATAR_SIZE + 4,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 5,
    paddingRight: 6,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  partyName: {
    ...indentReviewHubText.partyTitle,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.15,
    color: Theme.textPrimaryDark,
    flexShrink: 1,
  },
  partnerPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  partnerPillText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.positive,
  },
  partnerPillMarket: {
    backgroundColor: Theme.accentBrownMuted,
    borderColor: Theme.accentBrownBorder,
  },
  partnerPillTextMarket: {
    color: Theme.accentBrown,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeRecommended: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderMedium,
  },
  badgeLowest: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  badgeTarget: {
    backgroundColor: Theme.pulseIndigoWash,
    borderColor: Theme.pulseIndigoRing,
  },
  badgeAwarded: {
    backgroundColor: Theme.accentGoldMuted,
    borderColor: Theme.accentGold,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  badgeTextRecommended: { color: Theme.textRouteCard },
  badgeTextLowest: { color: Theme.positive },
  badgeTextTarget: { color: Theme.driverPrimary },
  badgeTextAwarded: { color: Theme.accentBrownDeep },
  amountCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 4,
    flexShrink: 0,
    minWidth: 92,
  },
  amountHero: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  amountCurrency: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  amount: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.35,
    maxWidth: 124,
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  statusMeta: {
    alignItems: "flex-end",
    gap: 2,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  statusPillSelected: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  statusPillAwarded: {
    backgroundColor: Theme.accentGoldMuted,
    borderColor: Theme.accentGold,
  },
  statusPillRejected: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.borderMedium,
  },
  statusPillCountered: {
    backgroundColor: Theme.aggregatePillBg,
    borderColor: Theme.aggregatePillBorder,
  },
  statusText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.35,
    color: Theme.textMuted,
  },
  statusTextSelected: { color: Theme.positive },
  statusTextAwarded: { color: Theme.accentBrownDeep },
  statusTextRejected: { color: Theme.teslaRed },
  statusTextCountered: { color: Theme.aggregatePillText },
  submittedText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  metricsBar: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Theme.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  metricCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    justifyContent: "flex-start",
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: Theme.borderLight,
    marginVertical: 2,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  metricPositive: {
    color: Theme.success,
  },
  metricNegative: {
    color: Theme.teslaRed,
  },
  metricHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    minHeight: 14,
  },
  metricHint: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.success,
    flexShrink: 1,
  },
  metricHintSpacer: {
    minHeight: 14,
    marginTop: 4,
  },
  actionStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Theme.positiveMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.positiveMutedDarkBorder,
  },
  actionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
    flex: 1,
  },
  actionLeftText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flexShrink: 1,
  },
  actionBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  selectedStrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: Theme.positiveMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.positiveMutedDarkBorder,
  },
  selectedStripText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    color: Theme.textPrimaryDark,
  },
  counterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    justifyContent: "center",
  },
  counterBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  awardBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: Theme.driverPrimary,
    justifyContent: "center",
  },
  awardBtnDisabled: { opacity: 0.55 },
  awardBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textOnDark,
  },
  alertPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 12,
    marginTop: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  alertPanelOverdue: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.borderMedium,
  },
  alertPanelUrgent: {
    backgroundColor: Theme.warningMuted,
    borderColor: Theme.borderMedium,
  },
  alertPanelSoon: {
    backgroundColor: Theme.accentGoldMuted,
    borderColor: Theme.accentGold,
  },
  alertText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
});

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
  indentReviewHubLayout,
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

const AVATAR_SIZE = 40;

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
      {/* Top: carrier + amount */}
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
                <Text style={styles.partnerPillText}>VERIFIED VENDOR</Text>
              </View>
            ) : (
              <View style={[styles.partnerPill, styles.partnerPillMarket]}>
                <Text style={[styles.partnerPillText, styles.partnerPillTextMarket]}>
                  MARKET YET TO CONNECT
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

      {/* Metrics strip */}
      {(targetRateInr > 0 || margin || vsTarget != null) ? (
        <View style={styles.metricsBar}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>TARGET RATE</Text>
            <Text style={styles.metricValue}>
              {targetRateInr > 0
                ? `₹ ${stripCurrencyPrefix(formatINR(targetRateInr))}`
                : "—"}
            </Text>
            {isLowest && !isRejected ? (
              <Text style={styles.metricHint}>
                <FontAwesome name="check-circle" size={9} color={Theme.success} />{" "}
                At / below target
              </Text>
            ) : null}
          </View>

          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>NET MARGIN</Text>
            <Text
              style={[
                styles.metricValue,
                margin && margin.marginInr >= 0
                  ? styles.metricPositive
                  : styles.metricNegative,
              ]}
            >
              {margin
                ? `₹ ${stripCurrencyPrefix(formatINR(margin.marginInr))} [${margin.marginPct}%]`
                : "—"}
            </Text>
          </View>

          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>VS TARGET</Text>
            <Text
              style={[
                styles.metricValue,
                vsTarget != null && vsTarget <= 0
                  ? styles.metricPositive
                  : styles.metricNegative,
              ]}
            >
              {vsTarget == null
                ? "—"
                : vsTarget <= 0
                  ? `₹ ${stripCurrencyPrefix(formatINR(Math.abs(vsTarget)))} under`
                  : `₹ ${stripCurrencyPrefix(formatINR(vsTarget))} over`}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Selection action strip */}
      {selected && !disabled && !isAccepted && !isRejected ? (
        <View style={styles.actionStrip}>
          <View style={styles.actionLeft}>
            <FontAwesome name="clock-o" size={12} color={Theme.driverPrimary} />
            <Text style={styles.actionLeftText} numberOfLines={1}>
              {isCountered
                ? `Counter · ₹ ${stripCurrencyPrefix(formatINR(counterAmount!))}`
                : "Ready to negotiate"}
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
                <Text style={styles.counterBtnText}>Counter Offer</Text>
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
                  {awarding ? "Awarding…" : "Award Bid"}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.actionReco} numberOfLines={1}>
                {footerInsight?.recommendation ?? "Award from footer"}
              </Text>
            )}
          </View>
        </View>
      ) : null}

      {/* Award / urgency alert */}
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
                ? "#DC2626"
                : alertInfo.tone === "urgent"
                  ? "#EA580C"
                  : "#CA8A04"
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
    marginBottom: 12,
  },
  pressablePressed: {
    opacity: 0.94,
    transform: [{ translateY: -1 }],
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  cardSelected: {
    borderColor: Theme.positive,
    borderWidth: 2,
    backgroundColor: Theme.cardWhite,
  },
  cardAwarded: {
    borderColor: "#FDE68A",
  },
  cardRejected: {
    borderColor: "#FECACA",
    opacity: 0.85,
  },
  cardDisabled: {
    opacity: 0.72,
  },
  topSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: indentReviewHubLayout.summaryCardPadding,
  },
  avatarWrap: {
    width: AVATAR_SIZE + 4,
    height: AVATAR_SIZE + 4,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
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
    letterSpacing: 0.2,
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
    letterSpacing: 0.4,
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
    gap: 4,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
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
    backgroundColor: "#ECFEFF",
    borderColor: "#A5F3FC",
  },
  badgeAwarded: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  badgeText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  badgeTextRecommended: { color: Theme.textRouteCard },
  badgeTextLowest: { color: Theme.positive },
  badgeTextTarget: { color: "#0E7490" },
  badgeTextAwarded: { color: "#B45309" },
  amountCol: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  amountHero: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  amountCurrency: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  amount: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
    maxWidth: 130,
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
    borderRadius: 6,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  statusPillSelected: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  statusPillAwarded: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  statusPillRejected: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  statusPillCountered: {
    backgroundColor: Theme.aggregatePillBg,
    borderColor: Theme.aggregatePillBorder,
  },
  statusText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: Theme.textMuted,
  },
  statusTextAwarded: { color: "#B45309" },
  statusTextRejected: { color: "#B91C1C" },
  statusTextCountered: { color: Theme.aggregatePillText },
  submittedText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  metricsBar: {
    flexDirection: "row",
    backgroundColor: Theme.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  metricCol: {
    flex: 1,
    minWidth: 0,
  },
  metricLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 3,
  },
  metricValue: {
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimaryDark,
  },
  metricPositive: {
    color: Theme.success,
  },
  metricNegative: {
    color: Theme.teslaRed,
  },
  metricHint: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.success,
  },
  actionStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
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
    maxWidth: "38%",
  },
  actionLeftText: {
    fontSize: 11,
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
  actionReco: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    maxWidth: 120,
  },
  counterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: 12,
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
    borderRadius: 12,
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
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  alertPanelUrgent: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
  },
  alertPanelSoon: {
    backgroundColor: "#FEFCE8",
    borderColor: "#FEF08A",
  },
  alertText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
});

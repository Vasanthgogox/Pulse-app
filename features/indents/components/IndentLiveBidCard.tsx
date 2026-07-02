import { memo, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { IndentHubBidKickerGlyph } from "@/features/indents/components/IndentHubAnimatedGlyphs";
import { IndentHubInsightTicketTail } from "@/features/indents/components/IndentHubInsightTicketTail";

import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import type { IndentBidBadge } from "@/features/indents/utils/indentLiveBids.util";
import { buildIndentBidFooterInsight } from "@/features/indents/utils/indentLiveBids.util";
import {
  indentHubCardShadow,
  indentReviewHubLayout,
  indentReviewHubText,
} from "@/features/indents/styles/indentReviewHubStyles";
import type { IndentBidAlertInfo } from "@/features/indents/utils/indentBidAlert.util";
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
}

/** Live bid ticket — white card + inset metrics stub. */
const BID = {
  border: Theme.borderLight,
  kicker: Theme.textRouteCard,
  label: Theme.textMuted,
  body: Theme.textPrimaryDark,
  metricsPanelBg: Theme.cardWhite,
  metricsPanelBorder: Theme.borderLight,
  ticketDivider: Theme.borderMedium,
  metricsDivider: "#E2E8F0",
  metricLabel: Theme.textRouteCard,
  valuePositive: Theme.success,
  valueNegative: Theme.teslaRed,
  valueNeutral: Theme.textPrimaryDark,
  recoIcon: "#D97706",
  recoText: Theme.textRouteCard,
  awardedLine: "#B45309",
  awardedIcon: "#D97706",
  alertOverdueBg: "#FEF2F2",
  alertOverdueBorder: "#FECACA",
  alertOverdueText: "#B91C1C",
  alertOverdueIcon: "#DC2626",
  alertUrgentBg: "#FFF7ED",
  alertUrgentBorder: "#FED7AA",
  alertUrgentText: "#C2410C",
  alertUrgentIcon: "#EA580C",
  alertSoonBg: "#FEFCE8",
  alertSoonBorder: "#FEF08A",
  alertSoonText: "#A16207",
  alertSoonIcon: "#CA8A04",
  alertNeutralBg: "#F8FAFC",
  alertNeutralBorder: "#E2E8F0",
  alertNeutralText: Theme.textRouteCard,
  badgeAwardedBg: "#FEF3C7",
  badgeAwardedBorder: "#FDE68A",
  badgeAwardedText: "#B45309",
} as const;

const AVATAR_SIZE = 34;

function stripCurrencyPrefix(formatted: string): string {
  return formatted.replace(/^[^\d,.-]+/, "").trim() || formatted;
}

function alertPanelStyles(tone: IndentBidAlertInfo["tone"]) {
  switch (tone) {
    case "overdue":
      return {
        panel: styles.alertPanelOverdue,
        dueLine: styles.alertDueOverdue,
        dueIcon: BID.alertOverdueIcon,
        cardRim: styles.cardRimOverdue,
      };
    case "urgent":
      return {
        panel: styles.alertPanelUrgent,
        dueLine: styles.alertDueUrgent,
        dueIcon: BID.alertUrgentIcon,
        cardRim: styles.cardRimUrgent,
      };
    case "soon":
      return {
        panel: styles.alertPanelSoon,
        dueLine: styles.alertDueSoon,
        dueIcon: BID.alertSoonIcon,
        cardRim: styles.cardRimSoon,
      };
    default:
      return {
        panel: styles.alertPanelNeutral,
        dueLine: styles.alertDueNeutral,
        dueIcon: BID.alertNeutralText,
        cardRim: null,
      };
  }
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
}: IndentLiveBidCardProps) {
  const partyName = (quote.bidder_organization_name ?? "Supplier").trim() || "Supplier";
  const amount = Number(quote.amount ?? 0);
  const amountDisplay = stripCurrencyPrefix(formatINR(amount));
  const status = (quote.status ?? "pending").toLowerCase();
  const isAccepted = status === "accepted";
  const isRejected = status === "rejected";
  const showAwardedAlert = Boolean(alertInfo);
  const statusLabel =
    isAccepted
      ? showAwardedAlert
        ? null
        : "Awarded"
      : isRejected
        ? "Rejected"
        : "Pending";

  const alertPanel = alertInfo ? alertPanelStyles(alertInfo.tone) : null;

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

  const extraMetric =
    footerInsight && footerInsight.metrics.length > 3
      ? footerInsight.metrics[3] ?? null
      : null;
  const hasFooter = Boolean(alertInfo || footerInsight);

  const content = (
    <View
      style={[
        styles.card,
        indentHubCardShadow as ViewStyle,
        selected && styles.cardSelected,
        disabled && styles.cardDisabled,
        alertPanel?.cardRim,
        isAccepted && styles.cardAwarded,
        isRejected && styles.cardRejected,
      ]}
    >
      {selected ? <View style={styles.selectedRail} pointerEvents="none" /> : null}

      <View style={styles.topSection}>
        <EntityAvatar
          name={partyName}
          avatarSeed={quote.bidder_organization_id}
          entityType="supplier"
          size={AVATAR_SIZE}
          showIntegrationBadge={false}
        />
        <View style={styles.body}>
          <View style={styles.kickerRow}>
            <IndentHubBidKickerGlyph
              variant={
                isAccepted ? "awarded" : isRejected ? "rejected" : "live"
              }
            />
            <Text style={styles.partyKicker}>
              {isAccepted ? "AWARDED BID" : isRejected ? "REJECTED BID" : "LIVE BID"}
            </Text>
            {isConnectedPartner ? (
              <View style={styles.partnerPill}>
                <Text style={styles.partnerPillText}>CONNECTED</Text>
              </View>
            ) : (
              <View style={[styles.partnerPill, styles.partnerPillNew]}>
                <Text style={[styles.partnerPillText, styles.partnerPillTextNew]}>NEW PARTNER</Text>
              </View>
            )}
          </View>
          <View style={styles.titleRow}>
            <Text style={styles.partyName} numberOfLines={2}>
              {partyName}
            </Text>
            {selected ? (
              <View style={styles.selectedMark}>
                <FontAwesome name="check" size={12} color={Theme.cardWhite} />
              </View>
            ) : null}
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
          {statusLabel ? (
            <View
              style={[
                styles.statusPill,
                isAccepted && styles.statusPillAwarded,
                isRejected && styles.statusPillRejected,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  isAccepted && styles.statusTextAwarded,
                  isRejected && styles.statusTextRejected,
                ]}
              >
                {statusLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {hasFooter ? (
        <IndentHubInsightTicketTail
          insight={footerInsight}
          alertInfo={alertInfo}
          compact
          contentPadding={indentReviewHubLayout.summaryCardPadding}
          perforationDashColor={BID.ticketDivider}
          extraMetric={extraMetric}
        />
      ) : null}
    </View>
  );

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressablePressed]}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.pressable}>{content}</View>;
});

const styles = StyleSheet.create({
  pressable: {
    marginBottom: 10,
  },
  pressablePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  card: {
    borderRadius: indentReviewHubLayout.summaryCardRadius,
    padding: indentReviewHubLayout.summaryCardPadding,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BID.border,
    backgroundColor: Theme.cardWhite,
  },
  cardAwarded: {
    borderColor: "#FDE68A",
  },
  cardRejected: {
    backgroundColor: Theme.cardWhite,
    borderColor: BID.alertOverdueBorder,
  },
  cardSelected: {
    borderColor: Theme.positive,
  },
  cardDisabled: {
    opacity: 0.72,
  },
  cardRimOverdue: {
    borderColor: BID.alertOverdueBorder,
  },
  cardRimUrgent: {
    borderColor: BID.alertUrgentBorder,
  },
  cardRimSoon: {
    borderColor: BID.alertSoonBorder,
  },
  selectedRail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: BID.valuePositive,
    borderTopLeftRadius: indentReviewHubLayout.summaryCardRadius,
    borderBottomLeftRadius: indentReviewHubLayout.summaryCardRadius,
  },
  topSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 1,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 0,
  },
  partyKicker: {
    ...indentReviewHubText.fieldLabel,
    color: BID.kicker,
    fontSize: 7,
  },
  partnerPill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  partnerPillText: {
    fontSize: 6,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.positive,
  },
  partnerPillNew: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
  },
  partnerPillTextNew: {
    color: "#C2410C",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  partyName: {
    ...indentReviewHubText.partyTitle,
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: -0.1,
    color: BID.body,
  },
  selectedMark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.positive,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
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
    backgroundColor: BID.badgeAwardedBg,
    borderColor: BID.badgeAwardedBorder,
  },
  badgeText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  badgeTextRecommended: { color: Theme.textRouteCard },
  badgeTextLowest: { color: Theme.positive },
  badgeTextTarget: { color: "#0E7490" },
  badgeTextAwarded: { color: BID.badgeAwardedText },
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
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  amount: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.35,
    maxWidth: 108,
    color: BID.body,
    fontVariant: ["tabular-nums"],
    lineHeight: 17,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  statusPillAwarded: {
    backgroundColor: BID.badgeAwardedBg,
    borderColor: BID.badgeAwardedBorder,
  },
  statusPillRejected: {
    backgroundColor: BID.alertOverdueBg,
    borderColor: BID.alertOverdueBorder,
  },
  statusText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: BID.label,
  },
  statusTextAwarded: {
    color: BID.badgeAwardedText,
  },
  statusTextRejected: {
    color: BID.alertOverdueText,
  },
  alertPanel: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  alertPanelOverdue: {
    backgroundColor: BID.alertOverdueBg,
    borderColor: BID.alertOverdueBorder,
  },
  alertPanelUrgent: {
    backgroundColor: BID.alertUrgentBg,
    borderColor: BID.alertUrgentBorder,
  },
  alertPanelSoon: {
    backgroundColor: BID.alertSoonBg,
    borderColor: BID.alertSoonBorder,
  },
  alertPanelNeutral: {
    backgroundColor: BID.alertNeutralBg,
    borderColor: BID.alertNeutralBorder,
  },
  alertStack: {
    gap: 6,
  },
  alertLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  alertAwardedText: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
    color: BID.awardedLine,
  },
  alertDueText: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
  },
  alertDueOverdue: {
    color: BID.alertOverdueText,
  },
  alertDueUrgent: {
    color: BID.alertUrgentText,
  },
  alertDueSoon: {
    color: BID.alertSoonText,
  },
  alertDueNeutral: {
    color: BID.alertNeutralText,
  },
});

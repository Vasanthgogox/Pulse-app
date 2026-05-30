import { memo, useMemo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { IndentHubInsightTicketTail } from "@/features/indents/components/IndentHubInsightTicketTail";

import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import type { IndentBidBadge } from "@/features/indents/utils/indentLiveBids.util";
import { buildIndentBidFooterInsight } from "@/features/indents/utils/indentLiveBids.util";
import { indentReviewHubText } from "@/features/indents/styles/indentReviewHubStyles";
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
  onPress?: () => void;
}

/** Live bid ticket — light gray header + white metrics stub (hub ticket tail). */
const BID = {
  gradient: ["#F8FAFC", "#F1F5F9", "#ECEFF3"] as const,
  gradientRejected: ["#F5F5F4", "#EFEFEF", "#E7E5E4"] as const,
  border: Theme.borderLight,
  glow: "rgba(15, 23, 42, 0.05)",
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

const cardShadow = Platform.select<ViewStyle>({
  ios: {
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  android: { elevation: 2 },
  web: {
    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)",
  },
  default: {},
});

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
    <LinearGradient
      colors={isRejected ? [...BID.gradientRejected] : [...BID.gradient]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={[
        styles.card,
        cardShadow,
        selected && styles.cardSelected,
        disabled && styles.cardDisabled,
        alertPanel?.cardRim,
        isAccepted && styles.cardAwarded,
      ]}
    >
      <View style={styles.glow} pointerEvents="none" />
      {selected ? <View style={styles.selectedRail} pointerEvents="none" /> : null}

      <View style={styles.topSection}>
        <EntityAvatar
          name={partyName}
          avatarSeed={quote.bidder_organization_id}
          entityType="supplier"
          size={44}
          showIntegrationBadge={false}
        />
        <View style={styles.body}>
          <Text style={styles.partyKicker}>
            {isAccepted ? "AWARDED BID" : "LIVE BID"}
          </Text>
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
          contentPadding={12}
          perforationDashColor={BID.ticketDivider}
          extraMetric={extraMetric}
        />
      ) : null}
    </LinearGradient>
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
    borderRadius: 14,
    padding: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BID.border,
  },
  cardAwarded: {
    borderColor: "#FDE68A",
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
  glow: {
    position: "absolute",
    top: -40,
    right: -28,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: BID.glow,
  },
  selectedRail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: BID.valuePositive,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  topSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    zIndex: 1,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingTop: 2,
  },
  partyKicker: {
    ...indentReviewHubText.freightLabelDark,
    color: BID.kicker,
    fontSize: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  partyName: {
    ...indentReviewHubText.freightGridValueDark,
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: -0.15,
    color: BID.body,
  },
  selectedMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
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
    gap: 6,
    flexShrink: 0,
    paddingTop: 2,
  },
  amountHero: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  amountCurrency: {
    ...indentReviewHubText.freightCurrency,
    color: BID.body,
  },
  amount: {
    ...indentReviewHubText.freightAmount,
    fontSize: 16,
    maxWidth: 120,
    color: BID.body,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
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
    fontSize: 8,
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

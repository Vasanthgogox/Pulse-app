import { Fragment, memo, useMemo, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { AlertTriangle, Clock3, Inbox, Send, Trophy } from "lucide-react-native";

import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import {
  indentReviewHubLayout,
  indentReviewHubText,
} from "@/features/indents/styles/indentReviewHubStyles";
import type { IndentBidAlertInfo } from "@/features/indents/utils/indentBidAlert.util";
import type {
  IndentBidFooterMetric,
  IndentBidMetricTone,
} from "@/features/indents/utils/indentLiveBids.util";
import { buildSupplierQuoteFooterInsight } from "@/features/indents/utils/indentLiveBids.util";
import { formatINR } from "@/lib/format";

const NOTCH = 10;

/** Light “ticket” card — quote amount is the hero; metrics and hints sit below the perforation. */
const CARD = {
  bg: Theme.cardWhite,
  border: Theme.surfaceBorder,
  borderAwarded: "#FDE68A",
  borderRejected: "#FECACA",
  kicker: Theme.textRouteCard,
  shipper: Theme.textPrimaryDark,
  hero: Theme.textPrimaryDark,
  heroMuted: Theme.textSecondary,
  panel: Theme.surface,
  panelBorder: Theme.surfaceBorder,
  label: Theme.textRouteCard,
  value: Theme.textPrimaryDark,
  valuePositive: Theme.success,
  valueNegative: Theme.teslaRed,
  valueNeutral: Theme.textPrimary,
  reco: Theme.textRouteCard,
  divider: "#E2E8F0",
  statusPendingBg: "#F1F5F9",
  statusPendingText: "#475569",
  statusAwardedBg: "#FEF3C7",
  statusAwardedText: "#B45309",
  statusRejectedBg: "#FEE2E2",
  statusRejectedText: "#B91C1C",
  atTargetBg: "#ECFDF5",
  atTargetBorder: "#A7F3D0",
  atTargetText: "#047857",
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
  hintBg: Theme.surface,
  hintBorder: Theme.surfaceBorder,
  hintText: Theme.textRouteCard,
  awardedLine: "#B45309",
  awardedIcon: "#D97706",
} as const;

const cardShadow = Platform.select<ViewStyle>({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  android: { elevation: 3 },
  web: {
    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)",
  },
  default: {},
});

export type SupplierQuoteActionHint =
  | "allocate"
  | "locked"
  | "completed"
  | null;

export type IndentSupplierQuoteCardProps = {
  quote: DirectQuoteRow | null;
  shipperName: string;
  shipperOrgId?: string | null;
  targetRateInr?: number;
  alertInfo?: IndentBidAlertInfo | null;
  canUpdateBid?: boolean;
  actionHint?: SupplierQuoteActionHint;
  onPress?: () => void;
  children?: ReactNode;
};

function stripCurrencyPrefix(formatted: string): string {
  return formatted.replace(/^[^\d,.-]+/, "").trim() || formatted;
}

function alertPanelStyles(tone: IndentBidAlertInfo["tone"]) {
  switch (tone) {
    case "overdue":
      return {
        panel: styles.alertPanelOverdue,
        dueLine: styles.alertDueOverdue,
        dueIcon: CARD.alertOverdueIcon,
        cardRim: styles.cardRimOverdue,
      };
    case "urgent":
      return {
        panel: styles.alertPanelUrgent,
        dueLine: styles.alertDueUrgent,
        dueIcon: CARD.alertUrgentIcon,
        cardRim: styles.cardRimUrgent,
      };
    case "soon":
      return {
        panel: styles.alertPanelSoon,
        dueLine: styles.alertDueSoon,
        dueIcon: CARD.alertSoonIcon,
        cardRim: styles.cardRimSoon,
      };
    default:
      return {
        panel: styles.alertPanelNeutral,
        dueLine: styles.alertDueNeutral,
        dueIcon: CARD.hintText,
        cardRim: null,
      };
  }
}

function metricValueStyle(tone: IndentBidMetricTone) {
  switch (tone) {
    case "positive":
      return styles.metricValuePositive;
    case "negative":
      return styles.metricValueNegative;
    default:
      return styles.metricValueNeutral;
  }
}

function PulseuoteTicketPerforation() {
  return (
    <View style={styles.perforation} pointerEvents="none">
      <View style={styles.notchLeft} />
      <View style={styles.dashLine} />
      <View style={styles.notchRight} />
    </View>
  );
}

function PulseuoteFooterMetrics({ metrics }: { metrics: IndentBidFooterMetric[] }) {
  const shown = metrics.slice(0, 2);
  return (
    <View style={styles.metricsRow}>
      {shown.map((metric, index) => (
        <Fragment key={metric.label}>
          {index > 0 ? <View style={styles.metricDivider} /> : null}
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text
              style={[styles.metricValue, metricValueStyle(metric.tone)]}
              numberOfLines={2}
            >
              {metric.value}
            </Text>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

function actionHintCopy(hint: SupplierQuoteActionHint): string | null {
  switch (hint) {
    case "allocate":
      return "Assign driver and vehicle below, then deploy.";
    case "locked":
      return "Bidding is closed for the current load status.";
    case "completed":
      return "This load is completed.";
    default:
      return null;
  }
}

export const IndentSupplierQuoteCard = memo(function IndentSupplierQuoteCard({
  quote,
  shipperName,
  shipperOrgId,
  targetRateInr = 0,
  alertInfo = null,
  canUpdateBid = false,
  actionHint = null,
  onPress,
  children,
}: IndentSupplierQuoteCardProps) {
  const hasQuote = quote != null;
  const amount = Number(quote?.amount ?? 0);
  const amountDisplay = hasQuote ? stripCurrencyPrefix(formatINR(amount)) : "—";
  const status = (quote?.status ?? "").trim().toLowerCase();
  const isAccepted = status === "accepted";
  const isRejected = status === "rejected";
  const isPending = !hasQuote || status === "pending";

  const atTarget =
    hasQuote &&
    targetRateInr > 0 &&
    amount > 0 &&
    amount <= targetRateInr;

  const statusLabel = !hasQuote
    ? null
    : isAccepted && alertInfo
      ? null
      : isAccepted
        ? "Awarded"
        : isRejected
          ? "Rejected"
          : "Pending";

  const alertPanel = alertInfo ? alertPanelStyles(alertInfo.tone) : null;
  const hintText = actionHintCopy(actionHint);

  const footerInsight = useMemo(
    () =>
      buildSupplierQuoteFooterInsight({
        amount,
        targetRateInr,
        status,
        canUpdateBid,
        hasQuote,
      }),
    [amount, canUpdateBid, hasQuote, status, targetRateInr],
  );

  const hasFooter = Boolean(footerInsight || alertInfo || hintText || children);

  const content = (
    <View
      style={[
        styles.card,
        cardShadow,
        alertPanel?.cardRim,
        isAccepted && styles.cardAwarded,
        isRejected && styles.cardRejected,
        onPress && styles.cardPressable,
      ]}
    >
      <View style={styles.metaRow}>
        <EntityAvatar
          name={shipperName}
          avatarSeed={shipperOrgId ?? shipperName}
          entityType="client"
          size={40}
          showIntegrationBadge={false}
        />
        <View style={styles.metaBody}>
          <Text style={styles.kicker}>
            {hasQuote ? "YOUR QUOTE" : "NO QUOTE YET"}
          </Text>
          <Text style={styles.shipperName} numberOfLines={2}>
            {shipperName}
          </Text>
          {hasQuote && atTarget && isPending ? (
            <View style={styles.badgeAtTarget}>
              <Text style={styles.badgeAtTargetText}>At/below target</Text>
            </View>
          ) : null}
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
        ) : onPress && !hasQuote ? (
          <Text style={styles.tapHint}>Tap to bid</Text>
        ) : null}
      </View>

      <View style={styles.heroBlock}>
        {hasQuote ? (
          <View style={styles.amountHero}>
            <Text style={styles.amountCurrency}>₹</Text>
            <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
              {amountDisplay}
            </Text>
          </View>
        ) : (
          <View style={styles.emptyHero}>
            <View style={styles.emptyIcon}>
              {onPress ? (
                <Send size={22} color={Theme.actionAccent} strokeWidth={2.2} />
              ) : (
                <Inbox size={22} color={Theme.textSecondary} strokeWidth={2.2} />
              )}
            </View>
            <Text style={styles.emptyHeroTitle}>No quote submitted</Text>
            {onPress ? (
              <Text style={styles.emptyHeroSub}>Tap to place your bid</Text>
            ) : null}
          </View>
        )}
      </View>

      {hasFooter ? (
        <>
          <QuoteTicketPerforation />
          <View style={styles.footerStack}>
            {footerInsight ? (
              <View style={styles.footerMetricsPanel}>
                {footerInsight.metrics.length > 0 ? (
                  <QuoteFooterMetrics metrics={footerInsight.metrics} />
                ) : null}
                {footerInsight.recommendation ? (
                  <View style={styles.recoRow}>
                    <Feather name="info" size={12} color={Theme.textRouteCard} />
                    <Text style={styles.recoText} numberOfLines={3}>
                      {footerInsight.recommendation}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {alertInfo && alertPanel ? (
              <View style={[styles.alertPanel, alertPanel.panel]}>
                {alertInfo.awardedAgoLabel ? (
                  <View style={styles.alertLine}>
                    <Trophy size={12} color={CARD.awardedIcon} strokeWidth={2.2} />
                    <Text style={styles.alertAwardedText} numberOfLines={1}>
                      {alertInfo.awardedAgoLabel}
                    </Text>
                  </View>
                ) : null}
                {alertInfo.dueByLabel ? (
                  <View style={styles.alertLine}>
                    {alertInfo.tone === "overdue" ? (
                      <AlertTriangle
                        size={12}
                        color={alertPanel.dueIcon}
                        strokeWidth={2.2}
                      />
                    ) : (
                      <Clock3 size={12} color={alertPanel.dueIcon} strokeWidth={2.2} />
                    )}
                    <Text style={[styles.alertDueText, alertPanel.dueLine]} numberOfLines={2}>
                      {alertInfo.dueByLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {hintText ? (
              <View style={styles.hintPanel}>
                <Text style={styles.hintPanelText}>{hintText}</Text>
              </View>
            ) : null}

            {children ? <View style={styles.childrenSlot}>{children}</View> : null}
          </View>
        </>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.wrap, pressed && styles.wrapPressed]}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.wrap}>{content}</View>;
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },
  wrapPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.995 }],
  },
  card: {
    borderRadius: indentReviewHubLayout.summaryCardRadius,
    padding: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: CARD.border,
    backgroundColor: CARD.bg,
  },
  cardPressable: {},
  cardAwarded: {
    borderColor: CARD.borderAwarded,
  },
  cardRejected: {
    borderColor: CARD.borderRejected,
  },
  cardRimOverdue: {
    borderColor: CARD.alertOverdueBorder,
  },
  cardRimUrgent: {
    borderColor: CARD.alertUrgentBorder,
  },
  cardRimSoon: {
    borderColor: CARD.alertSoonBorder,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  metaBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    paddingTop: 2,
  },
  kicker: {
    ...indentReviewHubText.freightLabelDark,
    fontSize: 9,
    letterSpacing: 0.6,
    color: CARD.kicker,
  },
  shipperName: {
    ...indentReviewHubText.freightGridValueDark,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: CARD.shipper,
  },
  badgeAtTarget: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: CARD.atTargetBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD.atTargetBorder,
  },
  badgeAtTargetText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: CARD.atTargetText,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: CARD.statusPendingBg,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  statusPillAwarded: {
    backgroundColor: CARD.statusAwardedBg,
  },
  statusPillRejected: {
    backgroundColor: CARD.statusRejectedBg,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: CARD.statusPendingText,
  },
  statusTextAwarded: {
    color: CARD.statusAwardedText,
  },
  statusTextRejected: {
    color: CARD.statusRejectedText,
  },
  tapHint: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.actionAccent,
    letterSpacing: 0.3,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  heroBlock: {
    marginTop: 12,
    marginBottom: 2,
    paddingVertical: 4,
  },
  amountHero: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 4,
  },
  amountCurrency: {
    fontSize: 22,
    fontWeight: "700",
    color: CARD.heroMuted,
    lineHeight: 28,
    marginBottom: 2,
  },
  amount: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: CARD.hero,
    lineHeight: 38,
    maxWidth: "100%",
  },
  emptyHero: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: CARD.panelBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyHeroTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: CARD.shipper,
  },
  emptyHeroSub: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.actionAccent,
  },
  perforation: {
    flexDirection: "row",
    alignItems: "center",
    height: NOTCH,
    marginVertical: 10,
  },
  notchLeft: {
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: Theme.screenBackground,
    marginLeft: -14 - NOTCH / 2,
  },
  notchRight: {
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: Theme.screenBackground,
    marginRight: -14 - NOTCH / 2,
  },
  dashLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD.divider,
  },
  footerStack: {
    gap: 8,
  },
  footerMetricsPanel: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: CARD.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD.panelBorder,
    gap: 8,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: CARD.divider,
    marginHorizontal: 12,
    alignSelf: "stretch",
  },
  metricLabel: {
    ...indentReviewHubText.freightGridLabelDark,
    fontSize: 8,
    letterSpacing: 0.5,
    color: CARD.label,
  },
  metricValue: {
    ...indentReviewHubText.freightGridValueDark,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
  },
  metricValuePositive: { color: CARD.valuePositive },
  metricValueNegative: { color: CARD.valueNegative },
  metricValueNeutral: { color: CARD.valueNeutral },
  recoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingTop: 2,
  },
  recoText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: CARD.reco,
    lineHeight: 15,
  },
  alertPanel: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  alertPanelOverdue: {
    backgroundColor: CARD.alertOverdueBg,
    borderColor: CARD.alertOverdueBorder,
  },
  alertPanelUrgent: {
    backgroundColor: CARD.alertUrgentBg,
    borderColor: CARD.alertUrgentBorder,
  },
  alertPanelSoon: {
    backgroundColor: CARD.alertSoonBg,
    borderColor: CARD.alertSoonBorder,
  },
  alertPanelNeutral: {
    backgroundColor: CARD.hintBg,
    borderColor: CARD.hintBorder,
  },
  alertLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  alertAwardedText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: CARD.awardedLine,
  },
  alertDueText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  alertDueOverdue: { color: CARD.alertOverdueText },
  alertDueUrgent: { color: CARD.alertUrgentText },
  alertDueSoon: { color: CARD.alertSoonText },
  alertDueNeutral: { color: CARD.hintText },
  hintPanel: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: CARD.hintBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD.hintBorder,
  },
  hintPanelText: {
    fontSize: 11,
    fontWeight: "600",
    color: CARD.hintText,
    lineHeight: 15,
  },
  childrenSlot: {
    gap: 8,
  },
});

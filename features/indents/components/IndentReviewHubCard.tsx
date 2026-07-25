/**
 * Indent Review Hub — left summary column.
 * Multi-card layout (route · shipment/commercials · suppliers · insight)
 * matching the Load Detail Hub visual system. Props/handlers unchanged.
 */
import { memo, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { IndentFreightClientEntity } from "@/features/indents/components/IndentFreightClientEntity";
import { IndentHubInsightTicketTail } from "@/features/indents/components/IndentHubInsightTicketTail";
import type { IndentFreightCardClientProps } from "@/features/indents/components/IndentFreightCard";
import {
  indentHubCardShadow,
  indentReviewHubLayout,
  indentReviewHubText,
} from "@/features/indents/styles/indentReviewHubStyles";
import type { IndentBidAlertInfo } from "@/features/indents/utils/bidding/indentBidAlert.util";
import type { IndentBidFooterInsight } from "@/features/indents/utils/bidding/indentLiveBids.util";
import { formatINR } from "@/lib/format";

const cardShadow = indentHubCardShadow as ViewStyle;

export type IndentReviewHubCardProps = {
  isOwner: boolean;
  typeLabel: string;
  status: string;
  isDirect: boolean;
  dateLabel: string;
  origin: string;
  destination: string;
  vehicleType: string;
  weightKg: string;
  material: string;
  canCancelLoad?: boolean;
  cancelling?: boolean;
  onCancelLoad?: () => void;
  canEditLoad?: boolean;
  onEditAll?: () => void;
  primaryAmount: string;
  supplierRate?: string;
  marginPct?: number | null;
  client: IndentFreightCardClientProps;
  quoteStatus?: string | null;
  quoteAmountInr?: number | null;
  targetRateInr?: number;
  footerInsight?: IndentBidFooterInsight | null;
  alertInfo?: IndentBidAlertInfo | null;
  onQuotePress?: () => void;
  /** When true (GET LOAD split layout), quote hero moves to the bids pane. */
  suppressSupplierQuoteHero?: boolean;
  compact?: boolean;
  stacked?: boolean;
  partiesStrip?: ReactNode;
  children?: ReactNode;
};

function stripCurrencyPrefix(formatted: string): string {
  return formatted.replace(/^[^\d,.-]+/, "").trim() || formatted;
}

function quoteStatusStyles(status: string) {
  const s = status.toLowerCase();
  if (s === "accepted") {
    return { pill: styles.statusAwarded, text: styles.statusAwardedText };
  }
  if (s === "rejected") {
    return { pill: styles.statusRejected, text: styles.statusRejectedText };
  }
  return { pill: styles.statusPending, text: styles.statusPendingText };
}

function SpecTile({ label, value }: { label: string; value: string }) {
  const empty = value === "—" || !String(value).trim();
  return (
    <View style={styles.specTile}>
      <Text style={styles.specTileLabel}>{label}</Text>
      <Text
        style={[styles.specTileValue, empty && styles.specTileValueEmpty]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function GlassCard({
  children,
  compact,
  stacked,
  style,
}: {
  children: ReactNode;
  compact?: boolean;
  stacked?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        styles.glassCard,
        compact && styles.glassCardCompact,
        stacked && styles.glassCardStacked,
        cardShadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export const IndentReviewHubCard = memo(function IndentReviewHubCard({
  isOwner,
  typeLabel,
  status,
  isDirect,
  dateLabel,
  origin,
  destination,
  vehicleType,
  weightKg,
  material,
  canCancelLoad,
  cancelling,
  onCancelLoad,
  canEditLoad,
  onEditAll,
  primaryAmount,
  supplierRate = "—",
  marginPct = null,
  client,
  quoteStatus,
  quoteAmountInr,
  targetRateInr = 0,
  footerInsight,
  alertInfo,
  onQuotePress,
  suppressSupplierQuoteHero = false,
  compact = false,
  stacked = false,
  partiesStrip,
  children,
}: IndentReviewHubCardProps) {
  const hasQuote =
    !suppressSupplierQuoteHero &&
    quoteAmountInr != null &&
    quoteAmountInr > 0;
  const ownerInlineFreight = isOwner && !onQuotePress;
  const quoteStatusNorm = (quoteStatus ?? "").trim().toLowerCase();
  const statusStyles = quoteStatus ? quoteStatusStyles(quoteStatusNorm) : null;

  const heroIsQuote = !isOwner && hasQuote;
  const heroAmount = heroIsQuote
    ? stripCurrencyPrefix(formatINR(quoteAmountInr!))
    : stripCurrencyPrefix(primaryAmount);
  const heroKicker = heroIsQuote
    ? "YOUR QUOTE"
    : isOwner
      ? "CLIENT RATE"
      : "TARGET RATE";
  const referenceTarget =
    !isOwner && hasQuote && targetRateInr > 0
      ? stripCurrencyPrefix(formatINR(targetRateInr))
      : null;

  const statusUpper = status.toUpperCase();
  const statusDisplay =
    statusUpper === "OPEN"
      ? "ACTIVE"
      : statusUpper === "BROADCAST"
        ? "LIVE"
        : statusUpper === "PENDING"
          ? "PENDING"
          : statusUpper;

  function renderHero() {
    return (
      <View style={styles.heroBlock}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroKicker}>{heroKicker}</Text>
          {statusStyles && heroIsQuote ? (
            <View style={[styles.statusPill, statusStyles.pill]}>
              <Text style={[styles.statusPillText, statusStyles.text]}>
                {quoteStatusNorm === "accepted"
                  ? "Awarded"
                  : quoteStatusNorm === "rejected"
                    ? "Rejected"
                    : "Pending"}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.heroAmountRow}>
          <Text style={styles.heroCurrency}>₹</Text>
          <Text
            style={[styles.heroAmount, compact && styles.heroAmountCompact]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {heroAmount}
          </Text>
        </View>
        {referenceTarget ? (
          <Text style={styles.heroReference}>
            Shipper target · ₹ {referenceTarget}
          </Text>
        ) : null}
        {onQuotePress && !hasQuote ? (
          <Text style={styles.heroTapHint}>Tap to place your bid</Text>
        ) : null}
      </View>
    );
  }

  const heroBlock = onQuotePress ? (
    <Pressable onPress={onQuotePress} style={styles.heroPressable}>
      {renderHero()}
    </Pressable>
  ) : (
    renderHero()
  );

  return (
    <View style={[styles.stack, stacked && styles.stackStacked]}>
      {/* ── Card 1: Route & status ── */}
      <GlassCard compact={compact} stacked={stacked}>
        <View style={styles.orb} pointerEvents="none" />

        <View style={styles.tagsRow}>
          <View style={styles.pillRow}>
            <View style={styles.typePill}>
              <Text style={styles.typePillText}>{typeLabel}</Text>
            </View>
            <View style={styles.statePill}>
              <Text style={styles.statePillText}>{statusDisplay}</Text>
            </View>
            {isDirect ? (
              <View style={styles.directPill}>
                <Text style={styles.directPillText}>DIRECT</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.tagsRight}>
            <Text style={styles.dateLine}>{dateLabel}</Text>
            {isOwner && canCancelLoad ? (
              <TouchableOpacity
                onPress={onCancelLoad}
                disabled={cancelling}
                activeOpacity={0.7}
                accessibilityLabel="Cancel load"
                hitSlop={Layout.touchTargetHitSlop}
              >
                <Text style={styles.cancelLinkText}>
                  {cancelling ? "Cancelling…" : "Cancel load"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={[styles.routePanel, compact && styles.routePanelCompact]}>
          <LoadCardRouteRow
            origin={origin}
            destination={destination}
            compact
            style={styles.route}
          />
        </View>
      </GlassCard>

      {/* ── Card 2: Shipment + commercials ── */}
      <GlassCard compact={compact} stacked={stacked}>
        <View style={styles.specsHeader}>
          <Text style={styles.specsTitle}>SHIPMENT PROFILE</Text>
          {isOwner && canEditLoad ? (
            <TouchableOpacity
              onPress={onEditAll}
              hitSlop={Layout.touchTargetHitSlop}
              style={styles.editAllBtn}
            >
              <FontAwesome
                name="pencil"
                size={10}
                color={Theme.positive}
              />
              <Text style={styles.editAll}>EDIT ALL</Text>
            </TouchableOpacity>
          ) : isOwner ? (
            <Text style={styles.editAllDisabled}>Locked</Text>
          ) : (
            <View style={styles.readOnlyPill}>
              <FontAwesome name="eye" size={10} color={Theme.textMuted} />
              <Text style={styles.readOnlyText}>Read only</Text>
            </View>
          )}
        </View>

        <View style={styles.specGrid}>
          <SpecTile label="Vehicle" value={vehicleType} />
          <SpecTile label="Weight" value={weightKg} />
          <SpecTile label="Cargo Load" value={material} />
        </View>

        {isOwner ? (
          <View style={styles.financeRow}>
            <View style={styles.supplierTargetCard}>
              <Text style={styles.financeLabelDark}>SUPPLIER TARGET</Text>
              <Text
                style={[
                  styles.financeValueDark,
                  compact && styles.financeValueDarkCompact,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {supplierRate}
              </Text>
              {marginPct != null ? (
                <View style={styles.marginChip}>
                  <Text style={styles.marginChipText}>
                    {marginPct}% TARGET MARGIN
                  </Text>
                </View>
              ) : (
                <View style={styles.baselineChip}>
                  <Text style={styles.baselineChipText}>Target Baseline</Text>
                </View>
              )}
            </View>

            <View style={styles.clientRateCard}>
              <View style={styles.clientRateTop}>
                <Text style={styles.financeLabelLight}>CLIENT RATE</Text>
              </View>
              {ownerInlineFreight ? (
                <Text
                  style={[
                    styles.financeValueLight,
                    compact && styles.financeValueLightCompact,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {primaryAmount}
                </Text>
              ) : (
                heroBlock
              )}
              <View style={styles.clientEntitySlot}>
                <IndentFreightClientEntity
                  label="CLIENT"
                  displayName={client.displayName}
                  avatarName={client.avatarName}
                  clientId={client.clientId}
                  ownerOrgId={client.ownerOrgId}
                  shipperOrgId={client.shipperOrgId}
                  isOwner={client.isOwner}
                  align="left"
                  nameLines={1}
                  surface="light"
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.financeRow}>
            <View style={[styles.clientRateCard, { flex: 1.4 }]}>
              <Text style={styles.financeLabelLight}>SHIPPER</Text>
              <IndentFreightClientEntity
                displayName={client.displayName}
                avatarName={client.avatarName}
                clientId={client.clientId}
                ownerOrgId={client.ownerOrgId}
                shipperOrgId={client.shipperOrgId}
                isOwner={client.isOwner}
                align="left"
                nameLines={2}
                surface="light"
                hideLabel
              />
              <Text style={[styles.financeLabelLight, { marginTop: 10 }]}>
                TARGET RATE
              </Text>
              <Text style={styles.financeValueLight}>
                {targetRateInr > 0 ? formatINR(targetRateInr) : "—"}
              </Text>
            </View>
            {!suppressSupplierQuoteHero ? (
              <View style={styles.quoteHeroCard}>{heroBlock}</View>
            ) : null}
          </View>
        )}
      </GlassCard>

      {/* ── Card 3: Integrated suppliers ── */}
      {isOwner && partiesStrip ? (
        <GlassCard compact={compact} stacked={stacked}>
          {partiesStrip}
        </GlassCard>
      ) : null}

      {/* ── Insight / recommendation ── */}
      {(footerInsight || alertInfo) ? (
        <View
          style={[
            styles.insightWrap,
            compact && styles.insightWrapCompact,
            stacked && styles.insightWrapStacked,
          ]}
        >
          <IndentHubInsightTicketTail
            insight={footerInsight}
            alertInfo={alertInfo}
            contentPadding={indentReviewHubLayout.summaryCardPadding}
          />
        </View>
      ) : null}

      {children ? <View style={styles.childrenSlot}>{children}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  stack: {
    gap: 12,
    marginBottom: 8,
  },
  stackStacked: {
    gap: 10,
    marginBottom: 4,
    width: "100%",
  },
  glassCard: {
    position: "relative",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    padding: 16,
    overflow: "hidden",
  },
  glassCardCompact: {
    padding: 12,
    borderRadius: 14,
  },
  glassCardStacked: {
    alignSelf: "stretch",
    width: "100%",
  },
  orb: {
    position: "absolute",
    top: -40,
    right: -32,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Theme.positive,
    opacity: 0.06,
  },
  tagsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 12,
    zIndex: 1,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  tagsRight: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Theme.darkBackground,
  },
  typePillText: {
    ...indentReviewHubText.chipLabel,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: Theme.textOnDark,
  },
  statePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  statePillText: {
    ...indentReviewHubText.chipLabel,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.positive,
  },
  directPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  directPillText: {
    ...indentReviewHubText.chipLabel,
    color: Theme.textPrimaryDark,
  },
  dateLine: {
    ...indentReviewHubText.dateLine,
    fontSize: 10,
    fontWeight: "600",
  },
  cancelLinkText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.negative,
    letterSpacing: 0.2,
  },
  routePanel: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    zIndex: 1,
  },
  routePanelCompact: {
    padding: 10,
  },
  route: { marginBottom: 0 },
  specsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  specsTitle: {
    ...indentReviewHubText.fieldLabel,
    fontSize: 10,
    letterSpacing: 0.8,
    color: Theme.textMuted,
  },
  editAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  editAll: {
    ...indentReviewHubText.buttonLabel,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.positive,
  },
  editAllDisabled: {
    ...indentReviewHubText.chipLabel,
    fontSize: 9,
    color: Theme.textMuted,
  },
  readOnlyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  readOnlyText: {
    ...indentReviewHubText.chipLabel,
    fontSize: 9,
    color: Theme.textMuted,
  },
  specGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  specTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 10,
  },
  specTileLabel: {
    ...indentReviewHubText.specLabel,
    fontSize: 9,
    letterSpacing: 0.5,
    color: Theme.textMuted,
    marginBottom: 4,
  },
  specTileValue: {
    ...indentReviewHubText.fieldValue,
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
  },
  specTileValueEmpty: {
    color: Theme.textMuted,
    fontWeight: "600",
  },
  financeRow: {
    flexDirection: "row",
    gap: 10,
  },
  supplierTargetCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.darkBackground,
    borderRadius: 14,
    padding: 12,
    justifyContent: "space-between",
  },
  clientRateCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    justifyContent: "space-between",
  },
  quoteHeroCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.positiveMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
    padding: 12,
    justifyContent: "center",
  },
  financeLabelDark: {
    ...indentReviewHubText.freightLabelDark,
    fontSize: 9,
    letterSpacing: 0.6,
  },
  financeLabelLight: {
    ...indentReviewHubText.freightGridLabelLight,
    fontSize: 9,
    letterSpacing: 0.6,
  },
  financeValueDark: {
    fontSize: 18,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    color: Theme.textOnDark,
    marginTop: 4,
    marginBottom: 8,
  },
  financeValueDarkCompact: {
    fontSize: 15,
  },
  financeValueLight: {
    fontSize: 18,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimaryDark,
    marginTop: 4,
    marginBottom: 6,
  },
  financeValueLightCompact: {
    fontSize: 15,
  },
  clientRateTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clientEntitySlot: {
    marginTop: 6,
  },
  marginChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(16,185,129,0.2)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
  },
  marginChipText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: Theme.positiveMuted,
  },
  baselineChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  baselineChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
  },
  heroPressable: { minWidth: 0 },
  heroBlock: { gap: 2 },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  heroKicker: {
    ...indentReviewHubText.freightGridLabelLight,
    fontSize: 9,
    marginBottom: 0,
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  heroCurrency: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  heroAmount: {
    fontSize: 20,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimaryDark,
  },
  heroAmountCompact: {
    fontSize: 16,
  },
  heroReference: {
    ...indentReviewHubText.bodyMuted,
    fontSize: 10,
    marginTop: 2,
  },
  heroTapHint: {
    ...indentReviewHubText.bodyMuted,
    fontSize: 10,
    color: Theme.positive,
    marginTop: 4,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  statusPending: { backgroundColor: Theme.surfaceGray },
  statusPendingText: { color: Theme.textMuted },
  statusAwarded: { backgroundColor: "#FEF3C7" },
  statusAwardedText: { color: "#B45309" },
  statusRejected: { backgroundColor: "#FEE2E2" },
  statusRejectedText: { color: "#B91C1C" },
  insightWrap: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
    backgroundColor: Theme.positiveMuted,
  },
  insightWrapCompact: {
    borderRadius: 14,
  },
  insightWrapStacked: {
    width: "100%",
  },
  childrenSlot: {
    marginTop: 4,
  },
});

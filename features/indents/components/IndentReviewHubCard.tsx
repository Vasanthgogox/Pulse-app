import { memo, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { Platform } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { IndentFreightClientEntity } from "@/features/indents/components/IndentFreightClientEntity";
import { IndentHubInsightTicketTail } from "@/features/indents/components/IndentHubInsightTicketTail";
import { IndentHubPerforation } from "@/features/indents/components/IndentHubPerforation";
import type { IndentFreightCardClientProps } from "@/features/indents/components/IndentFreightCard";
import {
  indentHubCardShadow,
  indentReviewHubLayout,
  indentReviewHubSpecValue,
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
  /** Tighter layout for indent detail on smaller viewports. */
  compact?: boolean;
  /** Stacked mobile layout (summary above bids). */
  stacked?: boolean;
  /** Owner give-load: integrated supplier strip below shipment profile. */
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

const GRID_COL_COUNT = 3;

function HubGridColumn({
  children,
  showLeftBorder,
  flex = 1,
}: {
  children: ReactNode;
  showLeftBorder?: boolean;
  flex?: number;
}) {
  return (
    <View
      style={[
        styles.gridCol,
        !showLeftBorder && styles.gridColFirst,
        { flex },
        showLeftBorder && styles.gridColBorder,
      ]}
    >
      {children}
    </View>
  );
}

function SpecValue({ value }: { value: string }) {
  const empty = value === "—" || !String(value).trim();
  return (
    <Text
      style={[styles.specValue, empty && styles.specValueEmpty]}
      numberOfLines={2}
    >
      {value}
    </Text>
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

  const heroBlock = onQuotePress ? (
    <Pressable onPress={onQuotePress} style={styles.heroPressable}>
      {renderHero(false)}
    </Pressable>
  ) : (
    renderHero(false)
  );

  function renderHero(inline = false) {
    const amountStyle = inline
      ? compact
        ? styles.heroAmountInlineCompact
        : styles.heroAmountInline
      : compact
        ? styles.heroAmountCompact
        : styles.heroAmount;
    const currencyStyle = inline
      ? compact
        ? styles.heroCurrencyInlineCompact
        : styles.heroCurrencyInline
      : compact
        ? styles.heroCurrencyCompact
        : styles.heroCurrency;

    if (inline) {
      return (
        <>
          <Text
            style={[
              styles.heroKicker,
              styles.heroKickerInline,
              compact && styles.heroKickerCompact,
            ]}
            numberOfLines={2}
          >
            {heroKicker}
          </Text>
          <View style={[styles.heroAmountRow, styles.heroAmountRowInline]}>
            <Text style={currencyStyle}>₹</Text>
            <Text
              style={amountStyle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {heroAmount}
            </Text>
          </View>
        </>
      );
    }

    return (
      <View style={styles.heroBlock}>
        <View style={styles.heroTopRow}>
          <Text style={[styles.heroKicker, compact && styles.heroKickerCompact]}>
            {heroKicker}
          </Text>
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
          <Text style={currencyStyle}>₹</Text>
          <Text
            style={amountStyle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {heroAmount}
          </Text>
        </View>
        {referenceTarget ? (
          <Text style={[styles.heroReference, compact && styles.heroReferenceCompact]}>
            Shipper target · ₹ {referenceTarget}
          </Text>
        ) : null}
        {onQuotePress && !hasQuote ? (
          <Text style={styles.heroTapHint}>Tap to place your bid</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        stacked && styles.cardStacked,
        cardShadow,
      ]}
    >
      <View style={styles.orb} pointerEvents="none" />

      {isOwner && canCancelLoad ? (
        <TouchableOpacity
          style={styles.cancelLink}
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

      <View
        style={[
          styles.heroRow,
          compact && styles.heroRowCompact,
          isOwner && canCancelLoad && styles.heroRowWithCancel,
        ]}
      >
        <View style={styles.pillRow}>
          <View style={styles.typePill}>
            <Text style={styles.typePillText}>{typeLabel}</Text>
          </View>
          <View style={styles.statePill}>
            <Text style={styles.statePillText}>{status}</Text>
          </View>
          {isDirect ? (
            <View style={styles.directPill}>
              <Text style={styles.directPillText}>DIRECT</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.dateLine}>{dateLabel}</Text>
      </View>

      <LoadCardRouteRow
        origin={origin}
        destination={destination}
        compact
        style={[styles.route, compact && styles.routeCompact]}
      />

      <IndentHubPerforation
        contentPadding={indentReviewHubLayout.summaryCardPadding}
      />

      <View style={[styles.stub, compact && styles.stubCompact]}>
        <View style={styles.specsHeader}>
          <Text style={styles.specsTitle}>SHIPMENT PROFILE</Text>
          {isOwner && canEditLoad ? (
            <TouchableOpacity onPress={onEditAll} hitSlop={Layout.touchTargetHitSlop}>
              <Text style={styles.editAll}>Edit All</Text>
            </TouchableOpacity>
          ) : isOwner ? (
            <Text style={styles.editAllDisabled}>Locked</Text>
          ) : null}
        </View>

        {!isOwner ? (
          <View style={styles.readOnlyPill}>
            <FontAwesome name="eye" size={11} color={Theme.textMuted} />
            <Text style={styles.readOnlyText}>Read only load details</Text>
          </View>
        ) : null}

        <View style={[styles.insetPanel, compact && styles.insetPanelCompact, stacked && styles.insetPanelStacked]}>
          <View style={styles.gridRow}>
            {(["Vehicle", "Weight", "Load"] as const).map((label, i) => (
              <HubGridColumn key={label} showLeftBorder={i > 0}>
                <Text style={[styles.specLabel, compact && styles.specLabelCompact]}>
                  {label}
                </Text>
                <SpecValue value={[vehicleType, weightKg, material][i]} />
              </HubGridColumn>
            ))}
          </View>

          {isOwner ? (
            <>
              <View style={styles.panelRowDivider} />
              <View style={styles.gridRow}>
                <HubGridColumn showLeftBorder={false}>
                  <Text style={styles.commerceLabel}>SUPPLIER TARGET</Text>
                  <Text
                    style={[styles.commerceValue, compact && styles.commerceValueCompact]}
                  >
                    {supplierRate}
                  </Text>
                  {marginPct != null ? (
                    <View style={styles.marginChip}>
                      <Text style={styles.marginChipText}>{marginPct}% margin</Text>
                    </View>
                  ) : null}
                </HubGridColumn>
                <HubGridColumn showLeftBorder flex={GRID_COL_COUNT - 1}>
                  <IndentFreightClientEntity
                    label="CLIENT"
                    displayName={client.displayName}
                    avatarName={client.avatarName}
                    clientId={client.clientId}
                    ownerOrgId={client.ownerOrgId}
                    shipperOrgId={client.shipperOrgId}
                    isOwner={client.isOwner}
                    align="left"
                    nameLines={compact ? 1 : 2}
                    surface="light"
                  />
                </HubGridColumn>
              </View>
              {ownerInlineFreight ? (
                <>
                  <View style={styles.panelRowDivider} />
                  <View style={styles.freightInlineRow}>
                    {renderHero(true)}
                  </View>
                </>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.panelRowDivider} />
              <View style={styles.gridRow}>
                <HubGridColumn showLeftBorder={false} flex={GRID_COL_COUNT - 1}>
                  <Text style={styles.commerceLabel}>SHIPPER</Text>
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
                </HubGridColumn>
                <HubGridColumn showLeftBorder flex={1}>
                  <Text style={styles.commerceLabel}>TARGET RATE</Text>
                  <Text style={styles.commerceValue}>
                    {targetRateInr > 0 ? formatINR(targetRateInr) : "—"}
                  </Text>
                </HubGridColumn>
              </View>
            </>
          )}
        </View>

        {!ownerInlineFreight ? (
          <View style={[styles.heroPanel, compact && styles.heroPanelCompact]}>
            {heroBlock}
          </View>
        ) : null}

        {isOwner && partiesStrip ? (
          <View style={[styles.partiesStripSlot, compact && styles.partiesStripSlotCompact]}>
            {partiesStrip}
          </View>
        ) : null}
      </View>

      <IndentHubInsightTicketTail
        insight={footerInsight}
        alertInfo={alertInfo}
        contentPadding={indentReviewHubLayout.summaryCardPadding}
      />

      {children ? <View style={styles.childrenSlot}>{children}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    position: "relative",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: indentReviewHubLayout.summaryCardRadius,
    padding: indentReviewHubLayout.summaryCardPadding,
    marginBottom: 8,
    overflow: "hidden",
  },
  cardCompact: {
    marginBottom: 6,
  },
  cardStacked: {
    marginBottom: 4,
    alignSelf: "stretch",
    width: "100%",
  },
  orb: {
    position: "absolute",
    top: -72,
    right: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Theme.textPrimaryDark,
    opacity: 0.03,
  },
  cancelLink: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 2,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  cancelLinkText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.negative,
    letterSpacing: 0.2,
  },
  heroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
    zIndex: 1,
  },
  heroRowCompact: {
    marginBottom: 6,
  },
  heroRowWithCancel: {
    paddingRight: 76,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.surfaceGray,
  },
  typePillText: {
    ...indentReviewHubText.chipLabel,
    color: Theme.textPrimaryDark,
  },
  statePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  statePillText: {
    ...indentReviewHubText.chipLabel,
    color: Theme.positive,
  },
  directPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  directPillText: {
    ...indentReviewHubText.chipLabel,
    color: Theme.textPrimaryDark,
  },
  dateLine: indentReviewHubText.dateLine,
  route: { marginBottom: 2, zIndex: 1 },
  routeCompact: { marginBottom: 0 },
  stub: {
    zIndex: 1,
    gap: 10,
  },
  stubCompact: {
    gap: 6,
  },
  specsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 1,
  },
  specsTitle: indentReviewHubText.fieldLabel,
  editAll: {
    ...indentReviewHubText.buttonLabel,
    fontSize: 8,
    color: Theme.darkBackground,
  },
  editAllDisabled: {
    ...indentReviewHubText.chipLabel,
    fontSize: 8,
    color: Theme.textMuted,
  },
  readOnlyPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 8,
    zIndex: 1,
  },
  readOnlyText: {
    ...indentReviewHubText.chipLabel,
    fontSize: 8,
    color: Theme.textMuted,
  },
  insetPanel: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 10,
  },
  insetPanelCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
    borderRadius: 10,
  },
  insetPanelStacked: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  freightInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
  },
  gridCol: {
    minWidth: 0,
    gap: 4,
    paddingRight: 8,
  },
  gridColFirst: {
    paddingLeft: 0,
  },
  gridColBorder: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.borderMedium,
    paddingLeft: 12,
  },
  panelRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderMedium,
    alignSelf: "stretch",
  },
  specLabel: {
    ...indentReviewHubText.specLabel,
    marginBottom: 2,
  },
  specLabelCompact: {
    marginBottom: 0,
  },
  specValue: {
    ...indentReviewHubSpecValue,
    lineHeight: 14,
    color: Theme.textPrimaryDark,
  },
  specValueEmpty: {
    color: Theme.textMuted,
    fontWeight: "600",
  },
  commerceLabel: {
    ...indentReviewHubText.freightGridLabelDark,
    fontSize: 8,
    color: Theme.textRouteCard,
    marginBottom: 4,
  },
  commerceValue: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    lineHeight: 18,
  },
  commerceValueCompact: {
    fontSize: 13,
    lineHeight: 16,
  },
  marginChip: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#ECFDF5",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#A7F3D0",
  },
  marginChipText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.success,
  },
  heroPanel: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heroPanelCompact: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  heroPressable: {
    borderRadius: 10,
  },
  heroBlock: {
    gap: 4,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heroKicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textRouteCard,
  },
  heroKickerInline: {
    flex: 1,
    minWidth: 0,
  },
  heroKickerCompact: {
    fontSize: 8,
    letterSpacing: 0.6,
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  heroAmountRowInline: {
    flexShrink: 0,
  },
  heroCurrency: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textSecondary,
    lineHeight: 24,
    marginBottom: 1,
  },
  heroCurrencyCompact: {
    fontSize: 14,
    lineHeight: 18,
  },
  heroCurrencyInline: {
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 0,
  },
  heroCurrencyInlineCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  heroAmount: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: Theme.textPrimaryDark,
    lineHeight: 32,
    flexShrink: 1,
    fontVariant: ["tabular-nums"],
  },
  heroAmountCompact: {
    fontSize: 22,
    lineHeight: 26,
  },
  heroAmountInline: {
    fontSize: 20,
    lineHeight: 24,
  },
  heroAmountInlineCompact: {
    fontSize: 18,
    lineHeight: 22,
  },
  heroReference: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textRouteCard,
    marginTop: 2,
  },
  heroReferenceCompact: {
    fontSize: 10,
    marginTop: 0,
  },
  heroTapHint: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.actionAccent,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  statusPending: { backgroundColor: "#F1F5F9" },
  statusPendingText: { color: "#475569" },
  statusAwarded: { backgroundColor: "#FEF3C7" },
  statusAwardedText: { color: "#B45309" },
  statusRejected: { backgroundColor: "#FEE2E2" },
  statusRejectedText: { color: "#B91C1C" },
  childrenSlot: {
    marginTop: 10,
    gap: 8,
    zIndex: 1,
  },
  partiesStripSlot: {
    marginTop: 2,
    zIndex: 1,
  },
  partiesStripSlotCompact: {
    marginTop: 0,
  },
});

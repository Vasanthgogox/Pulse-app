/**
 * Expanded card for a Ledger row in the Treasury Financial Summary. Shows ledger details,
 * associated trip, trip statement (Sale/Received/Due etc.), and associated transactions.
 * Transaction list styled like Google Pay / PhonePe history.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export interface LedgerExpandedCardTx {
  id: string;
  date: string;
  typeLabel: string;
  in: number;
  out: number;
  party: string;
}

export interface LedgerExpandedCardProps {
  /** Transaction type label (e.g. "Customer payment") */
  transactionTypeLabel?: string | null;
  /** Entry date for display and aging */
  transactionDate?: string | null;
  /** Formatted entry date */
  formattedDate: string;
  /** Aging label (e.g. "3 days ago") */
  agingLabel: string;
  /** Received amount */
  paymentIn: number;
  /** Paid amount */
  paymentOut: number;
  /** Note/description */
  note?: string | null;
  paymentMode?: string | null;
  paymentReference?: string | null;
  reconciliationLabel?: string | null;
  reconciliationActionLabel?: string | null;
  reconciliationHelperText?: string | null;
  /** Whether to show the "Ledger details" block */
  hasMergedDetails: boolean;
  /** Trip number or "—" */
  tripNumber: string;
  /** Formatted trip date */
  tripDateStr: string;
  /** Has trip date */
  hasTripDate: boolean;
  /** Route string (e.g. "Pondy → Madurai") */
  routeStr?: string;
  hasRoute: boolean;
  /** Client name */
  clientStr?: string;
  hasClient: boolean;
  /** Truck/vehicle display */
  truckStr?: string;
  /** Driver name */
  driverStr?: string;
  /** Party type for statement rows */
  partyType: "client" | "supplier" | "driver" | "vehicle" | null;
  /** Trip sale (client_price) */
  tripSaleValue: number;
  /** Trip supplier cost */
  tripSupplierCost: number;
  /** True when trip is aggregate (outsourced); show "Supplier cost" vs "Total expense". */
  isAggregateTrip?: boolean;
  /** Trip driver commission */
  tripDriverCommission: number;
  /** Received sum from trip payment summary */
  receivedSum: number;
  /** Paid sum from trip payment summary */
  paidSum: number;
  /** Receivables due (sale - received) */
  receivablesDueRaw: number;
  /** Payables due */
  payablesDueRaw: number;
  /** Payables cost display (supplier cost - paid) */
  payablesCostDisplay: number;
  /** Driver due raw */
  driverDueRaw: number;
  /** Vehicle cost display */
  vehicleCostDisplay: number;
  /** Show receivables row (Sale/Received/Due) */
  showReceivablesRow: boolean;
  /** Show payables row */
  showPayablesRow: boolean;
  /** Show driver row (To pay/Paid/Due) */
  showDriverRow: boolean;
  /** Show vehicle row */
  showVehicleRow: boolean;
  /** Same-trip transactions list */
  sameTripTransactions: LedgerExpandedCardTx[];
  hasSameTx: boolean;
  /** Trip payment summary (for no-trip-detail branch) */
  summary?: { received: number; paid: number; entryCount: number } | null;
  hasTripSummary: boolean;
  /** Has trip detail (tripDetail not null) */
  hasTripDetail: boolean;
  /** Format number for display */
  formatNumFn?: (n: number) => string;
  /** Format number with sign */
  formatNumSignedFn?: (n: number) => string;
  /** Id of the current ledger entry (expanded row); this transaction is highlighted in the list. */
  highlightTransactionId?: string | null;
  /** Optional: called when user taps "Download Trip Protocol". */
  onDownloadPress?: () => void;
  /** Whether the counterparty (client/supplier) is integrated. When false, the reconciliation hero shows an offline empty state. */
  counterpartyIntegrated?: boolean | null;
  /** Optional: called when user taps "Bridge Variances" / "Open Compare & Verify". */
  onOpenCompareVerify?: () => void;
  /** When an open dispute exists for this trip+partner, shown as a status chip in the hero. */
  disputeStatus?: "OPEN" | "RESOLVED" | null;
  /** Who raised the dispute — affects chip wording. */
  disputeDirection?: "RAISED_BY_US" | "RECEIVED" | null;
}

const defaultFormatNum = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
const defaultFormatNumSigned = (n: number) => {
  const absStr = defaultFormatNum(Math.abs(n));
  return n < 0 ? `-${absStr}` : absStr;
};

/** Single transaction row — reference style: ArrowDown/ArrowUp circle icon, title, subtitle (date • party), amount. */
function TransactionHistoryRow({
  tx,
  formatNumFn,
  isLast,
  isHighlighted,
  styles: s,
}: {
  tx: LedgerExpandedCardTx;
  formatNumFn: (n: number) => string;
  isLast?: boolean;
  isHighlighted?: boolean;
  styles: Record<string, object>;
}) {
  const isIn = tx.in > 0;
  const amount = isIn ? tx.in : tx.out;
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (!isHighlighted) return;
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [isHighlighted, pulseScale]);

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View style={[s.txHistoryRow, isLast && s.txHistoryRowLast, isHighlighted && s.txHistoryRowHighlighted, isHighlighted && rowAnimatedStyle]}>
      <View style={[s.txHistoryIconWrap, isIn ? s.txHistoryIconIn : s.txHistoryIconOut]}>
        <FontAwesome
          name={isIn ? "arrow-down" : "arrow-up"}
          size={12}
          color={isIn ? Theme.darkGreen : Theme.teslaRed}
        />
      </View>
      <View style={s.txHistoryBody}>
        <Text style={s.txHistoryTitle} numberOfLines={1}>
          {tx.typeLabel}
        </Text>
        <Text style={s.txHistorySubtitle} numberOfLines={1}>
          {tx.date} · {tx.party}
        </Text>
      </View>
      <Text
        style={[
          s.txHistoryAmount,
          isIn ? s.txHistoryAmountIn : s.txHistoryAmountOut,
        ]}
        numberOfLines={1}
      >
        {isIn ? "+" : "−"} ₹{formatNumFn(amount)}
      </Text>
    </Animated.View>
  );
}

export function LedgerExpandedCard({
  transactionTypeLabel,
  transactionDate,
  formattedDate,
  agingLabel,
  paymentIn,
  paymentOut,
  note,
  paymentMode,
  paymentReference,
  reconciliationLabel,
  reconciliationActionLabel,
  reconciliationHelperText,
  hasMergedDetails,
  tripNumber,
  tripDateStr,
  hasTripDate,
  routeStr,
  hasRoute,
  clientStr,
  hasClient,
  truckStr,
  driverStr,
  partyType,
  tripSaleValue,
  tripSupplierCost,
  isAggregateTrip = false,
  tripDriverCommission,
  receivedSum,
  paidSum,
  receivablesDueRaw,
  payablesDueRaw,
  payablesCostDisplay,
  driverDueRaw,
  vehicleCostDisplay,
  showReceivablesRow,
  showPayablesRow,
  showDriverRow,
  showVehicleRow,
  sameTripTransactions: sameTx,
  hasSameTx,
  summary,
  hasTripSummary,
  hasTripDetail,
  formatNumFn = defaultFormatNum,
  formatNumSignedFn = defaultFormatNumSigned,
  highlightTransactionId,
  onDownloadPress,
  counterpartyIntegrated,
  onOpenCompareVerify,
  disputeStatus,
  disputeDirection,
}: LedgerExpandedCardProps) {
  const hasEntryDate = (transactionDate ?? "").trim().length > 0;
  const hasNote = (note ?? "").trim() !== "";
  const showAmountReceived = paymentIn > 0;
  const showAmountPaid = paymentOut > 0;
  const hasTruckStr = ((truckStr ?? "").trim()) !== "";
  const hasDriverStr = ((driverStr ?? "").trim()) !== "";
  const showTruckDriverRow = hasTruckStr || hasDriverStr;
  const marginValue = tripSaleValue - tripSupplierCost;
  const marginPct =
    tripSaleValue > 0 ? ((tripSaleValue - tripSupplierCost) / tripSaleValue) * 100 : 0;
  const showSummaryBar =
    showReceivablesRow || showPayablesRow || showDriverRow || showVehicleRow || hasSameTx;
  const currentAmount = showAmountReceived ? paymentIn : showAmountPaid ? paymentOut : 0;
  const currentDirection: "in" | "out" | null = showAmountReceived ? "in" : showAmountPaid ? "out" : null;
  const matchedPreviewTx = useMemo(() => {
    if (!sameTx.length) return null;
    return (
      sameTx.find((tx) => {
        if (tx.id === highlightTransactionId) return false;
        if (currentDirection === "in") return Number(tx.in ?? 0) > 0;
        if (currentDirection === "out") return Number(tx.out ?? 0) > 0;
        return Number(tx.in ?? 0) > 0 || Number(tx.out ?? 0) > 0;
      }) ?? null
    );
  }, [sameTx, highlightTransactionId, currentDirection]);
  const matchedPreviewAmount = matchedPreviewTx
    ? currentDirection === "in"
      ? Number(matchedPreviewTx.in ?? 0)
      : currentDirection === "out"
        ? Number(matchedPreviewTx.out ?? 0)
        : Number(matchedPreviewTx.in ?? 0) || Number(matchedPreviewTx.out ?? 0)
    : 0;
  const reconciliationVariance = matchedPreviewTx
    ? currentAmount - matchedPreviewAmount
    : null;

  return (
    <View style={styles.detailOuter}>
      <View style={styles.detailCard}>
        {/* Ledger Details — reference: black header + 2-col grid (Type|Aging, Entry Date|Amount Sync), Note */}
        {hasMergedDetails ? (
          <View style={styles.detailBlock}>
            <View style={styles.detailBlockHeader}>
              <Text style={styles.detailBlockHeaderText}>Ledger Details</Text>
            </View>
            <View style={styles.detailBlockContent}>
              <View style={styles.detailGridRow}>
                <View style={styles.detailGridHalf}>
                  <Text style={styles.detailLabel}>Type</Text>
                  <Text style={styles.detailValue} numberOfLines={2}>
                    {transactionTypeLabel ?? "—"}
                  </Text>
                </View>
                <View style={[styles.detailGridHalf, styles.detailGridHalfRight]}>
                  <Text style={styles.detailLabel}>Aging</Text>
                  <Text style={styles.detailValue}>{agingLabel}</Text>
                </View>
              </View>
              <View style={styles.detailGridRow}>
                <View style={styles.detailGridHalf}>
                  <Text style={styles.detailLabel}>Entry Date</Text>
                  <Text style={styles.detailValue}>{formattedDate}</Text>
                </View>
                <View style={[styles.detailGridHalf, styles.detailGridHalfRight]}>
                  <Text style={styles.detailLabel}>Amount Sync</Text>
                  {showAmountReceived ? (
                    <View style={styles.amountPillGreen}>
                      <Text style={styles.amountPillText}>₹{formatNumFn(paymentIn)}</Text>
                    </View>
                  ) : showAmountPaid ? (
                    <View style={styles.amountPillRed}>
                      <Text style={styles.amountPillText}>₹{formatNumFn(paymentOut)}</Text>
                    </View>
                  ) : (
                    <Text style={styles.detailValue}>—</Text>
                  )}
                </View>
              </View>
              {(paymentMode || paymentReference) && (
                <View style={styles.detailGridRow}>
                  <View style={styles.detailGridHalf}>
                    <Text style={styles.detailLabel}>Payment mode</Text>
                    <Text style={styles.detailValue}>{paymentMode ?? "—"}</Text>
                  </View>
                  <View style={[styles.detailGridHalf, styles.detailGridHalfRight]}>
                    <Text style={styles.detailLabel}>Reference</Text>
                    <Text style={styles.detailValue} numberOfLines={1}>
                      {paymentReference ?? "—"}
                    </Text>
                  </View>
                </View>
              )}
              {reconciliationLabel ||
              partyType === "client" ||
              partyType === "supplier" ? (
                <View style={styles.reconHeroWrap}>
                  {(() => {
                    const isCounterpartyEligible =
                      partyType === "client" || partyType === "supplier";
                    const isOffline =
                      isCounterpartyEligible &&
                      counterpartyIntegrated !== true;
                    const partyLabel =
                      (clientStr && clientStr.trim().length > 0
                        ? clientStr
                        : transactionTypeLabel ?? "Reconciliation")
                        .toUpperCase();
                    const costLabel =
                      partyType === "client"
                        ? "SALE"
                        : partyType === "supplier"
                          ? "SUPPLIER COST"
                          : partyType === "driver"
                            ? "COMMISSION"
                            : "AMOUNT";
                    const yourCost =
                      partyType === "client"
                        ? tripSaleValue
                        : partyType === "supplier"
                          ? tripSupplierCost
                          : partyType === "driver"
                            ? tripDriverCommission
                            : currentAmount;
                    const yourPaid =
                      currentDirection === "in" ? receivedSum : paidSum;
                    const yourDue = Math.max(0, yourCost - yourPaid);
                    const hasMatch = matchedPreviewTx != null;
                    const variance = reconciliationVariance ?? 0;
                    const hasVariance = hasMatch && variance !== 0;
                    const partnerPaid = hasMatch ? matchedPreviewAmount : 0;
                    const partnerDue = hasMatch
                      ? Math.max(0, yourCost - partnerPaid)
                      : yourCost;
                    const statusLabel = hasMatch
                      ? hasVariance
                        ? "ACTION REQ"
                        : "MATCH SECURED"
                      : "AWAITING SYNC";
                    const statusTextStyle = hasMatch
                      ? hasVariance
                        ? styles.reconHeroStatusWarn
                        : styles.reconHeroStatusGood
                      : styles.reconHeroStatusNeutral;
                    const statusDotStyle = hasMatch
                      ? hasVariance
                        ? styles.reconHeroDotWarn
                        : styles.reconHeroDotGood
                      : styles.reconHeroDotNeutral;
                    const netVarianceAmount = hasMatch
                      ? Math.abs(variance)
                      : 0;
                    const matchedCount = hasMatch && !hasVariance ? 1 : 0;
                    const onlyYouCount = hasMatch && hasVariance ? 1 : hasMatch ? 0 : 1;
                    const onlyPartnerCount = 0;
                    return (
                      <View style={styles.reconHero}>
                        {/* Header */}
                        <View style={styles.reconHeroHeader}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={styles.reconHeroKickerRow}>
                              <FontAwesome
                                name={isOffline ? "unlink" : "link"}
                                size={9}
                                color={Theme.textOnDarkMuted}
                              />
                              <Text style={styles.reconHeroKicker}>
                                TRIP LEDGER
                              </Text>
                            </View>
                            <Text
                              style={styles.reconHeroParty}
                              numberOfLines={1}
                            >
                              {partyLabel}
                            </Text>
                          </View>
                          <View style={styles.reconHeroHeaderRight}>
                            <Text style={styles.reconHeroNetLabel}>
                              {isOffline
                                ? "OFFLINE"
                                : hasMatch && !hasVariance
                                  ? "ALL MATCHED"
                                  : "NET VARIANCE"}
                            </Text>
                            <Text
                              style={[
                                styles.reconHeroNetValue,
                                isOffline
                                  ? styles.reconHeroNetValueOffline
                                  : hasMatch && !hasVariance
                                    ? styles.reconHeroNetValueMatch
                                    : hasVariance
                                      ? styles.reconHeroNetValueWarn
                                      : styles.reconHeroNetValueNeutral,
                              ]}
                            >
                              {isOffline
                                ? "N/A"
                                : hasMatch && !hasVariance
                                  ? "₹0"
                                  : netVarianceAmount > 0
                                    ? `₹${formatNumFn(netVarianceAmount)}`
                                    : "—"}
                            </Text>
                          </View>
                        </View>

                        {disputeStatus === "OPEN" && !isOffline ? (
                          <View style={styles.reconDisputeChip}>
                            <FontAwesome
                              name="exclamation-circle"
                              size={11}
                              color={"#FCA5A5"}
                            />
                            <Text style={styles.reconDisputeChipText}>
                              {disputeDirection === "RECEIVED"
                                ? "DISPUTE RECEIVED · PARTNER REQUESTS REVIEW"
                                : "DISPUTE OPEN · PARTNER NOTIFIED"}
                            </Text>
                          </View>
                        ) : disputeStatus === "RESOLVED" && !isOffline ? (
                          <View
                            style={[
                              styles.reconDisputeChip,
                              styles.reconDisputeChipResolved,
                            ]}
                          >
                            <FontAwesome
                              name="check-circle"
                              size={11}
                              color={Theme.driverEmerald}
                            />
                            <Text
                              style={[
                                styles.reconDisputeChipText,
                                styles.reconDisputeChipTextResolved,
                              ]}
                            >
                              DISPUTE RESOLVED
                            </Text>
                          </View>
                        ) : null}

                        {isOffline && (
                          <View style={styles.reconOfflineBody}>
                            <View style={styles.reconOfflineIcon}>
                              <FontAwesome
                                name="unlink"
                                size={14}
                                color={Theme.textOnDark}
                              />
                            </View>
                            <Text style={styles.reconOfflineTitle}>
                              No comparison available
                            </Text>
                            <Text style={styles.reconOfflineBody2}>
                              This party is offline and is not connected on the network.
                              Once they join and link their books, we will pair
                              entries automatically and surface variances here.
                            </Text>
                          </View>
                        )}

                        {!isOffline && (
                        <View style={styles.reconIntegratedStack}>
                        {/* Financial Discrepancy Analysis */}
                        <View style={styles.reconGlass}>
                          <View style={styles.reconGlassHeader}>
                            <Text style={styles.reconGlassKicker}>
                              FINANCIAL DISCREPANCY ANALYSIS
                            </Text>
                            <View style={styles.reconGlassStatusRow}>
                              <View
                                style={[styles.reconHeroDot, statusDotStyle]}
                              />
                              <Text
                                style={[
                                  styles.reconGlassStatus,
                                  statusTextStyle,
                                ]}
                              >
                                {statusLabel}
                              </Text>
                            </View>
                          </View>

                          {/* Three comparison rows */}
                          {[
                            {
                              key: "cost",
                              label: costLabel,
                              you: yourCost,
                              them: hasMatch ? yourCost : 0,
                              delta: 0,
                              themShown: hasMatch,
                            },
                            {
                              key: "paid",
                              label:
                                currentDirection === "in" ? "RECEIVED" : "PAID",
                              you: yourPaid,
                              them: partnerPaid,
                              delta: hasMatch ? yourPaid - partnerPaid : 0,
                              themShown: hasMatch,
                            },
                            {
                              key: "due",
                              label: "DUE",
                              you: yourDue,
                              them: partnerDue,
                              delta: hasMatch ? yourDue - partnerDue : 0,
                              themShown: hasMatch,
                            },
                          ].map((r) => {
                            const variant = r.delta !== 0;
                            return (
                              <View key={r.key} style={styles.reconLineBlock}>
                                <View style={styles.reconLineHeaderRow}>
                                  <Text style={styles.reconLineLabel}>
                                    {r.label}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.reconLineStatus,
                                      variant
                                        ? styles.reconLineStatusWarn
                                        : styles.reconLineStatusGood,
                                    ]}
                                  >
                                    {variant
                                      ? `₹${formatNumFn(Math.abs(r.delta))} variance`
                                      : "Match secured"}
                                  </Text>
                                </View>
                                <View style={styles.reconChipRow}>
                                  <View style={styles.reconChip}>
                                    <Text style={styles.reconChipTag}>YOU</Text>
                                    <Text style={styles.reconChipValue}>
                                      ₹{formatNumFn(r.you)}
                                    </Text>
                                  </View>
                                  <View
                                    style={[
                                      styles.reconChip,
                                      variant && styles.reconChipWarn,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.reconChipTag,
                                        variant && styles.reconChipTagWarn,
                                      ]}
                                    >
                                      THEM
                                    </Text>
                                    <Text
                                      style={[
                                        styles.reconChipValue,
                                        variant && styles.reconChipValueWarn,
                                      ]}
                                    >
                                      {r.themShown
                                        ? `₹${formatNumFn(r.them)}`
                                        : "—"}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            );
                          })}

                          {/* Counters */}
                          <View style={styles.reconCounters}>
                            <View style={styles.reconCounterItem}>
                              <Text
                                style={[
                                  styles.reconCounterValue,
                                  styles.reconCounterValueGood,
                                ]}
                              >
                                {matchedCount}
                              </Text>
                              <Text style={styles.reconCounterLabel}>
                                Matched
                              </Text>
                            </View>
                            <View style={styles.reconCounterDivider} />
                            <View style={styles.reconCounterItem}>
                              <Text
                                style={[
                                  styles.reconCounterValue,
                                  styles.reconCounterValueWarn,
                                ]}
                              >
                                {onlyYouCount}
                              </Text>
                              <Text style={styles.reconCounterLabel}>
                                Only you
                              </Text>
                            </View>
                            <View style={styles.reconCounterDivider} />
                            <View style={styles.reconCounterItem}>
                              <Text
                                style={[
                                  styles.reconCounterValue,
                                  styles.reconCounterValueMuted,
                                ]}
                              >
                                {onlyPartnerCount}
                              </Text>
                              <Text style={styles.reconCounterLabel}>
                                Only partner
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Helper / action hints */}
                        {(reconciliationHelperText ||
                          reconciliationActionLabel) && (
                          <View style={styles.reconHintsCard}>
                            {reconciliationHelperText ? (
                              <Text style={styles.reconHintHelper}>
                                {reconciliationHelperText}
                              </Text>
                            ) : null}
                            {reconciliationActionLabel ? (
                              <Text style={styles.reconHintAction}>
                                Next: {reconciliationActionLabel}
                              </Text>
                            ) : null}
                          </View>
                        )}

                        {/* Footer mini-cards */}
                        <View style={styles.reconFooterRow}>
                          <View style={styles.reconFooterCard}>
                            <View style={styles.reconFooterIconRow}>
                              <FontAwesome
                                name="arrow-down"
                                size={9}
                                color={Theme.driverEmerald}
                              />
                              <Text style={styles.reconFooterLabel}>
                                INVOICED
                              </Text>
                            </View>
                            <Text style={styles.reconFooterValue}>
                              ₹{formatNumFn(yourCost)}
                            </Text>
                          </View>
                          <View style={styles.reconFooterCard}>
                            <View style={styles.reconFooterIconRow}>
                              <FontAwesome
                                name="arrow-up"
                                size={9}
                                color={Theme.textOnDarkMuted}
                              />
                              <Text style={styles.reconFooterLabel}>
                                OUTSTANDING
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.reconFooterValue,
                                yourDue === 0 &&
                                  styles.reconFooterValueMuted,
                              ]}
                            >
                              {yourDue === 0 ? "0.00" : `₹${formatNumFn(yourDue)}`}
                            </Text>
                          </View>
                        </View>
                        </View>
                        )}

                        {/* CTA — Bridge Variances / Open Compare & Verify */}
                        {!isOffline && onOpenCompareVerify ? (
                          <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={onOpenCompareVerify}
                            style={styles.reconCtaButton}
                          >
                            <Text style={styles.reconCtaButtonText}>
                              {hasVariance
                                ? "BRIDGE VARIANCES"
                                : "OPEN COMPARE & VERIFY"}
                            </Text>
                            <FontAwesome
                              name="chevron-right"
                              size={11}
                              color={Theme.textPrimaryDark}
                            />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    );
                  })()}
                </View>
              ) : null}
              {hasNote ? (
                <View style={styles.detailNoteRow}>
                  <Text style={styles.detailLabel}>Note</Text>
                  <Text style={[styles.detailValue, styles.detailNoteValue]} numberOfLines={2}>
                    {note}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Associated Trip — reference: black header + grid (Trip ID, Trip Date, Route, Client, Client Price, Supplier Cost, Margin, Margin %) + dark summary bar + tx list + download */}
        <View style={[styles.detailBlock, hasMergedDetails && styles.detailBlockSpacer]}>
          <View style={styles.detailBlockHeader}>
            <Text style={styles.detailBlockHeaderText}>Associated Trip</Text>
          </View>
          <View style={styles.detailBlockContent}>
            {hasTripDetail ? (
              <>
                <View style={styles.detailGridRow}>
                  <View style={styles.detailGridHalf}>
                    <Text style={styles.detailLabel}>Trip ID</Text>
                    <Text style={[styles.detailValue, styles.detailValueBold]} numberOfLines={1}>
                      {tripNumber}
                    </Text>
                    <View style={styles.detailUnderline} />
                  </View>
                  <View style={[styles.detailGridHalf, styles.detailGridHalfRight]}>
                    <Text style={styles.detailLabel}>Trip Date</Text>
                    <Text style={styles.detailValue}>{tripDateStr}</Text>
                    <View style={styles.detailUnderline} />
                  </View>
                </View>
                <View style={styles.detailGridRow}>
                  <View style={styles.detailGridHalf}>
                    <Text style={styles.detailLabel}>Route</Text>
                    <Text style={[styles.detailValue, styles.detailValueItalic]} numberOfLines={2}>
                      {routeStr || "—"}
                    </Text>
                    <View style={styles.detailUnderline} />
                  </View>
                  <View style={[styles.detailGridHalf, styles.detailGridHalfRight]}>
                    <Text style={styles.detailLabel}>Client</Text>
                    <Text style={styles.detailValue} numberOfLines={1}>
                      {clientStr || "—"}
                    </Text>
                    <View style={styles.detailUnderline} />
                  </View>
                </View>
                <View style={styles.detailGridRow}>
                  <View style={styles.detailGridHalf}>
                    <Text style={styles.detailLabel}>Client Price</Text>
                    <Text style={styles.detailValue}>₹{formatNumFn(tripSaleValue)}</Text>
                  </View>
                  <View style={[styles.detailGridHalf, styles.detailGridHalfRight]}>
                    <Text style={styles.detailLabel}>Supplier Cost</Text>
                    <Text style={styles.detailValue}>₹{formatNumFn(tripSupplierCost)}</Text>
                  </View>
                </View>
                <View style={[styles.detailGridRow, styles.detailMarginRow]}>
                  <View style={styles.detailGridHalf}>
                    <Text style={[styles.detailLabel, styles.detailLabelItalic]}>Margin</Text>
                    <Text
                      style={[
                        styles.detailValueMargin,
                        marginValue >= 0 ? styles.detailValueGreen : styles.detailValueRed,
                      ]}
                      numberOfLines={1}
                    >
                      ₹{formatNumSignedFn(marginValue)}
                    </Text>
                  </View>
                  <View style={[styles.detailGridHalf, styles.detailGridHalfRight]}>
                    <Text style={[styles.detailLabel, styles.detailLabelItalic]}>Margin %</Text>
                    <Text
                      style={[
                        styles.detailValueMargin,
                        marginPct >= 0 ? styles.detailValueGreen : styles.detailValueRed,
                      ]}
                      numberOfLines={1}
                    >
                      {tripSaleValue > 0 ? `${marginPct >= 0 ? "+" : ""}${marginPct.toFixed(1)}%` : "—"}
                    </Text>
                  </View>
                </View>
                {showTruckDriverRow ? (
                  <View style={styles.detailGridRow}>
                    {hasTruckStr ? (
                      <View style={styles.detailGridHalf}>
                        <Text style={styles.detailLabel}>Truck</Text>
                        <Text style={styles.detailValue} numberOfLines={1}>
                          {(truckStr ?? "").trim()}
                        </Text>
                      </View>
                    ) : null}
                    {hasDriverStr ? (
                      <View style={[styles.detailGridHalf, styles.detailGridHalfRight]}>
                        <Text style={styles.detailLabel}>Driver</Text>
                        <Text style={styles.detailValue} numberOfLines={1}>
                          {driverStr}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : (
              <>
                {showTruckDriverRow ? (
                  <View style={styles.detailGridRow}>
                    {hasTruckStr ? (
                      <View style={styles.detailGridHalf}>
                        <Text style={styles.detailLabel}>Truck</Text>
                        <Text style={styles.detailValue} numberOfLines={1}>
                          {(truckStr ?? "").trim()}
                        </Text>
                      </View>
                    ) : null}
                    {hasDriverStr ? (
                      <View style={[styles.detailGridHalf, styles.detailGridHalfRight]}>
                        <Text style={styles.detailLabel}>Driver</Text>
                        <Text style={styles.detailValue} numberOfLines={1}>
                          {driverStr}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </>
            )}

            {/* Summary status bar — reference: dark bg, Sale | Received | Due, divider, Transaction History list */}
            {showSummaryBar ? (
              <View style={styles.summaryBar}>
                {showReceivablesRow ? (
                  <View style={styles.summaryBarRow}>
                    <View style={styles.summaryBarCell}>
                      <Text style={styles.summaryBarLabel}>Sale</Text>
                      <Text style={styles.summaryBarValue}>₹{formatNumFn(tripSaleValue)}</Text>
                    </View>
                    <View style={styles.summaryBarCell}>
                      <Text style={styles.summaryBarLabelReceived}>Received</Text>
                      <Text style={styles.summaryBarValueGreen}>₹{formatNumFn(receivedSum)}</Text>
                    </View>
                    <View style={styles.summaryBarCell}>
                      <Text style={styles.summaryBarLabel}>Due</Text>
                      <Text
                        style={[
                          styles.summaryBarValue,
                          receivablesDueRaw === 0 && styles.summaryBarValueMuted,
                        ]}
                        numberOfLines={1}
                      >
                        ₹{formatNumSignedFn(receivablesDueRaw)}
                      </Text>
                    </View>
                  </View>
                ) : (hasTripSummary && summary) && (partyType === "client" || partyType === null) ? (
                  <View style={styles.summaryBarRow}>
                    <View style={styles.summaryBarCell}>
                      <Text style={styles.summaryBarLabel}>Sale</Text>
                      <Text style={styles.summaryBarValue}>—</Text>
                    </View>
                    <View style={styles.summaryBarCell}>
                      <Text style={styles.summaryBarLabelReceived}>Received</Text>
                      <Text style={styles.summaryBarValueGreen}>₹{formatNumFn(summary!.received)}</Text>
                    </View>
                    <View style={styles.summaryBarCell}>
                      <Text style={styles.summaryBarLabel}>Due</Text>
                      <Text style={styles.summaryBarValueMuted}>—</Text>
                    </View>
                  </View>
                ) : null}
                {showPayablesRow ? (
                  <View style={[styles.summaryBarRow, !hasSameTx && styles.summaryBarRowLast]}>
                    <View style={styles.summaryBarCell}>
                      <Text style={styles.summaryBarLabel}>Supplier cost</Text>
                      <Text style={styles.summaryBarValue}>₹{formatNumSignedFn(payablesCostDisplay)}</Text>
                    </View>
                    <View style={styles.summaryBarCell}>
                      <Text style={styles.summaryBarLabelReceived}>Paid</Text>
                      <Text style={styles.summaryBarValueGreen}>₹{formatNumFn(paidSum)}</Text>
                    </View>
                    <View style={styles.summaryBarCell}>
                      <Text style={styles.summaryBarLabel}>Due</Text>
                      <Text style={styles.summaryBarValue}>₹{formatNumSignedFn(payablesDueRaw)}</Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.summaryBarDivider} />
                {hasSameTx ? (
                  <>
                    <Text style={styles.summaryBarTxTitle}>Transaction History</Text>
                    <View style={styles.txHistoryList}>
                      {sameTx.map((tx, idx) => (
                        <TransactionHistoryRow
                          key={tx.id}
                          tx={tx}
                          formatNumFn={formatNumFn}
                          isLast={idx === sameTx.length - 1}
                          isHighlighted={tx.id === highlightTransactionId}
                          styles={styles}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}

            {onDownloadPress != null ? (
              <TouchableOpacity
                style={styles.downloadBtn}
                onPress={onDownloadPress}
                activeOpacity={0.8}
              >
                <FontAwesome name="download" size={12} color={Theme.primary} />
                <Text style={styles.downloadBtnText}>Download Trip Protocol</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const DETAIL_CARD_BG = "#FAFBFF";
const SUMMARY_BAR_BG = "#0A0A0B";

const styles = StyleSheet.create({
  detailOuter: {
    paddingTop: 2,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  detailCard: {
    backgroundColor: DETAIL_CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  detailBlock: {
    marginBottom: 0,
    overflow: "hidden",
  },
  detailBlockSpacer: {
    marginTop: 2,
  },
  detailBlockHeader: {
    backgroundColor: Theme.darkBackground,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  detailBlockHeaderText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textOnDark,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  detailBlockContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  detailGridRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  detailGridHalf: {
    flex: 1,
    minWidth: 0,
  },
  detailGridHalfRight: {
    alignItems: "flex-end",
  },
  detailLabel: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 1,
    letterSpacing: 0.4,
  },
  detailValue: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  detailValueBold: {
    fontWeight: "800",
  },
  detailValueItalic: {
    fontStyle: "italic",
  },
  detailUnderline: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginTop: 2,
  },
  reconHeroWrap: {
    marginTop: 10,
    marginHorizontal: -4,
  },
  reconHero: {
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 4,
  },
  reconHeroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  reconHeroKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  reconHeroKicker: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  reconHeroParty: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: -0.3,
  },
  reconHeroHeaderRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  reconHeroNetLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  reconHeroNetValue: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  reconHeroNetValueMatch: {
    color: Theme.driverEmerald,
  },
  reconHeroNetValueWarn: {
    color: "#FBBF24",
  },
  reconHeroNetValueNeutral: {
    color: Theme.textOnDarkMuted,
  },
  reconHeroNetValueOffline: {
    color: "#FCA5A5",
  },
  reconIntegratedStack: {
    display: "flex",
    gap: 12,
  },
  reconOfflineBody: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: "flex-start",
    gap: 8,
  },
  reconOfflineIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  reconOfflineTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
  reconOfflineBody2: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    lineHeight: 16,
  },
  reconCtaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.textOnDark,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 2,
  },
  reconCtaButtonText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 1.3,
  },
  reconDisputeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239,68,68,0.14)",
    borderColor: "rgba(239,68,68,0.28)",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reconDisputeChipResolved: {
    backgroundColor: "rgba(16,185,129,0.14)",
    borderColor: "rgba(16,185,129,0.28)",
  },
  reconDisputeChipText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800",
    color: "#FCA5A5",
    letterSpacing: 0.8,
  },
  reconDisputeChipTextResolved: {
    color: Theme.driverEmerald,
  },
  reconHeroDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  reconHeroDotGood: {
    backgroundColor: Theme.driverEmerald,
  },
  reconHeroDotWarn: {
    backgroundColor: "#F59E0B",
  },
  reconHeroDotNeutral: {
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  reconHeroStatusGood: {
    color: Theme.driverEmerald,
  },
  reconHeroStatusWarn: {
    color: "#FBBF24",
  },
  reconHeroStatusNeutral: {
    color: Theme.textOnDarkMuted,
  },
  reconGlass: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  reconGlassHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reconGlassKicker: {
    flex: 1,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  reconGlassStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  reconGlassStatus: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  reconLineBlock: {
    gap: 6,
  },
  reconLineHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reconLineLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.8,
  },
  reconLineStatus: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  reconLineStatusGood: {
    color: Theme.driverEmerald,
  },
  reconLineStatusWarn: {
    color: "#FBBF24",
  },
  reconChipRow: {
    flexDirection: "row",
    gap: 8,
  },
  reconChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  reconChipWarn: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.35)",
  },
  reconChipTag: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.9,
  },
  reconChipTagWarn: {
    color: "#FBBF24",
  },
  reconChipValue: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: -0.2,
  },
  reconChipValueWarn: {
    color: "#FBBF24",
  },
  reconCounters: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginTop: 2,
  },
  reconCounterItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  reconCounterDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  reconCounterValue: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  reconCounterValueGood: {
    color: Theme.driverEmerald,
  },
  reconCounterValueWarn: {
    color: "#FBBF24",
  },
  reconCounterValueMuted: {
    color: Theme.textOnDarkMuted,
  },
  reconCounterLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  reconHintsCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  reconHintHelper: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    lineHeight: 15,
  },
  reconHintAction: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
  reconFooterRow: {
    flexDirection: "row",
    gap: 8,
  },
  reconFooterCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 5,
  },
  reconFooterIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  reconFooterLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  reconFooterValue: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: -0.3,
  },
  reconFooterValueMuted: {
    color: Theme.textOnDarkMuted,
    fontStyle: "italic",
  },
  detailNoteRow: {
    marginTop: 2,
  },
  detailNoteValue: {
    fontStyle: "italic",
    textTransform: "uppercase",
    fontSize: 10,
  },
  amountPillGreen: {
    alignSelf: "flex-end",
    backgroundColor: Theme.darkGreen,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  amountPillRed: {
    alignSelf: "flex-end",
    backgroundColor: Theme.teslaRed,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  amountPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  detailMarginRow: {
    marginTop: 4,
    marginBottom: 0,
  },
  detailLabelItalic: {
    fontStyle: "italic",
  },
  detailValueMargin: {
    fontSize: 12,
    fontWeight: "700",
  },
  detailValueGreen: {
    color: Theme.darkGreen,
  },
  detailValueRed: {
    color: Theme.teslaRed,
  },
  summaryBar: {
    backgroundColor: SUMMARY_BAR_BG,
    borderRadius: 14,
    padding: 14,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  summaryBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryBarRowLast: {
    marginBottom: 0,
  },
  summaryBarCell: {
    flex: 1,
    alignItems: "center",
  },
  summaryBarLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "rgba(255,255,255,0.75)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  summaryBarLabelReceived: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  summaryBarValue: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnDark,
  },
  summaryBarValueMuted: {
    opacity: 0.4,
  },
  summaryBarValueGreen: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.darkGreen,
  },
  summaryBarDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    width: "100%",
    marginVertical: 12,
  },
  summaryBarTxTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  txHistoryList: {
    gap: 4,
  },
  txHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.03)",
    gap: 8,
  },
  txHistoryRowLast: {
    marginBottom: 0,
  },
  txHistoryIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  txHistoryIconIn: {
    borderWidth: 0,
  },
  txHistoryIconOut: {
    borderWidth: 0,
  },
  txHistoryRowHighlighted: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  txHistoryBody: {
    flex: 1,
    minWidth: 0,
  },
  txHistoryTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDark,
    marginBottom: 1,
  },
  txHistorySubtitle: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    fontStyle: "italic",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  txHistoryAmount: {
    fontSize: 11,
    fontWeight: "800",
  },
  txHistoryAmountIn: {
    color: Theme.darkGreen,
  },
  txHistoryAmountOut: {
    color: Theme.teslaRed,
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    marginTop: 8,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
  },
  downloadBtnText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});

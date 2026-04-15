/**
 * Expanded card for a Ledger row in the Treasury Financial Summary. Shows ledger details,
 * associated trip, trip statement (Sale/Received/Due etc.), and associated transactions.
 * Transaction list styled like Google Pay / PhonePe history.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect } from "react";
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
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  amountPillRed: {
    alignSelf: "flex-end",
    backgroundColor: Theme.teslaRed,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  amountPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnPrimary,
  },
  detailMarginRow: {
    marginTop: 2,
    marginBottom: 0,
  },
  detailLabelItalic: {
    fontStyle: "italic",
  },
  detailValueMargin: {
    fontSize: 12,
    fontWeight: "600",
  },
  detailValueGreen: {
    color: Theme.darkGreen,
  },
  detailValueRed: {
    color: Theme.teslaRed,
  },
  summaryBar: {
    backgroundColor: SUMMARY_BAR_BG,
    borderRadius: 12,
    padding: 10,
    marginTop: 4,
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
    fontSize: 7,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  summaryBarLabelReceived: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.darkGreen,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  summaryBarValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  summaryBarValueMuted: {
    opacity: 0.4,
  },
  summaryBarValueGreen: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.darkGreen,
  },
  summaryBarDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    width: "100%",
    marginVertical: 8,
  },
  summaryBarTxTitle: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  txHistoryList: {
    gap: 4,
  },
  txHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.03)",
    gap: 8,
  },
  txHistoryRowLast: {
    marginBottom: 0,
  },
  txHistoryIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textOnDark,
    marginBottom: 1,
  },
  txHistorySubtitle: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  txHistoryAmount: {
    fontSize: 9,
    fontWeight: "600",
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

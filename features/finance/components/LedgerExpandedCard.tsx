/**
 * Expanded card for a Ledger row in the Treasury Financial Summary. Shows ledger details,
 * associated trip, trip statement (Sale/Received/Due etc.), and associated transactions.
 * Transaction list styled like Google Pay / PhonePe history.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
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
  /**
   * Desktop web three-column layout (Ledger | Trip | Settlement/history).
   * Use only in party-detail transaction contexts — main Finance cash/ledger row expand stays stacked.
   */
  enableDesktopThreeColumn?: boolean;
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
  enableDesktopThreeColumn = false,
}: LedgerExpandedCardProps) {
  const { width: windowWidth } = useWindowDimensions();
  const useDesktopThreeColumnLayout =
    Platform.OS === "web" &&
    windowWidth >= 1024 &&
    enableDesktopThreeColumn;

  const showSummaryBar =
    showReceivablesRow || showPayablesRow || showDriverRow || showVehicleRow || hasSameTx;

  /** Intrinsic heights for desktop row — row height follows content (trip-led), not a fixed min. */
  const [desktopTripIntrinsicHeight, setDesktopTripIntrinsicHeight] = useState(0);
  const [desktopLedgerIntrinsicHeight, setDesktopLedgerIntrinsicHeight] = useState(0);

  useEffect(() => {
    setDesktopTripIntrinsicHeight(0);
    setDesktopLedgerIntrinsicHeight(0);
  }, [
    useDesktopThreeColumnLayout,
    hasMergedDetails,
    hasTripDetail,
    tripNumber,
    tripDateStr,
    routeStr,
    clientStr,
    truckStr,
    driverStr,
    tripSaleValue,
    tripSupplierCost,
    formattedDate,
    note,
    paymentMode,
    paymentReference,
    paymentIn,
    paymentOut,
    showSummaryBar,
    hasSameTx,
    sameTx.length,
    receivedSum,
    paidSum,
    showReceivablesRow,
    showPayablesRow,
  ]);
  const hasNote = (note ?? "").trim() !== "";
  const showAmountReceived = paymentIn > 0;
  const showAmountPaid = paymentOut > 0;
  const hasTruckStr = ((truckStr ?? "").trim()) !== "";
  const hasDriverStr = ((driverStr ?? "").trim()) !== "";
  const showTruckDriverRow = hasTruckStr || hasDriverStr;
  const marginValue = tripSaleValue - tripSupplierCost;
  const marginPct =
    tripSaleValue > 0 ? ((tripSaleValue - tripSupplierCost) / tripSaleValue) * 100 : 0;

  const ledgerDetailsBody = (
    <>
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
      {hasNote ? (
        <View style={styles.detailNoteRow}>
          <Text style={styles.detailLabel}>Note</Text>
          <Text
            style={[styles.detailValue, styles.detailNoteValue]}
            numberOfLines={useDesktopThreeColumnLayout ? 4 : 2}
          >
            {note}
          </Text>
        </View>
      ) : null}
    </>
  );

  const tripFieldsBody = (
    <>
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
    </>
  );

  const summaryBarMetricsOnly = (
    <>
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
    </>
  );

  const txHistoryRowsEl = (
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
  );

  const summaryBarInner = (
    <>
      {summaryBarMetricsOnly}
      {hasSameTx ? (
        <>
          <Text style={styles.summaryBarTxTitle}>Transaction History</Text>
          {txHistoryRowsEl}
        </>
      ) : null}
    </>
  );

  const downloadBtnEl =
    onDownloadPress != null ? (
      <TouchableOpacity
        style={[
          styles.downloadBtn,
          useDesktopThreeColumnLayout && styles.downloadBtnDesktop,
        ]}
        onPress={onDownloadPress}
        activeOpacity={0.8}
      >
        <FontAwesome name="download" size={12} color={Theme.primary} />
        <Text style={styles.downloadBtnText}>Download Trip Protocol</Text>
      </TouchableOpacity>
    ) : null;

  if (useDesktopThreeColumnLayout) {
    /** Third column needs at least summary chrome (or placeholder); tx list scrolls inside remainder. */
    const desktopTxStripMinHeight = showSummaryBar ? 156 : 44;
    const desktopRowHeight =
      desktopTripIntrinsicHeight > 0 || (hasMergedDetails && desktopLedgerIntrinsicHeight > 0)
        ? Math.max(
            desktopTripIntrinsicHeight,
            hasMergedDetails ? desktopLedgerIntrinsicHeight : 0,
            desktopTxStripMinHeight,
          )
        : undefined;

    const desktopSummaryPanel = showSummaryBar ? (
      <View style={[styles.summaryBar, styles.summaryBarDesktopColumn]}>
        {summaryBarMetricsOnly}
        {hasSameTx ? (
          <>
            <Text style={[styles.summaryBarTxTitle, styles.summaryBarTxTitleDesktop]}>Transaction History</Text>
            <ScrollView
              style={styles.desktopTxHistoryScroll}
              contentContainerStyle={styles.desktopTxHistoryScrollContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {txHistoryRowsEl}
            </ScrollView>
          </>
        ) : null}
      </View>
    ) : (
      <View style={styles.desktopRelatedTxPlaceholder} />
    );

    return (
      <View style={styles.detailOuter}>
        <View style={styles.detailCard}>
          <View
            style={[
              styles.desktopExpandRow,
              desktopRowHeight != null ? { height: desktopRowHeight } : null,
            ]}
          >
            {hasMergedDetails ? (
              <View style={[styles.desktopExpandCol, styles.desktopExpandColDivider]}>
                <View style={styles.desktopExpandColInner}>
                  <View
                    style={styles.desktopIntrinsicMeasureWrap}
                    onLayout={(e) => {
                      const h = Math.round(e.nativeEvent.layout.height);
                      if (h > 0) {
                        setDesktopLedgerIntrinsicHeight(h);
                      }
                    }}
                  >
                    <View style={styles.detailBlock}>
                      <View style={styles.detailBlockHeader}>
                        <Text style={styles.detailBlockHeaderText}>Ledger Details</Text>
                      </View>
                      <View style={[styles.detailBlockContent, styles.desktopExpandDetailContentNatural]}>
                        {ledgerDetailsBody}
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            ) : null}

            <View style={[styles.desktopExpandCol, styles.desktopExpandColDivider]}>
              <View style={styles.desktopExpandColInner}>
                <View
                  style={styles.desktopIntrinsicMeasureWrap}
                  onLayout={(e) => {
                    const h = Math.round(e.nativeEvent.layout.height);
                    if (h > 0) {
                      setDesktopTripIntrinsicHeight(h);
                    }
                  }}
                >
                  <View style={styles.detailBlock}>
                    <View style={styles.detailBlockHeader}>
                      <Text style={styles.detailBlockHeaderText}>Associated Trip</Text>
                    </View>
                    <View style={[styles.detailBlockContent, styles.desktopExpandDetailContentNatural]}>
                      {tripFieldsBody}
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.desktopExpandCol}>
              <View style={styles.desktopRelatedTxCol}>{desktopSummaryPanel}</View>
            </View>
          </View>
          {downloadBtnEl}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.detailOuter}>
      <View style={styles.detailCard}>
        {/* Ledger Details — reference: black header + 2-col grid (Type|Aging, Entry Date|Amount Sync), Note */}
        {hasMergedDetails ? (
          <View style={styles.detailBlock}>
            <View style={styles.detailBlockHeader}>
              <Text style={styles.detailBlockHeaderText}>Ledger Details</Text>
            </View>
            <View style={styles.detailBlockContent}>{ledgerDetailsBody}</View>
          </View>
        ) : null}

        {/* Associated Trip — stacked summary + tx under trip on mobile */}
        <View style={[styles.detailBlock, hasMergedDetails && styles.detailBlockSpacer]}>
          <View style={styles.detailBlockHeader}>
            <Text style={styles.detailBlockHeaderText}>Associated Trip</Text>
          </View>
          <View style={styles.detailBlockContent}>
            {tripFieldsBody}

            {/* Summary status bar — dark bg, Sale | Received | Due, divider, Transaction History list */}
            {showSummaryBar ? (
              <View style={styles.summaryBar}>{summaryBarInner}</View>
            ) : null}

            {downloadBtnEl}
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
  /** Web desktop: ledger | trip fields | settlement — row height follows measured trip/ledger content */
  desktopExpandRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  desktopExpandCol: {
    flex: 1,
    minWidth: 0,
  },
  desktopExpandColDivider: {
    borderRightWidth: StyleSheet.hairlineWidth * 2,
    borderRightColor: Theme.borderLight,
  },
  desktopExpandColInner: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "flex-start",
    minHeight: 0,
  },
  /** Wrap header+body so onLayout reflects intrinsic height (not stretched empty space). */
  desktopIntrinsicMeasureWrap: {
    alignSelf: "flex-start",
    width: "100%",
  },
  desktopExpandDetailContentNatural: {
    paddingBottom: 12,
  },
  desktopRelatedTxCol: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "flex-start",
    minWidth: 0,
    minHeight: 0,
  },
  summaryBarDesktopColumn: {
    flex: 1,
    flexDirection: "column",
    marginTop: 0,
    width: "100%",
    minHeight: 0,
    borderRadius: 0,
    borderWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  summaryBarTxTitleDesktop: {
    flexShrink: 0,
  },
  desktopTxHistoryScroll: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  desktopTxHistoryScrollContent: {
    paddingBottom: 4,
  },
  desktopRelatedTxPlaceholder: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    minHeight: 44,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "rgba(10,10,11,0.04)",
  },
  downloadBtnDesktop: {
    marginHorizontal: 0,
    marginBottom: 0,
    marginTop: 0,
    borderRadius: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
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

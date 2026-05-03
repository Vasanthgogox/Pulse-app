/**
 * Trip P&L Statement — statement-style UI aligned with Monthly Salary Statement:
 * Title + period/subtitle, summary strip (REVENUE | EXPENSE | NET), REVENUE & EXPENSES section,
 * bold totals with green/red, LEDGER ENTRIES table with empty state.
 */
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatINR, formatLedgerDate } from "@/lib/format";
import { getTripDisplayNumber, type TripRow } from "@/features/trips";
import {
    getExpenseGroupedForTrip,
    getExpenseLinesForTripPnL,
} from "@/features/vehicles/pnl";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMemo } from "react";
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LedgerRow } from "../services/finance.service";

const MONTH_LABELS: Record<string, string> = {
  "01": "JAN",
  "02": "FEB",
  "03": "MAR",
  "04": "APR",
  "05": "MAY",
  "06": "JUN",
  "07": "JUL",
  "08": "AUG",
  "09": "SEP",
  "10": "OCT",
  "11": "NOV",
  "12": "DEC",
};

function formatStatementPeriod(
  pickupDate: string | null,
  createdAt: string | null,
): string {
  const raw = (pickupDate ?? createdAt ?? "").slice(0, 10);
  if (!raw) return "";
  const [y, m] = raw.split("-");
  return m && y ? `${MONTH_LABELS[m] ?? m} ${y}` : raw;
}

export interface TripPnLDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  trip: TripRow | null;
  transactions: LedgerRow[] | null;
}

export function TripPnLDetailSheet({
  visible,
  onClose,
  trip,
  transactions,
}: TripPnLDetailSheetProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const tripLedgerEntries = useMemo(() => {
    return getTripLedgerEntries(
      transactions,
      trip?.id,
      trip ? getTripDisplayNumber(trip) : undefined,
    );
  }, [transactions, trip]);
  const grouped = useMemo(() => {
    if (!trip) return null;
    return getExpenseGroupedForTrip(trip, tripLedgerEntries);
  }, [trip, tripLedgerEntries]);

  const revenueLines = useMemo(() => {
    const sales = trip ? Number(trip.client_price ?? 0) : 0;
    return [{ label: "Client Billing", amount: sales }];
  }, [trip]);

  const expenseLines = useMemo(() => {
    if (!trip) return [];
    return getExpenseLinesForTripPnL(trip, tripLedgerEntries);
  }, [trip, tripLedgerEntries]);

  const sales = trip ? Number(trip.client_price ?? 0) : 0;
  const totalExpense = grouped?.total ?? 0;
  const net = sales - totalExpense;
  const margin = sales > 0 ? (net / sales) * 100 : totalExpense > 0 ? -100 : 0;
  const statusLabel =
    net > 0 ? "Profitable" : net < 0 ? "Loss Making" : "Break Even";

  if (!trip) return null;

  const missionId = getTripDisplayNumber(trip);
  const clientName = trip.client_name ?? "—";
  const route = `${trip.pickup_area ?? "—"} → ${trip.drop_location ?? "—"}`;
  const periodLabel = formatStatementPeriod(trip.pickup_date, trip.created_at);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.sheet}>
          {/* Header: close + title + period + summary strip + status */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={8}
              accessibilityLabel="Close"
            >
              <FontAwesome
                name="chevron-down"
                size={18}
                color={Theme.textOnDark}
              />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerSubtitle}>TRIP P&L STATEMENT</Text>
              <Text style={styles.headerTitle}>{missionId}</Text>
              {periodLabel ? (
                <Text style={styles.headerPeriod}>{periodLabel}</Text>
              ) : null}
            </View>
            <View
              style={[
                styles.statusBadge,
                net > 0 && styles.statusProfit,
                net < 0 && styles.statusLoss,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  net > 0 && styles.statusProfitText,
                  net < 0 && styles.statusLossText,
                ]}
              >
                {statusLabel}
              </Text>
            </View>
          </View>

          {/* Summary strip: REVENUE | EXPENSE | NET (like FIXED | COMM. | PAID) */}
          <View style={styles.summaryStrip}>
            <View style={[styles.summaryCell, styles.summaryCellBorder]}>
              <Text style={styles.summaryLabel}>REVENUE</Text>
              <Text style={styles.summaryValue}>{formatINR(sales)}</Text>
            </View>
            <View style={[styles.summaryCell, styles.summaryCellBorder]}>
              <Text style={styles.summaryLabel}>EXPENSE</Text>
              <Text style={styles.summaryValue}>{formatINR(totalExpense)}</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>NET</Text>
              <Text
                style={[
                  styles.summaryValue,
                  net > 0
                    ? styles.summaryValueGreen
                    : net < 0
                      ? styles.summaryValueRed
                      : undefined,
                ]}
              >
                {formatINR(net)}
              </Text>
            </View>
          </View>

          {/* Client + Route cards */}
          <View style={styles.metaRow}>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Client</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                {clientName}
              </Text>
            </View>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Route</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                {route}
              </Text>
            </View>
          </View>

          {/* Statement content — white card */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: 24 + insets.bottom },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.statementCard}>
              {/* REVENUE & EXPENSES (like Earnings & balance) */}
              <Text style={styles.sectionTitle}>REVENUE & EXPENSES</Text>
              <View style={styles.earningsBlock}>
                {revenueLines.map((line, i) => (
                  <View key={`rev-${i}`} style={styles.earningsRow}>
                    <Text style={styles.earningsLabel} numberOfLines={1}>
                      {line.label}
                    </Text>
                    <Text style={styles.earningsValue} numberOfLines={1}>
                      {formatINR(line.amount)}
                    </Text>
                  </View>
                ))}
                <View style={[styles.earningsRow, styles.earningsRowTotal]}>
                  <Text style={styles.earningsLabelBold}>Total Revenue</Text>
                  <Text style={[styles.earningsValueBold, styles.valueGreen]}>
                    {formatINR(sales)}
                  </Text>
                </View>
                {expenseLines.map((line, i) => (
                  <View key={`exp-${i}`} style={styles.earningsRow}>
                    <Text style={styles.earningsLabel} numberOfLines={1}>
                      {line.label}
                    </Text>
                    <Text style={styles.earningsValue} numberOfLines={1}>
                      {formatINR(line.amount)}
                    </Text>
                  </View>
                ))}
                <View style={[styles.earningsRow, styles.earningsRowTotal]}>
                  <Text style={styles.earningsLabelBold}>Total Expenses</Text>
                  <Text style={[styles.earningsValueBold, styles.valueRed]}>
                    {formatINR(totalExpense)}
                  </Text>
                </View>
                <View style={[styles.earningsRow, styles.earningsRowBalance]}>
                  <Text style={styles.earningsLabelBold}>
                    Net Profit / Loss
                  </Text>
                  <Text
                    style={[
                      styles.earningsValueBold,
                      net > 0
                        ? styles.valueGreen
                        : net < 0
                          ? styles.valueRed
                          : undefined,
                    ]}
                  >
                    {net > 0 ? "+" : ""}
                    {formatINR(net)}
                  </Text>
                </View>
                <View style={styles.earningsRow}>
                  <Text style={styles.earningsLabel}>Margin</Text>
                  <Text
                    style={[
                      styles.earningsValue,
                      net > 0
                        ? styles.valueGreen
                        : net < 0
                          ? styles.valueRed
                          : undefined,
                    ]}
                  >
                    {margin > 0 ? "+" : ""}
                    {margin.toFixed(1)}%
                  </Text>
                </View>
              </View>

              {/* LEDGER ENTRIES (like Payments) */}
              <Text style={styles.sectionTitle}>
                LEDGER ENTRIES ({tripLedgerEntries.length})
              </Text>
              <View style={styles.ledgerHeaderRow}>
                <Text style={styles.ledgerHeaderCell}>DESC / DATE</Text>
                <Text
                  style={[styles.ledgerHeaderCell, styles.ledgerHeaderRight]}
                >
                  IN
                </Text>
                <Text
                  style={[
                    styles.ledgerHeaderCell,
                    styles.ledgerHeaderRightLast,
                  ]}
                >
                  OUT
                </Text>
              </View>
              {tripLedgerEntries.length === 0 ? (
                <Text style={styles.ledgerEmpty}>
                  {t("noLedgerEntriesForTrip")}
                </Text>
              ) : (
                tripLedgerEntries.map((tx) => {
                  const inAmt = Number(tx.amount_in ?? 0);
                  const outAmt = Number(tx.amount_out ?? 0);
                  const date = formatLedgerDate(
                    tx.transaction_date ?? tx.created_at ?? "",
                  );
                  return (
                    <View key={tx.id} style={styles.ledgerRow}>
                      <View style={styles.ledgerCellWide}>
                        <Text style={styles.ledgerDesc} numberOfLines={1}>
                          {tx.description || "ENTRY"}
                        </Text>
                        <Text style={styles.ledgerDate}>{date}</Text>
                      </View>
                      <Text
                        style={[
                          styles.ledgerCell,
                          styles.ledgerRight,
                          inAmt > 0 ? styles.valueGreen : styles.ledgerMuted,
                        ]}
                      >
                        {inAmt > 0 ? formatINR(inAmt) : "—"}
                      </Text>
                      <Text
                        style={[
                          styles.ledgerCell,
                          styles.ledgerRightLast,
                          outAmt > 0 ? styles.valueRed : styles.ledgerMuted,
                        ]}
                      >
                        {outAmt > 0 ? formatINR(outAmt) : "—"}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.darkBackground,
  },
  sheet: {
    flex: 1,
    backgroundColor: Theme.darkBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerSubtitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
    marginTop: 4,
  },
  headerPeriod: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  statusProfit: {
    backgroundColor: "rgba(21,128,61,0.18)",
    borderColor: Theme.darkGreen,
  },
  statusLoss: {
    backgroundColor: "rgba(232,33,39,0.18)",
    borderColor: Theme.teslaRed,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.3,
  },
  statusProfitText: { color: Theme.darkGreen },
  statusLossText: { color: Theme.teslaRed },
  summaryStrip: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  summaryCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  summaryCellBorder: {
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.08)",
  },
  summaryLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnDark,
  },
  summaryValueGreen: { color: Theme.darkGreen },
  summaryValueRed: { color: Theme.teslaRed },
  metaRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  metaCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  scroll: {
    flex: 1,
    backgroundColor: Theme.surfaceLight,
  },
  scrollContent: { padding: 20, paddingBottom: 36 },
  statementCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  earningsBlock: {
    marginBottom: 24,
  },
  earningsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  earningsRowTotal: {
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingBottom: 8,
  },
  earningsRowBalance: {
    backgroundColor: Theme.surfaceGray,
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: 8,
    borderBottomWidth: 0,
  },
  earningsLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimary,
    flex: 1,
  },
  earningsValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    minWidth: 80,
  },
  earningsLabelBold: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flex: 1,
  },
  earningsValueBold: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    minWidth: 80,
  },
  valueGreen: { color: Theme.darkGreen },
  valueRed: { color: Theme.teslaRed },
  ledgerHeaderRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    marginBottom: 4,
  },
  ledgerHeaderCell: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.6,
  },
  ledgerHeaderRight: {
    width: 72,
    textAlign: "right",
  },
  ledgerHeaderRightLast: {
    width: 72,
    textAlign: "right",
  },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  ledgerCellWide: {
    flex: 1,
    minWidth: 0,
  },
  ledgerDesc: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  ledgerDate: {
    fontSize: 10,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  ledgerCell: {
    fontSize: 11,
    fontWeight: "600",
    width: 72,
    textAlign: "right",
  },
  ledgerRight: {},
  ledgerRightLast: {},
  ledgerMuted: {
    color: Theme.textMuted,
  },
  ledgerEmpty: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
    paddingVertical: 20,
    textAlign: "center",
  },
});

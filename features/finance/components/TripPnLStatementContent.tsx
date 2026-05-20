/**
 * Trip P&L Statement content — shared by TripLedgerDetailScreen and TripPnLDetailSheet.
 * O(n): one filter for trip entries, one getExpenseGroupedForTrip pass.
 */
import Theme from "@/constants/Theme";
import { getTripDisplayNumber, type TripRow } from "@/features/trips/services/trips.service";
import { formatINR, formatLedgerDate } from "@/lib/format";
import {
  getExpenseGroupedForTrip,
  type TripExpenseGrouped,
} from "@/features/vehicles/pnl";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { LedgerRow } from "../services/finance.service";

const MONTH_LABELS: Record<string, string> = {
  "01": "JAN", "02": "FEB", "03": "MAR", "04": "APR", "05": "MAY", "06": "JUN",
  "07": "JUL", "08": "AUG", "09": "SEP", "10": "OCT", "11": "NOV", "12": "DEC",
};

/** Trip period for meta: "MAR 2026" from pickup_date or created_at. */
function formatTripPeriod(trip: TripRow): string {
  const raw = (trip.pickup_date ?? trip.created_at ?? "").slice(0, 10);
  if (!raw) return "";
  const [y, m] = raw.split("-");
  return m && y ? `${MONTH_LABELS[m] ?? m} ${y}` : "";
}

/** Sort ledger entries by date descending (newest first). */
function sortLedgerByDate(entries: LedgerRow[]): LedgerRow[] {
  return [...entries].sort((a, b) => {
    const da = a.transaction_date ?? a.created_at ?? "";
    const db = b.transaction_date ?? b.created_at ?? "";
    return db.localeCompare(da);
  });
}

function expenseLinesFromGrouped(
  g: TripExpenseGrouped,
  trip: TripRow | null
): Array<{ label: string; amount: number }> {
  const lines: Array<{ label: string; amount: number }> = [];
  if (trip != null && trip.supplier_id != null)
    lines.push({ label: "Supplier Rate (Base Freight)", amount: g.supplier });
  if (g.fuel > 0) lines.push({ label: "Fuel", amount: g.fuel });
  if (g.toll > 0) lines.push({ label: "Tolls / Fastag", amount: g.toll });
  if (g.driver > 0)
    lines.push({ label: "Trip-based commission", amount: g.driver });
  for (let i = 0; i < g.other.length; i++)
    lines.push({ label: g.other[i].label, amount: g.other[i].amount });
  return lines;
}

export interface TripPnLStatementContentProps {
  trip: TripRow;
  transactions: LedgerRow[] | null;
  showMeta?: boolean;
  variant?: "card" | "inline";
  onRecordPayment?: () => void;
  onAddExpense?: () => void;
}

function useTripPnLData(trip: TripRow | null, transactions: LedgerRow[] | null) {
  return useMemo(() => {
    if (!trip) return null;
    const tripLedgerEntries = getTripLedgerEntries(
      transactions,
      trip.id,
      getTripDisplayNumber(trip),
    );
    const grouped = getExpenseGroupedForTrip(trip, tripLedgerEntries);
    const expenseLines = expenseLinesFromGrouped(grouped, trip);
    const sales = Number(trip.client_price ?? 0);
    const totalExpense = grouped.total;
    const net = sales - totalExpense;
    const margin =
      sales > 0 ? (net / sales) * 100 : totalExpense > 0 ? -100 : 0;
    const revenueLines = [{ label: "Client Billing", amount: sales }];
    return {
      tripLedgerEntries,
      revenueLines,
      expenseLines,
      sales,
      totalExpense,
      net,
      margin,
    };
  }, [trip, trip?.id, trip?.trip_number, trip?.display_trip_id, transactions]);
}

export function TripPnLStatementContent({
  trip,
  transactions,
  showMeta = true,
  variant = "inline",
  onRecordPayment,
  onAddExpense,
}: TripPnLStatementContentProps) {
  const data = useTripPnLData(trip, transactions);
  if (!data) return null;

  const {
    tripLedgerEntries,
    revenueLines,
    expenseLines,
    sales,
    totalExpense,
    net,
    margin,
  } = data;

  const clientName = trip.client_name ?? "—";
  const route = `${trip.pickup_area ?? "—"} → ${trip.drop_location ?? "—"}`;
  const periodLabel = formatTripPeriod(trip);
  const statusLabel =
    net > 0 ? "Profitable" : net < 0 ? "Loss Making" : "Break Even";
  const sortedLedger = sortLedgerByDate(tripLedgerEntries);
  const ledgerTotalIn = tripLedgerEntries.reduce(
    (s, tx) => s + Number(tx.amount_in ?? 0),
    0
  );
  const ledgerTotalOut = tripLedgerEntries.reduce(
    (s, tx) => s + Number(tx.amount_out ?? 0),
    0
  );

  const content = (
    <>
      {showMeta && (
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
          {periodLabel ? (
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Period</Text>
              <Text style={styles.metaValue}>{periodLabel}</Text>
            </View>
          ) : null}
        </View>
      )}

      <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>
        Revenue (Sales)
      </Text>
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
      </View>

      <Text style={styles.sectionTitle}>Cost of Goods (Expenses)</Text>
      <View style={styles.earningsBlock}>
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
          <View style={styles.netRowLeft}>
            <Text style={styles.earningsLabelBold}>Net Profit / Loss</Text>
            <View
              style={[
                styles.statusPill,
                net > 0 && styles.statusPillProfit,
                net < 0 && styles.statusPillLoss,
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  net > 0 && styles.statusPillTextProfit,
                  net < 0 && styles.statusPillTextLoss,
                ]}
              >
                {statusLabel}
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.earningsValueBold,
              net > 0 ? styles.valueGreen : net < 0 ? styles.valueRed : undefined,
            ]}
            accessibilityLabel={`Net ${statusLabel.toLowerCase()}, ${net > 0 ? "" : "minus "}${formatINR(Math.abs(net))}`}
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
              net > 0 ? styles.valueGreen : net < 0 ? styles.valueRed : undefined,
            ]}
          >
            {margin > 0 ? "+" : ""}
            {margin.toFixed(1)}%
          </Text>
        </View>
      </View>

      <View style={styles.ledgerSectionWrap}>
        <Text style={styles.sectionTitle}>
          LEDGER ENTRIES ({tripLedgerEntries.length})
        </Text>
        <View style={styles.ledgerHeaderRow}>
          <Text style={[styles.ledgerHeaderCell, styles.ledgerHeaderCellWide]}>
            DESC / DATE
          </Text>
          <Text style={[styles.ledgerHeaderCell, styles.ledgerHeaderRight]}>
            IN
          </Text>
          <Text style={[styles.ledgerHeaderCell, styles.ledgerHeaderRightLast]}>
            OUT
          </Text>
        </View>
        {sortedLedger.length === 0 ? (
          <View style={styles.ledgerEmptyWrap}>
            <Text style={styles.ledgerEmpty}>
              No ledger entries for this trip.
            </Text>
            {(onRecordPayment ?? onAddExpense) && (
              <Text style={styles.ledgerEmptyHint}>
                Record payment or add expense to see entries here.
              </Text>
            )}
          </View>
        ) : (
          <>
            {sortedLedger.map((tx, idx) => {
              const inAmt = Number(tx.amount_in ?? 0);
              const outAmt = Number(tx.amount_out ?? 0);
              const date = formatLedgerDate(
                tx.transaction_date ?? tx.created_at ?? ""
              );
              const party = (tx.party_name ?? "").trim() || "—";
              return (
                <View
                  key={tx.id}
                  style={[
                    styles.ledgerRow,
                    idx % 2 === 1 && styles.ledgerRowAlt,
                  ]}
                >
                  <View style={styles.ledgerCellWide}>
                    <Text style={styles.ledgerDesc} numberOfLines={1}>
                      {tx.description || "ENTRY"}
                    </Text>
                    <Text style={styles.ledgerDate} numberOfLines={1}>
                      {party} · {date}
                    </Text>
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
            })}
            <View style={[styles.ledgerRow, styles.ledgerRowTotal]}>
              <View style={styles.ledgerCellWide}>
                <Text style={styles.ledgerTotalLabel}>Total</Text>
              </View>
              <Text
                style={[styles.ledgerCell, styles.ledgerRight, styles.valueGreen]}
              >
                {ledgerTotalIn > 0 ? formatINR(ledgerTotalIn) : "—"}
              </Text>
              <Text
                style={[
                  styles.ledgerCell,
                  styles.ledgerRightLast,
                  styles.valueRed,
                ]}
              >
                {ledgerTotalOut > 0 ? formatINR(ledgerTotalOut) : "—"}
              </Text>
            </View>
          </>
        )}
      </View>

      {(onRecordPayment ?? onAddExpense) && (
        <View style={styles.actionsRow}>
          {onRecordPayment && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={onRecordPayment}
              activeOpacity={0.8}
              accessibilityLabel="Record payment"
              accessibilityRole="button"
            >
              <Text style={styles.actionBtnPrimaryText}>Record Payment</Text>
            </TouchableOpacity>
          )}
          {onAddExpense && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={onAddExpense}
              activeOpacity={0.8}
              accessibilityLabel="Add expense"
              accessibilityRole="button"
            >
              <Text style={styles.actionBtnSecondaryText}>Add Expense</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </>
  );

  if (variant === "card") {
    return <View style={styles.statementCard}>{content}</View>;
  }
  return <View style={styles.inlineWrap}>{content}</View>;
}

export function useTripPnLSummary(
  trip: TripRow | null,
  transactions: LedgerRow[] | null
) {
  const data = useTripPnLData(trip, transactions);
  if (!data)
    return { sales: 0, totalExpense: 0, net: 0, pending: 0 };
  const received = data.tripLedgerEntries.reduce(
    (s, tx) => s + Number(tx.amount_in ?? 0),
    0
  );
  const pending = Math.max(0, data.sales - received);
  return {
    sales: data.sales,
    totalExpense: data.totalExpense,
    net: data.net,
    pending,
  };
}

/** Typography & spacing aligned with EntityDetailOverlay driver STATEMENT (MONTHLY SALARY STATEMENT, Earnings & balance, TRIPS, PAYMENTS). */
const styles = StyleSheet.create({
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  metaCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: Theme.surfaceLight,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  metaLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 2,
    marginBottom: 4,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  sectionTitleFirst: { marginTop: 4 },
  earningsBlock: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: Theme.screenBackground,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  earningsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  earningsRowTotal: {
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    marginTop: 4,
    paddingTop: 8,
  },
  earningsRowBalance: {
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    marginTop: 2,
    paddingTop: 6,
    backgroundColor: Theme.surfaceGray,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  netRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  statusPillProfit: {
    backgroundColor: "rgba(21,128,61,0.08)",
    borderColor: Theme.darkGreen,
  },
  statusPillLoss: {
    backgroundColor: "rgba(232,33,39,0.08)",
    borderColor: Theme.teslaRed,
  },
  statusPillText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statusPillTextProfit: { color: Theme.darkGreen },
  statusPillTextLoss: { color: Theme.teslaRed },
  earningsLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    flex: 1,
  },
  earningsValue: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    minWidth: 72,
  },
  earningsLabelBold: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flex: 1,
  },
  earningsValueBold: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    minWidth: 72,
  },
  valueGreen: { color: Theme.darkGreen },
  valueRed: { color: Theme.teslaRed },
  ledgerSectionWrap: { marginTop: 24 },
  ledgerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  ledgerHeaderCell: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ledgerHeaderCellWide: { flex: 1, minWidth: 0 },
  ledgerHeaderRight: {
    width: 56,
    textAlign: "right" as const,
  },
  ledgerHeaderRightLast: {
    width: 56,
    textAlign: "right" as const,
  },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  ledgerRowAlt: { backgroundColor: Theme.surfaceLight },
  ledgerRowTotal: {
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    marginTop: 4,
    paddingTop: 8,
    backgroundColor: Theme.surfaceGray,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  ledgerTotalLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  ledgerCellWide: { flex: 1, minWidth: 0 },
  ledgerDesc: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  ledgerDate: {
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textMuted,
    marginTop: 2,
  },
  ledgerCell: {
    fontSize: 9,
    fontWeight: "500",
    width: 56,
    textAlign: "right",
  },
  ledgerRight: {},
  ledgerRightLast: {},
  ledgerMuted: { color: Theme.textMuted },
  ledgerEmptyWrap: {
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 6,
  },
  ledgerEmpty: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
  },
  ledgerEmptyHint: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    fontStyle: "italic",
    paddingHorizontal: 16,
  },
  statementCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  inlineWrap: {},
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  actionBtn: {
    flex: 1,
    minWidth: 100,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  actionBtnPrimary: { backgroundColor: Theme.primary },
  actionBtnPrimaryText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  actionBtnSecondary: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  actionBtnSecondaryText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.primary,
  },
});

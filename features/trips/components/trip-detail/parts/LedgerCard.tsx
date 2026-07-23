/**
 * Financial ledger card (sale/received/due + expenses + recent transactions).
 * Extracted verbatim from TripDetailScreen.tsx (no behavior change).
 */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, View } from "react-native";

import { Theme } from "@/constants/Theme";
import { formatINR } from "@/lib/format";

import {
  formatLedgerDate,
  ledgerHistoryTitle,
  type FinanceHistoryRow,
} from "./ledgerHistory.util";

export function LedgerCard({
  sales,
  received,
  pending,
  totalExpenses,
  supplierPaid,
  supplierDue,
  financeHistoryRows,
  compact,
}: {
  sales: number;
  received: number;
  pending: number;
  totalExpenses: number;
  supplierPaid: number;
  supplierDue: number;
  financeHistoryRows: FinanceHistoryRow[];
  compact?: boolean;
}) {
  return (
    <View style={ldStyles.card}>
      {/* Header */}
      <View style={ldStyles.header}>
        <View style={ldStyles.headerLeft}>
          <FontAwesome name="book" size={12} color={Theme.primary} />
          <Text style={ldStyles.headerTitle}>FINANCIAL LEDGER</Text>
        </View>
        <View style={ldStyles.syncBadge}>
          <Text style={ldStyles.syncText}>Synced</Text>
        </View>
      </View>

      {/* Sale / Received / Due */}
      <View style={[ldStyles.statRow, compact && { flexWrap: "wrap", gap: 8 }]}>
        <View style={ldStyles.statGroup}>
          <Text style={ldStyles.statLabel} numberOfLines={1}>
            Sale
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[ldStyles.statValue, compact && { fontSize: 13 }]}
          >
            {formatINR(sales)}
          </Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <View style={ldStyles.statLabelRow}>
            <View style={ldStyles.greenDot} />
            <Text
              style={[ldStyles.statLabel, ldStyles.statLabelGreen]}
              numberOfLines={1}
            >
              Received
            </Text>
          </View>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              ldStyles.statValue,
              ldStyles.statValueGreen,
              compact && { fontSize: 13 },
            ]}
          >
            {formatINR(received)}
          </Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <Text style={ldStyles.statLabel} numberOfLines={1}>
            Due
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[ldStyles.statValue, compact && { fontSize: 13 }]}
          >
            {formatINR(pending)}
          </Text>
        </View>
      </View>

      {/* Asset Expenses / Paid / Payable */}
      <View style={[ldStyles.statRow, compact && { flexWrap: "wrap", gap: 8 }]}>
        <View style={ldStyles.statGroup}>
          <Text style={ldStyles.statLabel} numberOfLines={1}>
            Asset Exp.
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[ldStyles.statValue, compact && { fontSize: 13 }]}
          >
            {formatINR(totalExpenses)}
          </Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <Text
            style={[ldStyles.statLabel, ldStyles.statLabelRed]}
            numberOfLines={1}
          >
            Paid
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              ldStyles.statValue,
              ldStyles.statValueRed,
              compact && { fontSize: 13 },
            ]}
          >
            {formatINR(supplierPaid)}
          </Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <Text
            style={[ldStyles.statLabel, ldStyles.statLabelOrange]}
            numberOfLines={1}
          >
            Payable
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              ldStyles.statValue,
              ldStyles.statValueOrange,
              compact && { fontSize: 13 },
            ]}
          >
            {formatINR(supplierDue)}
          </Text>
        </View>
      </View>

      {/* Transactions */}
      <View style={ldStyles.txSection}>
        <View style={ldStyles.txSectionHeader}>
          <Text style={ldStyles.txHeader}>RECENT TRANSACTIONS</Text>
          {financeHistoryRows.length > 0 && (
            <Text style={ldStyles.txViewAll}>View All →</Text>
          )}
        </View>

        {financeHistoryRows.length === 0 ? (
          <Text style={ldStyles.txEmpty}>
            No transactions for this trip yet
          </Text>
        ) : (
          financeHistoryRows.slice(0, 5).map(({ key, tx, isIn, amount }) => (
            <View key={key} style={ldStyles.txRow}>
              <View
                style={[
                  ldStyles.txIcon,
                  isIn ? ldStyles.txIconIn : ldStyles.txIconOut,
                ]}
              >
                <FontAwesome
                  name={isIn ? "arrow-down" : "arrow-up"}
                  size={11}
                  color={isIn ? Theme.positive : Theme.negative}
                />
              </View>
              <View style={ldStyles.txInfo}>
                <Text style={ldStyles.txTitle} numberOfLines={1}>
                  {ledgerHistoryTitle(tx, isIn)}
                </Text>
                <Text style={ldStyles.txMeta} numberOfLines={1}>
                  {formatLedgerDate(tx.transaction_date || tx.created_at)} ·{" "}
                  {tx.party_name?.trim() || "—"}
                </Text>
              </View>
              <Text
                style={[
                  ldStyles.txAmount,
                  isIn ? ldStyles.txAmountIn : ldStyles.txAmountOut,
                ]}
              >
                {isIn ? "+ " : "− "}
                {formatINR(amount)}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const ldStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  syncBadge: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  syncText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "stretch",
    flexShrink: 1,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statGroup: { flex: 1, minWidth: 0, alignItems: "flex-start" },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 6,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.positive,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  statLabelGreen: { color: Theme.positive },
  statLabelRed: { color: Theme.negative },
  statLabelOrange: { color: Theme.warning },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  statValueGreen: { color: Theme.positive },
  statValueRed: { color: Theme.negative },
  statValueOrange: { color: Theme.warning },
  statDivider: {
    width: 1,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 12,
    alignSelf: "stretch",
  },
  txSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  txSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  txHeader: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  txViewAll: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  txEmpty: { fontSize: 13, color: Theme.textSecondary, paddingVertical: 8 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 12,
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  txIconIn: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.borderLight,
  },
  txIconOut: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.borderLight,
  },
  txInfo: { flex: 1, minWidth: 0 },
  txTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  txMeta: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  txAmount: { fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  txAmountIn: { color: Theme.positive },
  txAmountOut: { color: Theme.negative },
});

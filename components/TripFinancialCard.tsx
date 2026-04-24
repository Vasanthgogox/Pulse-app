/**
 * Trip financial snapshot + due CTAs (client receivable; market → supplier; asset → driver + optional expense).
 */
import Theme from "@/constants/Theme";
import type { TripEntryFinancialSnapshot } from "@/features/finance/utils/computeTripEntryFinancials.util";
import { formatINR } from "@/lib/format";
import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type TripFinancialDueTag = "client" | "supplier" | "driver";

export interface TripFinancialCardProps {
  snapshot: TripEntryFinancialSnapshot;
  selectedTag: TripFinancialDueTag | null;
  onDuePress: (tag: TripFinancialDueTag) => void;
  /** Asset trips only — opens vehicle / expense ledger flow when set. */
  onAddExpense?: () => void;
  variant?: "stack" | "side";
  /** Eyebrow above card */
  title?: string;
  /**
   * When set from ledger sync: Cash IN → client/receive only; Cash OUT → payables (+ optional expense).
   * Omit on trip detail to show the full snapshot.
   */
  ledgerFlow?: "in" | "out";
}

function formatNum(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function TripFinancialCard({
  snapshot,
  selectedTag,
  onDuePress,
  onAddExpense,
  variant = "stack",
  title = "Trip financial snapshot",
  ledgerFlow,
}: TripFinancialCardProps) {
  const { trip_type: tripType, financials: f, lines: ln } = snapshot;
  const isSide = variant === "side";

  const unrestricted = ledgerFlow == null;
  const cashIn = ledgerFlow === "in";
  const cashOut = ledgerFlow === "out";

  const clientDue = f.client_receivable > 0;
  const supplierDue = tripType === "market" && f.supplier_payable > 0;
  const driverDue = tripType === "asset" && f.driver_payable > 0;

  const showPayableBreakdown = unrestricted || cashOut;
  const showClientReceiveCta = (unrestricted || cashIn) && clientDue;
  /** Cash OUT: show client receivable as context only — not the same party/direction as supplier payment. */
  const showClientReceiveDisabled = cashOut && clientDue && !unrestricted;
  const showSupplierCta = (unrestricted || cashOut) && supplierDue;
  const showSupplierPayDisabled = cashIn && supplierDue && !unrestricted;
  const showDriverCta = (unrestricted || cashOut) && driverDue;
  const showDriverPayDisabled = cashIn && driverDue && !unrestricted;
  const showAddExpenseCta =
    (unrestricted || cashOut) && tripType === "asset" && Boolean(onAddExpense);

  const hasAnyCta =
    showClientReceiveCta ||
    showClientReceiveDisabled ||
    showSupplierCta ||
    showSupplierPayDisabled ||
    showDriverCta ||
    showDriverPayDisabled ||
    showAddExpenseCta;

  return (
    <View style={[styles.card, isSide && styles.cardSide]}>
      <Text style={styles.eyebrow}>{title}</Text>
      <View style={styles.modePill}>
        <Text style={styles.modePillText}>
          {tripType === "market" ? "Market trip · supplier payout" : "Asset trip · driver & vehicle"}
        </Text>
      </View>
      <Text style={[styles.hint, isSide && styles.hintSide]} numberOfLines={isSide ? 5 : undefined}>
        {hasAnyCta
          ? cashIn
            ? "Tap Receive for client (IN). Gray chips are the other party — tap for why, or switch to OUT."
            : cashOut
              ? "Tap Pay for supplier/driver (OUT). Gray Receive is client (IN only) — tap for why."
              : isSide
                ? "Tap a due amount to open ledger with party prefilled"
                : "Tap a due line to autofill amount, party, and direction"
          : "No pending balances for this trip in your book."}
      </Text>

      <View style={[styles.breakdown, isSide && styles.breakdownSide]}>
        <View style={[styles.bdRow, isSide && styles.bdRowSide]}>
          <Text style={[styles.bdLabel, isSide && styles.bdLabelSide]}>Client</Text>
          <View style={[styles.bdCols, isSide && styles.bdColsSide]}>
            <View style={[styles.bdCell, isSide && styles.bdCellSide]}>
              <Text style={[styles.bdKey, isSide && styles.bdKeySide]}>Sale</Text>
              <Text style={[styles.bdVal, isSide && styles.bdValSide]} numberOfLines={1}>
                ₹{formatNum(ln.client_sale)}
              </Text>
            </View>
            <View style={[styles.bdCell, isSide && styles.bdCellSide]}>
              <Text style={[styles.bdKey, isSide && styles.bdKeySide]}>Received</Text>
              <Text style={[styles.bdVal, isSide && styles.bdValSide]} numberOfLines={1}>
                ₹{formatNum(ln.client_received)}
              </Text>
            </View>
            <View style={[styles.bdCell, isSide && styles.bdCellSide]}>
              <Text style={[styles.bdKey, isSide && styles.bdKeySide]}>Due</Text>
              <Text style={[styles.bdVal, isSide && styles.bdValSide]} numberOfLines={1}>
                ₹{formatNum(ln.client_due)}
              </Text>
            </View>
          </View>
        </View>

        {showPayableBreakdown && tripType === "market" ? (
          <View style={[styles.bdRow, isSide && styles.bdRowSide]}>
            <Text style={[styles.bdLabel, isSide && styles.bdLabelSide]}>Supplier</Text>
            <View style={[styles.bdCols, isSide && styles.bdColsSide]}>
              <View style={[styles.bdCell, isSide && styles.bdCellSide]}>
                <Text style={[styles.bdKey, isSide && styles.bdKeySide]}>Cost</Text>
                <Text style={[styles.bdVal, isSide && styles.bdValSide]} numberOfLines={1}>
                  ₹{formatNum(ln.supplier_cost)}
                </Text>
              </View>
              <View style={[styles.bdCell, isSide && styles.bdCellSide]}>
                <Text style={[styles.bdKey, isSide && styles.bdKeySide]}>Paid</Text>
                <Text style={[styles.bdVal, isSide && styles.bdValSide]} numberOfLines={1}>
                  ₹{formatNum(ln.supplier_paid)}
                </Text>
              </View>
              <View style={[styles.bdCell, isSide && styles.bdCellSide]}>
                <Text style={[styles.bdKey, isSide && styles.bdKeySide]}>Due</Text>
                <Text style={[styles.bdVal, isSide && styles.bdValSide]} numberOfLines={1}>
                  ₹{formatNum(ln.supplier_due)}
                </Text>
              </View>
            </View>
          </View>
        ) : showPayableBreakdown && tripType === "asset" ? (
          <View style={[styles.bdRow, isSide && styles.bdRowSide]}>
            <Text style={[styles.bdLabel, isSide && styles.bdLabelSide]}>Driver</Text>
            <View style={[styles.bdCols, isSide && styles.bdColsSide]}>
              <View style={[styles.bdCell, isSide && styles.bdCellSide]}>
                <Text style={[styles.bdKey, isSide && styles.bdKeySide]}>To pay</Text>
                <Text style={[styles.bdVal, isSide && styles.bdValSide]} numberOfLines={1}>
                  ₹{formatNum(ln.driver_to_pay)}
                </Text>
              </View>
              <View style={[styles.bdCell, isSide && styles.bdCellSide]}>
                <Text style={[styles.bdKey, isSide && styles.bdKeySide]}>Paid</Text>
                <Text style={[styles.bdVal, isSide && styles.bdValSide]} numberOfLines={1}>
                  ₹{formatNum(ln.driver_paid)}
                </Text>
              </View>
              <View style={[styles.bdCell, isSide && styles.bdCellSide]}>
                <Text style={[styles.bdKey, isSide && styles.bdKeySide]}>Due</Text>
                <Text style={[styles.bdVal, isSide && styles.bdValSide]} numberOfLines={1}>
                  ₹{formatNum(ln.driver_due)}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {hasAnyCta ? (
        <>
          <Text style={[styles.recEyebrow, isSide && styles.recEyebrowSide]}>Suggested entry</Text>
          <View style={[styles.tagRow, isSide && styles.tagRowSide]}>
            {showClientReceiveCta ? (
              <TouchableOpacity
                style={[styles.tag, isSide && styles.tagSide, selectedTag === "client" && styles.tagActive]}
                onPress={() => onDuePress("client")}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Receive ${formatINR(f.client_receivable)} from client`}
              >
                <Text style={[styles.tagPrefix, styles.tagPlus]}>+</Text>
                <Text style={[styles.tagLabel, isSide && styles.tagLabelSide, selectedTag === "client" && styles.tagLabelActive]} numberOfLines={2}>
                  Receive {formatINR(f.client_receivable)}
                </Text>
              </TouchableOpacity>
            ) : null}
            {showClientReceiveDisabled ? (
              <TouchableOpacity
                style={[styles.tag, styles.tagDisabled, isSide && styles.tagSide]}
                onPress={() =>
                  Alert.alert(
                    "Different party · Cash IN",
                    "Receiving from the client is a Cash IN entry (client party). You have Cash OUT selected for supplier or driver payment. Switch to IN to record a client receipt, or tap Pay for the supplier.",
                  )
                }
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Receive from client not available in Cash OUT"
              >
                <Text style={[styles.tagPrefix, styles.tagPlusMuted]}>+</Text>
                <Text style={[styles.tagLabel, styles.tagLabelMuted, isSide && styles.tagLabelSide]} numberOfLines={2}>
                  Receive {formatINR(f.client_receivable)}
                </Text>
              </TouchableOpacity>
            ) : null}
            {showSupplierCta ? (
              <TouchableOpacity
                style={[styles.tag, isSide && styles.tagSide, selectedTag === "supplier" && styles.tagActive]}
                onPress={() => onDuePress("supplier")}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Pay supplier ${formatINR(f.supplier_payable)}`}
              >
                <Text style={[styles.tagPrefix, styles.tagMinus]}>−</Text>
                <Text style={[styles.tagLabel, isSide && styles.tagLabelSide, selectedTag === "supplier" && styles.tagLabelActive]} numberOfLines={2}>
                  Pay {formatINR(f.supplier_payable)}
                </Text>
              </TouchableOpacity>
            ) : null}
            {showSupplierPayDisabled ? (
              <TouchableOpacity
                style={[styles.tag, styles.tagDisabled, isSide && styles.tagSide]}
                onPress={() =>
                  Alert.alert(
                    "Different party · Cash OUT",
                    "Paying the supplier is Cash OUT. Switch to OUT to record this payment.",
                  )
                }
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Pay supplier not available in Cash IN"
              >
                <Text style={[styles.tagPrefix, styles.tagMinusMuted]}>−</Text>
                <Text style={[styles.tagLabel, styles.tagLabelMuted, isSide && styles.tagLabelSide]} numberOfLines={2}>
                  Pay {formatINR(f.supplier_payable)}
                </Text>
              </TouchableOpacity>
            ) : null}
            {showDriverCta ? (
              <TouchableOpacity
                style={[styles.tag, isSide && styles.tagSide, selectedTag === "driver" && styles.tagActive]}
                onPress={() => onDuePress("driver")}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Pay driver ${formatINR(f.driver_payable)}`}
              >
                <Text style={[styles.tagPrefix, styles.tagMinus]}>−</Text>
                <Text style={[styles.tagLabel, isSide && styles.tagLabelSide, selectedTag === "driver" && styles.tagLabelActive]} numberOfLines={2}>
                  Pay driver {formatINR(f.driver_payable)}
                </Text>
              </TouchableOpacity>
            ) : null}
            {showDriverPayDisabled ? (
              <TouchableOpacity
                style={[styles.tag, styles.tagDisabled, isSide && styles.tagSide]}
                onPress={() =>
                  Alert.alert(
                    "Different party · Cash OUT",
                    "Paying the driver is Cash OUT. Switch to OUT to record this payment.",
                  )
                }
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Pay driver not available in Cash IN"
              >
                <Text style={[styles.tagPrefix, styles.tagMinusMuted]}>−</Text>
                <Text style={[styles.tagLabel, styles.tagLabelMuted, isSide && styles.tagLabelSide]} numberOfLines={2}>
                  Pay driver {formatINR(f.driver_payable)}
                </Text>
              </TouchableOpacity>
            ) : null}
            {showAddExpenseCta ? (
              <TouchableOpacity
                style={[styles.tag, styles.tagExpense, isSide && styles.tagSide]}
                onPress={onAddExpense}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Add vehicle expense"
              >
                <Text style={[styles.tagLabel, isSide && styles.tagLabelSide]} numberOfLines={2}>
                  + Add expense
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "rgba(15,23,42,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cardSide: {
    marginTop: 0,
    flex: 1,
    minHeight: 120,
  },
  modePill: {
    alignSelf: "flex-start",
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(129,140,248,0.2)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.45)",
  },
  modePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#c7d2fe",
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "900",
    color: "#a5b4fc",
    textTransform: "uppercase",
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  hint: {
    fontSize: 11,
    color: Theme.textOnDarkMuted,
    marginBottom: 12,
  },
  hintSide: {
    fontSize: 10,
    marginBottom: 10,
  },
  breakdown: {
    marginBottom: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 10,
  },
  breakdownSide: {
    marginBottom: 10,
    paddingTop: 8,
    gap: 6,
  },
  bdRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bdRowSide: {
    flexDirection: "column",
    gap: 4,
  },
  bdLabel: {
    width: 72,
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    paddingTop: 2,
  },
  bdLabelSide: {
    width: "100%",
    paddingTop: 0,
    marginBottom: 2,
  },
  /** One horizontal row of three metrics (no wrap). */
  bdCols: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 8,
    minWidth: 0,
  },
  bdColsSide: {
    gap: 4,
    width: "100%",
  },
  bdCell: {
    flex: 1,
    minWidth: 0,
  },
  bdCellSide: {
    flex: 1,
    minWidth: 0,
  },
  bdKey: {
    fontSize: 9,
    fontWeight: "700",
    color: "rgba(226,232,240,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  bdKeySide: {
    fontSize: 7,
    letterSpacing: 0.35,
    marginBottom: 1,
  },
  bdVal: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  bdValSide: {
    fontSize: 9,
    fontWeight: "800",
  },
  recEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    color: "#fde68a",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  recEyebrowSide: {
    marginBottom: 6,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagRowSide: {
    flexDirection: "column",
    flexWrap: "nowrap",
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 4,
    maxWidth: "100%",
  },
  tagExpense: {
    borderColor: "rgba(250,204,21,0.35)",
    backgroundColor: "rgba(250,204,21,0.12)",
  },
  tagSide: {
    alignSelf: "stretch",
    borderRadius: 14,
    flexWrap: "nowrap",
  },
  tagActive: {
    borderColor: "#818cf8",
    backgroundColor: "rgba(129,140,248,0.2)",
  },
  tagPrefix: {
    fontSize: 14,
    fontWeight: "900",
    marginRight: 2,
  },
  tagPlus: { color: "#4ade80" },
  tagMinus: { color: "#fb7185" },
  tagLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    flexShrink: 1,
    minWidth: 0,
  },
  tagLabelSide: {
    flex: 1,
    maxWidth: "100%",
  },
  tagLabelActive: {
    color: Theme.textOnDark,
  },
  tagDisabled: {
    opacity: 0.5,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  tagLabelMuted: {
    color: "rgba(226,232,240,0.42)",
  },
  tagPlusMuted: { color: "rgba(74,222,128,0.42)" },
  tagMinusMuted: { color: "rgba(251,113,133,0.42)" },
});

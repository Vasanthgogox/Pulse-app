/**
 * Trip detail — Finance tab: Revenue/Due summary, Net P&L, optional adjustments, commit ledger, and ledger entries for this trip.
 * Single read: trip; commit uses finance (one write). Fetches transactions for this trip to show entries. Theme only.
 */
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import {
    createLedgerEntry,
    getTransactionsByOrganization,
    type LedgerRow,
} from "@/features/finance/services/finance.service";
import { formatINR } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { getTripDisplayNumber, type TripRow } from "../services/trips.service";

export interface TripFinanceBlockProps {
  trip: TripRow;
  organizationId: string | null;
  onCommitted?: () => void;
  /** When provided, show "Record cash in" button (opens add-entry with trip + client locked). */
  onRecordCashIn?: (trip: TripRow) => void;
  /** When provided, show "Add expense" button (opens add-entry with trip pre-selected, type OUT). */
  onAddExpense?: (trip: TripRow) => void;
  refreshKey?: number;
  contentContainerPaddingBottom?: number;
}

type AdjustmentType = "plus" | "minus";

interface Adjustment {
  type: AdjustmentType;
  amount?: string;
  reason?: string;
}

export function TripFinanceBlock({
  trip,
  organizationId,
  onCommitted,
  onRecordCashIn,
  onAddExpense,
  refreshKey = 0,
  contentContainerPaddingBottom = 24,
}: TripFinanceBlockProps) {
  const { t } = useLanguage();
  const [baseSaleValue, setBaseSaleValue] = useState("");
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [committing, setCommitting] = useState(false);
  const [tripTransactions, setTripTransactions] = useState<LedgerRow[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const lastLoadedKeyRef = useRef<string | null>(null);

  const loadEntries = useCallback(() => {
    if (!organizationId) {
      setEntriesLoading(false);
      lastLoadedKeyRef.current = null;
      return;
    }
    const loadKey = `${organizationId}:${trip.id}`;
    const isRefetch = lastLoadedKeyRef.current === loadKey;
    if (!isRefetch) setEntriesLoading(true);
    getTransactionsByOrganization(organizationId).then(
      ({ error, transactions }) => {
        lastLoadedKeyRef.current = loadKey;
        setEntriesLoading(false);
        if (error) {
          setTripTransactions([]);
          return;
        }
        const forTrip = (transactions ?? []).filter(
          (tx) => tx.trip_id === trip.id,
        );
        setTripTransactions(forTrip);
      },
    );
  }, [organizationId, trip.id]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries, refreshKey]);

  /** Owner + indent: we are the client (shipper), revenue = client_price. Non-owner + indent: supplier, revenue = supplier_rate. */
  const isTripOwner =
    organizationId != null &&
    trip.organization_id != null &&
    trip.organization_id === organizationId;
  /** Non-owner + indent: supplier_rate. Otherwise: client_price. */
  const revenue =
    trip.indent_id != null && !isTripOwner
      ? Number(trip.supplier_rate) || 0
      : Number(trip.client_price) || 0;
  const received = useMemo(
    () =>
      tripTransactions.reduce((sum, tx) => sum + Number(tx.amount_in ?? 0), 0),
    [tripTransactions],
  );
  const due = Math.max(0, revenue - received);
  /** Owner + indent: cost = supplier_rate (what we pay). Non-owner + indent: no cost. Non-indent: supplier_rate. */
  const cost =
    trip.indent_id != null && !isTripOwner
      ? 0
      : Number(trip.supplier_rate) || 0;
  const profit = revenue - cost;

  const revenueEntries = useMemo(
    () =>
      tripTransactions.filter(
        (t) =>
          t.trip_id === trip.id &&
          ((t.description || "").toUpperCase().includes("REVENUE") ||
            (t.description || "").toUpperCase().includes("ADJ")),
      ),
    [trip.id, tripTransactions],
  );

  const netSaleValue = useMemo(() => {
    const base = parseFloat(baseSaleValue) || 0;
    const raw = adjustments.reduce((sum, a) => {
      const val = parseFloat(String(a.amount ?? "0")) || 0;
      return a.type === "plus" ? sum + val : sum - val;
    }, base);
    return Math.max(0, raw);
  }, [baseSaleValue, adjustments]);

  const handleCommit = () => {
    if (!organizationId) return;
    const amount = netSaleValue > 0 ? netSaleValue : revenue;
    if (amount <= 0) return;
    setCommitting(true);
    const date = new Date().toISOString().slice(0, 10);
    createLedgerEntry(organizationId, {
      trip_id: trip.id,
      trip_number: getTripDisplayNumber(trip),
      party_name: trip.client_name || "—",
      description: "TRIP REVENUE ADJ",
      amount_in: amount,
      amount_out: 0,
      transaction_date: date,
      contact_id: trip.client_id ?? null,
      contact_type: "client",
    }).then(({ error }) => {
      setCommitting(false);
      if (!error) {
        setBaseSaleValue("");
        setAdjustments([]);
        loadEntries();
        onCommitted?.();
      } else Alert.alert("Ledger entry failed", error.message);
    });
  };

  const formatLedgerDate = (s: string) => {
    if (!s) return "—";
    const d = s.slice(0, 10);
    const [y, m, day] = d.split("-");
    const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
    return `${day} ${months[Number(m) - 1]} ${y}`;
  };

  const renderEntriesTable = (entries: LedgerRow[], emptyLabel: string) => (
    <View style={styles.entriesTable}>
      {entries.length === 0 ? (
        <Text style={styles.entriesEmpty}>{emptyLabel}</Text>
      ) : (
        <>
          <View style={styles.entriesTableHeader}>
            <Text style={[styles.entriesTh, styles.entriesThDesc]}>
              DESC / DATE
            </Text>
            <Text style={[styles.entriesTh, styles.entriesThAmt]}>IN</Text>
            <Text style={[styles.entriesTh, styles.entriesThAmt]}>OUT</Text>
          </View>
          {entries.map((row) => (
            <View key={row.id} style={styles.entriesTableRow}>
              <View style={[styles.entriesTd, styles.entriesTdDesc]}>
                <Text style={styles.entriesDesc} numberOfLines={1}>
                  {row.description || "—"}
                </Text>
                <Text style={styles.entriesDate}>
                  {formatLedgerDate(row.transaction_date)}
                </Text>
              </View>
              <Text style={[styles.entriesTdAmt, styles.entriesIn]}>
                {(row.amount_in ?? 0) > 0 ? formatINR(row.amount_in!) : "—"}
              </Text>
              <Text style={[styles.entriesTdAmt, styles.entriesOut]}>
                {(row.amount_out ?? 0) > 0 ? formatINR(row.amount_out!) : "—"}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[
        styles.wrapper,
        { paddingBottom: contentContainerPaddingBottom },
      ]}
      showsVerticalScrollIndicator={true}
      keyboardShouldPersistTaps="handled"
      bounces={true}
    >
      <Text style={styles.sectionTitle}>Finance</Text>

      {(onRecordCashIn != null || onAddExpense != null) && (
        <View style={styles.cashActionsWrap}>
          <Text style={styles.cashActionsLabel}>Quick actions</Text>
          <View style={styles.cashActionsRow}>
            {onRecordCashIn != null && (
              <TouchableOpacity
                style={[styles.cashActionBtn, styles.cashActionBtnIn]}
                onPress={() => onRecordCashIn(trip)}
                activeOpacity={0.8}
              >
                <FontAwesome
                  name="arrow-down"
                  size={14}
                  color={Theme.textOnPrimary}
                />
                <Text style={styles.cashActionBtnText}>Record cash in</Text>
              </TouchableOpacity>
            )}
            {onAddExpense != null && (
              <TouchableOpacity
                style={[styles.cashActionBtn, styles.cashActionBtnOut]}
                onPress={() => onAddExpense(trip)}
                activeOpacity={0.8}
              >
                <FontAwesome
                  name="minus-circle"
                  size={14}
                  color={Theme.textOnPrimary}
                />
                <Text style={styles.cashActionBtnText}>Add expense</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Revenue card */}
      <View style={styles.financeCard}>
        <View style={styles.financeCardBackIcon}>
          <FontAwesome name="money" size={56} color={Theme.darkGreen} />
        </View>
        <Text style={styles.cardLabel}>REVENUE</Text>
        <Text style={styles.revenueMainValue}>{formatINR(revenue)}</Text>
        <Text style={styles.cardSubtext}>Credit (+) · Debit (−)</Text>
        <View style={styles.baseRow}>
          <Text style={styles.currencyPrefix}>₹</Text>
          <TextInput
            style={styles.baseInput}
            value={baseSaleValue}
            onChangeText={setBaseSaleValue}
            placeholder="Base amount"
            placeholderTextColor={Theme.textMuted}
            keyboardType="decimal-pad"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
        </View>
        {adjustments.map((adj, idx) => (
          <View key={idx} style={styles.adjItem}>
            <View
              style={[
                styles.adjIconWrap,
                adj.type === "plus" ? styles.adjIconPlus : styles.adjIconMinus,
              ]}
            >
              <FontAwesome
                name={adj.type === "plus" ? "plus" : "minus"}
                size={12}
                color={adj.type === "plus" ? Theme.darkGreen : Theme.teslaRed}
              />
            </View>
            <TextInput
              style={styles.adjAmountInput}
              value={adj.amount ?? ""}
              onChangeText={(v) =>
                setAdjustments((prev) =>
                  prev.map((a, i) => (i === idx ? { ...a, amount: v } : a)),
                )
              }
              placeholder="0"
              placeholderTextColor={Theme.textMuted}
              keyboardType="decimal-pad"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <TextInput
              style={styles.adjReasonInput}
              value={adj.reason}
              onChangeText={(r) =>
                setAdjustments((prev) =>
                  prev.map((a, i) => (i === idx ? { ...a, reason: r } : a)),
                )
              }
              placeholder="Reason"
              placeholderTextColor={Theme.textMuted}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <TouchableOpacity
              onPress={() =>
                setAdjustments((prev) => prev.filter((_, i) => i !== idx))
              }
              hitSlop={8}
              style={styles.adjRemoveBtn}
            >
              <FontAwesome name="trash-o" size={14} color={Theme.textMuted} />
            </TouchableOpacity>
          </View>
        ))}
        <View style={styles.adjButtons}>
          <TouchableOpacity
            style={styles.adjBtnPlus}
            onPress={() =>
              setAdjustments((prev) => [...prev, { type: "plus" }])
            }
            activeOpacity={0.8}
          >
            <FontAwesome name="plus" size={12} color={Theme.darkGreen} />
            <Text style={styles.adjBtnTextPlus}>CREDIT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.adjBtnMinus}
            onPress={() =>
              setAdjustments((prev) => [...prev, { type: "minus" }])
            }
            activeOpacity={0.8}
          >
            <FontAwesome name="minus" size={12} color={Theme.teslaRed} />
            <Text style={styles.adjBtnTextMinus}>DEBIT</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.commitBtn}
          onPress={handleCommit}
          disabled={committing}
          activeOpacity={0.8}
        >
          {committing ? (
            <ActivityIndicator size="small" color={Theme.textPrimaryDark} />
          ) : (
            <Text style={styles.commitBtnText}>COMMIT</Text>
          )}
        </TouchableOpacity>
        {renderEntriesTable(revenueEntries, "No revenue entries yet.")}
      </View>

      <View style={styles.entriesSection}>
        <Text style={styles.entriesTitle}>LEDGER ENTRIES</Text>
        {entriesLoading ? (
          <View style={styles.entriesLoading}>
            <ActivityIndicator size="small" color={Theme.textMuted} />
            <Text style={styles.entriesLoadingText}>Loading…</Text>
          </View>
        ) : tripTransactions.length === 0 ? (
          <View style={styles.entriesEmptyContainer}>
            <Text style={styles.entriesEmptyText}>
              {t("noLedgerEntriesForTripYet")}
            </Text>
          </View>
        ) : (
          <View style={styles.entriesList}>
            {tripTransactions.map((tx) => {
              const inAmt = Number(tx.amount_in ?? 0);
              const outAmt = Number(tx.amount_out ?? 0);
              const isIn = inAmt > 0;
              const amount = isIn ? inAmt : outAmt;
              return (
                <View key={tx.id} style={styles.entryRow}>
                  <View style={styles.entryLeft}>
                    <Text style={styles.entryDesc} numberOfLines={1}>
                      {tx.description || "ENTRY"}
                    </Text>
                    <Text style={styles.entryMeta}>
                      {formatLedgerDate(tx.transaction_date || tx.created_at)} ·{" "}
                      {tx.party_name || "—"}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.entryAmount,
                      isIn ? styles.entryAmountIn : styles.entryAmountOut,
                    ]}
                  >
                    {isIn ? "+" : "−"}
                    {formatINR(amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    alignSelf: "stretch",
  },
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    alignSelf: "stretch",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  cashActionsWrap: {
    marginBottom: 12,
  },
  cashActionsLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  cashActionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  cashActionBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  cashActionBtnIn: {
    backgroundColor: Theme.darkGreen,
  },
  cashActionBtnOut: {
    backgroundColor: Theme.teslaRed,
  },
  cashActionBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  summaryCard: {
    position: "relative",
    backgroundColor: Theme.darkBackground,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    borderRadius: 12,
    padding: 16,
    paddingRight: 44,
    marginBottom: 12,
    overflow: "hidden",
  },
  financeCard: {
    position: "relative",
    backgroundColor: Theme.darkBackground,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    borderRadius: 12,
    padding: 16,
    paddingRight: 56,
    marginBottom: 12,
    overflow: "hidden",
  },
  financeCardBackIcon: {
    position: "absolute",
    top: 12,
    right: 16,
    opacity: 0.14,
    pointerEvents: "none",
  },
  cardSubtext: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.separatorDark,
    marginTop: 4,
    marginBottom: 12,
    gap: 12,
  },
  partyLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  partyValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnDark,
    flex: 1,
    textAlign: "right",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  statBoxGreen: {
    borderColor: "rgba(21,128,61,0.4)",
    backgroundColor: "rgba(21,128,61,0.1)",
  },
  statBoxRed: {
    borderColor: "rgba(232,33,39,0.3)",
    backgroundColor: "rgba(232,33,39,0.08)",
  },
  statLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  statValue: { fontSize: 12, fontWeight: "700", color: Theme.textOnDark },
  addEntryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  addEntryInput: {
    width: 80,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textOnDark,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  addEntryDesc: {
    flex: 1,
    minWidth: 80,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textOnDark,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  addEntryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 56,
  },
  addEntryBtnGreen: { backgroundColor: Theme.darkGreen },
  addEntryBtnRed: { backgroundColor: Theme.teslaRed },
  addEntryBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 1,
  },
  entriesTable: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.separatorDark,
    paddingTop: 12,
  },
  entriesTableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
    marginBottom: 4,
  },
  entriesTh: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
  },
  entriesThDesc: { flex: 1 },
  entriesThAmt: { width: 72, textAlign: "right" },
  entriesTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceLight,
  },
  entriesTd: {},
  entriesTdDesc: { flex: 1, minWidth: 0 },
  entriesDesc: { fontSize: 12, fontWeight: "600", color: Theme.textOnDark },
  entriesDate: { fontSize: 11, color: Theme.textSecondary, marginTop: 2 },
  entriesTdAmt: {
    width: 72,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
  },
  entriesIn: { color: Theme.darkGreen },
  entriesOut: { color: Theme.teslaRed },
  entriesEmpty: {
    fontSize: 10,
    color: Theme.textSecondary,
    paddingVertical: 12,
    fontStyle: "italic",
  },
  cardDeco: {
    position: "absolute",
    top: 12,
    right: 12,
    opacity: 0.12,
  },
  cardDecoIcon: { opacity: 1 },
  cardDecoGreen: { opacity: 0.25 },
  cardDecoRed: { opacity: 0.25 },
  cardLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  revenueMainValue: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  paymentRow: {
    flexDirection: "row",
    marginBottom: 12,
    gap: 12,
  },
  paymentReceivedBox: {
    flex: 1,
    padding: 12,
    backgroundColor: "rgba(21,128,61,0.15)",
    borderWidth: 1,
    borderColor: "rgba(21,128,61,0.3)",
  },
  pendingDueBox: {
    flex: 1,
    padding: 12,
    backgroundColor: "rgba(232,33,39,0.1)",
    borderWidth: 1,
    borderColor: "rgba(232,33,39,0.3)",
  },
  paymentLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  paymentValue: { fontSize: 12, fontWeight: "700", color: Theme.textOnDark },
  pendingDueValue: { color: Theme.teslaRed },
  markPaymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  markPaymentInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  markPaymentInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textOnDark,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minWidth: 0,
  },
  markPaymentBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Theme.darkGreen,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 100,
    flexShrink: 0,
  },
  markPaymentBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  adjSubtitle: {
    fontSize: 9,
    color: Theme.textMuted,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  expenseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceLight,
  },
  expenseLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  expenseValue: { fontSize: 12, fontWeight: "700", color: Theme.textOnDark },
  expenseHint: {
    fontSize: 9,
    color: Theme.textMuted,
    marginTop: 8,
    fontStyle: "italic",
  },
  expenseInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 12,
  },
  expenseInput: {
    width: 100,
    minWidth: 80,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnDark,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  salaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 6,
  },
  salaryInput: { flex: 1, minWidth: 80 },
  salaryInputSmall: { width: 44 },
  salarySep: { fontSize: 11, color: Theme.textMuted },
  salaryDaysLabel: {
    fontSize: 9,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  summaryRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  summaryCell: {
    flex: 1,
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: Theme.separatorDark,
  },
  summaryCellRight: {
    borderRightWidth: 0,
    alignItems: "flex-end",
  },
  summaryLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  summaryLabelRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: -0.5,
  },
  plRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  plLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  plValue: { fontSize: 12, fontWeight: "700" },
  plPositive: { color: Theme.darkGreen },
  plNegative: { color: Theme.teslaRed },
  positive: { color: Theme.darkGreen },
  negative: { color: Theme.teslaRed },
  summaryRowLast: { borderBottomWidth: 0 },
  adjCard: {
    position: "relative",
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    backgroundColor: Theme.darkBackground,
    borderRadius: 12,
    padding: 16,
    paddingRight: 44,
    marginBottom: 12,
    overflow: "visible",
  },
  adjTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  baseRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
    paddingBottom: 8,
    marginBottom: 16,
  },
  currencyPrefix: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.teslaRed,
    marginRight: 8,
  },
  baseInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: "800",
    color: Theme.textOnDark,
    padding: 0,
  },
  adjItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  adjIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  adjIconPlus: { backgroundColor: "rgba(21,128,61,0.2)" },
  adjIconMinus: { backgroundColor: "rgba(232,33,39,0.2)" },
  adjAmountInput: {
    width: 72,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnDark,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    paddingVertical: 6,
    paddingHorizontal: 8,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  adjReasonInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnDark,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
    paddingVertical: 6,
    textTransform: "uppercase",
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  adjRemoveBtn: { padding: 6 },
  adjButtons: { flexDirection: "row", gap: 12, marginTop: 8, marginBottom: 16 },
  adjBtnPlus: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: "rgba(21,128,61,0.1)",
    borderWidth: 1,
    borderColor: "rgba(21,128,61,0.3)",
  },
  adjBtnTextPlus: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.darkGreen,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  adjBtnMinus: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: "rgba(232,33,39,0.1)",
    borderWidth: 1,
    borderColor: "rgba(232,33,39,0.3)",
  },
  adjBtnTextMinus: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.teslaRed,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  commitBtn: {
    backgroundColor: Theme.screenBackground,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  commitBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  entriesSection: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.darkBackground,
    padding: 16,
    borderRadius: 12,
  },
  entriesTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  entriesLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 20,
  },
  entriesLoadingText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  entriesEmptyContainer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  entriesEmptyText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
  },
  entriesList: {
    gap: 8,
  },
  entryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  entryLeft: { flex: 1, minWidth: 0 },
  entryDesc: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textOnDark,
    textTransform: "uppercase",
  },
  entryMeta: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginTop: 4,
  },
  entryAmount: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 12,
  },
  entryAmountIn: { color: Theme.darkGreen },
  entryAmountOut: { color: Theme.teslaRed },
});

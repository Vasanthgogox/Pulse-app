/**
 * Receivables & payment tracking panel — matches reference design.
 * Shows outstanding amount, advance/balance cards, payment terms, invoice summary.
 */
import Theme from "@/constants/Theme";
import { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

interface ReceivablesPanelProps {
  outstanding: number;
  baseFreight: number;
  /** Advance percent (default 90) */
  advancePercent?: number;
  /** Balance percent (default 10) */
  balancePercent?: number;
  additionalIncome?: number;
  deductions?: number;
  paymentStatus?: "Not Started" | "Partial" | "Completed";
  onGenerateInvoice?: () => void;
  onMarkAdvancePaid?: (amount: number) => void;
  onMarkBalancePaid?: (amount: number) => void;
  onSaveTerms?: (advance: number, balance: number) => void;
}

export function ReceivablesPanel({
  outstanding,
  baseFreight,
  advancePercent = 90,
  balancePercent = 10,
  additionalIncome = 0,
  deductions = 0,
  paymentStatus = "Not Started",
  onGenerateInvoice,
  onMarkAdvancePaid,
  onMarkBalancePaid,
  onSaveTerms,
}: ReceivablesPanelProps) {
  const [advancePct, setAdvancePct] = useState(String(advancePercent));
  const [balancePct, setBalancePct] = useState(String(balancePercent));

  const advanceAmt = Math.round((baseFreight * advancePercent) / 100);
  const balanceAmt = baseFreight - advanceAmt + additionalIncome - deductions;
  const total = baseFreight;

  return (
    <View style={styles.panel}>
      {/* Header */}
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderLeft}>
          <Text style={styles.panelTitle}>Receivables</Text>
          <View style={styles.outstandingBadge}>
            <Text style={styles.outstandingLabel}>Outstanding: </Text>
            <Text style={styles.outstandingAmount}>
              ₹{outstanding.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.generateBtn}
          onPress={onGenerateInvoice}
          activeOpacity={0.85}
        >
          <Text style={styles.generateBtnText}>Generate Invoice</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panelBody}>
        {/* Payment Status */}
        <View style={styles.paymentStatusRow}>
          <Text style={styles.paymentStatusLabel}>Payment Status (Base Freight)</Text>
          <StatusBadge status={paymentStatus} />
        </View>

        <View style={styles.divider} />

        {/* Advance + Balance cards */}
        <View style={styles.amountCardsRow}>
          <AmountCard
            label="Advance"
            amount={advanceAmt}
            subtext={`${advancePercent}% of freight`}
            onMarkPaid={onMarkAdvancePaid ? () => onMarkAdvancePaid(advanceAmt) : undefined}
          />
          <AmountCard
            label="Balance"
            amount={balanceAmt}
            subtext="Term-based Balance + Income – Deductions"
            onMarkPaid={onMarkBalancePaid ? () => onMarkBalancePaid(balanceAmt) : undefined}
          />
        </View>

        <View style={styles.divider} />

        {/* Payment Terms */}
        <View style={styles.termsSection}>
          <Text style={styles.termsSectionLabel}>PAYMENT TERMS</Text>
          <View style={styles.termsInputRow}>
            <TextInput
              style={styles.termsInput}
              value={advancePct}
              onChangeText={setAdvancePct}
              keyboardType="numeric"
              maxLength={3}
            />
            <Text style={styles.termsSeparator}>/</Text>
            <TextInput
              style={styles.termsInput}
              value={balancePct}
              onChangeText={setBalancePct}
              keyboardType="numeric"
              maxLength={3}
            />
            <Text style={styles.termsEquals}>=</Text>
            <Text style={styles.termsTotal}>100%</Text>
          </View>
          <TouchableOpacity
            style={styles.saveTermsBtn}
            onPress={() =>
              onSaveTerms?.(Number(advancePct) || 90, Number(balancePct) || 10)
            }
            activeOpacity={0.85}
          >
            <Text style={styles.saveTermsBtnText}>Save Terms</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Invoice Summary */}
        <View style={styles.invoiceSummary}>
          <Text style={styles.invoiceSummaryTitle}>INVOICE SUMMARY:</Text>
          <InvoiceLine label="Total:" value={`₹${total.toLocaleString("en-IN")}`} />
          <InvoiceLine label="Advance:" value={`₹${advanceAmt.toLocaleString("en-IN")}`} />
          <InvoiceLine
            label="Income:"
            value={`₹${additionalIncome.toLocaleString("en-IN")}`}
          />
          <InvoiceLine
            label="Deductions:"
            value={`₹${deductions.toLocaleString("en-IN")}`}
          />
          <View style={styles.invoiceDivider} />
          <InvoiceLine
            label="Balance:"
            value={`₹${balanceAmt.toLocaleString("en-IN")}`}
            accent
          />
        </View>
      </View>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const { bg, text } = (() => {
    switch (status) {
      case "Completed":
        return { bg: "#dcfce7", text: "#15803d" };
      case "Partial":
        return { bg: "#fef3c7", text: "#b45309" };
      default:
        return { bg: "#f3f4f6", text: "#6b7280" };
    }
  })();
  return (
    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
      <Text style={[styles.statusBadgeText, { color: text }]}>{status}</Text>
    </View>
  );
}

function AmountCard({
  label,
  amount,
  subtext,
  onMarkPaid,
}: {
  label: string;
  amount: number;
  subtext: string;
  onMarkPaid?: () => void;
}) {
  return (
    <View style={styles.amountCard}>
      <Text style={styles.amountCardLabel}>{label}</Text>
      <Text style={styles.amountCardValue}>₹{amount.toLocaleString("en-IN")}</Text>
      <Text style={styles.amountCardSubtext}>{subtext}</Text>
      {onMarkPaid ? (
        <TouchableOpacity
          style={styles.markPaidBtn}
          onPress={onMarkPaid}
          activeOpacity={0.85}
        >
          <Text style={styles.markPaidBtnText}>
            Mark as Paid (₹{amount.toLocaleString("en-IN")})
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function InvoiceLine({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.invoiceLine}>
      <Text style={styles.invoiceLineLabel}>{label}</Text>
      <Text style={[styles.invoiceLineValue, accent && styles.invoiceLineAccent]}>
        {value}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  panel: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    flexWrap: "wrap",
    gap: 10,
  },
  panelHeaderLeft: {
    gap: 4,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  outstandingBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  outstandingLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  outstandingAmount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  generateBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: "#2563eb",
  },
  generateBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.buttonPrimaryText,
  },
  panelBody: {
    padding: 20,
    gap: 0,
  },
  paymentStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  paymentStatusLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginVertical: 16,
  },
  amountCardsRow: {
    flexDirection: "row",
    gap: 12,
  },
  amountCard: {
    flex: 1,
    gap: 4,
  },
  amountCardLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
  },
  amountCardValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  amountCardSubtext: {
    fontSize: 10,
    color: "#9ca3af",
    lineHeight: 15,
  },
  markPaidBtn: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  markPaidBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.buttonDarkText,
  },
  termsSection: {
    gap: 10,
  },
  termsSectionLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  termsInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  termsInput: {
    width: 50,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
    backgroundColor: "#fafafa",
  },
  termsSeparator: {
    fontSize: 16,
    color: "#9ca3af",
    fontWeight: "600",
  },
  termsEquals: {
    fontSize: 13,
    color: "#9ca3af",
  },
  termsTotal: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  saveTermsBtn: {
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  saveTermsBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.buttonDarkText,
  },
  invoiceSummary: {
    gap: 6,
  },
  invoiceSummaryTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  invoiceLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  invoiceLineLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  invoiceLineValue: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
  },
  invoiceLineAccent: {
    color: "#2563eb",
    fontWeight: "700",
    fontSize: 13,
  },
  invoiceDivider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginVertical: 4,
  },
});

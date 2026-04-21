/**
 * Finance Overview section — matches reference design.
 * BASE FREIGHT | TOTAL EXPENSES | ADDITIONAL INCOME | DEDUCTIONS
 * Net Result + Calculation Breakdown + expandable detail rows.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface FinanceOverviewProps {
  baseFreight: number;
  totalExpenses: number;
  additionalIncome: number;
  deductions: number;
  /** Expandable expense detail rows */
  expenseDetails?: { label: string; amount: number }[];
  incomeDetails?: { label: string; amount: number }[];
  deductionDetails?: { label: string; amount: number }[];
  onAddIncome?: () => void;
  onAddDeduction?: () => void;
}

export function FinanceOverview({
  baseFreight,
  totalExpenses,
  additionalIncome,
  deductions,
  expenseDetails = [],
  incomeDetails = [],
  deductionDetails = [],
  onAddIncome,
  onAddDeduction,
}: FinanceOverviewProps) {
  const netResult = baseFreight - totalExpenses + additionalIncome - deductions;
  const isProfit = netResult >= 0;

  return (
    <View style={styles.section}>
      {/* Header */}
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Finance Overview</Text>
          <Text style={styles.sectionSubtitle}>Simplified Trip Financial Summary</Text>
        </View>
        <View style={styles.headerActions}>
          <ActionButton label="Add Income" onPress={onAddIncome} />
          <ActionButton label="Add Deduction" onPress={onAddDeduction} />
        </View>
      </View>

      {/* 4 metric cards */}
      <View style={styles.metricsGrid}>
        <MetricCard
          label="BASE FREIGHT"
          dotColor="#22c55e"
          value={baseFreight}
          subtext="Fixed trip charge"
        />
        <MetricCard
          label="TOTAL EXPENSES"
          dotColor="#ef4444"
          value={totalExpenses}
          subtext="Trip-related expenses"
        />
        <MetricCard
          label="ADDITIONAL INCOME"
          dotColor="#3b82f6"
          value={additionalIncome}
          subtext="From client beyond freight"
        />
        <MetricCard
          label="DEDUCTIONS"
          dotColor="#f97316"
          value={deductions}
          subtext="Damage, loss, penalties"
        />
      </View>

      {/* Net Result + Breakdown */}
      <View style={styles.netResultRow}>
        <View style={styles.netResultLeft}>
          <View style={styles.netResultLabelRow}>
            <Text style={styles.netResultLabel}>Net Result</Text>
            <Text style={styles.netResultFormula}>
              Base Freight – Expenses + Income – Deductions
            </Text>
          </View>
          <View style={styles.netResultValueRow}>
            <FontAwesome
              name={isProfit ? "arrow-up" : "arrow-down"}
              size={14}
              color={isProfit ? "#15803d" : "#ef4444"}
            />
            <Text style={[styles.netResultValue, isProfit ? styles.profit : styles.loss]}>
              ₹{Math.abs(netResult).toLocaleString("en-IN")}
            </Text>
            <Text style={[styles.netResultTag, isProfit ? styles.profit : styles.loss]}>
              {isProfit ? "Profit" : "Loss"}
            </Text>
          </View>
        </View>

        <View style={styles.breakdownBox}>
          <Text style={styles.breakdownTitle}>CALCULATION BREAKDOWN</Text>
          <BreakdownRow label="Base Freight:" value={`₹${baseFreight.toLocaleString("en-IN")}`} />
          <BreakdownRow
            label="– Expenses:"
            value={`–₹${totalExpenses.toLocaleString("en-IN")}`}
            negative
          />
          <BreakdownRow
            label="+ Income:"
            value={`+₹${additionalIncome.toLocaleString("en-IN")}`}
            positive
          />
          <BreakdownRow
            label="– Deductions:"
            value={`–₹${deductions.toLocaleString("en-IN")}`}
            negative
          />
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownNetRow}>
            <Text style={styles.breakdownNetLabel}>Net Result:</Text>
            <Text style={styles.breakdownNetValue}>
              ₹{netResult.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.detailsDivider} />

      {/* Expandable detail rows */}
      <ExpandableRow
        dotColor="#ef4444"
        title="Expenses Details"
        subtitle="Trip-related expenses breakdown"
        total={totalExpenses}
        items={expenseDetails}
      />
      <ExpandableRow
        dotColor="#3b82f6"
        title="Additional Income Details"
        subtitle="Income from client beyond freight"
        total={additionalIncome}
        items={incomeDetails}
      />
      <ExpandableRow
        dotColor="#f97316"
        title="Deductions Details"
        subtitle="Damage, loss, and penalty charges"
        total={deductions}
        items={deductionDetails}
        isLast
      />
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  label,
  dotColor,
  value,
  subtext,
}: {
  label: string;
  dotColor: string;
  value: number;
  subtext: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricCardHeader}>
        <Text style={styles.metricCardLabel}>{label}</Text>
        <View style={[styles.metricDot, { backgroundColor: dotColor }]} />
      </View>
      <Text style={styles.metricCardValue}>₹{value.toLocaleString("en-IN")}</Text>
      <Text style={styles.metricCardSubtext}>{subtext}</Text>
    </View>
  );
}

function BreakdownRow({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text
        style={[
          styles.breakdownValue,
          positive && styles.positiveText,
          negative && styles.negativeText,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function ExpandableRow({
  dotColor,
  title,
  subtitle,
  total,
  items,
  isLast,
}: {
  dotColor: string;
  title: string;
  subtitle: string;
  total: number;
  items: { label: string; amount: number }[];
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.expandableRow, !isLast && styles.expandableRowBorder]}>
      <TouchableOpacity
        style={styles.expandableRowHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.expandableRowLeft}>
          <View style={[styles.expandableDot, { backgroundColor: dotColor }]} />
          <View>
            <Text style={styles.expandableTitle}>{title}</Text>
            <Text style={styles.expandableSubtitle}>{subtitle}</Text>
          </View>
        </View>
        <View style={styles.expandableRowRight}>
          <Text style={styles.expandableTotal}>₹{total.toLocaleString("en-IN")}</Text>
          <FontAwesome
            name={expanded ? "chevron-up" : "chevron-down"}
            size={12}
            color="#9ca3af"
          />
        </View>
      </TouchableOpacity>

      {expanded && items.length > 0 ? (
        <View style={styles.expandedContent}>
          {items.map((item, idx) => (
            <View key={idx} style={styles.expandedItem}>
              <Text style={styles.expandedItemLabel}>{item.label}</Text>
              <Text style={styles.expandedItemAmount}>
                ₹{item.amount.toLocaleString("en-IN")}
              </Text>
            </View>
          ))}
        </View>
      ) : expanded ? (
        <View style={styles.expandedEmpty}>
          <Text style={styles.expandedEmptyText}>No items</Text>
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.actionBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    flexWrap: "wrap",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: Theme.screenBackground,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    borderRadius: 10,
    padding: 14,
  },
  metricCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metricCardLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metricDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metricCardValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  metricCardSubtext: {
    fontSize: 11,
    color: "#9ca3af",
  },
  netResultRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },
  netResultLeft: {
    flex: 1,
    minWidth: 200,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    borderRadius: 10,
    padding: 14,
  },
  netResultLabelRow: {
    marginBottom: 10,
  },
  netResultLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  netResultFormula: {
    fontSize: 11,
    color: "#9ca3af",
  },
  netResultValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  netResultValue: {
    fontSize: 28,
    fontWeight: "800",
  },
  netResultTag: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  profit: {
    color: "#15803d",
  },
  loss: {
    color: "#ef4444",
  },
  breakdownBox: {
    flex: 1,
    minWidth: 200,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    borderRadius: 10,
    padding: 14,
  },
  breakdownTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  breakdownLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
  },
  positiveText: {
    color: "#15803d",
  },
  negativeText: {
    color: "#ef4444",
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginVertical: 8,
  },
  breakdownNetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  breakdownNetLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  breakdownNetValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  detailsDivider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginHorizontal: 16,
  },
  expandableRow: {
    paddingHorizontal: 16,
  },
  expandableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  expandableRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  expandableRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  expandableDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  expandableTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  expandableSubtitle: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 1,
  },
  expandableRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  expandableTotal: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  expandedContent: {
    paddingBottom: 12,
    paddingLeft: 18,
    gap: 6,
  },
  expandedItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  expandedItemLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  expandedItemAmount: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  expandedEmpty: {
    paddingBottom: 12,
    paddingLeft: 18,
  },
  expandedEmptyText: {
    fontSize: 12,
    color: "#9ca3af",
    fontStyle: "italic",
  },
});

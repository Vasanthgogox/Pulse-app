/**
 * Finance Overview — elevated design.
 * Colored metric cards, rich net-result block, styled breakdown, expandable details.
 */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface FinanceOverviewProps {
  baseFreight: number;
  totalExpenses: number;
  additionalIncome: number;
  deductions: number;
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
  const netPct =
    baseFreight > 0 ? Math.round((Math.abs(netResult) / baseFreight) * 100) : 0;

  return (
    <View style={styles.card}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Finance Overview</Text>
          <Text style={styles.headerSub}>Real-time profitability analysis</Text>
        </View>
        <View style={styles.headerActions}>
          <ActionChip label="+ Income" color="#16a34a" bg="#dcfce7" onPress={onAddIncome} />
          <ActionChip label="+ Deduction" color="#b45309" bg="#fef3c7" onPress={onAddDeduction} />
        </View>
      </View>

      {/* ── 4 metric cards ── */}
      <View style={styles.metricsRow}>
        <MetricCard
          label="Base Freight"
          value={baseFreight}
          icon="money"
          iconBg="#dcfce7"
          iconColor="#15803d"
          valueColor="#15803d"
          tag="Revenue"
          tagBg="#dcfce7"
          tagColor="#15803d"
        />
        <MetricCard
          label="Total Expenses"
          value={totalExpenses}
          icon="minus-circle"
          iconBg="#fee2e2"
          iconColor="#dc2626"
          valueColor="#dc2626"
          tag="Cost"
          tagBg="#fee2e2"
          tagColor="#dc2626"
        />
        <MetricCard
          label="Additional Income"
          value={additionalIncome}
          icon="plus-circle"
          iconBg="#dbeafe"
          iconColor="#2563eb"
          valueColor="#2563eb"
          tag="Income"
          tagBg="#dbeafe"
          tagColor="#2563eb"
        />
        <MetricCard
          label="Deductions"
          value={deductions}
          icon="exclamation-triangle"
          iconBg="#ffedd5"
          iconColor="#ea580c"
          valueColor="#ea580c"
          tag="Penalties"
          tagBg="#ffedd5"
          tagColor="#ea580c"
        />
      </View>

      {/* ── Net result + breakdown ── */}
      <View style={styles.netSection}>
        {/* Net result card */}
        <View style={[styles.netCard, isProfit ? styles.netCardProfit : styles.netCardLoss]}>
          <View style={styles.netTop}>
            <View>
              <Text style={styles.netLabel}>Net Result</Text>
              <Text style={styles.netFormula}>Freight – Expenses + Income – Deductions</Text>
            </View>
            <View style={[styles.netPctBadge, { backgroundColor: isProfit ? "#bbf7d0" : "#fecaca" }]}>
              <Text style={[styles.netPctText, { color: isProfit ? "#15803d" : "#dc2626" }]}>
                {isProfit ? "+" : "-"}{netPct}%
              </Text>
            </View>
          </View>
          <View style={styles.netAmountRow}>
            <View style={[styles.netIconWrap, { backgroundColor: isProfit ? "#bbf7d0" : "#fecaca" }]}>
              <FontAwesome
                name={isProfit ? "arrow-up" : "arrow-down"}
                size={16}
                color={isProfit ? "#15803d" : "#dc2626"}
              />
            </View>
            <Text style={[styles.netAmount, { color: isProfit ? "#15803d" : "#dc2626" }]}>
              ₹{Math.abs(netResult).toLocaleString("en-IN")}
            </Text>
            <View style={[styles.profitTag, { backgroundColor: isProfit ? "#15803d" : "#dc2626" }]}>
              <Text style={styles.profitTagText}>{isProfit ? "PROFIT" : "LOSS"}</Text>
            </View>
          </View>
        </View>

        {/* Calculation breakdown */}
        <View style={styles.breakdownCard}>
          <View style={styles.breakdownTitleRow}>
            <FontAwesome name="calculator" size={12} color="#6b7280" />
            <Text style={styles.breakdownTitle}>Calculation Breakdown</Text>
          </View>
          <BreakRow label="Base Freight" value={baseFreight} color="#15803d" prefix="₹" />
          <BreakRow label="Expenses" value={-totalExpenses} color="#dc2626" prefix="₹" signed />
          <BreakRow label="Add. Income" value={additionalIncome} color="#2563eb" prefix="₹" signed />
          <BreakRow label="Deductions" value={-deductions} color="#ea580c" prefix="₹" signed />
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownNet}>
            <Text style={styles.breakdownNetLabel}>Net Result</Text>
            <Text style={[styles.breakdownNetValue, { color: isProfit ? "#15803d" : "#dc2626" }]}>
              {isProfit ? "+" : ""}₹{netResult.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Expandable detail rows ── */}
      <View style={styles.expandSection}>
        <ExpandRow
          title="Expense Details"
          icon="minus-circle"
          iconColor="#dc2626"
          total={totalExpenses}
          items={expenseDetails}
        />
        <ExpandRow
          title="Additional Income Details"
          icon="plus-circle"
          iconColor="#2563eb"
          total={additionalIncome}
          items={incomeDetails}
        />
        <ExpandRow
          title="Deduction Details"
          icon="exclamation-triangle"
          iconColor="#ea580c"
          total={deductions}
          items={deductionDetails}
          isLast
        />
      </View>
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon,
  iconBg,
  iconColor,
  valueColor,
  tag,
  tagBg,
  tagColor,
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  iconBg: string;
  iconColor: string;
  valueColor: string;
  tag: string;
  tagBg: string;
  tagColor: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTop}>
        <View style={[styles.metricIconWrap, { backgroundColor: iconBg }]}>
          <FontAwesome name={icon} size={14} color={iconColor} />
        </View>
        <View style={[styles.metricTag, { backgroundColor: tagBg }]}>
          <Text style={[styles.metricTagText, { color: tagColor }]}>{tag}</Text>
        </View>
      </View>
      <Text style={[styles.metricValue, { color: valueColor }]}>
        ₹{value.toLocaleString("en-IN")}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function ActionChip({
  label,
  color,
  bg,
  onPress,
}: {
  label: string;
  color: string;
  bg: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionChip, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.actionChipText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function BreakRow({
  label,
  value,
  color,
  signed,
}: {
  label: string;
  value: number;
  color: string;
  prefix?: string;
  signed?: boolean;
}) {
  const sign = signed ? (value >= 0 ? "+" : "") : "";
  return (
    <View style={styles.breakRow}>
      <Text style={styles.breakLabel}>{label}</Text>
      <Text style={[styles.breakValue, { color }]}>
        {sign}₹{Math.abs(value).toLocaleString("en-IN")}
      </Text>
    </View>
  );
}

function ExpandRow({
  title,
  icon,
  iconColor,
  total,
  items,
  isLast,
}: {
  title: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  iconColor: string;
  total: number;
  items: { label: string; amount: number }[];
  isLast?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.expandRow, !isLast && styles.expandRowBorder]}>
      <TouchableOpacity
        style={styles.expandHeader}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.expandLeft}>
          <FontAwesome name={icon} size={13} color={iconColor} />
          <Text style={styles.expandTitle}>{title}</Text>
        </View>
        <View style={styles.expandRight}>
          <Text style={styles.expandTotal}>₹{total.toLocaleString("en-IN")}</Text>
          <View style={[styles.expandChevron, open && styles.expandChevronOpen]}>
            <FontAwesome name="chevron-down" size={10} color="#9ca3af" />
          </View>
        </View>
      </TouchableOpacity>
      {open && (
        <View style={styles.expandBody}>
          {items.length > 0 ? (
            items.map((it, i) => (
              <View key={i} style={styles.expandItem}>
                <View style={styles.expandItemDot} />
                <Text style={styles.expandItemLabel}>{it.label}</Text>
                <Text style={styles.expandItemAmt}>₹{it.amount.toLocaleString("en-IN")}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.expandEmpty}>No items recorded</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    flexWrap: "wrap",
    gap: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // ── Metric cards ──
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: 130,
    backgroundColor: "#fafafa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    padding: 14,
    gap: 6,
  },
  metricTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  metricTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
  },
  metricTagText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  metricLabel: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "500",
  },

  // ── Net result section ──
  netSection: {
    flexDirection: "column",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  netCard: {
    minWidth: 200,
    borderRadius: 12,
    padding: 16,
    gap: 14,
    borderWidth: 1,
  },
  netCardProfit: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  netCardLoss: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecaca",
  },
  netTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  netLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  netFormula: {
    fontSize: 10,
    color: "#9ca3af",
    marginTop: 2,
  },
  netPctBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  netPctText: {
    fontSize: 11,
    fontWeight: "700",
  },
  netAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  netIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  netAmount: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -1,
  },
  profitTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginLeft: 4,
  },
  profitTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
  },

  // ── Breakdown card ──
  breakdownCard: {
    minWidth: 200,
    backgroundColor: "#fafafa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    padding: 16,
  },
  breakdownTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  breakdownTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  breakRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  breakLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  breakValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 8,
  },
  breakdownNet: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakdownNetLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  breakdownNetValue: {
    fontSize: 14,
    fontWeight: "800",
  },

  // ── Expand section ──
  expandSection: {
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  expandRow: {
    paddingHorizontal: 16,
  },
  expandRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  expandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
  },
  expandLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  expandTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  expandRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  expandTotal: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  expandChevron: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  expandChevronOpen: {
    backgroundColor: "#e5e7eb",
  },
  expandBody: {
    paddingBottom: 12,
    paddingLeft: 22,
    gap: 6,
  },
  expandItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  expandItemDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#d1d5db",
  },
  expandItemLabel: {
    flex: 1,
    fontSize: 12,
    color: "#6b7280",
  },
  expandItemAmt: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  expandEmpty: {
    fontSize: 12,
    color: "#d1d5db",
    fontStyle: "italic",
  },
});

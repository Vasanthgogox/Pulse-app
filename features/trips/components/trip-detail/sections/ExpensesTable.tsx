/**
 * Trip Expenses table — elevated design matching FinanceOverview style.
 */
import { FeatureBanner } from "@/components/FeatureBanner";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export interface ExpenseRow {
  id: string;
  date: string;
  expenseId: string;
  category: string;
  type: string;
  description: string;
  amount: number;
  status: "Paid" | "Requested" | "Pending" | "Rejected";
  onEdit?: () => void;
  onView?: () => void;
  onDelete?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}

interface ExpensesTableProps {
  expenses?: ExpenseRow[];
  totalAmount?: number;
  onViewAll?: () => void;
  onAddExpense?: () => void;
}

export function ExpensesTable({
  expenses = [],
  totalAmount,
  onViewAll,
  onAddExpense,
}: ExpensesTableProps) {
  const total = totalAmount ?? expenses.reduce((s, e) => s + e.amount, 0);
  const paidTotal = expenses.filter((e) => e.status === "Paid").reduce((s, e) => s + e.amount, 0);
  const pendingCount = expenses.filter((e) => e.status === "Requested" || e.status === "Pending").length;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <FontAwesome name="file-text-o" size={14} color="#f97316" />
          </View>
          <View>
            <Text style={styles.cardTitle}>Trip Expenses</Text>
            <Text style={styles.cardSubtitle}>{expenses.length} expense{expenses.length !== 1 ? "s" : ""} recorded</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {pendingCount > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingCount} pending</Text>
            </View>
          )}
          {onAddExpense && (
            <TouchableOpacity onPress={onAddExpense} style={styles.addBtn} activeOpacity={0.8}>
              <FontAwesome name="plus" size={10} color="#fff" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total</Text>
          <Text style={styles.summaryValueTotal}>₹{total.toLocaleString("en-IN")}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Paid</Text>
          <Text style={styles.summaryValuePaid}>₹{paidTotal.toLocaleString("en-IN")}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Outstanding</Text>
          <Text style={styles.summaryValuePending}>₹{(total - paidTotal).toLocaleString("en-IN")}</Text>
        </View>
        {onViewAll && (
          <TouchableOpacity onPress={onViewAll} style={styles.viewAllBtn} activeOpacity={0.7}>
            <Text style={styles.viewAllText}>View All</Text>
            <FontAwesome name="chevron-right" size={9} color="#4D3636" />
          </TouchableOpacity>
        )}
      </View>

      {/* Table / List */}
      {expenses.length === 0 ? (
        <EmptyState />
      ) : Platform.OS === "web" ? (
        <WebTable expenses={expenses} />
      ) : (
        <NativeList expenses={expenses} />
      )}
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <FeatureBanner
      compact
      title="No expenses yet"
      description="Fuel, tolls, and driver advances for this trip will appear here."
      illustration="📊"
      accentColor="#059669"
      bullets={[
        { label: "Fuel & toll logs" },
        { label: "Driver advances" },
        { label: "Deductions tracked" },
        { label: "Audit-ready records" },
      ]}
      style={styles.emptyBanner}
    />
  );
}

// ── Web table ─────────────────────────────────────────────────────────────────

function WebTable({ expenses }: { expenses: ExpenseRow[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.table}>
        {/* Header row */}
        <View style={styles.tableHeadRow}>
          <ColHead label="Actions" width={96} />
          <ColHead label="Date" width={96} />
          <ColHead label="Expense ID" width={100} />
          <ColHead label="Category" width={110} />
          <ColHead label="Type" width={110} />
          <ColHead label="Description" width={180} flex />
          <ColHead label="Amount" width={90} align="right" />
          <ColHead label="Status" width={130} />
        </View>

        {/* Data rows */}
        {expenses.map((row, idx) => (
          <View key={row.id} style={[styles.tableRow, idx % 2 === 0 && styles.tableRowEven]}>
            <ActionsCell row={row} width={96} />
            <TableCell value={row.date} width={96} muted />
            <TableCell value={row.expenseId} width={100} mono />
            <CategoryCell value={row.category} width={110} />
            <TypeCell value={row.type} width={110} />
            <TableCell value={row.description} width={180} flex />
            <TableCell
              value={`₹${row.amount.toLocaleString("en-IN")}`}
              width={90}
              align="right"
              bold
            />
            <StatusCell status={row.status} width={130} row={row} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ── Native list ───────────────────────────────────────────────────────────────

function NativeList({ expenses }: { expenses: ExpenseRow[] }) {
  return (
    <View>
      {expenses.map((row, idx) => (
        <View key={row.id} style={[styles.nativeRow, idx % 2 === 0 && styles.nativeRowEven]}>
          <View style={styles.nativeRowTop}>
            <View style={styles.nativeRowTopLeft}>
              <Text style={styles.nativeExpenseId}>{row.expenseId}</Text>
              <CategoryChip label={row.category} />
            </View>
            <Text style={styles.nativeAmount}>₹{row.amount.toLocaleString("en-IN")}</Text>
          </View>
          <Text style={styles.nativeMeta}>{row.date} · {row.type}</Text>
          <View style={styles.nativeRowBottom}>
            <Text style={styles.nativeDesc} numberOfLines={1}>{row.description}</Text>
            <StatusPill status={row.status} />
          </View>
          {(row.onView || row.onEdit || row.onDelete) && (
            <View style={styles.nativeActions}>
              {row.onView && (
                <TouchableOpacity onPress={row.onView} style={[styles.nativeActionBtn, styles.btnView]} activeOpacity={0.7}>
                  <FontAwesome name="eye" size={11} color="#4D3636" />
                </TouchableOpacity>
              )}
              {row.onEdit && (
                <TouchableOpacity onPress={row.onEdit} style={[styles.nativeActionBtn, styles.btnEdit]} activeOpacity={0.7}>
                  <FontAwesome name="pencil" size={11} color="#f59e0b" />
                </TouchableOpacity>
              )}
              {row.onDelete && (
                <TouchableOpacity onPress={row.onDelete} style={[styles.nativeActionBtn, styles.btnDelete]} activeOpacity={0.7}>
                  <FontAwesome name="trash" size={11} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

// ── Cell components ───────────────────────────────────────────────────────────

function ColHead({
  label, width, flex, align,
}: { label: string; width?: number; flex?: boolean; align?: "left" | "right" }) {
  return (
    <View style={[styles.colHead, { width: flex ? undefined : width }, flex && { flex: 1 }]}>
      <Text style={[styles.colHeadText, align === "right" && styles.alignRight]}>{label}</Text>
    </View>
  );
}

function TableCell({
  value, width, flex, mono, bold, muted, align,
}: {
  value: string; width?: number; flex?: boolean;
  mono?: boolean; bold?: boolean; muted?: boolean;
  align?: "left" | "right";
}) {
  return (
    <View style={[styles.tableCell, { width: flex ? undefined : width }, flex && { flex: 1 }]}>
      <Text
        style={[
          styles.tableCellText,
          mono && styles.mono,
          bold && styles.boldCell,
          muted && styles.mutedCell,
          align === "right" && styles.alignRight,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function CategoryCell({ value, width }: { value: string; width: number }) {
  return (
    <View style={[styles.tableCell, { width }]}>
      <CategoryChip label={value} />
    </View>
  );
}

function CategoryChip({ label }: { label: string }) {
  return (
    <View style={styles.categoryChip}>
      <Text style={styles.categoryChipText}>{label}</Text>
    </View>
  );
}

function TypeCell({ value, width }: { value: string; width: number }) {
  return (
    <View style={[styles.tableCell, { width }]}>
      <View style={styles.typeChip}>
        <Text style={styles.typeChipText}>{value}</Text>
      </View>
    </View>
  );
}

function ActionsCell({ row, width }: { row: ExpenseRow; width?: number }) {
  return (
    <View style={[styles.tableCell, { width }, styles.actionsCell]}>
      {row.onView && (
        <TouchableOpacity onPress={row.onView} style={[styles.actionIconBtn, styles.btnView]} activeOpacity={0.75}>
          <FontAwesome name="eye" size={11} color="#4D3636" />
        </TouchableOpacity>
      )}
      {row.onEdit && (
        <TouchableOpacity onPress={row.onEdit} style={[styles.actionIconBtn, styles.btnEdit]} activeOpacity={0.75}>
          <FontAwesome name="pencil" size={11} color="#f59e0b" />
        </TouchableOpacity>
      )}
      {row.onDelete && (
        <TouchableOpacity onPress={row.onDelete} style={[styles.actionIconBtn, styles.btnDelete]} activeOpacity={0.75}>
          <FontAwesome name="trash" size={11} color="#ef4444" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function StatusCell({ status, width, row }: { status: ExpenseRow["status"]; width?: number; row: ExpenseRow }) {
  return (
    <View style={[styles.tableCell, { width }, styles.statusCellWrap]}>
      <StatusPill status={status} />
      {status === "Requested" && (
        <>
          {row.onApprove && (
            <TouchableOpacity onPress={row.onApprove} style={[styles.microBtn, styles.microApprove]} activeOpacity={0.7}>
              <FontAwesome name="check" size={9} color="#15803d" />
            </TouchableOpacity>
          )}
          {row.onReject && (
            <TouchableOpacity onPress={row.onReject} style={[styles.microBtn, styles.microReject]} activeOpacity={0.7}>
              <FontAwesome name="times" size={9} color="#ef4444" />
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

function StatusPill({ status }: { status: ExpenseRow["status"] }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.Pending;
  return (
    <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: s.dot }]} />
      <Text style={[styles.statusPillText, { color: s.text }]}>{status}</Text>
    </View>
  );
}

const STATUS_STYLE: Record<string, { bg: string; dot: string; text: string }> = {
  Paid:      { bg: "#dcfce7", dot: "#16a34a", text: "#15803d" },
  Requested: { bg: "#fef3c7", dot: "#d97706", text: "#b45309" },
  Pending:   { bg: "#eff6ff", dot: "#3b82f6", text: "#1d4ed8" },
  Rejected:  { bg: "#fee2e2", dot: "#ef4444", text: "#b91c1c" },
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  // ── Header ──
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#fff7ed",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#fef3c7",
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#b45309",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.buttonDarkText,
  },

  // ── Summary bar ──
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    gap: 0,
  },
  summaryItem: {
    flex: 1,
    gap: 2,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryValueTotal: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  summaryValuePaid: {
    fontSize: 15,
    fontWeight: "700",
    color: "#16a34a",
  },
  summaryValuePending: {
    fontSize: 15,
    fontWeight: "700",
    color: "#f97316",
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 16,
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 8,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4D3636",
  },

  // ── Table ──
  table: {
    minWidth: "100%",
  },
  tableHeadRow: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  colHead: {
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  colHeadText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#fff",
  },
  tableRowEven: {
    backgroundColor: "#fafbfc",
  },
  tableCell: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "center",
  },
  tableCellText: {
    fontSize: 12,
    color: "#374151",
  },
  mono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
    color: "#4D3636",
  },
  boldCell: {
    fontWeight: "700",
    color: "#111827",
    fontSize: 13,
  },
  mutedCell: {
    color: "#94a3b8",
    fontSize: 11,
  },
  alignRight: {
    textAlign: "right",
  },

  // ── Category / Type chips ──
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#ede9fe",
    alignSelf: "flex-start",
  },
  categoryChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#7c3aed",
  },
  typeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#e0f2fe",
    alignSelf: "flex-start",
  },
  typeChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0369a1",
  },

  // ── Action buttons ──
  actionsCell: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  actionIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnView: {
    backgroundColor: "#eff0fe",
  },
  btnEdit: {
    backgroundColor: "#fffbeb",
  },
  btnDelete: {
    backgroundColor: "#fef2f2",
  },

  // ── Status ──
  statusCellWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  microBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  microApprove: {
    backgroundColor: "#dcfce7",
  },
  microReject: {
    backgroundColor: "#fee2e2",
  },

  // ── Empty state ──
  emptyBanner: {
    margin: 16,
  },

  // ── Native cards ──
  nativeRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 6,
    backgroundColor: "#fff",
  },
  nativeRowEven: {
    backgroundColor: "#fafbfc",
  },
  nativeRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nativeRowTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nativeExpenseId: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4D3636",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  nativeAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  nativeMeta: {
    fontSize: 11,
    color: "#94a3b8",
  },
  nativeRowBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nativeDesc: {
    flex: 1,
    fontSize: 12,
    color: "#6b7280",
    marginRight: 10,
  },
  nativeActions: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  nativeActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});

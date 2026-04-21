/**
 * Trip Expenses table — matches reference design.
 * Shows expense rows with Actions | Date | ID | Category | Type | Description | Amount | Status
 */
import Theme from "@/constants/Theme";
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
  const total =
    totalAmount ?? expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <View style={styles.section}>
      {/* Tab header — "Expenses" with underline (matches reference tab style) */}
      <View style={styles.tabHeader}>
        <View style={styles.activeTab}>
          <Text style={styles.activeTabText}>Expenses</Text>
          <View style={styles.tabUnderline} />
        </View>
      </View>

      {/* Total + View All */}
      <View style={styles.tableHeader}>
        <Text style={styles.totalLabel}>
          Trip Expenses —{" "}
          <Text style={styles.totalAmount}>₹{total.toLocaleString("en-IN")}</Text>
        </Text>
        {onViewAll ? (
          <TouchableOpacity onPress={onViewAll} activeOpacity={0.7}>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Table */}
      {Platform.OS === "web" ? (
        <WebTable expenses={expenses} />
      ) : (
        <NativeList expenses={expenses} />
      )}

      {expenses.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No expenses recorded</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Web table (horizontal scroll) ────────────────────────────────────────────

function WebTable({ expenses }: { expenses: ExpenseRow[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.table}>
        {/* Header */}
        <View style={styles.tableHeadRow}>
          <ColHead label="Actions" width={90} />
          <ColHead label="Date" width={90} />
          <ColHead label="Expense ID" width={90} />
          <ColHead label="Category" width={90} />
          <ColHead label="Type" width={110} />
          <ColHead label="Description" width={160} flex />
          <ColHead label="Amount" width={80} align="right" />
          <ColHead label="Status" width={100} />
        </View>

        {/* Rows */}
        {expenses.map((row) => (
          <View key={row.id} style={styles.tableRow}>
            <ActionsCell row={row} width={90} />
            <TableCell value={row.date} width={90} />
            <TableCell value={row.expenseId} width={90} mono />
            <TableCell value={row.category} width={90} />
            <TableCell value={row.type} width={110} />
            <TableCell value={row.description} width={160} flex />
            <TableCell
              value={`₹${row.amount.toLocaleString("en-IN")}`}
              width={80}
              align="right"
              bold
            />
            <StatusCell status={row.status} width={100} row={row} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ── Native list (cards) ───────────────────────────────────────────────────────

function NativeList({ expenses }: { expenses: ExpenseRow[] }) {
  return (
    <View>
      {expenses.map((row) => (
        <View key={row.id} style={styles.nativeRow}>
          <View style={styles.nativeRowTop}>
            <Text style={styles.nativeExpenseId}>{row.expenseId}</Text>
            <Text style={styles.nativeAmount}>₹{row.amount.toLocaleString("en-IN")}</Text>
          </View>
          <View style={styles.nativeRowMid}>
            <Text style={styles.nativeMeta}>{row.date} · {row.category} · {row.type}</Text>
          </View>
          <View style={styles.nativeRowBottom}>
            <Text style={styles.nativeDesc} numberOfLines={1}>{row.description}</Text>
            <StatusPill status={row.status} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Cell components ───────────────────────────────────────────────────────────

function ColHead({
  label,
  width,
  flex,
  align,
}: {
  label: string;
  width?: number;
  flex?: boolean;
  align?: "left" | "right";
}) {
  return (
    <View style={[styles.colHead, { width: flex ? undefined : width }, flex && { flex: 1 }]}>
      <Text style={[styles.colHeadText, align === "right" && styles.alignRight]}>{label}</Text>
    </View>
  );
}

function TableCell({
  value,
  width,
  flex,
  mono,
  bold,
  align,
}: {
  value: string;
  width?: number;
  flex?: boolean;
  mono?: boolean;
  bold?: boolean;
  align?: "left" | "right";
}) {
  return (
    <View style={[styles.tableCell, { width: flex ? undefined : width }, flex && { flex: 1 }]}>
      <Text
        style={[
          styles.tableCellText,
          mono && styles.mono,
          bold && styles.bold,
          align === "right" && styles.alignRight,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function ActionsCell({ row, width }: { row: ExpenseRow; width?: number }) {
  return (
    <View style={[styles.tableCell, { width }, styles.actionsCell]}>
      {row.onView ? (
        <TouchableOpacity onPress={row.onView} style={styles.cellActionBtn} activeOpacity={0.7}>
          <FontAwesome name="eye" size={12} color="#6b7280" />
        </TouchableOpacity>
      ) : null}
      {row.onEdit ? (
        <TouchableOpacity onPress={row.onEdit} style={styles.cellActionBtn} activeOpacity={0.7}>
          <FontAwesome name="pencil" size={12} color="#6b7280" />
        </TouchableOpacity>
      ) : null}
      {row.onDelete ? (
        <TouchableOpacity onPress={row.onDelete} style={styles.cellActionBtn} activeOpacity={0.7}>
          <FontAwesome name="trash" size={12} color="#ef4444" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function StatusCell({
  status,
  width,
  row,
}: {
  status: ExpenseRow["status"];
  width?: number;
  row: ExpenseRow;
}) {
  return (
    <View style={[styles.tableCell, { width }, styles.statusCellWrap]}>
      <StatusPill status={status} />
      {status === "Requested" && (
        <>
          {row.onApprove ? (
            <TouchableOpacity onPress={row.onApprove} style={styles.microBtn} activeOpacity={0.7}>
              <FontAwesome name="check" size={10} color="#15803d" />
            </TouchableOpacity>
          ) : null}
          {row.onReject ? (
            <TouchableOpacity onPress={row.onReject} style={styles.microBtn} activeOpacity={0.7}>
              <FontAwesome name="times" size={10} color="#ef4444" />
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );
}

function StatusPill({ status }: { status: ExpenseRow["status"] }) {
  const { bg, text } = statusStyle(status);
  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      <Text style={[styles.statusPillText, { color: text }]}>{status}</Text>
    </View>
  );
}

function statusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case "Paid":
      return { bg: "#dcfce7", text: "#15803d" };
    case "Requested":
      return { bg: "#fef3c7", text: "#b45309" };
    case "Rejected":
      return { bg: "#fee2e2", text: "#ef4444" };
    default:
      return { bg: "#f3f4f6", text: "#6b7280" };
  }
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
  tabHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingHorizontal: 20,
  },
  activeTab: {
    paddingTop: 14,
    paddingBottom: 0,
    marginBottom: -1,
    position: "relative",
  },
  activeTabText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    paddingBottom: 10,
  },
  tabUnderline: {
    height: 2,
    backgroundColor: "#111827",
    borderRadius: 1,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f9fafb",
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  totalAmount: {
    fontWeight: "700",
    color: "#111827",
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    textDecorationLine: "underline",
  },
  table: {
    minWidth: "100%",
  },
  tableHeadRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    backgroundColor: "#fafafa",
  },
  colHead: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  colHeadText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f9fafb",
  },
  tableCell: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    justifyContent: "center",
  },
  tableCellText: {
    fontSize: 12,
    color: "#374151",
  },
  mono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
  },
  bold: {
    fontWeight: "700",
    color: "#111827",
  },
  alignRight: {
    textAlign: "right",
  },
  actionsCell: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  cellActionBtn: {
    padding: 3,
  },
  statusCellWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "600",
  },
  microBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  emptyWrap: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#9ca3af",
  },
  // ── Native list ──
  nativeRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f9fafb",
    gap: 4,
  },
  nativeRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  nativeExpenseId: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  nativeAmount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  nativeRowMid: {},
  nativeMeta: {
    fontSize: 11,
    color: "#9ca3af",
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
    marginRight: 8,
  },
});

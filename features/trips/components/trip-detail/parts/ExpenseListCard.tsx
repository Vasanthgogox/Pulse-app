/**
 * Trip expenses list card (white). Extracted verbatim from TripDetailScreen.tsx
 * (no behavior change).
 */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Theme } from "@/constants/Theme";
import { formatINR } from "@/lib/format";

import { type ExpenseRow } from "../sections/ExpensesTable";

export function ExpenseListCard({
  expenses,
  onAddExpense,
}: {
  expenses: ExpenseRow[];
  onAddExpense?: () => void;
}) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  function getCategoryIcon(
    category: string,
  ): React.ComponentProps<typeof FontAwesome>["name"] {
    const c = category.toLowerCase();
    if (c.includes("fuel") || c.includes("diesel") || c.includes("petrol"))
      return "tint";
    if (c.includes("toll") || c.includes("road")) return "road";
    if (c.includes("driver") || c.includes("labour")) return "user";
    if (c.includes("maintenance") || c.includes("repair")) return "wrench";
    if (c.includes("loading") || c.includes("unloading")) return "archive";
    return "file-text-o";
  }

  function getCategoryColor(category: string): string {
    const c = category.toLowerCase();
    if (c.includes("fuel") || c.includes("diesel") || c.includes("petrol"))
      return "#f97316";
    if (c.includes("toll") || c.includes("road")) return "#3b82f6";
    if (c.includes("driver") || c.includes("labour")) return "#8b5cf6";
    if (c.includes("maintenance") || c.includes("repair")) return "#ef4444";
    return "#64748b";
  }

  return (
    <View style={elStyles.card}>
      <View style={elStyles.header}>
        <View style={elStyles.headerLeft}>
          <Text style={elStyles.title}>Trip Expenses</Text>
          {expenses.length > 0 && (
            <View style={elStyles.badge}>
              <Text style={elStyles.badgeText}>{expenses.length}</Text>
            </View>
          )}
        </View>
        <View style={elStyles.headerRight}>
          <Text style={elStyles.total}>{formatINR(total)}</Text>
          {onAddExpense && (
            <TouchableOpacity
              style={elStyles.addBtn}
              onPress={onAddExpense}
              activeOpacity={0.8}
            >
              <FontAwesome name="plus" size={10} color={Theme.textOnDark} />
              <Text style={elStyles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {expenses.length === 0 ? (
        <View style={elStyles.empty}>
          <FontAwesome name="inbox" size={24} color={Theme.textMuted} />
          <Text style={elStyles.emptyText}>No expenses recorded</Text>
        </View>
      ) : (
        <View style={elStyles.list}>
          {expenses.map((exp) => {
            const iconColor = getCategoryColor(exp.category);
            const iconName = getCategoryIcon(exp.category);
            const isPaid = exp.status === "Paid";
            return (
              <View key={exp.id} style={elStyles.item}>
                <View
                  style={[
                    elStyles.itemIcon,
                    { backgroundColor: iconColor + "18" },
                  ]}
                >
                  <FontAwesome name={iconName} size={16} color={iconColor} />
                </View>
                <View style={elStyles.itemInfo}>
                  <Text style={elStyles.itemTitle} numberOfLines={1}>
                    {exp.description !== "—" ? exp.description : exp.category}
                  </Text>
                  <Text style={elStyles.itemMeta} numberOfLines={1}>
                    {exp.date} · {exp.type}
                  </Text>
                </View>
                <View style={elStyles.itemRight}>
                  <Text style={elStyles.itemAmount}>
                    ₹{exp.amount.toLocaleString("en-IN")}
                  </Text>
                  <View
                    style={[
                      elStyles.itemStatus,
                      {
                        backgroundColor: isPaid ? "#dcfce7" : "#fef3c7",
                        borderColor: isPaid ? "#bbf7d0" : "#fde68a",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        elStyles.itemStatusText,
                        { color: isPaid ? "#15803d" : "#b45309" },
                      ]}
                    >
                      {exp.status}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const elStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  badge: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  total: {
    fontSize: 20,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  addBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: { fontSize: 13, color: Theme.textMuted, fontStyle: "italic" },
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 8,
    gap: 12,
    backgroundColor: Theme.surfaceGray,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 3,
  },
  itemMeta: { fontSize: 10, color: Theme.textMuted, fontWeight: "500" },
  itemRight: { alignItems: "flex-end", gap: 4 },
  itemAmount: { fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark },
  itemStatus: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  itemStatusText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});

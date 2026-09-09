/**
 * DCO-6: Independent Operators (DCO) Finance tab. Deliberately its own tab,
 * not merged into Suppliers or Drivers — a DCO must never visually appear
 * as either. Due comes from get_dco_ledger_aggregation (derived from DCO
 * trips' supplier_rate, never a posted transaction); paid from actual
 * contact_type='dco' transactions. Layout mirrors SuppliersTab.tsx.
 */
import { EntityAvatar } from "@/components/EntityAvatar";
import { LiquidFillPill } from "@/components/LiquidFillPill";
import Theme from "@/constants/Theme";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import {
  aggregateDcoPayeesFromRpc,
  type FinancialRowData,
  type DcoPayeeName,
} from "@/features/finance/aggregation";
import { useDcoLedgerAggregationQuery } from "@/lib/queries/useLedgerAggregationQuery";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface DcoPayeesTabProps {
  organizationId: string | null;
  onRowSelect?: (data: FinancialRowData) => void;
  searchQuery?: string;
  topContent?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

export function DcoPayeesTab({
  organizationId,
  onRowSelect,
  searchQuery = "",
  topContent,
  refreshing = false,
  onRefresh,
  bottomInset = 100,
}: DcoPayeesTabProps) {
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && screenWidth >= 1024;

  const { data: dcoRpcRows = [], isPending: dcoLoading } =
    useDcoLedgerAggregationQuery(organizationId);

  const [namesByUserId, setNamesByUserId] = useState<Map<string, DcoPayeeName>>(new Map());
  useEffect(() => {
    const userIds = [...new Set(dcoRpcRows.map((r) => r.dco_user_id))];
    if (userIds.length === 0) {
      setNamesByUserId(new Map());
      return;
    }
    let cancelled = false;
    void supabase()
      .from("profiles")
      .select("id,full_name,phone")
      .in("id", userIds)
      .then(({ data }) => {
        if (cancelled) return;
        const map = new Map<string, DcoPayeeName>();
        for (const p of (data ?? []) as { id: string; full_name: string | null; phone: string | null }[]) {
          map.set(p.id, { dco_user_id: p.id, name: p.full_name ?? "", phone: p.phone });
        }
        setNamesByUserId(map);
      });
    return () => {
      cancelled = true;
    };
  }, [dcoRpcRows]);

  const { rows, totals } = useMemo(
    () => aggregateDcoPayeesFromRpc(dcoRpcRows, namesByUserId),
    [dcoRpcRows, namesByUserId],
  );

  const q = searchQuery.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) => (r.name || "").toLowerCase().includes(q));
  }, [rows, q]);

  if (dcoLoading) {
    return <Text style={styles.loading}>Loading…</Text>;
  }

  if (filteredRows.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={[styles.emptyState, { paddingBottom: bottomInset + insets.bottom }]}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.loaderAccent} />
          ) : undefined
        }
      >
        {topContent}
        <Text style={styles.emptyText}>No DCO settlements yet</Text>
      </ScrollView>
    );
  }

  const totalDue = totals.totalOut ?? 0;
  const totalPayables = totals.totalIn ?? 0;
  const settledPercent =
    totalPayables > 0 ? Math.round(((totalPayables - totalDue) / totalPayables) * 100) : 0;

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.tableScroll}
        contentContainerStyle={[styles.tableScrollContent, { paddingBottom: bottomInset + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        {...tabBarScrollProps}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.loaderAccent} />
          ) : undefined
        }
      >
        {topContent}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Due</Text>
            <Text style={styles.summaryDue}>₹{totalDue.toLocaleString("en-IN")}</Text>
          </View>
          <LiquidFillPill percentage={settledPercent} label="Settled" valueSuffix="%" />
        </View>
        <View style={styles.tableCard}>
          {filteredRows.map((data) => {
            const due = data.due ?? 0;
            const paid = data.paid ?? 0;
            const payables = data.payables ?? 0;
            const tripCount = data.trips ?? 0;
            return (
              <TouchableOpacity
                key={data.id}
                style={styles.tableRow}
                onPress={() => onRowSelect?.(data)}
                activeOpacity={0.7}
              >
                <View style={styles.tableEntityMain}>
                  <EntityAvatar
                    name={data.name ?? ""}
                    initialsColorSeed={data.id}
                    entityType="driver"
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.tableEntityName} numberOfLines={1}>
                      {data.name ?? "—"}
                    </Text>
                    <Text style={styles.tableEntitySub} numberOfLines={1}>
                      Independent Operator
                    </Text>
                  </View>
                </View>
                <View style={styles.tripsPill}>
                  <Text style={styles.tripsPillText}>{tripCount}</Text>
                </View>
                {isWebDesktop ? (
                  <>
                    <Text style={styles.tableAmtValue}>₹{payables.toLocaleString("en-IN")}</Text>
                    <Text style={styles.tableAmtPaid}>₹{paid.toLocaleString("en-IN")}</Text>
                  </>
                ) : null}
                <Text style={[styles.tableDueValue, due > 0 ? styles.tableDueUnpaid : styles.tableDueSettled]}>
                  ₹{due.toLocaleString("en-IN")}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { padding: 24, textAlign: "center", color: Theme.textSecondary },
  wrap: { flex: 1, backgroundColor: "#FBFBFF" },
  tableScroll: { flex: 1 },
  tableScrollContent: { paddingHorizontal: 0, paddingTop: 12 },
  summaryRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  summaryCard: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 28,
    padding: 16,
  },
  summaryLabel: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  summaryDue: { fontSize: 18, fontWeight: "600", fontStyle: "italic", color: Theme.teslaRed },
  tableCard: {
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableEntityMain: { flexDirection: "row", alignItems: "center", gap: 10, flex: 2, minWidth: 0 },
  tableEntityName: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tableEntitySub: { marginTop: 2, fontSize: 9, fontWeight: "500", color: Theme.textMuted },
  tripsPill: {
    minWidth: 28,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  tripsPillText: { fontSize: 9, fontWeight: "600", color: Theme.textMuted },
  tableAmtValue: { flex: 1, fontSize: 10, fontWeight: "600", color: Theme.textPrimaryDark, textAlign: "right" },
  tableAmtPaid: { flex: 1, fontSize: 10, fontWeight: "600", color: Theme.darkGreen, textAlign: "right" },
  tableDueValue: { flex: 1, fontSize: 10, fontWeight: "600", fontStyle: "italic", textAlign: "right" },
  tableDueUnpaid: { color: Theme.teslaRed },
  tableDueSettled: { color: Theme.darkGreen },
  emptyState: { paddingVertical: 24, paddingHorizontal: 16, alignItems: "center", flexGrow: 1 },
  emptyText: { fontSize: 12, fontWeight: "600", color: Theme.textMuted, marginTop: 12 },
});

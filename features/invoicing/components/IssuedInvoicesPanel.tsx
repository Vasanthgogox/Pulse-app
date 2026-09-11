/**
 * Issued invoices from public.invoices. Not AR. Payment state is not inferred.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import { issuedInvoicesForPodToggle } from "@/features/invoicing/utils/invoicePodRequired.util";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function IssuedInvoicesPanel({
  invoices,
  podRequired,
  refreshing,
  onRefresh,
}: {
  invoices: IssuedInvoiceListRow[];
  podRequired: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const rows = issuedInvoicesForPodToggle(invoices, podRequired);

  return (
    <FlatList
      style={styles.list}
      data={rows}
      keyExtractor={(item) => item.id}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={Theme.loaderAccent}
          />
        ) : undefined
      }
      contentContainerStyle={styles.content}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No issued invoices</Text>
          <Text style={styles.emptySub}>
            Created invoices stay here. POD Required does not hide them.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.number} numberOfLines={1}>
              {item.invoice_number || "—"}
            </Text>
            <Text style={styles.status} numberOfLines={1}>
              {item.status}
            </Text>
          </View>
          <Text style={styles.client} numberOfLines={1}>
            {item.client_name || "—"}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>Date {item.invoice_date || "—"}</Text>
            <Text style={styles.meta}>Due {item.due_date || "—"}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.total}>{formatInr(item.total_amount)}</Text>
            <Text style={styles.meta}>
              {item.trip_ids.length} trip{item.trip_ids.length === 1 ? "" : "s"}
            </Text>
          </View>
          <Text style={styles.unsupported}>
            Invoice-level payment / allocation is not supported on this surface.
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: Theme.screenBackground },
  content: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 32,
    flexGrow: 1,
  },
  empty: { alignItems: "center", paddingVertical: 48 },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  emptySub: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    padding: 12,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  number: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  status: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  client: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  metaRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  meta: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  total: { fontSize: 14, fontWeight: "800", color: Theme.textPrimary },
  unsupported: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});

import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import { OperationalBottomActionBar, OperationalButton, OperationalDetailSkeleton, Surface } from "@/components/operational";
import { ReconciliationMismatchCard } from "./ReconciliationMismatchCard";
import { useLedgerReconciliation } from "./useLedgerReconciliation";

export function ReconciliationWorkbench({
  organizationId,
  tripId = null,
  enabled = true,
}: {
  organizationId: string | null;
  tripId?: string | null;
  enabled?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const query = useLedgerReconciliation({ organizationId, tripId, enabled });
  const rows = query.data ?? [];
  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.mismatchId)),
    [rows, selected],
  );
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!enabled) return null;
  if (query.isLoading) return <OperationalDetailSkeleton />;
  return (
    <Surface style={styles.container} elevation={2}>
      <View style={styles.header}>
        <Text style={styles.title}>Reconciliation workbench</Text>
        <Text style={styles.subtitle}>{rows.length} mismatch item(s)</Text>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>No mismatches detected.</Text>
        ) : (
          rows.map((row) => (
            <ReconciliationMismatchCard
              key={row.mismatchId}
              row={row}
              selected={selected.has(row.mismatchId)}
              onToggle={toggle}
            />
          ))
        )}
      </ScrollView>
      {selectedRows.length > 0 ? (
        <OperationalBottomActionBar style={styles.actionBar}>
          <View style={styles.actions}>
            <OperationalButton
              intent="utility"
              label="Retry posting"
              onPress={async () => {
                await query.retryPosting.mutateAsync(selectedRows);
                setSelected(new Set());
              }}
            />
            <OperationalButton
              intent="list"
              label="Mark ignored"
              onPress={async () => {
                await query.markIgnored.mutateAsync(selectedRows);
                setSelected(new Set());
              }}
            />
            <OperationalButton
              intent="approval"
              label="Mark resolved"
              onPress={async () => {
                await query.markResolved.mutateAsync(selectedRows);
                setSelected(new Set());
              }}
            />
          </View>
        </OperationalBottomActionBar>
      ) : null}
      {query.isError ? (
        <Pressable onPress={() => query.refetch()}>
          <Text style={styles.retry}>Failed to load reconciliation, tap to retry.</Text>
        </Pressable>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    gap: 8,
  },
  header: {
    gap: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    color: Theme.textPrimary,
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 11,
    color: Theme.textSecondary,
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    gap: 8,
    paddingBottom: 10,
  },
  empty: {
    fontSize: 12,
    color: Theme.textSecondary,
    fontStyle: "italic",
  },
  retry: {
    fontSize: 11,
    color: Theme.negative,
  },
  actionBar: {
    paddingHorizontal: 0,
    borderTopWidth: 0,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});

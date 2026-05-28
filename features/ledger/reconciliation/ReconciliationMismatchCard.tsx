import { Pressable, StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import { Surface } from "@/components/operational";
import type { ReconciliationMismatchView } from "./useLedgerReconciliation";

export function ReconciliationMismatchCard({
  row,
  selected,
  onToggle,
}: {
  row: ReconciliationMismatchView;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.header}>
        <Text style={styles.tripLabel} numberOfLines={1}>
          {row.tripLabel}
        </Text>
        <Pressable
          onPress={() => onToggle(row.mismatchId)}
          style={[styles.selectPill, selected && styles.selectPillActive]}
        >
          <Text style={[styles.selectText, selected && styles.selectTextActive]}>
            {selected ? "Selected" : "Select"}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.meta}>
        {row.sourceType.toUpperCase()} · posting {row.postingState} · ledger{" "}
        {row.ledgerState}
      </Text>
      <Text style={styles.meta}>
        {row.shouldPost ? "Should post" : "No posting expected"} ·{" "}
        {row.hasLedgerEntry ? "Ledger row present" : "Ledger row missing"}
      </Text>
      {row.markState ? (
        <Text style={styles.markState}>Marked {row.markState}</Text>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 10,
    gap: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  tripLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  meta: {
    fontSize: 11,
    color: Theme.textSecondary,
  },
  markState: {
    fontSize: 10,
    color: Theme.warning,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  selectPill: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectPillActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primaryLight,
  },
  selectText: {
    fontSize: 10,
    color: Theme.textMuted,
    fontWeight: "600",
  },
  selectTextActive: {
    color: Theme.primary,
  },
});

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import type { FinanceAgingKind } from "@/features/business-pulse/selectors/pulseAgingSelectors";

type Props = {
  financeLedger?: FinanceAgingKind;
  onFinanceLedger?: (ledger: FinanceAgingKind) => void;
};

function LedgerChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.ledgerChip, active && styles.ledgerChipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.ledgerChipText, active && styles.ledgerChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** Finance tab only — receivable vs payable drilldown scope. */
export function PulseContributionFilters({
  financeLedger = "receivable",
  onFinanceLedger,
}: Props) {
  if (!onFinanceLedger) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.laneTitle}>Finance ledger</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.laneScroll}
        keyboardShouldPersistTaps="handled"
      >
        {(
          [
            { key: "receivable", label: "Receivable" },
            { key: "payable", label: "Payable" },
          ] as const
        ).map((item) => (
          <LedgerChip
            key={item.key}
            label={item.label}
            active={financeLedger === item.key}
            onPress={() => onFinanceLedger(item.key)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  laneTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  laneScroll: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },
  ledgerChip: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Theme.surface,
    minWidth: 68,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerChipActive: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.primary,
  },
  ledgerChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.text,
  },
  ledgerChipTextActive: {
    color: Theme.buttonPrimaryText,
  },
});

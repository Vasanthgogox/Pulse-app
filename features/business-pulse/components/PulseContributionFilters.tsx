import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronUp, Filter, RotateCcw } from "lucide-react-native";
import Theme from "@/constants/Theme";
import type { FinanceAgingKind } from "@/features/business-pulse/selectors/pulseAgingSelectors";

type Props = {
  activeDomain?: string;
  financeLedger?: FinanceAgingKind;
  onFinanceLedger?: (ledger: FinanceAgingKind) => void;
  onReset: () => void;
};

function HorizontalContributionLane({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.lane}>
      <View style={styles.laneHeader}>
        <Text style={styles.laneTitle}>{title}</Text>
        {hint ? <Text style={styles.laneHint}>{hint}</Text> : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.laneScroll}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

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

export function PulseContributionFilters({
  activeDomain,
  financeLedger = "receivable",
  onFinanceLedger,
  onReset,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  const activeChips = useMemo(() => {
    if (activeDomain !== "finance") return [];
    return [{ id: `finance-${financeLedger}`, label: financeLedger === "receivable" ? "Receivable" : "Payable" }];
  }, [activeDomain, financeLedger]);

  const collapsed = !expanded;
  const showFinanceLane = activeDomain === "finance" && onFinanceLedger;

  if (!showFinanceLane && collapsed) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <Filter size={12} color={Theme.primary} />
          <Text style={styles.toolbarTitle}>
            {collapsed ? `Active filters (${activeChips.length})` : "More filters"}
          </Text>
        </View>
        <View style={styles.toolbarActions}>
          {showFinanceLane ? (
            <Pressable
              style={styles.expandBtn}
              onPress={() => setExpanded((value) => !value)}
              hitSlop={8}
            >
              {expanded ? (
                <ChevronUp size={12} color={Theme.primary} />
              ) : (
                <ChevronDown size={12} color={Theme.primary} />
              )}
              <Text style={styles.expandText}>{expanded ? "Collapse" : "Expand"}</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.resetBtn} onPress={onReset} hitSlop={8}>
            <RotateCcw size={11} color={Theme.primary} />
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        </View>
      </View>

      {collapsed ? (
        showFinanceLane && activeChips.length > 0 ? (
          <View style={styles.collapsedPanel}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.laneScroll}
            >
              {activeChips.map((chip) => (
                <View key={chip.id} style={styles.activeChip}>
                  <Text style={styles.activeChipText} numberOfLines={1}>
                    {chip.label}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null
      ) : showFinanceLane ? (
        <View style={styles.lanesWrap}>
          <HorizontalContributionLane title="Finance ledger" hint="Drilldown scope">
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
          </HorizontalContributionLane>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  toolbarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  toolbarTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.text,
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
  },
  expandText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.primary,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  resetText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.primary,
  },
  collapsedPanel: {
    minHeight: 32,
    justifyContent: "center",
  },
  lanesWrap: {
    gap: 10,
  },
  lane: {
    gap: 6,
  },
  laneHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  laneTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  laneHint: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  laneScroll: {
    gap: 8,
    paddingRight: 8,
  },
  ledgerChip: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.surface,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerChipActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  ledgerChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.text,
  },
  ledgerChipTextActive: {
    color: "#fff",
  },
  activeChip: {
    borderWidth: 1,
    borderColor: Theme.primary,
    backgroundColor: "#eef2ff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 4,
  },
  activeChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    maxWidth: 160,
  },
});

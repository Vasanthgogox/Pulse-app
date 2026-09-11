import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import {
  OBLIGATION_AGE_BUCKETS,
  OBLIGATION_AGE_LABELS,
  type CanvasSelection,
  type ObligationAgeBucket,
  type PipelineStageId,
} from "../model/financeProTypes";
import { Pressable, Platform, StyleSheet, Text, View } from "react-native";

const AGE_CHIPS: ObligationAgeBucket[] = [...OBLIGATION_AGE_BUCKETS];

const STAGE_CHIPS: { id: PipelineStageId; label: string }[] = [
  { id: "pod_pending", label: "POD" },
  { id: "ready_to_invoice", label: "Ready" },
  { id: "invoiced", label: "Invoiced" },
];

function Chip({
  label,
  on,
  onPress,
  dismiss,
}: {
  label: string;
  on?: boolean;
  onPress: () => void;
  dismiss?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(on) }}
      accessibilityLabel={dismiss ? `Clear ${label}` : label}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
      {dismiss ? <Text style={styles.x}>×</Text> : null}
    </Pressable>
  );
}

export function FinanceProCommandFilters({
  selection,
  onToggleAge,
  onToggleStage,
  onClearClient,
}: {
  selection: CanvasSelection;
  onToggleAge: (bucket: ObligationAgeBucket) => void;
  onToggleStage: (stage: PipelineStageId) => void;
  onClearClient: () => void;
}) {
  return (
    <View style={styles.row} accessibilityRole="toolbar" accessibilityLabel="Command filters">
      {selection.clientName ? (
        <Chip
          label={selection.clientName}
          on
          dismiss
          onPress={onClearClient}
        />
      ) : null}
      {AGE_CHIPS.map((bucket) => (
        <Chip
          key={bucket}
          label={
            bucket === "current"
              ? OBLIGATION_AGE_LABELS[bucket]
              : `${OBLIGATION_AGE_LABELS[bucket]}d`
          }
          on={selection.ageBucket === bucket}
          onPress={() => onToggleAge(bucket)}
        />
      ))}
      <View style={styles.divider} />
      {STAGE_CHIPS.map((stage) => (
        <Chip
          key={stage.id}
          label={stage.label}
          on={selection.pipelineStage === stage.id}
          onPress={() => onToggleStage(stage.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    ...(Platform.OS === "web"
      ? ({ overflowX: "auto" } as const)
      : null),
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 26,
    flexShrink: 0,
    borderRadius: 6,
    backgroundColor: "#F1F1F4",
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipOn: {
    backgroundColor: "rgba(62, 151, 255, 0.12)",
    borderColor: "rgba(62, 151, 255, 0.35)",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  chipTextOn: {
    color: METRONIC.link,
    fontWeight: "700",
  },
  x: {
    fontSize: 12,
    fontWeight: "700",
    color: METRONIC.link,
    lineHeight: 14,
    marginLeft: 1,
  },
  divider: {
    width: 1,
    height: 14,
    backgroundColor: METRONIC.border,
    marginHorizontal: 2,
  },
});

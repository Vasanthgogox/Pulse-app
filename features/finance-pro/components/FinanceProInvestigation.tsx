import {
  compactInvestigationLine,
  type InvestigationBrief,
} from "../model/investigation.util";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function FinanceProInvestigation({
  brief,
  onClear,
  story,
  actionLabel,
  onAction,
}: {
  brief: InvestigationBrief;
  onClear: () => void;
  story?: string | null;
  actionLabel?: string;
  onAction?: () => void;
}) {
  if (!brief.active || !brief.label) return null;

  const line = story?.trim() || compactInvestigationLine(brief);

  return (
    <View style={styles.chip} accessibilityRole="summary">
      <Text style={styles.line} numberOfLines={1}>
        {line}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={6}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onClear}
        hitSlop={8}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="Clear investigation"
      >
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  line: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  action: {
    flexShrink: 0,
    paddingHorizontal: 6,
    paddingVertical: 4,
    minHeight: 28,
    justifyContent: "center",
  },
  actionText: {
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.link,
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  closeText: {
    fontSize: 16,
    fontWeight: "600",
    color: METRONIC.muted,
    lineHeight: 18,
  },
});

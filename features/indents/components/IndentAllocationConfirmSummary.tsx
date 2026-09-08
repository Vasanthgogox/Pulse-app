/**
 * Final-step / OTP allocation review — rows with optional Edit → prior wizard step.
 */
import { memo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Theme from "@/constants/Theme";

export type IndentAllocationConfirmRow = {
  id: string;
  label: string;
  value: string;
  /** Jump back to this wizard step (omitted on OTP / read-only). */
  onEdit?: () => void;
};

export type IndentAllocationConfirmSummaryProps = {
  title?: string;
  hint?: string | null;
  rows: readonly IndentAllocationConfirmRow[];
};

export const IndentAllocationConfirmSummary = memo(
  function IndentAllocationConfirmSummary({
    title = "Confirm allocation",
    hint = "Tap Edit to change a detail before converting.",
    rows,
  }: IndentAllocationConfirmSummaryProps) {
    if (!rows.length) return null;

    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>{title}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        <View style={styles.card}>
          {rows.map((row, index) => (
            <View
              key={row.id}
              style={[
                styles.row,
                index < rows.length - 1 ? styles.rowBorder : null,
              ]}
            >
              <View style={styles.rowText}>
                <Text style={styles.label}>{row.label}</Text>
                <Text style={styles.value} numberOfLines={2}>
                  {row.value}
                </Text>
              </View>
              {row.onEdit ? (
                <Pressable
                  onPress={row.onEdit}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${row.label}`}
                  style={styles.editHit}
                >
                  <Text style={styles.edit}>Edit</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  hint: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 18,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 58,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  value: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  editHit: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  edit: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.primary,
  },
});

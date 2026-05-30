import { memo } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import type { ClientPassThroughRecommendation } from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentPassThrough.util";

export type ProvisionDeductionConfirmModalProps = {
  visible: boolean;
  recommendation: ClientPassThroughRecommendation | null;
  isAssetExecution: boolean;
  costPartyName: string;
  /** Current revised trip cost (before this deduction). */
  adjCost: number;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export const ProvisionDeductionConfirmModal = memo(function ProvisionDeductionConfirmModal(
  props: ProvisionDeductionConfirmModalProps,
) {
  const rec = props.recommendation;
  if (!props.visible || !rec) return null;

  const costAccent = "#0f766e";
  const deductAmount = Math.max(0, Number(rec.amount) || 0);
  const revisedAfter = Math.max(0, props.adjCost - deductAmount);
  const partyNoun = props.isAssetExecution ? "driver" : "supplier";

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      onRequestClose={props.onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onCancel} />
        <View style={styles.card} pointerEvents="box-none">
          <Text style={styles.title}>Confirm {partyNoun} deduction</Text>
          <Text style={styles.subtitle}>
            Posts a cost credit note (CN) on {props.costPartyName.trim() || partyNoun} —
            revised trip cost and {partyNoun} finance totals update immediately.
          </Text>

          <View style={styles.block}>
            <Text style={styles.blockLabel}>Client sale CN (source)</Text>
            <Text style={styles.line}>{rec.clientReason}</Text>
            <Text style={styles.amountMuted}>{formatINR(deductAmount)}</Text>
          </View>

          <View style={[styles.block, styles.blockAccent]}>
            <Text style={[styles.blockLabel, { color: costAccent }]}>
              {props.isAssetExecution ? "Driver" : "Supplier"} deduction
            </Text>
            <Text style={styles.line}>{rec.costReason}</Text>
            <Text style={[styles.amount, { color: Theme.darkGreen }]}>
              −{formatINR(deductAmount)}
            </Text>
          </View>

          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>Revised trip cost after</Text>
            <Text style={styles.previewValue}>
              {formatINR(props.adjCost)} → {formatINR(revisedAfter)}
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={props.onCancel}
              disabled={props.submitting}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: costAccent }]}
              onPress={props.onConfirm}
              disabled={props.submitting}
              activeOpacity={0.88}
            >
              {props.submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmText}>Post deduction</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  block: {
    marginTop: 4,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    gap: 4,
  },
  blockAccent: {
    backgroundColor: "rgba(15,118,110,0.06)",
    borderWidth: 1,
    borderColor: "rgba(15,118,110,0.2)",
  },
  blockLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  line: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  amountMuted: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  amount: {
    fontSize: 18,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 4,
  },
  previewLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  previewValue: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#f1f5f9",
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  confirmBtn: {
    flex: 1.2,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
});

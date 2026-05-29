import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import type { ClientPassThroughRecommendation } from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentPassThrough.util";

type Props = {
  recommendations: ClientPassThroughRecommendation[];
  isAssetExecution: boolean;
  onRequestDeduction: (rec: ClientPassThroughRecommendation) => void;
};

export const ProvisionPassThroughCard = memo(function ProvisionPassThroughCard({
  recommendations,
  isAssetExecution,
  onRequestDeduction,
}: Props) {
  if (recommendations.length === 0) return null;

  const partyNoun = isAssetExecution ? "driver" : "supplier";

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Feather name="minus-circle" size={14} color="#0f766e" />
        <View style={styles.headerText}>
          <Text style={styles.title}>{partyNoun} deduction recommended</Text>
          <Text style={styles.hint}>
            Client sale CN is on the books — post the matching cost CN to reduce{" "}
            {partyNoun} trip cost and update finance totals.
          </Text>
        </View>
      </View>
      {recommendations.map((rec) => (
        <View key={rec.id} style={styles.row}>
          <View style={styles.rowBody}>
            <Text style={styles.rowEyebrow}>Client CN · {rec.clientReason}</Text>
            <Text style={styles.rowAmount}>{formatINR(rec.amount)}</Text>
            <Text style={styles.rowMeta} numberOfLines={2}>
              → {rec.costReason} · {rec.targetLabel}
            </Text>
          </View>
          <Pressable
            style={styles.deductBtn}
            onPress={() => onRequestDeduction(rec)}
            accessibilityRole="button"
            accessibilityLabel={`Confirm ${partyNoun} deduction ${formatINR(rec.amount)}`}
          >
            <Text style={styles.deductBtnText}>Deduct</Text>
            <Feather name="chevron-right" size={12} color="#fff" />
          </Pressable>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(15,118,110,0.28)",
    backgroundColor: "rgba(15,118,110,0.06)",
    padding: 12,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  headerText: { flex: 1, minWidth: 0, gap: 3 },
  title: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  hint: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(15,118,110,0.18)",
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowEyebrow: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  rowMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0f766e",
  },
  deductBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#0f766e",
    flexShrink: 0,
  },
  deductBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});

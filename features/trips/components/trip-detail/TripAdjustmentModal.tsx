/**
 * Modal to add a trip adjustment (revenue or cost, +/−).
 * Adjustments alter revenue (sales) or supplier cost — not in/out ledger.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  COST_REASON_OPTIONS,
  REVENUE_REASON_OPTIONS,
  type TripAdjustmentImpact,
  type TripAdjustmentType,
} from "../../services/tripAdjustments";

export interface TripAdjustmentModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (params: {
    type: TripAdjustmentType;
    impact: TripAdjustmentImpact;
    amount: number;
    reason: string;
  }) => void;
}

const BLUEPRINT_BG = "#111827";

export function TripAdjustmentModal({
  visible,
  onClose,
  onSave,
}: TripAdjustmentModalProps) {
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<TripAdjustmentType>("revenue");
  const [impact, setImpact] = useState<TripAdjustmentImpact>("plus");
  const [amountStr, setAmountStr] = useState("");
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");

  const reasonOptions = type === "revenue" ? REVENUE_REASON_OPTIONS : COST_REASON_OPTIONS;
  const selectedReason = reason === "Other" ? (otherReason.trim() || "Other") : reason;

  const handleCommit = () => {
    const amount = Math.round(parseFloat(amountStr.replace(/,/g, "")) || 0);
    if (amount <= 0) return;
    const finalReason = selectedReason || (type === "revenue" ? "Revenue adjustment" : "Cost adjustment");
    onSave({ type, impact, amount, reason: finalReason });
    setAmountStr("");
    setReason("");
    setOtherReason("");
    onClose();
  };

  const amountNum = parseFloat(amountStr.replace(/,/g, "")) || 0;
  const canCommit = amountNum > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.wrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} activeOpacity={0.8} accessibilityLabel="Close">
            <FontAwesome name="chevron-left" size={18} color={Theme.textMuted} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Add Adjustment</Text>
            <Text style={styles.headerSubtitle}>modify trip amounts</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Type: Revenue (Sale) | Cost (Supplier) */}
          <Text style={styles.sectionLabel}>Adjustment Type</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeBtn, type === "revenue" && styles.typeBtnActive]}
              onPress={() => { setType("revenue"); setReason(""); setOtherReason(""); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.typeBtnText, type === "revenue" && styles.typeBtnTextActive]}>
                Revenue (Sale)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, type === "cost" && styles.typeBtnActive]}
              onPress={() => { setType("cost"); setReason(""); setOtherReason(""); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.typeBtnText, type === "cost" && styles.typeBtnTextActive]}>
                Cost (Supplier)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Impact: Addition | Deduction */}
          <Text style={styles.sectionLabel}>Impact</Text>
          <View style={styles.impactRow}>
            <TouchableOpacity
              style={[styles.impactBtn, impact === "plus" && styles.impactBtnPlus]}
              onPress={() => setImpact("plus")}
              activeOpacity={0.8}
            >
              <FontAwesome name="plus-circle" size={14} color={impact === "plus" ? Theme.textOnPrimary : Theme.textMuted} style={styles.impactIcon} />
              <Text style={[styles.impactBtnText, impact === "plus" && styles.impactBtnTextActive]}>
                Addition
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.impactBtn, impact === "minus" && styles.impactBtnMinus]}
              onPress={() => setImpact("minus")}
              activeOpacity={0.8}
            >
              <FontAwesome name="minus-circle" size={14} color={impact === "minus" ? Theme.textOnPrimary : Theme.textMuted} style={styles.impactIcon} />
              <Text style={[styles.impactBtnText, impact === "minus" && styles.impactBtnTextActive]}>
                Deduction
              </Text>
            </TouchableOpacity>
          </View>

          {/* Amount */}
          <Text style={styles.sectionLabel}>Amount</Text>
          <View style={styles.amountWrap}>
            <Text style={styles.currencyPrefix}>₹</Text>
            <TextInput
              style={styles.amountInput}
              value={amountStr}
              onChangeText={setAmountStr}
              placeholder="0"
              placeholderTextColor={Theme.textMuted}
              keyboardType="numeric"
              maxLength={14}
            />
          </View>

          {/* Reason */}
          <Text style={styles.sectionLabel}>Reason</Text>
          <View style={styles.chipWrap}>
            {reasonOptions.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, reason === r && styles.chipActive]}
                onPress={() => setReason(r)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, reason === r && styles.chipTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {reason === "Other" && (
            <TextInput
              style={styles.otherInput}
              value={otherReason}
              onChangeText={setOtherReason}
              placeholder="Describe reason..."
              placeholderTextColor={Theme.textMuted}
              maxLength={80}
            />
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
          <TouchableOpacity
            style={[styles.commitBtn, !canCommit && styles.commitBtnDisabled]}
            onPress={handleCommit}
            disabled={!canCommit}
            activeOpacity={0.9}
          >
            <FontAwesome name="check" size={16} color={Theme.primary} style={styles.commitIcon} />
            <Text style={styles.commitBtnText}>Save Adjustment</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Theme.screenBackground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "rgba(255,255,255,0.8)",
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  headerCenter: { alignItems: "center" },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  headerSubtitle: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    marginTop: 2,
    textTransform: "uppercase",
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 32 },
  sectionLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  typeRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  typeBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
  },
  typeBtnActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
  },
  typeBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  typeBtnTextActive: { color: Theme.textOnPrimary },
  impactRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  impactBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    gap: 8,
  },
  impactBtnPlus: {
    borderColor: Theme.darkGreen,
    backgroundColor: Theme.darkGreen,
  },
  impactBtnMinus: {
    borderColor: Theme.teslaRed,
    backgroundColor: Theme.teslaRed,
  },
  impactIcon: { marginRight: 0 },
  impactBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  impactBtnTextActive: { color: Theme.textOnPrimary },
  amountWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    backgroundColor: Theme.surface,
  },
  currencyPrefix: {
    fontSize: 28,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  amountInput: {
    fontSize: 32,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    minWidth: 120,
    padding: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  chipActive: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.textPrimaryDark,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  chipTextActive: { color: Theme.textOnPrimary },
  otherInput: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  commitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: BLUEPRINT_BG,
    gap: 10,
  },
  commitBtnDisabled: { opacity: 0.5 },
  commitIcon: {},
  commitBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});

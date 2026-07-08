/**
 * Modal to add a trip adjustment (revenue or cost, +/−).
 * Narrow viewports use the step wizard + ticket review (ledger-style).
 */
import Theme from "@/constants/Theme";
import { TripAdjustmentMobileWizard } from "@/features/trips/components/trip-detail/adjustment/TripAdjustmentMobileWizard";
import { TripAdjustmentSuccessView } from "@/features/trips/components/trip-detail/adjustment/TripAdjustmentSuccessView";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
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
  }) => void | Promise<void>;
  /** When set (e.g. provision CN/DN), seeds fields; omitted fields stay editable in the wizard. */
  preset?: {
    type?: TripAdjustmentType;
    impact?: TripAdjustmentImpact;
    reasonSeed?: string | null;
  } | null;
  entryContextLabel?: string | null;
  tripCode?: string | null;
}

const MOBILE_WIZARD_MAX_WIDTH = 680;

function applyPresetToDraft(
  preset: TripAdjustmentModalProps["preset"],
  setType: (t: TripAdjustmentType) => void,
  setImpact: (i: TripAdjustmentImpact) => void,
  setReason: (r: string) => void,
  setOtherReason: (r: string) => void,
) {
  if (preset) {
    setType(preset.type ?? "revenue");
    setImpact(preset.impact ?? "plus");
    const seed = preset.reasonSeed?.trim() ?? "";
    const lane = preset.type ?? "revenue";
    const opts = lane === "revenue" ? REVENUE_REASON_OPTIONS : COST_REASON_OPTIONS;
    if (seed && (opts as readonly string[]).includes(seed)) {
      setReason(seed);
      setOtherReason("");
    } else if (seed) {
      setReason("Other");
      setOtherReason(seed);
    } else {
      setReason("");
      setOtherReason("");
    }
  } else {
    setType("revenue");
    setImpact("plus");
    setReason("");
    setOtherReason("");
  }
}

export function TripAdjustmentModal({
  visible,
  onClose,
  onSave,
  preset = null,
  entryContextLabel = null,
  tripCode = null,
}: TripAdjustmentModalProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const useMobileWizard = width < MOBILE_WIZARD_MAX_WIDTH;

  const [type, setType] = useState<TripAdjustmentType>("revenue");
  const [impact, setImpact] = useState<TripAdjustmentImpact>("plus");
  const [amountStr, setAmountStr] = useState("");
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{
    type: TripAdjustmentType;
    impact: TripAdjustmentImpact;
    amount: number;
    reason: string;
  } | null>(null);

  const laneLocked = preset?.type != null;
  const impactLocked = preset?.impact != null;
  const reasonLocked = Boolean(preset?.reasonSeed?.trim());

  const flowSessionKey = useMemo(
    () =>
      visible
        ? `${preset?.type ?? "x"}-${preset?.impact ?? "x"}-${preset?.reasonSeed ?? ""}-${tripCode ?? ""}`
        : "",
    [visible, preset?.type, preset?.impact, preset?.reasonSeed, tripCode],
  );

  useEffect(() => {
    if (!visible) {
      setSuccess(null);
      setSubmitting(false);
      return;
    }
    applyPresetToDraft(preset, setType, setImpact, setReason, setOtherReason);
    setAmountStr("");
  }, [visible, preset]);

  const reasonOptions = type === "revenue" ? REVENUE_REASON_OPTIONS : COST_REASON_OPTIONS;
  const selectedReason = reason === "Other" ? otherReason.trim() || "Other" : reason;
  const amountNum = Math.round(parseFloat(amountStr.replace(/,/g, "")) || 0);
  const canCommit =
    amountNum > 0 &&
    (selectedReason.length > 0 || reasonOptions.length > 0);

  const handleCommit = useCallback(async () => {
    if (!canCommit || submitting) return;
    const finalReason =
      selectedReason || (type === "revenue" ? "Revenue adjustment" : "Cost adjustment");
    setSubmitting(true);
    try {
      await onSave({ type, impact, amount: amountNum, reason: finalReason });
      if (useMobileWizard) {
        setSuccess({ type, impact, amount: amountNum, reason: finalReason });
      } else {
        setAmountStr("");
        setReason("");
        setOtherReason("");
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    canCommit,
    submitting,
    selectedReason,
    type,
    impact,
    amountNum,
    onSave,
    useMobileWizard,
    onClose,
  ]);

  const handleSuccessDone = useCallback(() => {
    setSuccess(null);
    setAmountStr("");
    setReason("");
    setOtherReason("");
    onClose();
  }, [onClose]);

  if (!visible) return null;

  if (useMobileWizard && success) {
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={handleSuccessDone}>
        <TripAdjustmentSuccessView
          type={success.type}
          impact={success.impact}
          amount={success.amount}
          reason={success.reason}
          tripCode={tripCode}
          onDone={handleSuccessDone}
        />
      </Modal>
    );
  }

  if (useMobileWizard) {
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
        <TripAdjustmentMobileWizard
          entryContextLabel={entryContextLabel}
          tripCode={tripCode}
          type={type}
          onTypeChange={setType}
          laneLocked={laneLocked}
          impact={impact}
          onImpactChange={setImpact}
          impactLocked={impactLocked}
          amountStr={amountStr}
          onAmountChange={setAmountStr}
          reason={reason}
          onReasonChange={setReason}
          otherReason={otherReason}
          onOtherReasonChange={setOtherReason}
          reasonLocked={reasonLocked}
          showProtocolShortcuts={!reasonLocked}
          canSubmit={canCommit}
          submitting={submitting}
          onSubmit={() => void handleCommit()}
          onClose={onClose}
          flowSessionKey={flowSessionKey}
        />
      </Modal>
    );
  }

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
          <Text style={styles.sectionLabel}>Adjustment Type</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeBtn, type === "revenue" && styles.typeBtnActive]}
              onPress={() => {
                setType("revenue");
                setReason("");
                setOtherReason("");
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.typeBtnText, type === "revenue" && styles.typeBtnTextActive]}>
                Revenue (Sale)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, type === "cost" && styles.typeBtnActive]}
              onPress={() => {
                setType("cost");
                setReason("");
                setOtherReason("");
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.typeBtnText, type === "cost" && styles.typeBtnTextActive]}>
                Cost (Supplier)
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Impact</Text>
          <View style={styles.impactRow}>
            <TouchableOpacity
              style={[styles.impactBtn, impact === "plus" && styles.impactBtnPlus]}
              onPress={() => setImpact("plus")}
              activeOpacity={0.8}
            >
              <FontAwesome
                name="plus-circle"
                size={14}
                color={impact === "plus" ? Theme.textOnPrimary : Theme.textMuted}
                style={styles.impactIcon}
              />
              <Text style={[styles.impactBtnText, impact === "plus" && styles.impactBtnTextActive]}>
                Addition
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.impactBtn, impact === "minus" && styles.impactBtnMinus]}
              onPress={() => setImpact("minus")}
              activeOpacity={0.8}
            >
              <FontAwesome
                name="minus-circle"
                size={14}
                color={impact === "minus" ? Theme.textOnPrimary : Theme.textMuted}
                style={styles.impactIcon}
              />
              <Text style={[styles.impactBtnText, impact === "minus" && styles.impactBtnTextActive]}>
                Deduction
              </Text>
            </TouchableOpacity>
          </View>

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
            style={[styles.commitBtn, (!canCommit || submitting) && styles.commitBtnDisabled]}
            onPress={() => void handleCommit()}
            disabled={!canCommit || submitting}
            activeOpacity={0.9}
          >
            <FontAwesome name="check" size={16} color={Theme.primary} style={styles.commitIcon} />
            <Text style={styles.commitBtnText}>
              {submitting ? "Saving…" : "Save Adjustment"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const BLUEPRINT_BG = "#111827";

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
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
  },
  typeBtnActive: {
    backgroundColor: Theme.buttonPrimary,
  },
  typeBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  typeBtnTextActive: { color: Theme.buttonPrimaryText },
  impactRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  impactBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    backgroundColor: Theme.surfaceGray,
    gap: 8,
  },
  impactBtnPlus: {
    backgroundColor: Theme.darkGreen,
  },
  impactBtnMinus: {
    backgroundColor: Theme.teslaRed,
  },
  impactIcon: { marginRight: 0 },
  impactBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  impactBtnTextActive: { color: Theme.buttonPrimaryText },
  amountWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    paddingVertical: 20,
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
      } as object,
    }),
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Theme.screenBackground,
  },
  chipActive: {
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
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
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
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});

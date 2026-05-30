/**
 * Provision CN/DN hub + in-modal wizard + success (mobile-aligned with ledger flow).
 */
import Theme from "@/constants/Theme";
import {
  ProvisionRevisedPartiesCard,
  type ProvisionCostBreakdownLine,
} from "@/features/trips/components/trip-detail/adjustment/ProvisionRevisedPartiesCard";
import { TripAdjustmentMobileWizard } from "@/features/trips/components/trip-detail/adjustment/TripAdjustmentMobileWizard";
import { TripAdjustmentSuccessView } from "@/features/trips/components/trip-detail/adjustment/TripAdjustmentSuccessView";
import {
  ASSET_DRIVER_DEDUCTION_PROTOCOL_CHIPS,
  ASSET_DRIVER_PAYMENT_PROTOCOL_CHIPS,
  FINANCE_PROTOCOL_CHIPS,
  protocolAssetDriverDeductionAdjustment,
  protocolAssetDriverPaymentAdjustment,
  protocolClientChipAdjustment,
  protocolSupplierChipAdjustment,
} from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentFlow.util";
import {
  passThroughRecommendationAfterClientSave,
  type ClientPassThroughRecommendation,
} from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentPassThrough.util";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import {
  COST_REASON_OPTIONS,
  getAdjustmentReasonOptions,
  REVENUE_REASON_OPTIONS,
  isAdjustmentVoided,
  type TripAdjustmentImpact,
  type TripAdjustmentType,
} from "@/features/trips/services/tripAdjustments";
import Feather from "@expo/vector-icons/Feather";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ProvisionSide = "client" | "supplier";

type FlowPhase = "hub" | "wizard" | "success";

export type ProvisionAdjustmentPreset = {
  type?: TripAdjustmentType;
  impact?: TripAdjustmentImpact;
  reasonSeed?: string | null;
  amountSeed?: number | null;
  /** Client sale line this cost deduction mirrors (audit). */
  passThroughFromId?: string | null;
};

export interface ProvisionAdjustmentModalProps {
  visible: boolean;
  side: ProvisionSide | null;
  onClose: () => void;
  onSave: (params: {
    type: TripAdjustmentType;
    impact: TripAdjustmentImpact;
    amount: number;
    reason: string;
  }) => void | Promise<void>;
  tripCode?: string | null;
  partyLabel?: string | null;
  clientName: string;
  clientAvatarUrl?: string | null;
  clientAvatarSeed?: string | null;
  supplierName: string;
  supplierAvatarUrl?: string | null;
  supplierAvatarSeed?: string | null;
  sales: number;
  adjSales: number;
  cost: number;
  adjCost: number;
  revenueSideDelta: number;
  costSideDelta: number;
  isAssetExecution?: boolean;
  costLaneLabel?: string;
  costBreakdownLines?: ProvisionCostBreakdownLine[];
  adjustments: TripAdjustment[];
  lineMetaLabel: (adj: TripAdjustment) => string;
  /** Opens wizard when modal becomes visible (e.g. pass-through from client CN). */
  launchPreset?: ProvisionAdjustmentPreset | null;
  onLaunchPresetConsumed?: () => void;
  /** Open deduction confirmation (panel banner or after client CN save). */
  onRequestDeduction?: (rec: ClientPassThroughRecommendation) => void;
  /** When set, opens the wizard in edit mode for an existing CN/DN line. */
  editTarget?: TripAdjustment | null;
  onUpdate?: (
    adjustmentId: string,
    params: {
      type: TripAdjustmentType;
      impact: TripAdjustmentImpact;
      amount: number;
      reason: string;
    },
  ) => void | Promise<void>;
}

function applyPreset(
  preset: ProvisionAdjustmentPreset | null,
  setType: (t: TripAdjustmentType) => void,
  setImpact: (i: TripAdjustmentImpact) => void,
  setReason: (r: string) => void,
  setOther: (r: string) => void,
) {
  const lane = preset?.type ?? "revenue";
  setType(lane);
  setImpact(preset?.impact ?? "plus");
  const seed = preset?.reasonSeed?.trim() ?? "";
  const opts = lane === "revenue" ? REVENUE_REASON_OPTIONS : COST_REASON_OPTIONS;
  if (seed && (opts as readonly string[]).includes(seed)) {
    setReason(seed);
    setOther("");
  } else if (seed) {
    setReason("Other");
    setOther(seed);
  } else {
    setReason("");
    setOther("");
  }
}

export const ProvisionAdjustmentModal = memo(function ProvisionAdjustmentModal(
  props: ProvisionAdjustmentModalProps,
) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const side = props.side;

  const [phase, setPhase] = useState<FlowPhase>("hub");
  const [wizardPreset, setWizardPreset] = useState<ProvisionAdjustmentPreset | null>(null);
  const [type, setType] = useState<TripAdjustmentType>("revenue");
  const [impact, setImpact] = useState<TripAdjustmentImpact>("plus");
  const [amountStr, setAmountStr] = useState("");
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successPayload, setSuccessPayload] = useState<{
    type: TripAdjustmentType;
    impact: TripAdjustmentImpact;
    amount: number;
    reason: string;
  } | null>(null);

  const laneLocked = wizardPreset?.type != null;
  const impactLocked = wizardPreset?.impact != null;
  const reasonLocked = Boolean(wizardPreset?.reasonSeed?.trim());
  const reasonBeforeAmount =
    !reasonLocked && wizardPreset?.type != null && wizardPreset?.impact != null;

  const entryContextLabel = useMemo(() => {
    if (!props.tripCode) return props.partyLabel ?? null;
    return `${props.tripCode}${props.partyLabel ? ` · ${props.partyLabel}` : ""}`;
  }, [props.tripCode, props.partyLabel]);

  const flowSessionKey = useMemo(
    () =>
      phase === "wizard"
        ? `${wizardPreset?.type ?? ""}-${wizardPreset?.impact ?? ""}-${wizardPreset?.reasonSeed ?? ""}-${side ?? ""}`
        : "",
    [phase, wizardPreset, side],
  );

  useEffect(() => {
    if (!props.visible) {
      setPhase("hub");
      setWizardPreset(null);
      setSuccessPayload(null);
      setAmountStr("");
      setSubmitting(false);
    }
  }, [props.visible]);

  const sideAdjustments = useMemo(() => {
    if (!side) return [];
    return props.adjustments.filter((a) =>
      side === "client" ? a.type === "revenue" : a.type === "cost",
    );
  }, [props.adjustments, side]);

  const beginWizard = useCallback(
    (preset: ProvisionAdjustmentPreset) => {
      setWizardPreset(preset);
      applyPreset(preset, setType, setImpact, setReason, setOtherReason);
      const seededAmount = Math.max(0, Number(preset.amountSeed ?? 0) || 0);
      setAmountStr(seededAmount > 0 ? String(seededAmount) : "");
      setPhase("wizard");
    },
    [],
  );

  useEffect(() => {
    if (!props.visible) return;
    if (props.launchPreset) return;
    if (props.editTarget) return;
    setPhase("hub");
    setWizardPreset(null);
    setSuccessPayload(null);
    setAmountStr("");
  }, [props.side, props.visible, props.launchPreset, props.editTarget]);

  useEffect(() => {
    if (!props.visible || !props.editTarget || props.launchPreset) return;
    setSuccessPayload(null);
    beginWizard({
      type: props.editTarget.type,
      impact: props.editTarget.impact,
      amountSeed: props.editTarget.amount,
      reasonSeed: props.editTarget.reason,
    });
  }, [props.visible, props.editTarget, props.launchPreset, beginWizard]);

  useEffect(() => {
    if (!props.visible || !props.launchPreset) return;
    setSuccessPayload(null);
    beginWizard(props.launchPreset);
    props.onLaunchPresetConsumed?.();
  }, [
    props.visible,
    props.launchPreset,
    props.side,
    beginWizard,
    props.onLaunchPresetConsumed,
  ]);

  const handleWizardBack = useCallback(() => {
    if (props.editTarget) {
      props.onClose();
      return;
    }
    setPhase("hub");
    setWizardPreset(null);
  }, [props.editTarget, props.onClose]);

  const isClient = side === "client";
  const isAssetDriverCost = Boolean(props.isAssetExecution && side && !isClient);

  const selectedReason = reason === "Other" ? otherReason.trim() || "Other" : reason;
  const amountNum = Math.round(parseFloat(amountStr.replace(/,/g, "")) || 0);
  const canSubmit =
    amountNum > 0 &&
    (selectedReason.length > 0 ||
      getAdjustmentReasonOptions({
        type,
        isAssetDriverCost,
        impact,
      }).length > 0);

  const reviewRevisedAmount = useMemo(() => {
    const signed = impact === "plus" ? amountNum : -amountNum;
    if (type === "revenue") return props.adjSales + signed;
    return props.adjCost + signed;
  }, [impact, amountNum, type, props.adjSales, props.adjCost]);

  const reviewBaseAmount = type === "revenue" ? props.adjSales : props.adjCost;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    const finalReason =
      selectedReason || (type === "revenue" ? "Revenue adjustment" : "Cost adjustment");
    setSubmitting(true);
    try {
      const payload = { type, impact, amount: amountNum, reason: finalReason };
      if (props.editTarget?.id && props.onUpdate) {
        await props.onUpdate(props.editTarget.id, payload);
      } else {
        await props.onSave(payload);
      }
      setSuccessPayload(payload);
      setPhase("success");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, selectedReason, type, impact, amountNum, props]);

  const handleSuccessDone = useCallback(() => {
    setSuccessPayload(null);
    setPhase("hub");
    props.onClose();
  }, [props]);

  const successPassThrough = useMemo(() => {
    if (!successPayload || side !== "client") return null;
    if (successPayload.type !== "revenue" || successPayload.impact !== "minus") return null;
    return passThroughRecommendationAfterClientSave({
      amount: successPayload.amount,
      reason: successPayload.reason,
      adjustments: props.adjustments,
      isAssetExecution: Boolean(props.isAssetExecution),
      driverOrSupplierName: props.supplierName,
    });
  }, [successPayload, side, props.adjustments, props.isAssetExecution, props.supplierName]);

  const handleSuccessDeduction = useCallback(() => {
    if (!successPassThrough || !props.onRequestDeduction) return;
    props.onRequestDeduction(successPassThrough);
    setSuccessPayload(null);
    setPhase("hub");
    props.onClose();
  }, [successPassThrough, props]);

  if (!props.visible || !side) return null;

  const focusAccent = isClient ? Theme.primary : "#0f766e";

  if (phase === "success" && successPayload) {
    return (
      <Modal
        visible
        animationType="slide"
        presentationStyle={compact ? "fullScreen" : "pageSheet"}
        onRequestClose={handleSuccessDone}
      >
        <TripAdjustmentSuccessView
          type={successPayload.type}
          impact={successPayload.impact}
          amount={successPayload.amount}
          reason={successPayload.reason}
          tripCode={props.tripCode}
          isAssetDriverCost={isAssetDriverCost}
          deductionActionLabel={
            successPassThrough
              ? `Deduct ₹${successPassThrough.amount.toLocaleString("en-IN")} from ${successPassThrough.targetLabel}`
              : null
          }
          onApplyDeduction={
            successPassThrough && props.onRequestDeduction
              ? handleSuccessDeduction
              : undefined
          }
          onDone={handleSuccessDone}
        />
      </Modal>
    );
  }

  if (phase === "wizard") {
    return (
      <Modal
        visible
        animationType="slide"
        presentationStyle={compact ? "fullScreen" : "pageSheet"}
        onRequestClose={handleWizardBack}
      >
        <TripAdjustmentMobileWizard
          entryContextLabel={entryContextLabel}
          tripCode={props.tripCode}
          type={type}
          onTypeChange={setType}
          laneLocked={laneLocked || Boolean(props.editTarget)}
          impact={impact}
          onImpactChange={setImpact}
          impactLocked={impactLocked || Boolean(props.editTarget)}
          amountStr={amountStr}
          onAmountChange={setAmountStr}
          reason={reason}
          onReasonChange={setReason}
          otherReason={otherReason}
          onOtherReasonChange={setOtherReason}
          reasonLocked={reasonLocked}
          reasonBeforeAmount={reasonBeforeAmount}
          isAssetDriverCost={isAssetDriverCost}
          showProtocolShortcuts={!reasonLocked && !reasonBeforeAmount && !props.editTarget}
          canSubmit={canSubmit}
          submitting={submitting}
          onSubmit={() => void handleSubmit()}
          onClose={handleWizardBack}
          flowSessionKey={flowSessionKey}
          reviewBaseAmount={reviewBaseAmount}
          reviewRevisedAmount={reviewRevisedAmount}
          isEditing={Boolean(props.editTarget)}
        />
      </Modal>
    );
  }

  return (
    <Modal
      visible
      animationType={compact ? "slide" : "fade"}
      presentationStyle={compact ? "fullScreen" : "overFullScreen"}
      transparent={!compact}
      onRequestClose={props.onClose}
    >
      <View
        style={[
          compact ? styles.compactRoot : styles.desktopBackdrop,
          compact ? { paddingTop: insets.top, paddingBottom: insets.bottom } : undefined,
        ]}
      >
        <View style={[compact ? styles.compactCard : styles.desktopCard]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={compact ? styles.compactScroll : styles.desktopScroll}
          >
            <View style={styles.hubHeader}>
              <View style={styles.hubHeaderText}>
                <View style={styles.hubKickerRow}>
                  <View style={[styles.liveDot, { backgroundColor: focusAccent }]} />
                  <Text style={[styles.hubKicker, compact && styles.hubKickerCompact]}>
                    PROVISION ADJUST
                  </Text>
                </View>
                <Text style={[styles.hubTitle, compact && styles.hubTitleCompact]}>
                  {isClient
                    ? "Client sale"
                    : props.isAssetExecution
                      ? "Driver cost"
                      : "Supplier cost"}
                </Text>
                {entryContextLabel ? (
                  <Text style={[styles.hubSub, compact && styles.hubSubLight]} numberOfLines={2}>
                    {entryContextLabel}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={props.onClose}
                style={[styles.closeBtn, compact && styles.closeBtnLight]}
                hitSlop={10}
              >
                <Feather name="x" size={18} color={compact ? "#64748b" : "#fff"} />
              </Pressable>
            </View>

            <ProvisionRevisedPartiesCard
              compact={compact}
              clientName={props.clientName}
              clientAvatarUrl={props.clientAvatarUrl}
              clientAvatarSeed={props.clientAvatarSeed}
              sales={props.sales}
              adjSales={props.adjSales}
              revenueSideDelta={props.revenueSideDelta}
              supplierName={props.supplierName}
              supplierAvatarUrl={props.supplierAvatarUrl}
              supplierAvatarSeed={props.supplierAvatarSeed}
              cost={props.cost}
              adjCost={props.adjCost}
              costSideDelta={props.costSideDelta}
              costLaneLabel={props.costLaneLabel}
              costPartyEntityType={props.isAssetExecution ? "driver" : "supplier"}
              costBreakdownLines={props.costBreakdownLines}
              activeSide={side}
            />

            <Text style={[styles.sectionEyebrow, compact && styles.sectionEyebrowLight]}>
              {isAssetDriverCost
                ? "Driver adjustment"
                : `New ${isClient ? "sale" : "cost"} provision`}
            </Text>
            <View style={styles.cnDnRow}>
              <Pressable
                style={[styles.cnBtn, compact ? styles.cnBtnCreditLight : styles.cnBtnCredit]}
                onPress={() =>
                  beginWizard({
                    type: isClient ? "revenue" : "cost",
                    impact: "minus",
                  })
                }
              >
                <Feather
                  name={isAssetDriverCost ? "minus-circle" : "plus"}
                  size={18}
                  color="#4f46e5"
                />
                <Text style={[styles.cnDnLabel, compact && styles.cnDnLabelLight]}>
                  {isAssetDriverCost ? "Deduct (CN)" : "Credit (CN)"}
                </Text>
                {isAssetDriverCost ? (
                  <Text style={[styles.cnDnHint, compact && styles.cnDnHintLight]}>
                    Damage · missing · late
                  </Text>
                ) : null}
              </Pressable>
              <Pressable
                style={[styles.cnBtn, compact ? styles.cnBtnDebitLight : styles.cnBtnDebit]}
                onPress={() =>
                  beginWizard({
                    type: isClient ? "revenue" : "cost",
                    impact: "plus",
                  })
                }
              >
                <Feather
                  name={isAssetDriverCost ? "plus-circle" : "minus"}
                  size={18}
                  color="#e11d48"
                />
                <Text style={[styles.cnDnLabel, compact && styles.cnDnLabelLight]}>
                  {isAssetDriverCost ? "Pay driver (DN)" : "Debit (DN)"}
                </Text>
                {isAssetDriverCost ? (
                  <Text style={[styles.cnDnHint, compact && styles.cnDnHintLight]}>
                    Tip · bonus · allowance
                  </Text>
                ) : null}
              </Pressable>
            </View>

            {isAssetDriverCost ? (
              <>
                <Text style={[styles.sectionEyebrow, compact && styles.sectionEyebrowLight]}>
                  Deduct from driver
                </Text>
                <View style={styles.chipWrap}>
                  {ASSET_DRIVER_DEDUCTION_PROTOCOL_CHIPS.map((chip) => (
                    <Pressable
                      key={chip.label}
                      style={[styles.chip, compact && styles.chipLight]}
                      onPress={() => beginWizard(protocolAssetDriverDeductionAdjustment(chip))}
                    >
                      <Text style={[styles.chipText, compact && styles.chipTextLight]}>
                        {chip.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.sectionEyebrow, compact && styles.sectionEyebrowLight]}>
                  Pay driver
                </Text>
                <View style={styles.chipWrap}>
                  {ASSET_DRIVER_PAYMENT_PROTOCOL_CHIPS.map((chip) => (
                    <Pressable
                      key={chip.label}
                      style={[styles.chip, compact && styles.chipLight]}
                      onPress={() => beginWizard(protocolAssetDriverPaymentAdjustment(chip))}
                    >
                      <Text style={[styles.chipText, compact && styles.chipTextLight]}>
                        {chip.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.hubFootnote, compact && styles.hubFootnoteLight]}>
                  CN lowers revised trip cost (deduction from driver). DN adds tip or allowance on
                  this trip.
                  {sideAdjustments.length > 0
                    ? ` ${sideAdjustments.length} line${sideAdjustments.length === 1 ? "" : "s"} already on this trip.`
                    : ""}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.sectionEyebrow, compact && styles.sectionEyebrowLight]}>
                  Quick protocol
                </Text>
                <View style={styles.chipWrap}>
                  {FINANCE_PROTOCOL_CHIPS.map((chip) => {
                    const preset = isClient
                      ? protocolClientChipAdjustment(chip)
                      : protocolSupplierChipAdjustment(chip);
                    return (
                      <Pressable
                        key={chip}
                        style={[styles.chip, compact && styles.chipLight]}
                        onPress={() => beginWizard(preset)}
                      >
                        <Text style={[styles.chipText, compact && styles.chipTextLight]}>
                          {chip}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {!isAssetDriverCost && sideAdjustments.length > 0 ? (
              <Text style={[styles.hubFootnote, compact && styles.hubFootnoteLight]}>
                {sideAdjustments.length} existing line
                {sideAdjustments.length === 1 ? "" : "s"} on summary — new lines appear in the
                table after save.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  compactRoot: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  compactCard: {
    flex: 1,
  },
  compactScroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  desktopBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.58)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  desktopCard: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "92%",
    backgroundColor: "#171a20",
    borderRadius: 24,
    overflow: "hidden",
  },
  desktopScroll: {
    padding: 18,
    paddingBottom: 24,
  },
  hubHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  hubHeaderText: { flex: 1, minWidth: 0 },
  hubKickerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  hubKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: Theme.positive,
    textTransform: "uppercase",
  },
  hubKickerCompact: { color: Theme.positive },
  hubTitle: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.4,
  },
  hubTitleCompact: {
    color: "#0f172a",
  },
  hubSub: {
    marginTop: 4,
    fontSize: 12,
    fontStyle: "italic",
    color: "#94a3b8",
  },
  hubSubLight: { color: Theme.textMuted },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  closeBtnLight: {
    backgroundColor: "#f1f5f9",
  },
  summaryCellLight: {
    backgroundColor: "#fff",
    borderColor: "#e2e8f0",
  },
  summaryLabelLight: { color: Theme.textMuted },
  sectionEyebrowLight: { color: Theme.textMuted },
  cnBtnCreditLight: {
    borderColor: "rgba(99,102,241,0.35)",
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  cnBtnDebitLight: {
    borderColor: "rgba(244,63,94,0.35)",
    backgroundColor: "rgba(244,63,94,0.08)",
  },
  cnDnLabelLight: { color: "#334155" },
  chipLight: {
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  chipTextLight: { color: "#334155" },
  emptyLinesLight: { color: Theme.textMuted },
  lineRowLight: { borderTopColor: "#e2e8f0" },
  lineReasonLight: { color: "#0f172a" },
  lineMetaLight: { color: Theme.textMuted },
  heroCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fff",
    marginBottom: 14,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  heroAmount: {
    marginTop: 6,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  heroMeta: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  summaryCell: {
    flexGrow: 1,
    flexBasis: "47%",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#64748b",
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "800",
  },
  summarySale: { color: "#34d399" },
  summaryCost: { color: "#fb7185" },
  sectionEyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#64748b",
    marginBottom: 8,
    marginTop: 4,
  },
  cnDnRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  cnBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  cnBtnCredit: {
    borderColor: "rgba(99,102,241,0.35)",
    backgroundColor: "rgba(99,102,241,0.1)",
  },
  cnBtnDebit: {
    borderColor: "rgba(244,63,94,0.35)",
    backgroundColor: "rgba(244,63,94,0.1)",
  },
  cnDnLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#e2e8f0",
  },
  cnDnHint: {
    fontSize: 8,
    fontWeight: "600",
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 11,
    marginTop: 2,
  },
  cnDnHintLight: {
    color: Theme.textMuted,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#e2e8f0",
  },
  fullBtn: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 16 },
  fullBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.primary,
  },
  emptyLines: {
    fontSize: 12,
    color: "#94a3b8",
    fontStyle: "italic",
    marginBottom: 8,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  lineMid: { flex: 1, minWidth: 0 },
  lineReason: {
    fontSize: 13,
    fontWeight: "700",
    color: "#f1f5f9",
  },
  lineMeta: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
  },
  lineAmt: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  lineAmtSale: { color: "#34d399" },
  lineAmtCost: { color: "#fb7185" },
  lineStruck: {
    opacity: 0.45,
    textDecorationLine: "line-through",
  },
  hubFootnote: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    lineHeight: 16,
  },
  hubFootnoteLight: {
    color: Theme.textMuted,
  },
});

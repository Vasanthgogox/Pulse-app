import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  Minus,
  Plus,
} from "lucide-react-native";

import { TripAdjustmentReviewTicket } from "@/features/trips/components/trip-detail/adjustment/TripAdjustmentReviewTicket";
import {
  buildAdjustmentWizardSteps,
  FINANCE_PROTOCOL_CHIPS,
  protocolClientChipAdjustment,
  protocolSupplierChipAdjustment,
  resolveAdjustmentInitialStepIndex,
  type TripAdjustmentWizardStep,
} from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentFlow.util";
import { partyMobileWizardStyles as shell } from "@/components/party/partyMobileWizardStyles";
import Theme from "@/constants/Theme";
import {
  getAdjustmentReasonOptions,
  type TripAdjustmentImpact,
  type TripAdjustmentType,
} from "@/features/trips/services/tripAdjustments";

export interface TripAdjustmentMobileWizardProps {
  entryContextLabel?: string | null;
  tripCode?: string | null;
  type: TripAdjustmentType;
  onTypeChange: (type: TripAdjustmentType) => void;
  laneLocked?: boolean;
  impact: TripAdjustmentImpact;
  onImpactChange: (impact: TripAdjustmentImpact) => void;
  impactLocked?: boolean;
  amountStr: string;
  onAmountChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  otherReason: string;
  onOtherReasonChange: (value: string) => void;
  reasonLocked?: boolean;
  reasonBeforeAmount?: boolean;
  isAssetDriverCost?: boolean;
  showProtocolShortcuts?: boolean;
  canSubmit: boolean;
  submitting?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  flowSessionKey?: string;
  reviewBaseAmount?: number;
  reviewRevisedAmount?: number;
}

function parseAmount(raw: string): number {
  const n = Math.round(parseFloat(raw.replace(/,/g, "")) || 0);
  return Number.isFinite(n) ? n : 0;
}

function stepMeta(
  step: TripAdjustmentWizardStep,
  isAssetDriverCost?: boolean,
): { title: string; hint?: string } {
  switch (step) {
    case "lane":
      return isAssetDriverCost
        ? {
            title: "Driver trip cost",
            hint: "Adjust what this trip costs for the assigned driver.",
          }
        : {
            title: "Which lane?",
            hint: "Revenue changes the sale; cost changes supplier settlement.",
          };
    case "impact":
      return isAssetDriverCost
        ? {
            title: "Deduct or pay driver?",
            hint: "Deduct (CN) for damage, missing, or late delivery. Pay (DN) for tips or allowances.",
          }
        : {
            title: "Credit or debit?",
            hint: "Credit note (CN) reduces the amount; debit note (DN) increases it.",
          };
    case "protocol":
      return {
        title: "Quick protocol",
        hint: "Pick a standard charge or continue to enter amount manually.",
      };
    case "amount":
      return { title: "Adjustment amount", hint: "Enter the provision amount in rupees." };
    case "reason":
      return isAssetDriverCost
        ? {
            title: "Reason for driver adjustment",
            hint: "Pick the deduction or payment type for payroll and audit.",
          }
        : { title: "Why this adjustment?", hint: "Select the closest reason for audit." };
    case "otherReason":
      return {
        title: "Other reason",
        hint: "Describe the charge or credit in your own words.",
      };
    case "review":
      return { title: "Review & save", hint: "Confirm details on your ticket before saving." };
    default:
      return { title: "Provision" };
  }
}

function canAdvanceStep(
  step: TripAdjustmentWizardStep,
  props: TripAdjustmentMobileWizardProps,
): boolean {
  switch (step) {
    case "lane":
    case "impact":
    case "protocol":
      return true;
    case "amount":
      return parseAmount(props.amountStr) > 0;
    case "reason":
      return props.reason.trim().length > 0 && props.reason !== "Other";
    case "otherReason":
      return props.otherReason.trim().length > 0;
    case "review":
      return props.canSubmit;
    default:
      return false;
  }
}

export const TripAdjustmentMobileWizard = memo(function TripAdjustmentMobileWizard(
  props: TripAdjustmentMobileWizardProps,
) {
  const insets = useSafeAreaInsets();
  const laneLocked = props.laneLocked === true;
  const impactLocked = props.impactLocked === true;
  const reasonLocked = props.reasonLocked === true;
  const reasonBeforeAmount = props.reasonBeforeAmount === true;
  const showProtocolShortcuts = props.showProtocolShortcuts !== false;

  const steps = useMemo(
    () =>
      buildAdjustmentWizardSteps({
        laneLocked,
        impactLocked,
        reasonLocked,
        showProtocolShortcuts,
        reasonBeforeAmount,
      }),
    [laneLocked, impactLocked, reasonLocked, showProtocolShortcuts, reasonBeforeAmount],
  );

  const [stepIndex, setStepIndex] = useState(() =>
    resolveAdjustmentInitialStepIndex(steps, {
      laneLocked,
      impactLocked,
      reasonLocked,
      reasonBeforeAmount,
    }),
  );
  const [otherReasonMode, setOtherReasonMode] = useState(false);

  const lastSessionKeyRef = useRef(props.flowSessionKey ?? "");
  useEffect(() => {
    const key = props.flowSessionKey ?? "";
    if (key === lastSessionKeyRef.current) return;
    lastSessionKeyRef.current = key;
    setOtherReasonMode(false);
    setStepIndex(
      resolveAdjustmentInitialStepIndex(steps, {
        laneLocked,
        impactLocked,
        reasonLocked,
        reasonBeforeAmount,
      }),
    );
  }, [props.flowSessionKey, steps, laneLocked, impactLocked, reasonLocked, reasonBeforeAmount]);

  const currentStep = steps[stepIndex] ?? "review";
  const effectiveStep =
    currentStep === "reason" && otherReasonMode ? ("otherReason" as const) : currentStep;
  const isAssetDriverCost = props.isAssetDriverCost === true;
  const { title, hint } = stepMeta(effectiveStep, isAssetDriverCost);
  const canAdvance = canAdvanceStep(effectiveStep, props);
  const reasonOptions = getAdjustmentReasonOptions({
    type: props.type,
    isAssetDriverCost,
    impact: props.impact,
  });
  const selectedReason =
    props.reason === "Other"
      ? props.otherReason.trim() || "Other"
      : props.reason.trim();
  const amountNum = parseAmount(props.amountStr);

  const handleBack = useCallback(() => {
    if (otherReasonMode) {
      setOtherReasonMode(false);
      return;
    }
    if (stepIndex <= 0) {
      props.onClose();
      return;
    }
    setStepIndex((i) => Math.max(0, i - 1));
  }, [stepIndex, props, otherReasonMode]);

  const handleAdvance = useCallback(() => {
    if (effectiveStep === "review") {
      if (props.canSubmit && !props.submitting) props.onSubmit();
      return;
    }
    if (currentStep === "reason" && props.reason === "Other" && !otherReasonMode) {
      setOtherReasonMode(true);
      return;
    }
    if (!canAdvance) return;
    if (otherReasonMode) setOtherReasonMode(false);
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  }, [
    canAdvance,
    currentStep,
    effectiveStep,
    otherReasonMode,
    props,
    steps.length,
  ]);

  const applyProtocolChip = useCallback(
    (chip: (typeof FINANCE_PROTOCOL_CHIPS)[number]) => {
      const preset =
        props.type === "revenue"
          ? protocolClientChipAdjustment(chip)
          : protocolSupplierChipAdjustment(chip);
      props.onTypeChange(preset.type);
      props.onImpactChange(preset.impact);
      const seed = preset.reasonSeed;
      if ((reasonOptions as readonly string[]).includes(seed)) {
        props.onReasonChange(seed);
        props.onOtherReasonChange("");
      } else {
        props.onReasonChange("Other");
        props.onOtherReasonChange(seed);
      }
      const amountIdx = steps.indexOf("amount");
      setStepIndex(amountIdx >= 0 ? amountIdx : stepIndex);
    },
    [props, reasonOptions, steps, stepIndex],
  );

  const renderLane = () => (
    <View style={styles.choiceCol}>
      <Pressable
        style={[styles.laneCard, props.type === "revenue" && styles.laneCardActiveRev]}
        onPress={() => props.onTypeChange("revenue")}
      >
        <View style={[styles.laneIcon, { backgroundColor: "#ede9fe" }]}>
          <ArrowUpRight size={22} color={Theme.primary} strokeWidth={2.4} />
        </View>
        <View style={styles.laneTextCol}>
          <Text style={styles.laneTitle}>Revenue (Sale)</Text>
          <Text style={styles.laneSub}>Client billing</Text>
        </View>
      </Pressable>
      <Pressable
        style={[styles.laneCard, props.type === "cost" && styles.laneCardActiveCost]}
        onPress={() => props.onTypeChange("cost")}
      >
        <View style={[styles.laneIcon, { backgroundColor: "#ccfbf1" }]}>
          <ArrowDownLeft size={22} color="#0f766e" strokeWidth={2.4} />
        </View>
        <View style={styles.laneTextCol}>
          <Text style={styles.laneTitle}>Cost (Supplier)</Text>
          <Text style={styles.laneSub}>Supplier settlement</Text>
        </View>
      </Pressable>
    </View>
  );

  const renderImpact = () => (
    <View style={styles.choiceCol}>
      <Pressable
        style={[styles.impactCard, props.impact === "minus" && styles.impactCardCn]}
        onPress={() => props.onImpactChange("minus")}
      >
        <View style={[styles.laneIcon, { backgroundColor: "#dcfce7" }]}>
          <Minus size={22} color={Theme.darkGreen} strokeWidth={2.6} />
        </View>
        <View style={styles.laneTextCol}>
          <Text style={styles.laneTitle}>
            {isAssetDriverCost ? "Deduct from driver (CN)" : "Credit (CN)"}
          </Text>
          <Text style={styles.laneSub}>
            {isAssetDriverCost ? "Damage · missing · late delivery" : "Reduces amount"}
          </Text>
        </View>
      </Pressable>
      <Pressable
        style={[styles.impactCard, props.impact === "plus" && styles.impactCardDn]}
        onPress={() => props.onImpactChange("plus")}
      >
        <View style={[styles.laneIcon, { backgroundColor: "#fee2e2" }]}>
          <Plus size={22} color={Theme.teslaRed} strokeWidth={2.6} />
        </View>
        <View style={styles.laneTextCol}>
          <Text style={styles.laneTitle}>
            {isAssetDriverCost ? "Pay driver (DN)" : "Debit (DN)"}
          </Text>
          <Text style={styles.laneSub}>
            {isAssetDriverCost ? "Tip · bonus · allowance" : "Increases amount"}
          </Text>
        </View>
      </Pressable>
    </View>
  );

  const renderProtocol = () => (
    <View style={styles.chipGrid}>
      {FINANCE_PROTOCOL_CHIPS.map((chip) => (
        <Pressable
          key={chip}
          style={styles.protocolChip}
          onPress={() => applyProtocolChip(chip)}
        >
          <Text style={styles.protocolChipText}>{chip}</Text>
        </Pressable>
      ))}
      <Pressable style={styles.protocolSkip} onPress={handleAdvance}>
        <Text style={styles.protocolSkipText}>Enter manually →</Text>
      </Pressable>
    </View>
  );

  const renderAmount = () => (
    <View style={styles.amountBlock}>
      <View style={styles.amountRow}>
        <Text style={styles.currency}>₹</Text>
        <TextInput
          style={styles.amountInput}
          value={props.amountStr}
          onChangeText={props.onAmountChange}
          placeholder="0"
          placeholderTextColor={Theme.textMuted}
          keyboardType="numeric"
          maxLength={14}
          autoFocus
        />
      </View>
      <Text style={styles.amountHint}>
        {isAssetDriverCost
          ? props.impact === "plus"
            ? "Adds to revised driver trip cost (tip or allowance)."
            : "Reduces revised driver trip cost (deduction from salary)."
          : `${props.impact === "plus" ? "Debit note increases" : "Credit note reduces"} ${
              props.type === "revenue" ? "sale" : "supplier cost"
            }.`}
      </Text>
    </View>
  );

  const renderReason = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.chipGrid}>
        {reasonOptions.map((r) => (
          <Pressable
            key={r}
            style={[styles.reasonChip, props.reason === r && styles.reasonChipActive]}
            onPress={() => {
              props.onReasonChange(r);
              if (r === "Other") {
                props.onOtherReasonChange("");
                setOtherReasonMode(true);
              } else {
                props.onOtherReasonChange("");
                setOtherReasonMode(false);
              }
            }}
          >
            <Text
              style={[
                styles.reasonChipText,
                props.reason === r && styles.reasonChipTextActive,
              ]}
            >
              {r}
            </Text>
          </Pressable>
        ))}
      </View>
      {props.reason === "Other" ? (
        <Pressable style={styles.otherReasonLink} onPress={() => setOtherReasonMode(true)}>
          <Text style={styles.otherReasonLinkText}>
            {props.otherReason.trim()
              ? `Edit: ${props.otherReason.trim()}`
              : "Describe other reason →"}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );

  const renderOtherReason = () => (
    <View style={styles.otherReasonPage}>
      <TextInput
        style={styles.otherReasonInput}
        value={props.otherReason}
        onChangeText={props.onOtherReasonChange}
        placeholder="e.g. Shortage at unloading, rate mismatch…"
        placeholderTextColor={Theme.textMuted}
        maxLength={120}
        multiline
        autoFocus
        textAlignVertical="top"
      />
      <Text style={styles.otherReasonHint}>
        This appears on the provision line and audit trail.
      </Text>
    </View>
  );

  const renderReview = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.reviewScroll}>
      <TripAdjustmentReviewTicket
        type={props.type}
        impact={props.impact}
        amount={amountNum}
        reason={
          selectedReason ||
          (props.type === "revenue" ? "Revenue adjustment" : "Cost adjustment")
        }
        tripCode={props.tripCode}
        baseAmount={props.reviewBaseAmount}
        revisedAmount={props.reviewRevisedAmount}
      />
    </ScrollView>
  );

  const body = (() => {
    if (effectiveStep === "otherReason") return renderOtherReason();
    switch (currentStep) {
      case "lane":
        return renderLane();
      case "impact":
        return renderImpact();
      case "protocol":
        return renderProtocol();
      case "amount":
        return renderAmount();
      case "reason":
        return renderReason();
      case "review":
        return renderReview();
      default:
        return null;
    }
  })();

  const entityTitle = "PROVISION ADJUST";
  const advanceLabel =
    currentStep === "review" ? (props.submitting ? "Saving…" : "Save") : "Continue";

  return (
    <KeyboardAvoidingView
      style={shell.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[shell.root, { paddingTop: insets.top }]}>
        <View style={[shell.topBar, styles.topBarCompact]}>
          <Pressable style={shell.backBtn} onPress={handleBack} hitSlop={12}>
            <ChevronLeft size={20} color="#0f172a" strokeWidth={2.5} />
          </Pressable>
          <View style={shell.progressRow}>
            {steps.map((id, i) => (
              <View
                key={id}
                style={[
                  shell.progressDot,
                  i <= stepIndex && shell.progressDotActive,
                  i <= stepIndex && styles.progressDotActiveCompact,
                ]}
              />
            ))}
          </View>
          <View style={shell.backBtnSpacer} />
        </View>

        <View style={[shell.body, styles.bodyCompact]}>
          <View style={styles.stepHeader}>
            <View style={styles.compactContext}>
              <View style={shell.titleRow}>
                <View style={shell.liveDot} />
                <Text style={styles.entityTitleCompact}>{entityTitle}</Text>
              </View>
              {props.entryContextLabel ? (
                <Text style={styles.subtitleCompact} numberOfLines={2}>
                  {props.entryContextLabel}
                </Text>
              ) : null}
            </View>
            <Text style={[shell.stepTitle, styles.stepTitleCompact]}>{title}</Text>
            {hint ? (
              <Text style={[shell.stepHint, styles.stepHintCompact]}>{hint}</Text>
            ) : null}
          </View>
          {body}
        </View>

        <View style={[shell.footer, styles.footerCompact, { paddingBottom: insets.bottom + 12 }]}>
          {effectiveStep === "review" ? (
            <Pressable
              style={[
                styles.saveBtn,
                (!props.canSubmit || props.submitting) && styles.saveBtnDisabled,
              ]}
              onPress={handleAdvance}
              disabled={!props.canSubmit || props.submitting}
            >
              <Check size={18} color="#fff" strokeWidth={2.8} />
              <Text style={styles.saveBtnText}>{advanceLabel}</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                style={[shell.fab, styles.fabCompact, !canAdvance && shell.fabDisabled]}
                onPress={handleAdvance}
                disabled={!canAdvance}
              >
                <ArrowRight size={20} color="#fff" strokeWidth={2.8} />
              </Pressable>
              <Text style={[shell.footerHint, styles.footerHintCompact]}>{advanceLabel}</Text>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  topBarCompact: { paddingHorizontal: 12, paddingBottom: 4 },
  bodyCompact: { paddingHorizontal: 16, paddingTop: 0 },
  footerCompact: { paddingHorizontal: 16, paddingTop: 4 },
  stepHeader: { marginBottom: 10, gap: 4 },
  compactContext: { gap: 2, marginBottom: 4 },
  entityTitleCompact: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: Theme.positive,
    textTransform: "uppercase",
  },
  subtitleCompact: {
    fontSize: 12,
    fontStyle: "italic",
    color: Theme.textMuted,
  },
  stepTitleCompact: { fontSize: 20, letterSpacing: -0.3 },
  stepHintCompact: { fontSize: 12, marginBottom: 0, lineHeight: 17 },
  progressDotActiveCompact: { width: 18, height: 6, borderRadius: 3 },
  fabCompact: { width: 48, height: 48, borderRadius: 24 },
  footerHintCompact: { fontSize: 9 },
  choiceCol: { gap: 10 },
  laneCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  laneCardActiveRev: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  laneCardActiveCost: {
    borderColor: "#0f766e",
    backgroundColor: "rgba(15,118,110,0.08)",
  },
  impactCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  impactCardCn: {
    borderColor: Theme.darkGreen,
    backgroundColor: "rgba(22,163,74,0.08)",
  },
  impactCardDn: {
    borderColor: Theme.teslaRed,
    backgroundColor: "rgba(232,33,39,0.08)",
  },
  laneIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  laneTextCol: { flex: 1, minWidth: 0 },
  laneTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a" },
  laneSub: { fontSize: 12, color: Theme.textMuted, marginTop: 2 },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  protocolChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  protocolChipText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
  },
  protocolSkip: {
    width: "100%",
    paddingVertical: 10,
    alignItems: "center",
  },
  protocolSkipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  amountBlock: { gap: 8 },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  currency: {
    fontSize: 28,
    fontWeight: "300",
    color: "#0f172a",
    marginRight: 6,
  },
  amountInput: {
    fontSize: 32,
    fontWeight: "700",
    color: "#0f172a",
    minWidth: 100,
    padding: 0,
    textAlign: "center",
  },
  amountHint: {
    fontSize: 12,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 17,
  },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  reasonChipActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(99,102,241,0.1)",
  },
  reasonChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  reasonChipTextActive: {
    color: Theme.primary,
    fontWeight: "800",
  },
  otherReasonLink: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  otherReasonLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.primary,
  },
  otherReasonPage: {
    flex: 1,
    gap: 10,
  },
  otherReasonInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    color: "#0f172a",
    backgroundColor: "#fff",
  },
  otherReasonHint: {
    fontSize: 12,
    color: Theme.textMuted,
    lineHeight: 17,
  },
  reviewScroll: { paddingBottom: 8 },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Theme.primary,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
});

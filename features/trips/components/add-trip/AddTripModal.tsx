/**
 * Add Trip — main modal: composes layout, form fields, and hooks.
 * Thin container; logic lives in useAddTripForm and useClientsForTrip.
 * Waits for onComplete (e.g. createTrip) to finish before closing so lists refetch with new data.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowDown,
  CheckCircle2,
  Clock,
  MapPinned,
  RotateCw,
  Truck,
  User,
} from "lucide-react-native";
import { MotiView } from "moti";
import { AddTripFormFields } from "./AddTripFormFields";
import { AddTripModalLayout } from "./AddTripModalLayout";
import type {
  AddTripCompleteOptions,
  AddTripCompleteResult,
  AddTripFormState,
  AddTripModalProps,
  AddTripOtpScreenContext,
} from "./types";
import { useAddTripForm } from "./useAddTripForm";
import { useClientsForTrip } from "./useClientsForTrip";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import { regenerateTripOtp } from "@/features/trips/services/tripOtp.service";

function buildOtpScreenContext(state: AddTripFormState): AddTripOtpScreenContext {
  const phoneResolved =
    state.driverPhoneConfirmed && state.driverPhoneName?.trim()
      ? state.driverPhoneName.trim()
      : "";
  const entered = state.aggregateDriverName.trim();
  const driverName = entered || phoneResolved || undefined;
  const routeLineParts: string[] = [];
  if (state.routeDistanceKm != null && Number.isFinite(state.routeDistanceKm)) {
    routeLineParts.push(`${state.routeDistanceKm} km`);
  }
  if (state.routeEtaLabel?.trim()) routeLineParts.push(state.routeEtaLabel.trim());
  return {
    driverName,
    pickupArea: state.pickupArea.trim(),
    dropLocation: state.dropLocation.trim(),
    clientName: state.clientName.trim() || undefined,
    tons: state.tons.trim() || undefined,
    supplierDisplayName: state.supplierDisplayName.trim() || undefined,
    routeLine: routeLineParts.length ? routeLineParts.join(" · ") : undefined,
  };
}

export function AddTripModal({
  organizationId,
  onClose,
  onComplete,
}: AddTripModalProps) {
  const { width: winW } = useWindowDimensions();
  const wizardEnabled = Platform.OS !== "web" && winW < 600;
  const [wizardStep, setWizardStep] = useState<"route" | "client" | "allocation">(
    "route",
  );
  const form = useAddTripForm();
  const [submitting, setSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<AddTripCompleteResult | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const {
    clients,
    loading: clientsLoading,
    refetch: refetchClients,
  } = useClientsForTrip(organizationId);

  useEffect(() => {
    if (!wizardEnabled) return;
    setWizardStep("route");
  }, [wizardEnabled, organizationId]);

  const stepFieldSet = useMemo(() => {
    if (!wizardEnabled) return null;
    if (wizardStep === "route") {
      return new Set(["pickup", "drop", "tripDate", "tons"]);
    }
    if (wizardStep === "client") {
      return new Set(["client", "clientPrice"]);
    }
    return new Set([
      "partner",
      "partnerRate",
      "vehicleNumber",
      "driverName",
      "driverPhone",
      "driverConfirm",
      "advancePaid",
      "notes",
      "assetDriver",
      "assetVehicle",
    ]);
  }, [wizardEnabled, wizardStep]);

  const stepIssues = useMemo(() => {
    if (!wizardEnabled || !stepFieldSet) return form.validationIssues;
    return form.validationIssues.filter((i) => stepFieldSet.has(i.field));
  }, [wizardEnabled, stepFieldSet, form.validationIssues]);

  const stepCanAdvance = wizardEnabled
    ? stepIssues.length === 0
    : form.canSubmit;

  const wizardSubmitLabel = wizardEnabled
    ? wizardStep === "allocation"
      ? "Create Trip"
      : "Continue"
    : "Create Trip";

  const wizardSubtitle = wizardEnabled
    ? wizardStep === "route"
      ? "Route"
      : wizardStep === "client"
        ? "Client & Price"
        : "Allocation"
    : undefined;

  const handleSubmit = async () => {
    if (!form.canSubmit || submitting) return;
    const validationErr = form.getValidationError();
    if (validationErr) {
      Alert.alert("Invalid input", validationErr);
      return;
    }
    setSubmitting(true);
    try {
      const options: AddTripCompleteOptions = {
        supplySource: form.state.supplySource,
        driverPhone: form.state.driverPhone.trim() || undefined,
      };
      const result = await Promise.resolve(onComplete(form.buildPayload(), options));
      const typed = result as AddTripCompleteResult | undefined;
      if (typed?.trip && typed?.otp) {
        setCreatedResult({
          ...typed,
          otpScreenContext: buildOtpScreenContext(form.state),
        });
        return;
      }
      onClose();
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Failed to create trip.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleWizardPrimary = () => {
    if (!wizardEnabled) {
      void handleSubmit();
      return;
    }
    if (wizardStep === "route") {
      if (stepIssues.length > 0) {
        Alert.alert("Missing details", stepIssues[0]?.message ?? "Fill required fields.");
        return;
      }
      setWizardStep("client");
      return;
    }
    if (wizardStep === "client") {
      if (stepIssues.length > 0) {
        Alert.alert("Missing details", stepIssues[0]?.message ?? "Fill required fields.");
        return;
      }
      setWizardStep("allocation");
      return;
    }
    void handleSubmit();
  };

  const handleWizardBackOrClose = () => {
    if (!wizardEnabled) {
      onClose();
      return;
    }
    if (wizardStep === "allocation") {
      setWizardStep("client");
      return;
    }
    if (wizardStep === "client") {
      setWizardStep("route");
      return;
    }
    onClose();
  };

  const handleRegenerateOtp = async () => {
    if (!createdResult?.trip?.id || regenerating) return;
    setRegenerating(true);
    try {
      const { code, expires_at } = await regenerateTripOtp(createdResult.trip.id);
      if (code != null && expires_at != null)
        setCreatedResult({ ...createdResult, otp: { code, expires_at } });
    } finally {
      setRegenerating(false);
    }
  };

  const handleDone = () => {
    setCreatedResult(null);
    onClose();
  };

  if (createdResult?.trip && createdResult?.otp) {
    return (
      <AddTripModalLayout
        title="Trip created"
        subtitle="Share the code below — trip details stay on this screen for reference."
        submitLabel="Done"
        canSubmit={true}
        submitting={false}
        onClose={handleDone}
        onSubmit={handleDone}
      >
        <AddTripOtpSuccessBody
          createdResult={createdResult}
          regenerating={regenerating}
          onRegenerateOtp={handleRegenerateOtp}
        />
      </AddTripModalLayout>
    );
  }

  return (
    <AddTripModalLayout
      title="Create Trip"
      subtitle={wizardSubtitle ?? undefined}
      submitLabel={wizardSubmitLabel}
      canSubmit={stepCanAdvance}
      submitting={submitting}
      lockPrimaryUntilValid
      validationMessage={stepIssues[0]?.message ?? null}
      onClose={handleWizardBackOrClose}
      onSubmit={handleWizardPrimary}
    >
      <AddTripFormFields
        state={form.state}
        setters={form.setters}
        clients={clients}
        clientsLoading={clientsLoading}
        organizationId={organizationId}
        refetchClients={refetchClients}
        onSubmit={handleWizardPrimary}
        canSubmit={stepCanAdvance}
        validationIssues={stepIssues}
        validationMessage={stepIssues[0]?.message ?? null}
        wizardSection={wizardEnabled ? wizardStep : undefined}
        showInlineCta={false}
      />
    </AddTripModalLayout>
  );
}

function AddTripOtpSuccessBody({
  createdResult,
  regenerating,
  onRegenerateOtp,
}: {
  createdResult: AddTripCompleteResult;
  regenerating: boolean;
  onRegenerateOtp: () => void;
}) {
  const { width: winW } = useWindowDimensions();
  const metaInline = winW >= 540;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!regenerating) {
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [regenerating, spin]);

  const spinRotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const otp = createdResult.otp!;
  const ctx = createdResult.otpScreenContext;
  const expiresAt = new Date(otp.expires_at);
  const expiresStr = expiresAt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const vehicleDisplay =
    "vehicle_display_number" in createdResult.trip &&
    typeof createdResult.trip.vehicle_display_number === "string"
      ? createdResult.trip.vehicle_display_number.trim()
      : "";

  const digits = useMemo(
    () => String(otp.code).replace(/\D/g, "").split(""),
    [otp.code],
  );

  const hasSummary =
    !!ctx &&
    (ctx.pickupArea.length > 0 ||
      ctx.dropLocation.length > 0 ||
      !!ctx.clientName ||
      !!ctx.tons ||
      !!ctx.supplierDisplayName ||
      !!ctx.routeLine);

  return (
    <View style={otpStyles.screen}>
      <LinearGradient
        colors={["#ecfdf5", "#e0f2fe", "#f5f3ff", "#fafafa"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={["transparent", "rgba(255,255,255,0.5)", "transparent"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { opacity: 0.85 }]}
      />

      <MotiView
        from={{ opacity: 0, translateY: 22, scale: 0.96 }}
        animate={{ opacity: 1, translateY: 0, scale: 1 }}
        transition={{ type: "timing", duration: 520 }}
        style={otpStyles.cardWrap}
      >
        <View style={otpStyles.card}>
          <LinearGradient
            colors={[
              Theme.driverEmeraldDark,
              Theme.driverEmerald,
              "rgba(16, 185, 129, 0.85)",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={otpStyles.cardGlowTop}
          />
          <View style={otpStyles.cardInner}>
            <MotiView
              from={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 14, stiffness: 220 }}
            >
              <MotiView
                animate={{
                  scale: [1, 1.06, 1],
                  opacity: [1, 0.92, 1],
                }}
                transition={{
                  type: "timing",
                  duration: 2600,
                  loop: true,
                }}
                style={otpStyles.badgeCircleWrap}
              >
                <LinearGradient
                  colors={[Theme.driverEmeraldDark, Theme.driverEmerald]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={otpStyles.badgeCircle}
                >
                  <CheckCircle2 size={26} color={Theme.textOnPrimary} strokeWidth={2.5} />
                </LinearGradient>
              </MotiView>
            </MotiView>

            <Text style={otpStyles.kicker}>Driver OTP</Text>
            <Text style={otpStyles.instruction}>Share this code with the driver</Text>

            {hasSummary && ctx ? (
              <View style={otpStyles.summaryShell}>
                <Text style={otpStyles.summaryKicker}>Trip summary</Text>
                <View style={otpStyles.summaryRouteRow}>
                  <MapPinned size={14} color={Theme.iconPrimary} strokeWidth={2} />
                  <View style={otpStyles.summaryRouteTextCol}>
                    <Text style={otpStyles.summaryRouteMain} numberOfLines={2}>
                      {ctx.pickupArea || "—"}
                    </Text>
                    <View style={otpStyles.summaryArrowDivider}>
                      <ArrowDown size={11} color={Theme.textMuted} strokeWidth={2} />
                    </View>
                    <Text style={otpStyles.summaryRouteMain} numberOfLines={2}>
                      {ctx.dropLocation || "—"}
                    </Text>
                  </View>
                </View>
                {ctx.routeLine ? (
                  <Text style={otpStyles.summaryMetaLine} numberOfLines={1}>
                    {ctx.routeLine}
                  </Text>
                ) : null}
                <View style={otpStyles.summaryChips}>
                  {ctx.clientName ? (
                    <View style={otpStyles.chip}>
                      <Text style={otpStyles.chipLab}>Client</Text>
                      <Text style={otpStyles.chipVal} numberOfLines={1}>
                        {ctx.clientName}
                      </Text>
                    </View>
                  ) : null}
                  {ctx.supplierDisplayName ? (
                    <View style={otpStyles.chip}>
                      <Text style={otpStyles.chipLab}>Partner</Text>
                      <Text style={otpStyles.chipVal} numberOfLines={1}>
                        {ctx.supplierDisplayName}
                      </Text>
                    </View>
                  ) : null}
                  {ctx.tons ? (
                    <View style={otpStyles.chip}>
                      <Text style={otpStyles.chipLab}>Load</Text>
                      <Text style={otpStyles.chipVal} numberOfLines={1}>
                        {ctx.tons} t
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {ctx?.driverName ? (
              <MotiView
                from={{ opacity: 0, translateX: -8 }}
                animate={{ opacity: 1, translateX: 0 }}
                transition={{ type: "timing", duration: 400, delay: 120 }}
                style={otpStyles.driverBanner}
              >
                <View style={otpStyles.driverIconTile}>
                  <User size={17} color={Theme.driverEmeraldDark} strokeWidth={2} />
                </View>
                <View style={otpStyles.driverTextCol}>
                  <Text style={otpStyles.metaLabel}>Driver</Text>
                  <Text style={otpStyles.driverNameText} numberOfLines={1}>
                    {ctx.driverName}
                  </Text>
                </View>
              </MotiView>
            ) : null}

            <View style={otpStyles.codeBand} key={otp.code}>
              <View style={otpStyles.digitsRow}>
                {digits.length === 0 ? (
                  <Text style={otpStyles.digitFallback} selectable>
                    {otp.code}
                  </Text>
                ) : (
                  digits.map((d, i) => (
                    <MotiView
                      key={`${otp.code}-${i}`}
                      from={{ opacity: 0, translateY: 14, scale: 0.82 }}
                      animate={{ opacity: 1, translateY: 0, scale: 1 }}
                      transition={{
                        type: "spring",
                        damping: 15,
                        stiffness: 220,
                        delay: 80 + i * 55,
                      }}
                      style={otpStyles.digitCell}
                    >
                      <Text style={otpStyles.digitChar}>{d}</Text>
                    </MotiView>
                  ))
                )}
              </View>
            </View>

            <View
              style={[otpStyles.metaRowsWrap, metaInline && otpStyles.metaRowsWrapInline]}
            >
              {vehicleDisplay ? (
                <View style={[otpStyles.metaRow, metaInline && otpStyles.metaRowFlex]}>
                  <View style={otpStyles.metaIconTile}>
                    <Truck size={16} color={Theme.driverEmeraldDark} strokeWidth={2} />
                  </View>
                  <View style={otpStyles.metaTextCol}>
                    <Text style={otpStyles.metaLabel}>Vehicle</Text>
                    <Text style={otpStyles.vehicle}>{vehicleDisplay}</Text>
                  </View>
                </View>
              ) : null}
              <View style={[otpStyles.metaRow, metaInline && otpStyles.metaRowFlex]}>
                <View style={otpStyles.metaIconTileMuted}>
                  <Clock size={15} color={Theme.textMuted} strokeWidth={2} />
                </View>
                <View style={otpStyles.metaTextCol}>
                  <Text style={otpStyles.metaLabel}>Expires</Text>
                  <Text style={otpStyles.expiry}>{expiresStr}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[otpStyles.regenerateBtn, regenerating && otpStyles.regenerateBtnDisabled]}
              onPress={onRegenerateOtp}
              disabled={regenerating}
              activeOpacity={0.85}
            >
              <Animated.View style={{ transform: [{ rotate: spinRotate }] }}>
                <RotateCw size={15} color={Theme.primary} strokeWidth={2} />
              </Animated.View>
              <Text style={otpStyles.regenerateText}>
                {regenerating ? "Regenerating…" : "Regenerate OTP"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </MotiView>
    </View>
  );
}

const otpStyles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 320,
    position: "relative",
    overflow: "hidden",
  },
  cardWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 20,
    zIndex: 1,
  },
  card: {
    borderRadius: 24,
    overflow: "hidden",
    alignSelf: "center",
    width: "100%",
    maxWidth: 440,
    ...Platform.select({
      web: {
        boxShadow:
          "0 4px 6px rgba(15, 23, 42, 0.04), 0 24px 48px rgba(15, 23, 42, 0.12)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.12,
        shadowRadius: 32,
        elevation: 10,
      },
    }),
  },
  cardGlowTop: {
    height: 4,
    width: "100%",
    opacity: 0.95,
  },
  cardInner: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Theme.borderLight,
  },
  badgeCircleWrap: {
    alignSelf: "center",
    marginBottom: 12,
  },
  badgeCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        boxShadow: "0 12px 32px rgba(4, 120, 87, 0.32)",
      },
      default: {
        shadowColor: Theme.driverEmeraldDark,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
        elevation: 8,
      },
    }),
  },
  kicker: {
    alignSelf: "center",
    ...FinanceTxnTypography.fieldLabel,
    marginBottom: 4,
    textAlign: "center",
  },
  instruction: {
    alignSelf: "center",
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    marginBottom: 14,
    letterSpacing: -0.15,
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  summaryShell: {
    alignSelf: "stretch",
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    gap: 8,
  },
  summaryKicker: {
    ...FinanceTxnTypography.chipLabel,
    marginBottom: 2,
  },
  summaryRouteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  summaryRouteTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryArrowDivider: {
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 2,
    marginLeft: 2,
    opacity: 0.85,
  },
  summaryRouteMain: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 10,
    lineHeight: 14,
    flex: 1,
    minWidth: 0,
  },
  summaryMetaLine: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    marginTop: 2,
  },
  summaryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Theme.surfaceForm,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    maxWidth: "100%",
  },
  chipLab: {
    ...FinanceTxnTypography.chipLabel,
    marginBottom: 2,
  },
  chipVal: {
    ...FinanceTxnTypography.fieldValue,
    fontStyle: "normal",
    fontWeight: "600",
    fontSize: 9,
  },
  driverBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    alignSelf: "stretch",
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(4, 120, 87, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(4, 120, 87, 0.18)",
  },
  driverIconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(4, 120, 87, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(4, 120, 87, 0.2)",
  },
  driverTextCol: {
    flex: 1,
    minWidth: 0,
  },
  driverNameText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  codeBand: {
    alignSelf: "stretch",
    marginBottom: 14,
  },
  digitsRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  digitCell: {
    minWidth: 42,
    height: 48,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: "rgba(4, 120, 87, 0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(4, 120, 87, 0.22)",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
      },
      default: {},
    }),
  },
  digitChar: {
    fontSize: 22,
    fontWeight: "800",
    color: Theme.driverEmeraldDark,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.5,
  },
  digitFallback: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 10,
    color: Theme.driverEmeraldDark,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  metaRowsWrap: {
    gap: 10,
    marginBottom: 4,
    alignSelf: "stretch",
  },
  metaRowsWrapInline: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    minWidth: 0,
  },
  metaRowFlex: {
    flex: 1,
  },
  metaIconTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "rgba(4, 120, 87, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(4, 120, 87, 0.18)",
  },
  metaIconTileMuted: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  metaTextCol: {
    flex: 1,
    minWidth: 0,
  },
  metaLabel: {
    ...FinanceTxnTypography.fieldLabel,
    marginBottom: 2,
    fontSize: 8,
  },
  vehicle: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.4,
    fontVariant: ["tabular-nums"],
  },
  expiry: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimary,
    letterSpacing: -0.1,
    fontVariant: ["tabular-nums"],
  },
  regenerateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    alignSelf: "center",
    marginTop: 10,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Theme.primary,
    backgroundColor: "rgba(79, 70, 229, 0.05)",
  },
  regenerateBtnDisabled: {
    opacity: 0.55,
  },
  regenerateText: {
    ...FinanceTxnTypography.buttonLabel,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: Theme.primary,
    textTransform: "uppercase",
  },
});

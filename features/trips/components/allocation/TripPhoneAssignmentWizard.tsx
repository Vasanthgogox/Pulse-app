/**
 * Stepped assign / reassign-by-phone wizard — same allocation UX as Create Trip
 * and indent deploy (keypad flows, driver recommendations, review step).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ExistingDriverMatch } from "@/features/drivers/services/drivers.service";
import { Shield } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Layout from "@/constants/Layout";
import { isIndianVehiclePlateComplete } from "@/lib/indianVehicleInput.util";
import Theme from "@/constants/Theme";
import { AddTripWizardProgress } from "@/features/trips/components/add-trip/AddTripWizardProgress";
import { AggregateTrackingMobileStep } from "@/features/trips/components/add-trip/AggregateTrackingMobileStep";
import type { AddTripIssueField } from "@/features/trips/components/add-trip/useAddTripForm";
import { AssignmentFlowFooter } from "@/features/trips/components/assignment/assignmentFlowFooter";
import { AssignmentFlowShell } from "@/features/trips/components/assignment/AssignmentFlowShell";
import {
  isTripPhoneWizardStepComplete,
  TRIP_PHONE_WIZARD_STEPS,
  tripPhoneWizardSubtitle,
  type TripPhoneWizardStep,
} from "@/features/trips/components/allocation/tripPhoneAssignmentWizardSteps";
import { useAggregateDriverPhoneLookup } from "@/features/trips/hooks/useAggregateDriverPhoneLookup";
import { assignmentShellStyles } from "@/features/trips/styles/assignmentShellShared";
import { formatIndianVehicleNumber, formatMobileNumber } from "@/lib/format";
import { getTripDisplayNumber, type TripRow } from "@/features/trips/services/trips.service";

export type TripPhoneOtpReveal = {
  code: string;
  expires_at: string | null;
};

export type TripPhoneAssignmentWizardProps = {
  visible: boolean;
  onClose: () => void;
  trip: TripRow;
  organizationId: string;
  driverAssignOrgId: string | null;
  isReassign: boolean;
  initialDriverName?: string;
  initialVehicle?: string;
  driverPhone: string;
  onDriverPhoneChange: (value: string) => void;
  driverName: string;
  onDriverNameChange: (value: string) => void;
  vehiclePlate: string;
  onVehiclePlateChange: (value: string) => void;
  saving: boolean;
  error: string | null;
  onSubmit: () => void;
  otpReveal: TripPhoneOtpReveal | null;
  onOtpDismiss: () => void;
  fullPageFlow?: boolean;
  /** When false, vehicle step can be skipped (optional plate). Default true for aggregate. */
  vehicleRequired?: boolean;
  presentationStyle?: "pageSheet" | "fullScreen";
};

export function TripPhoneAssignmentWizard({
  visible,
  onClose,
  trip,
  organizationId,
  driverAssignOrgId,
  isReassign,
  initialDriverName = "",
  initialVehicle = "",
  driverPhone,
  onDriverPhoneChange,
  driverName,
  onDriverNameChange,
  vehiclePlate,
  onVehiclePlateChange,
  saving,
  error,
  onSubmit,
  otpReveal,
  onOtpDismiss,
  fullPageFlow = false,
  vehicleRequired = true,
  presentationStyle = "pageSheet",
}: TripPhoneAssignmentWizardProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const useSteppedWizard =
    fullPageFlow ||
    Platform.OS !== "web" ||
    windowWidth < Layout.wizardSteppedMaxWidth;

  const existingVehiclePlate = useMemo(
    () =>
      formatIndianVehicleNumber(
        trip.vehicle_display_number ?? initialVehicle ?? "",
      ).trim(),
    [trip.vehicle_display_number, initialVehicle],
  );

  const effectiveVehicleRequired = useMemo(() => {
    if (!vehicleRequired) return false;
    if (
      isReassign &&
      (trip.vehicle_id || isIndianVehiclePlateComplete(existingVehiclePlate))
    ) {
      return false;
    }
    return true;
  }, [
    vehicleRequired,
    isReassign,
    trip.vehicle_id,
    existingVehiclePlate,
  ]);

  const [wizardStep, setWizardStep] = useState<TripPhoneWizardStep>("driverPhone");
  const [driverNameManual, setDriverNameManual] = useState(false);

  const lookup = useAggregateDriverPhoneLookup({
    phone: driverPhone,
    tripId: trip.id,
    organizationId,
    driverAssignOrgId,
    enabled: visible && !otpReveal,
  });

  const tripLabel = getTripDisplayNumber(trip);

  useEffect(() => {
    if (!visible) {
      setWizardStep("driverPhone");
      setDriverNameManual(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || driverNameManual || wizardStep !== "driverName") return;
    const suggested = lookup.suggestedName;
    if (suggested && !driverName.trim()) {
      onDriverNameChange(suggested);
    }
  }, [
    visible,
    driverNameManual,
    wizardStep,
    lookup.suggestedName,
    driverName,
    onDriverNameChange,
  ]);

  const stepValidationState = useMemo(
    () => ({
      driverPhone,
      driverName,
      vehiclePlate,
      phoneComplete: lookup.phoneComplete,
      phoneLookupLoading: lookup.loading,
      phoneInTrip: lookup.inTrip,
      phoneMatches: lookup.matches,
      selectedMatchUserId: lookup.selectedUserId,
      vehicleRequired: effectiveVehicleRequired,
      existingVehiclePlate,
    }),
    [
      driverPhone,
      driverName,
      vehiclePlate,
      lookup.phoneComplete,
      lookup.loading,
      lookup.inTrip,
      lookup.matches,
      lookup.selectedUserId,
      effectiveVehicleRequired,
      existingVehiclePlate,
    ],
  );

  const canContinue = isTripPhoneWizardStepComplete(wizardStep, stepValidationState);
  const canSubmitAll = isTripPhoneWizardStepComplete("review", stepValidationState);

  const handlePhoneChange = useCallback(
    (value: string) => {
      onDriverPhoneChange(formatMobileNumber(value));
    },
    [onDriverPhoneChange],
  );

  const handleVehicleChange = useCallback(
    (value: string) => {
      onVehiclePlateChange(formatIndianVehicleNumber(value));
    },
    [onVehiclePlateChange],
  );

  const handleDriverNameChange = useCallback(
    (value: string) => {
      setDriverNameManual(true);
      onDriverNameChange(value);
    },
    [onDriverNameChange],
  );

  const handleSelectMatch = useCallback(
    (match: ExistingDriverMatch) => {
      lookup.applyMatch(match);
      if (match.full_name?.trim()) {
        setDriverNameManual(false);
        onDriverNameChange(match.full_name.trim());
      }
    },
    [lookup, onDriverNameChange],
  );

  const handleWizardPrimary = useCallback(() => {
    if (wizardStep === "driverPhone" && canContinue) {
      setWizardStep("driverName");
      return;
    }
    if (wizardStep === "driverName" && canContinue) {
      setWizardStep("vehicle");
      return;
    }
    if (wizardStep === "vehicle" && canContinue) {
      setWizardStep("review");
      return;
    }
    if (wizardStep === "review" && canContinue) {
      onSubmit();
    }
  }, [wizardStep, canContinue, onSubmit]);

  const handleWizardBack = useCallback(() => {
    if (wizardStep === "driverName") setWizardStep("driverPhone");
    else if (wizardStep === "vehicle") setWizardStep("driverName");
    else if (wizardStep === "review") setWizardStep("vehicle");
    else onClose();
  }, [wizardStep, onClose]);

  const wizardPrimaryLabel = useMemo(() => {
    if (wizardStep === "review" || !useSteppedWizard) {
      return saving
        ? isReassign
          ? "Reassigning…"
          : "Assigning…"
        : isReassign
          ? "Reassign"
          : "Assign";
    }
    return "Continue";
  }, [wizardStep, saving, isReassign, useSteppedWizard]);

  const summaryDriver = useMemo(() => {
    const name = driverName.trim();
    const ph = driverPhone.trim();
    if (name && ph) return `${name} · ${ph}`;
    return name || ph || "—";
  }, [driverName, driverPhone]);

  const summaryVehicle = useMemo(() => {
    const plate =
      formatIndianVehicleNumber(vehiclePlate).trim() || existingVehiclePlate;
    return plate || "—";
  }, [vehiclePlate, existingVehiclePlate]);

  const submitBlockedHint = useMemo((): string | null => {
    if (saving) return null;
    if (lookup.loading) return "Checking driver availability…";
    if (lookup.inTrip) {
      return `This driver is on ${lookup.busyTripLabel ?? "another active trip"} — use another number.`;
    }
    if (lookup.lookupError) return lookup.lookupError;
    if (
      lookup.phoneComplete &&
      lookup.matches.length > 1 &&
      !lookup.selectedUserId
    ) {
      return "Multiple driver profiles found — select one above to continue.";
    }
    if (!canSubmitAll && !useSteppedWizard) {
      if (!lookup.phoneComplete) return "Enter a complete 10-digit mobile number.";
      if (driverName.trim().length < 2) return "Enter the driver name (at least 2 characters).";
      if (effectiveVehicleRequired && !isIndianVehiclePlateComplete(vehiclePlate)) {
        return "Enter the full vehicle number (XX NN LL NNNN).";
      }
    }
    if (useSteppedWizard && !canContinue) {
      if (wizardStep === "driverPhone" && lookup.loading) {
        return "Checking driver availability…";
      }
    }
    return error;
  }, [
    saving,
    lookup.loading,
    lookup.inTrip,
    lookup.busyTripLabel,
    lookup.lookupError,
    lookup.phoneComplete,
    lookup.matches.length,
    lookup.selectedUserId,
    canSubmitAll,
    useSteppedWizard,
    canContinue,
    wizardStep,
    driverName,
    effectiveVehicleRequired,
    vehiclePlate,
    error,
  ]);

  const title = isReassign ? "Reassign driver by phone" : "Assign driver by phone";
  const subtitle = otpReveal
    ? `Share with driver for ${tripLabel}`
    : tripPhoneWizardSubtitle(wizardStep, isReassign);

  const invalidField = useCallback(
    (field: AddTripIssueField) => {
      if (field === "driverPhone") {
        return wizardStep === "driverPhone" && !canContinue && lookup.phoneComplete;
      }
      if (field === "driverName") {
        return wizardStep === "driverName" && driverName.trim().length > 0 && driverName.trim().length < 2;
      }
      if (field === "vehicleNumber") {
        return (
          wizardStep === "vehicle" &&
          !!vehiclePlate.trim() &&
          !isTripPhoneWizardStepComplete("vehicle", stepValidationState)
        );
      }
      return false;
    },
    [wizardStep, canContinue, lookup.phoneComplete, driverName, vehiclePlate, stepValidationState],
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType={Platform.OS === "web" ? "fade" : "slide"}
      presentationStyle={
        Platform.OS === "web" ? "overFullScreen" : presentationStyle
      }
      transparent={Platform.OS === "web" && !fullPageFlow}
      onRequestClose={onClose}
    >
      <View
        style={[
          assignmentShellStyles.webModalBackdrop,
          fullPageFlow && { flex: 1, padding: 0, backgroundColor: Theme.screenBackground },
        ]}
      >
        <View
          style={[
            assignmentShellStyles.assignModalWrapSlate,
            fullPageFlow && { flex: 1, width: "100%", maxWidth: "100%", borderRadius: 0 },
            { flex: Platform.OS === "web" && !fullPageFlow ? 0 : 1 },
          ]}
        >
          {otpReveal ? (
            <View style={{ flex: 1, paddingTop: insets.top }}>
              <AssignmentFlowShell
                title="OTP ready"
                subtitle={`Share with driver for ${tripLabel}`}
                onClose={onOtpDismiss}
                insightPreset="allocation"
              >
                <View style={styles.otpCard}>
                  <FontAwesome name="check-circle" size={36} color={Theme.primary} />
                  <Text style={styles.otpTitle}>Verification code</Text>
                  <Text style={styles.otpCode}>{otpReveal.code}</Text>
                  {otpReveal.expires_at ? (
                    <Text style={styles.otpHint}>
                      Expires {new Date(otpReveal.expires_at).toLocaleString("en-IN")}
                    </Text>
                  ) : null}
                  <Text style={styles.otpHint}>
                    Ask the driver to enter this code in the driver app to claim the trip.
                    You can resend from trip details if needed.
                  </Text>
                  <TouchableOpacity
                    style={styles.otpDoneBtn}
                    onPress={onOtpDismiss}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.otpDoneText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </AssignmentFlowShell>
            </View>
          ) : (
            <AssignmentFlowShell
              title={title}
              subtitle={subtitle}
              onClose={onClose}
              onBack={useSteppedWizard ? handleWizardBack : undefined}
              showBack={useSteppedWizard && wizardStep !== "driverPhone"}
              submitting={saving}
              fillBody={useSteppedWizard}
              scrollBody={!useSteppedWizard}
              insightPreset="allocation"
              progress={
                useSteppedWizard ? (
                  <AddTripWizardProgress
                    steps={TRIP_PHONE_WIZARD_STEPS}
                    currentStepId={wizardStep}
                  />
                ) : undefined
              }
              footer={
                <AssignmentFlowFooter
                  summary={
                    wizardStep === "review" || !useSteppedWizard
                      ? `${summaryDriver} · ${summaryVehicle}`
                      : undefined
                  }
                  primaryLabel={wizardPrimaryLabel}
                  onPrimaryPress={
                    useSteppedWizard ? handleWizardPrimary : () => onSubmit()
                  }
                  primaryDisabled={
                    useSteppedWizard
                      ? !canContinue || saving || lookup.inTrip || lookup.loading
                      : !canSubmitAll || saving || lookup.inTrip || lookup.loading
                  }
                  loading={saving}
                  hint={submitBlockedHint}
                />
              }
            >
              {useSteppedWizard ? (
                <>
                  {wizardStep === "driverPhone" ||
                  wizardStep === "driverName" ||
                  wizardStep === "vehicle" ? (
                    <AggregateTrackingMobileStep
                      step={wizardStep}
                      driverName={driverName}
                      onDriverNameChange={handleDriverNameChange}
                      driverPhone={driverPhone}
                      onDriverPhoneChange={handlePhoneChange}
                      vehicleText={vehiclePlate}
                      onVehicleTextChange={handleVehicleChange}
                      invalid={invalidField}
                      driverPhoneMatches={lookup.matches}
                      driverPhoneLookupLoading={lookup.loading}
                      selectedDriverMatchId={lookup.selectedUserId}
                      onSelectDriverMatch={handleSelectMatch}
                      driverPhoneInTrip={lookup.inTrip}
                      driverNameFromPlatform={lookup.suggestedName}
                      testIDPrefix="trip-phone-wizard"
                    />
                  ) : null}

                  {wizardStep === "review" ? (
                    <View style={styles.reviewStack}>
                      <View style={assignmentShellStyles.tripAssignSurfaceCard}>
                        <Text style={styles.reviewHeading}>Review assignment</Text>
                        <View style={styles.reviewRow}>
                          <Text style={styles.reviewLabel}>Driver</Text>
                          <Text style={styles.reviewValue} numberOfLines={2}>
                            {summaryDriver}
                          </Text>
                        </View>
                        <View style={styles.reviewRow}>
                          <Text style={styles.reviewLabel}>Vehicle</Text>
                          <Text style={styles.reviewValue} numberOfLines={2}>
                            {summaryVehicle}
                          </Text>
                        </View>
                        <View style={styles.reviewRow}>
                          <Text style={styles.reviewLabel}>Trip</Text>
                          <Text style={styles.reviewValue}>{tripLabel}</Text>
                        </View>
                      </View>

                      <View style={styles.secureCard}>
                        <View style={styles.secureIcon}>
                          <Shield size={18} color={Theme.iconPrimary} />
                        </View>
                        <View style={styles.secureBody}>
                          <Text style={styles.secureTitle}>Secure assignment</Text>
                          <Text style={styles.secureText}>
                            Assigning by phone uses OTP verification. Share the code with
                            the driver after you {isReassign ? "reassign" : "assign"} them.
                          </Text>
                        </View>
                      </View>

                      {error ? <Text style={styles.errorText}>{error}</Text> : null}
                    </View>
                  ) : null}

                  {wizardStep !== "review" && error ? (
                    <Text style={styles.errorText}>{error}</Text>
                  ) : null}
                </>
              ) : (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.desktopScroll}
                >
                  <AggregateTrackingMobileStep
                    step="driverPhone"
                    driverName={driverName || initialDriverName}
                    onDriverNameChange={handleDriverNameChange}
                    driverPhone={driverPhone}
                    onDriverPhoneChange={handlePhoneChange}
                    vehicleText={vehiclePlate || initialVehicle}
                    onVehicleTextChange={handleVehicleChange}
                    invalid={invalidField}
                    driverPhoneMatches={lookup.matches}
                    driverPhoneLookupLoading={lookup.loading}
                    selectedDriverMatchId={lookup.selectedUserId}
                    onSelectDriverMatch={handleSelectMatch}
                    driverPhoneInTrip={lookup.inTrip}
                    driverNameFromPlatform={lookup.suggestedName}
                    testIDPrefix="trip-phone-wizard"
                  />
                  <View style={{ height: 12 }} />
                  <AggregateTrackingMobileStep
                    step="driverName"
                    driverName={driverName || initialDriverName}
                    onDriverNameChange={handleDriverNameChange}
                    driverPhone={driverPhone}
                    onDriverPhoneChange={handlePhoneChange}
                    vehicleText={vehiclePlate || initialVehicle}
                    onVehicleTextChange={handleVehicleChange}
                    invalid={invalidField}
                    driverPhoneMatches={lookup.matches}
                    selectedDriverMatchId={lookup.selectedUserId}
                    onSelectDriverMatch={handleSelectMatch}
                    testIDPrefix="trip-phone-wizard"
                  />
                  <View style={{ height: 12 }} />
                  <AggregateTrackingMobileStep
                    step="vehicle"
                    driverName={driverName}
                    onDriverNameChange={handleDriverNameChange}
                    driverPhone={driverPhone}
                    onDriverPhoneChange={handlePhoneChange}
                    vehicleText={vehiclePlate || initialVehicle}
                    onVehicleTextChange={handleVehicleChange}
                    invalid={invalidField}
                    testIDPrefix="trip-phone-wizard"
                  />

                  <View style={styles.secureCard}>
                    <View style={styles.secureIcon}>
                      <Shield size={18} color={Theme.iconPrimary} />
                    </View>
                    <View style={styles.secureBody}>
                      <Text style={styles.secureTitle}>Secure assignment</Text>
                      <Text style={styles.secureText}>
                        Assigning by phone uses OTP verification. Share the code with the
                        driver after you {isReassign ? "reassign" : "assign"} them.
                      </Text>
                    </View>
                  </View>

                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                </ScrollView>
              )}
            </AssignmentFlowShell>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  reviewStack: {
    gap: 12,
    paddingTop: 4,
    flex: 1,
  },
  reviewHeading: {
    fontSize: 11,
    fontWeight: "800" as const,
    letterSpacing: 0.6,
    color: Theme.textMuted,
    textTransform: "uppercase" as const,
    marginBottom: 8,
  },
  reviewRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  reviewLabel: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: Theme.textMuted,
    flexShrink: 0,
  },
  reviewValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700" as const,
    color: Theme.textPrimaryDark,
    textAlign: "right" as const,
  },
  secureCard: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  secureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  secureBody: {
    flex: 1,
    minWidth: 0,
  },
  secureTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  secureText: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Theme.destructive,
    marginTop: 8,
  },
  desktopScroll: {
    paddingBottom: 16,
    gap: 4,
  },
  otpCard: {
    alignItems: "center" as const,
    padding: 24,
    gap: 8,
  },
  otpTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: Theme.textPrimaryDark,
    marginTop: 8,
  },
  otpCode: {
    fontSize: 32,
    fontWeight: "800" as const,
    letterSpacing: 4,
    color: Theme.textPrimaryDark,
    marginVertical: 8,
  },
  otpHint: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: Theme.textSecondary,
    textAlign: "center" as const,
    lineHeight: 18,
  },
  otpDoneBtn: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: Theme.primary,
  },
  otpDoneText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Theme.textOnPrimary,
  },
};

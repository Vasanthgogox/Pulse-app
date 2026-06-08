/**
 * Full-screen driver & vehicle assignment flow (trip detail → Change).
 * Same pulse wizard chrome as Create Trip allocation.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Truck, User } from "lucide-react-native";

import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Theme from "@/constants/Theme";
import { AggregateTripOtpPanel } from "@/features/trips/components/AggregateTripOtpPanel";
import { TripAssignmentBlock } from "@/features/trips/components/TripAssignmentBlock";
import { AddTripWizardProgress } from "@/features/trips/components/add-trip/AddTripWizardProgress";
import { AssignmentFlowFooter } from "@/features/trips/components/assignment/assignmentFlowFooter";
import { AssignmentFlowShell } from "@/features/trips/components/assignment/AssignmentFlowShell";
import { useTripDetail } from "@/features/trips/components/trip-detail/hooks/useTripDetail";
import { isAggregateTrip } from "@/features/drivers/utils/driverUtils.util";
import {
  getTripDisplayNumber,
  isTripCompleted,
} from "@/features/trips/services/trips.service";
import { assignmentShellStyles } from "@/features/trips/styles/assignmentShellShared";
import { formatIndianVehicleNumber } from "@/lib/format";
import { useOrganization } from "@/contexts/OrganizationContext";

export type AssignmentFlowFocus = "driver" | "vehicle";

const FLOW_STEPS = [
  { id: "driver", label: "Driver" },
  { id: "vehicle", label: "Vehicle" },
] as const;

type FlowStep = (typeof FLOW_STEPS)[number]["id"];

export interface TripAssignmentFlowScreenProps {
  tripId: string;
  initialFocus?: AssignmentFlowFocus;
  onBack: () => void;
}

export function TripAssignmentFlowScreen({
  tripId,
  initialFocus = "driver",
  onBack,
}: TripAssignmentFlowScreenProps) {
  const { currentOrganization } = useOrganization();
  const detail = useTripDetail({ tripId, onBack });
  const [step, setStep] = useState<FlowStep>(
    initialFocus === "vehicle" ? "vehicle" : "driver",
  );
  const [pickerNonce, setPickerNonce] = useState(0);

  const trip = detail.trip;
  const orgId = currentOrganization?.id ?? trip?.organization_id ?? "";

  const isAggregate = trip ? isAggregateTrip(trip) : false;
  const tripCompleted = trip ? isTripCompleted(trip) : false;

  const driverDisplay =
    detail.driverName?.trim() ||
    String(trip?.driver_display_name ?? "").trim() ||
    "Not assigned";
  const vehicleDisplay =
    (isAggregate ? detail.displayVehicleFromInput.trim() : "") ||
    detail.vehicleLabel?.trim() ||
    formatIndianVehicleNumber(trip?.vehicle_display_number ?? "") ||
    "Not assigned";

  const hasDriver = !!trip?.driver_id || driverDisplay !== "Not assigned";
  const hasVehicle =
    !!trip?.vehicle_id ||
    !!String(trip?.vehicle_display_number ?? "").trim() ||
    vehicleDisplay !== "Not assigned";

  const openPickerForStep = useCallback((target: FlowStep) => {
    setStep(target);
    setPickerNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    setPickerNonce((n) => n + 1);
  }, []);

  const stepSubtitle = useMemo(() => {
    if (isAggregate) {
      return step === "driver"
        ? "Step 1 · Driver name & mobile"
        : "Step 2 · Vehicle registration";
    }
    return step === "driver"
      ? "Step 1 · Choose from your fleet"
      : "Step 2 · Choose fleet vehicle";
  }, [step, isAggregate]);

  const canContinueDriver = hasDriver;
  const canFinish = hasDriver && hasVehicle;

  const handlePrimary = useCallback(() => {
    if (step === "driver") {
      if (canContinueDriver) setStep("vehicle");
      return;
    }
    if (canFinish) onBack();
  }, [step, canContinueDriver, canFinish, onBack]);

  const handleBack = useCallback(() => {
    if (step === "vehicle") setStep("driver");
    else onBack();
  }, [step, onBack]);

  if (detail.loading) {
    return <CenteredLoadingView message="Loading trip…" />;
  }

  if (detail.error || !trip || !orgId) {
    return (
      <AssignmentFlowShell
        variant="pulse"
        title="Driver & vehicle"
        subtitle="Could not load trip"
        onClose={onBack}
      >
        <Text style={styles.unavailable}>
          {detail.error ?? "Trip not found"}
        </Text>
      </AssignmentFlowShell>
    );
  }

  if (!detail.canAssign || tripCompleted) {
    return (
      <AssignmentFlowShell
        variant="pulse"
        title="Driver & vehicle"
        subtitle="Assignment is not available for this trip"
        onClose={onBack}
      >
        <Text style={styles.unavailable}>
          This trip cannot be reassigned from here.
        </Text>
      </AssignmentFlowShell>
    );
  }

  const otpLockedByTripProgress = ["in_progress", "in_transit"].includes(
    String(trip.status ?? "").toLowerCase(),
  );
  const driverIsUnlinked = !!trip.driver_id && !detail.driverLinked;
  const canGenerateAggregateOtp =
    !!trip.driver_id &&
    (!!trip.vehicle_id || !!String(trip.vehicle_display_number ?? "").trim());

  const aggregateOtpState = (() => {
    if (!isAggregate && driverIsUnlinked) return "otp_pending" as const;
    if (!isAggregate) return null;
    if (!canGenerateAggregateOtp) return "not_required" as const;
    const status = String(trip.status ?? "").toLowerCase();
    if (status === "assigned") return "otp_pending" as const;
    if (status === "in_progress" || status === "in_transit") return "verified" as const;
    return "not_required" as const;
  })();

  return (
    <AssignmentFlowShell
      variant="pulse"
      fullScreen
      scrollBody
      title="Driver & vehicle"
      subtitle={stepSubtitle}
      onClose={onBack}
      onBack={handleBack}
      showBack={step === "vehicle"}
      progress={
        <AddTripWizardProgress steps={FLOW_STEPS} currentStepId={step} />
      }
      footer={
        <AssignmentFlowFooter
          summary={`${driverDisplay} · ${vehicleDisplay}`}
          primaryLabel={step === "driver" ? "Continue" : "Done"}
          onPrimaryPress={handlePrimary}
          primaryDisabled={step === "driver" ? !canContinueDriver : !canFinish}
        />
      }
    >
      <Text style={assignmentShellStyles.stepLabel}>Current assignment</Text>

      <Pressable
        style={[
          assignmentShellStyles.choiceCard,
          step === "driver" && styles.choiceActive,
        ]}
        onPress={() => openPickerForStep("driver")}
      >
        <View style={assignmentShellStyles.choiceIconWrap}>
          <User size={18} color={Theme.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={assignmentShellStyles.choiceTitle}>Driver</Text>
          <Text style={assignmentShellStyles.choiceSub} numberOfLines={1}>
            {driverDisplay}
          </Text>
        </View>
        <ChevronRight
          size={18}
          color={Theme.textMuted}
          style={assignmentShellStyles.choiceChevron}
        />
      </Pressable>

      <Pressable
        style={[
          assignmentShellStyles.choiceCard,
          step === "vehicle" && styles.choiceActive,
        ]}
        onPress={() => openPickerForStep("vehicle")}
      >
        <View style={[assignmentShellStyles.choiceIconWrap, styles.vehicleIcon]}>
          <Truck size={18} color="#0f172a" strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={assignmentShellStyles.choiceTitle}>Vehicle</Text>
          <Text style={assignmentShellStyles.choiceSub} numberOfLines={1}>
            {vehicleDisplay}
          </Text>
        </View>
        <ChevronRight
          size={18}
          color={Theme.textMuted}
          style={assignmentShellStyles.choiceChevron}
        />
      </Pressable>

      {(isAggregate || driverIsUnlinked) && step === "vehicle" && aggregateOtpState ? (
        <AggregateTripOtpPanel
          variant="sheet"
          tripNumber={getTripDisplayNumber(trip, orgId)}
          aggregateOtpState={aggregateOtpState}
          canGenerateAggregateOtp={canGenerateAggregateOtp}
          otpLockedByTripProgress={otpLockedByTripProgress}
          tripOtp={detail.tripOtp}
          onResendOtp={async () => {
            await detail.handleRefresh();
          }}
          otpResending={false}
        />
      ) : null}

      <TripAssignmentBlock
        trip={trip}
        organizationId={orgId}
        canAssign={detail.canAssign}
        onUpdated={detail.handleAssignmentUpdated}
        partnerName={detail.partnerName}
        driverName={detail.driverName}
        vehicleLabel={
          isAggregate
            ? detail.displayVehicleFromInput.trim() || detail.vehicleLabel || null
            : detail.vehicleLabel
        }
        driverAvatarUri={detail.driverAvatarUri}
        showAssignByPhone={detail.showAssignByPhone}
        assignmentSource={detail.assignmentSource}
        currentUserId={detail.currentUserId}
        previousDriverName={detail.previousDriverName}
        latestReassignmentSummary={detail.latestReassignmentSummary}
        driverAssignOrgId={isAggregate ? (currentOrganization?.id ?? null) : null}
        showManifestCard={false}
        fullPageFlow
        autoOpenPickerMode={step}
        autoOpenPickerNonce={pickerNonce}
        onVehicleDisplayChange={(value) => {
          detail.setDisplayVehicleFromInput(formatIndianVehicleNumber(value ?? ""));
        }}
        onBeforeRegisterNavigate={onBack}
      />
    </AssignmentFlowShell>
  );
}

const styles = StyleSheet.create({
  choiceActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(79,70,229,0.06)",
  },
  vehicleIcon: {
    backgroundColor: "#e2e8f0",
  },
  unavailable: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 20,
  },
});

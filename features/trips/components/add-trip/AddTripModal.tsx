/**
 * Add Trip — main modal: composes layout, form fields, and hooks.
 * Thin container; logic lives in useAddTripForm and useClientsForTrip.
 * Waits for onComplete (e.g. createTrip) to finish before closing so lists refetch with new data.
 */
import { useState } from "react";
import { Alert, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { AddTripFormFields } from "./AddTripFormFields";
import { AddTripModalLayout } from "./AddTripModalLayout";
import type { AddTripCompleteOptions, AddTripCompleteResult, AddTripModalProps } from "./types";
import { useAddTripForm } from "./useAddTripForm";
import { useClientsForTrip } from "./useClientsForTrip";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { regenerateTripOtp } from "@/features/trips/services/tripOtp.service";
import { useWindowDimensions } from "react-native";

export function AddTripModal({
  organizationId,
  onClose,
  onComplete,
}: AddTripModalProps) {
  const { width: windowWidth } = useWindowDimensions();
  const showStickyFooter = windowWidth < 480;
  const form = useAddTripForm();
  const [submitting, setSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<AddTripCompleteResult | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const {
    clients,
    loading: clientsLoading,
    refetch: refetchClients,
  } = useClientsForTrip(organizationId);

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
        setCreatedResult(typed);
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

  const handleRegenerateOtp = async () => {
    if (!createdResult?.trip?.id || regenerating) return;
    setRegenerating(true);
    try {
      const { code, expires_at } = await regenerateTripOtp(createdResult.trip.id);
      if (code != null && expires_at != null) setCreatedResult({ ...createdResult, otp: { code, expires_at } });
    } finally {
      setRegenerating(false);
    }
  };

  const handleDone = () => {
    setCreatedResult(null);
    onClose();
  };

  if (createdResult?.trip && createdResult?.otp) {
    const expiresAt = new Date(createdResult.otp.expires_at);
    const expiresStr = expiresAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const vehicleDisplay = "vehicle_display_number" in createdResult.trip && typeof createdResult.trip.vehicle_display_number === "string"
      ? createdResult.trip.vehicle_display_number.trim()
      : "";
    return (
      <AddTripModalLayout
        title="Trip created"
        submitLabel="Done"
        canSubmit={true}
        submitting={false}
        primaryActionMode="footer"
        onClose={handleDone}
        onSubmit={handleDone}
      >
        <View style={otpStyles.card}>
          <Text style={otpStyles.label}>Share this OTP with the driver</Text>
          <Text style={otpStyles.code}>{createdResult.otp.code}</Text>
          {vehicleDisplay ? (
            <Text style={otpStyles.vehicle}>Vehicle: {vehicleDisplay}</Text>
          ) : null}
          <Text style={otpStyles.expiry}>Valid until {expiresStr}</Text>
          <TouchableOpacity
            style={otpStyles.regenerateBtn}
            onPress={handleRegenerateOtp}
            disabled={regenerating}
          >
            <FontAwesome name="refresh" size={14} color={Theme.primary} />
            <Text style={otpStyles.regenerateText}>
              {regenerating ? "Regenerating…" : "Regenerate OTP"}
            </Text>
          </TouchableOpacity>
        </View>
      </AddTripModalLayout>
    );
  }

  return (
    <AddTripModalLayout
      title="Create Trip"
      submitLabel="Create Trip"
      canSubmit={form.canSubmit}
      submitting={submitting}
      primaryActionMode={showStickyFooter ? "footer" : "content"}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <AddTripFormFields
        state={form.state}
        setters={form.setters}
        clients={clients}
        clientsLoading={clientsLoading}
        organizationId={organizationId}
        refetchClients={refetchClients}
        onSubmit={handleSubmit}
        canSubmit={form.canSubmit}
        submitting={submitting}
        showInlineCta={!showStickyFooter}
      />
    </AddTripModalLayout>
  );
}

const otpStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    padding: Layout.sectionSpacing,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginBottom: 8,
  },
  code: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 6,
    color: Theme.primary,
    marginBottom: 4,
  },
  vehicle: {
    fontSize: 13,
    color: Theme.textSecondary,
    marginBottom: 4,
  },
  expiry: {
    fontSize: 12,
    color: Theme.textMuted,
    marginBottom: 16,
  },
  regenerateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  regenerateText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
});

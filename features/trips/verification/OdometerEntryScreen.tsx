import { SmartInput } from "@/components/mobile-input";
import {
  OperationalBottomActionBar,
  OperationalButton,
  OperationalHeader,
  Surface,
} from "@/components/operational";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useIsOnline } from "@/contexts/NetworkContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import { useGPSDistanceEstimate } from "./GPSDistanceHook";
import { flushVerificationOutbox } from "./offline/sync";
import { useSaveTripVerification } from "./queries/useTripVerification";
import { useVerificationSyncState } from "./state/useVerificationSyncState";
import { OdometerPhotoCapture } from "./OdometerPhotoCapture";
import type { VerificationSide } from "./types";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export function OdometerEntryScreen({
  trip,
  side,
}: {
  trip: TripRow;
  side: VerificationSide;
}) {
  const router = useRouter();
  const { profile } = useAuth();
  const isOnline = useIsOnline();
  const saveVerification = useSaveTripVerification();
  const { pendingCount, failedCount, refresh } = useVerificationSyncState();
  const gpsDistanceKm = useGPSDistanceEstimate(trip);
  const [odometerKm, setOdometerKm] = useState<number | null>(
    side === "start" ? trip.start_odometer_km ?? null : trip.end_odometer_km ?? null,
  );
  const [notes, setNotes] = useState(trip.odometer_notes ?? "");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [syncHint, setSyncHint] = useState<string | null>(null);

  const title = side === "start" ? "Start Odometer" : "Closing Odometer";
  const subtitle =
    side === "start"
      ? "Optional verification before movement. You can skip and continue."
      : "Optional verification before/after completion. You can update later.";

  const contextLine = useMemo(
    () => `${trip.pickup_area || "Pickup"} → ${trip.drop_location || "Drop"}`,
    [trip.drop_location, trip.pickup_area],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!isOnline) return;
    void flushVerificationOutbox().then(() => refresh());
  }, [isOnline, refresh]);

  const saving = saveVerification.isPending;

  const handleCapturePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Camera required", "Enable camera access to capture odometer photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setPhotoUri(result.assets[0].uri);
  };

  const handleSave = async () => {
    if (saving) return;
    setSyncHint(null);
    try {
      const result = await saveVerification.mutateAsync({
        tripId: trip.id,
        side,
        odometerKm,
        gpsDistanceKm,
        notes,
        updatedBy: profile?.uid ?? null,
        photoLocalUri: photoUri,
        photoUserId: profile?.uid ?? null,
      });
      if (result.queued) {
        setSyncHint(
          "Saved to offline queue. Verification will sync automatically when online.",
        );
      }
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert(
        "Could not save verification",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  };

  return (
    <View style={styles.screen}>
      <OperationalHeader title={title} subtitle={subtitle} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Surface elevation={1}>
          <SmartInput
            type="distance"
            value={odometerKm ?? ""}
            onChange={(_, numeric) => setOdometerKm(numeric)}
            label={`${side === "start" ? "Starting" : "Closing"} Odometer`}
            context={contextLine}
            placeholder="Enter KM"
            submitLabel="Apply KM"
            suffix=" KM"
            required={false}
            validation={{ min: 0, max: 999999 }}
          />
        </Surface>

        <OdometerPhotoCapture
          photoUri={photoUri}
          busy={saving}
          onCapture={handleCapturePhoto}
          onRetake={handleCapturePhoto}
        />

        <Surface elevation={1}>
          <Text style={styles.notesTitle}>Notes (optional)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any odometer issue, correction, or remark"
            placeholderTextColor={Theme.textMuted}
            multiline
          />
        </Surface>

        {syncHint ? <Text style={styles.syncHint}>{syncHint}</Text> : null}
        {pendingCount > 0 ? (
          <Text style={styles.syncHint}>
            Pending sync items: {pendingCount}
            {failedCount > 0 ? ` · failed: ${failedCount}` : ""}
          </Text>
        ) : null}
      </ScrollView>

      <OperationalBottomActionBar>
        <View style={styles.footerRow}>
          <OperationalButton
            intent="utility"
            label="Skip for now"
            onPress={() => router.back()}
            disabled={saving}
            fullWidth
          />
          <OperationalButton
            intent="bottomSticky"
            label={saving ? "Saving..." : "Save verification"}
            onPress={handleSave}
            loading={saving}
            fullWidth
          />
        </View>
      </OperationalBottomActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  content: {
    padding: 14,
    paddingBottom: 24,
    gap: 12,
  },
  notesTitle: {
    color: Theme.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  notesInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    padding: 10,
    color: Theme.text,
    backgroundColor: Theme.whiteMuted,
    textAlignVertical: "top",
    fontSize: 13,
  },
  footerRow: {
    gap: 10,
  },
  syncHint: {
    color: "#b45309",
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
});

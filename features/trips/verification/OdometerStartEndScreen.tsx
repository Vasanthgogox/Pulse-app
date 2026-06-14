import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useIsOnline } from "@/contexts/NetworkContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import { DriverOpsEntryFooter } from "@/features/trips/operations/shared/DriverOpsEntryFooter";
import { OpsEntryBodyPhotoSlot } from "@/features/trips/operations/shared/OpsEntryBodyPhotoSlot";
import { driverOpsEntryStyles as ops } from "@/features/trips/operations/shared/driverOpsEntry.styles";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { normalizeOdometerRaw } from "./applyOdometerScan.util";
import { OdometerEntryShell } from "./components/OdometerEntryShell";
import { OdometerKeypadFlow, type OdometerFieldId } from "./components/OdometerKeypadFlow";
import { OdometerScanBanner } from "./components/OdometerScanBanner";
import { useGPSDistanceEstimate } from "./GPSDistanceHook";
import { useOdometerPhotoOcr } from "./hooks/useOdometerPhotoOcr";
import { useHydrateOdometerPhotos } from "./hooks/useHydrateOdometerPhotos";
import { flushVerificationOutbox } from "./offline/sync";
import { useSaveTripOdometerBoth } from "./queries/useTripVerification";
import { computeOdometerDistance } from "./verification.service";
import { useVerificationSyncState } from "./state/useVerificationSyncState";

function kmToRaw(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(Number(km))) return "";
  const n = Number(km);
  return Number.isInteger(n) ? String(n) : String(n);
}

function rawToKm(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function OdometerStartEndScreen({ trip }: { trip: TripRow }) {
  const router = useRouter();
  const { profile } = useAuth();
  const isOnline = useIsOnline();
  const saveOdometer = useSaveTripOdometerBoth();
  const { pendingCount, failedCount, refresh } = useVerificationSyncState();
  const gpsDistanceKm = useGPSDistanceEstimate(trip);

  const [activeField, setActiveField] = useState<OdometerFieldId>("start");
  const [startRaw, setStartRaw] = useState(() => kmToRaw(trip.start_odometer_km));
  const [endRaw, setEndRaw] = useState(() => kmToRaw(trip.end_odometer_km));
  const [notes, setNotes] = useState(trip.odometer_notes ?? "");
  const [showNotes, setShowNotes] = useState(Boolean(trip.odometer_notes?.trim()));
  const [syncHint, setSyncHint] = useState<string | null>(null);

  const applyStartReading = useCallback((raw: string) => {
    setStartRaw(normalizeOdometerRaw(raw) || raw.trim());
  }, []);

  const applyEndReading = useCallback((raw: string) => {
    setEndRaw(normalizeOdometerRaw(raw) || raw.trim());
  }, []);

  const startOcr = useOdometerPhotoOcr({
    organizationId: trip.organization_id,
    tripId: trip.id,
    vehicleId: trip.vehicle_id,
    driverId: trip.driver_id,
    odometerSide: "start",
    createdBy: profile?.uid ?? null,
    getCurrentRaw: () => startRaw,
    currentRaw: startRaw,
    onKmApplied: applyStartReading,
  });
  const endOcr = useOdometerPhotoOcr({
    organizationId: trip.organization_id,
    tripId: trip.id,
    vehicleId: trip.vehicle_id,
    driverId: trip.driver_id,
    odometerSide: "end",
    createdBy: profile?.uid ?? null,
    getCurrentRaw: () => endRaw,
    currentRaw: endRaw,
    onKmApplied: applyEndReading,
  });

  const activeOcr = activeField === "start" ? startOcr : endOcr;

  useHydrateOdometerPhotos({
    tripId: trip.id,
    setStartPhotoUri: startOcr.setPhotoUri,
    setEndPhotoUri: endOcr.setPhotoUri,
    onPersistedOcrLoaded: (hydrateSide, documentId) => {
      if (hydrateSide === "start") void startOcr.hydratePersistedOcr(documentId);
      else void endOcr.hydratePersistedOcr(documentId);
    },
    startHasLocalPhoto: Boolean(startOcr.photoUri?.trim()),
    endHasLocalPhoto: Boolean(endOcr.photoUri?.trim()),
  });

  const contextLine = useMemo(
    () => `${trip.pickup_area || "Pickup"} → ${trip.drop_location || "Drop"}`,
    [trip.drop_location, trip.pickup_area],
  );

  const startOdometerKm = useMemo(() => rawToKm(startRaw), [startRaw]);
  const endOdometerKm = useMemo(() => rawToKm(endRaw), [endRaw]);

  const tripDistanceKm = useMemo(
    () => computeOdometerDistance(startOdometerKm, endOdometerKm),
    [endOdometerKm, startOdometerKm],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!isOnline) return;
    void flushVerificationOutbox().then(() => refresh());
  }, [isOnline, refresh]);

  const saving = saveOdometer.isPending;
  const hasAnyReading = startRaw.length > 0 || endRaw.length > 0;

  const handleSave = async () => {
    if (saving) return;
    setSyncHint(null);
    try {
      const result = await saveOdometer.mutateAsync({
        tripId: trip.id,
        startOdometerKm,
        endOdometerKm,
        gpsDistanceKm,
        notes,
        updatedBy: profile?.uid ?? null,
        startPhotoLocalUri: startOcr.photoUri,
        endPhotoLocalUri: endOcr.photoUri,
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
        "Could not save odometer",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  };

  const syncFooterHint =
    syncHint ??
    (pendingCount > 0
      ? `Pending sync items: ${pendingCount}${failedCount > 0 ? ` · failed: ${failedCount}` : ""}`
      : null);

  const activeTitle = activeField === "start" ? "Start KM" : "End KM";
  const startPhotoUri = startOcr.photoUri?.trim() || null;
  const endPhotoUri = endOcr.photoUri?.trim() || null;
  const activePhotoUri = activeField === "start" ? startPhotoUri : endPhotoUri;
  const showScanBanner =
    activeOcr.scanState.phase !== "idle" && activeOcr.scanState.message.trim().length > 0;
  const scanActive =
    activeOcr.scanState.phase === "preparing" || activeOcr.scanState.phase === "analyzing";

  return (
    <OdometerEntryShell
      title={activeTitle}
      subtitle={contextLine}
      kicker={`Odometer · ${activeField === "start" ? "Start" : "End"}`}
      onBack={() => router.back()}
      scan={activeOcr.scanState}
      attachment={{
        uri: activeOcr.photoUri,
        busy: saving || activeOcr.scanning,
        onAttach: () => void activeOcr.handleCapture(),
        onRemove: activeOcr.clearPhoto,
      }}
      footer={
        <DriverOpsEntryFooter
          cancelLabel="Cancel"
          onCancel={() => router.back()}
          saveLabel={saving ? "Saving…" : "Save odometer"}
          onSave={() => void handleSave()}
          saving={saving}
          saveDisabled={!hasAnyReading}
          hint={syncFooterHint}
        />
      }
    >
      {(openPhotoPreview) => (
        <OdometerKeypadFlow
          shellMode
          startRawValue={startRaw}
          endRawValue={endRaw}
          onStartRawChange={applyStartReading}
          onEndRawChange={applyEndReading}
          activeFieldId={activeField}
          onActiveFieldChange={setActiveField}
          tripDistanceKm={tripDistanceKm}
          startHasPhoto={Boolean(startPhotoUri)}
          endHasPhoto={Boolean(endPhotoUri)}
          startPhotoUri={startPhotoUri}
          endPhotoUri={endPhotoUri}
          onFieldPhotoPress={() => {
            /* active field switched via thumb tap */
          }}
          bodyHeader={
            <>
              <OpsEntryBodyPhotoSlot
                compact
                uri={activePhotoUri}
                title={`${activeField === "start" ? "Start" : "End"} odometer photo`}
                emptyTitle={`${activeField === "start" ? "Start" : "End"} odometer photo`}
                hint="Tap image to enlarge · scan fills KM when detected"
                emptyHint="Photograph the dashboard to auto-fill KM for this reading"
                scanning={scanActive}
                busy={saving || activeOcr.scanning}
                scanLabel="Reading KM"
                onAttach={() => void activeOcr.handleCapture()}
                onPress={activePhotoUri ? openPhotoPreview : undefined}
                onRetake={() => void activeOcr.handleCapture()}
                onRemove={activeOcr.clearPhoto}
              />
              {showScanBanner ? (
                <OdometerScanBanner
                  scan={activeOcr.scanState}
                  hasPhoto={Boolean(activePhotoUri)}
                  onApplyPending={activeOcr.applyPendingReading}
                  onDismissPending={activeOcr.dismissPendingReading}
                  onRescanPhoto={() => void activeOcr.rescanPhoto()}
                  onReviewOcr={activeOcr.reopenOcrReview}
                />
              ) : activePhotoUri ? (
                <OdometerScanBanner
                  scan={{
                    phase: "complete",
                    message: "Photo attached · re-scan to read KM or enter manually",
                    detectedKm: null,
                    appliedFields: [],
                    stepIndex: 3,
                  }}
                  hasPhoto
                  onRescanPhoto={() => void activeOcr.rescanPhoto()}
                />
              ) : null}
            </>
          }
          extras={
          <View style={styles.extras}>
            {showNotes ? (
              <View style={styles.notesWrap}>
                <Text style={[ops.fieldLabel, { color: Theme.textMuted }]}>Notes (optional)</Text>
                <TextInput
                  style={[
                    ops.input,
                    ops.inputMultiline,
                    {
                      color: Theme.textPrimaryDark,
                      backgroundColor: Theme.cardWhite,
                      borderColor: Theme.borderLight,
                    },
                  ]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Correction, issue, or remark"
                  placeholderTextColor={Theme.textMuted}
                  multiline
                />
              </View>
            ) : (
              <Pressable
                style={styles.notesToggle}
                onPress={() => setShowNotes(true)}
                accessibilityRole="button"
              >
                <Text style={[ops.syncHint, { color: Theme.textSecondary }]}>
                  Add note (optional)
                </Text>
              </Pressable>
            )}
          </View>
        }
        />
      )}
    </OdometerEntryShell>
  );
}

const styles = StyleSheet.create({
  extras: {
    width: "100%",
    gap: 8,
  },
  notesWrap: {
    gap: 5,
  },
  notesToggle: {
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
});

import { SmartInput } from "@/components/mobile-input";
import {
  OperationalBottomActionBar,
  OperationalButton,
  OperationalHeader,
  Surface,
} from "@/components/operational";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type {
  FuelType,
  OperationalPaymentMode,
  OperationalPaymentOwner,
} from "../types";
import { OdometerPhotoCapture } from "@/features/trips/verification/components/OdometerPhotoCapture";
import { useSaveTripFuelEntry } from "../queries/useTripOperations";
import { useOperationsSyncState } from "../state/useOperationsSyncState";

const FUEL_TYPES: FuelType[] = ["diesel", "petrol", "cng", "other"];
const PAYMENT_OWNERS: OperationalPaymentOwner[] = [
  "organization",
  "driver",
  "supplier",
  "fleet_card",
  "unknown",
];
const PAYMENT_MODES: OperationalPaymentMode[] = [
  "cash",
  "fastag",
  "card",
  "credit",
  "pending",
  "unknown",
];

export function FuelEntryScreen({ trip }: { trip: TripRow }) {
  const router = useRouter();
  const { profile } = useAuth();
  const saveFuel = useSaveTripFuelEntry();
  const { pendingCount, failedCount, refresh } = useOperationsSyncState();

  const [amountInr, setAmountInr] = useState<number>(0);
  const [liters, setLiters] = useState<number | null>(null);
  const [fuelType, setFuelType] = useState<FuelType>("diesel");
  const [stationName, setStationName] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentOwner, setPaymentOwner] = useState<OperationalPaymentOwner>("organization");
  const [paymentMode, setPaymentMode] = useState<OperationalPaymentMode>("unknown");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const contextLine = useMemo(
    () => `${trip.pickup_area || "Pickup"} → ${trip.drop_location || "Drop"}`,
    [trip.drop_location, trip.pickup_area],
  );

  const handleCapture = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Camera required", "Enable camera access to capture fuel bill.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setPhotoUri(result.assets[0].uri);
  };

  const handleSave = async () => {
    try {
      const res = await saveFuel.mutateAsync({
        tripId: trip.id,
        amountInr,
        liters,
        fuelType,
        stationName,
        notes,
        enteredBy: profile?.uid ?? null,
        actorRole: profile?.role ?? null,
        paymentOwner,
        paymentMode,
        billPhotoLocalUri: photoUri,
      });
      if (res.queued) {
        setHint("Saved to outbox. Fuel entry will sync when online.");
      }
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert("Could not save fuel entry", e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <View style={styles.screen}>
      <OperationalHeader
        title="Fuel Entry"
        subtitle="Optional operations logging. Add now or later."
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Surface elevation={1}>
          <SmartInput
            type="currency"
            value={amountInr}
            onChange={(_, numeric) => setAmountInr(numeric)}
            label="Fuel Spend"
            context={contextLine}
            submitLabel="Apply Amount"
            required={false}
            validation={{ min: 0, max: 1000000 }}
          />
        </Surface>
        <Surface elevation={1}>
          <SmartInput
            type="quantity"
            value={liters ?? ""}
            onChange={(_, numeric) => setLiters(numeric)}
            label="Liters (optional)"
            context={contextLine}
            submitLabel="Apply Liters"
            suffix=" L"
            required={false}
            validation={{ min: 0, max: 5000 }}
          />
        </Surface>

        <Surface elevation={1}>
          <Text style={styles.label}>Fuel Type</Text>
          <View style={styles.chips}>
            {FUEL_TYPES.map((type) => (
              <OperationalButton
                key={type}
                intent={fuelType === type ? "primary" : "utility"}
                label={type.toUpperCase()}
                onPress={() => setFuelType(type)}
              />
            ))}
          </View>
        </Surface>

        <Surface elevation={1}>
          <Text style={styles.label}>Payment Owner</Text>
          <View style={styles.chips}>
            {PAYMENT_OWNERS.map((owner) => (
              <OperationalButton
                key={owner}
                intent={paymentOwner === owner ? "primary" : "utility"}
                label={owner.replaceAll("_", " ").toUpperCase()}
                onPress={() => setPaymentOwner(owner)}
              />
            ))}
          </View>
          <Text style={[styles.label, { marginTop: 10 }]}>Payment Mode</Text>
          <View style={styles.chips}>
            {PAYMENT_MODES.map((mode) => (
              <OperationalButton
                key={mode}
                intent={paymentMode === mode ? "primary" : "utility"}
                label={mode.replaceAll("_", " ").toUpperCase()}
                onPress={() => setPaymentMode(mode)}
              />
            ))}
          </View>
          <Text style={styles.metaHint}>
            Reports are operational only. Business approval is required before posting.
          </Text>
        </Surface>

        <Surface elevation={1}>
          <Text style={styles.label}>Station Name (optional)</Text>
          <TextInput
            style={styles.input}
            value={stationName}
            onChangeText={setStationName}
            placeholder="Enter station / pump name"
            placeholderTextColor={Theme.textMuted}
          />
          <Text style={[styles.label, { marginTop: 10 }]}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Any operational note"
            placeholderTextColor={Theme.textMuted}
          />
        </Surface>

        <OdometerPhotoCapture
          photoUri={photoUri}
          busy={saveFuel.isPending}
          onCapture={handleCapture}
          onRetake={handleCapture}
        />

        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {pendingCount > 0 ? (
          <Text style={styles.hint}>
            Pending sync items: {pendingCount}
            {failedCount > 0 ? ` · failed: ${failedCount}` : ""}
          </Text>
        ) : null}
      </ScrollView>

      <OperationalBottomActionBar>
        <View style={styles.footer}>
          <OperationalButton
            intent="utility"
            label="Skip for now"
            onPress={() => router.back()}
            fullWidth
          />
          <OperationalButton
            intent="bottomSticky"
            label={saveFuel.isPending ? "Saving..." : "Save Fuel Entry"}
            onPress={handleSave}
            loading={saveFuel.isPending}
            fullWidth
          />
        </View>
      </OperationalBottomActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.screenBackground },
  content: { padding: 14, gap: 12, paddingBottom: 24 },
  label: { color: Theme.text, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  chips: { gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: Theme.text,
    backgroundColor: Theme.whiteMuted,
    fontSize: 13,
  },
  notes: { minHeight: 90, textAlignVertical: "top" },
  footer: { gap: 10 },
  hint: { color: "#b45309", fontSize: 12 },
  metaHint: { marginTop: 8, color: Theme.textSecondary, fontSize: 11 },
});

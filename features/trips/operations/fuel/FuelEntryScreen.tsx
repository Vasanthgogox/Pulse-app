import { SmartInput } from "@/components/mobile-input";
import {
  OperationalBottomActionBar,
  OperationalButton,
  OperationalChipSelect,
  OperationalHeader,
  Surface,
} from "@/components/operational";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import { OdometerPhotoCapture } from "@/features/trips/verification/components/OdometerPhotoCapture";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FuelType, OperationalPaymentMode, OperationalPaymentOwner } from "../types";
import { useSaveTripFuelEntry } from "../queries/useTripOperations";
import {
  FUEL_TYPE_OPTIONS,
  PAYMENT_MODE_OPTIONS,
  PAYMENT_OWNER_OPTIONS,
} from "../shared/operationsEntryOptions";
import { operationsEntryStyles as s } from "../shared/operationsEntryScreen.styles";
import { useOperationsSyncState } from "../state/useOperationsSyncState";

export function FuelEntryScreen({ trip }: { trip: TripRow }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
        setHint("Saved offline — will sync when connected.");
      }
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert("Could not save fuel entry", e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <View style={s.screen}>
      <OperationalHeader
        title="Fuel Entry"
        subtitle={contextLine}
        onBack={() => router.back()}
        density="high"
      />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[
          s.content,
          { paddingBottom: insets.bottom + 88 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Surface elevation={1} density="high">
          <Text style={s.routeLine} numberOfLines={1}>
            {contextLine}
          </Text>
          <View style={s.row2}>
            <View style={s.row2Cell}>
              <SmartInput
                type="currency"
                value={amountInr}
                onChange={(_, numeric) => setAmountInr(numeric)}
                label="Spend"
                submitLabel="Apply"
                required={false}
                validation={{ min: 0, max: 1000000 }}
              />
            </View>
            <View style={s.row2Cell}>
              <SmartInput
                type="quantity"
                value={liters ?? ""}
                onChange={(_, numeric) => setLiters(numeric)}
                label="Liters"
                submitLabel="Apply"
                suffix=" L"
                required={false}
                validation={{ min: 0, max: 5000 }}
              />
            </View>
          </View>
        </Surface>

        <Surface elevation={1} density="high">
          <OperationalChipSelect
            label="Fuel type"
            options={FUEL_TYPE_OPTIONS}
            value={fuelType}
            onChange={setFuelType}
          />
        </Surface>

        <Surface elevation={1} density="high">
          <OperationalChipSelect
            label="Paid by"
            options={PAYMENT_OWNER_OPTIONS}
            value={paymentOwner}
            onChange={setPaymentOwner}
          />
          <View style={s.divider} />
          <OperationalChipSelect
            label="Payment mode"
            options={PAYMENT_MODE_OPTIONS}
            value={paymentMode}
            onChange={setPaymentMode}
          />
          <Text style={s.metaHint}>
            Operational log only — approval required before posting.
          </Text>
        </Surface>

        <Surface elevation={1} density="high">
          <Text style={s.fieldLabel}>Station (optional)</Text>
          <TextInput
            style={s.input}
            value={stationName}
            onChangeText={setStationName}
            placeholder="Pump / station name"
            placeholderTextColor={Theme.textMuted}
          />
          <Text style={[s.fieldLabel, { marginTop: 8 }]}>Notes (optional)</Text>
          <TextInput
            style={[s.input, s.notes]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Short note"
            placeholderTextColor={Theme.textMuted}
          />
        </Surface>

        <OdometerPhotoCapture
          photoUri={photoUri}
          busy={saveFuel.isPending}
          onCapture={handleCapture}
          onRetake={handleCapture}
          compact
          title="Bill photo"
          subtitle="Optional · camera capture"
          captureLabel="Add bill photo"
          retakeLabel="Retake"
        />

        {hint ? <Text style={s.hint}>{hint}</Text> : null}
        {pendingCount > 0 ? (
          <Text style={s.hint}>
            Sync queue: {pendingCount}
            {failedCount > 0 ? ` · failed ${failedCount}` : ""}
          </Text>
        ) : null}
      </ScrollView>

      <OperationalBottomActionBar>
        <View style={s.footer}>
          <OperationalButton
            intent="utility"
            label="Skip"
            onPress={() => router.back()}
            density="high"
            style={s.footerBtn}
          />
          <OperationalButton
            intent="bottomSticky"
            label={saveFuel.isPending ? "Saving…" : "Save"}
            onPress={handleSave}
            loading={saveFuel.isPending}
            density="high"
            style={s.footerBtn}
          />
        </View>
      </OperationalBottomActionBar>
    </View>
  );
}

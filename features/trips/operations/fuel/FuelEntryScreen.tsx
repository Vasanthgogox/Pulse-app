import { SmartInput } from "@/components/mobile-input";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
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
import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FuelType, OperationalPaymentMode, OperationalPaymentOwner } from "../types";
import { useSaveTripFuelEntry, useUpdateTripFuelEntry } from "../queries/useTripOperations";
import { getTripFuelEntryById } from "./fuel.service";
import {
  FUEL_TYPE_OPTIONS,
  PAYMENT_MODE_OPTIONS,
  PAYMENT_OWNER_OPTIONS,
} from "../shared/operationsEntryOptions";
import { operationsEntryStyles as s } from "../shared/operationsEntryScreen.styles";
import { useOperationsSyncState } from "../state/useOperationsSyncState";

export function FuelEntryScreen({
  trip,
  entryId,
}: {
  trip: TripRow;
  entryId?: string | null;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const saveFuel = useSaveTripFuelEntry();
  const updateFuel = useUpdateTripFuelEntry();
  const { pendingCount, failedCount, refresh } = useOperationsSyncState();
  const isEditing = !!entryId?.trim();

  const [loadingEntry, setLoadingEntry] = useState(isEditing);
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

  useEffect(() => {
    const id = entryId?.trim();
    if (!id) {
      setLoadingEntry(false);
      return;
    }
    let mounted = true;
    void getTripFuelEntryById(id).then((res) => {
      if (!mounted) return;
      if (res.error || !res.entry) {
        Alert.alert("Could not load fuel entry", res.error?.message ?? "Not found");
        router.back();
        return;
      }
      if (res.entry.trip_id !== trip.id) {
        Alert.alert("Wrong trip", "This entry belongs to a different trip.");
        router.back();
        return;
      }
      const entry = res.entry;
      setAmountInr(Number(entry.amount_inr ?? 0));
      setLiters(entry.liters ?? null);
      setFuelType((entry.fuel_type as FuelType | null) ?? "diesel");
      setStationName(entry.station_name ?? "");
      setNotes(entry.notes ?? "");
      setPaymentOwner(entry.payment_owner ?? "organization");
      setPaymentMode(entry.payment_mode ?? "unknown");
      setLoadingEntry(false);
    });
    return () => {
      mounted = false;
    };
  }, [entryId, router, trip.id]);

  const saving = saveFuel.isPending || updateFuel.isPending;

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
    const payload = {
      tripId: trip.id,
      amountInr,
      liters,
      fuelType,
      stationName,
      notes,
      enteredBy: profile?.uid ?? null,
      paymentOwner,
      paymentMode,
      billPhotoLocalUri: photoUri,
    };
    try {
      if (isEditing && entryId?.trim()) {
        await updateFuel.mutateAsync({ ...payload, entryId: entryId.trim() });
      } else {
        const res = await saveFuel.mutateAsync({
          ...payload,
          actorRole: profile?.role ?? null,
        });
        if (res.queued) {
          setHint("Saved offline — will sync when connected.");
        }
      }
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert(
        isEditing ? "Could not update fuel entry" : "Could not save fuel entry",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  };

  if (loadingEntry) {
    return <CenteredLoadingView message="Loading fuel entry…" />;
  }

  return (
    <View style={s.screen}>
      <OperationalHeader
        title={isEditing ? "Edit fuel" : "Fuel Entry"}
        subtitle={contextLine}
        onBack={() => router.back()}
        density="high"
      />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[
          s.content,
          { paddingBottom: insets.bottom + 76 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Surface elevation={1} density="high" style={s.card}>
          <View style={s.row2}>
            <View style={s.row2Cell}>
              <SmartInput
                type="currency"
                value={amountInr}
                onChange={(_, numeric) => setAmountInr(numeric)}
                label="Spend"
                submitLabel="Apply"
                variant="field"
                density="compact"
                placeholder="Tap to enter"
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
                variant="field"
                density="compact"
                placeholder="Tap to enter"
                suffix=" L"
                required={false}
                validation={{ min: 0, max: 5000 }}
              />
            </View>
          </View>
        </Surface>

        <Surface elevation={1} density="high" style={s.card}>
          <OperationalChipSelect
            label="Fuel type"
            options={FUEL_TYPE_OPTIONS}
            value={fuelType}
            onChange={setFuelType}
            density="compact"
          />
          <View style={s.divider} />
          <OperationalChipSelect
            label="Paid by"
            options={PAYMENT_OWNER_OPTIONS}
            value={paymentOwner}
            onChange={setPaymentOwner}
            density="compact"
          />
          <View style={s.divider} />
          <OperationalChipSelect
            label="Payment mode"
            options={PAYMENT_MODE_OPTIONS}
            value={paymentMode}
            onChange={setPaymentMode}
            density="compact"
          />
          <Text style={s.metaHint}>
            Operational log only — approval required before posting.
          </Text>
        </Surface>

        <Surface elevation={1} density="high" style={s.card}>
          <View style={s.fieldStack}>
            <View>
              <Text style={s.fieldLabel}>Station (optional)</Text>
              <TextInput
                style={s.input}
                value={stationName}
                onChangeText={setStationName}
                placeholder="Pump / station name"
                placeholderTextColor={Theme.textMuted}
              />
            </View>
            <View>
              <Text style={s.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[s.input, s.notes]}
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Short note"
                placeholderTextColor={Theme.textMuted}
              />
            </View>
          </View>
        </Surface>

        <View style={s.photoWrap}>
          <OdometerPhotoCapture
            photoUri={photoUri}
            busy={saving}
            onCapture={handleCapture}
            onRetake={handleCapture}
            compact
            title="Bill photo"
            subtitle="Optional · camera capture"
            captureLabel="Add bill photo"
            retakeLabel="Retake"
          />
        </View>

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
            label={saving ? "Saving…" : isEditing ? "Update" : "Save"}
            onPress={handleSave}
            loading={saving}
            density="high"
            style={s.footerBtn}
          />
        </View>
      </OperationalBottomActionBar>
    </View>
  );
}

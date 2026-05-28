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
import type { OperationalPaymentMode, OperationalPaymentOwner } from "../types";
import { useSaveTripTollEntry } from "../queries/useTripOperations";
import {
  PAYMENT_MODE_OPTIONS,
  TOLL_PAYMENT_OWNER_OPTIONS,
} from "../shared/operationsEntryOptions";
import { operationsEntryStyles as s } from "../shared/operationsEntryScreen.styles";
import { useOperationsSyncState } from "../state/useOperationsSyncState";

export function TollEntryScreen({ trip }: { trip: TripRow }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const saveToll = useSaveTripTollEntry();
  const { pendingCount, failedCount, refresh } = useOperationsSyncState();

  const [amountInr, setAmountInr] = useState<number>(0);
  const [plazaName, setPlazaName] = useState("");
  const [notes, setNotes] = useState("");
  const [isEstimated, setIsEstimated] = useState(false);
  const [paymentOwner, setPaymentOwner] = useState<OperationalPaymentOwner>("organization");
  const [paymentMode, setPaymentMode] = useState<OperationalPaymentMode>("unknown");
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const contextLine = useMemo(
    () => `${trip.pickup_area || "Pickup"} → ${trip.drop_location || "Drop"}`,
    [trip.drop_location, trip.pickup_area],
  );

  const handleCapture = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Camera required", "Enable camera access to capture toll receipt.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setReceiptUri(result.assets[0].uri);
  };

  const handleSave = async () => {
    try {
      const res = await saveToll.mutateAsync({
        tripId: trip.id,
        amountInr,
        plazaName,
        notes,
        isEstimated,
        enteredBy: profile?.uid ?? null,
        actorRole: profile?.role === "driver" ? "driver" : "user",
        paymentOwner,
        paymentMode,
        receiptLocalUri: receiptUri,
      });
      if (res.queued) setHint("Saved offline — will sync when connected.");
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert("Could not save toll entry", e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <View style={s.screen}>
      <OperationalHeader
        title="Toll Entry"
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
          <SmartInput
            type="currency"
            value={amountInr}
            onChange={(_, numeric) => setAmountInr(numeric)}
            label="Toll amount"
            submitLabel="Apply"
            required={false}
            validation={{ min: 0, max: 1000000 }}
          />
        </Surface>

        <Surface elevation={1} density="high">
          <OperationalChipSelect
            label="Entry type"
            options={[
              { value: "actual", label: "Actual" },
              { value: "estimated", label: "Estimated" },
            ]}
            value={isEstimated ? "estimated" : "actual"}
            onChange={(v) => setIsEstimated(v === "estimated")}
          />
        </Surface>

        <Surface elevation={1} density="high">
          <OperationalChipSelect
            label="Paid by"
            options={TOLL_PAYMENT_OWNER_OPTIONS}
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
        </Surface>

        <Surface elevation={1} density="high">
          <Text style={s.fieldLabel}>Plaza (optional)</Text>
          <TextInput
            style={s.input}
            value={plazaName}
            onChangeText={setPlazaName}
            placeholder="Toll plaza name"
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
          photoUri={receiptUri}
          busy={saveToll.isPending}
          onCapture={handleCapture}
          onRetake={handleCapture}
          compact
          title="Receipt"
          subtitle="Optional · camera capture"
          captureLabel="Add receipt"
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
            label={saveToll.isPending ? "Saving…" : "Save"}
            onPress={handleSave}
            loading={saveToll.isPending}
            density="high"
            style={s.footerBtn}
          />
        </View>
      </OperationalBottomActionBar>
    </View>
  );
}

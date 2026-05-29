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
import type {
  OperationalPaymentMode,
  OperationalPaymentOwner,
  TripOtherExpenseCategory,
} from "../types";
import { useSaveTripOtherExpense } from "../queries/useTripOperations";
import {
  PAYMENT_MODE_OPTIONS,
  PAYMENT_OWNER_OPTIONS,
} from "../shared/operationsEntryOptions";
import { TRIP_OTHER_EXPENSE_OPTIONS } from "../shared/tripOtherExpenseCategories";
import { operationsEntryStyles as s } from "../shared/operationsEntryScreen.styles";

export function OtherExpenseEntryScreen({ trip }: { trip: TripRow }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const saveExpense = useSaveTripOtherExpense();

  const [amountInr, setAmountInr] = useState<number>(0);
  const [expenseCategory, setExpenseCategory] = useState<TripOtherExpenseCategory>("parking");
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentOwner, setPaymentOwner] = useState<OperationalPaymentOwner>("organization");
  const [paymentMode, setPaymentMode] = useState<OperationalPaymentMode>("cash");
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const contextLine = useMemo(
    () => `${trip.pickup_area || "Pickup"} → ${trip.drop_location || "Drop"}`,
    [trip.drop_location, trip.pickup_area],
  );

  const categoryOptions = useMemo(
    () => TRIP_OTHER_EXPENSE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
    [],
  );

  const handleCapture = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Camera required", "Enable camera access to capture a receipt.");
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
    if (amountInr <= 0) {
      Alert.alert("Amount required", "Enter the expense amount before saving.");
      return;
    }
    try {
      await saveExpense.mutateAsync({
        tripId: trip.id,
        expenseCategory,
        amountInr,
        description,
        locationName,
        notes,
        enteredBy: profile?.uid ?? null,
        actorRole: profile?.role ?? null,
        paymentOwner,
        paymentMode,
        receiptLocalUri: photoUri,
      });
      router.back();
    } catch (e) {
      Alert.alert(
        "Could not save expense",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  };

  return (
    <View style={s.screen}>
      <OperationalHeader
        title="Other Expense"
        subtitle={contextLine}
        onBack={() => router.back()}
        density="high"
      />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 88 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Surface elevation={1} density="high">
          <Text style={s.routeLine} numberOfLines={1}>
            {contextLine}
          </Text>
          <SmartInput
            type="currency"
            value={amountInr}
            onChange={(_, numeric) => setAmountInr(numeric)}
            label="Amount"
            submitLabel="Apply"
            required={false}
            validation={{ min: 0, max: 1000000 }}
          />
        </Surface>

        <Surface elevation={1} density="high">
          <OperationalChipSelect
            label="Category"
            options={categoryOptions}
            value={expenseCategory}
            onChange={setExpenseCategory}
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
            Parking, challan, loading, detention, and other trip costs — not commercial adjustments.
          </Text>
        </Surface>

        <Surface elevation={1} density="high">
          <Text style={s.fieldLabel}>Description (optional)</Text>
          <TextInput
            style={s.input}
            value={description}
            onChangeText={setDescription}
            placeholder="What was this for?"
            placeholderTextColor={Theme.textMuted}
          />
          <Text style={[s.fieldLabel, { marginTop: 8 }]}>Location (optional)</Text>
          <TextInput
            style={s.input}
            value={locationName}
            onChangeText={setLocationName}
            placeholder="Plaza, yard, city"
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
          busy={saveExpense.isPending}
          onCapture={handleCapture}
          onRetake={handleCapture}
          compact
          title="Receipt photo"
          subtitle="Optional · camera capture"
          captureLabel="Add receipt"
          retakeLabel="Retake"
        />
      </ScrollView>

      <OperationalBottomActionBar>
        <View style={s.footer}>
          <OperationalButton
            intent="utility"
            label="Cancel"
            onPress={() => router.back()}
            density="high"
            style={s.footerBtn}
          />
          <OperationalButton
            intent="bottomSticky"
            label={saveExpense.isPending ? "Saving…" : "Save"}
            onPress={handleSave}
            loading={saveExpense.isPending}
            density="high"
            style={s.footerBtn}
          />
        </View>
      </OperationalBottomActionBar>
    </View>
  );
}

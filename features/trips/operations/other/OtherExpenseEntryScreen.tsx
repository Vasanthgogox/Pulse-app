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
import type {
  OperationalPaymentMode,
  OperationalPaymentOwner,
  TripOtherExpenseCategory,
} from "../types";
import {
  useSaveTripOtherExpense,
  useUpdateTripOtherExpense,
} from "../queries/useTripOperations";
import { getTripOtherExpenseById } from "./otherExpense.service";
import {
  PAYMENT_MODE_OPTIONS,
  PAYMENT_OWNER_OPTIONS,
} from "../shared/operationsEntryOptions";
import { TRIP_OTHER_EXPENSE_OPTIONS } from "../shared/tripOtherExpenseCategories";
import { operationsEntryStyles as s } from "../shared/operationsEntryScreen.styles";

export function OtherExpenseEntryScreen({
  trip,
  entryId,
}: {
  trip: TripRow;
  entryId?: string | null;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const saveExpense = useSaveTripOtherExpense();
  const updateExpense = useUpdateTripOtherExpense();
  const isEditing = !!entryId?.trim();

  const [loadingEntry, setLoadingEntry] = useState(isEditing);
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

  useEffect(() => {
    const id = entryId?.trim();
    if (!id) {
      setLoadingEntry(false);
      return;
    }
    let mounted = true;
    void getTripOtherExpenseById(id).then((res) => {
      if (!mounted) return;
      if (res.error || !res.entry) {
        Alert.alert("Could not load expense", res.error?.message ?? "Not found");
        router.back();
        return;
      }
      if (res.entry.trip_id !== trip.id) {
        Alert.alert("Wrong trip", "This expense belongs to a different trip.");
        router.back();
        return;
      }
      const entry = res.entry;
      setAmountInr(Number(entry.amount_inr ?? 0));
      setExpenseCategory(entry.expense_category);
      setDescription(entry.description ?? "");
      setLocationName(entry.location_name ?? "");
      setNotes(entry.notes ?? "");
      setPaymentOwner(entry.payment_owner ?? "organization");
      setPaymentMode(entry.payment_mode ?? "cash");
      setLoadingEntry(false);
    });
    return () => {
      mounted = false;
    };
  }, [entryId, router, trip.id]);

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

  const saving = saveExpense.isPending || updateExpense.isPending;

  const handleSave = async () => {
    if (amountInr <= 0) {
      Alert.alert("Amount required", "Enter the expense amount before saving.");
      return;
    }
    const payload = {
      tripId: trip.id,
      expenseCategory,
      amountInr,
      description,
      locationName,
      notes,
      enteredBy: profile?.uid ?? null,
      paymentOwner,
      paymentMode,
      receiptLocalUri: photoUri,
    };
    try {
      if (isEditing && entryId?.trim()) {
        await updateExpense.mutateAsync({ ...payload, entryId: entryId.trim() });
      } else {
        await saveExpense.mutateAsync({
          ...payload,
          actorRole: profile?.role ?? null,
        });
      }
      router.back();
    } catch (e) {
      Alert.alert(
        isEditing ? "Could not update expense" : "Could not save expense",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  };

  if (loadingEntry) {
    return <CenteredLoadingView message="Loading expense…" />;
  }

  return (
    <View style={s.screen}>
      <OperationalHeader
        title={isEditing ? "Edit expense" : "Other Expense"}
        subtitle={contextLine}
        onBack={() => router.back()}
        density="high"
      />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 76 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Surface elevation={1} density="high" style={s.card}>
          <SmartInput
            type="currency"
            value={amountInr}
            onChange={(_, numeric) => setAmountInr(numeric)}
            label="Amount"
            submitLabel="Apply"
            variant="field"
            density="compact"
            placeholder="Tap to enter"
            required={false}
            validation={{ min: 0, max: 1000000 }}
          />
        </Surface>

        <Surface elevation={1} density="high" style={s.card}>
          <OperationalChipSelect
            label="Category"
            options={categoryOptions}
            value={expenseCategory}
            onChange={setExpenseCategory}
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
            Parking, challan, loading, detention, and other trip costs — not commercial adjustments.
          </Text>
        </Surface>

        <Surface elevation={1} density="high" style={s.card}>
          <View style={s.fieldStack}>
            <View>
              <Text style={s.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={s.input}
                value={description}
                onChangeText={setDescription}
                placeholder="What was this for?"
                placeholderTextColor={Theme.textMuted}
              />
            </View>
            <View>
              <Text style={s.fieldLabel}>Location (optional)</Text>
              <TextInput
                style={s.input}
                value={locationName}
                onChangeText={setLocationName}
                placeholder="Plaza, yard, city"
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
            title="Receipt photo"
            subtitle="Optional · camera capture"
            captureLabel="Add receipt"
            retakeLabel="Retake"
          />
        </View>
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

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
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FuelType, OperationalPaymentMode, OperationalPaymentOwner } from "../types";
import { useSaveTripFuelEntry, useUpdateTripFuelEntry } from "../queries/useTripOperations";
import { getTripFuelEntryById } from "./fuel.service";
import { getDocumentViewUrl } from "@/features/trips/services/tripDocuments.service";
import {
  FUEL_TYPE_OPTIONS,
  PAYMENT_MODE_OPTIONS,
  PAYMENT_OWNER_OPTIONS,
  defaultPaymentOwnerForActor,
  paymentOwnerOptionsForActor,
} from "../shared/operationsEntryOptions";
import { operationsEntryStyles as s } from "../shared/operationsEntryScreen.styles";
import { useOperationsSyncState } from "../state/useOperationsSyncState";
import { DriverExpenseCategorySwitch } from "../shared/DriverExpenseCategorySwitch";
import { DriverExpenseChipSelect } from "../shared/DriverExpenseChipSelect";
import type { DriverExpenseCategoryNav } from "../shared/driverExpenseCategoryNav.util";
import type { TripOtherExpenseCategory } from "../types";
import {
  DriverExpenseEntryLayout,
  DriverExpenseFieldDivider,
  DriverExpenseFieldLabel,
  DriverExpenseSection,
  DriverExpenseTextInput,
} from "../shared/DriverExpenseEntryLayout";
import { previewFuelReceiptOcr } from "../shared/applyExpenseReceiptOcr.util";
import type { ExpenseReceiptOcrResult } from "../shared/expenseReceiptOcr.service";
import {
  type ExpenseBillCaptureBag,
  useExpenseBillCapture,
  useRegisterExpenseBillPreview,
} from "../shared/useExpenseBillCapture";

function FuelAmountFlow({
  amountInr,
  liters,
  onAmountChange,
  onLitersChange,
  flowHintColor = Theme.textMuted,
}: {
  amountInr: number;
  liters: number | null;
  onAmountChange: (numeric: number) => void;
  onLitersChange: (numeric: number) => void;
  flowHintColor?: string;
}) {
  const showLitersStep = amountInr > 0;

  return (
    <View style={flowStyles.wrap}>
      <SmartInput
        type="currency"
        value={amountInr}
        onChange={(_, numeric) => onAmountChange(numeric)}
        label="Spend"
        submitLabel="Continue"
        variant="field"
        density="compact"
        placeholder="Enter amount"
        required={false}
        validation={{ min: 0, max: 1000000 }}
      />

      {showLitersStep ? (
        <>
          <View style={flowStyles.connector}>
            <View style={[flowStyles.connectorLine, { backgroundColor: flowHintColor }]} />
            <Text style={[flowStyles.connectorLabel, { color: flowHintColor }]}>Then enter liters</Text>
            <View style={[flowStyles.connectorLine, { backgroundColor: flowHintColor }]} />
          </View>
          <SmartInput
            type="quantity"
            value={liters ?? ""}
            onChange={(_, numeric) => onLitersChange(numeric)}
            label="Liters"
            submitLabel="Apply"
            variant="field"
            density="compact"
            placeholder="How many liters?"
            suffix=" L"
            required={false}
            validation={{ min: 0, max: 5000 }}
          />
        </>
      ) : (
        <Text style={[flowStyles.pendingHint, { color: flowHintColor }]}>
          Enter spend amount to continue to liters
        </Text>
      )}
    </View>
  );
}

const flowStyles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  connector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  connectorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    opacity: 0.35,
  },
  connectorLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  pendingHint: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
    paddingHorizontal: 2,
  },
});

export function FuelEntryScreen({
  trip,
  entryId,
  otherCategory = "parking",
  onCategoryNavChange,
  lockCategorySwitch = false,
  billCapture,
}: {
  trip: TripRow;
  entryId?: string | null;
  otherCategory?: TripOtherExpenseCategory;
  onCategoryNavChange?: (next: DriverExpenseCategoryNav) => void;
  lockCategorySwitch?: boolean;
  /** Shared OCR state from DriverUnifiedExpenseEntryScreen (keeps photo across category switch). */
  billCapture?: ExpenseBillCaptureBag;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const isDriver = profile?.role === "driver";
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
  const [paymentOwner, setPaymentOwner] = useState<OperationalPaymentOwner>(() =>
    defaultPaymentOwnerForActor(profile?.role),
  );
  const [paymentMode, setPaymentMode] = useState<OperationalPaymentMode>("unknown");
  const [hint, setHint] = useState<string | null>(null);

  const handleOcrPreview = useCallback(
    (result: ExpenseReceiptOcrResult) => {
      return previewFuelReceiptOcr(
        result,
        { amountInr, liters, fuelType, stationName, notes, paymentMode },
        {
          setAmountInr,
          setLiters,
          setFuelType,
          setStationName,
          setNotes,
          setPaymentMode,
        },
      );
    },
    [amountInr, fuelType, liters, notes, paymentMode, stationName],
  );

  const ownedBillCapture = useExpenseBillCapture({
    kind: "fuel",
    permissionMessage: "Enable camera or photo library access to attach a fuel bill photo.",
    previewOcrUpdates: handleOcrPreview,
  });
  const capture = billCapture ?? ownedBillCapture;
  useRegisterExpenseBillPreview(billCapture, handleOcrPreview);

  const {
    photoUri,
    setPhotoUri,
    scanning,
    billScan,
    handleCapture,
    handleRemovePhoto,
    applyPendingUpdates,
    dismissPendingUpdates,
    reopenOcrReview,
  } = capture;

  const contextLine = useMemo(
    () => `${trip.pickup_area || "Pickup"} → ${trip.drop_location || "Drop"}`,
    [trip.drop_location, trip.pickup_area],
  );

  const paymentOwnerOptions = useMemo(
    () => paymentOwnerOptionsForActor(PAYMENT_OWNER_OPTIONS, profile?.role),
    [profile?.role],
  );

  useEffect(() => {
    if (!isEditing && profile?.role === "driver") {
      setPaymentOwner(defaultPaymentOwnerForActor(profile.role));
    }
  }, [isEditing, profile?.role]);

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
      const billPath = entry.bill_storage_path?.trim();
      if (billPath) {
        void getDocumentViewUrl(billPath).then((url) => {
          if (mounted && url) setPhotoUri(url);
        });
      }
      setLoadingEntry(false);
    });
    return () => {
      mounted = false;
    };
  }, [entryId, router, trip.id]);

  const saving = saveFuel.isPending || updateFuel.isPending;

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
        if (res.queued) setHint("Saved offline — will sync when connected.");
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

  const syncHint =
    pendingCount > 0
      ? `Sync queue: ${pendingCount}${failedCount > 0 ? ` · failed ${failedCount}` : ""}`
      : null;

  if (loadingEntry) {
    return <CenteredLoadingView message="Loading fuel entry…" />;
  }

  if (isDriver) {
    return (
      <DriverExpenseEntryLayout
        category="fuel"
        title={isEditing ? "Edit expense" : "Log expense"}
        subtitle={contextLine}
        isEditing={isEditing}
        saving={saving}
        onBack={() => router.back()}
        onSave={handleSave}
        hint={hint}
        syncHint={syncHint}
        billScan={billScan}
        onApplyBillScan={applyPendingUpdates}
        onDismissBillScan={dismissPendingUpdates}
        onReviewBillScan={reopenOcrReview}
        attachment={{
          uri: photoUri,
          busy: saving || scanning,
          label: "Bill photo",
          onAttach: handleCapture,
          onRemove: handleRemovePhoto,
        }}
      >
        <DriverExpenseSection title="Amount">
          <FuelAmountFlow
            amountInr={amountInr}
            liters={liters}
            onAmountChange={setAmountInr}
            onLitersChange={setLiters}
            flowHintColor={Theme.driverEmeraldDark}
          />
        </DriverExpenseSection>

        <DriverExpenseSection title="Category & payment">
          <DriverExpenseCategorySwitch
            tripId={trip.id}
            formKind="fuel"
            otherCategory={otherCategory}
            onOtherCategoryChange={() => {}}
            onCategoryNavChange={onCategoryNavChange}
            lockCategorySwitch={lockCategorySwitch}
          />
          <DriverExpenseFieldDivider />
          <DriverExpenseChipSelect
            label="Fuel type"
            options={FUEL_TYPE_OPTIONS}
            value={fuelType}
            onChange={setFuelType}
            columns={2}
            visualGroup="fuel_type"
          />
          <DriverExpenseFieldDivider />
          <DriverExpenseChipSelect
            label="Payment mode"
            options={PAYMENT_MODE_OPTIONS}
            value={paymentMode}
            onChange={setPaymentMode}
            columns={3}
            visualGroup="payment_mode"
          />
        </DriverExpenseSection>

        <DriverExpenseSection title="Details">
          <View>
            <DriverExpenseFieldLabel>Station (optional)</DriverExpenseFieldLabel>
            <DriverExpenseTextInput
              value={stationName}
              onChangeText={setStationName}
              placeholder="Pump / station name"
            />
          </View>
          <View>
            <DriverExpenseFieldLabel>Notes (optional)</DriverExpenseFieldLabel>
            <DriverExpenseTextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Short note"
            />
          </View>
        </DriverExpenseSection>
      </DriverExpenseEntryLayout>
    );
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
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 76 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Surface elevation={1} density="high" style={s.card}>
          <FuelAmountFlow
            amountInr={amountInr}
            liters={liters}
            onAmountChange={setAmountInr}
            onLitersChange={setLiters}
          />
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
            options={paymentOwnerOptions}
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
        {syncHint ? <Text style={s.hint}>{syncHint}</Text> : null}
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

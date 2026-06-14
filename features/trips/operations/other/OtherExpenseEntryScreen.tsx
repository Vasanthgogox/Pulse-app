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
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { getDocumentViewUrl } from "@/features/trips/services/tripDocuments.service";
import {
  PAYMENT_MODE_OPTIONS,
  PAYMENT_OWNER_OPTIONS,
  defaultPaymentOwnerForActor,
  paymentOwnerOptionsForActor,
} from "../shared/operationsEntryOptions";
import { TRIP_OTHER_EXPENSE_OPTIONS } from "../shared/tripOtherExpenseCategories";
import { operationsEntryStyles as s } from "../shared/operationsEntryScreen.styles";
import { DriverExpenseCategorySwitch } from "../shared/DriverExpenseCategorySwitch";
import { DriverExpenseChipSelect } from "../shared/DriverExpenseChipSelect";
import {
  parseDriverExpenseCategoryParam,
  normalizeTripOtherExpenseCategory,
  type DriverExpenseCategoryNav,
} from "../shared/driverExpenseCategoryNav.util";
import {
  DriverExpenseEntryLayout,
  DriverExpenseFieldDivider,
  DriverExpenseFieldLabel,
  DriverExpenseSection,
  DriverExpenseTextInput,
} from "../shared/DriverExpenseEntryLayout";
import { previewOtherReceiptOcr } from "../shared/applyExpenseReceiptOcr.util";
import type { ExpenseReceiptOcrResult } from "../shared/expenseReceiptOcr.service";
import {
  type ExpenseBillCaptureBag,
  useExpenseBillCapture,
  useRegisterExpenseBillPreview,
} from "../shared/useExpenseBillCapture";
import { ExpenseBillPhotoScan } from "@/features/trips/operations/shared/ExpenseBillPhotoScan";

export function OtherExpenseEntryScreen({
  trip,
  entryId,
  initialCategory,
  expenseCategory: expenseCategoryProp,
  onExpenseCategoryChange,
  onCategoryNavChange,
  lockCategorySwitch = false,
  billCapture,
}: {
  trip: TripRow;
  entryId?: string | null;
  initialCategory?: TripOtherExpenseCategory | null;
  /** Controlled category (driver unified expense shell). */
  expenseCategory?: TripOtherExpenseCategory;
  onExpenseCategoryChange?: (category: TripOtherExpenseCategory) => void;
  onCategoryNavChange?: (next: DriverExpenseCategoryNav) => void;
  lockCategorySwitch?: boolean;
  billCapture?: ExpenseBillCaptureBag;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const isDriver = profile?.role === "driver";
  const saveExpense = useSaveTripOtherExpense();
  const updateExpense = useUpdateTripOtherExpense();
  const isEditing = !!entryId?.trim();

  const [loadingEntry, setLoadingEntry] = useState(isEditing);
  const [amountInr, setAmountInr] = useState<number>(0);
  const [internalCategory, setInternalCategory] = useState<TripOtherExpenseCategory>(() =>
    parseDriverExpenseCategoryParam(
      expenseCategoryProp ?? initialCategory ?? undefined,
    ),
  );
  const isCategoryControlled = expenseCategoryProp != null;
  const expenseCategory = isCategoryControlled ? expenseCategoryProp : internalCategory;

  const setExpenseCategory = useCallback(
    (category: TripOtherExpenseCategory) => {
      if (!isCategoryControlled) setInternalCategory(category);
      onExpenseCategoryChange?.(category);
    },
    [isCategoryControlled, onExpenseCategoryChange],
  );
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentOwner, setPaymentOwner] = useState<OperationalPaymentOwner>(() =>
    defaultPaymentOwnerForActor(profile?.role),
  );
  const [paymentMode, setPaymentMode] = useState<OperationalPaymentMode>("cash");

  const handleOcrPreview = useCallback(
    (result: ExpenseReceiptOcrResult) => {
      return previewOtherReceiptOcr(
        result,
        { amountInr, expenseCategory, description, locationName, notes, paymentMode },
        {
          setAmountInr,
          setExpenseCategory,
          setDescription,
          setLocationName,
          setNotes,
          setPaymentMode,
        },
      );
    },
    [amountInr, description, expenseCategory, locationName, notes, paymentMode, setExpenseCategory],
  );

  const ownedBillCapture = useExpenseBillCapture({
    organizationId: trip.organization_id,
    tripId: trip.id,
    createdBy: profile?.uid ?? null,
    kind: "other",
    permissionMessage: "Enable camera or photo library access to attach a receipt photo.",
    previewOcrUpdates: handleOcrPreview,
  });
  const capture = billCapture ?? ownedBillCapture;
  useRegisterExpenseBillPreview(billCapture, handleOcrPreview);

  const {
    photoUri,
    setPhotoUri,
    scanning,
    billScan,
    persistedJob,
    handleCapture,
    handleRemovePhoto,
    applyPendingUpdates,
    dismissPendingUpdates,
    reopenOcrReview,
    hydratePersistedOcrFromJob,
  } = capture;

  const contextLine = useMemo(
    () => `${trip.pickup_area || "Pickup"} → ${trip.drop_location || "Drop"}`,
    [trip.drop_location, trip.pickup_area],
  );

  const categoryOptions = useMemo(
    () => TRIP_OTHER_EXPENSE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
    [],
  );

  const paymentOwnerOptions = useMemo(
    () => paymentOwnerOptionsForActor(PAYMENT_OWNER_OPTIONS, profile?.role),
    [profile?.role],
  );

  useEffect(() => {
    if (isEditing || isCategoryControlled) return;
    setInternalCategory(parseDriverExpenseCategoryParam(initialCategory ?? undefined));
  }, [initialCategory, isCategoryControlled, isEditing]);

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
      setExpenseCategory(normalizeTripOtherExpenseCategory(entry.expense_category));
      setDescription(entry.description ?? "");
      setLocationName(entry.location_name ?? "");
      setNotes(entry.notes ?? "");
      setPaymentOwner(entry.payment_owner ?? "organization");
      setPaymentMode(entry.payment_mode ?? "cash");
      const receiptPath = entry.receipt_storage_path?.trim();
      if (receiptPath) {
        void getDocumentViewUrl(receiptPath).then((url) => {
          if (mounted && url) setPhotoUri(url);
        });
      }
      const ocrJobId = entry.ocr_job_id?.trim();
      if (ocrJobId) {
        void hydratePersistedOcrFromJob(ocrJobId);
      }
      setLoadingEntry(false);
    });
    return () => {
      mounted = false;
    };
  }, [entryId, hydratePersistedOcrFromJob, router, setExpenseCategory, setPhotoUri, trip.id]);

  useEffect(() => {
    if (!isEditing && profile?.role === "driver") {
      setPaymentOwner(defaultPaymentOwnerForActor(profile.role));
    }
  }, [isEditing, profile?.role]);

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
      ocrJobId: persistedJob?.id,
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

  if (isDriver) {
    return (
      <DriverExpenseEntryLayout
        category="other"
        title={isEditing ? "Edit expense" : "Log expense"}
        subtitle={contextLine}
        isEditing={isEditing}
        saving={saving}
        onBack={() => router.back()}
        onSave={handleSave}
        billScan={billScan}
        onApplyBillScan={applyPendingUpdates}
        onDismissBillScan={dismissPendingUpdates}
        onReviewBillScan={reopenOcrReview}
        attachment={{
          uri: photoUri,
          busy: saving || scanning,
          label: "Receipt",
          onAttach: handleCapture,
          onRemove: handleRemovePhoto,
        }}
      >
        <DriverExpenseSection title="Amount">
          <SmartInput
            type="currency"
            value={amountInr}
            onChange={(_, numeric) => setAmountInr(numeric)}
            label="Expense amount"
            submitLabel="Apply"
            variant="field"
            density="compact"
            placeholder="Enter amount"
            required={false}
            validation={{ min: 0, max: 1000000 }}
          />
        </DriverExpenseSection>

        <DriverExpenseSection title="Category & payment">
          <DriverExpenseCategorySwitch
            tripId={trip.id}
            formKind="other"
            otherCategory={expenseCategory}
            onOtherCategoryChange={setExpenseCategory}
            onCategoryNavChange={onCategoryNavChange}
            lockCategorySwitch={lockCategorySwitch}
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
            <DriverExpenseFieldLabel>Description (optional)</DriverExpenseFieldLabel>
            <DriverExpenseTextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What was this for?"
            />
          </View>
          <View>
            <DriverExpenseFieldLabel>Location (optional)</DriverExpenseFieldLabel>
            <DriverExpenseTextInput
              value={locationName}
              onChangeText={setLocationName}
              placeholder="Plaza, yard, city"
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
          <ExpenseBillPhotoScan
            label="Expense Receipt"
            uri={photoUri}
            scan={billScan}
            scanning={scanning}
            busy={saving}
            onAttach={handleCapture}
            onRetake={handleCapture}
            onRemove={handleRemovePhoto}
            onRescanPhoto={handleCapture}
            onApplyPending={applyPendingUpdates}
            onDismissPending={dismissPendingUpdates}
            onReviewOcr={reopenOcrReview}
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

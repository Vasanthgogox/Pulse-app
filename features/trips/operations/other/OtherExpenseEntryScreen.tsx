import { SmartInput } from "@/components/mobile-input";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { OperationalBottomActionBar } from "@/components/operational";
import { PaymentModeLogo } from "@/components/ledger/paymentModeLogos";
import Layout from "@/constants/Layout";
import { LedgerSyncPalette } from "@/constants/LedgerSyncPalette";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import { useRouter } from "expo-router";
import {
  Banknote,
  Building2,
  Car,
  ChevronLeft,
  CircleParking,
  CircleQuestionMark,
  Clock,
  CreditCard,
  Fuel,
  TriangleAlert,
  Hash,
  MoreHorizontal,
  Package,
  PackageOpen,
  Scale,
  Ticket,
  Timer,
  Truck,
  User,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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

const PAGE_PAD = Layout.screenPaddingHorizontal;

type TileVisual = { icon: LucideIcon; color: string; tint: string };

const CATEGORY_VISUAL: Record<TripOtherExpenseCategory, TileVisual> = {
  parking: { icon: CircleParking, color: "#2563eb", tint: "#dbeafe" },
  challan: { icon: TriangleAlert, color: Theme.teslaRed, tint: "#fff1f2" },
  loading: { icon: Package, color: Theme.primary, tint: "#eff6ff" },
  unloading: { icon: PackageOpen, color: "#0f766e", tint: "#ecfdf5" },
  detention: { icon: Timer, color: "#7c3aed", tint: "#f5f3ff" },
  maintenance: { icon: Wrench, color: "#b45309", tint: "#fffbeb" },
  fastag: { icon: Ticket, color: "#4D3636", tint: "#e0e7ff" },
  advance: { icon: Banknote, color: Theme.darkGreen, tint: "#dcfce7" },
  food: { icon: Utensils, color: "#ea580c", tint: "#ffedd5" },
  weighbridge: { icon: Scale, color: "#0369a1", tint: "#e0f2fe" },
  misc: { icon: MoreHorizontal, color: Theme.textMuted, tint: "#f1f5f9" },
};

const OWNER_VISUAL: Record<OperationalPaymentOwner, TileVisual> = {
  organization: { icon: Building2, color: Theme.primary, tint: "#eff6ff" },
  driver: { icon: User, color: "#0f766e", tint: "#ecfdf5" },
  supplier: { icon: Truck, color: "#b45309", tint: "#fffbeb" },
  fleet_card: { icon: CreditCard, color: "#ea580c", tint: "#ffedd5" },
  fastag: { icon: Ticket, color: "#4D3636", tint: "#e0e7ff" },
  cash_advance: { icon: Banknote, color: Theme.darkGreen, tint: "#dcfce7" },
  credit_vendor: { icon: Clock, color: "#64748b", tint: "#f1f5f9" },
  unknown: { icon: CircleQuestionMark, color: Theme.textMuted, tint: "#f1f5f9" },
};

const MODE_LEDGER_ID: Partial<Record<OperationalPaymentMode, string>> = {
  cash: "CASH",
  fastag: "FASTAG",
  card: "FUEL_CARD",
  credit: "CREDIT",
};

const MODE_VISUAL: Record<OperationalPaymentMode, TileVisual> = {
  cash: { icon: Banknote, color: "#16a34a", tint: "#dcfce7" },
  fastag: { icon: Ticket, color: "#4D3636", tint: "#e0e7ff" },
  card: { icon: CreditCard, color: "#ea580c", tint: "#ffedd5" },
  credit: { icon: Clock, color: "#64748b", tint: "#f1f5f9" },
  pending: { icon: Clock, color: "#d97706", tint: "#fffbeb" },
  unknown: { icon: CircleQuestionMark, color: Theme.textMuted, tint: "#f1f5f9" },
};

function CaptureSection({
  eyebrow,
  hint,
  icon: Icon,
  iconTone = "type",
  children,
}: {
  eyebrow: string;
  hint?: string;
  icon: LucideIcon;
  iconTone?: "type" | "mode" | "ref";
  children: ReactNode;
}) {
  return (
    <View style={styles.captureSectionCard}>
      <View style={styles.captureSectionHead}>
        <View
          style={[
            styles.captureSectionIcon,
            iconTone === "mode" && styles.captureSectionIconMode,
            iconTone === "ref" && styles.captureSectionIconRef,
            iconTone === "type" && styles.captureSectionIconType,
          ]}
        >
          <Icon
            size={15}
            color={iconTone === "mode" ? Theme.darkGreen : Theme.primary}
            strokeWidth={2.2}
          />
        </View>
        <View style={styles.captureSectionHeadText}>
          <Text style={styles.captureSectionEyebrow}>{eyebrow}</Text>
          {hint ? <Text style={styles.captureSectionHint}>{hint}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function OptionTile({
  label,
  selected,
  visual,
  modeLogoId,
  onPress,
  columns = 3,
}: {
  label: string;
  selected: boolean;
  visual: TileVisual;
  modeLogoId?: string;
  onPress: () => void;
  columns?: 2 | 3;
}) {
  const Icon = visual.icon;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tile,
        columns === 2 && styles.tileTwoCol,
        selected && { borderColor: visual.color, backgroundColor: visual.tint },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <View style={styles.tileIconWrap}>
        {modeLogoId ? (
          <PaymentModeLogo modeId={modeLogoId} size={28} />
        ) : (
          <Icon size={22} color={selected ? visual.color : Theme.textMuted} strokeWidth={2.2} />
        )}
      </View>
      <Text
        style={[styles.tileLabel, selected && { color: visual.color }]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

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
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={20} color={LedgerSyncPalette.ink} strokeWidth={2.5} />
        </Pressable>
        <View style={styles.topBarMain}>
          <View style={styles.titleRow}>
            <View style={styles.liveDot} />
            <Text style={styles.kicker}>
              {isEditing ? "EDIT EXPENSE" : "OTHER EXPENSE"}
            </Text>
          </View>
          <Text style={styles.routeLine} numberOfLines={1}>
            {contextLine}
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 88 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>
          {isEditing ? "Update trip expense" : "Log trip expense"}
        </Text>
        <Text style={styles.pageHint}>
          Parking, challan, loading, detention, and other trip costs — not commercial adjustments.
        </Text>

        <CaptureSection eyebrow="Amount" hint="What did this cost?" icon={Banknote} iconTone="mode">
          <SmartInput
            type="currency"
            value={amountInr}
            onChange={(_, numeric) => setAmountInr(numeric)}
            label="Expense amount"
            submitLabel="Apply"
            variant="hero"
            heroAccentColor={Theme.primary}
            placeholder="0"
            required={false}
            validation={{ min: 0, max: 1000000 }}
          />
        </CaptureSection>

        <CaptureSection
          eyebrow="Category"
          hint="What kind of expense is this?"
          icon={Car}
          iconTone="type"
        >
          <View style={styles.tileGrid}>
            {TRIP_OTHER_EXPENSE_OPTIONS.map((opt) => (
              <OptionTile
                key={opt.value}
                label={opt.label}
                selected={expenseCategory === opt.value}
                visual={CATEGORY_VISUAL[opt.value]}
                onPress={() => setExpenseCategory(opt.value)}
              />
            ))}
          </View>
        </CaptureSection>

        <CaptureSection
          eyebrow="Paid by"
          hint="Who funded this cost?"
          icon={User}
          iconTone="type"
        >
          <View style={styles.tileGrid}>
            {paymentOwnerOptions.map((opt) => (
              <OptionTile
                key={opt.value}
                label={opt.label}
                selected={paymentOwner === opt.value}
                visual={OWNER_VISUAL[opt.value]}
                onPress={() => setPaymentOwner(opt.value)}
              />
            ))}
          </View>
        </CaptureSection>

        <CaptureSection
          eyebrow="Payment mode"
          hint="How this money moved"
          icon={Fuel}
          iconTone="mode"
        >
          <View style={styles.tileGrid}>
            {PAYMENT_MODE_OPTIONS.map((opt) => (
              <OptionTile
                key={opt.value}
                label={opt.label}
                selected={paymentMode === opt.value}
                visual={MODE_VISUAL[opt.value]}
                modeLogoId={MODE_LEDGER_ID[opt.value]}
                onPress={() => setPaymentMode(opt.value)}
              />
            ))}
          </View>
        </CaptureSection>

        <CaptureSection
          eyebrow="Details"
          hint="Optional context for audit"
          icon={Hash}
          iconTone="ref"
        >
          <View style={styles.fieldStack}>
            <View>
              <Text style={styles.fieldLabel}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={setDescription}
                placeholder="What was this for?"
                placeholderTextColor={Theme.textMuted}
              />
            </View>
            <View>
              <Text style={styles.fieldLabel}>LOCATION (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                value={locationName}
                onChangeText={setLocationName}
                placeholder="Plaza, yard, city"
                placeholderTextColor={Theme.textMuted}
              />
            </View>
            <View>
              <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, styles.notes]}
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Short note"
                placeholderTextColor={Theme.textMuted}
              />
            </View>
          </View>
        </CaptureSection>

        <View style={styles.photoWrap}>
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
        <View style={styles.footer}>
          <Pressable
            style={styles.footerBackBtn}
            onPress={() => router.back()}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.footerBackText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.confirmBtn, saving && styles.confirmBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={isEditing ? "Update" : "Save"}
          >
            <Text style={styles.confirmBtnText}>
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Confirm Sync"}
            </Text>
          </Pressable>
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: PAGE_PAD,
    paddingBottom: 10,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LedgerSyncPalette.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceForm,
  },
  topBarMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.positive,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: Theme.positive,
    textTransform: "uppercase",
  },
  routeLine: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: PAGE_PAD,
    paddingTop: 14,
    gap: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: LedgerSyncPalette.ink,
    letterSpacing: -0.4,
  },
  pageHint: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 2,
  },
  captureSectionCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 14,
    gap: 12,
  },
  captureSectionHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  captureSectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  captureSectionIconType: {
    backgroundColor: "#eff6ff",
  },
  captureSectionIconMode: {
    backgroundColor: "#ecfdf5",
  },
  captureSectionIconRef: {
    backgroundColor: "#eff6ff",
  },
  captureSectionHeadText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  captureSectionEyebrow: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.1,
  },
  captureSectionHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 16,
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
  },
  tile: {
    width: "31.2%",
    flexGrow: 0,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    backgroundColor: "#fff",
    alignItems: "center",
    gap: 6,
    minHeight: 76,
  },
  tileTwoCol: {
    width: "47.5%",
  },
  tileIconWrap: {
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "center",
  },
  fieldStack: {
    gap: 12,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    minHeight: 44,
  },
  notes: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  photoWrap: {
    marginBottom: 4,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  footerBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    flexShrink: 0,
    minHeight: 48,
  },
  footerBackText: {
    fontSize: 13,
    fontWeight: "700",
    color: LedgerSyncPalette.ink,
  },
  confirmBtn: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.primary,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  confirmBtnDisabled: {
    opacity: 0.55,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
});

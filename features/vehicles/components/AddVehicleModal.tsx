/**
 * Add Vehicle modal — fields match Q-unified-base AddVehicleWizard 100%.
 * Steps: Vehicle Info (vehicle source, number, brand/model/body/size/axle/capacity), Documents (expiry), Review.
 * When visible is true, shows as Ledger-style bottom-sheet popup; when undefined, full-screen wizard (e.g. route).
 */
import { WizardStepLayout } from "@/components/WizardStepLayout";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useMemo, useState } from "react";
import {
    Dimensions,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatIndianVehicleNumberInput } from "@/lib/format";
import { dateISO, validateIndianVehicleNumber } from "@/lib/validation";
import {
    getAxleRecommendations,
    getBrands,
    getBodyTypeRecommendations,
    getBrandRecommendations,
    getCapacityRecommendations,
    getModels,
    getSizeRecommendations,
    getTruckSpec,
} from "../utils/indianTruckData.util";
import {
    DOCUMENT_EXPIRY_ORDER,
    DOCUMENT_LABELS,
    type VehicleDocuments,
} from "../utils/vehicleDocuments.util";

export type VehicleSource = "organization" | "partner";

export interface AddVehicleCompletePayload {
  vehicleSource: VehicleSource;
  vehicleNumber: string;
  vehicleType: string;
  capacity: string;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  vehicleBodyType?: string | null;
  vehicleSize?: string | null;
  vehicleAxle?: string | null;
  documents: VehicleDocuments;
}

const STEPS_FULL = [
  { key: "info", label: "Vehicle Info", description: "Basic vehicle details" },
  { key: "documents", label: "Documents", description: "Expiry dates (upload on web)" },
  { key: "review", label: "Review", description: "Confirm and add vehicle" },
];

const STEPS_OWN_ASSET = [
  { key: "info", label: "Vehicle Info", description: "Number, brand, body, size, axle" },
  { key: "review", label: "Review", description: "Confirm and add vehicle" },
];

interface AddVehicleModalProps {
  onClose: () => void;
  onComplete: (payload: AddVehicleCompletePayload) => void;
  /** When true, show as Ledger-style bottom-sheet popup. When undefined, full-screen (e.g. add-vehicle route). */
  visible?: boolean;
  /** When true (e.g. from Garage), add only own asset; single step: vehicle number, brand, body type, size, axle. No partner option, no documents step. */
  ownAssetOnly?: boolean;
}

export function AddVehicleModal({
  onClose,
  onComplete,
  visible,
  ownAssetOnly = false,
}: AddVehicleModalProps) {
  const insets = useSafeAreaInsets();
  const STEPS = ownAssetOnly ? STEPS_OWN_ASSET : STEPS_FULL;
  const [stepIndex, setStepIndex] = useState(0);
  const [vehicleSource, setVehicleSource] =
    useState<VehicleSource>("organization");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [size, setSize] = useState("");
  const [axle, setAxle] = useState("");
  const [capacity, setCapacity] = useState("");
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Reset form when modal is opened so we don't show previous vehicle data. */
  useEffect(() => {
    if (visible) {
      setStepIndex(0);
      setVehicleSource("organization");
      setVehicleNumber("");
      setBrand("");
      setModel("");
      setBodyType("");
      setSize("");
      setAxle("");
      setCapacity("");
      setExpiryDates({});
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const brands = useMemo(() => getBrands(), []);
  const modelsForBrand = useMemo(
    () => (brand ? getModels(brand) : []),
    [brand],
  );
  const spec = useMemo(
    () => (brand && model ? getTruckSpec(brand, model) : null),
    [brand, model],
  );
  const brandRecommendations = useMemo(() => getBrandRecommendations(brand).slice(0, 8), [brand]);
  const bodyTypeRecommendations = useMemo(() => getBodyTypeRecommendations(bodyType).slice(0, 8), [bodyType]);
  const sizeRecommendations = useMemo(() => getSizeRecommendations(size).slice(0, 8), [size]);
  const axleRecommendations = useMemo(() => getAxleRecommendations(axle).slice(0, 8), [axle]);
  const capacityRecommendations = useMemo(() => getCapacityRecommendations(capacity).slice(0, 6), [capacity]);

  const vehicleTypeLabel = useMemo(() => {
    const parts = [brand, model].filter(Boolean);
    if (bodyType) parts.push(`(${bodyType})`);
    return parts.join(" ") || "";
  }, [brand, model, bodyType]);

  const step = STEPS[stepIndex];
  const isReview = step.key === "review";
  const canProceedInfo = ownAssetOnly
    ? !!vehicleNumber.trim() &&
        !!brand.trim() &&
        !!bodyType.trim() &&
        !!size.trim() &&
        !!axle.trim()
    : !!vehicleNumber.trim() &&
        !!brand &&
        !!model &&
        !!bodyType &&
        !!size &&
        !!capacity;

  const handleNext = () => {
    if (isReview) {
      setError(null);
      const vehicleNumErr = validateIndianVehicleNumber(vehicleNumber);
      if (vehicleNumErr) {
        setError(vehicleNumErr);
        return;
      }
      if (!ownAssetOnly) {
        for (const key of DOCUMENT_EXPIRY_ORDER) {
          const exp = expiryDates[key];
          if (exp?.trim()) {
            const dateErr = dateISO()(exp);
            if (dateErr) {
              setError(`${DOCUMENT_LABELS[key]}: ${dateErr}`);
              return;
            }
          }
        }
      }
      setSubmitting(true);
      const documents: VehicleDocuments = {};
      if (!ownAssetOnly) {
        DOCUMENT_EXPIRY_ORDER.forEach((key) => {
          const exp = expiryDates[key];
          if (exp) documents[key] = { url: "", expiryDate: exp };
        });
      }
      const result = onComplete({
        vehicleSource: ownAssetOnly ? "organization" : vehicleSource,
        vehicleNumber: vehicleNumber.trim(),
        vehicleType: ownAssetOnly ? (bodyType.trim() || brand || "Other") : (vehicleTypeLabel || brand || "Other"),
        capacity: ownAssetOnly ? "" : capacity.trim(),
        vehicleBrand: brand || null,
        vehicleModel: ownAssetOnly ? null : (model || null),
        vehicleBodyType: bodyType || null,
        vehicleSize: size || null,
        vehicleAxle: axle || null,
        documents,
      });
      const p = result as void | Promise<unknown>;
      if (typeof p?.then === "function") {
        p.then(() => {
          setSubmitting(false);
          onClose();
        }).catch((err: Error) => {
          setSubmitting(false);
          setError(err?.message ?? "Failed to add vehicle");
        });
      } else {
        setSubmitting(false);
        onClose();
      }
      return;
    }
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  };

  const handleBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
    else onClose();
  };

  const handleBrandSelect = (b: string) => {
    setBrand(b);
    setModel("");
    setBodyType("");
    setSize("");
    setAxle("");
  };

  const handleModelSelect = (m: string) => {
    setModel(m);
    const s = brand && m ? getTruckSpec(brand, m) : null;
    if (s) {
      setBodyType(s.type);
      setSize(s.size);
      setAxle(s.axle);
    }
  };

  const inputStyle = [
    styles.input,
    {
      borderColor: Theme.borderInput,
      backgroundColor: Theme.surfaceForm,
      color: Theme.textPrimary,
    },
  ];
  const labelStyle = [styles.label, { color: Theme.textMutedDemo }];

  const renderRecommendationHint = (
    items: string[],
    currentValue: string,
  ) => {
    if (items.length === 0) return null;
    const displayItems = items
      .filter((item) => item.trim().toLowerCase() !== currentValue.trim().toLowerCase())
      .slice(0, 5);
    if (displayItems.length === 0) return null;
    return (
      <Text style={styles.recommendationHint}>
        Recommended: {displayItems.join(", ")}
      </Text>
    );
  };

  const renderStep = () => {
    switch (step.key) {
      case "info":
        if (ownAssetOnly) {
          return (
            <ScrollView
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
            >
              <Text style={labelStyle}>
                Vehicle number (registration) <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                style={[inputStyle, { textTransform: "uppercase" }]}
                placeholder="e.g. TN 25 CM 7892"
                placeholderTextColor={Theme.placeholder}
                value={vehicleNumber}
                onChangeText={(v) => setVehicleNumber(formatIndianVehicleNumberInput(v))}
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              <Text style={labelStyle}>
                Brand <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                style={inputStyle}
                placeholder="e.g. Tata, Ashok Leyland"
                placeholderTextColor={Theme.placeholder}
                value={brand}
                onChangeText={setBrand}
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              {renderRecommendationHint(brandRecommendations, brand)}
              <Text style={labelStyle}>
                Body type <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                style={inputStyle}
                placeholder="e.g. Tipper, Cargo"
                placeholderTextColor={Theme.placeholder}
                value={bodyType}
                onChangeText={setBodyType}
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              {renderRecommendationHint(bodyTypeRecommendations, bodyType)}
              <Text style={labelStyle}>
                Size <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                style={inputStyle}
                placeholder="e.g. 28ft, 32ft"
                placeholderTextColor={Theme.placeholder}
                value={size}
                onChangeText={setSize}
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              {renderRecommendationHint(sizeRecommendations, size)}
              <Text style={labelStyle}>
                Axle <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                style={inputStyle}
                placeholder="e.g. 6x4"
                placeholderTextColor={Theme.placeholder}
                value={axle}
                onChangeText={setAxle}
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              {renderRecommendationHint(axleRecommendations, axle)}
            </ScrollView>
          );
        }
        return (
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={labelStyle}>Vehicle Source</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[
                  styles.toggleOption,
                  vehicleSource === "organization" && styles.toggleOptionActive,
                ]}
                onPress={() => setVehicleSource("organization")}
              >
                <Text
                  style={[
                    styles.toggleOptionText,
                    vehicleSource === "organization" &&
                      styles.toggleOptionTextActive,
                  ]}
                >
                  Organization Vehicle
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleOption,
                  vehicleSource === "partner" && styles.toggleOptionActive,
                ]}
                onPress={() => setVehicleSource("partner")}
              >
                <Text
                  style={[
                    styles.toggleOptionText,
                    vehicleSource === "partner" &&
                      styles.toggleOptionTextActive,
                  ]}
                >
                  Partner Vehicle
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={labelStyle}>Vehicle Registration Number</Text>
            <TextInput
              style={[inputStyle, { textTransform: "uppercase" }]}
              placeholder="e.g. TN 25 CM 7892"
              placeholderTextColor={Theme.placeholder}
              value={vehicleNumber}
              onChangeText={(v) => setVehicleNumber(formatIndianVehicleNumberInput(v))}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <Text style={labelStyle}>Brand</Text>
            <View style={styles.pickerRow}>
              {brands.map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[styles.chip, brand === b && styles.chipActive]}
                  onPress={() => handleBrandSelect(b)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      brand === b && styles.chipTextActive,
                    ]}
                  >
                    {b}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {brand && (
              <>
                <Text style={labelStyle}>Model</Text>
                <View style={styles.pickerRow}>
                  {modelsForBrand.map((m, index) => (
                    <TouchableOpacity
                      key={`${m.model}-${index}`}
                      style={[
                        styles.chip,
                        model === m.model && styles.chipActive,
                      ]}
                      onPress={() => handleModelSelect(m.model)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          model === m.model && styles.chipTextActive,
                        ]}
                      >
                        {m.model}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <Text style={labelStyle}>Body Type</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. Tipper, Cargo"
              placeholderTextColor={Theme.placeholder}
              value={bodyType}
              onChangeText={setBodyType}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            {renderRecommendationHint(bodyTypeRecommendations, bodyType)}
            <Text style={labelStyle}>Size</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. 28ft / 32ft"
              placeholderTextColor={Theme.placeholder}
              value={size}
              onChangeText={setSize}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            {renderRecommendationHint(sizeRecommendations, size)}
            <Text style={labelStyle}>Axle</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. 6x4"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              placeholderTextColor={Theme.placeholder}
              value={axle}
              onChangeText={setAxle}
            />
            {renderRecommendationHint(axleRecommendations, axle)}
            <Text style={labelStyle}>Load capacity</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. 5 Ton"
              placeholderTextColor={Theme.placeholder}
              value={capacity}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              onChangeText={setCapacity}
            />
            {renderRecommendationHint(capacityRecommendations, capacity)}
          </ScrollView>
        );
      case "documents":
        return (
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {DOCUMENT_EXPIRY_ORDER.map((key) => (
              <View key={key} style={styles.docRow}>
                <Text style={labelStyle}>{DOCUMENT_LABELS[key]}</Text>
                <TextInput
                  style={inputStyle}
                  placeholder="YYYY-MM-DD (optional)"
                  placeholderTextColor={Theme.placeholder}
                  value={expiryDates[key] ?? ""}
                  onChangeText={(v) =>
                    setExpiryDates((p) => ({ ...p, [key]: v }))
                  }
                  autoComplete="off"
                />
              </View>
            ))}
          </ScrollView>
        );
      case "review":
        return (
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.reviewCard}>
              <Text
                style={[
                  styles.reviewNumber,
                  { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
                ]}
              >
                {vehicleNumber}
              </Text>
              <Text style={styles.reviewSub}>
                {ownAssetOnly
                  ? "Own asset (Garage)"
                  : vehicleSource === "organization"
                    ? "Organization Vehicle"
                    : "Partner Vehicle"}
              </Text>
              <Text style={styles.reviewSub}>
                {ownAssetOnly
                  ? [brand, bodyType, size, axle].filter(Boolean).join(" • ") || "—"
                  : `${vehicleTypeLabel || "—"} • ${capacity || "—"}`}
              </Text>
            </View>
            {!ownAssetOnly &&
              Object.keys(expiryDates).filter((k) => expiryDates[k]).length >
                0 && (
              <View style={styles.reviewBlock}>
                <Text style={styles.reviewLabel}>
                  Document expiry dates set
                </Text>
                {DOCUMENT_EXPIRY_ORDER.filter((k) => expiryDates[k]).map(
                  (k) => (
                    <Text key={k} style={styles.reviewValue}>
                      {DOCUMENT_LABELS[k]}: {expiryDates[k]}
                    </Text>
                  ),
                )}
              </View>
            )}
            {error ? (
              <Text
                style={[
                  styles.reviewValue,
                  { color: Theme.negative, marginTop: 12 },
                ]}
              >
                {error}
              </Text>
            ) : null}
          </ScrollView>
        );
      default:
        return null;
    }
  };

  if (visible === false) return null;

  if (visible === true) {
    const windowHeight = Dimensions.get("window").height;
    const panelHeight = Math.min(
      windowHeight * Layout.ledgerPanelHeightRatio,
      Layout.ledgerPanelMaxHeight,
    );
    return (
      <Modal
        visible
        transparent
        animationType="slide"
        onRequestClose={onClose}
        presentationStyle="overFullScreen"
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={insets.top + 16}
        >
          <View style={popupStyles.backdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              onPress={onClose}
              activeOpacity={1}
            />
            <View
              style={[
                popupStyles.panel,
                {
                  paddingBottom: insets.bottom + Layout.modalBottomPadding,
                  height: panelHeight,
                  maxHeight: panelHeight,
                },
              ]}
            >
              <View style={popupStyles.headerRow}>
                <Text style={popupStyles.title}>{ownAssetOnly ? "Add Vehicle (Own Asset)" : "Add Vehicle"}</Text>
              </View>
              <View style={popupStyles.dotsRow}>
                {STEPS.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      popupStyles.dot,
                      i === stepIndex && popupStyles.dotActive,
                    ]}
                  />
                ))}
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={popupStyles.scroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={popupStyles.scrollContent}
              >
                {renderStep()}
              </ScrollView>
              <View style={popupStyles.footer}>
                <TouchableOpacity
                  style={popupStyles.footerLeft}
                  onPress={handleBack}
                >
                  <Text style={popupStyles.footerLeftText}>
                    {stepIndex > 0 ? "Back" : "Cancel"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    popupStyles.footerRight,
                    (submitting ||
                      (!isReview && step.key === "info" && !canProceedInfo)) &&
                      popupStyles.footerRightDisabled,
                  ]}
                  onPress={handleNext}
                  disabled={
                    submitting ||
                    (!isReview && step.key === "info" && !canProceedInfo)
                  }
                >
                  <Text style={popupStyles.footerRightText}>
                    {isReview && submitting
                      ? "Adding…"
                      : isReview
                        ? "ADD VEHICLE"
                        : "Continue"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  return (
    <WizardStepLayout
      title="Add Vehicle"
      stepLabel={step.label}
      stepIndex={stepIndex}
      stepCount={STEPS.length}
      onBack={handleBack}
      onClose={onClose}
      footerLeftLabel={stepIndex > 0 ? "Back" : "Cancel"}
      footerRightLabel={
        isReview && submitting
          ? "Adding…"
          : isReview
            ? "Add Vehicle"
            : "Continue"
      }
      onFooterLeft={handleBack}
      onFooterRight={handleNext}
      footerRightDisabled={
        submitting || (!isReview && step.key === "info" && !canProceedInfo)
      }
    >
      {renderStep()}
    </WizardStepLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  label: {
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: Theme.textMutedDemo,
  },
  requiredMark: {
    color: Theme.negative,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
  },
  toggleOptionActive: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceLight,
  },
  toggleOptionText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
  },
  toggleOptionTextActive: {
    color: Theme.textPrimaryDark,
  },
  input: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    minHeight: 52,
    marginBottom: 12,
    backgroundColor: Theme.screenBackground,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  recommendationHint: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: -6,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  chipActive: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  chipText: { fontSize: 12, color: Theme.textPrimaryDark, fontWeight: "700" },
  chipTextActive: { color: Theme.textOnPrimary },
  docRow: { marginBottom: 12 },
  reviewCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 12,
  },
  reviewNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  reviewSub: { fontSize: 12, color: Theme.textMutedDemo, marginTop: 4 },
  reviewBlock: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  reviewLabel: {
    fontSize: 10,
    color: Theme.textMutedDemo,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  reviewValue: { fontSize: 14, color: Theme.textPrimary, marginBottom: 4 },
});

const popupStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  panel: {
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceLight,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.borderInput,
  },
  dotActive: {
    backgroundColor: Theme.textPrimaryDark,
  },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: {
    paddingBottom: 8,
    gap: 12,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderInput,
  },
  footerLeft: { paddingVertical: 6, paddingHorizontal: 4 },
  footerLeftText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  footerRight: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
    backgroundColor: Theme.buttonMatteBlack,
  },
  footerRightDisabled: { opacity: 0.5 },
  footerRightText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.buttonMatteBlackText,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
});

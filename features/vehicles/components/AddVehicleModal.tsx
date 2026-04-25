/**
 * Add Vehicle modal — vehicle info, documents (full flow), review.
 * Vehicle category (text chips) replaces legacy brand; body length uses a scroll picker + Other (manual).
 * When visible is true, shows as Ledger-style bottom-sheet popup; when undefined, full-screen wizard (e.g. route).
 */
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { WizardStepLayout } from "@/components/WizardStepLayout";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
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
    getCapacityRecommendations,
} from "../utils/indianTruckData.util";
import {
    BODY_LENGTH_SELECT_OPTIONS,
    normalizeBodyLengthKey,
    OTHER_LABEL,
    VEHICLE_CATEGORY_LABELS,
    getModelSelectOptions,
} from "../utils/vehicleFormOptions.util";
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
  { key: "info", label: "Vehicle Info", description: "Number, category, body, model, capacity, length, axle" },
  { key: "review", label: "Review", description: "Confirm and add vehicle" },
];

interface AddVehicleModalProps {
  onClose: () => void;
  onComplete: (payload: AddVehicleCompletePayload) => void;
  /** When true, show as Ledger-style bottom-sheet popup. When undefined, full-screen (e.g. add-vehicle route). */
  visible?: boolean;
  /** When true (e.g. from Garage), add only own asset; single info step (category, body, model, capacity, body length, axle). No partner option, no documents step. */
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
  const [vehicleCategory, setVehicleCategory] = useState("");
  const [model, setModel] = useState("");
  const [bodyLength, setBodyLength] = useState("");
  const [bodyLengthIsOther, setBodyLengthIsOther] = useState(false);
  const [bodyLengthPickerOpen, setBodyLengthPickerOpen] = useState(false);
  const [modelIsOther, setModelIsOther] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [axle, setAxle] = useState("");
  const [capacity, setCapacity] = useState("");
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateSuccess, setShowCreateSuccess] = useState(false);

  const handleVehicleCreateSuccessOk = () => {
    setShowCreateSuccess(false);
    onClose();
  };

  /** Reset form when modal is opened so we don't show previous vehicle data. */
  useEffect(() => {
    if (visible) {
      setStepIndex(0);
      setVehicleSource("organization");
      setVehicleNumber("");
      setVehicleCategory("");
      setModel("");
      setModelIsOther(false);
      setModelPickerOpen(false);
      setBodyLength("");
      setBodyLengthIsOther(false);
      setBodyLengthPickerOpen(false);
      setAxle("");
      setCapacity("");
      setExpiryDates({});
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const axleRecommendations = useMemo(() => getAxleRecommendations(axle).slice(0, 8), [axle]);
  const capacityRecommendations = useMemo(() => getCapacityRecommendations(capacity).slice(0, 6), [capacity]);

  const vehicleTypeLabel = useMemo(() => {
    const parts = [vehicleCategory, model].filter(Boolean);
    return parts.join(" ") || "";
  }, [vehicleCategory, model]);

  const openModelPicker = () => {
    setModelPickerOpen(true);
  };

  const selectModelPreset = (value: string) => {
    setModelIsOther(false);
    setModel(value);
    setModelPickerOpen(false);
  };

  const selectModelOtherFromPicker = () => {
    setModelIsOther(true);
    setModel("");
    setModelPickerOpen(false);
  };

  const openBodyLengthPicker = () => {
    setBodyLengthPickerOpen(true);
  };

  const selectBodyLengthPreset = (value: string) => {
    setBodyLengthIsOther(false);
    setBodyLength(value);
    setBodyLengthPickerOpen(false);
  };

  const selectBodyLengthOtherFromPicker = () => {
    setBodyLengthIsOther(true);
    setBodyLength("");
    setBodyLengthPickerOpen(false);
  };

  const renderBodyLengthPickerSheet = () => (
    <Modal
      visible={bodyLengthPickerOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setBodyLengthPickerOpen(false)}
    >
      <KeyboardAvoidingView
        style={pickerModalStyles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setBodyLengthPickerOpen(false)}
        />
        <View
          style={[
            pickerModalStyles.sheet,
            { paddingBottom: insets.bottom + 16, maxHeight: Dimensions.get("window").height * 0.72 },
          ]}
        >
          <Text style={pickerModalStyles.sheetTitle}>Body length (ft)</Text>
          <Text style={pickerModalStyles.sheetHint}>Scroll to choose a preset or Other to type manually.</Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            style={pickerModalStyles.sheetScroll}
          >
            {BODY_LENGTH_SELECT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={normalizeBodyLengthKey(opt)}
                style={[
                  pickerModalStyles.optionRow,
                  normalizeBodyLengthKey(bodyLength) === normalizeBodyLengthKey(opt) &&
                    !bodyLengthIsOther &&
                    pickerModalStyles.optionRowActive,
                ]}
                onPress={() => selectBodyLengthPreset(opt)}
              >
                <Text
                  style={[
                    pickerModalStyles.optionText,
                    normalizeBodyLengthKey(bodyLength) === normalizeBodyLengthKey(opt) &&
                      !bodyLengthIsOther &&
                      pickerModalStyles.optionTextActive,
                  ]}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[
                pickerModalStyles.optionRow,
                bodyLengthIsOther && pickerModalStyles.optionRowActive,
              ]}
              onPress={selectBodyLengthOtherFromPicker}
            >
              <Text
                style={[
                  pickerModalStyles.optionText,
                  bodyLengthIsOther && pickerModalStyles.optionTextActive,
                ]}
              >
                {OTHER_LABEL} — type manually
              </Text>
            </TouchableOpacity>
          </ScrollView>
          <TouchableOpacity
            style={pickerModalStyles.doneBtn}
            onPress={() => setBodyLengthPickerOpen(false)}
          >
            <Text style={pickerModalStyles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderModelPickerSheet = () => (
    <Modal
      visible={modelPickerOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setModelPickerOpen(false)}
    >
      <KeyboardAvoidingView
        style={pickerModalStyles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setModelPickerOpen(false)}
        />
        <View
          style={[
            pickerModalStyles.sheet,
            {
              paddingBottom: insets.bottom + 16,
              maxHeight: Dimensions.get("window").height * 0.72,
            },
          ]}
        >
          <Text style={pickerModalStyles.sheetTitle}>Model</Text>
          <Text style={pickerModalStyles.sheetHint}>
            Scroll to choose a preset or Other to type manually.
          </Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            style={pickerModalStyles.sheetScroll}
          >
            {getModelSelectOptions(vehicleCategory).map((opt) => (
              <TouchableOpacity
                key={`model-${normalizeBodyLengthKey(opt)}`}
                style={[
                  pickerModalStyles.optionRow,
                  normalizeBodyLengthKey(model) === normalizeBodyLengthKey(opt) &&
                    !modelIsOther &&
                    pickerModalStyles.optionRowActive,
                ]}
                onPress={() => selectModelPreset(opt)}
              >
                <Text
                  style={[
                    pickerModalStyles.optionText,
                    normalizeBodyLengthKey(model) === normalizeBodyLengthKey(opt) &&
                      !modelIsOther &&
                      pickerModalStyles.optionTextActive,
                  ]}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[
                pickerModalStyles.optionRow,
                modelIsOther && pickerModalStyles.optionRowActive,
              ]}
              onPress={selectModelOtherFromPicker}
            >
              <Text
                style={[
                  pickerModalStyles.optionText,
                  modelIsOther && pickerModalStyles.optionTextActive,
                ]}
              >
                {OTHER_LABEL} — type manually
              </Text>
            </TouchableOpacity>
          </ScrollView>
          <TouchableOpacity
            style={pickerModalStyles.doneBtn}
            onPress={() => setModelPickerOpen(false)}
          >
            <Text style={pickerModalStyles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderModelField = () => (
    <View style={{ marginBottom: 4 }}>
      <Text style={labelStyle}>
        Model <Text style={styles.requiredMark}>*</Text>
      </Text>
      {modelIsOther ? (
        <TextInput
          style={inputStyle}
          placeholder="Type model"
          placeholderTextColor={Theme.placeholder}
          value={model}
          onChangeText={setModel}
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
        />
      ) : (
        <TouchableOpacity
          style={[inputStyle, styles.bodyLengthTouchable]}
          onPress={openModelPicker}
          activeOpacity={0.75}
        >
          <Text
            style={[
              styles.bodyLengthTouchableText,
              !model && { color: Theme.placeholder },
            ]}
          >
            {model || "Tap to select model"}
          </Text>
        </TouchableOpacity>
      )}
      {modelIsOther ? (
        <TouchableOpacity
          onPress={openModelPicker}
          style={styles.switchToPresetLink}
        >
          <Text style={styles.switchToPresetLinkText}>
            Choose from list instead
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderBodyLengthField = () => (
    <View style={{ marginBottom: 4 }}>
      <Text style={labelStyle}>
        Body length (ft) <Text style={styles.requiredMark}>*</Text>
      </Text>
      {bodyLengthIsOther ? (
        <TextInput
          style={inputStyle}
          placeholder="e.g. 28 ft, custom size"
          placeholderTextColor={Theme.placeholder}
          value={bodyLength}
          onChangeText={setBodyLength}
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
        />
      ) : (
        <TouchableOpacity
          style={[inputStyle, styles.bodyLengthTouchable]}
          onPress={openBodyLengthPicker}
          activeOpacity={0.75}
        >
          <Text
            style={[
              styles.bodyLengthTouchableText,
              !bodyLength && { color: Theme.placeholder },
            ]}
          >
            {bodyLength || "Tap to select body length (ft)"}
          </Text>
        </TouchableOpacity>
      )}
      {bodyLengthIsOther ? (
        <TouchableOpacity onPress={openBodyLengthPicker} style={styles.switchToPresetLink}>
          <Text style={styles.switchToPresetLinkText}>Choose from list instead</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const step = STEPS[stepIndex];
  const isReview = step.key === "review";
  const canProceedInfo = ownAssetOnly
    ? !!vehicleNumber.trim() &&
        !!vehicleCategory.trim() &&
        !!bodyLength.trim() &&
        !!model.trim() &&
        !!capacity.trim()
    : !!vehicleNumber.trim() &&
        !!vehicleCategory.trim() &&
        !!model.trim() &&
        !!bodyLength.trim() &&
        !!capacity.trim();

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
      const typeSummary =
        [vehicleCategory, model].filter((s) => s?.trim()).join(" • ").trim() ||
        "Other";
      const result = onComplete({
        vehicleSource: ownAssetOnly ? "organization" : vehicleSource,
        vehicleNumber: vehicleNumber.trim(),
        vehicleType: ownAssetOnly ? typeSummary : (vehicleTypeLabel || typeSummary),
        capacity: capacity.trim(),
        vehicleBrand: vehicleCategory.trim() || null,
        vehicleModel: model.trim() || null,
        vehicleBodyType: null,
        vehicleSize: bodyLength.trim() || null,
        vehicleAxle: axle || null,
        documents,
      });
      const p = result as void | Promise<unknown>;
      if (typeof p?.then === "function") {
        p.then(() => {
          setSubmitting(false);
          setShowCreateSuccess(true);
        }).catch((err: Error) => {
          setSubmitting(false);
          setError(err?.message ?? "Failed to add vehicle");
        });
      } else {
        setSubmitting(false);
        setShowCreateSuccess(true);
      }
      return;
    }
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  };

  const handleBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
    else onClose();
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
                Vehicle category <Text style={styles.requiredMark}>*</Text>
              </Text>
              <View style={styles.pickerRow}>
                {VEHICLE_CATEGORY_LABELS.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.chip,
                      vehicleCategory === cat && styles.chipActive,
                    ]}
                    onPress={() => setVehicleCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        vehicleCategory === cat && styles.chipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {renderModelField()}
              {renderBodyLengthField()}
              <Text style={labelStyle}>
                Capacity (TON) <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                style={inputStyle}
                placeholder="e.g. 7.5"
                placeholderTextColor={Theme.placeholder}
                value={capacity}
                onChangeText={setCapacity}
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                keyboardType="decimal-pad"
              />
              {renderRecommendationHint(capacityRecommendations, capacity)}
              <Text style={labelStyle}>
                Axle
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
            <Text style={labelStyle}>
              Vehicle category <Text style={styles.requiredMark}>*</Text>
            </Text>
            <View style={styles.pickerRow}>
              {VEHICLE_CATEGORY_LABELS.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.chip,
                    vehicleCategory === cat && styles.chipActive,
                  ]}
                  onPress={() => setVehicleCategory(cat)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      vehicleCategory === cat && styles.chipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {renderModelField()}
            {renderBodyLengthField()}
            <Text style={labelStyle}>
              Load capacity (TON) <Text style={styles.requiredMark}>*</Text>
            </Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. 7.5"
              placeholderTextColor={Theme.placeholder}
              value={capacity}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              keyboardType="decimal-pad"
              onChangeText={setCapacity}
            />
            {renderRecommendationHint(capacityRecommendations, capacity)}
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
                  ? [
                      vehicleCategory,
                      model,
                      bodyLength,
                      capacity.trim() ? `${capacity.trim()} TON` : null,
                      axle,
                    ]
                      .filter(Boolean)
                      .join(" • ") || "—"
                  : `${vehicleTypeLabel || "—"} • ${capacity.trim() ? `${capacity.trim()} TON` : "—"}`}
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
      <>
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
        {renderBodyLengthPickerSheet()}
        {renderModelPickerSheet()}
        <ThemedAlertModal
          visible={showCreateSuccess}
          title="Vehicle added successfully"
          message=""
          okText="OK"
          onOk={handleVehicleCreateSuccessOk}
          onRequestClose={handleVehicleCreateSuccessOk}
          variant="neutral"
          okVariant="primary"
        />
      </>
    );
  }

  return (
    <>
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
      {renderBodyLengthPickerSheet()}
      {renderModelPickerSheet()}
      <ThemedAlertModal
        visible={showCreateSuccess}
        title="Vehicle added successfully"
        message=""
        okText="OK"
        onOk={handleVehicleCreateSuccessOk}
        onRequestClose={handleVehicleCreateSuccessOk}
        variant="neutral"
        okVariant="primary"
      />
    </>
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
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    minHeight: 52,
    marginBottom: 12,
    backgroundColor: Theme.screenBackground,
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
  bodyLengthTouchable: {
    justifyContent: "center",
  },
  bodyLengthTouchableText: {
    fontSize: 15,
    color: Theme.textPrimary,
  },
  switchToPresetLink: {
    marginTop: 4,
    marginBottom: 8,
  },
  switchToPresetLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
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

const pickerModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: Theme.borderInput,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  sheetHint: {
    fontSize: 12,
    color: Theme.textMutedDemo,
    marginBottom: 12,
  },
  sheetScroll: { maxHeight: Dimensions.get("window").height * 0.52 },
  optionRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: Theme.surfaceForm,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  optionRowActive: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceLight,
  },
  optionText: {
    fontSize: 14,
    color: Theme.textPrimary,
  },
  optionTextActive: {
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  doneBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
});

import { createElement, memo, useCallback, useState, type CSSProperties } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, Plus, X } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { fullPageWizardStyles as wizardChrome } from "@/components/full-page-wizard";
import { useUserCommodityTypes } from "@/features/trips/hooks/useUserCommodityTypes";
import type { CommodityTypeKind } from "@/features/trips/services/userCommodityTypes.storage";
import { ROUTES } from "@/lib/routes";

export type TripCommodityFieldsProps = {
  vehicleType: string;
  loadType: string;
  tons: string;
  onVehicleTypeChange: (value: string) => void;
  onLoadTypeChange: (value: string) => void;
  onTonsChange: (value: string) => void;
  vehicleTypeError?: boolean;
  loadTypeError?: boolean;
  tonsError?: boolean;
  /** Extra options from indent (prepended if not in catalog). */
  indentVehicleType?: string | null;
  indentLoadType?: string | null;
  showTons?: boolean;
  /** Side-by-side vehicle + product (desktop / wide). */
  isWide?: boolean;
  /** Use Add Trip form label/input styles instead of mobile wizard chrome. */
  useFormChrome?: boolean;
  /** Web desktop: native `<select>` instead of bottom sheet. */
  preferWebSelect?: boolean;
  fieldLabelStyle?: StyleProp<TextStyle>;
  fieldInputStyle?: StyleProp<TextStyle>;
};

type PickerKind = "vehicle" | "load" | null;

function CommodityWebSelect({
  value,
  options,
  placeholder,
  onChange,
  hasError,
  minHeight,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
  hasError?: boolean;
  minHeight: number;
}) {
  const selectStyle: CSSProperties = {
    width: "100%",
    minHeight,
    borderRadius: 12,
    border: `1px solid ${hasError ? Theme.negative : Theme.borderLight}`,
    backgroundColor: "#f8fafc",
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 500,
    color: value.trim() ? Theme.textPrimaryDark : Theme.placeholder,
    boxSizing: "border-box",
    cursor: "pointer",
  };
  return createElement(
    "select",
    {
      value,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: selectStyle,
    },
    [
      createElement("option", { key: "__placeholder", value: "" }, placeholder),
      ...options.map((opt) => createElement("option", { key: opt, value: opt }, opt)),
    ],
  );
}

export const TripCommodityFields = memo(function TripCommodityFields({
  vehicleType,
  loadType,
  tons,
  onVehicleTypeChange,
  onLoadTypeChange,
  onTonsChange,
  vehicleTypeError = false,
  loadTypeError = false,
  tonsError = false,
  indentVehicleType,
  indentLoadType,
  showTons = true,
  isWide = false,
  useFormChrome = false,
  preferWebSelect = false,
  fieldLabelStyle,
  fieldInputStyle,
}: TripCommodityFieldsProps) {
  const router = useRouter();
  const [picker, setPicker] = useState<PickerKind>(null);
  const { vehicleOptions, productOptions, consumePendingPick } = useUserCommodityTypes(
    indentVehicleType,
    indentLoadType,
  );

  const useWebSelect = preferWebSelect && Platform.OS === "web";
  const labelStyle =
    fieldLabelStyle ??
    (useFormChrome ? styles.formLabel : wizardChrome.wizardFieldLabel);
  const blockStyle = useFormChrome ? styles.fieldBlockForm : wizardChrome.wizardFieldBlock;
  const inputMinHeight = 44;

  const applyPendingPick = useCallback(async () => {
    const pick = await consumePendingPick();
    if (!pick) return;
    if (pick.kind === "vehicle") onVehicleTypeChange(pick.name);
    else onLoadTypeChange(pick.name);
  }, [consumePendingPick, onVehicleTypeChange, onLoadTypeChange]);

  useFocusEffect(
    useCallback(() => {
      void applyPendingPick();
    }, [applyPendingPick]),
  );

  const openAddType = useCallback(
    (kind: CommodityTypeKind) => {
      setPicker(null);
      router.push(ROUTES.addCommodityType(kind));
    },
    [router],
  );

  const pickerTitle =
    picker === "vehicle" ? "Vehicle type" : picker === "load" ? "Product type" : "";
  const pickerOptions = picker === "vehicle" ? vehicleOptions : picker === "load" ? productOptions : [];
  const pickerValue = picker === "vehicle" ? vehicleType : loadType;
  const pickerAddKind: CommodityTypeKind = picker === "load" ? "product" : "vehicle";

  const onPick = (value: string) => {
    if (picker === "vehicle") onVehicleTypeChange(value);
    if (picker === "load") onLoadTypeChange(value);
    setPicker(null);
  };

  const renderLabelRow = (label: string, onAdd: () => void) => (
    <View style={styles.labelRow}>
      <Text style={[labelStyle, styles.labelRowText]}>{label}</Text>
      <Pressable
        style={styles.addTypeBtn}
        onPress={onAdd}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Add ${label}`}
      >
        <Plus size={16} color={Theme.primary} strokeWidth={2.5} />
      </Pressable>
    </View>
  );

  const renderVehicle = () => (
    <View style={blockStyle}>
      {renderLabelRow("Vehicle type", () => openAddType("vehicle"))}
      {useWebSelect ? (
        <CommodityWebSelect
          value={vehicleType}
          options={vehicleOptions}
          placeholder="Select vehicle type (optional)"
          onChange={onVehicleTypeChange}
          hasError={vehicleTypeError}
          minHeight={inputMinHeight}
        />
      ) : (
        <Pressable
          style={[
            useFormChrome ? styles.pickerBtn : wizardChrome.wizardPickerBtn,
            fieldInputStyle,
            useFormChrome && styles.pickerBtnForm,
            vehicleTypeError && styles.pickerBtnError,
          ]}
          onPress={() => setPicker("vehicle")}
          accessibilityRole="button"
        >
          <Text
            style={[
              useFormChrome ? styles.pickerBtnText : wizardChrome.wizardPickerBtnText,
              useFormChrome && styles.pickerBtnTextForm,
              !vehicleType.trim() &&
                (useFormChrome
                  ? styles.pickerBtnPlaceholder
                  : wizardChrome.wizardPickerBtnPlaceholder),
            ]}
            numberOfLines={2}
          >
            {vehicleType.trim() || "Select vehicle type (optional)"}
          </Text>
          <ChevronRight size={18} color={Theme.iconPrimary} />
        </Pressable>
      )}
    </View>
  );

  const renderProduct = () => (
    <View style={blockStyle}>
      {renderLabelRow("Product type", () => openAddType("product"))}
      {useWebSelect ? (
        <CommodityWebSelect
          value={loadType}
          options={productOptions}
          placeholder="Select product type (optional)"
          onChange={onLoadTypeChange}
          hasError={loadTypeError}
          minHeight={inputMinHeight}
        />
      ) : (
        <Pressable
          style={[
            useFormChrome ? styles.pickerBtn : wizardChrome.wizardPickerBtn,
            fieldInputStyle,
            useFormChrome && styles.pickerBtnForm,
            loadTypeError && styles.pickerBtnError,
          ]}
          onPress={() => setPicker("load")}
          accessibilityRole="button"
        >
          <Text
            style={[
              useFormChrome ? styles.pickerBtnText : wizardChrome.wizardPickerBtnText,
              useFormChrome && styles.pickerBtnTextForm,
              !loadType.trim() &&
                (useFormChrome
                  ? styles.pickerBtnPlaceholder
                  : wizardChrome.wizardPickerBtnPlaceholder),
            ]}
            numberOfLines={2}
          >
            {loadType.trim() || "Select product type (optional)"}
          </Text>
          <ChevronRight size={18} color={Theme.iconPrimary} />
        </Pressable>
      )}
    </View>
  );

  const renderTons = () =>
    showTons ? (
      <View style={blockStyle}>
        <Text style={labelStyle}>Tons (optional)</Text>
        <TextInput
          style={[
            useFormChrome ? fieldInputStyle : wizardChrome.wizardFieldInput,
            tonsError && styles.inputError,
          ]}
          value={tons}
          onChangeText={(t) => onTonsChange(t.replace(/[^\d.]/g, "").slice(0, 12))}
          placeholder="Load weight in tons"
          placeholderTextColor={Theme.placeholder}
          keyboardType="decimal-pad"
        />
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      {isWide ? (
        <>
          <View style={styles.gridRowWide}>
            <View style={styles.gridCol}>{renderVehicle()}</View>
            <View style={styles.gridCol}>{renderProduct()}</View>
          </View>
          {renderTons()}
        </>
      ) : (
        <>
          {renderVehicle()}
          {renderProduct()}
          {renderTons()}
        </>
      )}

      {!useWebSelect ? (
        <Modal visible={picker != null} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{pickerTitle}</Text>
                <TouchableOpacity onPress={() => setPicker(null)} hitSlop={12}>
                  <X size={20} color={Theme.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Pressable
                  style={styles.addOwnRow}
                  onPress={() => openAddType(pickerAddKind)}
                >
                  <View style={styles.addOwnIcon}>
                    <Plus size={18} color={Theme.primary} strokeWidth={2.5} />
                  </View>
                  <Text style={styles.addOwnText}>
                    Add your own {picker === "load" ? "product" : "vehicle"} type
                  </Text>
                </Pressable>
                {pickerOptions.map((opt) => {
                  const active =
                    pickerValue.trim().toLowerCase() === opt.toLowerCase();
                  return (
                    <Pressable
                      key={opt}
                      style={[styles.optionRow, active && styles.optionRowActive]}
                      onPress={() => onPick(opt)}
                    >
                      <Text
                        style={[styles.optionText, active && styles.optionTextActive]}
                      >
                        {opt}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: 4,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 8,
  },
  labelRowText: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
  },
  addTypeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  formLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  fieldBlockForm: {
    marginBottom: 6,
    minWidth: 0,
  },
  gridRowWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  gridCol: {
    flex: 1,
    minWidth: 0,
  },
  pickerBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pickerBtnForm: {
    marginBottom: 6,
    backgroundColor: "#f8fafc",
  },
  pickerBtnError: {
    borderColor: Theme.negative,
  },
  pickerBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  pickerBtnTextForm: {
    fontSize: 14,
    fontWeight: "500",
    fontStyle: "normal",
  },
  pickerBtnPlaceholder: {
    fontWeight: "500",
    color: Theme.placeholder,
  },
  inputError: {
    borderColor: Theme.negative,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  modalSheet: {
    maxHeight: "70%",
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  addOwnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
  },
  addOwnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  addOwnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.primary,
  },
  optionRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  optionRowActive: {
    backgroundColor: Theme.surfaceLight,
  },
  optionText: {
    fontSize: 15,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  optionTextActive: {
    fontWeight: "700",
    color: Theme.primary,
  },
});

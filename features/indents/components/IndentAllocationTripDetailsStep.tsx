import DateTimePicker from "@react-native-community/datetimepicker";
import { memo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import Theme from "@/constants/Theme";
import { fullPageWizardStyles } from "@/components/full-page-wizard";
import { TripCommodityFields } from "@/features/trips/components/add-trip/TripCommodityFields";
import {
  formatIsoDateForDisplay,
  getDayAfterTomorrowIso,
  getTodayIso,
  getTomorrowIso,
  toISODate,
} from "@/lib/dateIso.util";

export type IndentAllocationTripDetailsStepProps = {
  pickupDate: string;
  weightTons: string;
  vehicleType: string;
  loadType: string;
  onPickupDateChange: (iso: string) => void;
  onWeightTonsChange: (value: string) => void;
  onVehicleTypeChange: (value: string) => void;
  onLoadTypeChange: (value: string) => void;
  pickupDateError?: string | null;
  weightError?: string | null;
  vehicleTypeError?: boolean;
  loadTypeError?: boolean;
  tonsError?: boolean;
  indentVehicleType?: string | null;
  indentLoadType?: string | null;
};

export const IndentAllocationTripDetailsStep = memo(
  function IndentAllocationTripDetailsStep({
    pickupDate,
    weightTons,
    vehicleType,
    loadType,
    onPickupDateChange,
    onWeightTonsChange,
    onVehicleTypeChange,
    onLoadTypeChange,
    pickupDateError,
    weightError,
    vehicleTypeError,
    loadTypeError,
    tonsError,
    indentVehicleType,
    indentLoadType,
  }: IndentAllocationTripDetailsStepProps) {
    const [showDatePicker, setShowDatePicker] = useState(false);
    const { width } = useWindowDimensions();
    const isWide = Platform.OS === "web" && width >= 720;
    const preferWebSelect = Platform.OS === "web";

    return (
      <View style={[fullPageWizardStyles.formSectionCard, styles.root, isWide && styles.rootWebWide]}>
        <View style={fullPageWizardStyles.wizardFieldBlock}>
          <Text style={fullPageWizardStyles.wizardFieldLabel}>Trip start date</Text>
          <View style={fullPageWizardStyles.quickDateRow}>
            {(
              [
                { label: "Today", iso: getTodayIso() },
                { label: "Tomorrow", iso: getTomorrowIso() },
                { label: "Day after", iso: getDayAfterTomorrowIso() },
              ] as const
            ).map(({ label, iso }) => {
              const isActive = pickupDate === iso;
              return (
                <Pressable
                  key={label}
                  style={[
                    fullPageWizardStyles.quickDateChip,
                    isActive && fullPageWizardStyles.quickDateChipActive,
                  ]}
                  onPress={() => onPickupDateChange(iso)}
                >
                  <Text
                    style={[
                      fullPageWizardStyles.quickDateChipText,
                      isActive && fullPageWizardStyles.quickDateChipTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {Platform.OS === "web" ? (
            <TextInput
              style={[styles.input, pickupDateError ? styles.inputError : null]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Theme.placeholder}
              value={pickupDate}
              onChangeText={onPickupDateChange}
            />
          ) : (
            <>
              <TouchableOpacity
                style={[
                  fullPageWizardStyles.wizardDateTouchable,
                  pickupDateError ? styles.inputError : null,
                ]}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.85}
              >
                <Text
                  style={
                    pickupDate
                      ? fullPageWizardStyles.wizardDateText
                      : fullPageWizardStyles.wizardDatePlaceholder
                  }
                >
                  {pickupDate
                    ? formatIsoDateForDisplay(pickupDate)
                    : "Tap to pick date"}
                </Text>
              </TouchableOpacity>
              {showDatePicker &&
                (Platform.OS === "android" ? (
                  <DateTimePicker
                    value={
                      pickupDate ? new Date(`${pickupDate}T12:00:00`) : new Date()
                    }
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(e, date) => {
                      setShowDatePicker(false);
                      if (e.type === "set" && date) onPickupDateChange(toISODate(date));
                    }}
                  />
                ) : (
                  <Modal visible transparent animationType="slide">
                    <TouchableOpacity
                      style={styles.datePickerBackdrop}
                      activeOpacity={1}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <View
                        style={styles.datePickerSheet}
                        onStartShouldSetResponder={() => true}
                      >
                        <View style={styles.datePickerHeader}>
                          <Text style={styles.datePickerTitle}>Pick date</Text>
                          <TouchableOpacity
                            onPress={() => setShowDatePicker(false)}
                            hitSlop={12}
                          >
                            <Text style={styles.datePickerDone}>Done</Text>
                          </TouchableOpacity>
                        </View>
                        <DateTimePicker
                          value={
                            pickupDate
                              ? new Date(`${pickupDate}T12:00:00`)
                              : new Date()
                          }
                          mode="date"
                          display="spinner"
                          minimumDate={new Date()}
                          onChange={(_, date) =>
                            date && onPickupDateChange(toISODate(date))
                          }
                        />
                      </View>
                    </TouchableOpacity>
                  </Modal>
                ))}
            </>
          )}
          {pickupDateError ? (
            <Text style={styles.errorText}>{pickupDateError}</Text>
          ) : null}
        </View>

        <TripCommodityFields
          vehicleType={vehicleType}
          loadType={loadType}
          tons={weightTons}
          onVehicleTypeChange={onVehicleTypeChange}
          onLoadTypeChange={onLoadTypeChange}
          onTonsChange={onWeightTonsChange}
          vehicleTypeError={vehicleTypeError}
          loadTypeError={loadTypeError}
          tonsError={tonsError}
          indentVehicleType={indentVehicleType}
          indentLoadType={indentLoadType}
          isWide={isWide}
          useFormChrome={preferWebSelect}
          preferWebSelect={preferWebSelect}
          fieldLabelStyle={fullPageWizardStyles.wizardFieldLabel}
          fieldInputStyle={fullPageWizardStyles.wizardFieldInput}
        />
        {weightError ? <Text style={styles.errorText}>{weightError}</Text> : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: { gap: 12 },
  rootWebWide: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  input: {
    ...fullPageWizardStyles.wizardFieldInput,
  },
  inputError: { borderColor: Theme.negative },
  errorText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.negative,
    marginTop: 2,
  },
  datePickerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  datePickerSheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  datePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  datePickerTitle: { fontSize: 16, fontWeight: "700", color: Theme.textPrimaryDark },
  datePickerDone: { fontSize: 15, fontWeight: "700", color: Theme.primary },
});

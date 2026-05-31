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
import { TripCommodityFields } from "@/features/trips/components/add-trip/TripCommodityFields";
import { partyMobileWizardStyles as wizard } from "@/components/party/partyMobileWizardStyles";
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

    return (
      <View style={styles.root}>
        <View style={wizard.fieldBlock}>
          <Text style={wizard.fieldLabel}>TRIP START DATE</Text>
          <View style={styles.quickDateRow}>
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
                  style={[styles.quickDateChip, isActive && styles.quickDateChipActive]}
                  onPress={() => onPickupDateChange(iso)}
                >
                  <Text
                    style={[
                      styles.quickDateChipText,
                      isActive && styles.quickDateChipTextActive,
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
                style={[styles.dateTouchable, pickupDateError ? styles.inputError : null]}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.85}
              >
                <Text
                  style={
                    pickupDate ? styles.dateTouchableText : styles.dateTouchablePlaceholder
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
        />
        {weightError ? <Text style={styles.errorText}>{weightError}</Text> : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: { gap: 16, paddingTop: 4 },
  rootWebWide: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  quickDateRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  quickDateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  quickDateChipActive: {
    borderColor: Theme.iconPrimary,
    backgroundColor: Theme.surfaceLight,
  },
  quickDateChipText: { fontSize: 12, fontWeight: "600", color: Theme.textMuted },
  quickDateChipTextActive: { color: Theme.iconPrimary },
  input: {
    ...wizard.input,
    minHeight: 48,
  },
  dateTouchable: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  dateTouchableText: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  dateTouchablePlaceholder: {
    fontSize: 15,
    fontWeight: "500",
    color: Theme.placeholder,
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

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
import {
  formatIsoDateForDisplay,
  getDayAfterTomorrowIso,
  getTodayIso,
  getTomorrowIso,
  toISODate,
} from "@/lib/dateIso.util";

export type IndentAllocationTripDetailsStepProps = {
  pickupDate: string;
  onPickupDateChange: (iso: string) => void;
  pickupDateError?: string | null;
};

/**
 * Final allocation step — vehicle arrival date only.
 * Vehicle type, product type, and tons come from the indent.
 */
export const IndentAllocationTripDetailsStep = memo(
  function IndentAllocationTripDetailsStep({
    pickupDate,
    onPickupDateChange,
    pickupDateError,
  }: IndentAllocationTripDetailsStepProps) {
    const [showDatePicker, setShowDatePicker] = useState(false);
    const { width } = useWindowDimensions();
    const isWide = Platform.OS === "web" && width >= 720;

    return (
      <View
        style={[
          fullPageWizardStyles.wizardStepContentFlat,
          styles.root,
          isWide && styles.rootWebWide,
        ]}
      >
        <View style={fullPageWizardStyles.wizardFieldBlock}>
          <Text style={fullPageWizardStyles.wizardFieldLabel}>
            Vehicle arrival date *
          </Text>
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
                      pickupDate
                        ? new Date(`${pickupDate}T12:00:00`)
                        : new Date()
                    }
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(e, date) => {
                      setShowDatePicker(false);
                      if (e.type === "set" && date)
                        onPickupDateChange(toISODate(date));
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
                          <Text style={styles.datePickerTitle}>
                            Vehicle arrival date
                          </Text>
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
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    width: "100%",
    gap: 12,
  },
  rootWebWide: {
    maxWidth: 520,
    alignSelf: "center",
  },
  input: {
    ...fullPageWizardStyles.wizardFieldInput,
  },
  inputError: {
    borderColor: Theme.destructive,
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.destructive,
  },
  datePickerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  datePickerDone: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.primary,
  },
});

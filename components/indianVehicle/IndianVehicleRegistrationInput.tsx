/**
 * Indian plate input: XX NN LL NNNN with segment-aware keyboard and format guide.
 * Used in Create Trip aggregate wizard and indent allocation deploy flow.
 */
import { memo, useMemo, useRef, type RefObject } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
  type TextStyle,
} from "react-native";
import { Truck } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { partyMobileWizardStyles as wizard } from "@/components/party/partyMobileWizardStyles";
import { assignmentShellStyles } from "@/features/trips/styles/assignmentShellShared";
import {
  applyIndianVehicleKeystroke,
  getIndianVehicleFormatHint,
  getIndianVehicleKeyboardType,
  getIndianVehicleSegmentGuide,
} from "@/lib/indianVehicleInput.util";

export type IndianVehicleRegistrationInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  /** Wizard = full-page step density; compact = assignment / modal field stack. */
  variant?: "wizard" | "compact";
  label?: string;
  showLabel?: boolean;
  showFormatGuide?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<TextInputType | null>;
  inputAccessoryViewID?: string;
  onFocus?: () => void;
  testID?: string;
};

export const IndianVehicleRegistrationInput = memo(
  function IndianVehicleRegistrationInput({
    value,
    onChangeText,
    variant = "wizard",
    label = "REGISTRATION",
    showLabel = true,
    showFormatGuide = true,
    error = false,
    autoFocus = false,
    inputRef: inputRefProp,
    inputAccessoryViewID,
    onFocus,
    testID = "indian-vehicle-registration-input",
  }: IndianVehicleRegistrationInputProps) {
    const localRef = useRef<TextInputType>(null);
    const inputRef = inputRefProp ?? localRef;
    const isWizard = variant === "wizard";

    const keyboardType = useMemo(
      () => getIndianVehicleKeyboardType(value),
      [value],
    );
    const formatHint = useMemo(() => getIndianVehicleFormatHint(value), [value]);
    const segmentGuide = useMemo(() => getIndianVehicleSegmentGuide(value), [value]);

    const handleChange = (raw: string) => {
      onChangeText(applyIndianVehicleKeystroke(raw));
    };

    const inputStyles: TextStyle[] = isWizard
      ? [wizard.input, styles.inputVehicle]
      : [styles.inputCompact, assignmentShellStyles.inputWell, styles.inputVehicle];
    if (error) {
      inputStyles.push(isWizard ? styles.inputErrorWizard : styles.inputErrorCompact);
    }
    if (isWizard) {
      inputStyles.push(styles.inputWithIcon);
    }

    return (
      <View style={isWizard ? styles.wizardRoot : styles.compactRoot}>
        {showLabel ? (
          <Text style={isWizard ? wizard.fieldLabel : styles.compactLabel}>
            {label}
          </Text>
        ) : null}

        {showFormatGuide ? (
          <>
            <Text style={isWizard ? styles.formatHint : styles.formatHintCompact}>
              {formatHint}
            </Text>
            <View style={styles.formatMaskRow}>
              {segmentGuide.map((seg, i) => (
                <Text
                  key={`${seg.label}-${i}`}
                  style={[
                    styles.formatMaskSeg,
                    seg.done && styles.formatMaskSegDone,
                  ]}
                >
                  {seg.label}
                </Text>
              ))}
            </View>
          </>
        ) : null}

        <View style={isWizard ? styles.iconInputWrap : undefined}>
          {isWizard ? (
            <Truck size={20} color={Theme.iconMuted} style={styles.leadingIcon} />
          ) : null}
          <TextInput
            key={keyboardType}
            ref={inputRef}
            style={inputStyles}
            placeholder="e.g. TN 12 AB 3456"
            placeholderTextColor={isWizard ? Theme.textMuted : Theme.textMuted}
            value={value}
            onChangeText={handleChange}
            keyboardType={keyboardType}
            autoCapitalize={keyboardType === "number-pad" ? "none" : "characters"}
            autoCorrect={false}
            autoFocus={autoFocus}
            inputAccessoryViewID={inputAccessoryViewID}
            onFocus={onFocus}
            testID={testID}
          />
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wizardRoot: {
    gap: 0,
  },
  compactRoot: {
    gap: 8,
  },
  compactLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  formatHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginBottom: 8,
  },
  formatHintCompact: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 17,
  },
  formatMaskRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  formatMaskSeg: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  formatMaskSegDone: {
    borderColor: Theme.positive,
    color: Theme.positive,
    backgroundColor: Theme.positiveMuted,
  },
  iconInputWrap: {
    position: "relative",
  },
  leadingIcon: {
    position: "absolute",
    left: 16,
    top: Platform.OS === "web" ? 16 : 18,
    zIndex: 1,
  },
  inputWithIcon: {
    paddingLeft: 48,
  },
  inputVehicle: Platform.select<TextStyle>({
    ios: { fontFamily: "Menlo" },
    android: { fontFamily: "monospace" },
    web: {
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
    default: {},
  }) as TextStyle,
  inputCompact: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  inputErrorWizard: {
    borderColor: Theme.destructive,
    borderWidth: 2,
    backgroundColor: "#fef2f2",
  },
  inputErrorCompact: {
    borderColor: Theme.destructive,
    borderWidth: 2,
  },
});

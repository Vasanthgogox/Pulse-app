/**
 * Full-screen-style aggregate driver / phone / vehicle steps (mobile Create Trip wizard).
 * Matches party addition wizard density (large title + hero input).
 */
import { memo, type ReactNode, useMemo, useRef } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { User, Truck } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { IndiaFlagIcon } from "@/components/party/IndiaFlagIcon";
import { partyMobileWizardStyles as wizard } from "@/components/party/partyMobileWizardStyles";
import {
  applyIndianVehicleKeystroke,
  getIndianVehicleFormatHint,
  getIndianVehicleKeyboardType,
  getIndianVehicleNormalizedLength,
} from "@/lib/indianVehicleInput.util";
import type { AddTripIssueField } from "./useAddTripForm";

export type AggregateTrackingStep = "driverPhone" | "driverName" | "vehicle";

const STEP_ORDER: AggregateTrackingStep[] = [
  "driverPhone",
  "driverName",
  "vehicle",
];

function stepMeta(step: AggregateTrackingStep): {
  title: string;
  hint: string;
  label: string;
} {
  switch (step) {
    case "driverPhone":
      return {
        title: "Driver mobile",
        hint: "Enter mobile first — we look up the driver on Q.",
        label: "MOBILE (+91)",
      };
    case "driverName":
      return {
        title: "Driver name",
        hint: "Confirm or edit the name for tracking.",
        label: "FULL NAME",
      };
    case "vehicle":
      return {
        title: "Vehicle number",
        hint: "Indian format: 2 letters · 2 digits · 2 letters · 4 digits.",
        label: "REGISTRATION",
      };
    default:
      return { title: "", hint: "", label: "" };
  }
}

export interface AggregateTrackingMobileStepProps {
  step: AggregateTrackingStep;
  /** Center content on wide web (tablet wizard). */
  webCentered?: boolean;
  driverName: string;
  onDriverNameChange: (value: string) => void;
  driverPhone: string;
  onDriverPhoneChange: (value: string) => void;
  vehicleText: string;
  onVehicleTextChange: (value: string) => void;
  invalid: (field: AddTripIssueField) => boolean;
  driverNameInputRef?: React.RefObject<TextInputType | null>;
  driverPhoneInputRef?: React.RefObject<TextInputType | null>;
  vehicleInputRef?: React.RefObject<TextInputType | null>;
  inputAccessoryViewID?: string;
  onFocusDriverName?: () => void;
  onFocusDriverPhone?: () => void;
  onFocusVehicle?: () => void;
  phoneDigitHint?: string | null;
  phoneValidationMessage?: string | null;
  phoneExtras?: ReactNode;
  /** When set, name step shows that the value came from platform lookup. */
  driverNameFromPlatform?: string | null;
}

export const AggregateTrackingMobileStep = memo(function AggregateTrackingMobileStep({
  step,
  driverName,
  onDriverNameChange,
  driverPhone,
  onDriverPhoneChange,
  vehicleText,
  onVehicleTextChange,
  invalid,
  driverNameInputRef,
  driverPhoneInputRef,
  vehicleInputRef,
  inputAccessoryViewID,
  onFocusDriverName,
  onFocusDriverPhone,
  onFocusVehicle,
  phoneDigitHint,
  phoneValidationMessage,
  phoneExtras,
  driverNameFromPlatform,
  webCentered = false,
}: AggregateTrackingMobileStepProps) {
  const localNameRef = useRef<TextInputType>(null);
  const localPhoneRef = useRef<TextInputType>(null);
  const localVehicleRef = useRef<TextInputType>(null);
  const nameRef = driverNameInputRef ?? localNameRef;
  const phoneRef = driverPhoneInputRef ?? localPhoneRef;
  const vehicleRef = vehicleInputRef ?? localVehicleRef;

  const { title, hint, label } = stepMeta(step);
  const stepIdx = STEP_ORDER.indexOf(step);

  const vehicleNormLen = getIndianVehicleNormalizedLength(vehicleText);
  const vehicleKeyboardType = useMemo(
    () => getIndianVehicleKeyboardType(vehicleNormLen),
    [vehicleNormLen],
  );
  const vehicleFormatHint = useMemo(
    () => getIndianVehicleFormatHint(vehicleNormLen),
    [vehicleNormLen],
  );

  const inputErr = (() => {
    if (step === "driverName" && invalid("driverName")) return true;
    if (step === "driverPhone" && invalid("driverPhone")) return true;
    if (step === "vehicle" && invalid("vehicleNumber")) return true;
    return false;
  })();

  const inputStyle: TextStyle[] = [wizard.input];
  if (inputErr) inputStyle.push(styles.inputError);
  if (step === "vehicle") inputStyle.push(styles.inputVehicle);

  const handleVehicleChange = (raw: string) => {
    onVehicleTextChange(applyIndianVehicleKeystroke(raw));
  };

  return (
    <View style={[styles.root, webCentered && styles.rootWebCentered]}>
      <View style={styles.progressRow}>
        {STEP_ORDER.map((s, i) => (
          <View
            key={s}
            style={[
              styles.progressDot,
              i <= stepIdx && styles.progressDotActive,
              i === stepIdx && styles.progressDotCurrent,
            ]}
          />
        ))}
      </View>

      <Text style={wizard.stepTitle}>{title}</Text>
      <Text style={wizard.stepHint}>{hint}</Text>

      <View style={wizard.fieldBlock}>
        <Text style={wizard.fieldLabel}>{label}</Text>

        {step === "driverName" ? (
          <>
            {driverNameFromPlatform ? (
              <View style={styles.platformBadge}>
                <Text style={styles.platformBadgeText}>
                  From platform: {driverNameFromPlatform}
                </Text>
              </View>
            ) : null}
            <View style={styles.iconInputWrap}>
              <User size={20} color={Theme.iconMuted} style={styles.leadingIcon} />
              <TextInput
                ref={nameRef}
                style={[inputStyle, styles.inputWithIcon]}
                placeholder="e.g. Suresh Kumar"
                placeholderTextColor={Theme.textMuted}
                value={driverName}
                onChangeText={onDriverNameChange}
                autoCapitalize="words"
                autoFocus
                inputAccessoryViewID={inputAccessoryViewID}
                onFocus={onFocusDriverName}
                testID="aggregate-driver-name-input"
              />
            </View>
          </>
        ) : null}

        {step === "driverPhone" ? (
          <>
            <View
              style={[
                wizard.phoneRow,
                inputErr && styles.phoneRowError,
              ]}
            >
              <View style={wizard.phoneCc}>
                <IndiaFlagIcon width={20} height={15} />
                <Text style={wizard.phoneCcText}>+91</Text>
              </View>
              <TextInput
                ref={phoneRef}
                style={[wizard.input, wizard.phoneInput]}
                keyboardType="phone-pad"
                maxLength={10}
                placeholder="10-digit number"
                placeholderTextColor={Theme.textMuted}
                value={driverPhone}
                onChangeText={onDriverPhoneChange}
                autoFocus
                inputAccessoryViewID={inputAccessoryViewID}
                onFocus={onFocusDriverPhone}
                testID="aggregate-driver-phone-input"
              />
            </View>
            {phoneDigitHint ? (
              <Text style={styles.helper}>{phoneDigitHint}</Text>
            ) : null}
            {phoneValidationMessage ? (
              <Text style={styles.helperError}>{phoneValidationMessage}</Text>
            ) : null}
            {phoneExtras}
          </>
        ) : null}

        {step === "vehicle" ? (
          <>
            <Text style={styles.formatHint}>{vehicleFormatHint}</Text>
            <View style={styles.formatMaskRow}>
              {["AA", "00", "AA", "0000"].map((seg, i) => (
                <Text
                  key={seg}
                  style={[
                    styles.formatMaskSeg,
                    vehicleNormLen >= [2, 4, 6, 10][i] && styles.formatMaskSegDone,
                  ]}
                >
                  {seg}
                </Text>
              ))}
            </View>
            <View style={styles.iconInputWrap}>
              <Truck size={20} color={Theme.iconMuted} style={styles.leadingIcon} />
              <TextInput
                key={vehicleKeyboardType}
                ref={vehicleRef}
                style={[inputStyle, styles.inputWithIcon]}
                placeholder="e.g. TN 12 AB 3456"
                placeholderTextColor={Theme.textMuted}
                value={vehicleText}
                onChangeText={handleVehicleChange}
                keyboardType={vehicleKeyboardType}
                autoCapitalize={
                  vehicleKeyboardType === "number-pad" ? "none" : "characters"
                }
                autoCorrect={false}
                autoFocus
                inputAccessoryViewID={inputAccessoryViewID}
                onFocus={onFocusVehicle}
                testID="aggregate-vehicle-input"
              />
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    minHeight: 360,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 16,
  },
  rootWebCentered: Platform.select({
    web: {
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
      paddingHorizontal: 8,
    } as ViewStyle,
    default: {},
  }),
  progressRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e2e8f0",
  },
  progressDotActive: {
    backgroundColor: Theme.positive,
  },
  progressDotCurrent: {
    width: 24,
  },
  platformBadge: {
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  platformBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.primary,
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
  inputError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
    backgroundColor: "#fef2f2",
  },
  phoneRowError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
    backgroundColor: "#fef2f2",
  },
  inputVehicle: {
    ...Platform.select<TextStyle>({
      ios: { fontFamily: "Menlo" },
      android: { fontFamily: "monospace" },
      web: {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      default: {},
    }),
    letterSpacing: 0.5,
  },
  formatHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginBottom: 8,
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
  helper: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 6,
  },
  helperError: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.destructive,
    marginTop: 6,
  },
});

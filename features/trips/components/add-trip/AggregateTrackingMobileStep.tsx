/**
 * Full-screen-style aggregate driver / phone / vehicle steps (mobile Create Trip wizard).
 * Matches party addition wizard density (large title + hero input).
 */
import { memo, type ReactNode, useRef } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
  type TextStyle,
} from "react-native";
import { User, Truck } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { IndiaFlagIcon } from "@/components/party/IndiaFlagIcon";
import { partyMobileWizardStyles as wizard } from "@/components/party/partyMobileWizardStyles";
import type { AddTripIssueField } from "./useAddTripForm";

export type AggregateTrackingStep = "driverName" | "driverPhone" | "vehicle";

const STEP_ORDER: AggregateTrackingStep[] = [
  "driverName",
  "driverPhone",
  "vehicle",
];

function stepMeta(step: AggregateTrackingStep): {
  title: string;
  hint: string;
  label: string;
} {
  switch (step) {
    case "driverName":
      return {
        title: "Driver name",
        hint: "Legal name for tracking this trip.",
        label: "FULL NAME",
      };
    case "driverPhone":
      return {
        title: "Driver mobile",
        hint: "10-digit Indian number. We look up existing drivers.",
        label: "MOBILE (+91)",
      };
    case "vehicle":
      return {
        title: "Vehicle number",
        hint: "Registration as on the truck, e.g. TN 67 GH 7654.",
        label: "REGISTRATION",
      };
    default:
      return { title: "", hint: "", label: "" };
  }
}

export interface AggregateTrackingMobileStepProps {
  step: AggregateTrackingStep;
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
}: AggregateTrackingMobileStepProps) {
  const localNameRef = useRef<TextInputType>(null);
  const localPhoneRef = useRef<TextInputType>(null);
  const localVehicleRef = useRef<TextInputType>(null);
  const nameRef = driverNameInputRef ?? localNameRef;
  const phoneRef = driverPhoneInputRef ?? localPhoneRef;
  const vehicleRef = vehicleInputRef ?? localVehicleRef;

  const { title, hint, label } = stepMeta(step);
  const stepIdx = STEP_ORDER.indexOf(step);

  const inputErr = (() => {
    if (step === "driverName" && invalid("driverName")) return true;
    if (step === "driverPhone" && invalid("driverPhone")) return true;
    if (step === "vehicle" && invalid("vehicleNumber")) return true;
    return false;
  })();

  const inputStyle = [
    wizard.input,
    inputErr && styles.inputError,
    step === "vehicle" && styles.inputVehicle,
  ];

  return (
    <View style={styles.root}>
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
          <View style={styles.iconInputWrap}>
            <Truck size={20} color={Theme.iconMuted} style={styles.leadingIcon} />
            <TextInput
              ref={vehicleRef}
              style={[inputStyle, styles.inputWithIcon]}
              placeholder="e.g. TN 67 GH 7654"
              placeholderTextColor={Theme.textMuted}
              value={vehicleText}
              onChangeText={onVehicleTextChange}
              autoCapitalize="characters"
              autoFocus
              inputAccessoryViewID={inputAccessoryViewID}
              onFocus={onFocusVehicle}
              testID="aggregate-vehicle-input"
            />
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    minHeight: 280,
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 12,
  },
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

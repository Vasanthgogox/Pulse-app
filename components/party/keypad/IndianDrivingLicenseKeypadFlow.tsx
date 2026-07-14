/**
 * Full-page Indian driving licence entry with segment-aware custom keypad.
 */
import { memo, useCallback, useMemo } from "react";
import { Platform, Text, TextInput, View } from "react-native";
import { CreditCard } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { IndianVehicleRegistrationKeypad } from "@/components/indianVehicle/IndianVehicleRegistrationKeypad";
import { partyMobileWizardStyles as wizard } from "@/components/party/partyMobileWizardStyles";
import {
  partyKeypadDisplayMono,
  partyKeypadFlowStyles as flow,
} from "@/components/party/keypad/partyKeypadFlowStyles";
import { KeypadDisplayValueWithCaret } from "@/components/party/keypad/KeypadDisplayValueWithCaret";
import {
  appendIndianDlChar,
  applyIndianDlKeystroke,
  deleteIndianDlLastChar,
  getIndianDlFormatHint,
  getIndianDlKeyboardKind,
  getIndianDlNormalizedLength,
  INDIAN_DL_TOTAL_LENGTH,
} from "@/lib/indianDrivingLicenseInput.util";

const SEGMENT_LABELS = ["AA", "00", "0000", "0000000"] as const;
const SEGMENT_DONE_AT = [2, 4, 8, 15] as const;

export interface IndianDrivingLicenseKeypadFlowProps {
  value: string;
  onChangeText: (value: string) => void;
  error?: boolean;
  testID?: string;
}

export const IndianDrivingLicenseKeypadFlow = memo(
  function IndianDrivingLicenseKeypadFlow({
    value,
    onChangeText,
    error = false,
    testID = "indian-dl-keypad-flow",
  }: IndianDrivingLicenseKeypadFlowProps) {
    const normLen = getIndianDlNormalizedLength(value);
    const keyboardKind = getIndianDlKeyboardKind(normLen);
    const formatHint = useMemo(
      () => getIndianDlFormatHint(normLen),
      [normLen],
    );
    const displayValue = value.trim();
    const showCursor = normLen < INDIAN_DL_TOTAL_LENGTH;

    const handleKey = useCallback(
      (key: string) => {
        if (key === "⌫") {
          onChangeText(deleteIndianDlLastChar(value));
          return;
        }
        onChangeText(appendIndianDlChar(value, key));
      },
      [onChangeText, value],
    );

    return (
      <View style={flow.root} testID={Platform.OS === "web" ? undefined : testID}>
        {Platform.OS === "web" ? (
          <TextInput
            testID={testID}
            value={value}
            onChangeText={(next) => onChangeText(applyIndianDlKeystroke(next))}
            autoCapitalize="characters"
            style={flow.hiddenInput}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
        <View style={flow.main}>
          <Text style={wizard.fieldLabel}>LICENCE NUMBER</Text>
          <Text style={flow.formatHint}>{formatHint}</Text>

          <View style={flow.formatMaskRow}>
            {SEGMENT_LABELS.map((seg, i) => (
              <Text
                key={seg}
                style={[
                  flow.formatMaskSeg,
                  normLen >= SEGMENT_DONE_AT[i]! && flow.formatMaskSegDone,
                ]}
              >
                {seg}
              </Text>
            ))}
          </View>

          <View style={[flow.displayRow, error && flow.displayRowError]}>
            <CreditCard
              size={20}
              color={Theme.iconMuted}
              style={flow.leadingIcon}
            />
            <KeypadDisplayValueWithCaret
              value={displayValue}
              placeholder="TN01 20200001234"
              showCaret={showCursor}
              valueStyle={[flow.displayValue, partyKeypadDisplayMono]}
              placeholderStyle={flow.displayPlaceholder}
              caretStyle={flow.cursor}
              accessibilityLabel={displayValue || "Driving licence number"}
            />
          </View>
        </View>

        <View style={flow.keypadDock}>
          <IndianVehicleRegistrationKeypad
            kind={keyboardKind}
            onKey={handleKey}
            normalizedLength={Math.min(normLen, 1)}
          />
        </View>
      </View>
    );
  },
);

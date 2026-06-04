/**
 * Full-page 10-digit Indian mobile entry with numeric keypad (no system keyboard).
 */
import { memo, useCallback, type ReactNode } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";

import { DecimalKeypad } from "@/components/mobile-input/DecimalKeypad";
import type { KeypadKey } from "@/components/mobile-input/keypad";
import { partyMobileWizardStyles as wizard } from "@/components/party/partyMobileWizardStyles";
import { IndiaFlagIcon } from "@/components/party/IndiaFlagIcon";
import { partyKeypadFlowStyles as flow } from "@/components/party/keypad/partyKeypadFlowStyles";
import Theme from "@/constants/Theme";
import { formatMobileNumber } from "@/lib/format";

export interface PhoneNumberKeypadFlowProps {
  value: string;
  onChangeText: (value: string) => void;
  maxLength?: number;
  label?: string;
  placeholder?: string;
  error?: boolean;
  testID?: string;
  footerExtras?: ReactNode;
  /** iOS dial-pad chrome (default on native). */
  keypadVariant?: "apple" | "pay";
}

export const PhoneNumberKeypadFlow = memo(function PhoneNumberKeypadFlow({
  value,
  onChangeText,
  maxLength = 10,
  label = "MOBILE (+91)",
  placeholder = "10-digit number",
  error = false,
  testID = "phone-keypad-flow",
  footerExtras,
  keypadVariant = Platform.OS === "web" ? "pay" : "apple",
}: PhoneNumberKeypadFlowProps) {
  const digits = formatMobileNumber(value);
  const showCursor = digits.length < maxLength;
  const useAppleKeypad = keypadVariant === "apple";

  const handleKey = useCallback(
    (key: KeypadKey) => {
      if (key === "⌫") {
        onChangeText(formatMobileNumber(digits.slice(0, -1)));
        return;
      }
      if (key === ".") return;
      onChangeText(formatMobileNumber(digits + key));
    },
    [digits, onChangeText],
  );

  return (
    <View style={flow.root} testID={Platform.OS === "web" ? undefined : testID}>
      {Platform.OS === "web" ? (
        <TextInput
          testID={testID}
          value={digits}
          onChangeText={onChangeText}
          keyboardType="phone-pad"
          maxLength={maxLength}
          style={flow.hiddenInput}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}

      <View style={flow.mainPadded}>
        <Text style={wizard.fieldLabel}>{label}</Text>

        <View style={[flow.displayRow, error && flow.displayRowError]}>
          <View style={styles.cc}>
            <IndiaFlagIcon width={22} height={16} />
            <Text style={styles.ccText}>+91</Text>
          </View>
          <Text
            style={[
              flow.displayValue,
              !digits && flow.displayPlaceholder,
            ]}
            numberOfLines={1}
            accessibilityLabel={digits || placeholder}
          >
            {digits || placeholder}
          </Text>
          {showCursor ? <View style={flow.cursor} /> : null}
        </View>

        {footerExtras ? <View style={flow.extras}>{footerExtras}</View> : null}
      </View>

      <View style={useAppleKeypad ? flow.keypadDockApple : flow.keypadDock}>
        <DecimalKeypad
          onKey={handleKey}
          showDecimal={false}
          layout="phone"
          variant={useAppleKeypad ? "apple" : "pay"}
          size={useAppleKeypad ? "default" : "compact"}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  cc: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 12,
    marginRight: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
  },
  ccText: {
    fontSize: 17,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
});

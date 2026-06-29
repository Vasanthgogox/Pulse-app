/**
 * Full-page 10-digit Indian mobile entry with numeric keypad (no system keyboard).
 */
import { memo, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from "react-native";

import { DecimalKeypad } from "@/components/mobile-input/DecimalKeypad";
import type { KeypadKey } from "@/components/mobile-input/keypad";
import { useInputPlatform } from "@/components/mobile-input/useInputPlatform";
import { usePhysicalKeypadInput } from "@/components/mobile-input/usePhysicalKeypadInput";
import { IndiaFlagIcon } from "@/components/party/IndiaFlagIcon";
import { fullPageWizardStyles } from "@/components/full-page-wizard";
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
  /** Inside FullPageWizardShell fillBody — safe padding + readable labels. */
  wizardShell?: boolean;
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
  wizardShell = false,
}: PhoneNumberKeypadFlowProps) {
  const digits = formatMobileNumber(value);
  const showCursor = digits.length < maxLength;
  const useAppleKeypad = !wizardShell && keypadVariant === "apple";
  const inputPlatform = useInputPlatform();
  const isDesktopWeb = Platform.OS === "web" && inputPlatform === "desktop";
  const inputRef = useRef<TextInputType>(null);

  const handleKey = useCallback(
    (key: KeypadKey) => {
      if (key === "⌫") {
        onChangeText(formatMobileNumber(digits.slice(0, -1)));
        return;
      }
      if (key === ".") return;
      if (digits.length >= maxLength) return;
      onChangeText(formatMobileNumber(digits + key));
    },
    [digits, maxLength, onChangeText],
  );

  const focusInput = useCallback(() => {
    if (isDesktopWeb) inputRef.current?.focus();
  }, [isDesktopWeb]);

  useEffect(() => {
    if (!isDesktopWeb) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isDesktopWeb]);

  usePhysicalKeypadInput({
    enabled: isDesktopWeb,
    onKey: handleKey,
    allowDecimal: false,
  });

  const handleHiddenChange = useCallback(
    (text: string) => {
      onChangeText(formatMobileNumber(text));
    },
    [onChangeText],
  );

  return (
    <View style={flow.root} testID={Platform.OS === "web" ? undefined : testID}>
      <View style={wizardShell ? flow.mainPaddedWizard : flow.mainPadded}>
        <View style={wizardShell ? fullPageWizardStyles.wizardFieldBlock : undefined}>
          <Text style={wizardShell ? fullPageWizardStyles.wizardFieldLabel : styles.label}>
            {label}
          </Text>

          <Pressable
            onPress={focusInput}
            disabled={!isDesktopWeb}
            style={({ pressed }) => [
              flow.displayRow,
              error && flow.displayRowError,
              isDesktopWeb && pressed && styles.displayRowPressed,
            ]}
            accessibilityRole={isDesktopWeb ? "button" : undefined}
            accessibilityLabel={
              isDesktopWeb ? `${label}. Click to type with keyboard.` : undefined
            }
          >
            {isDesktopWeb ? (
              <TextInput
                ref={inputRef}
                testID={testID}
                value={digits}
                onChangeText={handleHiddenChange}
                keyboardType="phone-pad"
                maxLength={maxLength}
                autoFocus
                style={styles.desktopCaptureInput}
                accessibilityLabel={label}
              />
            ) : null}
            <View style={styles.cc}>
              <IndiaFlagIcon width={22} height={16} />
              <Text style={styles.ccText}>+91</Text>
            </View>
            <Text
              style={[
                flow.displayValue,
                wizardShell && styles.displayValueWizard,
                !digits && flow.displayPlaceholder,
              ]}
              numberOfLines={1}
              accessibilityLabel={digits || placeholder}
            >
              {digits || placeholder}
            </Text>
            {showCursor ? (
              <View style={[flow.cursor, wizardShell && styles.cursorWizard]} />
            ) : null}
          </Pressable>
        </View>

        {footerExtras ? <View style={flow.extras}>{footerExtras}</View> : null}
      </View>

      <View
        style={
          wizardShell
            ? flow.keypadDockWizard
            : useAppleKeypad
              ? flow.keypadDockApple
              : flow.keypadDock
        }
      >
        <DecimalKeypad
          onKey={handleKey}
          showDecimal={false}
          layout="phone"
          variant={wizardShell ? "pay" : useAppleKeypad ? "apple" : "pay"}
          size={wizardShell || !useAppleKeypad ? "compact" : "default"}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    color: Theme.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    marginBottom: 6,
  },
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
  displayValueWizard: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  cursorWizard: {
    height: 28,
    backgroundColor: Theme.buttonPrimary,
  },
  displayRowPressed: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  desktopCaptureInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    color: "transparent",
    fontSize: 1,
    ...Platform.select({
      web: {
        caretColor: "transparent",
        outlineStyle: "none",
      } as object,
      default: {},
    }),
  },
});

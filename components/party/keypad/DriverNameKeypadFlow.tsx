/**
 * Full-page driver name entry with letter keypad (no system keyboard).
 * Matches PhoneNumberKeypadFlow wizardShell docking + Continue host.
 */
import { memo, useCallback, useEffect, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { User } from "lucide-react-native";

import { fullPageWizardStyles } from "@/components/full-page-wizard";
import { WizardActionBarHost } from "@/components/full-page-wizard/WizardActionBarContext";
import { KeypadDisplayValueWithCaret } from "@/components/party/keypad/KeypadDisplayValueWithCaret";
import { PersonNameKeypad } from "@/components/party/keypad/PersonNameKeypad";
import { partyKeypadFlowStyles as flow } from "@/components/party/keypad/partyKeypadFlowStyles";
import { useInputPlatform } from "@/components/mobile-input/useInputPlatform";
import Theme from "@/constants/Theme";
import {
  appendPersonNameKey,
  PERSON_NAME_MAX_LENGTH,
} from "@/lib/personNameKeypad.util";

export interface DriverNameKeypadFlowProps {
  value: string;
  onChangeText: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: boolean;
  testID?: string;
  footerExtras?: ReactNode;
  wizardShell?: boolean;
  maxLength?: number;
}

function usePersonNamePhysicalKeypad({
  enabled,
  onKey,
}: {
  enabled: boolean;
  onKey: (key: string) => void;
}): void {
  useEffect(() => {
    if (!enabled || Platform.OS !== "web") return;
    if (typeof window === "undefined") return;

    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      const { key } = event;
      if (key === "Backspace" || key === "Delete") {
        event.preventDefault();
        onKey("⌫");
        return;
      }
      if (key === " " || key === "Spacebar") {
        event.preventDefault();
        onKey(" ");
        return;
      }
      if (/^[a-zA-Z]$/.test(key)) {
        event.preventDefault();
        onKey(key.toUpperCase());
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onKey]);
}

export const DriverNameKeypadFlow = memo(function DriverNameKeypadFlow({
  value,
  onChangeText,
  label = "Driver name (tracking) *",
  placeholder = "e.g. Suresh Kumar",
  error = false,
  testID = "driver-name-keypad-flow",
  footerExtras,
  wizardShell = false,
  maxLength = PERSON_NAME_MAX_LENGTH,
}: DriverNameKeypadFlowProps) {
  const displayValue = value;
  const showCursor = displayValue.length < maxLength;
  const inputPlatform = useInputPlatform();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && inputPlatform === "desktop";
  const groupTop = Platform.OS === "web" && width >= 720 && !wizardShell;

  const handleKey = useCallback(
    (key: string) => {
      onChangeText(appendPersonNameKey(value, key).slice(0, maxLength));
    },
    [maxLength, onChangeText, value],
  );

  usePersonNamePhysicalKeypad({
    enabled: Platform.OS === "web",
    onKey: handleKey,
  });

  return (
    <View
      style={groupTop ? styles.rootGrouped : flow.root}
      testID={Platform.OS === "web" ? undefined : testID}
    >
      <View
        style={
          wizardShell || groupTop
            ? flow.mainPaddedWizardTall
            : flow.mainPadded
        }
      >
        <View style={wizardShell ? fullPageWizardStyles.wizardFieldBlock : undefined}>
          <Text style={wizardShell ? fullPageWizardStyles.wizardFieldLabel : styles.label}>
            {label}
          </Text>

          <Pressable
            onPress={() => {
              if (Platform.OS !== "web" || typeof window === "undefined") return;
              window.focus();
            }}
            disabled={Platform.OS !== "web"}
            style={({ pressed }) => [
              flow.displayRow,
              wizardShell && styles.displayRowWizard,
              error && flow.displayRowError,
              isDesktopWeb && pressed && styles.displayRowPressed,
            ]}
            accessibilityRole={Platform.OS === "web" ? "button" : undefined}
            accessibilityLabel={
              Platform.OS === "web"
                ? `${label}. Type with your keyboard or the on-screen keypad.`
                : displayValue || label
            }
          >
            <User size={20} color={Theme.iconMuted} style={styles.leadingIcon} />
            <KeypadDisplayValueWithCaret
              value={displayValue}
              placeholder={placeholder}
              showCaret={showCursor}
              valueStyle={[
                flow.displayValue,
                wizardShell && styles.displayValueWizard,
              ]}
              placeholderStyle={flow.displayPlaceholder}
              caretStyle={wizardShell ? styles.cursorWizard : flow.cursor}
            />
          </Pressable>
        </View>

        {footerExtras ? <View style={flow.extras}>{footerExtras}</View> : null}
      </View>

      <View style={wizardShell ? flow.bottomDock : undefined}>
        {wizardShell ? (
          <WizardActionBarHost style={flow.actionBarHost} />
        ) : null}

        <View
          style={
            wizardShell || groupTop
              ? [
                  flow.keypadDockWizard,
                  flow.keypadDockWizardBleed,
                  flow.keypadDockSignIn,
                  flow.padDockFlush,
                ]
              : flow.keypadDock
          }
        >
          <PersonNameKeypad
            onKey={handleKey}
            length={displayValue.length}
            maxLength={maxLength}
          />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  rootGrouped: {
    width: "100%",
    justifyContent: "flex-start",
    gap: 16,
  },
  label: {
    color: Theme.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  leadingIcon: {
    marginRight: 10,
  },
  displayValueWizard: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  displayRowWizard: {
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  cursorWizard: {
    height: 24,
    backgroundColor: Theme.buttonPrimary,
  },
  displayRowPressed: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
});

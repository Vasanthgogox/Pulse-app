/**
 * Full-page Indian plate entry: display + segment guide + custom keypad (no system keyboard).
 */
import { memo, useCallback, useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Truck } from "lucide-react-native";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { fullPageWizardStyles } from "@/components/full-page-wizard";
import { partyKeypadFlowStyles as flow } from "@/components/party/keypad/partyKeypadFlowStyles";
import { IndianVehicleRegistrationKeypad } from "@/components/indianVehicle/IndianVehicleRegistrationKeypad";
import { useIndianVehiclePhysicalKeypad } from "@/components/indianVehicle/useIndianVehiclePhysicalKeypad";
import { useInputPlatform } from "@/components/mobile-input/useInputPlatform";
import {
  appendIndianVehicleChar,
  deleteIndianVehicleLastChar,
  getIndianVehicleFormatHint,
  getIndianVehicleKeyboardKind,
  getIndianVehicleNormalizedLength,
  INDIAN_VEHICLE_TOTAL_LENGTH,
} from "@/lib/indianVehicleInput.util";

export interface IndianVehicleRegistrationKeypadFlowProps {
  value: string;
  onChangeText: (value: string) => void;
  error?: boolean;
  testID?: string;
  wizardShell?: boolean;
}

export const IndianVehicleRegistrationKeypadFlow = memo(
  function IndianVehicleRegistrationKeypadFlow({
    value,
    onChangeText,
    error = false,
    testID = "indian-vehicle-keypad-flow",
    wizardShell = false,
  }: IndianVehicleRegistrationKeypadFlowProps) {
    const normLen = getIndianVehicleNormalizedLength(value);
    const keyboardKind = getIndianVehicleKeyboardKind(normLen);
    const formatHint = useMemo(
      () => getIndianVehicleFormatHint(normLen),
      [normLen],
    );
    const displayValue = value.trim();
    const showCursor = normLen < INDIAN_VEHICLE_TOTAL_LENGTH;
    const inputPlatform = useInputPlatform();
    const isDesktopWeb = Platform.OS === "web" && inputPlatform === "desktop";

    const handleKey = useCallback(
      (key: string) => {
        if (key === "⌫") {
          onChangeText(deleteIndianVehicleLastChar(value));
          return;
        }
        onChangeText(appendIndianVehicleChar(value, key));
      },
      [onChangeText, value],
    );

    useIndianVehiclePhysicalKeypad({
      enabled: isDesktopWeb,
      kind: keyboardKind,
      onKey: handleKey,
    });

    return (
      <View style={styles.root} testID={testID}>
        <View style={[styles.main, wizardShell && styles.mainWizard]}>
          <Text style={wizardShell ? fullPageWizardStyles.wizardFieldLabel : styles.regLabel}>
            Registration
          </Text>
          <Text style={styles.formatHint}>{formatHint}</Text>

          <View style={styles.formatMaskRow}>
            {["AA", "00", "AA", "0000"].map((seg, i) => (
              <Text
                key={seg}
                style={[
                  styles.formatMaskSeg,
                  normLen >= [2, 4, 6, 10][i] && styles.formatMaskSegDone,
                ]}
              >
                {seg}
              </Text>
            ))}
          </View>

          <Pressable
            onPress={() => {
              if (!isDesktopWeb || typeof window === "undefined") return;
              window.focus();
            }}
            disabled={!isDesktopWeb}
            style={({ pressed }) => [
              styles.displayRow,
              error && styles.displayRowError,
              isDesktopWeb && pressed && styles.displayRowPressed,
            ]}
            accessibilityRole={isDesktopWeb ? "button" : undefined}
            accessibilityLabel={
              isDesktopWeb
                ? "Vehicle registration. Type letters or numbers with your keyboard."
                : displayValue || "Vehicle registration number"
            }
          >
            <Truck size={20} color={Theme.iconMuted} style={styles.leadingIcon} />
            <Text
              style={[
                styles.displayValue,
                displayMono,
                !displayValue && styles.displayPlaceholder,
              ]}
              numberOfLines={1}
              accessibilityLabel={
                displayValue || "Vehicle registration number"
              }
            >
              {displayValue || "TN 01 CM 2026"}
            </Text>
            {showCursor ? <View style={styles.cursor} /> : null}
          </Pressable>
        </View>

        <View style={[styles.keypadDock, wizardShell && flow.keypadDockWizard]}>
          <IndianVehicleRegistrationKeypad
            kind={keyboardKind}
            onKey={handleKey}
            normalizedLength={normLen}
          />
        </View>
      </View>
    );
  },
);

const displayMono = Platform.select({
  ios: { fontFamily: "Menlo" as const },
  android: { fontFamily: "monospace" as const },
  web: {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" as const,
  },
  default: {},
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    justifyContent: "space-between",
  },
  main: {
    flexShrink: 1,
    minHeight: 0,
    gap: 0,
  },
  mainWizard: {
    paddingHorizontal: 0,
  },
  regLabel: {
    color: Theme.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    marginBottom: 6,
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
    marginBottom: 12,
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
  displayRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "web" ? 14 : 16,
    minHeight: 56,
    backgroundColor: Theme.surfaceForm,
  },
  displayRowError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
    backgroundColor: "#fef2f2",
  },
  displayRowPressed: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  leadingIcon: {
    marginRight: 10,
  },
  displayValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: Theme.textPrimaryDark,
  },
  displayPlaceholder: {
    color: Theme.textMuted,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  cursor: {
    width: 2,
    height: 22,
    borderRadius: 1,
    backgroundColor: Theme.positive,
    marginLeft: 4,
  },
  keypadDock: {
    flexShrink: 0,
    alignSelf: "stretch",
    width: "100%",
    paddingTop: 10,
    paddingBottom: 4,
    marginHorizontal: -Layout.screenPaddingHorizontal,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: "transparent",
  },
});

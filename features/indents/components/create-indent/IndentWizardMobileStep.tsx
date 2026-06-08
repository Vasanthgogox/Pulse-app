/**
 * Create Load mobile wizard — vehicle / load type / weight fields.
 * Shell owns title, subtitle, and progress; this renders the field only.
 */
import { memo, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { ChevronRight } from "lucide-react-native";

import { fullPageWizardStyles as wizard } from "@/components/full-page-wizard";
import Theme from "@/constants/Theme";
import type { IndentWizardStep } from "./createIndentWizardSteps";

function stepFieldLabel(step: IndentWizardStep): string {
  switch (step) {
    case "vehicle":
      return "Vehicle type";
    case "loadType":
      return "Load type";
    case "weight":
      return "Weight (tons)";
    default:
      return "";
  }
}

export interface IndentWizardMobileStepProps {
  step: IndentWizardStep;
  mode: "picker" | "text";
  value: string;
  placeholder?: string;
  onPressPicker?: () => void;
  onChangeText?: (value: string) => void;
  hasError?: boolean;
  inputRef?: React.RefObject<TextInputType | null>;
  keyboardType?: "default" | "decimal-pad";
  footerExtra?: ReactNode;
}

export const IndentWizardMobileStep = memo(function IndentWizardMobileStep({
  step,
  mode,
  value,
  placeholder,
  onPressPicker,
  onChangeText,
  hasError = false,
  inputRef,
  keyboardType = "default",
  footerExtra,
}: IndentWizardMobileStepProps) {
  const label = stepFieldLabel(step);

  return (
    <View style={styles.root}>
      <View style={wizard.wizardFieldBlock}>
        <Text style={wizard.wizardFieldLabel}>{label}</Text>

        {mode === "picker" ? (
          <Pressable
            style={[
              wizard.wizardPickerBtn,
              !value.trim() && wizard.wizardPickerBtnEmpty,
              hasError && styles.inputError,
            ]}
            onPress={onPressPicker}
            accessibilityRole="button"
          >
            <Text
              style={[
                wizard.wizardPickerBtnText,
                !value.trim() && wizard.wizardPickerBtnPlaceholder,
              ]}
              numberOfLines={2}
            >
              {value.trim() || placeholder || "Tap to select"}
            </Text>
            <ChevronRight size={18} color={Theme.iconPrimary} />
          </Pressable>
        ) : (
          <TextInput
            ref={inputRef}
            style={[
              wizard.wizardFieldInput,
              hasError && styles.inputError,
              Platform.OS === "web" && styles.webInput,
            ]}
            placeholder={placeholder ?? "0"}
            placeholderTextColor={Theme.textMuted}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            autoFocus
          />
        )}
      </View>

      {footerExtra}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
    gap: 10,
  },
  inputError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
    backgroundColor: "rgba(254, 242, 242, 0.45)",
  },
  webInput: {
    outlineStyle: "none",
  } as object,
});

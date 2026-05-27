/**
 * Full-screen-style wizard step for Create Indent (mobile).
 * Matches party / Add Trip aggregate tracking density.
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

import Theme from "@/constants/Theme";
import { partyMobileWizardStyles as wizard } from "@/components/party/partyMobileWizardStyles";
import type { IndentWizardStep } from "./createIndentWizardSteps";
import { INDENT_WIZARD_STEPS } from "./createIndentWizardSteps";

const LOAD_STEPS: IndentWizardStep[] = ["vehicle", "loadType", "weight"];

function stepMeta(step: IndentWizardStep): {
  title: string;
  hint: string;
  label: string;
} {
  switch (step) {
    case "vehicle":
      return {
        title: "Vehicle type",
        hint: "Choose a category or enter a custom vehicle.",
        label: "VEHICLE",
      };
    case "loadType":
      return {
        title: "Load type",
        hint: "Select the cargo category for this indent.",
        label: "LOAD TYPE",
      };
    case "weight":
      return {
        title: "Load weight",
        hint: "Enter weight in metric tons.",
        label: "WEIGHT (TONS)",
      };
    default:
      return { title: "", hint: "", label: "" };
  }
}

export interface IndentWizardMobileStepProps {
  step: IndentWizardStep;
  /** Picker-style step: show large button + current value. */
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
  const { title, hint, label } = stepMeta(step);
  const progressSteps = LOAD_STEPS;
  const stepIdx = progressSteps.indexOf(step);

  return (
    <View style={styles.root}>
      {stepIdx >= 0 ? (
        <View style={styles.progressRow}>
          {progressSteps.map((s, i) => (
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
      ) : null}

      <Text style={wizard.stepTitle}>{title}</Text>
      <Text style={wizard.stepHint}>{hint}</Text>

      <View style={wizard.fieldBlock}>
        <Text style={wizard.fieldLabel}>{label}</Text>

        {mode === "picker" ? (
          <Pressable
            style={[
              styles.pickerBtn,
              hasError && styles.inputError,
              !value.trim() && styles.pickerBtnEmpty,
            ]}
            onPress={onPressPicker}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.pickerBtnText,
                !value.trim() && styles.pickerBtnPlaceholder,
              ]}
              numberOfLines={2}
            >
              {value.trim() || placeholder || "Tap to select"}
            </Text>
            <ChevronRight size={22} color={Theme.iconPrimary} />
          </Pressable>
        ) : (
          <TextInput
            ref={inputRef}
            style={[wizard.input, hasError && styles.inputError]}
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
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "web" ? 16 : 18,
    backgroundColor: "#f8fafc",
    minHeight: 56,
  },
  pickerBtnEmpty: {
    borderStyle: "dashed",
  },
  pickerBtnText: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: Theme.textPrimary,
    lineHeight: 22,
  },
  pickerBtnPlaceholder: {
    color: Theme.textMuted,
    fontWeight: "500",
  },
  inputError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
    backgroundColor: "#fef2f2",
  },
});

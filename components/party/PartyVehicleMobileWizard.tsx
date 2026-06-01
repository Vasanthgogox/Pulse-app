/**
 * Full-screen step-by-step vehicle wizard (mobile / narrow).
 */
import { memo, useCallback, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import Theme from "@/constants/Theme";
import { IndianVehicleRegistrationKeypadFlow } from "@/components/indianVehicle/IndianVehicleRegistrationKeypadFlow";
import { VEHICLE_CATEGORY_LABELS } from "@/features/vehicles/utils/vehicleFormOptions.util";
import { PartyMobileWizardShell } from "./PartyMobileWizardShell";
import { partyMobileWizardStyles as styles } from "./partyMobileWizardStyles";

export type PartyVehicleWizardStep =
  | "registration"
  | "category"
  | "model"
  | "specs";

export const VEHICLE_WIZARD_STEPS: PartyVehicleWizardStep[] = [
  "registration",
  "category",
  "model",
  "specs",
];

function stepIndex(step: PartyVehicleWizardStep): number {
  return VEHICLE_WIZARD_STEPS.indexOf(step);
}

export interface PartyVehicleMobileWizardProps {
  entityTitle: string;
  wizardStep: PartyVehicleWizardStep;
  onWizardStepChange: (step: PartyVehicleWizardStep) => void;
  onClose: () => void;

  vehicleReg: string;
  onVehicleRegChange: (value: string) => void;
  vehicleCategory: string;
  onVehicleCategoryChange: (value: string) => void;
  vehicleModel: string;
  onVehicleModelChange: (value: string) => void;
  modelIsOther: boolean;
  onOpenModelPicker: () => void;
  onChooseModelFromList: () => void;
  vehicleCapacity: string;
  onVehicleCapacityChange: (value: string) => void;
  vehicleBodyFt: string;
  onVehicleBodyFtChange: (value: string) => void;
  bodyLengthIsOther: boolean;
  onOpenBodyLengthPicker: () => void;
  onChooseBodyLengthFromList: () => void;
  vehicleAxle: string;
  onVehicleAxleChange: (value: string) => void;
  capacityHint?: ReactNode;
  axleHint?: ReactNode;

  formError: string | null;
  noOrganizationBanner?: ReactNode;

  canAdvance: boolean;
  onAdvance: () => void;
  advanceLabel?: string;
}

export const PartyVehicleMobileWizard = memo(function PartyVehicleMobileWizard({
  entityTitle,
  wizardStep,
  onWizardStepChange,
  onClose,
  vehicleReg,
  onVehicleRegChange,
  vehicleCategory,
  onVehicleCategoryChange,
  vehicleModel,
  onVehicleModelChange,
  modelIsOther,
  onOpenModelPicker,
  onChooseModelFromList,
  vehicleCapacity,
  onVehicleCapacityChange,
  vehicleBodyFt,
  onVehicleBodyFtChange,
  bodyLengthIsOther,
  onOpenBodyLengthPicker,
  onChooseBodyLengthFromList,
  vehicleAxle,
  onVehicleAxleChange,
  capacityHint,
  axleHint,
  formError,
  noOrganizationBanner,
  canAdvance,
  onAdvance,
  advanceLabel = "Continue",
}: PartyVehicleMobileWizardProps) {
  const isRegistrationStep = wizardStep === "registration";

  const handleBack = useCallback(() => {
    const idx = stepIndex(wizardStep);
    if (idx <= 0) {
      onClose();
      return;
    }
    onWizardStepChange(VEHICLE_WIZARD_STEPS[idx - 1]!);
  }, [wizardStep, onClose, onWizardStepChange]);

  const stepTitle = (() => {
    switch (wizardStep) {
      case "registration":
        return "Vehicle number";
      case "category":
        return "Vehicle category";
      case "model":
        return "Type & model";
      case "specs":
        return "Load & dimensions";
      default:
        return "";
    }
  })();

  const stepHint = (() => {
    switch (wizardStep) {
      case "registration":
        return "Indian registration format, e.g. TN 01 CM 2026.";
      case "category":
        return "Pick the category that best matches this truck.";
      case "model":
        return "Choose from presets or type a custom model.";
      case "specs":
        return "Capacity, body length, and optional axle configuration.";
      default:
        return "";
    }
  })();

  const stepBody = (() => {
    switch (wizardStep) {
      case "registration":
        return (
          <IndianVehicleRegistrationKeypadFlow
            value={vehicleReg}
            onChangeText={onVehicleRegChange}
            error={Boolean(formError)}
            testID="party-vehicle-reg-input"
          />
        );
      case "category":
        return (
          <View style={styles.chipGrid}>
            {VEHICLE_CATEGORY_LABELS.map((cat) => (
              <Pressable
                key={cat}
                style={[
                  styles.chip,
                  vehicleCategory === cat && styles.chipActive,
                ]}
                onPress={() => onVehicleCategoryChange(cat)}
                testID={`party-vehicle-category-${cat}`}
              >
                <Text
                  style={[
                    styles.chipText,
                    vehicleCategory === cat && styles.chipTextActive,
                  ]}
                  numberOfLines={2}
                >
                  {cat}
                </Text>
              </Pressable>
            ))}
          </View>
        );
      case "model":
        return (
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>MODEL</Text>
            {modelIsOther ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. BharatBenz 3523R"
                  placeholderTextColor={Theme.textMuted}
                  value={vehicleModel}
                  onChangeText={onVehicleModelChange}
                  autoFocus
                  testID="party-vehicle-model-input"
                />
                <Pressable onPress={onChooseModelFromList} style={styles.skipLink}>
                  <Text style={[styles.skipLinkText, { color: Theme.primary }]}>
                    Choose from list instead
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={[styles.input, styles.presetPress]}
                onPress={onOpenModelPicker}
                testID="party-vehicle-model-picker"
              >
                <Text
                  style={
                    vehicleModel.trim()
                      ? styles.presetValue
                      : styles.presetPlaceholder
                  }
                  numberOfLines={2}
                >
                  {vehicleModel.trim()
                    ? vehicleModel
                    : "Tap to select model"}
                </Text>
              </Pressable>
            )}
          </View>
        );
      case "specs":
        return (
          <View style={{ gap: 20 }}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>LOAD CAPACITY</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 7.5 or 20 tons"
                placeholderTextColor={Theme.textMuted}
                keyboardType="decimal-pad"
                value={vehicleCapacity}
                onChangeText={onVehicleCapacityChange}
                autoFocus
                testID="party-vehicle-capacity-input"
              />
              {capacityHint}
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>BODY LENGTH (FT)</Text>
              {bodyLengthIsOther ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 28 or 32 ft"
                    placeholderTextColor={Theme.textMuted}
                    value={vehicleBodyFt}
                    onChangeText={onVehicleBodyFtChange}
                    testID="party-vehicle-body-input"
                  />
                  <Pressable
                    onPress={onChooseBodyLengthFromList}
                    style={styles.skipLink}
                  >
                    <Text
                      style={[styles.skipLinkText, { color: Theme.primary }]}
                    >
                      Choose from list instead
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={[styles.input, styles.presetPress]}
                  onPress={onOpenBodyLengthPicker}
                  testID="party-vehicle-body-picker"
                >
                  <Text
                    style={
                      vehicleBodyFt.trim()
                        ? styles.presetValue
                        : styles.presetPlaceholder
                    }
                    numberOfLines={2}
                  >
                    {vehicleBodyFt.trim()
                      ? vehicleBodyFt
                      : "Tap to choose body length"}
                  </Text>
                </Pressable>
              )}
            </View>
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>AXLE</Text>
                <Text style={styles.optionalPill}>OPTIONAL</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. 6×4"
                placeholderTextColor={Theme.textMuted}
                value={vehicleAxle}
                onChangeText={onVehicleAxleChange}
                testID="party-vehicle-axle-input"
              />
              {axleHint}
            </View>
          </View>
        );
      default:
        return null;
    }
  })();

  return (
    <PartyMobileWizardShell
      entityTitle={entityTitle}
      stepIds={VEHICLE_WIZARD_STEPS}
      currentStep={wizardStep}
      onStepBack={handleBack}
      onClose={onClose}
      stepTitle={stepTitle}
      stepHint={stepHint}
      bodyLayout={isRegistrationStep ? "keypad" : "default"}
      formError={formError}
      noOrganizationBanner={noOrganizationBanner}
      canAdvance={canAdvance}
      onAdvance={onAdvance}
      advanceLabel={advanceLabel}
    >
      {stepBody}
    </PartyMobileWizardShell>
  );
});

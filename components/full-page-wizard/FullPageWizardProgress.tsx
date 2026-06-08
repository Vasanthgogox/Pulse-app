import { memo } from "react";
import { Text, View } from "react-native";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

export type FullPageWizardProgressStep = {
  id: string;
  label: string;
};

export interface FullPageWizardProgressProps {
  steps: readonly FullPageWizardProgressStep[];
  currentStepId: string;
}

export const FullPageWizardProgress = memo(function FullPageWizardProgress({
  steps,
  currentStepId,
}: FullPageWizardProgressProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === currentStepId),
  );

  return (
    <View style={styles.wizardStepRow}>
      {steps.map((step, idx) => {
        const active = idx === currentIndex;
        const done = idx < currentIndex;
        return (
          <View key={step.id} style={styles.wizardStepItem}>
            <View
              style={[
                styles.wizardStepCircle,
                active && styles.wizardStepCircleActive,
                done && styles.wizardStepCircleDone,
              ]}
            >
              <Text
                style={[
                  styles.wizardStepCircleText,
                  (active || done) && styles.wizardStepCircleTextActive,
                ]}
              >
                {idx + 1}
              </Text>
            </View>
            <Text
              style={[styles.wizardStepText, active && styles.wizardStepTextActive]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

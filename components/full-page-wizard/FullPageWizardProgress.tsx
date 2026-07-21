import { Check } from "lucide-react-native";
import { MotiView } from "moti";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { Easing } from "react-native-reanimated";

import Theme from "@/constants/Theme";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

export type FullPageWizardProgressStep = {
  id: string;
  label: string;
};

export interface FullPageWizardProgressProps {
  steps: readonly FullPageWizardProgressStep[];
  currentStepId: string;
  /** Jump back to a completed / current step. */
  onStepPress?: (stepId: string, index: number) => void;
}

const STEP_EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const FullPageWizardProgress = memo(function FullPageWizardProgress({
  steps,
  currentStepId,
  onStepPress,
}: FullPageWizardProgressProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === currentStepId),
  );
  const progressPct =
    steps.length <= 1 ? 0 : (currentIndex / (steps.length - 1)) * 100;

  return (
    <View style={styles.wizardStepTrackWrap} accessibilityRole="progressbar">
      <View style={styles.wizardStepTrack}>
        <View style={[styles.wizardStepTrackFill, { width: `${progressPct}%` }]} />
      </View>
      <View style={styles.wizardStepRow}>
        {steps.map((step, idx) => {
          const active = idx === currentIndex;
          const done = idx < currentIndex;
          const canPress = Boolean(onStepPress) && idx <= currentIndex;
          const circle = (
            <>
              <MotiView
                animate={{
                  backgroundColor: active
                    ? Theme.surfaceBorder
                    : done
                      ? Theme.positiveMuted
                      : "transparent",
                  padding: active || done ? 2 : 0,
                }}
                transition={{ type: "timing", duration: 220, easing: STEP_EASE }}
                style={{
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MotiView
                  animate={{
                    backgroundColor: done
                      ? Theme.positive
                      : active
                        ? Theme.textPrimaryDark
                        : Theme.surfaceGray,
                    borderColor: done
                      ? Theme.positive
                      : active
                        ? Theme.textPrimaryDark
                        : Theme.borderLight,
                    scale: active ? 1.02 : 1,
                  }}
                  transition={{ type: "timing", duration: 220, easing: STEP_EASE }}
                  style={[
                    styles.wizardStepCircle,
                    active && styles.wizardStepCircleActive,
                    done && styles.wizardStepCircleDone,
                  ]}
                >
                  {done ? (
                    <MotiView
                      key={`m-chk-${step.id}`}
                      from={{ opacity: 0, scale: 0.55 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        type: "timing",
                        duration: 180,
                        easing: STEP_EASE,
                      }}
                    >
                      <Check
                        size={11}
                        color={Theme.textOnPrimary}
                        strokeWidth={2.75}
                      />
                    </MotiView>
                  ) : (
                    <Text
                      style={[
                        styles.wizardStepCircleText,
                        active && styles.wizardStepCircleTextActive,
                      ]}
                    >
                      {idx + 1}
                    </Text>
                  )}
                </MotiView>
              </MotiView>
              <Text
                style={[
                  styles.wizardStepText,
                  active && styles.wizardStepTextActive,
                  done && styles.wizardStepTextDone,
                ]}
                numberOfLines={1}
              >
                {step.label}
              </Text>
            </>
          );
          return canPress ? (
            <Pressable
              key={step.id}
              style={styles.wizardStepItem}
              onPress={() => onStepPress?.(step.id, idx)}
              accessibilityRole="button"
              accessibilityLabel={`Go to ${step.label}`}
              hitSlop={6}
            >
              {circle}
            </Pressable>
          ) : (
            <View key={step.id} style={styles.wizardStepItem}>
              {circle}
            </View>
          );
        })}
      </View>
    </View>
  );
});

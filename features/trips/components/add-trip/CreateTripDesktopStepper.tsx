import { Check } from "lucide-react-native";
import { MotiView } from "moti";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Easing } from "react-native-reanimated";

import Theme from "@/constants/Theme";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";

export type CreateTripDesktopStep = {
  id: string;
  num: number;
  title: string;
};

export type CreateTripDesktopStepperProps = {
  steps: readonly CreateTripDesktopStep[];
  currentStepId: string;
  /** Jump to a completed / current step (HTML goToStep parity). */
  onStepPress?: (stepId: string, index: number) => void;
};

const STEP_EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const CreateTripDesktopStepper = memo(function CreateTripDesktopStepper({
  steps,
  currentStepId,
  onStepPress,
}: CreateTripDesktopStepperProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepId),
  );
  const progressPct =
    steps.length <= 1 ? 0 : (currentIndex / (steps.length - 1)) * 100;

  return (
    <View style={s.stepperWrap}>
      <View style={s.stepperTrack}>
        <View style={[s.stepperTrackFill, { width: `${progressPct}%` }]} />
      </View>
      <View style={s.stepperRow}>
        {steps.map((step, idx) => {
          const active = idx === currentIndex;
          const done = idx < currentIndex;
          const canPress = Boolean(onStepPress) && idx <= currentIndex;

          const circle = (
            <MotiView
              animate={{
                backgroundColor: done
                  ? Theme.positive
                  : active
                    ? Theme.accentBrown
                    : Theme.surfaceGray,
                borderColor: done
                  ? Theme.positive
                  : active
                    ? Theme.accentBrown
                    : Theme.borderLight,
                scale: active ? 1.02 : 1,
              }}
              transition={{ type: "timing", duration: 240, easing: STEP_EASE }}
              style={[s.stepperCircle, active && s.stepperCircleActiveShadow]}
            >
              {done ? (
                <MotiView
                  key={`chk-${step.id}-${idx}`}
                  from={{ opacity: 0, scale: 0.55 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "timing", duration: 200, easing: STEP_EASE }}
                >
                  <Check size={12} color={Theme.textOnPrimary} strokeWidth={2.75} />
                </MotiView>
              ) : (
                <Text
                  style={[
                    s.stepperCircleText,
                    active && s.stepperCircleTextActive,
                  ]}
                >
                  {step.num}
                </Text>
              )}
            </MotiView>
          );

          const content = (
            <View style={s.stepperItem}>
              <MotiView
                animate={{
                  backgroundColor: active
                    ? Theme.surfaceBorder
                    : done
                      ? Theme.positiveMuted
                      : "transparent",
                  padding: active || done ? 3 : 0,
                }}
                transition={{ type: "timing", duration: 240, easing: STEP_EASE }}
                style={s.stepperCircleRing}
              >
                {circle}
              </MotiView>
              <Text
                style={[
                  s.stepperLabel,
                  active && s.stepperLabelActive,
                  done && s.stepperLabelDone,
                ]}
                numberOfLines={1}
              >
                {step.title.toUpperCase()}
              </Text>
            </View>
          );

          if (!canPress) {
            return (
              <View key={step.id} style={s.stepperItemHit}>
                {content}
              </View>
            );
          }

          return (
            <Pressable
              key={step.id}
              style={[
                s.stepperItemHit,
                Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null,
              ]}
              onPress={() => onStepPress?.(step.id, idx)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${step.title} step`}
            >
              {content}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

import { Check } from "lucide-react-native";
import { memo } from "react";
import { Text, View } from "react-native";

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
};

export const CreateTripDesktopStepper = memo(function CreateTripDesktopStepper({
  steps,
  currentStepId,
}: CreateTripDesktopStepperProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepId),
  );

  return (
    <View style={s.stepperWrap}>
      <View style={s.stepperTrack} />
      <View style={s.stepperRow}>
        {steps.map((step, idx) => {
          const active = idx === currentIndex;
          const done = idx < currentIndex;
          return (
            <View key={step.id} style={s.stepperItem}>
              <View
                style={[
                  s.stepperCircle,
                  active && s.stepperCircleActive,
                  done && s.stepperCircleDone,
                ]}
              >
                {done ? (
                  <Check size={16} color={Theme.darkGreen} strokeWidth={2.5} />
                ) : (
                  <Text
                    style={[
                      s.stepperCircleText,
                      active && s.stepperCircleTextActive,
                      done && s.stepperCircleTextDone,
                    ]}
                  >
                    {step.num}
                  </Text>
                )}
              </View>
              <Text
                style={[s.stepperLabel, active && s.stepperLabelActive]}
                numberOfLines={1}
              >
                {step.title}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

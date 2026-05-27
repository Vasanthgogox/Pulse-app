import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MotiView } from "moti";

import { PULSE_TRIP, PULSE_TRIP_RADIUS } from "./addTripPulseTheme";

export type AddTripWizardProgressStep = {
  id: string;
  label: string;
};

export interface AddTripWizardProgressProps {
  steps: readonly AddTripWizardProgressStep[];
  currentStepId: string;
}

export const AddTripWizardProgress = memo(function AddTripWizardProgress({
  steps,
  currentStepId,
}: AddTripWizardProgressProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === currentStepId),
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {steps.map((step, i) => {
          const active = i === currentIndex;
          const done = i < currentIndex;
          return (
            <View key={step.id} style={styles.item}>
              <MotiView
                animate={{
                  width: active ? 28 : done ? 14 : 8,
                  backgroundColor: active || done ? PULSE_TRIP.indigo : "#e2e8f0",
                  opacity: done && !active ? 0.5 : 1,
                }}
                transition={{ type: "timing", duration: 320 }}
                style={styles.bar}
              />
              <MotiView
                animate={{
                  opacity: active ? 1 : 0.65,
                  translateY: active ? 0 : 1,
                }}
                transition={{ type: "timing", duration: 280 }}
              >
                <Text
                  style={[
                    styles.label,
                    active && styles.labelActive,
                    done && styles.labelDone,
                  ]}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
              </MotiView>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 4,
    paddingBottom: 12,
    paddingTop: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PULSE_TRIP.border,
    paddingTop: 14,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    paddingHorizontal: 2,
  },
  bar: {
    height: 4,
    borderRadius: PULSE_TRIP_RADIUS.badge,
  },
  label: {
    fontSize: 9,
    fontWeight: "600",
    color: PULSE_TRIP.textMuted,
    letterSpacing: 0.3,
    textAlign: "center",
  },
  labelActive: {
    color: PULSE_TRIP.indigo,
    fontWeight: "800",
  },
  labelDone: {
    color: PULSE_TRIP.indigo,
  },
});

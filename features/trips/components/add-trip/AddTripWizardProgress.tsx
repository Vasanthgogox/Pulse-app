import { memo } from "react";
import { Platform, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { PULSE_TRIP } from "./addTripPulseTheme";

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
            <View
              key={step.id}
              style={[
                styles.item,
                active && styles.itemActive,
                done && !active && styles.itemDone,
              ]}
            >
              <Text
                style={[
                  styles.label,
                  active && styles.labelActive,
                  done && !active && styles.labelDone,
                ]}
                numberOfLines={1}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    paddingTop: 4,
    backgroundColor: PULSE_TRIP.cardBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_TRIP.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 4,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    marginBottom: -StyleSheet.hairlineWidth,
    ...Platform.select({
      web: { cursor: "default" } as ViewStyle,
      default: {},
    }),
  },
  itemActive: {
    borderBottomColor: PULSE_TRIP.indigo,
  },
  itemDone: {
    borderBottomColor: "rgba(99, 102, 241, 0.35)",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: PULSE_TRIP.textMuted,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  labelActive: {
    color: PULSE_TRIP.indigo,
    fontWeight: "800",
  },
  labelDone: {
    color: PULSE_TRIP.indigo,
    fontWeight: "700",
    opacity: 0.75,
  },
});

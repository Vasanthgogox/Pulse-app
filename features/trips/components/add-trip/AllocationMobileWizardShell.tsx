/**
 * Mobile Create Trip — allocation sub-steps (one screen at a time, flex-safe).
 * Keeps sub-step tabs edge-aligned and separates scroll steps from keypad fill steps.
 */
import { memo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import Layout from "@/constants/Layout";
import {
  AddTripWizardProgress,
  type AddTripWizardProgressStep,
} from "@/features/trips/components/add-trip/AddTripWizardProgress";

export interface AllocationMobileWizardShellProps {
  progressSteps: readonly AddTripWizardProgressStep[];
  currentStepId: string;
  /** Keypad steps: flex column, no outer scroll. */
  fillBody?: boolean;
  children: ReactNode;
}

export const AllocationMobileWizardShell = memo(function AllocationMobileWizardShell({
  progressSteps,
  currentStepId,
  fillBody = false,
  children,
}: AllocationMobileWizardShellProps) {
  return (
    <View style={styles.root}>
      {progressSteps.length > 0 ? (
        <View style={styles.progressBleed}>
          <AddTripWizardProgress
            steps={progressSteps}
            currentStepId={currentStepId}
          />
        </View>
      ) : null}
      <View style={[styles.stage, fillBody && styles.stageFill]}>{children}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  progressBleed: {
    marginHorizontal: -Layout.screenPaddingHorizontal,
    marginBottom: 4,
  },
  stage: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    paddingTop: 8,
  },
  stageFill: {
    paddingTop: 4,
  },
});

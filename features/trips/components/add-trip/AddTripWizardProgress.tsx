import { memo } from "react";

import {
  FullPageWizardProgress,
  type FullPageWizardProgressStep,
} from "@/components/full-page-wizard";

export type AddTripWizardProgressStep = FullPageWizardProgressStep;

export interface AddTripWizardProgressProps {
  steps: readonly AddTripWizardProgressStep[];
  currentStepId: string;
  /** Jump back to a completed / current step. */
  onStepPress?: (stepId: string, index: number) => void;
  /** @deprecated Light wizard uses one style globally */
  surface?: "pulse" | "slate";
}

export const AddTripWizardProgress = memo(function AddTripWizardProgress({
  steps,
  currentStepId,
  onStepPress,
}: AddTripWizardProgressProps) {
  return (
    <FullPageWizardProgress
      steps={steps}
      currentStepId={currentStepId}
      onStepPress={onStepPress}
    />
  );
});

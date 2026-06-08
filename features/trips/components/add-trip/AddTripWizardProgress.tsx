import { memo } from "react";

import {
  FullPageWizardProgress,
  type FullPageWizardProgressStep,
} from "@/components/full-page-wizard";

export type AddTripWizardProgressStep = FullPageWizardProgressStep;

export interface AddTripWizardProgressProps {
  steps: readonly AddTripWizardProgressStep[];
  currentStepId: string;
  /** @deprecated Light wizard uses one style globally */
  surface?: "pulse" | "slate";
}

export const AddTripWizardProgress = memo(function AddTripWizardProgress({
  steps,
  currentStepId,
}: AddTripWizardProgressProps) {
  return <FullPageWizardProgress steps={steps} currentStepId={currentStepId} />;
});

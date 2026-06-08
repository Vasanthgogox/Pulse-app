/**
 * Create Trip / Create Load — full-page light wizard shell (attribution-style).
 */
import type { ReactNode } from "react";

import {
  FullPageWizardFooter,
  FullPageWizardShell,
  type WizardInsightPreset,
} from "@/components/full-page-wizard";

export interface AddTripModalLayoutProps {
  title: string;
  subtitle?: string;
  submitLabel: string;
  canSubmit: boolean;
  lockPrimaryUntilValid?: boolean;
  validationMessage?: string | null;
  submitting?: boolean;
  showFooter?: boolean;
  showHeaderActions?: boolean;
  primaryActionMode?: "auto" | "header" | "footer" | "content";
  stepIndex?: number;
  stepTotal?: number;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
  progress?: ReactNode;
  fillBody?: boolean;
  /** Shell ScrollView for step content (avoids nested scroll on mobile wizards). */
  scrollBody?: boolean;
  insightPreset?: WizardInsightPreset;
  contextPanel?: ReactNode;
  tertiaryLabel?: string;
  onTertiaryPress?: () => void;
  tertiaryDisabled?: boolean;
}

export function AddTripModalLayout({
  title,
  subtitle,
  submitLabel,
  canSubmit,
  lockPrimaryUntilValid = true,
  validationMessage = null,
  submitting = false,
  showFooter = true,
  primaryActionMode = "auto",
  stepIndex,
  stepTotal,
  onClose,
  onSubmit,
  children,
  progress,
  fillBody = false,
  scrollBody = false,
  insightPreset = "trip",
  contextPanel,
  tertiaryLabel,
  onTertiaryPress,
  tertiaryDisabled = false,
}: AddTripModalLayoutProps) {
  const shouldShowFooter =
    primaryActionMode === "footer"
      ? true
      : primaryActionMode === "header" || primaryActionMode === "content"
        ? false
        : showFooter;

  const submitDisabled =
    submitting || (lockPrimaryUntilValid ? !canSubmit : false);

  return (
    <FullPageWizardShell
      title={title}
      subtitle={subtitle}
      stepIndex={stepIndex}
      stepTotal={stepTotal}
      onBack={onClose}
      backLabel={
        stepIndex != null && stepIndex > 1 ? "← Back" : "← Close"
      }
      progress={progress}
      fillBody={fillBody}
      scrollBody={scrollBody}
      insightPreset={insightPreset}
      contextPanel={contextPanel}
      footer={
        shouldShowFooter ? (
          <FullPageWizardFooter
            secondaryLabel={
              stepIndex != null && stepIndex > 1 ? "Back" : "Close"
            }
            onSecondaryPress={onClose}
            tertiaryLabel={tertiaryLabel}
            onTertiaryPress={onTertiaryPress}
            tertiaryDisabled={tertiaryDisabled || submitting}
            primaryLabel={submitting ? "Saving…" : submitLabel}
            onPrimaryPress={onSubmit}
            primaryDisabled={submitDisabled}
            loading={submitting}
            hint={
              submitDisabled && !submitting
                ? validationMessage ?? "Fill required fields to continue"
                : null
            }
          />
        ) : undefined
      }
    >
      {children}
    </FullPageWizardShell>
  );
}

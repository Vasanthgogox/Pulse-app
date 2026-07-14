/**
 * Shared full-screen shell for trip / indent allocation wizards.
 * Uses the global light full-page wizard chrome.
 */
import type { ReactNode } from "react";

import {
  FullPageWizardFooter,
  FullPageWizardShell,
} from "@/components/full-page-wizard";

export interface AssignmentFlowShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  showBack?: boolean;
  progress?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** @deprecated All flows use light wizard */
  variant?: "pulse" | "slate";
  submitting?: boolean;
  fullScreen?: boolean;
  fillBody?: boolean;
  stepIndex?: number;
  stepTotal?: number;
  /** Shell ScrollView for step content (mobile allocation wizards). */
  scrollBody?: boolean;
  insightPreset?: "trip" | "load" | "attribution" | "allocation";
  /** Stepped wizard chrome on wide desktop (allocation / reassign flows). */
  steppedLayout?: boolean;
}

export function AssignmentFlowShell({
  title,
  subtitle,
  onClose,
  onBack,
  showBack = false,
  progress,
  children,
  footer,
  submitting = false,
  fillBody = false,
  stepIndex,
  stepTotal,
  scrollBody = false,
  insightPreset = "allocation",
  steppedLayout = false,
}: AssignmentFlowShellProps) {
  return (
    <FullPageWizardShell
      title={title}
      subtitle={subtitle}
      stepIndex={stepIndex}
      stepTotal={stepTotal}
      onBack={showBack && onBack ? onBack : onClose}
      backLabel={showBack ? "← Back" : "← Close"}
      progress={progress}
      fillBody={fillBody}
      scrollBody={scrollBody}
      insightPreset={insightPreset}
      steppedLayout={steppedLayout}
      footer={footer}
    >
      {submitting ? children : children}
    </FullPageWizardShell>
  );
}

/** Re-export footer helper for allocation flows */
export { FullPageWizardFooter as AssignmentFlowWizardFooter };

import { FullPageWizardFooter } from "@/components/full-page-wizard";

export interface AssignmentFlowFooterProps {
  summary?: string;
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  loading?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
}

export function AssignmentFlowFooter({
  summary,
  primaryLabel,
  onPrimaryPress,
  primaryDisabled = false,
  loading = false,
  secondaryLabel,
  onSecondaryPress,
}: AssignmentFlowFooterProps) {
  return (
    <FullPageWizardFooter
      summary={summary}
      primaryLabel={primaryLabel}
      onPrimaryPress={onPrimaryPress}
      primaryDisabled={primaryDisabled}
      loading={loading}
      secondaryLabel={secondaryLabel}
      onSecondaryPress={onSecondaryPress}
    />
  );
}

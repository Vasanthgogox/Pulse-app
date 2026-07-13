import type { FlowBranch, FlowStep } from '@/lib/flowStep.types';
import { BranchStepsEmbed } from '@/components/BranchStepsEmbed';
import { FlowStepCard } from '@/components/FlowStepCard';
import { FlowStepConnector } from '@/components/FlowStepConnector';

function LinearSection({
  steps,
  selectedStepId,
  onSelectStep,
  label,
}: {
  steps: FlowStep[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  label?: string;
}) {
  if (steps.length === 0) return null;
  return (
    <div className="flow-linear-section">
      {label ? <div className="flow-section-label">{label}</div> : null}
      {steps.map((step, i) => (
        <div key={step.id} className="flow-shared-row">
          {i > 0 ? <FlowStepConnector fromStep={steps[i - 1]!} /> : null}
          <FlowStepCard step={step} selected={selectedStepId === step.id} onSelect={onSelectStep} showTableChips={false} />
        </div>
      ))}
    </div>
  );
}

export function WizardFlowEmbed({
  prefixSteps,
  allocationBranches,
  submitBranches,
  suffixSteps,
  expandedBranches,
  selectedStepId,
  onToggleBranch,
  onSelectStep,
  entryTitle,
  entryRoute,
  entryScreen,
  allocationHint,
  submitHint,
  suffixLabel,
}: {
  prefixSteps?: FlowStep[];
  allocationBranches?: FlowBranch[];
  submitBranches?: FlowBranch[];
  suffixSteps?: FlowStep[];
  expandedBranches: Set<string>;
  selectedStepId: string | null;
  onToggleBranch: (branchId: string) => void;
  onSelectStep: (stepId: string) => void;
  entryTitle?: string;
  entryRoute?: string;
  entryScreen?: string;
  allocationHint?: string;
  submitHint?: string;
  suffixLabel?: string;
}) {
  return (
    <div className="flow-wizard-embed">
      {entryTitle ? (
        <div className="flow-wizard-entry">
          <div className="flow-wizard-entry-title">{entryTitle}</div>
          {entryRoute ? <div className="flow-wizard-entry-route">{entryRoute}</div> : null}
          {entryScreen ? <div className="flow-wizard-entry-screen">{entryScreen}</div> : null}
        </div>
      ) : null}

      <LinearSection
        steps={prefixSteps ?? []}
        selectedStepId={selectedStepId}
        onSelectStep={onSelectStep}
        label="Wizard — shared steps"
      />

      {allocationBranches && allocationBranches.length > 0 ? (
        <BranchStepsEmbed
          branches={allocationBranches}
          expandedBranches={expandedBranches}
          selectedStepId={selectedStepId}
          onToggleBranch={onToggleBranch}
          onSelectStep={onSelectStep}
          sectionHint={allocationHint ?? 'Allocation path — asset vs aggregate, assign now vs later'}
        />
      ) : null}

      {submitBranches && submitBranches.length > 0 ? (
        <BranchStepsEmbed
          branches={submitBranches}
          expandedBranches={expandedBranches}
          selectedStepId={selectedStepId}
          onToggleBranch={onToggleBranch}
          onSelectStep={onSelectStep}
          entryTitle={undefined}
          sectionHint={submitHint ?? 'Submit — matches allocation choice (createTrip vs createTripWithOtp · phone assign · OTP)'}
        />
      ) : null}

      <LinearSection
        steps={suffixSteps ?? []}
        selectedStepId={selectedStepId}
        onSelectStep={onSelectStep}
        label={suffixLabel}
      />
    </div>
  );
}

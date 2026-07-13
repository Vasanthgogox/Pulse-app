import type { FlowStep } from '@/lib/flowStep.types';
import { FlowStepCard } from '@/components/FlowStepCard';
import { FlowStepConnector } from '@/components/FlowStepConnector';

export type LinearStepGroup = {
  id: string;
  label: string;
  summary?: string;
  steps: FlowStep[];
};

function StepList({
  steps,
  selectedStepId,
  onSelectStep,
  previousStep,
}: {
  steps: FlowStep[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  previousStep?: FlowStep;
}) {
  return (
    <>
      {steps.map((step, i) => {
        const fromStep = i > 0 ? steps[i - 1]! : previousStep;
        return (
          <div key={step.id} className="flow-shared-row">
            {fromStep ? <FlowStepConnector fromStep={fromStep} /> : null}
            <FlowStepCard step={step} selected={selectedStepId === step.id} onSelect={onSelectStep} showTableChips={false} />
          </div>
        );
      })}
    </>
  );
}

export function LinearStepsEmbed({
  steps,
  groups,
  selectedStepId,
  onSelectStep,
  sectionLabel,
}: {
  steps?: FlowStep[];
  groups?: LinearStepGroup[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  sectionLabel?: string;
}) {
  const resolvedGroups: LinearStepGroup[] =
    groups ??
    (steps
      ? [{ id: 'default', label: sectionLabel ?? 'Inner steps', steps }]
      : []);

  let chainPrevious: FlowStep | undefined;

  return (
    <div className="linear-steps-embed">
      <div className="flow-op-legend" aria-label="Step operation legend">
        <span className="flow-op-badge op-input">Input</span>
        <span className="flow-op-badge op-read">Read</span>
        <span className="flow-op-badge op-write">Write</span>
      </div>
      <div className="flow-linear-steps">
        {resolvedGroups.map((group) => {
          const groupBlock = (
            <section key={group.id} className="flow-linear-group">
              <h3 className="flow-section-label">{group.label}</h3>
              {group.summary ? <p className="flow-linear-group-summary">{group.summary}</p> : null}
              <StepList
                steps={group.steps}
                selectedStepId={selectedStepId}
                onSelectStep={onSelectStep}
                previousStep={chainPrevious}
              />
            </section>
          );
          chainPrevious = group.steps[group.steps.length - 1];
          return groupBlock;
        })}
      </div>
    </div>
  );
}

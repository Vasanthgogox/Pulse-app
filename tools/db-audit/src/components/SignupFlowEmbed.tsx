import type { FlowBranch, FlowStep, PersonaFlow, PersonaId } from '@/lib/appFlowModel';
import { TRIGGER_STEP, branchStepCount } from '@/lib/appFlowModel';

function StepCard({
  step,
  selected,
  onSelect,
}: {
  step: FlowStep;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const phaseClass = (phase: FlowStep['phase']) => {
    switch (phase) {
      case 'auth':
        return 'phase-auth';
      case 'trigger':
        return 'phase-trigger';
      case 'post-auth':
        return 'phase-post';
      case 'join':
        return 'phase-join';
      default:
        return 'phase-ui';
    }
  };

  const phaseLabels: Record<FlowStep['phase'], string> = {
    ui: 'UI',
    auth: 'Auth',
    trigger: 'Trigger',
    'post-auth': 'Post-auth',
    join: 'Join',
  };

  return (
    <button
      type="button"
      className={`flow-step-card${selected ? ' selected' : ''}`}
      onClick={() => onSelect(step.id)}
    >
      <div className="flow-step-rail">
        <span className="flow-step-order">{step.order}</span>
        <span className="flow-step-line" />
      </div>
      <div className="flow-step-body">
        <div className="flow-step-head">
          <span className="flow-step-label">{step.label}</span>
          <span className={`flow-phase ${phaseClass(step.phase)}`}>{phaseLabels[step.phase]}</span>
        </div>
        <div className="flow-step-title">{step.title}</div>
        {step.subtitle ? <div className="flow-step-sub">{step.subtitle}</div> : null}
        {step.tables?.length ? (
          <div className="flow-step-chips">
            {step.tables.slice(0, 3).map((t) => (
              <span key={t} className="flow-chip table">
                {t}
              </span>
            ))}
            {step.tables.length > 3 ? (
              <span className="flow-chip muted">+{step.tables.length - 3}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </button>
  );
}

function BranchSection({
  branch,
  expanded,
  selectedStepId,
  onToggle,
  onSelectStep,
}: {
  branch: FlowBranch;
  expanded: boolean;
  selectedStepId: string | null;
  onToggle: (branchId: string) => void;
  onSelectStep: (stepId: string) => void;
}) {
  return (
    <div className={`flow-branch${expanded ? ' expanded' : ''}`}>
      <button type="button" className="flow-branch-header" onClick={() => onToggle(branch.id)}>
        <span className="flow-branch-chevron" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
        <div className="flow-branch-meta">
          <div className="flow-branch-title-row">
            <span className="flow-branch-title">{branch.label}</span>
            {branch.badge ? <span className={`flow-branch-badge ${branch.badge}`}>{branch.badge}</span> : null}
            <span className="flow-branch-count">{branchStepCount(branch)} steps</span>
          </div>
          <div className="flow-branch-summary">{branch.summary}</div>
        </div>
      </button>
      {expanded ? (
        <div className="flow-branch-steps">
          {branch.steps.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              selected={selectedStepId === step.id}
              onSelect={onSelectStep}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type SignupFlowEmbedProps = {
  persona: PersonaFlow;
  personaId: PersonaId;
  expandedBranches: Set<string>;
  selectedStepId: string | null;
  onToggleBranch: (branchId: string) => void;
  onSelectStep: (stepId: string) => void;
};

export function SignupFlowEmbed({
  persona,
  personaId,
  expandedBranches,
  selectedStepId,
  onToggleBranch,
  onSelectStep,
}: SignupFlowEmbedProps) {
  return (
    <div className="signup-flow-embed">
      {persona.sharedSteps.length > 0 ? (
        <section className="flow-section">
          <h3 className="flow-section-label">Shared entry</h3>
          <div className="flow-shared-steps">
            {persona.sharedSteps.map((step, i) => (
              <div key={step.id} className="flow-shared-row">
                <StepCard step={step} selected={selectedStepId === step.id} onSelect={onSelectStep} />
                {i < persona.sharedSteps.length - 1 ? <div className="flow-connector" /> : null}
              </div>
            ))}
          </div>
          <div className="flow-fork-label">After OTP · resolver branches</div>
        </section>
      ) : null}

      <section className="flow-section">
        <h3 className="flow-section-label">
          {personaId === 'business' ? 'Business user variants' : 'Driver path'}
        </h3>
        {persona.branches.map((branch) => (
          <BranchSection
            key={branch.id}
            branch={branch}
            expanded={expandedBranches.has(branch.id)}
            selectedStepId={selectedStepId}
            onToggle={onToggleBranch}
            onSelectStep={onSelectStep}
          />
        ))}
      </section>

      {persona.tailSteps?.length ? (
        <section className="flow-section tail">
          <h3 className="flow-section-label">DB provisioning (auth signup paths)</h3>
          {persona.tailSteps.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              selected={selectedStepId === step.id}
              onSelect={onSelectStep}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

export { TRIGGER_STEP };

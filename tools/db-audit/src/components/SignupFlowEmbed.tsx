import type { FlowBranch, PersonaFlow, PersonaId } from '@/lib/appFlowModel';
import { TRIGGER_STEP, branchStepCount } from '@/lib/appFlowModel';
import { FlowStepCard } from '@/components/FlowStepCard';
import { FlowStepConnector } from '@/components/FlowStepConnector';

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
          {branch.steps.map((step, i) => (
            <div key={step.id} className="flow-shared-row">
              {i > 0 ? <FlowStepConnector fromStep={branch.steps[i - 1]!} /> : null}
              <FlowStepCard step={step} selected={selectedStepId === step.id} onSelect={onSelectStep} />
            </div>
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
      <div className="flow-entry-card signup-embed-entry">
        <div className="flow-entry-icon">{personaId === 'business' ? '🏢' : '🚛'}</div>
        <div>
          <div className="flow-entry-title">{persona.label}</div>
          <code className="flow-entry-route">{persona.route}</code>
          <div className="flow-entry-screen">{persona.screen}</div>
        </div>
      </div>

      {persona.sharedSteps.length > 0 ? (
        <section className="flow-section">
          <h3 className="flow-section-label">Shared entry</h3>
          <div className="flow-op-legend" aria-label="Step operation legend">
            <span className="flow-op-badge op-input">Input</span>
            <span className="flow-op-badge op-read">Read</span>
            <span className="flow-op-badge op-write">Write</span>
            <span className="flow-op-legend-hint">Badges on each step · arrow shows DB flow</span>
          </div>
          <div className="flow-shared-steps">
            {persona.sharedSteps.map((step, i) => (
              <div key={step.id} className="flow-shared-row">
                {i > 0 ? <FlowStepConnector fromStep={persona.sharedSteps[i - 1]!} /> : null}
                <FlowStepCard step={step} selected={selectedStepId === step.id} onSelect={onSelectStep} />
              </div>
            ))}
          </div>
          <div className="flow-fork-label">
            After OTP · resolver branches — expand a variant below for Org → Account → trigger
          </div>
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
          {persona.tailSteps.map((step, i) => (
            <div key={step.id} className="flow-shared-row">
              {i > 0 ? <FlowStepConnector fromStep={persona.tailSteps![i - 1]!} /> : null}
              <FlowStepCard step={step} selected={selectedStepId === step.id} onSelect={onSelectStep} />
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export { TRIGGER_STEP };

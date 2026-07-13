import type { FlowBranch } from '@/lib/flowStep.types';
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
            <span className="flow-branch-count">{branch.steps.length} steps</span>
          </div>
          <div className="flow-branch-summary">{branch.summary}</div>
        </div>
      </button>
      {expanded ? (
        <div className="flow-branch-steps">
          {branch.steps.map((step, i) => (
            <div key={step.id} className="flow-shared-row">
              {i > 0 ? <FlowStepConnector fromStep={branch.steps[i - 1]!} /> : null}
              <FlowStepCard step={step} selected={selectedStepId === step.id} onSelect={onSelectStep} showTableChips={false} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type BranchStepsEmbedProps = {
  branches: FlowBranch[];
  expandedBranches: Set<string>;
  selectedStepId: string | null;
  onToggleBranch: (branchId: string) => void;
  onSelectStep: (stepId: string) => void;
  entryTitle?: string;
  entryRoute?: string;
  entryScreen?: string;
  sectionHint?: string;
};

export function BranchStepsEmbed({
  branches,
  expandedBranches,
  selectedStepId,
  onToggleBranch,
  onSelectStep,
  entryTitle,
  entryRoute,
  entryScreen,
  sectionHint,
}: BranchStepsEmbedProps) {
  return (
    <div className="branch-steps-embed">
      {entryTitle ? (
        <div className="flow-entry-card signup-embed-entry">
          <div className="flow-entry-icon">📇</div>
          <div>
            <div className="flow-entry-title">{entryTitle}</div>
            {entryRoute ? <code className="flow-entry-route">{entryRoute}</code> : null}
            {entryScreen ? <div className="flow-entry-screen">{entryScreen}</div> : null}
          </div>
        </div>
      ) : null}

      <div className="flow-op-legend" aria-label="Step operation legend">
        <span className="flow-op-badge op-input">Input</span>
        <span className="flow-op-badge op-read">Read</span>
        <span className="flow-op-badge op-write">Write</span>
        <span className="flow-op-legend-hint">Expand a party type · each inner step shows field → DB column</span>
      </div>

      {sectionHint ? <p className="flow-linear-group-summary">{sectionHint}</p> : null}

      <section className="flow-section">
        {branches.map((branch) => (
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
    </div>
  );
}

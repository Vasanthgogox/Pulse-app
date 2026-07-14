import type { FlowStep } from '@/lib/flowStep.types';
import { FlowStepOpBadges } from '@/components/FlowStepOpBadges';
import { getStepOperationBadges } from '@/lib/stepOperationBadges';

function phaseClass(phase: FlowStep['phase']): string {
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
}

const phaseLabels: Record<FlowStep['phase'], string> = {
  ui: 'UI',
  auth: 'Auth',
  trigger: 'Trigger',
  'post-auth': 'Post-auth',
  join: 'Join',
};

export function FlowStepCard({
  step,
  selected,
  onSelect,
  showTableChips = true,
}: {
  step: FlowStep;
  selected: boolean;
  onSelect: (id: string) => void;
  showTableChips?: boolean;
}) {
  const opBadges = getStepOperationBadges(step);

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
        <div className="flow-step-meta-row">
          <span className="flow-step-label">{step.label}</span>
          <span className={`flow-phase ${phaseClass(step.phase)}`}>{phaseLabels[step.phase]}</span>
        </div>
        <div className="flow-step-title">{step.title}</div>
        {step.subtitle ? <div className="flow-step-sub">{step.subtitle}</div> : null}
        {step.wire ? (
          <div className="flow-step-wire-hint">Wire · Inspect or open Rail view for connected fan-out</div>
        ) : null}
        {opBadges.length ? (
          <div className="flow-step-ops-row">
            <FlowStepOpBadges ops={opBadges} />
          </div>
        ) : null}
        {step.fieldMappings?.length ? (
          <div className="flow-step-field-maps">
            {step.fieldMappings.map((m) => (
              <div key={`${m.input}-${m.storesTo}`} className="flow-field-map-row">
                <span className="flow-field-map-input">{m.input}</span>
                <span className="flow-field-map-arrow">→</span>
                <span className="flow-field-map-db">{m.storesTo}</span>
              </div>
            ))}
          </div>
        ) : null}
        {showTableChips && step.tables?.length ? (
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

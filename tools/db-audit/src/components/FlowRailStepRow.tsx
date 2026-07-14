import type { FlowStep } from '@/lib/flowStep.types';
import { buildFlowRailAttachments, type FlowRailAttachmentKind } from '@/lib/flowRailAttachments';
import { FlowStepOpBadges } from '@/components/FlowStepOpBadges';
import { getStepOperationBadges } from '@/lib/stepOperationBadges';

const ATTACH_LABELS: Record<FlowRailAttachmentKind, string> = {
  read: 'Read',
  write: 'Write',
  service: 'Service',
  route: 'Route',
  field: 'Field',
};

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

export function FlowRailStepRow({
  step,
  index,
  selected,
  isFirst,
  isLast,
  onSelect,
}: {
  step: FlowStep;
  index: number | string;
  selected: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onSelect: (stepId: string) => void;
}) {
  const attachments = buildFlowRailAttachments(step);
  const ops = getStepOperationBadges(step);

  return (
    <div className={`flow-rail-row${selected ? ' is-selected' : ''}${isLast ? ' is-last' : ''}`}>
      <div className="flow-rail-spine-col" aria-hidden={false}>
        {!isFirst ? <div className="flow-rail-stem" /> : <div className="flow-rail-stem flow-rail-stem-top" />}
        <button
          type="button"
          className={`flow-rail-node${selected ? ' is-selected' : ''}`}
          onClick={() => onSelect(step.id)}
          aria-current={selected ? 'step' : undefined}
        >
          <span className="flow-rail-node-ring">
            <span className="flow-rail-node-index">{index}</span>
          </span>
          <div className="flow-rail-node-content">
            <div className="flow-rail-node-head">
              <span className="flow-rail-node-label">{step.label}</span>
              <FlowStepOpBadges ops={ops} />
              <span className={`flow-phase flow-rail-phase ${phaseClass(step.phase)}`}>
                {step.phase === 'post-auth' ? 'Post' : step.phase.toUpperCase()}
              </span>
            </div>
            <div className="flow-rail-node-title">{step.title}</div>
            {step.subtitle ? <p className="flow-rail-node-sub">{step.subtitle}</p> : null}
          </div>
        </button>
        {!isLast ? <div className="flow-rail-stem flow-rail-stem-bottom" /> : null}
      </div>

      <div className="flow-rail-attach-col">
        {attachments.length === 0 ? (
          <div className="flow-rail-attach flow-rail-attach-empty">
            <span className="flow-rail-attach-kind">—</span>
            <span className="flow-rail-attach-label">UI only</span>
          </div>
        ) : (
          attachments.map((att) => (
            <button
              key={att.id}
              type="button"
              className={`flow-rail-attach kind-${att.kind}${selected ? ' is-parent-selected' : ''}`}
              onClick={() => onSelect(step.id)}
              title={att.detail}
            >
              <span className="flow-rail-attach-kind">{ATTACH_LABELS[att.kind]}</span>
              <span className="flow-rail-attach-label">{att.label}</span>
              {att.detail ? <span className="flow-rail-attach-detail">{att.detail}</span> : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function FlowRailMarker({
  label,
  sublabel,
  variant = 'phase',
}: {
  label: string;
  sublabel?: string;
  variant?: 'phase' | 'fork' | 'exit';
}) {
  return (
    <div className={`flow-rail-marker variant-${variant}`}>
      <div className="flow-rail-spine-col">
        <div className="flow-rail-stem" />
        <div className="flow-rail-marker-node">
          {variant === 'fork' ? <span className="flow-rail-fork-icon">◇</span> : null}
          {variant === 'exit' ? <span className="flow-rail-exit-icon">→</span> : null}
        </div>
        <div className="flow-rail-stem flow-rail-stem-bottom" />
      </div>
      <div className="flow-rail-attach-col flow-rail-marker-label">
        <span className="flow-rail-marker-title">{label}</span>
        {sublabel ? <span className="flow-rail-marker-sub">{sublabel}</span> : null}
      </div>
    </div>
  );
}

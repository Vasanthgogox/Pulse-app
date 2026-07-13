import type { StepOp } from '@/lib/stepOperationBadges';
import { STEP_OP_LABELS } from '@/lib/stepOperationBadges';

export function FlowStepOpBadges({
  ops,
  className = '',
  size = 'sm',
}: {
  ops: StepOp[];
  className?: string;
  size?: 'sm' | 'xs';
}) {
  if (!ops.length) return null;

  return (
    <span className={`flow-step-ops ${size}${className ? ` ${className}` : ''}`} aria-label={ops.map((o) => STEP_OP_LABELS[o]).join(', ')}>
      {ops.map((op) => (
        <span key={op} className={`flow-op-badge op-${op}`}>
          {STEP_OP_LABELS[op]}
        </span>
      ))}
    </span>
  );
}

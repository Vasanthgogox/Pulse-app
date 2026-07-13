import type { FlowStep } from '@/lib/flowStep.types';
import { getStepConnectorBadges } from '@/lib/stepOperationBadges';
import { STEP_OP_LABELS } from '@/lib/stepOperationBadges';

/** Vertical connector between steps — arrow + read/write badge from the step above. */
export function FlowStepConnector({ fromStep }: { fromStep: FlowStep }) {
  const flowOps = getStepConnectorBadges(fromStep);

  return (
    <div className="flow-connector-wrap" aria-hidden>
      <div className="flow-connector-rail">
        <span className="flow-connector-stem" />
        <span className="flow-connector-arrow">↓</span>
      </div>
      {flowOps.length > 0 ? (
        <div className="flow-connector-ops">
          {flowOps.map((op) => (
            <span key={op} className={`flow-op-badge op-${op} connector`}>
              {STEP_OP_LABELS[op]}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Execution Service API client.
 *
 * Commerce → Gateway → THIS CLIENT → Execution Service → Execution DB
 *
 * Commerce must NEVER write to Execution DB. Only the Execution Service owns:
 * validation, business rules, ID generation, events, transactions, permissions.
 */
import type { PublishExecutionPlanCommand } from '@/lib/execution-api';
import { publishPlatformEvent, getLatestEventForCorrelation } from '@/lib/domain-events';
import { recordEventObserved } from '@/lib/pulse-observatory';

const EXECUTION_API_BASE =
  import.meta.env.VITE_EXECUTION_API_URL ?? '/api/execution/v1';

export interface ExecutionPlanAccepted {
  executionReferenceId: string;
  indentId:             string;
  indentCode:           string;
  acceptedAt:           string;
}

/**
 * POST /execution-plans — command only. Execution Service decides indent, stops, events.
 */
export async function postExecutionPlan(
  command: PublishExecutionPlanCommand,
  correlationId: string,
): Promise<ExecutionPlanAccepted> {
  const endpoint = `${EXECUTION_API_BASE}/execution-plans`;

  // Production: fetch(endpoint, { method: 'POST', body: JSON.stringify(command), headers })
  await new Promise(r => setTimeout(r, 500));

  const indentId = `ind-${command.executionPlanId.toLowerCase()}`;
  const indentCode = `IND-${command.planNumber.replace('EP-', '')}`;
  const result: ExecutionPlanAccepted = {
    executionReferenceId: indentCode,
    indentId,
    indentCode,
    acceptedAt: new Date().toISOString(),
  };

  recordEventObserved({
    correlationId,
    service: 'execution-api',
    action:  `POST ${endpoint}`,
    payload: { executionPlanId: command.executionPlanId, indentId, indentCode },
  });

  publishPlatformEvent({
    eventName:     'IndentCreated',
    correlationId,
    causationId:   command.executionPlanId,
    parentEventId: getLatestEventForCorrelation(correlationId, 'ExecutionPlanPublished')?.eventId,
    tenant:        command.tenant,
    source:        'execution',
    payload:       {
      indentId,
      indentCode,
      planNumber: command.planNumber,
      stopCount:  command.stops.length,
      orderCount: command.summary.orderCount,
    },
  });

  return result;
}

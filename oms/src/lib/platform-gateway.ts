import type { GatewayRequest, GatewayResponse } from '@/types/platform';
import type { PublishExecutionPlanCommand } from '@/lib/execution-api';
import { receiveExecutionPlan } from '@/lib/execution-adapter';
import { publishPlatformEvent } from '@/lib/domain-events';
import { gatewayRoute } from '@/lib/pulse-registry';
import { recordCommand } from '@/lib/pulse-observatory';

/**
 * Pulse Gateway — routes through Registry → Execution Adapter.
 */
export async function gatewayRequest<TData = unknown>(
  request: GatewayRequest,
): Promise<GatewayResponse<TData>> {
  const correlationId = request.correlationId ?? crypto.randomUUID();
  const started = performance.now();
  const endpoint = gatewayRoute(request.service, request.path);

  if (request.service === 'execution' && request.method === 'POST' && request.path === '/execution-plans') {
    const command = request.body as PublishExecutionPlanCommand;
    const latencyMs = Math.round(performance.now() - started);

    recordCommand({
      correlationId,
      causationId: request.idempotencyKey,
      service: 'gateway',
      action: `POST ${endpoint}`,
      status: 'success',
      latencyMs,
      payload: { executionPlanId: command?.executionPlanId },
    });

    publishPlatformEvent({
      eventName:     'ExecutionPlanPublished',
      eventVersion:  1,
      correlationId,
      causationId:   request.idempotencyKey,
      tenant:        request.tenant,
      source:        'commerce',
      payload:       { endpoint, executionPlanId: command?.executionPlanId, accepted: true },
    });

    const result = await receiveExecutionPlan(command, correlationId);

    return {
      ok: true,
      status: 202,
      correlationId,
      data: {
        referenceId: result.referenceId,
        jobId:       result.jobId,
        indentId:    result.indentId,
        indentCode:  result.indentCode,
        executionPlanId: result.executionPlanId,
        mode:        result.mode,
        service:     'execution',
        endpoint,
      } as TData,
    };
  }

  await new Promise(r => setTimeout(r, 200));
  const latencyMs = Math.round(performance.now() - started);

  recordCommand({
    correlationId,
    service: 'gateway',
    action: `${request.method} ${endpoint}`,
    status: 'success',
    latencyMs,
    payload: { service: request.service },
  });

  return {
    ok: true,
    status: 200,
    correlationId,
    data: { endpoint, service: request.service } as TData,
  };
}

export function gatewayPath(service: GatewayRequest['service'], path: string): string {
  return gatewayRoute(service, path);
}

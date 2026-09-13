/**
 * Execution Service API client.
 *
 * Commerce → Gateway → THIS CLIENT → ExecutionOrchestrator (@pulse-platform) → Core DB
 *
 * Commerce never writes to Core tables directly — publishExecutionPlan() is a
 * shared orchestration command (lib/platform/orchestration), the same boundary
 * already used by the single-order publish-indent path, backed by Supabase +
 * RLS rather than a service-role client.
 */
import type { PublishExecutionPlanCommand } from '@/lib/execution-api';
import { publishPlatformEvent, getLatestEventForCorrelation } from '@/lib/domain-events';
import { recordEventObserved } from '@/lib/pulse-observatory';
import { getExecutionOrchestrator } from '@pulse-platform/index';

export interface ExecutionPlanAccepted {
  executionReferenceId: string;
  indentId:             string;
  indentCode:           string;
  acceptedAt:           string;
}

/**
 * Publishes the plan via ExecutionOrchestrator.publishExecutionPlan(): real
 * execution_plans + execution_plan_stops + shipment_allocations rows, plus a
 * linked Core indent (execution_plan_id set, sales_order_id NULL — see
 * migration 20270913090000). Idempotent per (workspaceId, executionPlanId).
 */
export async function postExecutionPlan(
  command: PublishExecutionPlanCommand,
  correlationId: string,
): Promise<ExecutionPlanAccepted> {
  if (!command.workspaceId || !command.requestedBy) {
    throw new Error('Cannot publish execution plan: missing workspaceId/requestedBy (organization not hydrated).');
  }

  const result = await getExecutionOrchestrator().publishExecutionPlan({
    correlationId,
    workspaceId: command.workspaceId,
    requestedBy: command.requestedBy,
    requestedAt: new Date().toISOString(),
    payload: {
      clientPlanId: command.executionPlanId,
      vehicleType: command.vehicleType,
      totalWeightKg: command.summary.totalWeightKg,
      route: command.route,
      stops: command.stops.map(s => ({
        clientStopId: s.stopId,
        label: s.label,
        type: s.type,
        warehouseId: s.warehouseId,
        address: s.address,
        contactName: s.contact.name,
        contactPhone: s.contact.phone,
        podRequired: s.podRequired,
      })),
      allocations: command.allocations.map(a => ({
        orderId: a.orderId,
        pickupClientStopId: a.pickupStopId,
        dropClientStopId: a.dropStopId,
      })),
      orders: command.orders.map(o => ({
        orderId: o.orderId,
        customerId: o.customer.id,
        customerName: o.customer.name,
        totalAmount: o.amount,
        lineItems: o.lineItems.map(li => ({
          id: li.id, quantity: li.qty, weightKg: li.weightKg, volumeM3: li.volumeM3,
        })),
      })),
    },
  });

  const accepted: ExecutionPlanAccepted = {
    executionReferenceId: result.indentCode,
    indentId:             result.indentId,
    indentCode:           result.indentCode,
    acceptedAt:           new Date().toISOString(),
  };

  recordEventObserved({
    correlationId,
    service: 'execution-api',
    action:  result.alreadyPublished ? 'POST /execution-plans (idempotent replay)' : 'POST /execution-plans',
    payload: { executionPlanId: result.executionPlanId, indentId: result.indentId, indentCode: result.indentCode },
  });

  if (!result.alreadyPublished) {
    publishPlatformEvent({
      eventName:     'IndentCreated',
      correlationId,
      causationId:   command.executionPlanId,
      parentEventId: getLatestEventForCorrelation(correlationId, 'ExecutionPlanPublished')?.eventId,
      tenant:        command.tenant,
      source:        'execution',
      payload:       {
        indentId: result.indentId,
        indentCode: result.indentCode,
        planNumber: command.planNumber,
        stopCount:  command.stops.length,
        orderCount: command.summary.orderCount,
      },
    });
  }

  return accepted;
}

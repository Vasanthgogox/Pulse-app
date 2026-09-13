/**
 * Gateway-side adapter: forwards commands to Execution API.
 * Does NOT touch Execution DB. Local job mirror is for Operations UI only.
 */
import type { PublishExecutionPlanCommand } from '@/lib/execution-api';
import { buildPublishExecutionPlanPayload } from '@/lib/execution-api';
import { postExecutionPlan } from '@/lib/execution-service-client';
import { recordEventObserved } from '@/lib/pulse-observatory';
import {
  buildStopsFromCommand,
  getExecutionJob,
  getJobByPlanId,
  updateExecutionJob,
  upsertExecutionJob,
} from '@/lib/execution-store';
import { publishPlatformEvent, getLatestEventForCorrelation } from '@/lib/domain-events';
import type { ExecutionJob } from '@/types/execution';
import type { ExecutionPlan, Order } from '@/types/commerce';
import type { TenantContext } from '@/types/platform';
import type { FleetDriver, FleetVehicle } from '@/types/onboarding';

export interface ReceivePlanResult {
  jobId:       string;
  referenceId: string;
  indentId:    string;
  mode:        'execution-api';
}

export async function receiveExecutionPlan(
  command: PublishExecutionPlanCommand,
  correlationId: string,
): Promise<ReceivePlanResult> {
  const accepted = await postExecutionPlan(command, correlationId);
  const jobId = `JOB-${command.executionPlanId}`;

  const job: ExecutionJob = {
    id:              jobId,
    correlationId,
    executionPlanId: command.executionPlanId,
    planNumber:      command.planNumber,
    command,
    status:          'received',
    stops:           buildStopsFromCommand(command),
    indentId:        accepted.indentId,
    indentCode:      accepted.indentCode,
    receivedAt:      accepted.acceptedAt,
  };

  upsertExecutionJob(job);

  recordEventObserved({
    correlationId,
    service: 'execution',
    action:  'ExecutionJobReceived',
    payload: { jobId, indentId: accepted.indentId, via: 'execution-api' },
  });

  return {
    jobId,
    referenceId: accepted.executionReferenceId,
    indentId:    accepted.indentId,
    mode:        'execution-api',
  };
}

export function assignExecutionJob(
  jobId: string,
  driver: FleetDriver,
  vehicle: FleetVehicle,
): ExecutionJob | null {
  const job = getExecutionJob(jobId);
  if (!job || job.status !== 'received') return null;

  const tripId = `TRIP-${job.executionPlanId}`;

  const updated = updateExecutionJob(jobId, {
    status:       'assigned',
    tripId,
    driverId:     driver.id,
    driverName:   driver.name,
    vehicleId:    vehicle.id,
    vehicleLabel: vehicle.label,
    assignedAt:   new Date().toISOString(),
  });

  if (!updated) return null;

  publishPlatformEvent({
    eventName:     'DriverAssigned',
    correlationId: job.correlationId,
    causationId:   jobId,
    parentEventId: getLatestEventForCorrelation(job.correlationId, 'IndentCreated')?.eventId,
    tenant:        job.command.tenant,
    source:        'execution',
    payload:       { jobId, tripId, driverId: driver.id, vehicleId: vehicle.id },
  });

  publishPlatformEvent({
    eventName:     'TripStarted',
    correlationId: job.correlationId,
    causationId:   tripId,
    parentEventId: getLatestEventForCorrelation(job.correlationId, 'DriverAssigned')?.eventId,
    tenant:        job.command.tenant,
    source:        'execution',
    payload:       { tripId, jobId, stopCount: job.stops.length },
  });

  return updateExecutionJob(jobId, { status: 'in_progress' }) ?? updated;
}

export function advanceExecutionStop(
  jobId: string,
  stopId: string,
  podRef?: string,
): ExecutionJob | null {
  const job = getExecutionJob(jobId);
  if (!job || (job.status !== 'assigned' && job.status !== 'in_progress')) return null;

  const stop = job.stops.find(s => s.stopId === stopId);
  if (!stop || stop.status === 'completed') return job;

  const nextStops = job.stops.map(s =>
    s.stopId === stopId
      ? { ...s, status: 'completed' as const, podRef: s.podRequired ? (podRef ?? `POD-${stopId}`) : podRef, completedAt: new Date().toISOString() }
      : s,
  );

  let updated = updateExecutionJob(jobId, { stops: nextStops, status: 'in_progress' });
  if (!updated) return null;

  const graphParent = getLatestEventForCorrelation(job.correlationId)?.eventId;

  publishPlatformEvent({
    eventName:     'StopArrived',
    correlationId: job.correlationId,
    causationId:   stopId,
    parentEventId: graphParent,
    tenant:        job.command.tenant,
    source:        'execution',
    payload:       { stopId, label: stop.label },
  });

  publishPlatformEvent({
    eventName:     stop.type === 'pickup' ? 'PickupCompleted' : 'DropCompleted',
    correlationId: job.correlationId,
    causationId:   stopId,
    parentEventId: getLatestEventForCorrelation(job.correlationId, 'StopArrived')?.eventId,
    tenant:        job.command.tenant,
    source:        'execution',
    payload:       { stopId },
  });

  if (stop.type === 'drop' && stop.podRequired) {
    publishPlatformEvent({
      eventName:     'PODUploaded',
      correlationId: job.correlationId,
      causationId:   stopId,
      parentEventId: getLatestEventForCorrelation(job.correlationId, 'DropCompleted')?.eventId,
      tenant:        job.command.tenant,
      source:        'execution',
      payload:       { stopId, podRef: podRef ?? `POD-${stopId}` },
    });
  }

  if (nextStops.every(s => s.status === 'completed')) {
    updated = completeExecutionJob(jobId) ?? updated;
  }

  return updated;
}

export function completeExecutionJob(jobId: string): ExecutionJob | null {
  const job = getExecutionJob(jobId);
  if (!job) return null;

  const updated = updateExecutionJob(jobId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  });
  if (!updated) return null;

  publishPlatformEvent({
    eventName:     'TripCompleted',
    correlationId: job.correlationId,
    causationId:   job.tripId ?? jobId,
    parentEventId: getLatestEventForCorrelation(job.correlationId)?.eventId,
    tenant:        job.command.tenant,
    source:        'execution',
    payload:       { jobId, tripId: job.tripId },
  });

  publishPlatformEvent({
    eventName:     'SettlementCompleted',
    correlationId: job.correlationId,
    causationId:   job.executionPlanId,
    parentEventId: getLatestEventForCorrelation(job.correlationId, 'TripCompleted')?.eventId,
    tenant:        job.command.tenant,
    source:        'finance',
    payload: {
      planId:   job.executionPlanId,
      orderIds: job.command.orders.map(o => o.orderId),
      amount:   job.command.summary.totalAmount,
      currency: job.command.summary.currency,
    },
  });

  publishPlatformEvent({
    eventName:     'InvoiceGenerated',
    correlationId: job.correlationId,
    causationId:   job.executionPlanId,
    parentEventId: getLatestEventForCorrelation(job.correlationId, 'SettlementCompleted')?.eventId,
    tenant:        job.command.tenant,
    source:        'finance',
    payload: { invoiceNumber: `INV-${job.planNumber}`, amount: job.command.summary.totalAmount },
  });

  return updated;
}

export function getNextPendingStop(job: ExecutionJob) {
  return job.stops.find(s => s.status !== 'completed');
}

/** Local mirror when a plan was published but no execution job exists (e.g. after refresh recovery). */
export function mirrorExecutionJobFromPublishedPlan(
  plan: ExecutionPlan,
  orders: Order[],
  tenant: TenantContext,
  createdBy: string,
): ExecutionJob | undefined {
  if (plan.status !== 'published' && plan.status !== 'fulfilled') return undefined;

  const existing = getJobByPlanId(plan.id);
  if (existing) return existing;

  const command = buildPublishExecutionPlanPayload(plan, orders, tenant, createdBy, '', '');
  const correlationId = plan.correlation_id ?? crypto.randomUUID();
  const indentCode = `IND-${plan.plan_number.replace('EP-', '')}`;

  const job: ExecutionJob = {
    id:              `JOB-${plan.id}`,
    correlationId,
    executionPlanId: plan.id,
    planNumber:      plan.plan_number,
    command,
    status:          plan.status === 'fulfilled' ? 'completed' : 'received',
    stops:           buildStopsFromCommand(command),
    indentId:        `ind-${plan.id.toLowerCase()}`,
    indentCode,
    receivedAt:      plan.published_at ?? plan.updated_at,
    completedAt:     plan.status === 'fulfilled' ? plan.updated_at : undefined,
  };

  return upsertExecutionJob(job);
}

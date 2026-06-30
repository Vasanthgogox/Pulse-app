import type { PlatformEventEnvelope, PulseSource, TenantContext } from '@/types/platform';
import { DEFAULT_TENANT } from '@/types/platform';

export type { PlatformEventEnvelope } from '@/types/platform';

export type DomainEventName =
  | 'ExecutionPlanPublished'
  | 'ExecutionPlanCancelled'
  | 'IndentCreated'
  | 'DriverAssigned'
  | 'TripStarted'
  | 'StopArrived'
  | 'PickupCompleted'
  | 'DropCompleted'
  | 'PODUploaded'
  | 'TripCompleted'
  | 'SettlementCompleted'
  | 'InvoiceGenerated';

export const DOMAIN_EVENT_VERSIONS: Record<DomainEventName, number> = {
  ExecutionPlanPublished: 1,
  ExecutionPlanCancelled: 1,
  IndentCreated:          1,
  DriverAssigned:           1,
  TripStarted:              1,
  StopArrived:              1,
  PickupCompleted:          1,
  DropCompleted:            1,
  PODUploaded:              1,
  TripCompleted:            1,
  SettlementCompleted:      1,
  InvoiceGenerated:         1,
};

export const DOMAIN_EVENT_LABELS: Record<DomainEventName, string> = {
  ExecutionPlanPublished: 'Execution plan published',
  ExecutionPlanCancelled: 'Execution plan cancelled',
  IndentCreated:          'Indent created',
  DriverAssigned:         'Driver assigned',
  TripStarted:            'Trip started',
  StopArrived:            'Stop arrived',
  PickupCompleted:        'Pickup completed',
  DropCompleted:          'Drop completed',
  PODUploaded:            'POD uploaded',
  TripCompleted:          'Trip completed',
  SettlementCompleted:    'Settlement completed',
  InvoiceGenerated:       'Invoice generated',
};

export type PlatformEventHandler = (event: PlatformEventEnvelope) => void;

const handlers = new Set<PlatformEventHandler>();
const eventLog: PlatformEventEnvelope[] = [];

export function createPlatformEvent<TPayload>(params: {
  eventName:     DomainEventName;
  payload:       TPayload;
  tenant?:       TenantContext;
  correlationId: string;
  causationId?:  string;
  parentEventId?: string;
  source?:       PulseSource;
  eventVersion?: number;
}): PlatformEventEnvelope<TPayload> {
  const tenant = params.tenant ?? DEFAULT_TENANT;
  return {
    eventName:      params.eventName,
    eventVersion:   params.eventVersion ?? DOMAIN_EVENT_VERSIONS[params.eventName],
    eventId:        crypto.randomUUID(),
    occurredAt:     new Date().toISOString(),
    correlationId:  params.correlationId,
    causationId:    params.causationId,
    parentEventId:  params.parentEventId,
    tenantId:       tenant.tenantId,
    organizationId: tenant.organizationId,
    businessUnitId: tenant.businessUnitId,
    source:         params.source ?? 'commerce',
    payload:        params.payload,
  };
}

export function publishPlatformEvent<TPayload>(
  params: Omit<Parameters<typeof createPlatformEvent<TPayload>>[0], 'eventVersion'> & { eventVersion?: number },
): PlatformEventEnvelope<TPayload> {
  const event = createPlatformEvent(params);
  eventLog.unshift(event);
  if (eventLog.length > 100) eventLog.pop();
  handlers.forEach(h => h(event));
  return event;
}

export function subscribePlatformEvents(handler: PlatformEventHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function getRecentPlatformEvents(): PlatformEventEnvelope[] {
  return [...eventLog];
}

/** Latest event in correlation (optional filter by name) — for parentEventId chaining. */
export function getLatestEventForCorrelation(
  correlationId: string,
  eventName?: DomainEventName,
): PlatformEventEnvelope | undefined {
  return eventLog.find(e =>
    e.correlationId === correlationId && (!eventName || e.eventName === eventName),
  );
}

/** @deprecated Use publishPlatformEvent */
export const publishDomainEvent = publishPlatformEvent;

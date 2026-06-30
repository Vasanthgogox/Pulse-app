/** Shared platform primitives — every Pulse product uses these. */

export type PulseSource = 'commerce' | 'execution' | 'finance' | 'network' | 'ai' | 'identity';

export interface TenantContext {
  tenantId:       string;
  organizationId: string;
  businessUnitId?: string;
}

/** Standard lifecycle metadata inherited by every Pulse entity. */
export interface EntityMetadata {
  id:             string;
  version:        number;
  status:         string;
  createdAt:      string;
  updatedAt:      string;
  createdBy:      string;
  tenantId:       string;
  organizationId: string;
  businessUnitId?: string;
  source:         PulseSource;
}

export type GatewayService = 'execution' | 'finance' | 'network' | 'ai' | 'identity' | 'commerce';

export interface GatewayRequest<TBody = unknown> {
  service:        GatewayService;
  path:           string;
  method:         'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?:          TBody;
  tenant:         TenantContext;
  correlationId?: string;
  idempotencyKey?: string;
}

export interface GatewayResponse<TData = unknown> {
  ok:            boolean;
  status:        number;
  correlationId: string;
  data?:         TData;
  error?:        { code: string; message: string };
}

/** Versioned event envelope for Kafka / RabbitMQ. */
export interface PlatformEventEnvelope<TPayload = unknown> {
  eventName:      string;
  eventVersion:   number;
  eventId:        string;
  occurredAt:     string;
  correlationId:  string;
  causationId?:   string;
  /** Graph parent in Observatory — may differ from causationId. See PLATFORM_CANONICAL_MODEL.md */
  parentEventId?: string;
  tenantId:       string;
  organizationId: string;
  businessUnitId?: string;
  source:         PulseSource;
  payload:        TPayload;
}

export const DEFAULT_TENANT: TenantContext = {
  tenantId:       'tenant-demo',
  organizationId: 'org-demo-001',
  businessUnitId: 'bu-west-ops',
};

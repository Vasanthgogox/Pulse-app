import { randomUUID } from 'crypto';
import type { StructuredLogger } from './logger';
import type { RequestMetrics } from './metrics';

export interface PlatformRequestContext {
  requestId:      string;
  correlationId?: string;
  tenantId?:      string;
  organizationId?: string;
  membershipId?:  string;
  endpoint:       string;
  method:         string;
  startedAt:      number;
  logger:         StructuredLogger;
  metrics:        RequestMetrics;
}

export interface CreateRequestContextInput {
  service:        string;
  method:         string;
  endpoint:       string;
  requestId?:     string;
  correlationId?: string;
  logger:         StructuredLogger;
  metrics:        RequestMetrics;
}

export function createRequestContext(input: CreateRequestContextInput): PlatformRequestContext {
  return {
    requestId:     input.requestId ?? randomUUID(),
    correlationId: input.correlationId,
    endpoint:      input.endpoint,
    method:        input.method,
    startedAt:     Date.now(),
    logger:        input.logger,
    metrics:       input.metrics,
  };
}

export function enrichRequestContextFromClaims(
  ctx: PlatformRequestContext,
  claims?: {
    tenantId?:       string;
    organizationId?: string;
    membershipId?:   string;
  },
): void {
  if (!claims) return;
  if (claims.tenantId) ctx.tenantId = claims.tenantId;
  if (claims.organizationId) ctx.organizationId = claims.organizationId;
  if (claims.membershipId) ctx.membershipId = claims.membershipId;
}

export function logRequestCompletion(
  ctx: PlatformRequestContext,
  statusCode: number,
): void {
  const durationMs = Date.now() - ctx.startedAt;
  ctx.metrics.recordRequest({
    endpoint:   ctx.endpoint,
    method:     ctx.method,
    statusCode,
    durationMs,
  });
  ctx.logger.info({
    event:          'http.request',
    requestId:      ctx.requestId,
    correlationId:  ctx.correlationId,
    tenantId:       ctx.tenantId,
    organizationId: ctx.organizationId,
    membershipId:   ctx.membershipId,
    endpoint:       ctx.endpoint,
    method:         ctx.method,
    statusCode,
    durationMs,
  });
}

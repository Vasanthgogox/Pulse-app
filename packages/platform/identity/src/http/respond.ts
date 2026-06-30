import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { IdentityEnv } from '../hono-env';
import { randomUUID } from 'crypto';
import { ZodError } from 'zod';
import { SCHEMA_VERSION, successResponse, errorResponse, PlatformError, ErrorCodes } from '@pulse/contracts';

export function getRequestId(c: Context<IdentityEnv>): string {
  const reqCtx = c.get('reqCtx');
  if (reqCtx?.requestId) return reqCtx.requestId;
  const auth = c.get('auth');
  if (auth?.requestId) return auth.requestId;
  return c.req.header('X-Request-Id') ?? randomUUID();
}

function setResponseHeaders(c: Context<IdentityEnv>): string {
  const requestId = getRequestId(c);
  c.header('X-Request-Id', requestId);
  const correlationId = c.req.header('X-Correlation-Id');
  if (correlationId) c.header('X-Correlation-Id', correlationId);
  return requestId;
}

export function respondSuccess<T>(
  c: Context<IdentityEnv>,
  data: T,
  status = 200,
): Response {
  const requestId = setResponseHeaders(c);
  return c.json(successResponse(data, {
    requestId,
    schemaVersion: SCHEMA_VERSION,
    correlationId: c.req.header('X-Correlation-Id'),
  }), status as ContentfulStatusCode);
}

export function respondError(c: Context<IdentityEnv>, err: unknown): Response {
  setResponseHeaders(c);

  if (err instanceof ZodError) {
    return c.json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', { issues: err.issues }), 400);
  }
  if (err instanceof PlatformError) {
    return c.json(
      errorResponse(err.code, err.message, err.details),
      err.status as ContentfulStatusCode,
    );
  }
  if (err instanceof Error) {
    return c.json(errorResponse('INTERNAL_ERROR', err.message), 500);
  }
  return c.json(errorResponse('INTERNAL_ERROR', 'Unknown error'), 500);
}

export function parseBody<T>(c: Context<IdentityEnv>): Promise<T> {
  return c.req.json<T>();
}

import { z } from 'zod';
import {
  apiErrorEnvelopeSchema,
  apiSuccessEnvelopeSchema,
  businessUnitSchema,
  currentUserSchema,
  healthAliveSchema,
  healthReadySchema,
  healthVersionSchema,
  invitationSchema,
  loginRequestSchema,
  loginResponseSchema,
  organizationSchema,
  warehouseSchema,
} from './identity-v1';

export type HttpMethod = 'GET' | 'POST';

export interface IdentityOperationSpec {
  method:                 HttpMethod;
  path:                   string;
  operationId:            string;
  auth:                   boolean;
  requestBody?:           z.ZodTypeAny;
  responses:              Record<number, z.ZodTypeAny>;
  requiredResponseHeaders?: string[];
}

function opKey(method: HttpMethod, path: string): string {
  return `${method} ${path}`;
}

export const IDENTITY_V1_OPERATIONS: Record<string, IdentityOperationSpec> = {
  [opKey('POST', '/auth/login')]: {
    method:      'POST',
    path:        '/auth/login',
    operationId: 'login',
    auth:        false,
    requestBody: loginRequestSchema,
    responses: {
      200: apiSuccessEnvelopeSchema(loginResponseSchema),
      401: apiErrorEnvelopeSchema,
    },
    requiredResponseHeaders: ['X-Request-Id'],
  },
  [opKey('GET', '/auth/me')]: {
    method:      'GET',
    path:        '/auth/me',
    operationId: 'getCurrentUser',
    auth:        true,
    responses: {
      200: apiSuccessEnvelopeSchema(currentUserSchema),
      401: apiErrorEnvelopeSchema,
    },
    requiredResponseHeaders: ['X-Request-Id'],
  },
  [opKey('POST', '/organizations')]: {
    method:      'POST',
    path:        '/organizations',
    operationId: 'createOrganization',
    auth:        true,
    requestBody: z.object({ name: z.string().min(1), legalName: z.string().optional() }).strict(),
    responses: {
      201: apiSuccessEnvelopeSchema(organizationSchema),
      409: apiErrorEnvelopeSchema,
    },
    requiredResponseHeaders: ['X-Request-Id'],
  },
  [opKey('POST', '/business-units')]: {
    method:      'POST',
    path:        '/business-units',
    operationId: 'createBusinessUnit',
    auth:        true,
    requestBody: z.object({
      organizationId: z.string(),
      name:           z.string(),
      code:           z.string(),
    }).strict(),
    responses: {
      201: apiSuccessEnvelopeSchema(businessUnitSchema),
      401: apiErrorEnvelopeSchema,
      403: apiErrorEnvelopeSchema,
    },
    requiredResponseHeaders: ['X-Request-Id'],
  },
  [opKey('POST', '/warehouses')]: {
    method:      'POST',
    path:        '/warehouses',
    operationId: 'createWarehouse',
    auth:        true,
    requestBody: z.object({
      organizationId: z.string(),
      businessUnitId: z.string().optional(),
      name:           z.string(),
      code:           z.string(),
      address:        z.record(z.unknown()).optional(),
    }).strict(),
    responses: {
      201: apiSuccessEnvelopeSchema(warehouseSchema),
      401: apiErrorEnvelopeSchema,
      403: apiErrorEnvelopeSchema,
    },
    requiredResponseHeaders: ['X-Request-Id'],
  },
  [opKey('POST', '/users/invite')]: {
    method:      'POST',
    path:        '/users/invite',
    operationId: 'inviteUser',
    auth:        true,
    requestBody: z.object({
      organizationId: z.string(),
      email:          z.string().email(),
      role:           z.enum(['admin', 'planner', 'operator']),
      businessUnitId: z.string().optional(),
    }).strict(),
    responses: {
      201: apiSuccessEnvelopeSchema(invitationSchema),
      401: apiErrorEnvelopeSchema,
      403: apiErrorEnvelopeSchema,
      409: apiErrorEnvelopeSchema,
    },
    requiredResponseHeaders: ['X-Request-Id'],
  },
  [opKey('GET', '/health')]: {
    method:      'GET',
    path:        '/health',
    operationId: 'health',
    auth:        false,
    responses: {
      200: healthAliveSchema,
    },
  },
  [opKey('GET', '/ready')]: {
    method:      'GET',
    path:        '/ready',
    operationId: 'ready',
    auth:        false,
    responses: {
      200: healthReadySchema,
      503: healthReadySchema,
    },
  },
  [opKey('GET', '/version')]: {
    method:      'GET',
    path:        '/version',
    operationId: 'version',
    auth:        false,
    responses: {
      200: healthVersionSchema,
    },
  },
};

export function assertOperationResponse(
  operationKey: string,
  status: number,
  body: unknown,
  headers?: Headers,
): void {
  const spec = IDENTITY_V1_OPERATIONS[operationKey];
  if (!spec) throw new Error(`Unknown operation: ${operationKey}`);

  const schema = spec.responses[status];
  if (!schema) {
    throw new Error(`Unexpected status ${status} for ${operationKey}`);
  }

  schema.parse(body);

  if (spec.requiredResponseHeaders && headers) {
    for (const name of spec.requiredResponseHeaders) {
      if (!headers.get(name)) {
        throw new Error(`Missing required response header ${name} for ${operationKey}`);
      }
    }
  }
}

export function assertRequestBody(operationKey: string, body: unknown): void {
  const spec = IDENTITY_V1_OPERATIONS[operationKey];
  if (!spec?.requestBody) return;
  spec.requestBody.parse(body);
}

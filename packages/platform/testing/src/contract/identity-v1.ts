import { z } from 'zod';
import { SCHEMA_VERSION } from '@pulse/contracts';

const roleSchema = z.enum(['admin', 'planner', 'operator']);

const addressSchema = z.object({
  line1:      z.string().optional(),
  line2:      z.string().optional(),
  city:       z.string().optional(),
  state:      z.string().optional(),
  postalCode: z.string().optional(),
  country:    z.string().optional(),
}).strict();

const responseMetaSchema = z.object({
  requestId:     z.string(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  correlationId: z.string().optional(),
}).strict();

export const apiSuccessEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data:    dataSchema,
    meta:    responseMetaSchema,
  }).strict();

export const apiErrorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code:    z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }).strict(),
}).strict();

export const organizationSchema = z.object({
  id:        z.string(),
  name:      z.string(),
  legalName: z.string().optional(),
  tenantId:  z.string(),
  createdAt: z.string(),
}).strict();

export const businessUnitSchema = z.object({
  id:             z.string(),
  organizationId: z.string(),
  name:           z.string(),
  code:           z.string(),
}).strict();

export const warehouseSchema = z.object({
  id:             z.string(),
  organizationId: z.string(),
  businessUnitId: z.string().optional(),
  name:           z.string(),
  code:           z.string(),
  address:        addressSchema.optional(),
}).strict();

export const invitationSchema = z.object({
  id:             z.string(),
  organizationId: z.string(),
  email:          z.string().email(),
  role:           roleSchema,
  businessUnitId: z.string().optional(),
  status:         z.enum(['pending', 'accepted', 'expired', 'revoked']),
  expiresAt:      z.string(),
}).strict();

export const currentUserSchema = z.object({
  id:             z.string(),
  email:          z.string().email(),
  name:           z.string().optional(),
  role:           roleSchema,
  schemaVersion:  z.literal(SCHEMA_VERSION),
  tenantId:       z.string(),
  organizationId: z.string(),
  membershipId:   z.string(),
  businessUnitId: z.string().optional(),
  warehouseIds:   z.array(z.string()),
  organization:   organizationSchema.optional(),
  membership:     z.object({
    id:             z.string(),
    userId:         z.string(),
    organizationId: z.string(),
    businessUnitId: z.string().optional(),
    role:           roleSchema,
    status:         z.enum(['active', 'suspended', 'revoked']),
    warehouseIds:   z.array(z.string()).optional(),
  }).strict().optional(),
  warehouses: z.array(warehouseSchema).optional(),
}).strict();

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn:   z.number(),
  tokenType:   z.literal('Bearer'),
  user:        currentUserSchema,
}).strict();

export const loginRequestSchema = z.object({
  email:        z.string().email(),
  password:     z.string().min(1),
  membershipId: z.string().optional(),
}).strict();

export const healthAliveSchema = z.object({
  status:  z.literal('ok'),
  service: z.literal('identity'),
}).strict();

export const healthReadySchema = z.object({
  status:            z.enum(['ready', 'not_ready']),
  service:           z.literal('identity'),
  schemaReachable:   z.boolean(),
  missingMigrations: z.array(z.string()),
}).strict();

export const healthVersionSchema = z.object({
  service:          z.literal('identity'),
  serviceVersion:   z.string(),
  schemaVersion:    z.string(),
  apiSchemaVersion: z.string(),
  gitCommit:        z.string().optional(),
}).strict();

export const identityV1Schemas = {
  organization:     organizationSchema,
  businessUnit:     businessUnitSchema,
  warehouse:        warehouseSchema,
  invitation:       invitationSchema,
  currentUser:      currentUserSchema,
  loginResponse:    loginResponseSchema,
};

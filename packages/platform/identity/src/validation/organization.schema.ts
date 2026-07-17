import { z } from 'zod';

export const createOrganizationSchema = z.object({
  name:      z.string().min(1).max(200),
  legalName: z.string().max(300).optional(),
});

export const createBusinessUnitSchema = z.object({
  organizationId: z.string().regex(/^ORG-\d{6}$/),
  name:           z.string().min(1).max(200),
  code:           z.string().min(1).max(20),
});

export const createWarehouseSchema = z.object({
  organizationId: z.string().regex(/^ORG-\d{6}$/),
  businessUnitId: z.string().regex(/^BU-\d{6}$/).optional(),
  name:           z.string().min(1).max(200),
  code:           z.string().min(1).max(20),
  address:        z.object({
    line1:      z.string().optional(),
    line2:      z.string().optional(),
    city:       z.string().optional(),
    state:      z.string().optional(),
    postalCode: z.string().optional(),
    country:    z.string().optional(),
  }).optional(),
});

export const inviteUserSchema = z.object({
  organizationId: z.string().regex(/^ORG-\d{6}$/),
  email:          z.string().email(),
  role:           z.enum(['admin', 'planner', 'operator']),
  businessUnitId: z.string().regex(/^BU-\d{6}$/).optional(),
});

export const loginSchema = z.object({
  email:        z.string().email(),
  password:     z.string().min(1),
  membershipId: z.string().regex(/^MEM-\d{6}$/).optional(),
});

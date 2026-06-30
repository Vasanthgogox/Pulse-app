import type { PlatformJwtClaims, PlatformRole } from '@pulse/contracts';
import { JWT_CLAIMS_SCHEMA_VERSION } from '@pulse/contracts';

export interface MembershipFixtureInput {
  sub:             string;
  tenantId:        string;
  organizationId:  string;
  membershipId:    string;
  role:            PlatformRole;
  businessUnitId?: string;
  warehouseIds?:   string[];
}

export function buildMembershipClaims(input: MembershipFixtureInput): PlatformJwtClaims {
  return {
    sub:            input.sub,
    tenantId:       input.tenantId,
    organizationId: input.organizationId,
    membershipId:   input.membershipId,
    businessUnitId: input.businessUnitId,
    warehouseIds:   input.warehouseIds ?? [],
    role:           input.role,
    schemaVersion:  JWT_CLAIMS_SCHEMA_VERSION,
  };
}

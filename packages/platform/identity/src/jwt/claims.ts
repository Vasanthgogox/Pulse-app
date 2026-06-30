import type { PlatformJwtClaims } from '@pulse/contracts';

export type { PlatformJwtClaims };

export function buildClaimsFromSession(params: {
  authUserId:     string;
  tenantCode:     string;
  organizationCode: string;
  membershipCode: string;
  businessUnitCode?: string;
  warehouseCodes:  string[];
  role:            PlatformJwtClaims['role'];
}): Omit<PlatformJwtClaims, 'schemaVersion'> {
  return {
    sub:            params.authUserId,
    tenantId:       params.tenantCode,
    organizationId: params.organizationCode,
    membershipId:   params.membershipCode,
    businessUnitId: params.businessUnitCode,
    warehouseIds:   params.warehouseCodes,
    role:           params.role,
  };
}

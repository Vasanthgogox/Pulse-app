/**
 * Frozen Platform JWT claims v1 — intentionally small.
 * Permissions are NOT in the JWT; resolve via Identity + membershipId.
 */
import type { SchemaVersion } from '../common/metadata';

export const JWT_CLAIMS_SCHEMA_VERSION: SchemaVersion = 'v1';

export type PlatformRole = 'admin' | 'planner' | 'operator';

export interface PlatformJwtClaims {
  sub:             string;
  tenantId:        string;
  organizationId:  string;
  membershipId:    string;
  businessUnitId?: string;
  warehouseIds:    string[];
  role:            PlatformRole;
  schemaVersion:   SchemaVersion;
}

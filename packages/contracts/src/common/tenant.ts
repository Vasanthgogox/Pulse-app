/** Tenant scope carried on every platform request. */

export interface TenantScope {
  tenantId:       string;
  organizationId: string;
  businessUnitId?: string;
  warehouseIds?:  string[];
}

import type { EntityMetadata, PulseSource, TenantContext } from '@/types/platform';

export function createEntityMetadata(params: {
  id:        string;
  status:    string;
  tenant:    TenantContext;
  source:    PulseSource;
  createdBy: string;
  version?:  number;
  createdAt?: string;
  updatedAt?: string;
}): EntityMetadata {
  const now = new Date().toISOString();
  return {
    id:             params.id,
    version:        params.version ?? 1,
    status:         params.status,
    createdAt:      params.createdAt ?? now,
    updatedAt:      params.updatedAt ?? now,
    createdBy:      params.createdBy,
    tenantId:       params.tenant.tenantId,
    organizationId: params.tenant.organizationId,
    businessUnitId: params.tenant.businessUnitId,
    source:         params.source,
  };
}

export function bumpEntityVersion(meta: EntityMetadata, status: string): EntityMetadata {
  return {
    ...meta,
    version:   meta.version + 1,
    status,
    updatedAt: new Date().toISOString(),
  };
}

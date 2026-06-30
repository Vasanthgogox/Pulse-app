import type { OrganizationDto, TenantDto } from '@pulse/contracts';
import type { IdentitySupabase } from '../db/client';
import { nextCanonicalCode, platformSchema } from '../db/client';
import { MembershipRepository } from './membership.repository';
import { UserRepository } from './user.repository';

interface OrganizationRow {
  id:         string;
  code:       string;
  tenant_id:  string;
  name:       string;
  legal_name: string | null;
  created_at: string;
}

interface TenantRow {
  id:         string;
  code:       string;
  name:       string;
  created_at: string;
}

function mapOrg(row: OrganizationRow, tenantCode: string): OrganizationDto {
  return {
    id:        row.code,
    name:      row.name,
    legalName: row.legal_name ?? undefined,
    tenantId:  tenantCode,
    createdAt: row.created_at,
  };
}

export class OrganizationRepository {
  constructor(private readonly db: IdentitySupabase) {}

  async createOrganization(params: {
    name:        string;
    legalName?:  string;
    authUserId:  string;
    email:       string;
    displayName?: string;
  }): Promise<{ organization: OrganizationDto; tenant: TenantDto }> {
    const tenantCode = await nextCanonicalCode(this.db, 'TENANT');
    const orgCode    = await nextCanonicalCode(this.db, 'ORG');
    const schema     = platformSchema(this.db);

    const { data: tenantRow, error: tenantErr } = await schema
      .from('tenants')
      .insert({ code: tenantCode, name: params.name })
      .select('id, code, name, created_at')
      .single<TenantRow>();
    if (tenantErr) throw tenantErr;

    const { data: orgRow, error: orgErr } = await schema
      .from('organizations')
      .insert({
        code:       orgCode,
        tenant_id:  tenantRow.id,
        name:       params.name,
        legal_name: params.legalName ?? null,
      })
      .select('id, code, tenant_id, name, legal_name, created_at')
      .single<OrganizationRow>();
    if (orgErr) throw orgErr;

    const userRepo = new UserRepository(this.db);
    const membershipRepo = new MembershipRepository(this.db);

    const user = await userRepo.ensureUser({
      authUserId:  params.authUserId,
      email:       params.email,
      displayName: params.displayName,
    });

    const adminRoleId = await membershipRepo.getRoleIdByCode('admin');
    await membershipRepo.createMembership({
      userId:         user.internalId,
      organizationId: orgRow.id,
      roleId:         adminRoleId,
    });

    return {
      tenant: {
        id:        tenantRow.code,
        name:      tenantRow.name,
        createdAt: tenantRow.created_at,
      },
      organization: mapOrg(orgRow, tenantRow.code),
    };
  }

  async findByCode(code: string): Promise<{ row: OrganizationRow; tenantCode: string } | null> {
    const schema = platformSchema(this.db);
    const { data: org, error } = await schema
      .from('organizations')
      .select('id, code, tenant_id, name, legal_name, created_at')
      .eq('code', code)
      .is('deleted_at', null)
      .maybeSingle<OrganizationRow>();
    if (error) throw error;
    if (!org) return null;

    const { data: tenant, error: tErr } = await schema
      .from('tenants')
      .select('code')
      .eq('id', org.tenant_id)
      .single<{ code: string }>();
    if (tErr) throw tErr;

    return { row: org, tenantCode: tenant.code };
  }

  async findCodeByInternalId(internalId: string): Promise<string | null> {
    const { data, error } = await platformSchema(this.db)
      .from('organizations')
      .select('code')
      .eq('id', internalId)
      .is('deleted_at', null)
      .maybeSingle<{ code: string }>();
    if (error) throw error;
    return data?.code ?? null;
  }

  async softDeleteByCode(code: string): Promise<void> {
    const { error } = await platformSchema(this.db)
      .from('organizations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('code', code)
      .is('deleted_at', null);
    if (error) throw error;
  }

  async createBusinessUnit(params: {
    organizationCode: string;
    name:             string;
    unitCode:         string;
  }): Promise<import('@pulse/contracts').BusinessUnitDto> {
    const org = await this.findByCode(params.organizationCode);
    if (!org) throw new Error('Organization not found');

    const code = await nextCanonicalCode(this.db, 'BU');
    const { data, error } = await platformSchema(this.db)
      .from('business_units')
      .insert({
        code:            code,
        organization_id: org.row.id,
        name:            params.name,
        unit_code:       params.unitCode,
      })
      .select('code, name, unit_code')
      .single<{ code: string; name: string; unit_code: string }>();
    if (error) throw error;

    return {
      id:             data.code,
      organizationId: params.organizationCode,
      name:           data.name,
      code:           data.unit_code,
    };
  }
}

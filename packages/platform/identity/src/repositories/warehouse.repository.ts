import type { WarehouseDto } from '@pulse/contracts';
import type { IdentitySupabase } from '../db/client';
import { nextCanonicalCode, platformSchema } from '../db/client';
import { OrganizationRepository } from './organization.repository';

export class WarehouseRepository {
  constructor(
    private readonly db: IdentitySupabase,
    private readonly orgRepo = new OrganizationRepository(db),
  ) {}

  async createWarehouse(params: {
    organizationCode: string;
    businessUnitCode?: string;
    name:             string;
    whCode:           string;
    address?:         Record<string, unknown>;
  }): Promise<WarehouseDto> {
    const org = await this.orgRepo.findByCode(params.organizationCode);
    if (!org) throw new Error('Organization not found');

    let businessUnitId: string | null = null;
    if (params.businessUnitCode) {
      const { data: bu } = await platformSchema(this.db)
        .from('business_units')
        .select('id')
        .eq('organization_id', org.row.id)
        .eq('unit_code', params.businessUnitCode)
        .is('deleted_at', null)
        .maybeSingle<{ id: string }>();
      businessUnitId = bu?.id ?? null;
    }

    const code = await nextCanonicalCode(this.db, 'WH');
    const { data, error } = await platformSchema(this.db)
      .from('warehouses')
      .insert({
        code:             code,
        organization_id:  org.row.id,
        business_unit_id: businessUnitId,
        name:             params.name,
        wh_code:          params.whCode,
        address:          params.address ?? {},
      })
      .select('code, organization_id, business_unit_id, name, wh_code, address')
      .single<{
        code: string;
        name: string;
        wh_code: string;
        business_unit_id: string | null;
        address: Record<string, unknown>;
      }>();
    if (error) throw error;

    let businessUnitIdOut: string | undefined;
    if (data.business_unit_id) {
      const { data: bu } = await platformSchema(this.db)
        .from('business_units')
        .select('code')
        .eq('id', data.business_unit_id)
        .single<{ code: string }>();
      businessUnitIdOut = bu?.code;
    }

    return {
      id:             data.code,
      organizationId: params.organizationCode,
      businessUnitId: businessUnitIdOut,
      name:           data.name,
      code:           data.wh_code,
      address:        data.address as WarehouseDto['address'],
    };
  }

  async listByOrganization(organizationInternalId: string): Promise<WarehouseDto[]> {
    const { data, error } = await platformSchema(this.db)
      .from('warehouses')
      .select('code, name, wh_code, business_unit_id, address')
      .eq('organization_id', organizationInternalId)
      .is('deleted_at', null);
    if (error) throw error;

    const { data: orgRow } = await platformSchema(this.db)
      .from('organizations')
      .select('code')
      .eq('id', organizationInternalId)
      .single<{ code: string }>();

    return Promise.all((data ?? []).map(async row => {
      let buCode: string | undefined;
      if (row.business_unit_id) {
        const { data: bu } = await platformSchema(this.db)
          .from('business_units')
          .select('code')
          .eq('id', row.business_unit_id)
          .single<{ code: string }>();
        buCode = bu?.code;
      }
      return {
        id:             row.code,
        organizationId: orgRow?.code ?? '',
        businessUnitId: buCode,
        name:           row.name,
        code:           row.wh_code,
        address:        row.address as WarehouseDto['address'],
      };
    }));
  }
}
